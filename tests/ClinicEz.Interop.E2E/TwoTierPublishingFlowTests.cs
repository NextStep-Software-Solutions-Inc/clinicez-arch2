using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Clinics.Queries.SearchClinics;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Portal.Application.Features.Admin.Consumers;
using ClinicEz.Portal.Application.Features.Admin.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using PortalDbContext = ClinicEz.Portal.Infrastructure.Persistence.ApplicationDbContext;
using PortalFacility = ClinicEz.Portal.Domain.Entities.Facility;
using PortalTenant = ClinicEz.Portal.Domain.Entities.Tenant;
using FacilityStatus = ClinicEz.Portal.Domain.Entities.FacilityStatus;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// E2E Test Suite for Two-Tier Facility Publishing Governance Synchronization (Issue #72).
/// Verifies the 4-tier testing hierarchy:
/// - Tier 1: Feature Coverage (Portal eligibility grant/revoke, Clinic publish/unpublish, Patient IsPublic computation, Catalogue Search)
/// - Tier 2: Boundary & Corner Cases (Premature publish block, Unpublish autonomy, Re-enablement convergence, Heartbeat drift, Anti-spoofing)
/// - Tier 3: Cross-Feature Combinations (Multi-facility tenant isolation, In-sync heartbeat zero-duplicate outbox)
/// - Tier 4: Real-World Scenarios (Complete provisioning-to-discovery lifecycle with real-time revocation)
/// </summary>
public class TwoTierPublishingFlowTests
{
    private static readonly string TenantId = Guid.NewGuid().ToString();

    #region Helper Methods

    /// <summary>
    /// Seeds operational readiness data (operating hours, licensed doctor, clinic service)
    /// into ClinicHost so pre-flight checks pass for PublishClinicToDirectoryCommand.
    /// </summary>
    private static async Task SeedClinicReadinessAsync(TestCell cell, Fac clinic, bool isWorkspaceEligible = false)
    {
        await cell.Clinic.DbAsync(async db =>
        {
            var settings = await db.Settings.IgnoreQueryFilters().FirstOrDefaultAsync(s => s.ClinicId == clinic.Id);
            if (settings != null)
            {
                settings.OperatingHours = "Mon-Fri 8:00 AM - 5:00 PM";
                settings.LetterheadAddress = "123 Medical Plaza, Manila";
                settings.LetterheadContact = "0917-555-0199";
                settings.IsWorkspaceEligible = isWorkspaceEligible;
            }

            var doctor = new StaffMember
            {
                Id = Guid.NewGuid(),
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                FirstName = "Roberto",
                LastName = "Santos",
                Title = "Dr.",
                Role = StaffRole.Doctor,
                PrcLicenseNumber = "0088991",
                Specialty = "General Practice",
                IsActive = true
            };
            db.StaffMembers.Add(doctor);

            var service = new ServiceItem
            {
                Id = Guid.NewGuid(),
                TenantId = clinic.Tenant,
                ClinicId = clinic.Id,
                Code = "SRV-001",
                Name = "Routine Medical Consultation",
                Category = "Consultation",
                StandardPrice = 500.00m,
                IsActive = true
            };
            db.ServiceItems.Add(service);

            await db.SaveChangesAsync();
            return 0;
        });
    }

    /// <summary>
    /// Sends a signed facility.directory.updated message from Party.Portal to target recipients.
    /// </summary>
    private static async Task SendPortalDirectoryUpdateAsync(
        TestCell cell,
        Fac facility,
        bool isWorkspaceEligible,
        bool toPatient = true,
        bool toClinic = true)
    {
        var envelopes = new List<InteropEnvelope>();

        if (toPatient)
        {
            envelopes.Add(InteropEnvelope.Create(
                InteropTypes.FacilityDirectoryUpdated,
                Party.Portal,
                new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient },
                facility.Id,
                new FacilityCreatedEvent
                {
                    TenantId = facility.Tenant,
                    ResourceId = facility.Id,
                    FacilityType = FacilityType.Clinic,
                    Name = facility.Name,
                    Slug = facility.Name.ToLowerInvariant().Replace(' ', '-'),
                    IsWorkspaceEligible = isWorkspaceEligible
                }));
        }

        if (toClinic)
        {
            envelopes.Add(InteropEnvelope.Create(
                InteropTypes.FacilityDirectoryUpdated,
                Party.Portal,
                facility.Party,
                facility.Id,
                new FacilityCreatedEvent
                {
                    TenantId = facility.Tenant,
                    ResourceId = facility.Id,
                    FacilityType = FacilityType.Clinic,
                    Name = facility.Name,
                    Slug = facility.Name.ToLowerInvariant().Replace(' ', '-'),
                    IsWorkspaceEligible = isWorkspaceEligible
                }));
        }

        var results = await cell.Hub.NewSdk(InteropServices.Portal).SendAsync(envelopes, CancellationToken.None);
        results.Should().OnlyContain(r => r.Status == SendResult.Accepted);
    }

    /// <summary>
    /// Sends a signed facility.directory.updated message directly from Clinic to Patient-API.
    /// </summary>
    private static async Task SendClinicDirectoryUpdateAsync(
        TestCell cell,
        Fac facility,
        bool isDirectoryPublished)
    {
        var envelope = InteropEnvelope.Create(
            InteropTypes.FacilityDirectoryUpdated,
            facility.Party,
            new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient },
            facility.Id,
            new FacilityCreatedEvent
            {
                TenantId = facility.Tenant,
                ResourceId = facility.Id,
                FacilityType = FacilityType.Clinic,
                Name = facility.Name,
                Slug = facility.Name.ToLowerInvariant().Replace(' ', '-'),
                IsDirectoryPublished = isDirectoryPublished
            });

        var results = await cell.Hub.NewSdk(InteropServices.Clinic).SendAsync([envelope], CancellationToken.None);
        results.Should().ContainSingle().Which.Status.Should().Be(SendResult.Accepted);
    }

    /// <summary>
    /// Queries the patient-api database for the clinic entity.
    /// </summary>
    private static Task<ClinicEz.Patient.Domain.Entities.Clinic?> QueryPatientClinicAsync(TestCell cell, Guid clinicId) =>
        cell.Patient.DbAsync(db => db.Clinics.AsNoTracking().FirstOrDefaultAsync(c => c.Id == clinicId));

    /// <summary>
    /// Executes a search query against Patient-API mobile discovery endpoint.
    /// Passing null query avoids PostgreSQL-specific ILike in EF In-Memory evaluation while testing c.IsPublic filtering.
    /// </summary>
    private static Task<DiscoveryPagedDto<ClinicSummaryDto>> SearchPatientClinicsAsync(TestCell cell) =>
        cell.Patient.SendAsync(new SearchClinicsQuery(null, null, null, 0, 50));

    private sealed class CapturingPublisher : IInteropPublisher
    {
        public List<InteropEnvelope> Sent { get; } = [];

        public InteropEnvelope Enqueue<T>(string type, Party from, Party to, Guid correlationId, T payload, int schemaVersion = 1, TimeSpan? ttl = null)
        {
            var envelope = InteropEnvelope.Create(type, from, to, correlationId, payload, schemaVersion, ttl);
            Enqueue(envelope);
            return envelope;
        }

        public void Enqueue(InteropEnvelope envelope) => Sent.Add(envelope);
    }

    #endregion

    #region Tier 1: Feature Coverage (Core Requirements)

    [Fact]
    public async Task Tier1_PortalEnablesDiscovery_PatientReceivesIsWorkspaceEligibleTrue_PublicStateRemainsPrivateUntilClinicPublishes()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic(TenantId, "Discovery Metro Clinic"));

        // Step 1: Portal grants discovery eligibility
        await SendPortalDirectoryUpdateAsync(cell, clinic, isWorkspaceEligible: true, toPatient: true, toClinic: true);
        await cell.PumpAsync();

        // Verification: Patient DB reflects IsWorkspaceEligible = true, but IsPublic remains false
        var patientClinic = await QueryPatientClinicAsync(cell, clinic.Id);
        patientClinic.Should().NotBeNull();
        patientClinic!.IsWorkspaceEligible.Should().BeTrue("Portal explicitly granted workspace discovery eligibility");
        patientClinic.IsDirectoryPublished.Should().BeFalse("Clinic has not yet published its profile to the directory");
        patientClinic.IsPublic.Should().BeFalse("Two-tier formula dictates IsPublic = IsWorkspaceEligible && IsDirectoryPublished (true && false => false)");
    }

    [Fact]
    public async Task Tier1_ClinicPublishes_PatientReceivesIsDirectoryPublishedTrue_PublicStateBecomesPublic()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic(TenantId, "Published Metro Clinic"));

        // Step 1: Portal grants workspace eligibility
        await SendPortalDirectoryUpdateAsync(cell, clinic, isWorkspaceEligible: true);
        await cell.PumpAsync();

        // Step 2: Clinic publishes to directory
        await SendClinicDirectoryUpdateAsync(cell, clinic, isDirectoryPublished: true);
        await cell.PumpAsync();

        // Verification: Patient DB reflects both true, and IsPublic computes to true
        var patientClinic = await QueryPatientClinicAsync(cell, clinic.Id);
        patientClinic.Should().NotBeNull();
        patientClinic!.IsWorkspaceEligible.Should().BeTrue();
        patientClinic.IsDirectoryPublished.Should().BeTrue();
        patientClinic.IsPublic.Should().BeTrue("Both tiers are satisfied (true && true => true)");
    }

    [Fact]
    public async Task Tier1_PortalRevokesDiscovery_ClinicReceivesIsWorkspaceEligibleFalse()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic(TenantId, "Revocation Clinic"));

        // First enable, then revoke from Portal to Clinic
        await SendPortalDirectoryUpdateAsync(cell, clinic, isWorkspaceEligible: true, toPatient: false, toClinic: true);
        await cell.PumpAsync();

        var grantedState = await cell.Clinic.DbAsync(async db =>
            (await db.Settings.IgnoreQueryFilters().SingleAsync(x => x.ClinicId == clinic.Id)).IsWorkspaceEligible);
        grantedState.Should().BeTrue();

        await SendPortalDirectoryUpdateAsync(cell, clinic, isWorkspaceEligible: false, toPatient: false, toClinic: true);
        await cell.PumpAsync();

        var isEligible = await cell.Clinic.DbAsync(async db =>
        {
            var s = await db.Settings.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.ClinicId == clinic.Id);
            return s != null && s.IsWorkspaceEligible;
        });
        isEligible.Should().BeFalse("Clinic settings must reflect revocation from Portal");
    }

    [Fact]
    public async Task Tier1_PortalRevokesDiscovery_PatientUpdatesIsWorkspaceEligibleFalse_AndIsPublicFalse()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic(TenantId, "Revoke Patient Clinic"));

        // Step 1: Establish published state
        await SendPortalDirectoryUpdateAsync(cell, clinic, isWorkspaceEligible: true);
        await SendClinicDirectoryUpdateAsync(cell, clinic, isDirectoryPublished: true);
        await cell.PumpAsync();

        var initial = await QueryPatientClinicAsync(cell, clinic.Id);
        initial!.IsPublic.Should().BeTrue();

        // Step 2: Portal revokes workspace eligibility
        await SendPortalDirectoryUpdateAsync(cell, clinic, isWorkspaceEligible: false);
        await cell.PumpAsync();

        // Verification: Patient DB reflects IsWorkspaceEligible = false, and IsPublic immediately drops to false
        var updated = await QueryPatientClinicAsync(cell, clinic.Id);
        updated.Should().NotBeNull();
        updated!.IsWorkspaceEligible.Should().BeFalse("Portal revoked workspace eligibility");
        updated.IsDirectoryPublished.Should().BeTrue("Clinic's own published preference is preserved");
        updated.IsPublic.Should().BeFalse("Two-tier formula dictates IsPublic = false when workspace eligibility is revoked (false && true => false)");
    }

    [Fact]
    public async Task Tier1_PatientDirectorySearch_ReturnsClinicWhenPublic_HidesClinicWhenPrivate()
    {
        await using var cell = new TestCell();
        var clinicName = $"Searchable Clinic {Guid.NewGuid().ToString("N")[..6]}";
        var clinic = await cell.ProvisionAsync(Fac.Clinic(TenantId, clinicName));

        // State A: Portal granted, but not published by clinic -> Private
        await SendPortalDirectoryUpdateAsync(cell, clinic, isWorkspaceEligible: true);
        await cell.PumpAsync();

        var searchA = await SearchPatientClinicsAsync(cell);
        searchA.Items.Should().NotContain(c => c.Id == clinic.Id, "Unpublished clinic must be hidden from patient directory search");

        // State B: Clinic publishes -> Public
        await SendClinicDirectoryUpdateAsync(cell, clinic, isDirectoryPublished: true);
        await cell.PumpAsync();

        var searchB = await SearchPatientClinicsAsync(cell);
        searchB.Items.Should().Contain(c => c.Id == clinic.Id, "Clinic must appear in patient search when IsPublic = true");

        // State C: Portal revokes -> Private again
        await SendPortalDirectoryUpdateAsync(cell, clinic, isWorkspaceEligible: false);
        await cell.PumpAsync();

        var searchC = await SearchPatientClinicsAsync(cell);
        searchC.Items.Should().NotContain(c => c.Id == clinic.Id, "Revoked clinic must immediately disappear from search results");
    }

    #endregion

    #region Tier 2: Boundary & Corner Cases

    [Fact]
    public async Task Tier2_ClinicAttemptsPublish_WhenWorkspaceEligibleIsFalse_IsBlockedOrRejected()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic(TenantId, "Premature Publish Clinic"));

        // Seed basic operational readiness but keep IsWorkspaceEligible = false
        await SeedClinicReadinessAsync(cell, clinic, isWorkspaceEligible: false);

        var act = async () => await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*readiness*", "Publishing without workspace eligibility must be blocked");
    }

    [Fact]
    public async Task Tier2_ClinicUnpublishes_WhenWorkspaceEligibleIsTrue_IsAllowed_AndPatientIsPublicBecomesFalse()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic(TenantId, "Unpublish Clinic"));

        // Setup: Fully public clinic
        await SendPortalDirectoryUpdateAsync(cell, clinic, isWorkspaceEligible: true);
        await SendClinicDirectoryUpdateAsync(cell, clinic, isDirectoryPublished: true);
        await cell.PumpAsync();

        (await QueryPatientClinicAsync(cell, clinic.Id))!.IsPublic.Should().BeTrue();

        // Clinic decides to unpublish
        await SendClinicDirectoryUpdateAsync(cell, clinic, isDirectoryPublished: false);
        await cell.PumpAsync();

        // Verification: IsWorkspaceEligible stays true, IsDirectoryPublished is false, IsPublic is false
        var patientClinic = await QueryPatientClinicAsync(cell, clinic.Id);
        patientClinic!.IsWorkspaceEligible.Should().BeTrue("Portal workspace eligibility is preserved");
        patientClinic.IsDirectoryPublished.Should().BeFalse("Clinic unpublished from directory");
        patientClinic.IsPublic.Should().BeFalse("IsPublic is false because directory publishing was withdrawn (true && false => false)");
    }

    [Fact]
    public async Task Tier2_PortalReEnablesEligibility_ClinicReceivesUpdate_PatientBecomesDiscoverableOnceClinicRePublishes()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic(TenantId, "Re-enabled Clinic"));

        // 1. Initially revoked / ineligible
        await SendPortalDirectoryUpdateAsync(cell, clinic, isWorkspaceEligible: false);
        await SendClinicDirectoryUpdateAsync(cell, clinic, isDirectoryPublished: false);
        await cell.PumpAsync();

        (await QueryPatientClinicAsync(cell, clinic.Id))!.IsPublic.Should().BeFalse();

        // 2. Portal re-enables eligibility
        await SendPortalDirectoryUpdateAsync(cell, clinic, isWorkspaceEligible: true);
        await cell.PumpAsync();

        // Patient DB has eligible = true, but still not public until clinic publishes
        var midState = await QueryPatientClinicAsync(cell, clinic.Id);
        midState!.IsWorkspaceEligible.Should().BeTrue();
        midState.IsPublic.Should().BeFalse();

        // 3. Clinic re-publishes
        await SendClinicDirectoryUpdateAsync(cell, clinic, isDirectoryPublished: true);
        await cell.PumpAsync();

        // Verification: Now publicly discoverable
        var finalState = await QueryPatientClinicAsync(cell, clinic.Id);
        finalState!.IsPublic.Should().BeTrue();

        var search = await SearchPatientClinicsAsync(cell);
        search.Items.Should().Contain(c => c.Id == clinic.Id);
    }

    [Fact]
    public async Task Tier2_FacilityHeartbeat_WithMismatchedWorkspaceEligibility_TriggersPortalSelfHealingConvergence()
    {
        await using var cell = new TestCell();
        var tenantGuid = Guid.NewGuid();
        var clinic = await cell.ProvisionAsync(Fac.Clinic(tenantGuid.ToString(), "Drifted Heartbeat Clinic"));

        // Setup Portal in-memory context with authoritative state: IsPatientDiscoveryEligible = true
        await using var portalDb = new PortalDbContext(new DbContextOptionsBuilder<PortalDbContext>()
            .UseInMemoryDatabase($"e2e-portal-heartbeat-{Guid.NewGuid():N}").Options);

        var portalTenant = new PortalTenant { Id = tenantGuid, Name = "Heartbeat Workspace", TenantSlug = "heartbeat-ws" };
        var portalFacility = new PortalFacility
        {
            Id = clinic.Id,
            TenantId = tenantGuid,
            Name = clinic.Name,
            Slug = "heartbeat-clinic",
            FacilityType = FacilityType.Clinic,
            IsPatientDiscoveryEligible = true,
            Status = FacilityStatus.Active
        };
        portalDb.Tenants.Add(portalTenant);
        portalDb.Facilities.Add(portalFacility);
        await portalDb.SaveChangesAsync();

        // Send heartbeat from Clinic to Portal via Hub
        var heartbeatEnvelope = InteropEnvelope.Create(
            InteropTypes.FacilityHeartbeat,
            clinic.Party,
            Party.Portal,
            Guid.NewGuid(),
            new FacilityHeartbeatPayload
            {
                AppVersion = "2.0.0",
                ClockUtc = DateTime.UtcNow
            });

        var sendResults = await cell.Hub.NewSdk(InteropServices.Clinic).SendAsync([heartbeatEnvelope], CancellationToken.None);
        sendResults.Should().ContainSingle().Which.Status.Should().Be(SendResult.Accepted, "Hub accepts signed heartbeat envelope");

        // Portal pulls heartbeat envelope
        var pulled = await cell.Hub.NewSdk(InteropServices.Portal).PullAsync(InteropServices.Portal, 10, 0, CancellationToken.None);
        pulled.Should().Contain(m => m.Envelope.Type == InteropTypes.FacilityHeartbeat);

        // Process heartbeat in handler with CapturingPublisher to verify self-healing dispatch
        var capturingPublisher = new CapturingPublisher();
        var provisioningPublisher = new FacilityProvisioningPublisher(portalDb, capturingPublisher);
        var handler = new FacilityHeartbeatHandler(portalDb, TimeProvider.System, provisioningPublisher, NullLogger<FacilityHeartbeatHandler>.Instance);

        var payload = new FacilityHeartbeatPayload
        {
            AppVersion = "2.0.0",
            IsWorkspaceEligible = false, // Clinic reports false (drifted from portal's authoritative true)
            ClockUtc = DateTime.UtcNow
        };

        await handler.HandleAsync(
            payload,
            new InteropMessageContext(heartbeatEnvelope),
            CancellationToken.None);

        var updatedFacility = await portalDb.Facilities.AsNoTracking().FirstOrDefaultAsync(f => f.Id == clinic.Id);
        updatedFacility!.LastSeenAt.Should().NotBeNull("Heartbeat records last seen timestamp");
        updatedFacility.AppVersion.Should().Be("2.0.0");
        capturingPublisher.Sent.Should().HaveCount(2, "Drifted clinic heartbeat must stage dual directory updates (patient + clinic)");
        capturingPublisher.Sent.Should().OnlyContain(e => e.Type == InteropTypes.FacilityDirectoryUpdated);
    }

    [Fact]
    public async Task Tier2_NonPortalSender_AttemptingWorkspaceEligibilityUpdate_IsRejectedOrIgnoredByPatient()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic(TenantId, "Tamper Target Clinic"));

        // Ensure baseline record exists in patient-api
        await SendPortalDirectoryUpdateAsync(cell, clinic, isWorkspaceEligible: false);
        await cell.PumpAsync();

        // Spoof attempt: Lab sender attempts to send facility.directory.updated asserting IsWorkspaceEligible = true
        var spoofEnvelope = InteropEnvelope.Create(
            InteropTypes.FacilityDirectoryUpdated,
            Party.ForFacility(TenantId, Guid.NewGuid().ToString(), FacilityType.Laboratory),
            new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient },
            clinic.Id,
            new FacilityCreatedEvent
            {
                TenantId = clinic.Tenant,
                ResourceId = clinic.Id,
                FacilityType = FacilityType.Clinic,
                Name = clinic.Name,
                IsWorkspaceEligible = true
            });

        // Hub routing matrix directly blocks unauthorized senders for facility.directory.updated at the gateway
        var results = await cell.Hub.NewSdk(InteropServices.Laboratory).SendAsync([spoofEnvelope], CancellationToken.None);
        results.Should().ContainSingle().Which.Status.Should().Be(SendResult.Rejected, "Hub gateway rejects unroutable sender for directory update");

        // Verification: Patient DB remains completely untouched
        var stored = await QueryPatientClinicAsync(cell, clinic.Id);
        stored.Should().NotBeNull();
        stored!.IsWorkspaceEligible.Should().BeFalse("Unauthorized non-portal sender cannot mutate IsWorkspaceEligible");
        stored.IsPublic.Should().BeFalse("Public status remains false under unauthorized tamper attempt");
    }

    [Fact]
    public async Task Tier2_ClinicSender_AttemptingToUpdateAnotherClinicFacility_IsRejectedByAntiSpoofingGuard()
    {
        await using var cell = new TestCell();
        var clinicA = await cell.ProvisionAsync(Fac.Clinic(TenantId, "Attacking Clinic A"));
        var clinicB = await cell.ProvisionAsync(Fac.Clinic(TenantId, "Victim Clinic B"));

        // Initialize Clinic B in patient database via authorized Portal event
        await SendPortalDirectoryUpdateAsync(cell, clinicB, isWorkspaceEligible: false);
        await cell.PumpAsync();

        // Clinic A sends directory update claiming to be Clinic B (ResourceId = Clinic B, but From.FacilityId = Clinic A)
        var spoofEnvelope = InteropEnvelope.Create(
            InteropTypes.FacilityDirectoryUpdated,
            clinicA.Party, // Sender is Clinic A
            new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Patient },
            clinicB.Id,
            new FacilityCreatedEvent
            {
                TenantId = clinicB.Tenant,
                ResourceId = clinicB.Id, // Resource target is Clinic B
                FacilityType = FacilityType.Clinic,
                Name = clinicB.Name,
                IsDirectoryPublished = true
            });

        var results = await cell.Hub.NewSdk(InteropServices.Clinic).SendAsync([spoofEnvelope], CancellationToken.None);
        results.Should().ContainSingle().Which.Status.Should().Be(SendResult.Accepted);
        await cell.PumpAsync();

        // Verification: Clinic B in patient-api remains unpublished
        var storedB = await QueryPatientClinicAsync(cell, clinicB.Id);
        storedB.Should().NotBeNull();
        storedB!.IsDirectoryPublished.Should().BeFalse("Anti-spoofing guard rejects clinic sender modifying a different facility resource ID");
        storedB.IsPublic.Should().BeFalse();
    }

    #endregion

    #region Tier 3: Cross-Feature Combinations

    [Fact]
    public async Task Tier3_MultiFacilityTenant_EnablingFacilityA_DoesNotGrantEligibilityToFacilityB()
    {
        await using var cell = new TestCell();
        var clinicA = await cell.ProvisionAsync(Fac.Clinic(TenantId, "Branch Alpha"));
        var clinicB = await cell.ProvisionAsync(Fac.Clinic(TenantId, "Branch Beta"));

        // Both clinics publish locally
        await SendClinicDirectoryUpdateAsync(cell, clinicA, isDirectoryPublished: true);
        await SendClinicDirectoryUpdateAsync(cell, clinicB, isDirectoryPublished: true);
        await cell.PumpAsync();

        // Portal grants workspace discovery eligibility ONLY for Clinic A
        await SendPortalDirectoryUpdateAsync(cell, clinicA, isWorkspaceEligible: true);
        await cell.PumpAsync();

        // Verification in database:
        var storedA = await QueryPatientClinicAsync(cell, clinicA.Id);
        var storedB = await QueryPatientClinicAsync(cell, clinicB.Id);

        storedA!.IsWorkspaceEligible.Should().BeTrue();
        storedA.IsDirectoryPublished.Should().BeTrue();
        storedA.IsPublic.Should().BeTrue("Clinic A has both tiers satisfied");

        storedB!.IsWorkspaceEligible.Should().BeFalse("Clinic B was never granted workspace discovery eligibility");
        storedB.IsDirectoryPublished.Should().BeTrue();
        storedB.IsPublic.Should().BeFalse("Clinic B must remain private despite Clinic A being eligible in same tenant");

        // Verification in search:
        var search = await SearchPatientClinicsAsync(cell);
        search.Items.Should().Contain(c => c.Id == clinicA.Id, "Eligible clinic A must be in search results");
        search.Items.Should().NotContain(c => c.Id == clinicB.Id, "Ineligible sibling branch must not be in search results");
    }

    [Fact]
    public async Task Tier3_HeartbeatInSync_ProducesZeroRedundantOutboxMessages()
    {
        await using var cell = new TestCell();
        var tenantGuid = Guid.NewGuid();
        var clinic = await cell.ProvisionAsync(Fac.Clinic(tenantGuid.ToString(), "InSync Clinic"));

        await using var portalDb = new PortalDbContext(new DbContextOptionsBuilder<PortalDbContext>()
            .UseInMemoryDatabase($"e2e-portal-insync-{Guid.NewGuid():N}").Options);

        var portalTenant = new PortalTenant { Id = tenantGuid, Name = "InSync Tenant", TenantSlug = "insync-ws" };
        var portalFacility = new PortalFacility
        {
            Id = clinic.Id,
            TenantId = tenantGuid,
            Name = clinic.Name,
            Slug = "insync-clinic",
            FacilityType = FacilityType.Clinic,
            IsPatientDiscoveryEligible = true,
            Status = FacilityStatus.Active
        };
        portalDb.Tenants.Add(portalTenant);
        portalDb.Facilities.Add(portalFacility);
        await portalDb.SaveChangesAsync();

        var capturingPublisher = new CapturingPublisher();
        var provisioningPublisher = new FacilityProvisioningPublisher(portalDb, capturingPublisher);
        var handler = new FacilityHeartbeatHandler(portalDb, TimeProvider.System, provisioningPublisher, NullLogger<FacilityHeartbeatHandler>.Instance);

        // Send in-sync heartbeat
        var heartbeatEnvelope = InteropEnvelope.Create(
            InteropTypes.FacilityHeartbeat,
            clinic.Party,
            Party.Portal,
            Guid.NewGuid(),
            new FacilityHeartbeatPayload
            {
                AppVersion = "1.0.0",
                IsWorkspaceEligible = true, // in-sync with portal's true!
                ClockUtc = DateTime.UtcNow
            });

        var results = await cell.Hub.NewSdk(InteropServices.Clinic).SendAsync([heartbeatEnvelope], CancellationToken.None);
        results.Should().ContainSingle().Which.Status.Should().Be(SendResult.Accepted);
        await cell.PumpAsync();

        // Heartbeat is processed without cascading duplicate directory updates
        await handler.HandleAsync(
            heartbeatEnvelope.GetPayload<FacilityHeartbeatPayload>(),
            new InteropMessageContext(heartbeatEnvelope),
            CancellationToken.None);

        capturingPublisher.Sent.Count(e => e.Type == InteropTypes.FacilityDirectoryUpdated)
            .Should().Be(0, "In-sync heartbeat must not produce redundant directory update messages");
    }

    #endregion

    #region Tier 4: Real-World Full Lifecycle Scenarios

    [Fact]
    public async Task Tier4_RealWorldLifecycle_Provision_PortalGrant_ClinicPublish_PatientDiscoverable_PortalRevoke_PatientHidden()
    {
        await using var cell = new TestCell();
        var uniqueClinicName = $"Real-World Metro Health {Guid.NewGuid().ToString("N")[..6]}";
        var clinic = await cell.ProvisionAsync(Fac.Clinic(TenantId, uniqueClinicName));

        // Milestone 0: Freshly provisioned facility before directory synchronization
        var initial = await QueryPatientClinicAsync(cell, clinic.Id);
        initial.Should().BeNull("Newly provisioned clinic has not yet received directory synchronization in patient catalogue");

        var searchInitial = await SearchPatientClinicsAsync(cell);
        searchInitial.Items.Should().NotContain(c => c.Id == clinic.Id, "Newly provisioned clinic is completely undiscoverable");

        // Seed Clinic operational readiness (with IsWorkspaceEligible initially false)
        await SeedClinicReadinessAsync(cell, clinic, isWorkspaceEligible: false);

        // Milestone 1: Workspace Administrator enables Patient App Discovery in Portal
        await SendPortalDirectoryUpdateAsync(cell, clinic, isWorkspaceEligible: true);
        await cell.PumpAsync();

        var clinicEligibleAfterGrant = await cell.Clinic.DbAsync(async db =>
            (await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinic.Id)).IsWorkspaceEligible);
        clinicEligibleAfterGrant.Should().BeTrue("Clinic workstation must receive IsWorkspaceEligible = true from Portal over Interop Hub");

        var stage1 = await QueryPatientClinicAsync(cell, clinic.Id);
        stage1!.IsWorkspaceEligible.Should().BeTrue("Portal workspace eligibility toggle applied");
        stage1.IsDirectoryPublished.Should().BeFalse();
        stage1.IsPublic.Should().BeFalse("Tier 2 publishing check is still pending");

        var searchStage1 = await SearchPatientClinicsAsync(cell);
        searchStage1.Items.Should().NotContain(c => c.Id == clinic.Id, "Clinic remains undiscoverable until workstation publishing is completed");

        // Milestone 2: Clinic Staff completes pre-flight checks and clicks 'Publish to Patient Directory' via real MediatR command + outbox
        var publishResult = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new PublishClinicToDirectoryCommand(true));
        publishResult.Success.Should().BeTrue();
        publishResult.IsPublished.Should().BeTrue();
        await cell.PumpAsync();

        var stage2 = await QueryPatientClinicAsync(cell, clinic.Id);
        stage2!.IsWorkspaceEligible.Should().BeTrue();
        stage2.IsDirectoryPublished.Should().BeTrue();
        stage2.IsPublic.Should().BeTrue("Both tiers are fulfilled: clinic is now publicly visible");

        var searchStage2 = await SearchPatientClinicsAsync(cell);
        searchStage2.Items.Should().Contain(c => c.Id == clinic.Id, "Patients can now discover the clinic via mobile app search");

        // Milestone 3: Workspace Administrator revokes discovery (e.g. branch temporarily closed or billing past due)
        await SendPortalDirectoryUpdateAsync(cell, clinic, isWorkspaceEligible: false);
        await cell.PumpAsync();

        var clinicEligibleAfterRevoke = await cell.Clinic.DbAsync(async db =>
            (await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinic.Id)).IsWorkspaceEligible);
        clinicEligibleAfterRevoke.Should().BeFalse("Clinic workstation must receive IsWorkspaceEligible = false upon Portal revocation");

        var stage3 = await QueryPatientClinicAsync(cell, clinic.Id);
        stage3!.IsWorkspaceEligible.Should().BeFalse();
        stage3.IsDirectoryPublished.Should().BeTrue("Clinic's operational readiness configuration is not wiped");
        stage3.IsPublic.Should().BeFalse("Immediate revocation: IsPublic drops to false");

        var searchStage3 = await SearchPatientClinicsAsync(cell);
        searchStage3.Items.Should().NotContain(c => c.Id == clinic.Id, "Clinic is immediately removed from mobile patient discovery upon Portal revocation");

        // Assert no dead letters or stuck messages across the entire cell
        foreach (var host in cell.Hosts)
        {
            await host.AssertNothingStuckAsync();
        }
    }

    #endregion
}
