using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.Commands.UpdateTenantOverrides;
using ClinicEz.Portal.Application.Features.Admin.DTOs;
using ClinicEz.Portal.Application.Features.Admin.Queries.GetTenantOverrides;
using ClinicEz.Portal.Application.Features.Billing;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Features.Hub;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Domain.Constants;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.Licensing;
using FluentValidation.TestHelper;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace ClinicEz.Portal.Tests.Features.Admin;

/// <summary>
/// Empirical Adversarial Challenge Test Suite for Milestone 2:
/// Stress-tests workspace entitlement overrides and cascading updates.
/// 
/// Challenge Dimensions:
/// 1. Quantitative overrides taking precedence over plan limits (higher and lower).
/// 2. Explicit disabling of feature flag via override (Enabled = false) revoking base plan grants.
/// 3. Multiple facility license re-staging on override update (ECDSA-signed tokens, version bump, outbox events).
/// 4. Deleted/inactive overrides (IsDeleted = true) must NOT take precedence.
/// 5. Boundary values (-1 unlimited, 0 block, omitted soft-delete lifecycle, revival).
/// </summary>
public class WorkspaceEntitlementOverridesAdversarialChallengeTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly IEntitlementService _entitlements;
    private readonly IEntitlementsPublisher _publisher;
    private readonly ISubscriptionService _subscriptions;
    private readonly IEntitlementGuard _guard;
    private readonly UpdateTenantOverridesCommandValidator _validator = new();
    private readonly FacilityLicenseValidator _licenseValidator = new();

    public WorkspaceEntitlementOverridesAdversarialChallengeTests()
    {
        _entitlements = TestSupport.Entitlements(_context);

        _publisher = new EntitlementsPublisher(
            _context,
            _entitlements,
            new FacilityAllocationService(_context),
            new LicenseIssuer(new FacilityLicenseSigner(), Options.Create(new LicenseOptions()), TimeProvider.System),
            new InteropPublisher(_context));

        _subscriptions = new SubscriptionService(
            _context,
            Options.Create(TestSupport.Plans()),
            TimeProvider.System,
            _publisher);

        _guard = new EntitlementGuard(_context, _entitlements);
    }

    public void Dispose() => _context.Dispose();

    private UpdateTenantOverridesCommandHandler CreateHandler() =>
        new(
            _context,
            _entitlements,
            _subscriptions,
            _publisher,
            TimeProvider.System,
            NullLogger<UpdateTenantOverridesCommandHandler>.Instance);

    private async Task<(Tenant Tenant, Subscription Sub)> SeedTenantWithPlanAsync(string slug, string planSlug = "starter")
    {
        var tenant = new Tenant
        {
            Id = Guid.NewGuid(),
            Name = slug,
            TenantSlug = slug,
            Email = $"{slug}@clinic.test",
            OwnerId = $"owner-{slug}"
        };
        _context.Tenants.Add(tenant);
        await _context.SaveChangesAsync();

        var sub = await TestSupport.SeedSubscriptionAsync(_context, tenant.Id, planSlug: planSlug);
        return (tenant, sub);
    }

    // =================================================================================================================
    // 1. QUANTITATIVE OVERRIDES PRECEDENCE (HIGHER & LOWER)
    // =================================================================================================================

    [Fact]
    public async Task Override_HigherThanBasePlan_GrantsHigherLimitAndEnforcesGuard()
    {
        // Starter base plan has limit.clinics = 3, pool.staff = 10
        var (tenant, sub) = await SeedTenantWithPlanAsync("override-high-tenant", "starter");

        // Verify baseline
        var baseSnapshot = await _entitlements.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.Equal(3, baseSnapshot.Limits[EntitlementKeys.LimitClinics]);
        Assert.Equal(10, baseSnapshot.Limits[EntitlementKeys.PoolStaff]);

        // SuperAdmin applies override: limit.clinics = 50, pool.staff = 200
        var handler = CreateHandler();
        var command = new UpdateTenantOverridesCommand(
            tenant.Id,
            limits: new()
            {
                [EntitlementKeys.LimitClinics] = 50,
                [EntitlementKeys.PoolStaff] = 200
            },
            features: new(),
            reason: "Enterprise custom capacity expansion"
        );

        var dto = await handler.Handle(command, CancellationToken.None);
        Assert.NotNull(dto);
        Assert.Equal(50, dto.Limits[EntitlementKeys.LimitClinics]);
        Assert.Equal(200, dto.Limits[EntitlementKeys.PoolStaff]);

        // ResolveAsync returns higher limit
        var updatedSnapshot = await _entitlements.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.Equal(50, updatedSnapshot.Limits[EntitlementKeys.LimitClinics]);
        Assert.Equal(200, updatedSnapshot.Limits[EntitlementKeys.PoolStaff]);

        // Seed 10 clinics (exceeds base plan limit 3, but is within override 50)
        for (int i = 0; i < 10; i++)
        {
            _context.Facilities.Add(new Facility
            {
                Id = Guid.NewGuid(),
                TenantId = tenant.Id,
                Name = $"Clinic {i + 1}",
                Slug = $"clinic-{i + 1}",
                FacilityType = FacilityType.Clinic,
                Status = FacilityStatus.Active
            });
        }
        await _context.SaveChangesAsync();

        // Guard allows creating 11th clinic because 10 < 50
        await _guard.EnsureCanCreateFacilityAsync(tenant.Id, FacilityType.Clinic, CancellationToken.None);

        // Seed 40 more clinics to reach 50
        for (int i = 10; i < 50; i++)
        {
            _context.Facilities.Add(new Facility
            {
                Id = Guid.NewGuid(),
                TenantId = tenant.Id,
                Name = $"Clinic {i + 1}",
                Slug = $"clinic-{i + 1}",
                FacilityType = FacilityType.Clinic,
                Status = FacilityStatus.Active
            });
        }
        await _context.SaveChangesAsync();

        // 51st clinic must fail guard check with limit_reached
        var ex = await Assert.ThrowsAsync<EntitlementException>(() =>
            _guard.EnsureCanCreateFacilityAsync(tenant.Id, FacilityType.Clinic, CancellationToken.None));
        Assert.Equal(EntitlementGuard.LimitReachedCode, ex.Code);
    }

    [Fact]
    public async Task Override_LowerThanBasePlan_RestrictsToLowerLimitAndEnforcesGuard()
    {
        // Pro plan has pool.staff = 40, limit.clinics = Unlimited (-1)
        var (tenant, sub) = await SeedTenantWithPlanAsync("override-low-tenant", "pro");

        var baseSnapshot = await _entitlements.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.Equal(EntitlementSnapshot.Unlimited, baseSnapshot.Limits[EntitlementKeys.LimitClinics]);
        Assert.Equal(40, baseSnapshot.Limits[EntitlementKeys.PoolStaff]);

        // SuperAdmin restricts workspace to limit.clinics = 1, pool.staff = 3
        var handler = CreateHandler();
        var command = new UpdateTenantOverridesCommand(
            tenant.Id,
            limits: new()
            {
                [EntitlementKeys.LimitClinics] = 1,
                [EntitlementKeys.PoolStaff] = 3
            },
            features: new(),
            reason: "Budget sandbox restriction"
        );

        var dto = await handler.Handle(command, CancellationToken.None);
        Assert.NotNull(dto);
        Assert.Equal(1, dto.Limits[EntitlementKeys.LimitClinics]);
        Assert.Equal(3, dto.Limits[EntitlementKeys.PoolStaff]);

        // ResolveAsync returns restricted lower limits
        var updatedSnapshot = await _entitlements.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.Equal(1, updatedSnapshot.Limits[EntitlementKeys.LimitClinics]);
        Assert.Equal(3, updatedSnapshot.Limits[EntitlementKeys.PoolStaff]);

        // First clinic is allowed
        _context.Facilities.Add(new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            Name = "Primary Clinic",
            Slug = "primary-clinic",
            FacilityType = FacilityType.Clinic,
            Status = FacilityStatus.Active
        });
        await _context.SaveChangesAsync();

        // Second clinic creation must throw limit_reached even on Pro plan!
        var ex = await Assert.ThrowsAsync<EntitlementException>(() =>
            _guard.EnsureCanCreateFacilityAsync(tenant.Id, FacilityType.Clinic, CancellationToken.None));
        Assert.Equal(EntitlementGuard.LimitReachedCode, ex.Code);
    }

    [Fact]
    public async Task Override_UnlimitedMarkerMinusOne_SetsUnlimitedCeiling()
    {
        var (tenant, _) = await SeedTenantWithPlanAsync("unlimited-override-tenant", "starter");

        var handler = CreateHandler();
        var command = new UpdateTenantOverridesCommand(
            tenant.Id,
            limits: new() { [EntitlementKeys.LimitClinics] = -1 },
            features: new()
        );

        var dto = await handler.Handle(command, CancellationToken.None);
        Assert.NotNull(dto);
        Assert.NotNull(dto.EffectiveLimits);
        Assert.Equal(-1, dto.EffectiveLimits![EntitlementKeys.LimitClinics]);

        var snapshot = await _entitlements.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.Equal(EntitlementSnapshot.Unlimited, snapshot.Limits[EntitlementKeys.LimitClinics]);
        Assert.Equal(EntitlementSnapshot.Unlimited, snapshot.Limit(EntitlementKeys.LimitClinics));
    }

    [Fact]
    public async Task Override_ZeroLimit_BlocksFacilityCreationImmediately()
    {
        var (tenant, _) = await SeedTenantWithPlanAsync("zero-limit-tenant", "pro");

        var handler = CreateHandler();
        var command = new UpdateTenantOverridesCommand(
            tenant.Id,
            limits: new() { [EntitlementKeys.LimitLaboratories] = 0 },
            features: new()
        );

        await handler.Handle(command, CancellationToken.None);

        var ex = await Assert.ThrowsAsync<EntitlementException>(() =>
            _guard.EnsureCanCreateFacilityAsync(tenant.Id, FacilityType.Laboratory, CancellationToken.None));
        Assert.Equal(EntitlementGuard.LimitReachedCode, ex.Code);
    }

    // =================================================================================================================
    // 2. EXPLICIT DISABLING OF FEATURE FLAG VIA OVERRIDE
    // =================================================================================================================

    [Fact]
    public async Task Override_ExplicitlyDisablingFeature_RevokesFeatureWhenPlanHasItEnabled()
    {
        // Pro plan has all 10 features enabled
        var (tenant, _) = await SeedTenantWithPlanAsync("revoke-feature-tenant", "pro");

        var baseSnapshot = await _entitlements.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.Contains(EntitlementKeys.FeatureTeleconsultation, baseSnapshot.Features);
        Assert.Contains(EntitlementKeys.FeatureElectronicPrescriptions, baseSnapshot.Features);
        Assert.Contains(EntitlementKeys.FeaturePhilHealthKonsulta, baseSnapshot.Features);
        Assert.Contains(EntitlementKeys.FeatureLisIntegration, baseSnapshot.Features);

        // Guard check on baseline succeeds
        await _guard.EnsureFeatureAsync(tenant.Id, EntitlementKeys.FeatureTeleconsultation, CancellationToken.None);
        await _guard.EnsureFeatureAsync(tenant.Id, EntitlementKeys.FeaturePhilHealthKonsulta, CancellationToken.None);

        // SuperAdmin explicitly disables FeatureTeleconsultation and FeaturePhilHealthKonsulta (Enabled = false)
        var handler = CreateHandler();
        var command = new UpdateTenantOverridesCommand(
            tenant.Id,
            limits: new(),
            features: new()
            {
                [EntitlementKeys.FeatureTeleconsultation] = false,
                [EntitlementKeys.FeaturePhilHealthKonsulta] = false
            },
            reason: "Regulatory regional suspension"
        );

        var dto = await handler.Handle(command, CancellationToken.None);
        Assert.NotNull(dto);
        Assert.False(dto.Features[EntitlementKeys.FeatureTeleconsultation]);
        Assert.False(dto.Features[EntitlementKeys.FeaturePhilHealthKonsulta]);

        // Verify ResolveAsync revokes them
        var updatedSnapshot = await _entitlements.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.DoesNotContain(EntitlementKeys.FeatureTeleconsultation, updatedSnapshot.Features);
        Assert.DoesNotContain(EntitlementKeys.FeaturePhilHealthKonsulta, updatedSnapshot.Features);

        // Untouched features remain enabled
        Assert.Contains(EntitlementKeys.FeatureElectronicPrescriptions, updatedSnapshot.Features);
        Assert.Contains(EntitlementKeys.FeatureLisIntegration, updatedSnapshot.Features);

        // Guard checks fail for revoked features with feature_unavailable code
        var ex1 = await Assert.ThrowsAsync<EntitlementException>(() =>
            _guard.EnsureFeatureAsync(tenant.Id, EntitlementKeys.FeatureTeleconsultation, CancellationToken.None));
        Assert.Equal(EntitlementGuard.FeatureUnavailableCode, ex1.Code);

        var ex2 = await Assert.ThrowsAsync<EntitlementException>(() =>
            _guard.EnsureFeatureAsync(tenant.Id, EntitlementKeys.FeaturePhilHealthKonsulta, CancellationToken.None));
        Assert.Equal(EntitlementGuard.FeatureUnavailableCode, ex2.Code);

        // Guard check succeeds for untouched feature
        await _guard.EnsureFeatureAsync(tenant.Id, EntitlementKeys.FeatureElectronicPrescriptions, CancellationToken.None);
    }

    [Fact]
    public async Task Override_ExplicitlyEnablingFeature_GrantsFeatureWhenPlanDoesNotHaveIt()
    {
        // Starter plan only has feature.electronic_prescriptions enabled
        var (tenant, _) = await SeedTenantWithPlanAsync("grant-feature-tenant", "starter");

        var baseSnapshot = await _entitlements.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.DoesNotContain(EntitlementKeys.FeatureCrossTenantInterop, baseSnapshot.Features);

        // Explicitly enable FeatureCrossTenantInterop
        var handler = CreateHandler();
        var command = new UpdateTenantOverridesCommand(
            tenant.Id,
            limits: new(),
            features: new() { [EntitlementKeys.FeatureCrossTenantInterop] = true },
            reason: "Interop pilot trial"
        );

        var dto = await handler.Handle(command, CancellationToken.None);
        Assert.NotNull(dto);
        Assert.True(dto.Features[EntitlementKeys.FeatureCrossTenantInterop]);

        var updatedSnapshot = await _entitlements.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.Contains(EntitlementKeys.FeatureCrossTenantInterop, updatedSnapshot.Features);
        Assert.Contains(EntitlementKeys.FeatureElectronicPrescriptions, updatedSnapshot.Features);

        // Guard check passes
        await _guard.EnsureFeatureAsync(tenant.Id, EntitlementKeys.FeatureCrossTenantInterop, CancellationToken.None);
    }

    // =================================================================================================================
    // 3. MULTIPLE FACILITY LICENSE RE-STAGING & CRYPTOGRAPHIC ECDSA SIGNATURES
    // =================================================================================================================

    [Fact]
    public async Task Override_MultipleFacilities_ReStagesEcdsaSignedTokensForRoutableFacilitiesOnly()
    {
        var (tenant, sub) = await SeedTenantWithPlanAsync("multi-fac-tenant", "starter");
        var initialSubVersion = sub.EntitlementVersion;

        // Seed 4 diverse facilities:
        // 1. Main Clinic (Active, SharedCloud) -> Routable
        var mainClinic = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            FacilityType = FacilityType.Clinic,
            Name = "Main Central Clinic",
            Slug = "main-central",
            Status = FacilityStatus.Active,
            DeploymentMode = FacilityDeploymentMode.SharedCloud
        };
        // 2. Branch Clinic (Active, SharedCloud) -> Routable
        var branchClinic = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            FacilityType = FacilityType.Clinic,
            Name = "Downtown Branch",
            Slug = "downtown-branch",
            Status = FacilityStatus.Active,
            DeploymentMode = FacilityDeploymentMode.SharedCloud
        };
        // 3. Diagnostic Lab (Provisioning, SharedCloud) -> Routable
        var labFacility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            FacilityType = FacilityType.Laboratory,
            Name = "Metro Diagnostics Lab",
            Slug = "metro-lab",
            Status = FacilityStatus.Provisioning,
            DeploymentMode = FacilityDeploymentMode.SharedCloud
        };
        // 4. Suspended Clinic (Suspended) -> NOT Routable
        var suspendedClinic = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            FacilityType = FacilityType.Clinic,
            Name = "Closed Branch",
            Slug = "closed-branch",
            Status = FacilityStatus.Suspended,
            DeploymentMode = FacilityDeploymentMode.SharedCloud
        };

        _context.Facilities.AddRange(mainClinic, branchClinic, labFacility, suspendedClinic);
        await _context.SaveChangesAsync();

        // Initial staging
        await _publisher.StageForWorkspaceAsync(tenant.Id, CancellationToken.None);
        await _context.SaveChangesAsync();

        var initialMainToken = mainClinic.LicenseToken;
        var initialBranchToken = branchClinic.LicenseToken;
        var initialLabToken = labFacility.LicenseToken;
        var initialSuspendedToken = suspendedClinic.LicenseToken;

        Assert.NotNull(initialMainToken);
        Assert.NotNull(initialBranchToken);
        Assert.NotNull(initialLabToken);
        Assert.Null(initialSuspendedToken); // Suspended facility gets no license staged

        _context.InteropOutbox.RemoveRange(_context.InteropOutbox);
        await _context.SaveChangesAsync();

        // SuperAdmin updates overrides: pool.staff = 120, enable feature.teleconsultation
        var handler = CreateHandler();
        var command = new UpdateTenantOverridesCommand(
            tenant.Id,
            limits: new() { [EntitlementKeys.PoolStaff] = 120 },
            features: new() { [EntitlementKeys.FeatureTeleconsultation] = true },
            reason: "Expanded multi-facility license update",
            updatedBy: "SuperAdmin Operator"
        );

        var dto = await handler.Handle(command, CancellationToken.None);
        Assert.NotNull(dto);
        Assert.Equal(initialSubVersion + 1, dto.EntitlementVersion);

        // Reload facilities
        var reloadedMain = await _context.Facilities.FindAsync(mainClinic.Id);
        var reloadedBranch = await _context.Facilities.FindAsync(branchClinic.Id);
        var reloadedLab = await _context.Facilities.FindAsync(labFacility.Id);
        var reloadedSuspended = await _context.Facilities.FindAsync(suspendedClinic.Id);

        Assert.NotNull(reloadedMain);
        Assert.NotNull(reloadedBranch);
        Assert.NotNull(reloadedLab);
        Assert.NotNull(reloadedSuspended);

        // All 3 routable facilities received NEW tokens
        Assert.NotEqual(initialMainToken, reloadedMain.LicenseToken);
        Assert.NotEqual(initialBranchToken, reloadedBranch.LicenseToken);
        Assert.NotEqual(initialLabToken, reloadedLab.LicenseToken);

        // Suspended facility remains untouched
        Assert.Null(reloadedSuspended.LicenseToken);

        // Validate cryptographically signed ECDSA P-256 tokens for all 3 routable facilities
        var valMain = _licenseValidator.Validate(reloadedMain.LicenseToken, mainClinic.Id, tenant.Id.ToString());
        Assert.True(valMain.IsValid, $"Main clinic license invalid: {valMain.ErrorMessage}");
        Assert.Equal(dto.EntitlementVersion, valMain.Payload!.EntitlementVersion);
        Assert.Contains(FacilityFeatureKeys.Teleconsultation, valMain.Payload.EnabledFeatures);

        var valBranch = _licenseValidator.Validate(reloadedBranch.LicenseToken, branchClinic.Id, tenant.Id.ToString());
        Assert.True(valBranch.IsValid, $"Branch clinic license invalid: {valBranch.ErrorMessage}");
        Assert.Equal(dto.EntitlementVersion, valBranch.Payload!.EntitlementVersion);
        Assert.Contains(FacilityFeatureKeys.Teleconsultation, valBranch.Payload.EnabledFeatures);

        var valLab = _licenseValidator.Validate(reloadedLab.LicenseToken, labFacility.Id, tenant.Id.ToString());
        Assert.True(valLab.IsValid, $"Lab facility license invalid: {valLab.ErrorMessage}");
        Assert.Equal(dto.EntitlementVersion, valLab.Payload!.EntitlementVersion);
        Assert.Contains(FacilityFeatureKeys.Teleconsultation, valLab.Payload.EnabledFeatures);

        // Verify outbox messages enqueued:
        // 3 routable facilities * 3 services (own service + billing service + comms service) = 9 outbox events
        var outboxEvents = TestSupport.OutboxPayloads<EntitlementsChangedEvent>(_context, InteropTypes.EntitlementsChanged);
        Assert.Equal(9, outboxEvents.Count);

        Assert.Contains(outboxEvents, e => e.FacilityId == mainClinic.Id && e.EntitlementVersion == dto.EntitlementVersion);
        Assert.Contains(outboxEvents, e => e.FacilityId == branchClinic.Id && e.EntitlementVersion == dto.EntitlementVersion);
        Assert.Contains(outboxEvents, e => e.FacilityId == labFacility.Id && e.EntitlementVersion == dto.EntitlementVersion);
        Assert.DoesNotContain(outboxEvents, e => e.FacilityId == suspendedClinic.Id);
    }

    // =================================================================================================================
    // 4. SOFT-DELETED & INACTIVE OVERRIDES (IsDeleted = true)
    // =================================================================================================================

    [Fact]
    public async Task Override_DirectSoftDeletedRowInDb_DoesNotTakePrecedence()
    {
        var (tenant, _) = await SeedTenantWithPlanAsync("soft-deleted-row-tenant", "starter");

        // Starter baseline: limit.clinics = 3, feature.electronic_prescriptions = true, feature.teleconsultation = false
        var now = DateTime.UtcNow;

        // Directly inject soft-deleted override rows into DB
        _context.EntitlementOverrides.AddRange(
            new EntitlementOverride
            {
                TenantId = tenant.Id,
                Key = EntitlementKeys.LimitClinics,
                Kind = EntitlementKind.Limit,
                Limit = 999, // Should NOT take precedence!
                IsDeleted = true,
                DeletedAt = now,
                DeletedBy = "SuperAdmin"
            },
            new EntitlementOverride
            {
                TenantId = tenant.Id,
                Key = EntitlementKeys.FeatureElectronicPrescriptions,
                Kind = EntitlementKind.Feature,
                Enabled = false, // Disabling override, but deleted -> Should NOT take precedence!
                IsDeleted = true,
                DeletedAt = now,
                DeletedBy = "SuperAdmin"
            },
            new EntitlementOverride
            {
                TenantId = tenant.Id,
                Key = EntitlementKeys.FeatureTeleconsultation,
                Kind = EntitlementKind.Feature,
                Enabled = true, // Enabling override, but deleted -> Should NOT take precedence!
                IsDeleted = true,
                DeletedAt = now,
                DeletedBy = "SuperAdmin"
            }
        );
        await _context.SaveChangesAsync();

        // Verify ResolveAsync ignores soft-deleted rows!
        var snapshot = await _entitlements.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.Equal(3, snapshot.Limits[EntitlementKeys.LimitClinics]); // Remains starter baseline 3, NOT 999
        Assert.Contains(EntitlementKeys.FeatureElectronicPrescriptions, snapshot.Features); // Remains enabled from plan
        Assert.DoesNotContain(EntitlementKeys.FeatureTeleconsultation, snapshot.Features); // Remains disabled from plan

        // Verify GetTenantOverridesQuery ignores soft-deleted rows!
        var queryHandler = new GetTenantOverridesQueryHandler(_context, _entitlements);
        var dto = await queryHandler.Handle(new GetTenantOverridesQuery(tenant.Id), CancellationToken.None);

        Assert.NotNull(dto);
        Assert.Empty(dto.Limits);
        Assert.Empty(dto.Features);
        Assert.NotNull(dto.EffectiveLimits);
        Assert.Equal(3, dto.EffectiveLimits![EntitlementKeys.LimitClinics]);
    }

    [Fact]
    public async Task Override_OmissionInPayload_SoftDeletesAndRestoresBaseline()
    {
        var (tenant, _) = await SeedTenantWithPlanAsync("omission-tenant", "starter");
        var handler = CreateHandler();

        // 1. Establish 3 overrides: 2 limits and 1 feature
        await handler.Handle(new UpdateTenantOverridesCommand(
            tenant.Id,
            limits: new()
            {
                [EntitlementKeys.LimitClinics] = 20,
                [EntitlementKeys.PoolStaff] = 75
            },
            features: new()
            {
                [EntitlementKeys.FeatureOnPrem] = true
            },
            reason: "Initial multi-override batch"
        ), CancellationToken.None);

        var snap1 = await _entitlements.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.Equal(20, snap1.Limits[EntitlementKeys.LimitClinics]);
        Assert.Equal(75, snap1.Limits[EntitlementKeys.PoolStaff]);
        Assert.Contains(EntitlementKeys.FeatureOnPrem, snap1.Features);

        // 2. Submit update omitting pool.staff and feature.on_prem, retaining only limit.clinics
        var dto2 = await handler.Handle(new UpdateTenantOverridesCommand(
            tenant.Id,
            limits: new() { [EntitlementKeys.LimitClinics] = 20 },
            features: new(),
            reason: "Removed staff and on-prem overrides"
        ), CancellationToken.None);

        Assert.NotNull(dto2);
        Assert.Single(dto2.Limits);
        Assert.Equal(20, dto2.Limits[EntitlementKeys.LimitClinics]);
        Assert.Empty(dto2.Features);

        // Check DB rows directly with IgnoreQueryFilters
        var allRows = await _context.EntitlementOverrides
            .IgnoreQueryFilters()
            .Where(o => o.TenantId == tenant.Id)
            .ToListAsync();

        var staffRow = allRows.FirstOrDefault(o => o.Key == EntitlementKeys.PoolStaff);
        Assert.NotNull(staffRow);
        Assert.True(staffRow.IsDeleted);

        var onPremRow = allRows.FirstOrDefault(o => o.Key == EntitlementKeys.FeatureOnPrem);
        Assert.NotNull(onPremRow);
        Assert.True(onPremRow.IsDeleted);

        var clinicRow = allRows.FirstOrDefault(o => o.Key == EntitlementKeys.LimitClinics);
        Assert.NotNull(clinicRow);
        Assert.False(clinicRow.IsDeleted);

        // Check ResolveAsync: pool.staff restored to starter baseline (10), on_prem removed
        var snap2 = await _entitlements.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.Equal(20, snap2.Limits[EntitlementKeys.LimitClinics]);
        Assert.Equal(10, snap2.Limits[EntitlementKeys.PoolStaff]); // Baseline starter
        Assert.DoesNotContain(EntitlementKeys.FeatureOnPrem, snap2.Features);
    }

    [Fact]
    public async Task Override_ReviveSoftDeletedOverride_RestoresAndUpdatesValuesCleanly()
    {
        var (tenant, _) = await SeedTenantWithPlanAsync("revive-test-tenant", "starter");
        var handler = CreateHandler();

        // 1. Create override
        await handler.Handle(new UpdateTenantOverridesCommand(
            tenant.Id,
            limits: new() { [EntitlementKeys.LimitClinics] = 10 },
            features: new()
        ), CancellationToken.None);

        // 2. Soft-delete by omitting
        await handler.Handle(new UpdateTenantOverridesCommand(
            tenant.Id,
            limits: new(),
            features: new()
        ), CancellationToken.None);

        var snapOmitted = await _entitlements.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.Equal(3, snapOmitted.Limits[EntitlementKeys.LimitClinics]);

        // 3. Revive with new value
        var dto = await handler.Handle(new UpdateTenantOverridesCommand(
            tenant.Id,
            limits: new() { [EntitlementKeys.LimitClinics] = 35 },
            features: new()
        ), CancellationToken.None);

        Assert.NotNull(dto);
        Assert.Equal(35, dto.Limits[EntitlementKeys.LimitClinics]);

        var activeRows = await _context.EntitlementOverrides
            .Where(o => o.TenantId == tenant.Id && o.Key == EntitlementKeys.LimitClinics)
            .ToListAsync();
        Assert.Single(activeRows);
        Assert.False(activeRows[0].IsDeleted);
        Assert.Equal(35, activeRows[0].Limit);

        var snapRevived = await _entitlements.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.Equal(35, snapRevived.Limits[EntitlementKeys.LimitClinics]);
    }

    // =================================================================================================================
    // 5. STRESS & INVARIANTS: CONSECUTIVE UPDATES & VERSION MONOTONICITY
    // =================================================================================================================

    [Fact]
    public async Task Override_ConsecutiveUpdates_MonotonicallyIncrementsVersionAndIssuesFreshTokens()
    {
        var (tenant, sub) = await SeedTenantWithPlanAsync("consecutive-tenant", "starter");

        var facility = new Facility
        {
            Id = Guid.NewGuid(),
            TenantId = tenant.Id,
            FacilityType = FacilityType.Clinic,
            Name = "Consecutive Clinic",
            Slug = "consecutive-clinic",
            Status = FacilityStatus.Active
        };
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();

        var handler = CreateHandler();
        int expectedVersion = sub.EntitlementVersion;

        for (int step = 1; step <= 5; step++)
        {
            expectedVersion++;
            var dto = await handler.Handle(new UpdateTenantOverridesCommand(
                tenant.Id,
                limits: new() { [EntitlementKeys.LimitClinics] = step * 10 },
                features: new(),
                reason: $"Consecutive update step {step}"
            ), CancellationToken.None);

            Assert.NotNull(dto);
            Assert.Equal(expectedVersion, dto.EntitlementVersion);

            var reloadedFacility = await _context.Facilities.FindAsync(facility.Id);
            Assert.NotNull(reloadedFacility);

            var val = _licenseValidator.Validate(reloadedFacility.LicenseToken, facility.Id, tenant.Id.ToString());
            Assert.True(val.IsValid);
            Assert.Equal(expectedVersion, val.Payload!.EntitlementVersion);
        }
    }

    // =================================================================================================================
    // 6. VALIDATION & NULL RESILIENCE (UpdateTenantOverridesCommandValidator)
    // =================================================================================================================

    [Fact]
    public void Validator_NullLimitsAndNullFeatures_PassesValidation()
    {
        var command = new UpdateTenantOverridesCommand(Guid.NewGuid(), limits: null, features: null);
        var result = _validator.TestValidate(command);
        result.ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void Validator_EmptyTenantId_FailsValidation()
    {
        var command = new UpdateTenantOverridesCommand(Guid.Empty, limits: new(), features: new());
        var result = _validator.TestValidate(command);
        result.ShouldHaveValidationErrorFor(x => x.TenantId);
    }

    [Fact]
    public void Validator_UnknownLimitOrFeatureKey_FailsValidation()
    {
        var command = new UpdateTenantOverridesCommand(
            Guid.NewGuid(),
            limits: new() { ["limit.unknown_custom"] = 10 },
            features: new() { ["feature.unknown_cap"] = true }
        );
        var result = _validator.TestValidate(command);
        result.ShouldHaveValidationErrorFor(x => x.Limits);
        result.ShouldHaveValidationErrorFor(x => x.Features);
    }

    [Fact]
    public void Validator_NegativeLimitBelowMinusOne_FailsValidation()
    {
        var command = new UpdateTenantOverridesCommand(
            Guid.NewGuid(),
            limits: new() { [EntitlementKeys.LimitClinics] = -2 },
            features: new()
        );
        var result = _validator.TestValidate(command);
        result.ShouldHaveValidationErrorFor(x => x.Limits);
    }

    [Fact]
    public async Task Handler_NullLimitsAndFeaturesInPayload_ClearsOverridesWithoutNullReferenceException()
    {
        var (tenant, _) = await SeedTenantWithPlanAsync("null-payload-tenant", "starter");
        var handler = CreateHandler();

        // 1. Establish overrides
        await handler.Handle(new UpdateTenantOverridesCommand(
            tenant.Id,
            limits: new() { [EntitlementKeys.LimitClinics] = 10 },
            features: new() { [EntitlementKeys.FeatureOnPrem] = true }
        ), CancellationToken.None);

        // 2. Submit command with null limits and null features
        var dto = await handler.Handle(new UpdateTenantOverridesCommand(tenant.Id, limits: null, features: null), CancellationToken.None);
        Assert.NotNull(dto);
        Assert.Empty(dto.Limits);
        Assert.Empty(dto.Features);

        var snap = await _entitlements.ResolveAsync(tenant.Id, CancellationToken.None);
        Assert.Equal(3, snap.Limits[EntitlementKeys.LimitClinics]); // Restored starter baseline
        Assert.DoesNotContain(EntitlementKeys.FeatureOnPrem, snap.Features);
    }
}
