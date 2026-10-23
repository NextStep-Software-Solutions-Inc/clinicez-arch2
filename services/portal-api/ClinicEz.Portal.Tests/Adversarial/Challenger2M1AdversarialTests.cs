using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Admin.Consumers;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Facility;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Licensing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace ClinicEz.Portal.Tests.Adversarial;

/// <summary>
/// Milestone 1 Challenger 2 Empirical Adversarial Stress Test Suite:
/// Probes backward compatibility of shared contracts, FacilityHeartbeatHandler resilience,
/// spoofing defenses, unknown ID handling, and strips verification on dual outbox directory updates.
/// </summary>
public class Challenger2M1AdversarialTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly TestClock _clock = new(new DateTimeOffset(2026, 10, 23, 12, 0, 0, TimeSpan.Zero));
    private readonly Tenant _tenant;
    private readonly Facility _facility;

    public Challenger2M1AdversarialTests()
    {
        _tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            TenantSlug = "challenger-corp",
            Name = "Challenger Health Group",
            OwnerId = "owner-challenger",
            Email = "admin@challenger.test"
        };
        _facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenant.Id,
            Tenant = _tenant,
            Name = "Challenger Main Clinic",
            Slug = "challenger-main",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            IsPatientDiscoveryEligible = false
        };

        _context.Tenants.Add(_tenant);
        _context.Facilities.Add(_facility);
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private Task BeatAsync(
        Party from,
        string? version = "1.4.2",
        bool? isWorkspaceEligible = null,
        DateTime? clock = null)
    {
        var publisher = TestSupport.ProvisioningPublisher(_context);
        var payload = new FacilityHeartbeatPayload
        {
            AppVersion = version ?? string.Empty,
            LicenseExpiresAt = null,
            ClockUtc = clock ?? _clock.GetUtcNow().UtcDateTime,
            IsWorkspaceEligible = isWorkspaceEligible
        };
        var envelope = InteropEnvelope.Create(InteropTypes.FacilityHeartbeat, from, Party.Portal, Guid.NewGuid(), payload);
        return new FacilityHeartbeatHandler(_context, _clock, publisher, NullLogger<FacilityHeartbeatHandler>.Instance)
            .HandleAsync(payload, new InteropMessageContext(envelope), CancellationToken.None);
    }

    private Party Self(string? service = null) =>
        Party.ForFacility(_tenant.Id.ToString(), _facility.Id.ToString(), FacilityType.Clinic, service);

    // =========================================================================
    // 1. BACKWARD COMPATIBILITY: FacilityRegistryEntry & FacilityHeartbeatPayload
    // =========================================================================

    [Fact]
    public void FacilityRegistryEntry_FourParameterConstructor_DefaultsIsWorkspaceEligibleToNull()
    {
        var tenantId = Guid.NewGuid().ToString();
        var facilityId = Guid.NewGuid();
        var expiry = DateTime.UtcNow.AddYears(1);

        // Pre-existing 4-parameter constructor call pattern used across existing services
        var entry = new FacilityRegistryEntry(tenantId, facilityId, FacilityType.Laboratory, expiry);

        Assert.Equal(tenantId, entry.TenantId);
        Assert.Equal(facilityId, entry.FacilityId);
        Assert.Equal(FacilityType.Laboratory, entry.FacilityType);
        Assert.Equal(expiry, entry.LicenseExpiresAt);
        Assert.Null(entry.IsWorkspaceEligible);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(true)]
    [InlineData(false)]
    public void FacilityRegistryEntry_FiveParameterConstructor_PreservesExplicitValue(bool? explicitEligibility)
    {
        var tenantId = Guid.NewGuid().ToString();
        var facilityId = Guid.NewGuid();

        var entry = new FacilityRegistryEntry(tenantId, facilityId, FacilityType.Clinic, null, explicitEligibility);

        Assert.Equal(explicitEligibility, entry.IsWorkspaceEligible);
    }

    [Fact]
    public void FacilityHeartbeatPayload_JsonSerialization_OmitsNullEligibilityByDefault()
    {
        var payload = new FacilityHeartbeatPayload
        {
            AppVersion = "2.1.0",
            LicenseExpiresAt = null,
            IsWorkspaceEligible = null
        };

        var json = JsonSerializer.Serialize(payload, InteropJson.Options);

        Assert.DoesNotContain("isWorkspaceEligible", json);
    }

    [Theory]
    [InlineData("{\"appVersion\": \"1.0.0\"}", null)]
    [InlineData("{\"appVersion\": \"1.0.0\", \"isWorkspaceEligible\": null}", null)]
    [InlineData("{\"appVersion\": \"1.0.0\", \"isWorkspaceEligible\": true}", true)]
    [InlineData("{\"appVersion\": \"1.0.0\", \"isWorkspaceEligible\": false}", false)]
    public void FacilityHeartbeatPayload_JsonDeserialization_HandlesMissingOrExplicitEligibility(
        string rawJson,
        bool? expectedEligibility)
    {
        var deserialized = JsonSerializer.Deserialize<FacilityHeartbeatPayload>(rawJson, InteropJson.Options);

        Assert.NotNull(deserialized);
        Assert.Equal("1.0.0", deserialized.AppVersion);
        Assert.Equal(expectedEligibility, deserialized.IsWorkspaceEligible);
    }

    // =========================================================================
    // 2. PROBE: FacilityHeartbeatHandler Edge Cases & Resilience
    // =========================================================================

    [Fact]
    public async Task HeartbeatHandler_SenderSpoofing_NonFacilitySendersNeverMutateOrStageUpdates()
    {
        var nonFacilitySenders = new[]
        {
            Party.Portal,
            Party.ForPatient(Guid.NewGuid().ToString()),
            new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Laboratory },
            new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient },
            new Party { Kind = (PartyKind)99, TenantId = _tenant.Id.ToString(), FacilityId = _facility.Id.ToString() }
        };

        foreach (var rogueSender in nonFacilitySenders)
        {
            await BeatAsync(rogueSender, "1.4.2", isWorkspaceEligible: true);
        }

        var stored = await _context.Facilities.AsNoTracking().SingleAsync(f => f.Id == _facility.Id);
        Assert.Null(stored.LastSeenAt);
        Assert.Null(stored.AppVersion);

        var outbox = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        Assert.Empty(outbox);
    }

    [Theory]
    [InlineData("not-a-guid", "3c8cca56-0e4f-4494-aef0-18f89c736346")]
    [InlineData("6db50468-e107-4007-b187-5a8d8a0bc525", "invalid-facility-guid")]
    [InlineData("", "")]
    [InlineData("   ", "   ")]
    public async Task HeartbeatHandler_MalformedSenderAddress_DoesNotCrashPoller(string tenantPart, string facilityPart)
    {
        var malformedParty = new Party
        {
            Kind = PartyKind.Facility,
            TenantId = tenantPart,
            FacilityId = facilityPart,
            FacilityType = FacilityType.Clinic
        };

        // Must complete safely without throwing unhandled exception
        await BeatAsync(malformedParty, "1.4.2", isWorkspaceEligible: true);

        var stored = await _context.Facilities.AsNoTracking().SingleAsync(f => f.Id == _facility.Id);
        Assert.Null(stored.LastSeenAt);

        var outbox = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        Assert.Empty(outbox);
    }

    [Fact]
    public async Task HeartbeatHandler_UnknownFacilityId_DoesNotCrashPoller()
    {
        var unknownFacilityParty = Party.ForFacility(_tenant.Id.ToString(), Guid.NewGuid().ToString(), FacilityType.Clinic);

        await BeatAsync(unknownFacilityParty, "1.4.2", isWorkspaceEligible: true);

        var stored = await _context.Facilities.AsNoTracking().SingleAsync(f => f.Id == _facility.Id);
        Assert.Null(stored.LastSeenAt);

        var outbox = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        Assert.Empty(outbox);
    }

    [Fact]
    public async Task HeartbeatHandler_UnknownTenantId_CrossTenantSpoof_DoesNotCrashPoller()
    {
        // Attacker provides real facility ID but a different tenant ID
        var crossTenantSpoofParty = Party.ForFacility(Guid.NewGuid().ToString(), _facility.Id.ToString(), FacilityType.Clinic);

        await BeatAsync(crossTenantSpoofParty, "1.4.2", isWorkspaceEligible: true);

        var stored = await _context.Facilities.AsNoTracking().SingleAsync(f => f.Id == _facility.Id);
        Assert.Null(stored.LastSeenAt);

        var outbox = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        Assert.Empty(outbox);
    }

    [Theory]
    [InlineData(false, false, false)] // in-sync false: 0 updates
    [InlineData(true, true, false)]   // in-sync true: 0 updates
    [InlineData(false, null, false)]  // portal false, heartbeat null: 0 updates
    [InlineData(true, null, true)]    // portal true, heartbeat null: triggers self-healing
    [InlineData(true, false, true)]   // portal true, heartbeat false: triggers self-healing
    [InlineData(false, true, true)]   // portal false, heartbeat true: triggers self-healing
    public async Task HeartbeatHandler_ConvergenceMatrix_ProducesExpectedSelfHealingBehavior(
        bool portalEligible,
        bool? heartbeatReported,
        bool expectSelfHealing)
    {
        _facility.IsPatientDiscoveryEligible = portalEligible;
        await _context.SaveChangesAsync();

        await BeatAsync(Self(), "1.4.2", isWorkspaceEligible: heartbeatReported);

        var outbox = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        if (expectSelfHealing)
        {
            Assert.Equal(2, outbox.Count);
            Assert.All(outbox, msg =>
            {
                var p = msg.GetPayload<FacilityCreatedEvent>();
                Assert.Equal(portalEligible, p.IsWorkspaceEligible);
            });
        }
        else
        {
            Assert.Empty(outbox);
        }
    }

    // =========================================================================
    // 3. STRIPPED PROPERTIES: LicenseToken and Limits Must Be Null on Directory Updates
    // =========================================================================

    [Fact]
    public async Task StageProvisionedAsync_BothDirectoryRecipientsHaveNullLicenseTokenAndNullLimits()
    {
        var publisher = TestSupport.ProvisioningPublisher(_context);
        var facilityCreated = new FacilityCreatedEvent
        {
            TenantId = _tenant.Id.ToString(),
            TenantSlug = _tenant.TenantSlug,
            FacilityType = FacilityType.Clinic,
            ResourceId = _facility.Id,
            Name = _facility.Name,
            Slug = _facility.Slug,
            LicenseToken = "SUPER_SECRET_ECDSA_LICENSE_KEY_NEVER_LEAK",
            Limits = new FacilityLimits
            {
                MaxStaff = 42,
                MaxStorageMb = 4096,
                ConcurrentTerminals = 5,
                MaxBeds = 10,
                MaxAnalyzers = 2,
                MaxMonthlyConsultations = 1000
            },
            IsWorkspaceEligible = true
        };

        await publisher.StageProvisionedAsync(_tenant, facilityCreated, CancellationToken.None);
        await _context.SaveChangesAsync();

        var directoryMessages = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        Assert.Equal(2, directoryMessages.Count);

        // Verify patient-api recipient
        var patientMsg = directoryMessages.Single(m => m.To.Kind == PartyKind.ControlPlane && m.To.Service == InteropServices.Patient);
        var patientPayload = patientMsg.GetPayload<FacilityCreatedEvent>();
        Assert.Null(patientPayload.LicenseToken);
        Assert.Null(patientPayload.Limits);
        Assert.Equal(_facility.IsPatientDiscoveryEligible, patientPayload.IsWorkspaceEligible);

        // Verify facility recipient
        var facilityMsg = directoryMessages.Single(m => m.To.Kind == PartyKind.Facility && m.To.FacilityId == _facility.Id.ToString());
        var facilityPayload = facilityMsg.GetPayload<FacilityCreatedEvent>();
        Assert.Null(facilityPayload.LicenseToken);
        Assert.Null(facilityPayload.Limits);
        Assert.Equal(_facility.IsPatientDiscoveryEligible, facilityPayload.IsWorkspaceEligible);

        // Contrast with license message which MUST carry the license
        var licenseMessages = TestSupport.Outbox(_context, InteropTypes.FacilityLicenseIssued);
        Assert.Equal(2, licenseMessages.Count);
        Assert.All(licenseMessages, msg =>
        {
            var p = msg.GetPayload<FacilityCreatedEvent>();
            Assert.Equal("SUPER_SECRET_ECDSA_LICENSE_KEY_NEVER_LEAK", p.LicenseToken);
            Assert.NotNull(p.Limits);
            Assert.Equal(42, p.Limits.MaxStaff);
        });
    }

    [Fact]
    public async Task StageDirectoryUpdateAsync_BothDirectoryRecipientsHaveNullLicenseTokenAndNullLimits()
    {
        var publisher = TestSupport.ProvisioningPublisher(_context);
        _facility.IsPatientDiscoveryEligible = true;
        await _context.SaveChangesAsync();

        await publisher.StageDirectoryUpdateAsync(_tenant, _facility, CancellationToken.None);
        await _context.SaveChangesAsync();

        var directoryMessages = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        Assert.Equal(2, directoryMessages.Count);

        var patientMsg = directoryMessages.Single(m => m.To.Kind == PartyKind.ControlPlane && m.To.Service == InteropServices.Patient);
        var patientPayload = patientMsg.GetPayload<FacilityCreatedEvent>();
        Assert.Null(patientPayload.LicenseToken);
        Assert.Null(patientPayload.Limits);
        Assert.True(patientPayload.IsWorkspaceEligible);
        Assert.True(patientPayload.IsPublic);

        var facilityMsg = directoryMessages.Single(m => m.To.Kind == PartyKind.Facility && m.To.FacilityId == _facility.Id.ToString());
        var facilityPayload = facilityMsg.GetPayload<FacilityCreatedEvent>();
        Assert.Null(facilityPayload.LicenseToken);
        Assert.Null(facilityPayload.Limits);
        Assert.True(facilityPayload.IsWorkspaceEligible);
        Assert.True(facilityPayload.IsPublic);
    }

    [Fact]
    public async Task CreateFacilityCommand_EndToEndOutbox_DirectoryUpdatesToBothRecipientsNeverLeakLicense()
    {
        var mockGuard = new Mock<IEntitlementGuard>();
        var handler = TestSupport.CreateFacilityHandler(_context, mockGuard.Object);

        var command = new CreateFacilityCommand(
            _tenant.Id.ToString(),
            FacilityType.Clinic,
            "Adversarial Verification Clinic",
            Slug: "adv-verify-clinic");

        var result = await handler.Handle(command, CancellationToken.None);
        Assert.True(result.Success);

        var createdFacility = await _context.Facilities.SingleAsync(f => f.Slug == "adv-verify-clinic");

        var directoryMessages = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated)
            .Where(m => m.CorrelationId == createdFacility.Id)
            .ToList();

        Assert.Equal(2, directoryMessages.Count);

        // Patient ControlPlane recipient
        var patientMsg = directoryMessages.Single(m => m.To.Kind == PartyKind.ControlPlane && m.To.Service == InteropServices.Patient);
        var patientPayload = patientMsg.GetPayload<FacilityCreatedEvent>();
        Assert.Null(patientPayload.LicenseToken);
        Assert.Null(patientPayload.Limits);
        Assert.Equal("Adversarial Verification Clinic", patientPayload.Name);

        // Target Facility recipient
        var facilityMsg = directoryMessages.Single(m => m.To.Kind == PartyKind.Facility && m.To.FacilityId == createdFacility.Id.ToString());
        var facilityPayload = facilityMsg.GetPayload<FacilityCreatedEvent>();
        Assert.Null(facilityPayload.LicenseToken);
        Assert.Null(facilityPayload.Limits);
        Assert.Equal("Adversarial Verification Clinic", facilityPayload.Name);
    }
}
