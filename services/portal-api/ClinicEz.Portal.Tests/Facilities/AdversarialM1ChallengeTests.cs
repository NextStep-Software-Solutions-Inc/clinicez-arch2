using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.Commands;
using ClinicEz.Portal.Application.Features.Admin.Consumers;
using ClinicEz.Portal.Application.Features.Admin.Services;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ClinicEz.Portal.Tests.Facilities;

/// <summary>
/// Adversarial stress test harness for Milestone 1 (Shared Contracts & Portal Eligibility Sync - Issue #72).
/// Authored by Challenger 1 to stress-test dual outbox dispatch, edge cases, and heartbeat drift convergence.
/// </summary>
public class AdversarialM1ChallengeTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly TestClock _clock = new(new DateTimeOffset(2026, 10, 23, 8, 0, 0, TimeSpan.Zero));
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly Guid _facilityId = Guid.NewGuid();
    private readonly Tenant _tenant;
    private readonly Facility _facility;

    public AdversarialM1ChallengeTests()
    {
        _tenant = new Tenant
        {
            Id = _tenantId,
            TenantSlug = "adv-health",
            Name = "Adversarial Health Corp",
            OwnerId = "owner_adv",
            Email = "admin@advhealth.test"
        };

        _facility = new Facility
        {
            Id = _facilityId,
            TenantId = _tenantId,
            Name = "Adversarial Clinic Central",
            Slug = "adv-clinic-central",
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

    private Task BeatAsync(Party from, string version = "2.0.0", bool? isWorkspaceEligible = null)
    {
        var publisher = TestSupport.ProvisioningPublisher(_context);
        var payload = new FacilityHeartbeatPayload
        {
            AppVersion = version,
            IsWorkspaceEligible = isWorkspaceEligible
        };

        return new FacilityHeartbeatHandler(_context, _clock, publisher, NullLogger<FacilityHeartbeatHandler>.Instance)
            .HandleAsync(
                payload,
                new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityHeartbeat, from, Party.Portal, Guid.NewGuid(), payload)),
                CancellationToken.None);
    }

    private Party Self(string? service = null) =>
        Party.ForFacility(_tenant.Id.ToString(), _facility.Id.ToString(), FacilityType.Clinic, service);

    [Fact]
    public async Task DualOutbox_FacilityWithEmptyOrNullSlugInEvent_DispatchesSuccessfullyToBothRecipients()
    {
        var emptySlugFacility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            Name = "Empty Slug Facility",
            Slug = string.Empty,
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active,
            IsPatientDiscoveryEligible = true
        };
        _context.Facilities.Add(emptySlugFacility);
        await _context.SaveChangesAsync();

        var publisher = TestSupport.ProvisioningPublisher(_context);
        await publisher.StageDirectoryUpdateAsync(_tenant, emptySlugFacility, CancellationToken.None);
        await _context.SaveChangesAsync();

        var outboxMessages = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated)
            .Where(m => m.CorrelationId == emptySlugFacility.Id)
            .ToList();

        Assert.Equal(2, outboxMessages.Count);

        var patientMsg = outboxMessages.Single(m => m.To.Kind == PartyKind.ControlPlane && m.To.Service == InteropServices.Patient);
        var patientPayload = patientMsg.GetPayload<FacilityCreatedEvent>();
        Assert.Equal(string.Empty, patientPayload.Slug);
        Assert.True(patientPayload.IsWorkspaceEligible);
        Assert.True(patientPayload.IsPublic);

        var facilityMsg = outboxMessages.Single(m => m.To.Kind == PartyKind.Facility && m.To.FacilityId == emptySlugFacility.Id.ToString());
        var facilityPayload = facilityMsg.GetPayload<FacilityCreatedEvent>();
        Assert.Equal(string.Empty, facilityPayload.Slug);
        Assert.True(facilityPayload.IsWorkspaceEligible);
        Assert.True(facilityPayload.IsPublic);
    }

    [Fact]
    public async Task DualOutbox_MultiCycleToggle_MaintainsStrictSynchronization()
    {
        var publisher = TestSupport.ProvisioningPublisher(_context);
        var handler = new SetFacilityDiscoveryEligibilityCommandHandler(_context, publisher);

        // Cycle 1: Enable (false -> true)
        var res1 = await handler.Handle(new SetFacilityDiscoveryEligibilityCommand(_facilityId, _tenant.TenantSlug!, true), CancellationToken.None);
        Assert.True(res1.IsEligible);

        var msgs1 = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        Assert.Equal(2, msgs1.Count);
        Assert.All(msgs1, m => Assert.True(m.GetPayload<FacilityCreatedEvent>().IsWorkspaceEligible));
        Assert.All(msgs1, m => Assert.True(m.GetPayload<FacilityCreatedEvent>().IsPublic));

        // Cycle 2: Disable (true -> false)
        var res2 = await handler.Handle(new SetFacilityDiscoveryEligibilityCommand(_facilityId, _tenant.TenantSlug!, false), CancellationToken.None);
        Assert.False(res2.IsEligible);

        var msgs2 = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        Assert.Equal(4, msgs2.Count); // 2 from cycle 1 + 2 from cycle 2
        var latestMsgs2 = msgs2.Skip(2).ToList();
        Assert.All(latestMsgs2, m => Assert.False(m.GetPayload<FacilityCreatedEvent>().IsWorkspaceEligible));
        Assert.All(latestMsgs2, m => Assert.False(m.GetPayload<FacilityCreatedEvent>().IsPublic));

        // Cycle 3: Re-enable (false -> true)
        var res3 = await handler.Handle(new SetFacilityDiscoveryEligibilityCommand(_facilityId, _tenant.TenantSlug!, true), CancellationToken.None);
        Assert.True(res3.IsEligible);

        var msgs3 = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        Assert.Equal(6, msgs3.Count);
        var latestMsgs3 = msgs3.Skip(4).ToList();
        Assert.All(latestMsgs3, m => Assert.True(m.GetPayload<FacilityCreatedEvent>().IsWorkspaceEligible));
        Assert.All(latestMsgs3, m => Assert.True(m.GetPayload<FacilityCreatedEvent>().IsPublic));
    }

    [Fact]
    public async Task DualOutbox_FacilityWithSuspendedStatus_KeepsIsWorkspaceEligibleTrue_ButIsPublicFalse()
    {
        _facility.IsPatientDiscoveryEligible = true;
        _facility.Status = FacilityStatus.Suspended;
        await _context.SaveChangesAsync();

        var publisher = TestSupport.ProvisioningPublisher(_context);
        await publisher.StageDirectoryUpdateAsync(_tenant, _facility, CancellationToken.None);
        await _context.SaveChangesAsync();

        var outboxMessages = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        Assert.Equal(2, outboxMessages.Count);

        foreach (var msg in outboxMessages)
        {
            var payload = msg.GetPayload<FacilityCreatedEvent>();
            Assert.True(payload.IsWorkspaceEligible, "Workspace eligibility should still be granted at tenant/portal level");
            Assert.False(payload.IsPublic, "IsPublic must be false when facility is Suspended");
        }
    }

    [Fact]
    public async Task HeartbeatConvergence_DriftFromFalseToTrue_DispatchesExactlyOneSelfHealingUpdate()
    {
        // Portal authoritative state is false, but clinic falsely reports true
        _facility.IsPatientDiscoveryEligible = false;
        await _context.SaveChangesAsync();

        await BeatAsync(Self(), "2.0.0", isWorkspaceEligible: true);

        var outboxMessages = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        Assert.Equal(2, outboxMessages.Count);

        foreach (var msg in outboxMessages)
        {
            var payload = msg.GetPayload<FacilityCreatedEvent>();
            Assert.False(payload.IsWorkspaceEligible);
            Assert.False(payload.IsPublic);
        }
    }

    [Fact]
    public async Task HeartbeatConvergence_PreExistingFacilityWithNullEligibility_DispatchesSelfHealingOnlyWhenPortalEligible()
    {
        // Sub-case 1: Portal is eligible (true), pre-existing facility heartbeat has null
        _facility.IsPatientDiscoveryEligible = true;
        await _context.SaveChangesAsync();

        await BeatAsync(Self(), "1.0.0", isWorkspaceEligible: null);

        var outboxMessages = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        Assert.Equal(2, outboxMessages.Count);
        Assert.All(outboxMessages, m => Assert.True(m.GetPayload<FacilityCreatedEvent>().IsWorkspaceEligible));

        // Sub-case 2: Portal is NOT eligible (false), pre-existing facility heartbeat has null
        var context2 = TestSupport.NewContext();
        var tenant2 = new Tenant { Id = Guid.NewGuid(), TenantSlug = "t2", Name = "T2", OwnerId = "o2" };
        var facility2 = new Facility { Id = Guid.NewGuid(), TenantId = tenant2.Id, Name = "F2", FacilityType = FacilityType.Clinic, IsPatientDiscoveryEligible = false };
        context2.Tenants.Add(tenant2);
        context2.Facilities.Add(facility2);
        await context2.SaveChangesAsync();

        var publisher2 = TestSupport.ProvisioningPublisher(context2);
        var handler2 = new FacilityHeartbeatHandler(context2, _clock, publisher2, NullLogger<FacilityHeartbeatHandler>.Instance);
        var payload2 = new FacilityHeartbeatPayload { AppVersion = "1.0.0", IsWorkspaceEligible = null };
        var party2 = Party.ForFacility(tenant2.Id.ToString(), facility2.Id.ToString(), FacilityType.Clinic);

        await handler2.HandleAsync(
            payload2,
            new InteropMessageContext(InteropEnvelope.Create(InteropTypes.FacilityHeartbeat, party2, Party.Portal, Guid.NewGuid(), payload2)),
            CancellationToken.None);

        var outboxMessages2 = TestSupport.Outbox(context2, InteropTypes.FacilityDirectoryUpdated);
        Assert.Empty(outboxMessages2); // Zero redundant messages!
    }

    [Fact]
    public async Task HeartbeatConvergence_RepeatedInSyncHeartbeats_ProduceZeroRedundantUpdates()
    {
        _facility.IsPatientDiscoveryEligible = true;
        await _context.SaveChangesAsync();

        // 1. Initial drift
        await BeatAsync(Self(), "2.0.0", isWorkspaceEligible: false);
        var initialOutbox = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        Assert.Equal(2, initialOutbox.Count);

        // 2. Clear outbox (simulate delivery)
        _context.InteropOutbox.RemoveRange(_context.InteropOutbox);
        await _context.SaveChangesAsync();
        Assert.Empty(TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated));

        // 3. Repeated in-sync heartbeats (10 consecutive beats)
        for (int i = 0; i < 10; i++)
        {
            await BeatAsync(Self(), "2.0.0", isWorkspaceEligible: true);
        }

        var subsequentOutbox = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated);
        Assert.Empty(subsequentOutbox);
    }

    [Fact]
    public async Task HeartbeatConvergence_MissingTenant_DoesNotThrowAndSkipsUpdate()
    {
        // An orphaned facility with a tenant ID that does not exist in db
        var orphanedFacility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = Guid.NewGuid(),
            Name = "Orphaned",
            FacilityType = FacilityType.Clinic,
            IsPatientDiscoveryEligible = true
        };
        _context.Facilities.Add(orphanedFacility);
        await _context.SaveChangesAsync();

        var party = Party.ForFacility(orphanedFacility.TenantId.ToString(), orphanedFacility.Id.ToString(), FacilityType.Clinic);

        // Should not throw NullReferenceException
        var exception = await Record.ExceptionAsync(() => BeatAsync(party, "2.0.0", isWorkspaceEligible: false));
        Assert.Null(exception);

        // No outbox messages staged because tenant was missing
        var outbox = TestSupport.Outbox(_context, InteropTypes.FacilityDirectoryUpdated)
            .Where(m => m.CorrelationId == orphanedFacility.Id)
            .ToList();
        Assert.Empty(outbox);
    }
}
