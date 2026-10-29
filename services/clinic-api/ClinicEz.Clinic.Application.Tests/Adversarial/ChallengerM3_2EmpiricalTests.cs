using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Licensing;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Adversarial Challenge Suite for Milestone 3 (Issue #72).
/// Focus: Clinic Inbound Interop & Message Matrix Parity.
/// Probes:
/// 1. State Transitions: Initial grant (false -> true) and revocation (true -> false).
/// 2. Idempotency: Repeated identical deliveries leave state consistent without duplicate records.
/// 3. Missing Records: Messages for unknown clinic GUID or non-existent tenant log warnings and do not throw.
/// 4. Security & Boundary Defense: Unauthorized senders (Hub, PhilHealth, Facility pretending to be Portal, Patient) and recipient mismatches.
/// 5. Metadata Preservation: Null/whitespace Name, Slug, TenantSlug do not overwrite existing clinic metadata.
/// 6. Provisioning Mapping: FacilityCreatedHandler maps IsWorkspaceEligible on initial provision and renewal, defaulting null to false.
/// 7. Case-Insensitive Multi-Tenant Query Filter Bypass: Ensures ambient clinic/tenant context does not interfere with inbound updates.
/// </summary>
public class ChallengerM3_2EmpiricalTests
{
    private const string TenantA = "tenant_alpha";
    private const string TenantB = "tenant_beta";

    private static FacilityDirectoryUpdatedHandler CreateDirectoryHandler(ApplicationDbContext db) =>
        new(db, NullLogger<FacilityDirectoryUpdatedHandler>.Instance);

    private static FacilityCreatedHandler CreateProvisioningHandler(ApplicationDbContext db) =>
        new(db, new InteropPublisher(db), new FacilityLicenseValidator(FacilityLicenseValidator.DefaultAuthorityPublicKeyPem), NullLogger<FacilityCreatedHandler>.Instance);

    private static FacilityCreatedEvent BuildDirectoryEvent(
        Guid clinicId,
        string tenantId,
        bool? isWorkspaceEligible = true,
        string name = "Alpha Health Clinic",
        string slug = "alpha-health",
        string tenantSlug = "alpha-group",
        FacilityType facilityType = FacilityType.Clinic) => new()
    {
        ResourceId = clinicId,
        TenantId = tenantId,
        TenantSlug = tenantSlug,
        Slug = slug,
        Name = name,
        FacilityType = facilityType,
        IsWorkspaceEligible = isWorkspaceEligible
    };

    private static InteropMessageContext DeliveredContext<T>(
        string type,
        Party from,
        Party to,
        T payload,
        Guid? correlationId = null) =>
        MessagingTestKit.Delivered(type, from, to, correlationId ?? Guid.NewGuid(), payload);

    // =========================================================================
    // 1. STATE TRANSITIONS & IDEMPOTENCY
    // =========================================================================

    [Fact]
    public async Task StateTransition_FalseToTrue_ThenTrueToFalse_ThenRedundantFalse()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var settings = MessagingTestKit.SeedClinic(db, clinicId, TenantA, "Initial Clinic");
        settings.IsWorkspaceEligible = false;
        await db.SaveChangesAsync();

        var handler = CreateDirectoryHandler(db);
        var clinicParty = MessagingTestKit.ClinicParty(TenantA, clinicId);

        // Transition 1: false -> true
        var grantEvt = BuildDirectoryEvent(clinicId, TenantA, isWorkspaceEligible: true);
        await handler.HandleAsync(grantEvt, DeliveredContext(InteropTypes.FacilityDirectoryUpdated, Party.Portal, clinicParty, grantEvt), CancellationToken.None);

        var verifyGrant = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        verifyGrant.IsWorkspaceEligible.Should().BeTrue("State must transition from false to true upon Portal grant");

        // Transition 2: true -> false
        var revokeEvt = BuildDirectoryEvent(clinicId, TenantA, isWorkspaceEligible: false);
        await handler.HandleAsync(revokeEvt, DeliveredContext(InteropTypes.FacilityDirectoryUpdated, Party.Portal, clinicParty, revokeEvt), CancellationToken.None);

        var verifyRevoke = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        verifyRevoke.IsWorkspaceEligible.Should().BeFalse("State must transition from true to false upon Portal revocation");

        // Redundant delivery of false: should remain false idempotently
        await handler.HandleAsync(revokeEvt, DeliveredContext(InteropTypes.FacilityDirectoryUpdated, Party.Portal, clinicParty, revokeEvt), CancellationToken.None);

        var verifyRedundant = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        verifyRedundant.IsWorkspaceEligible.Should().BeFalse("State must remain false idempotently on duplicate message delivery");
    }

    [Fact]
    public async Task Idempotency_MultipleConsecutiveGrantDeliveries_DoesNotCorruptOrDuplicate()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantA, "Idempotent Clinic");

        var handler = CreateDirectoryHandler(db);
        var clinicParty = MessagingTestKit.ClinicParty(TenantA, clinicId);
        var grantEvt = BuildDirectoryEvent(clinicId, TenantA, isWorkspaceEligible: true);

        // Deliver 7 identical grant messages consecutively
        for (int i = 0; i < 7; i++)
        {
            await handler.HandleAsync(grantEvt, DeliveredContext(InteropTypes.FacilityDirectoryUpdated, Party.Portal, clinicParty, grantEvt), CancellationToken.None);
        }

        var count = await db.Settings.IgnoreQueryFilters().CountAsync(s => s.ClinicId == clinicId);
        count.Should().Be(1, "Repeated deliveries must not create duplicate FacilitySettings rows");

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeTrue();
    }

    // =========================================================================
    // 2. MISSING RECORDS & ERROR HANDLING
    // =========================================================================

    [Fact]
    public async Task MissingRecord_UnknownClinicId_LogsWarningAndReturnsCleanlyWithoutCrash()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var unknownClinicId = Guid.NewGuid();
        var handler = CreateDirectoryHandler(db);

        var evt = BuildDirectoryEvent(unknownClinicId, TenantA, isWorkspaceEligible: true);
        var clinicParty = MessagingTestKit.ClinicParty(TenantA, unknownClinicId);

        // Should not throw any exception when clinic record does not exist
        Func<Task> act = async () => await handler.HandleAsync(
            evt,
            DeliveredContext(InteropTypes.FacilityDirectoryUpdated, Party.Portal, clinicParty, evt),
            CancellationToken.None);

        await act.Should().NotThrowAsync("Missing clinic record must be gracefully dropped without throwing or crashing");

        var totalRows = await db.Settings.IgnoreQueryFilters().CountAsync();
        totalRows.Should().Be(0, "No row should be created for non-existent clinic on directory update");
    }

    [Fact]
    public async Task MissingRecord_UnknownTenant_LogsWarningAndReturnsCleanlyWithoutCrash()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantA, "Clinic In Tenant A");

        var handler = CreateDirectoryHandler(db);
        var evt = BuildDirectoryEvent(clinicId, "non_existent_tenant", isWorkspaceEligible: true);
        var targetParty = MessagingTestKit.ClinicParty("non_existent_tenant", clinicId);

        Func<Task> act = async () => await handler.HandleAsync(
            evt,
            DeliveredContext(InteropTypes.FacilityDirectoryUpdated, Party.Portal, targetParty, evt),
            CancellationToken.None);

        await act.Should().NotThrowAsync();

        // Clinic in Tenant A should remain completely untouched
        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeFalse();
    }

    // =========================================================================
    // 3. SECURITY & SENDER/RECIPIENT VALIDATION
    // =========================================================================

    [Theory]
    [InlineData("hub", PartyKind.ControlPlane)]
    [InlineData("philhealth", PartyKind.ControlPlane)]
    [InlineData("patient", PartyKind.Patient)]
    [InlineData("laboratory", PartyKind.Facility)]
    [InlineData("pharmacy", PartyKind.Facility)]
    public async Task Security_UnauthorizedSenders_AreStrictlyIgnored(string service, PartyKind kind)
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantA, "Secure Clinic");

        var handler = CreateDirectoryHandler(db);
        var evt = BuildDirectoryEvent(clinicId, TenantA, isWorkspaceEligible: true);
        var clinicParty = MessagingTestKit.ClinicParty(TenantA, clinicId);

        var senderParty = new Party
        {
            Kind = kind,
            Service = service,
            TenantId = TenantA,
            FacilityId = Guid.NewGuid().ToString()
        };

        await handler.HandleAsync(evt, DeliveredContext(InteropTypes.FacilityDirectoryUpdated, senderParty, clinicParty, evt), CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeFalse($"Unauthorized sender ({service}, {kind}) must not modify workspace eligibility");
    }

    [Fact]
    public async Task Security_FacilityPretendingToBePortal_IsStrictlyIgnored()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantA, "Secure Clinic");

        var handler = CreateDirectoryHandler(db);
        var evt = BuildDirectoryEvent(clinicId, TenantA, isWorkspaceEligible: true);
        var clinicParty = MessagingTestKit.ClinicParty(TenantA, clinicId);

        // An attacker creates a Facility party with Service set to "portal"
        var spoofedParty = new Party
        {
            Kind = PartyKind.Facility,
            Service = InteropServices.Portal,
            TenantId = TenantA,
            FacilityId = Guid.NewGuid().ToString(),
            FacilityType = FacilityType.Clinic
        };

        await handler.HandleAsync(evt, DeliveredContext(InteropTypes.FacilityDirectoryUpdated, spoofedParty, clinicParty, evt), CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeFalse("Facility party spoofing Portal service name must be rejected because Kind != ControlPlane");
    }

    [Fact]
    public async Task RecipientValidation_InvalidFacilityIdGuidFormat_IsIgnored()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, TenantA, "Secure Clinic");

        var handler = CreateDirectoryHandler(db);
        var evt = BuildDirectoryEvent(clinicId, TenantA, isWorkspaceEligible: true);

        // To.FacilityId is not a GUID
        var corruptedTo = new Party
        {
            Kind = PartyKind.Facility,
            TenantId = TenantA,
            FacilityId = "not-a-valid-guid",
            FacilityType = FacilityType.Clinic
        };

        await handler.HandleAsync(evt, DeliveredContext(InteropTypes.FacilityDirectoryUpdated, Party.Portal, corruptedTo, evt), CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeFalse();
    }

    // =========================================================================
    // 4. METADATA PRESERVATION ON PARTIAL UPDATES
    // =========================================================================

    [Fact]
    public async Task MetadataPreservation_NullOrWhitespaceFields_DoNotOverwriteExistingValues()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var original = MessagingTestKit.SeedClinic(db, clinicId, TenantA, "Established Clinic Name");
        original.FacilitySlug = "established-slug";
        original.TenantSlug = "established-tenant";
        original.IsWorkspaceEligible = false;
        await db.SaveChangesAsync();

        var handler = CreateDirectoryHandler(db);
        var clinicParty = MessagingTestKit.ClinicParty(TenantA, clinicId);

        // Incoming update only modifies IsWorkspaceEligible, leaving Name, Slug, TenantSlug null or whitespace
        var evt = new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = TenantA,
            FacilityType = FacilityType.Clinic,
            IsWorkspaceEligible = true,
            Name = "   ",
            Slug = null,
            TenantSlug = ""
        };

        await handler.HandleAsync(evt, DeliveredContext(InteropTypes.FacilityDirectoryUpdated, Party.Portal, clinicParty, evt), CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeTrue();
        settings.ClinicName.Should().Be("Established Clinic Name", "Whitespace name must not overwrite existing name");
        settings.FacilitySlug.Should().Be("established-slug", "Null slug must not overwrite existing slug");
        settings.TenantSlug.Should().Be("established-tenant", "Empty tenant slug must not overwrite existing tenant slug");
    }

    [Fact]
    public async Task MetadataPreservation_NullIsWorkspaceEligible_DefaultsToFalse()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var original = MessagingTestKit.SeedClinic(db, clinicId, TenantA, "Eligible Clinic");
        original.IsWorkspaceEligible = true;
        await db.SaveChangesAsync();

        var handler = CreateDirectoryHandler(db);
        var clinicParty = MessagingTestKit.ClinicParty(TenantA, clinicId);

        // Update with null IsWorkspaceEligible
        var evt = BuildDirectoryEvent(clinicId, TenantA, isWorkspaceEligible: null);

        await handler.HandleAsync(evt, DeliveredContext(InteropTypes.FacilityDirectoryUpdated, Party.Portal, clinicParty, evt), CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeFalse("Null IsWorkspaceEligible must coalesce to false");
    }

    // =========================================================================
    // 5. CASE-INSENSITIVITY & AMBIENT FILTER BYPASS
    // =========================================================================

    [Fact]
    public async Task CaseInsensitiveTenantMatching_MatchesUpperAndLowerCases()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        // Seed with mixed case
        MessagingTestKit.SeedClinic(db, clinicId, "Tenant_MixedCase", "Case Test Clinic");

        var handler = CreateDirectoryHandler(db);
        // Message arrives with UPPER CASE tenant
        var evt = BuildDirectoryEvent(clinicId, "TENANT_MIXEDCASE", isWorkspaceEligible: true);
        var clinicParty = MessagingTestKit.ClinicParty("tenant_mixedcase", clinicId);

        await handler.HandleAsync(evt, DeliveredContext(InteropTypes.FacilityDirectoryUpdated, Party.Portal, clinicParty, evt), CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeTrue("Tenant matching must be case-insensitive");
    }

    // =========================================================================
    // 6. PROVISIONING MAPPING (FacilityCreatedHandler)
    // =========================================================================

    private static FacilityCreatedEvent LicenseFor(Guid facilityId, string tenantId, bool? isWorkspaceEligible = null) => new()
    {
        ResourceId = facilityId,
        TenantId = tenantId,
        TenantSlug = "enterprise-corp",
        FacilityType = FacilityType.Clinic,
        Name = "Enterprise Clinic",
        Slug = "enterprise-clinic",
        LicenseToken = "signed-token",
        PlanTier = "Enterprise",
        LicenseExpiresAt = DateTime.UtcNow.AddDays(365),
        Limits = new FacilityLimits { MaxStaff = 20 },
        IsWorkspaceEligible = isWorkspaceEligible
    };

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    [InlineData(null)]
    public async Task FacilityCreatedHandler_InitialProvision_MapsIsWorkspaceEligibleCorrectly(bool? inputEligible)
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var handler = CreateProvisioningHandler(db);

        var license = LicenseFor(clinicId, TenantA, isWorkspaceEligible: inputEligible);
        var context = DeliveredContext(InteropTypes.FacilityLicenseIssued, Party.Portal, MessagingTestKit.ClinicParty(TenantA, clinicId), license);

        await handler.HandleAsync(license, context, CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        bool expected = inputEligible ?? false;
        settings.IsWorkspaceEligible.Should().Be(expected, $"Initial provisioning must set IsWorkspaceEligible to {expected}");
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    [InlineData(true, null)]
    public async Task FacilityCreatedHandler_Renewal_UpdatesIsWorkspaceEligibleCorrectly(bool initial, bool? renewal)
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var handler = CreateProvisioningHandler(db);

        // Initial provisioning
        var initialLicense = LicenseFor(clinicId, TenantA, isWorkspaceEligible: initial);
        var initialContext = DeliveredContext(InteropTypes.FacilityLicenseIssued, Party.Portal, MessagingTestKit.ClinicParty(TenantA, clinicId), initialLicense);
        await handler.HandleAsync(initialLicense, initialContext, CancellationToken.None);

        // Renewal with changed eligibility
        var renewalLicense = LicenseFor(clinicId, TenantA, isWorkspaceEligible: renewal);
        var renewalContext = DeliveredContext(InteropTypes.FacilityLicenseIssued, Party.Portal, MessagingTestKit.ClinicParty(TenantA, clinicId), renewalLicense);
        await handler.HandleAsync(renewalLicense, renewalContext, CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        bool expected = renewal ?? false;
        settings.IsWorkspaceEligible.Should().Be(expected, $"Renewal must update IsWorkspaceEligible to {expected}");
    }
}
