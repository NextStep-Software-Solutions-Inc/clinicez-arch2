using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Tests;
using ClinicEz.Clinic.Domain.Entities;
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
/// Empirical Adversarial Stress Test Suite for Milestone M3:
/// Clinic Inbound Interop & Message Matrix Parity (Issue #72).
/// Authored and executed by Challenger 1 (teamwork_preview_challenger_m3_1).
///
/// Target Attack Surfaces & Invariants:
/// 1. Sender Authentication: Strict enforcement of ControlPlane + Portal identity (spoofing resistance)
/// 2. Recipient Validation: Facility boundary, GUID parsing resilience, tenant match, facility type filter
/// 3. Multi-Tenant Query Filter Bypass: Isolation enforcement, cross-tenant spoof immunity, ambient filter bypass
/// 4. State & Field Mutation Safety: Selective field updates, immutability of Tier-2 IsDirectoryPublished and sensitive configs
/// 5. Provisioning Parity: FacilityCreatedHandler entitlement and eligibility mapping across new seeds & redeliveries
/// </summary>
public class ChallengerM3InboundInteropEmpiricalTests
{
    private static FacilityDirectoryUpdatedHandler CreateDirectoryUpdatedHandler(ApplicationDbContext db) =>
        new(db, NullLogger<FacilityDirectoryUpdatedHandler>.Instance);

    private static FacilityCreatedHandler CreateFacilityCreatedHandler(ApplicationDbContext db) =>
        new(db, new InteropPublisher(db), new FacilityLicenseValidator(FacilityLicenseValidator.DefaultAuthorityPublicKeyPem), NullLogger<FacilityCreatedHandler>.Instance);

    private static FacilityCreatedEvent CreateEvent(
        Guid resourceId,
        string tenantId = "tenant-alpha",
        bool? isWorkspaceEligible = true,
        FacilityType facilityType = FacilityType.Clinic) =>
        new()
        {
            ResourceId = resourceId,
            TenantId = tenantId,
            Name = "St. Jude Medical Clinic",
            Slug = "st-jude-clinic",
            TenantSlug = "st-jude-health",
            FacilityType = facilityType,
            IsWorkspaceEligible = isWorkspaceEligible
        };

    private static InteropMessageContext CreateContext(
        Party from,
        Party to,
        FacilityCreatedEvent evt) =>
        MessagingTestKit.Delivered(
            InteropTypes.FacilityDirectoryUpdated,
            from,
            to,
            evt.ResourceId,
            evt);

    #region 1. Sender Authentication & Spoofing Resistance

    [Theory]
    [InlineData("portal")]
    [InlineData("PORTAL")]
    [InlineData("Portal")]
    [InlineData("pOrTaL")]
    public async Task SenderAuth_ValidPortalControlPlane_WithAnyCasing_IsAccepted(string portalCasing)
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, "tenant-alpha", "Original Name");

        var evt = CreateEvent(clinicId, "tenant-alpha", isWorkspaceEligible: true);
        var fromParty = new Party { Kind = PartyKind.ControlPlane, Service = portalCasing };
        var toParty = MessagingTestKit.ClinicParty("tenant-alpha", clinicId);

        var handler = CreateDirectoryUpdatedHandler(db);
        await handler.HandleAsync(evt, CreateContext(fromParty, toParty, evt), CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeTrue();
    }

    [Fact]
    public async Task SenderAuth_ControlPlane_WithNullService_DefaultsToPortal_IsAccepted()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, "tenant-alpha", "Original Name");

        var evt = CreateEvent(clinicId, "tenant-alpha", isWorkspaceEligible: true);
        var fromParty = new Party { Kind = PartyKind.ControlPlane, Service = null };
        var toParty = MessagingTestKit.ClinicParty("tenant-alpha", clinicId);

        var handler = CreateDirectoryUpdatedHandler(db);
        await handler.HandleAsync(evt, CreateContext(fromParty, toParty, evt), CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeTrue();
    }

    [Theory]
    [InlineData("patient")]
    [InlineData("philhealth")]
    [InlineData("billing")]
    [InlineData("laboratory")]
    [InlineData("pharmacy")]
    [InlineData("organization")]
    [InlineData("rogue_service")]
    public async Task SenderAuth_ControlPlane_NonPortalServices_AreRejected(string rogueService)
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, "tenant-alpha", "Untouched Clinic");

        var evt = CreateEvent(clinicId, "tenant-alpha", isWorkspaceEligible: true);
        var rogueParty = new Party { Kind = PartyKind.ControlPlane, Service = rogueService };
        var toParty = MessagingTestKit.ClinicParty("tenant-alpha", clinicId);

        var handler = CreateDirectoryUpdatedHandler(db);
        await handler.HandleAsync(evt, CreateContext(rogueParty, toParty, evt), CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeFalse("Only Portal control-plane can mutate Tier-1 eligibility");
        settings.ClinicName.Should().Be("Untouched Clinic");
    }

    [Theory]
    [InlineData(PartyKind.Facility, "portal")]
    [InlineData(PartyKind.Facility, "clinic")]
    [InlineData(PartyKind.Patient, "portal")]
    [InlineData(PartyKind.Patient, null)]
    public async Task SenderAuth_NonControlPlaneParties_ClaimingPortalService_AreRejected(PartyKind kind, string? service)
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, "tenant-alpha", "Untouched Clinic");

        var evt = CreateEvent(clinicId, "tenant-alpha", isWorkspaceEligible: true);
        var spoofedParty = new Party { Kind = kind, Service = service };
        var toParty = MessagingTestKit.ClinicParty("tenant-alpha", clinicId);

        var handler = CreateDirectoryUpdatedHandler(db);
        await handler.HandleAsync(evt, CreateContext(spoofedParty, toParty, evt), CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeFalse("Spoofed sender must be dropped");
    }

    #endregion

    #region 2. Recipient Validation & Resilience

    [Theory]
    [InlineData("not-a-guid")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("12345-invalid")]
    public async Task RecipientValidation_MalformedFacilityIdInAddress_IsDroppedWithoutException(string malformedFacilityId)
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, "tenant-alpha");

        var evt = CreateEvent(clinicId, "tenant-alpha", isWorkspaceEligible: true);
        var toParty = new Party { Kind = PartyKind.Facility, TenantId = "tenant-alpha", FacilityId = malformedFacilityId };

        var handler = CreateDirectoryUpdatedHandler(db);
        var act = () => handler.HandleAsync(evt, CreateContext(Party.Portal, toParty, evt), CancellationToken.None);

        await act.Should().NotThrowAsync();
        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeFalse();
    }

    [Fact]
    public async Task RecipientValidation_RecipientKindNotFacility_IsDropped()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, "tenant-alpha");

        var evt = CreateEvent(clinicId, "tenant-alpha", isWorkspaceEligible: true);
        var toParty = new Party { Kind = PartyKind.ControlPlane, Service = InteropServices.Portal };

        var handler = CreateDirectoryUpdatedHandler(db);
        await handler.HandleAsync(evt, CreateContext(Party.Portal, toParty, evt), CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeFalse();
    }

    [Fact]
    public async Task RecipientValidation_RecipientFacilityIdMismatch_IsDropped()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var otherClinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, "tenant-alpha");

        var evt = CreateEvent(clinicId, "tenant-alpha", isWorkspaceEligible: true);
        var toParty = MessagingTestKit.ClinicParty("tenant-alpha", otherClinicId);

        var handler = CreateDirectoryUpdatedHandler(db);
        await handler.HandleAsync(evt, CreateContext(Party.Portal, toParty, evt), CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeFalse();
    }

    [Fact]
    public async Task RecipientValidation_TenantIdCaseInsensitiveMatch_IsAccepted()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, "tenant-alpha");

        var evt = CreateEvent(clinicId, "tenant-alpha", isWorkspaceEligible: true);
        var toParty = MessagingTestKit.ClinicParty("TENANT-ALPHA", clinicId);

        var handler = CreateDirectoryUpdatedHandler(db);
        await handler.HandleAsync(evt, CreateContext(Party.Portal, toParty, evt), CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeTrue("Tenant match must be case-insensitive");
    }

    [Theory]
    [InlineData(FacilityType.Laboratory)]
    [InlineData(FacilityType.Pharmacy)]
    [InlineData(FacilityType.Organization)]
    public async Task RecipientValidation_NonClinicFacilityType_IsDropped(FacilityType nonClinicType)
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        MessagingTestKit.SeedClinic(db, clinicId, "tenant-alpha");

        var evt = CreateEvent(clinicId, "tenant-alpha", isWorkspaceEligible: true, facilityType: nonClinicType);
        var toParty = MessagingTestKit.ClinicParty("tenant-alpha", clinicId);

        var handler = CreateDirectoryUpdatedHandler(db);
        await handler.HandleAsync(evt, CreateContext(Party.Portal, toParty, evt), CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeFalse();
    }

    #endregion

    #region 3. Multi-Tenant Isolation & Filter Bypass

    [Fact]
    public async Task MultiTenant_CrossTenantSpoof_DoesNotMutateTargetClinic()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        // Seed clinic owned by tenant-victim
        MessagingTestKit.SeedClinic(db, clinicId, "tenant-victim", "Victim Clinic");

        // Attacker claims clinic belongs to tenant-attacker
        var evt = CreateEvent(clinicId, "tenant-attacker", isWorkspaceEligible: true);
        var toParty = MessagingTestKit.ClinicParty("tenant-attacker", clinicId);

        var handler = CreateDirectoryUpdatedHandler(db);
        await handler.HandleAsync(evt, CreateContext(Party.Portal, toParty, evt), CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeFalse("Cross-tenant tampering attempt must not mutate victim's settings");
        settings.ClinicName.Should().Be("Victim Clinic");
    }

    [Fact]
    public async Task MultiTenant_NonExistentClinic_LogsWarningAndDoesNotThrow()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var phantomClinicId = Guid.NewGuid();

        var evt = CreateEvent(phantomClinicId, "tenant-alpha", isWorkspaceEligible: true);
        var toParty = MessagingTestKit.ClinicParty("tenant-alpha", phantomClinicId);

        var handler = CreateDirectoryUpdatedHandler(db);
        var act = () => handler.HandleAsync(evt, CreateContext(Party.Portal, toParty, evt), CancellationToken.None);

        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task MultiTenant_MixedCaseTenantInDatabase_ResolvesCorrectly()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        // Database stored with mixed-case tenant
        MessagingTestKit.SeedClinic(db, clinicId, "Tenant_MiXeD_CaSe", "Mixed Case Clinic");

        var evt = CreateEvent(clinicId, "tenant_mixed_case", isWorkspaceEligible: true);
        var toParty = MessagingTestKit.ClinicParty("tenant_mixed_case", clinicId);

        var handler = CreateDirectoryUpdatedHandler(db);
        await handler.HandleAsync(evt, CreateContext(Party.Portal, toParty, evt), CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeTrue();
    }

    #endregion

    #region 4. Field Mutation Safety & Immutability of Sensitive Configs

    [Fact]
    public async Task FieldSafety_SelectiveUpdates_PreservesTier2PublishingAndSensitiveConfigs()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var originalSettings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-alpha",
            ClinicId = clinicId,
            ClinicName = "Original Clinic",
            FacilitySlug = "orig-slug",
            TenantSlug = "orig-tenant-slug",
            IsWorkspaceEligible = false,
            // Critical Tier-2 Publishing State
            IsDirectoryPublished = true,
            IsOnlineBookingPaused = false,
            // Sensitive Licensing & Limits
            LicenseToken = "SECRET_TOKEN_XYZ",
            PlanTier = "Enterprise",
            MaxStaffLimit = 42,
            LicenseExpiresAt = DateTime.UtcNow.AddYears(1),
            EntitlementVersion = 9,
            // Financial & Clinical Defaults
            DefaultConsultationFee = 999.00m,
            VatRate = 0.12m,
            DefaultDoctorSharePercentage = 0.80m,
            CashierMode = "CashierCounter",
            TaxIdentificationNumber = "123-456-789",
            AccreditationNumber = "PHIC-9999",
            OperatingHours = "24/7",
            CreatedAt = DateTime.UtcNow.AddMonths(-1),
            CreatedBy = "provisioner"
        };
        db.Settings.Add(originalSettings);
        await db.SaveChangesAsync();

        var evt = new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = "tenant-alpha",
            Name = "New Public Clinic Name",
            Slug = "new-public-slug",
            TenantSlug = "new-tenant-slug",
            FacilityType = FacilityType.Clinic,
            IsWorkspaceEligible = true,
            // Attacker payload attempts to overwrite license & limits through directory update
            LicenseToken = "FORGED_TOKEN",
            PlanTier = "HackedTier",
            Limits = new FacilityLimits { MaxStaff = 9999 }
        };

        var handler = CreateDirectoryUpdatedHandler(db);
        await handler.HandleAsync(evt, CreateContext(Party.Portal, MessagingTestKit.ClinicParty("tenant-alpha", clinicId), evt), CancellationToken.None);

        var updated = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);

        // Mutated fields
        updated.IsWorkspaceEligible.Should().BeTrue();
        updated.ClinicName.Should().Be("New Public Clinic Name");
        updated.FacilitySlug.Should().Be("new-public-slug");
        updated.TenantSlug.Should().Be("new-tenant-slug");
        updated.UpdatedAt.Should().NotBeNull();

        // Strictly UNMUTATED fields
        updated.IsDirectoryPublished.Should().BeTrue("Tier-2 publishing state must NOT be overwritten by Tier-1 directory update");
        updated.IsOnlineBookingPaused.Should().BeFalse();
        updated.LicenseToken.Should().Be("SECRET_TOKEN_XYZ", "Directory updates must NEVER tamper with cryptographic license token");
        updated.PlanTier.Should().Be("Enterprise");
        updated.MaxStaffLimit.Should().Be(42);
        updated.EntitlementVersion.Should().Be(9);
        updated.DefaultConsultationFee.Should().Be(999.00m);
        updated.CashierMode.Should().Be("CashierCounter");
        updated.TaxIdentificationNumber.Should().Be("123-456-789");
        updated.AccreditationNumber.Should().Be("PHIC-9999");
        updated.OperatingHours.Should().Be("24/7");
    }

    [Fact]
    public async Task FieldSafety_NullOrWhitespaceFields_DoNotOverwriteExistingValues()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var original = MessagingTestKit.SeedClinic(db, clinicId, "tenant-alpha", "Keep This Name");
        original.FacilitySlug = "keep-slug";
        original.TenantSlug = "keep-tenant-slug";
        await db.SaveChangesAsync();

        var evt = new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = "tenant-alpha",
            Name = "   ", // whitespace name
            Slug = null,   // null slug
            TenantSlug = "", // empty tenant slug
            FacilityType = FacilityType.Clinic,
            IsWorkspaceEligible = true
        };

        var handler = CreateDirectoryUpdatedHandler(db);
        await handler.HandleAsync(evt, CreateContext(Party.Portal, MessagingTestKit.ClinicParty("tenant-alpha", clinicId), evt), CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.ClinicName.Should().Be("Keep This Name", "Whitespace name must not overwrite existing name");
        settings.FacilitySlug.Should().Be("keep-slug", "Null slug must not overwrite existing slug");
        settings.TenantSlug.Should().Be("keep-tenant-slug", "Empty tenant slug must not overwrite existing tenant slug");
        settings.IsWorkspaceEligible.Should().BeTrue();
    }

    [Fact]
    public async Task FieldSafety_NullIsWorkspaceEligible_DefaultsToFalse()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var original = MessagingTestKit.SeedClinic(db, clinicId, "tenant-alpha", "Eligible Clinic");
        original.IsWorkspaceEligible = true;
        await db.SaveChangesAsync();

        var evt = new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = "tenant-alpha",
            Name = "Eligible Clinic",
            FacilityType = FacilityType.Clinic,
            IsWorkspaceEligible = null // null passed
        };

        var handler = CreateDirectoryUpdatedHandler(db);
        await handler.HandleAsync(evt, CreateContext(Party.Portal, MessagingTestKit.ClinicParty("tenant-alpha", clinicId), evt), CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeFalse("Null IsWorkspaceEligible must coalesce to false");
    }

    #endregion

    #region 5. FacilityCreatedHandler (License Provisioning & Redelivery)

    [Fact]
    public async Task FacilityCreatedHandler_NewProvisioning_CorrectlyPersistsIsWorkspaceEligible()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();

        var evt = new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = "tenant-provision",
            Name = "Newly Licensed Clinic",
            Slug = "licensed-clinic",
            TenantSlug = "licensed-tenant",
            FacilityType = FacilityType.Clinic,
            IsWorkspaceEligible = true
        };

        var context = MessagingTestKit.Delivered(
            InteropTypes.FacilityLicenseIssued,
            Party.Portal,
            MessagingTestKit.ClinicParty("tenant-provision", clinicId),
            clinicId,
            evt);

        var handler = CreateFacilityCreatedHandler(db);
        await handler.HandleAsync(evt, context, CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleOrDefaultAsync(s => s.ClinicId == clinicId);
        settings.Should().NotBeNull();
        settings!.IsWorkspaceEligible.Should().BeTrue();
        settings.ClinicName.Should().Be("Newly Licensed Clinic");
    }

    [Fact]
    public async Task FacilityCreatedHandler_Redelivery_UpdatesIsWorkspaceEligible()
    {
        using var db = MessagingTestKit.CreateDbContext();
        var clinicId = Guid.NewGuid();
        var existing = MessagingTestKit.SeedClinic(db, clinicId, "tenant-provision", "Existing Clinic");
        existing.IsWorkspaceEligible = false;
        await db.SaveChangesAsync();

        var evt = new FacilityCreatedEvent
        {
            ResourceId = clinicId,
            TenantId = "tenant-provision",
            Name = "Existing Clinic Renewed",
            FacilityType = FacilityType.Clinic,
            IsWorkspaceEligible = true
        };

        var context = MessagingTestKit.Delivered(
            InteropTypes.FacilityLicenseIssued,
            Party.Portal,
            MessagingTestKit.ClinicParty("tenant-provision", clinicId),
            clinicId,
            evt);

        var handler = CreateFacilityCreatedHandler(db);
        await handler.HandleAsync(evt, context, CancellationToken.None);

        var settings = await db.Settings.IgnoreQueryFilters().SingleAsync(s => s.ClinicId == clinicId);
        settings.IsWorkspaceEligible.Should().BeTrue("Redelivered license with updated eligibility must update settings");
    }

    #endregion
}
