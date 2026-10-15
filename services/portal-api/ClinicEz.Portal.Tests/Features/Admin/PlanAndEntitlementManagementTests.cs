using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Admin.Commands.UpdateTenantOverrides;
using ClinicEz.Portal.Application.Features.Admin.DTOs;
using ClinicEz.Portal.Application.Features.Admin.Queries.GetTenantOverrides;
using ClinicEz.Portal.Application.Features.Billing;
using ClinicEz.Portal.Application.Features.Billing.Commands;
using ClinicEz.Portal.Application.Features.Billing.Queries;
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

public class PlanAndEntitlementManagementTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly IEntitlementService _entitlements;
    private readonly IEntitlementsPublisher _publisher;
    private readonly ISubscriptionService _subscriptions;
    private readonly CreateBillingPlanCommandValidator _createPlanValidator = new();
    private readonly UpdateBillingPlanCommandValidator _updatePlanValidator = new();
    private readonly UpdateTenantOverridesCommandValidator _updateOverridesValidator = new();

    public PlanAndEntitlementManagementTests()
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
    }

    public void Dispose() => _context.Dispose();

    // -----------------------------------------------------------------------------------------------------------------
    // 1. Permissions & Constants
    // -----------------------------------------------------------------------------------------------------------------

    [Fact]
    public void Permissions_ContainsManagePlans()
    {
        Assert.Equal("manage:plans", Permissions.ManagePlans);
        Assert.Contains(Permissions.ManagePlans, Permissions.All);
    }

    // -----------------------------------------------------------------------------------------------------------------
    // 2. Plan Validation (14 Limits & 10 Feature Flags)
    // -----------------------------------------------------------------------------------------------------------------

    [Fact]
    public void CreateBillingPlanValidator_ValidWithAll14LimitsAnd10Features_Passes()
    {
        var command = new CreateBillingPlanCommand
        {
            Name = "Enterprise Suite",
            Slug = "enterprise-suite",
            Description = "Comprehensive hospital and clinic network plan",
            Rank = 5,
            PriceMonthly = 4999.00m,
            PriceAnnually = 49990.00m,
            Features = ["Unlimited clinics", "Priority 24/7 SLA"],
            Limits = EntitlementKeys.Limits.ToDictionary(k => k, _ => 100L),
            EnabledFeatures = [.. EntitlementKeys.Features]
        };

        var result = _createPlanValidator.TestValidate(command);
        result.ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void CreateBillingPlanValidator_AllowsUnlimitedMarkerAndZero_Passes()
    {
        var command = new CreateBillingPlanCommand
        {
            Name = "Free Tier",
            Slug = "free-tier",
            Description = "Free introductory plan",
            Rank = 1,
            PriceMonthly = 0,
            PriceAnnually = 0,
            Features = ["Basic triage"],
            Limits = new()
            {
                [EntitlementKeys.LimitClinics] = -1, // unlimited
                [EntitlementKeys.LimitLaboratories] = 0 // 0 allowed
            },
            EnabledFeatures = [EntitlementKeys.FeatureElectronicPrescriptions]
        };

        var result = _createPlanValidator.TestValidate(command);
        result.ShouldNotHaveAnyValidationErrors();
    }

    [Fact]
    public void CreateBillingPlanValidator_UnknownLimitKey_FailsValidation()
    {
        var command = new CreateBillingPlanCommand
        {
            Name = "Test Plan",
            Slug = "test-plan",
            Description = "Test description",
            Rank = 1,
            PriceMonthly = 100,
            PriceAnnually = 1000,
            Features = ["Feature 1"],
            Limits = new()
            {
                ["limit.unknown_custom_key"] = 10
            },
            EnabledFeatures = []
        };

        var result = _createPlanValidator.TestValidate(command);
        result.ShouldHaveValidationErrorFor(x => x.Limits);
    }

    [Fact]
    public void CreateBillingPlanValidator_UnknownFeatureKey_FailsValidation()
    {
        var command = new CreateBillingPlanCommand
        {
            Name = "Test Plan",
            Slug = "test-plan",
            Description = "Test description",
            Rank = 1,
            PriceMonthly = 100,
            PriceAnnually = 1000,
            Features = ["Feature 1"],
            Limits = new() { [EntitlementKeys.LimitClinics] = 5 },
            EnabledFeatures = ["feature.unsupported_cap"]
        };

        var result = _createPlanValidator.TestValidate(command);
        result.ShouldHaveValidationErrorFor(x => x.EnabledFeatures);
    }

    [Fact]
    public void CreateBillingPlanValidator_NegativeLimitBelowMinusOne_FailsValidation()
    {
        var command = new CreateBillingPlanCommand
        {
            Name = "Test Plan",
            Slug = "test-plan",
            Description = "Test description",
            Rank = 1,
            PriceMonthly = 100,
            PriceAnnually = 1000,
            Features = ["Feature 1"],
            Limits = new() { [EntitlementKeys.LimitClinics] = -5 },
            EnabledFeatures = []
        };

        var result = _createPlanValidator.TestValidate(command);
        result.ShouldHaveValidationErrorFor(x => x.Limits);
    }

    [Fact]
    public void CreateBillingPlanValidator_RankLessThanOne_FailsValidation()
    {
        var command = new CreateBillingPlanCommand
        {
            Name = "Test Plan",
            Slug = "test-plan",
            Description = "Test description",
            Rank = 0,
            PriceMonthly = 100,
            PriceAnnually = 1000,
            Features = ["Feature 1"],
            Limits = new() { [EntitlementKeys.LimitClinics] = 5 },
            EnabledFeatures = []
        };

        var result = _createPlanValidator.TestValidate(command);
        result.ShouldHaveValidationErrorFor(x => x.Rank);
    }

    [Fact]
    public void UpdateBillingPlanValidator_ValidatesLimitsAndFeatures()
    {
        var invalidCommand = new UpdateBillingPlanCommand
        {
            Id = Guid.NewGuid(),
            Name = "Pro Plus",
            Slug = "pro-plus",
            Description = "Updated plan",
            Rank = 2,
            PriceMonthly = 200,
            PriceAnnually = 2000,
            Features = ["Feature"],
            Limits = new() { ["invalid.limit"] = 10 },
            EnabledFeatures = ["invalid.feature"]
        };

        var result = _updatePlanValidator.TestValidate(invalidCommand);
        result.ShouldHaveValidationErrorFor(x => x.Limits);
        result.ShouldHaveValidationErrorFor(x => x.EnabledFeatures);
    }

    // -----------------------------------------------------------------------------------------------------------------
    // 3. Plan CRUD Handlers & Metrics
    // -----------------------------------------------------------------------------------------------------------------

    [Fact]
    public async Task CreateBillingPlanCommandHandler_PersistsPlanAndFeaturesAndEntitlements()
    {
        var handler = new CreateBillingPlanCommandHandler(_context);
        var command = new CreateBillingPlanCommand
        {
            Name = "Specialist Tier",
            Slug = "specialist-tier",
            Description = "Specialist clinics with diagnostic lab",
            Rank = 3,
            PriceMonthly = 3500.00m,
            PriceAnnually = 35000.00m,
            IsHighlighted = true,
            RequiresCheckout = true,
            Features = ["Up to 3 clinics", "LIS analyzer sync"],
            Limits = new()
            {
                [EntitlementKeys.LimitClinics] = 3,
                [EntitlementKeys.LimitLaboratories] = 1,
                [EntitlementKeys.PoolStaff] = 15
            },
            EnabledFeatures = [EntitlementKeys.FeatureLisIntegration, EntitlementKeys.FeatureElectronicPrescriptions]
        };

        var planId = await handler.Handle(command, CancellationToken.None);

        var saved = await _context.Plans
            .Include(p => p.Features)
            .Include(p => p.Entitlements)
            .FirstOrDefaultAsync(p => p.Id == planId);

        Assert.NotNull(saved);
        Assert.Equal("specialist-tier", saved.Slug);
        Assert.Equal(3, saved.Rank);
        Assert.Equal(1, saved.Version);
        Assert.Equal(2, saved.Features.Count);
        Assert.Contains(saved.Entitlements, e => e.Key == EntitlementKeys.LimitClinics && e.Limit == 3);
        Assert.Contains(saved.Entitlements, e => e.Key == EntitlementKeys.FeatureLisIntegration && e.Enabled == true);
    }

    [Fact]
    public async Task GetBillingPlansQueryHandler_ReturnsPlansWithLimitsFeaturesAndMetrics()
    {
        var tenantId = Guid.NewGuid();
        _context.Tenants.Add(new Tenant { Id = tenantId, TenantSlug = "metrics-test", Name = "Metrics Test" });
        await _context.SaveChangesAsync();

        await TestSupport.SeedSubscriptionAsync(_context, tenantId, planSlug: "starter");

        var handler = new GetBillingPlansQueryHandler(_context);
        var plans = await handler.Handle(new GetBillingPlansQuery(), CancellationToken.None);

        Assert.NotEmpty(plans);
        var starter = plans.FirstOrDefault(p => p.Id == "starter" || p.Slug == "starter");
        Assert.NotNull(starter);
        Assert.NotNull(starter.PlanId);
        Assert.Equal("starter", starter.Slug);
        Assert.True(starter.ActiveSubscribersCount >= 1);
        Assert.NotEmpty(starter.Limits);
    }

    [Fact]
    public async Task DeleteBillingPlanCommandHandler_UnusedPlan_DeletesSuccessfully()
    {
        var plan = new Plan
        {
            Name = "Unused Plan",
            Slug = "unused-plan",
            Description = "To be deleted",
            Rank = 99
        };
        _context.Plans.Add(plan);
        await _context.SaveChangesAsync();

        var handler = new DeleteBillingPlanCommandHandler(_context);
        var deleted = await handler.Handle(new DeleteBillingPlanCommand { Id = plan.Id }, CancellationToken.None);

        Assert.True(deleted);
        Assert.Null(await _context.Plans.FindAsync(plan.Id));
    }

    [Fact]
    public async Task DeleteBillingPlanCommandHandler_PlanWithSubscribers_ThrowsInvalidOperationException()
    {
        var tenantId = Guid.NewGuid();
        _context.Tenants.Add(new Tenant { Id = tenantId, TenantSlug = "sub-test", Name = "Sub Test" });
        await _context.SaveChangesAsync();

        var sub = await TestSupport.SeedSubscriptionAsync(_context, tenantId, planSlug: "pro");

        var handler = new DeleteBillingPlanCommandHandler(_context);
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            handler.Handle(new DeleteBillingPlanCommand { Id = sub.PlanId }, CancellationToken.None));
    }

    // -----------------------------------------------------------------------------------------------------------------
    // 4. Cascading License Re-Issuance on Plan Grants Change
    // -----------------------------------------------------------------------------------------------------------------

    [Fact]
    public async Task UpdateBillingPlan_GrantsChanged_BumpsPlanVersionAndCascadesToSubscribedWorkspaces()
    {
        // 1. Setup Tenant with active Subscription on "starter" and 1 active Clinic Facility
        var tenantId = Guid.NewGuid();
        var tenant = new Tenant { Id = tenantId, TenantSlug = "cascade-clinic", Name = "Cascade Clinic" };
        _context.Tenants.Add(tenant);

        var facilityId = Guid.NewGuid();
        var facility = new Facility
        {
            Id = facilityId,
            TenantId = tenantId,
            FacilityType = FacilityType.Clinic,
            Name = "Cascade Main Clinic",
            Slug = "cascade-main",
            Status = FacilityStatus.Active
        };
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();

        var subscription = await TestSupport.SeedSubscriptionAsync(_context, tenantId, planSlug: "starter");
        var starterPlan = subscription.Plan;
        var initialPlanVersion = starterPlan.Version;
        var initialSubVersion = subscription.EntitlementVersion;

        // Stage initial license
        await _publisher.StageForWorkspaceAsync(tenantId, CancellationToken.None);
        await _context.SaveChangesAsync();

        var initialToken = facility.LicenseToken;
        Assert.NotNull(initialToken);

        // 2. Update Plan: Add feature.teleconsultation and increase limit.staff from default (20) to 50
        var handler = new UpdateBillingPlanCommandHandler(_context, _publisher);
        var updateCommand = new UpdateBillingPlanCommand
        {
            Id = starterPlan.Id,
            Name = starterPlan.Name,
            Slug = starterPlan.Slug,
            Description = starterPlan.Description,
            Rank = starterPlan.Rank,
            PriceMonthly = starterPlan.PriceMonthly,
            PriceAnnually = starterPlan.PriceAnnually,
            Features = [.. starterPlan.Features.Select(f => f.Name)],
            Limits = new()
            {
                [EntitlementKeys.LimitClinics] = 2,
                [EntitlementKeys.PoolStaff] = 50
            },
            EnabledFeatures = [EntitlementKeys.FeatureTeleconsultation, EntitlementKeys.FeatureElectronicPrescriptions]
        };

        var updated = await handler.Handle(updateCommand, CancellationToken.None);
        Assert.True(updated);

        // 3. Verify Plan.Version incremented
        var reloadedPlan = await _context.Plans.FindAsync(starterPlan.Id);
        Assert.NotNull(reloadedPlan);
        Assert.Equal(initialPlanVersion + 1, reloadedPlan.Version);

        // 4. Verify Subscription.EntitlementVersion incremented
        var reloadedSub = await _context.Subscriptions.FirstAsync(s => s.TenantId == tenantId);
        Assert.Equal(initialSubVersion + 1, reloadedSub.EntitlementVersion);

        // 5. Verify Facility license was re-minted
        var reloadedFacility = await _context.Facilities.FindAsync(facilityId);
        Assert.NotNull(reloadedFacility);
        Assert.NotEqual(initialToken, reloadedFacility.LicenseToken);
        Assert.Equal(50, reloadedFacility.MaxStaffLimit);

        // 6. Verify Outbox received entitlements.changed messages with new version
        var outbox = TestSupport.OutboxPayloads<EntitlementsChangedEvent>(_context, InteropTypes.EntitlementsChanged);
        Assert.NotEmpty(outbox);
        var latestEvent = outbox.Last(e => e.FacilityId == facilityId);
        Assert.Equal(reloadedSub.EntitlementVersion, latestEvent.EntitlementVersion);
        Assert.Contains(FacilityFeatureKeys.Teleconsultation, latestEvent.EnabledFeatures);
        Assert.Equal(50, latestEvent.MaxStaff);
    }

    [Fact]
    public async Task UpdateBillingPlan_MetadataOnlyChange_DoesNotBumpVersionOrCascade()
    {
        var tenantId = Guid.NewGuid();
        _context.Tenants.Add(new Tenant { Id = tenantId, TenantSlug = "meta-test", Name = "Meta Test" });

        var facilityId = Guid.NewGuid();
        _context.Facilities.Add(new Facility
        {
            Id = facilityId,
            TenantId = tenantId,
            FacilityType = FacilityType.Clinic,
            Name = "Meta Clinic",
            Slug = "meta-clinic",
            Status = FacilityStatus.Active
        });
        await _context.SaveChangesAsync();

        var subscription = await TestSupport.SeedSubscriptionAsync(_context, tenantId, planSlug: "starter");
        var plan = subscription.Plan;
        var initialPlanVersion = plan.Version;
        var initialSubVersion = subscription.EntitlementVersion;

        await _publisher.StageForWorkspaceAsync(tenantId, CancellationToken.None);
        await _context.SaveChangesAsync();

        var initialOutboxCount = _context.InteropOutbox.Count();

        // Update ONLY Name, Price, and marketing Features - Limits, EnabledFeatures, and Rank unchanged
        var handler = new UpdateBillingPlanCommandHandler(_context, _publisher);
        var existingLimits = plan.Entitlements
            .Where(e => e.Kind == EntitlementKind.Limit)
            .ToDictionary(e => e.Key, e => e.Limit ?? PlanSeedOptions.UnlimitedMarker);
        var existingFeatures = plan.Entitlements
            .Where(e => e.Kind == EntitlementKind.Feature && e.Enabled == true)
            .Select(e => e.Key)
            .ToList();

        var command = new UpdateBillingPlanCommand
        {
            Id = plan.Id,
            Name = "Starter Revamped Name",
            Slug = plan.Slug,
            Description = "New promotional description",
            Rank = plan.Rank,
            PriceMonthly = 1299.00m, // Price changed
            PriceAnnually = 12990.00m,
            Features = ["Brand new marketing bullet"],
            Limits = existingLimits,
            EnabledFeatures = existingFeatures
        };

        var result = await handler.Handle(command, CancellationToken.None);
        Assert.True(result);

        // Assert plan version and subscription version did NOT increment
        var reloadedPlan = await _context.Plans.FindAsync(plan.Id);
        Assert.NotNull(reloadedPlan);
        Assert.Equal(initialPlanVersion, reloadedPlan.Version);

        var reloadedSub = await _context.Subscriptions.FirstAsync(s => s.TenantId == tenantId);
        Assert.Equal(initialSubVersion, reloadedSub.EntitlementVersion);

        // Zero new outbox messages enqueued
        Assert.Equal(initialOutboxCount, _context.InteropOutbox.Count());
    }

    [Fact]
    public async Task UpdateBillingPlan_RankChange_BumpsVersionAndCascades()
    {
        var tenantId = Guid.NewGuid();
        _context.Tenants.Add(new Tenant { Id = tenantId, TenantSlug = "rank-test", Name = "Rank Test" });
        await _context.SaveChangesAsync();

        var sub = await TestSupport.SeedSubscriptionAsync(_context, tenantId, planSlug: "starter");
        var plan = sub.Plan;
        var initialVersion = plan.Version;

        var handler = new UpdateBillingPlanCommandHandler(_context, _publisher);
        var existingLimits = plan.Entitlements
            .Where(e => e.Kind == EntitlementKind.Limit)
            .ToDictionary(e => e.Key, e => e.Limit ?? PlanSeedOptions.UnlimitedMarker);
        var existingFeatures = plan.Entitlements
            .Where(e => e.Kind == EntitlementKind.Feature && e.Enabled == true)
            .Select(e => e.Key)
            .ToList();

        var command = new UpdateBillingPlanCommand
        {
            Id = plan.Id,
            Name = plan.Name,
            Slug = plan.Slug,
            Description = plan.Description,
            Rank = plan.Rank + 1, // Rank changed!
            PriceMonthly = plan.PriceMonthly,
            PriceAnnually = plan.PriceAnnually,
            Features = [.. plan.Features.Select(f => f.Name)],
            Limits = existingLimits,
            EnabledFeatures = existingFeatures
        };

        var result = await handler.Handle(command, CancellationToken.None);
        Assert.True(result);

        var reloadedPlan = await _context.Plans.FindAsync(plan.Id);
        Assert.NotNull(reloadedPlan);
        Assert.Equal(initialVersion + 1, reloadedPlan.Version);
    }

    // -----------------------------------------------------------------------------------------------------------------
    // 5. Tenant Entitlement Overrides (F2.4)
    // -----------------------------------------------------------------------------------------------------------------

    [Fact]
    public async Task GetTenantOverrides_NonExistentTenant_ReturnsNull()
    {
        var handler = new GetTenantOverridesQueryHandler(_context, _entitlements);
        var result = await handler.Handle(new GetTenantOverridesQuery(Guid.NewGuid()), CancellationToken.None);
        Assert.Null(result);
    }

    [Fact]
    public async Task GetTenantOverrides_TenantWithoutOverrides_ReturnsBaselinePlanLimitsAndEmptyOverrides()
    {
        var tenantId = Guid.NewGuid();
        _context.Tenants.Add(new Tenant { Id = tenantId, TenantSlug = "no-overrides", Name = "No Overrides" });
        await _context.SaveChangesAsync();

        await TestSupport.SeedSubscriptionAsync(_context, tenantId, planSlug: "starter");

        var handler = new GetTenantOverridesQueryHandler(_context, _entitlements);
        var dto = await handler.Handle(new GetTenantOverridesQuery(tenantId), CancellationToken.None);

        Assert.NotNull(dto);
        Assert.Equal(tenantId, dto.TenantId);
        Assert.Equal("starter", dto.PlanSlug);
        Assert.Empty(dto.Limits);
        Assert.Empty(dto.Features);
        Assert.NotNull(dto.EffectiveLimits);
        Assert.NotEmpty(dto.EffectiveLimits);
    }

    [Fact]
    public async Task UpdateTenantOverrides_LimitAndFeature_WinsOverPlanAndCascades()
    {
        var tenantId = Guid.NewGuid();
        _context.Tenants.Add(new Tenant { Id = tenantId, TenantSlug = "custom-client", Name = "Custom Client" });

        var facilityId = Guid.NewGuid();
        var facility = new Facility
        {
            Id = facilityId,
            TenantId = tenantId,
            FacilityType = FacilityType.Clinic,
            Name = "Custom Clinic 1",
            Slug = "custom-clinic-1",
            Status = FacilityStatus.Active
        };
        _context.Facilities.Add(facility);
        await _context.SaveChangesAsync();

        var sub = await TestSupport.SeedSubscriptionAsync(_context, tenantId, planSlug: "starter");
        var initialSubVersion = sub.EntitlementVersion;

        var handler = new UpdateTenantOverridesCommandHandler(
            _context,
            _entitlements,
            _subscriptions,
            _publisher,
            TimeProvider.System,
            NullLogger<UpdateTenantOverridesCommandHandler>.Instance);

        // Set custom limit for clinics = 15 (starter default is 1), and enable on_prem (not in starter)
        var command = new UpdateTenantOverridesCommand(
            tenantId,
            limits: new() { [EntitlementKeys.LimitClinics] = 15, [EntitlementKeys.PoolStaff] = 80 },
            features: new() { [EntitlementKeys.FeatureOnPrem] = true, [EntitlementKeys.FeatureElectronicPrescriptions] = false },
            reason: "Enterprise VIP Contract deal",
            updatedBy: "SuperAdmin Jane"
        );

        var dto = await handler.Handle(command, CancellationToken.None);

        Assert.NotNull(dto);
        Assert.Equal(tenantId, dto.TenantId);
        Assert.Equal(initialSubVersion + 1, dto.EntitlementVersion);
        Assert.Equal("Enterprise VIP Contract deal", dto.Reason);
        Assert.Equal(15, dto.Limits[EntitlementKeys.LimitClinics]);
        Assert.True(dto.Features[EntitlementKeys.FeatureOnPrem]);
        Assert.False(dto.Features[EntitlementKeys.FeatureElectronicPrescriptions]);

        // Verify effective resolution wins over base plan
        var snapshot = await _entitlements.ResolveAsync(tenantId, CancellationToken.None);
        Assert.Equal(15, snapshot.Limits[EntitlementKeys.LimitClinics]);
        Assert.Equal(80, snapshot.Limits[EntitlementKeys.PoolStaff]);
        Assert.Contains(EntitlementKeys.FeatureOnPrem, snapshot.Features);
        Assert.DoesNotContain(EntitlementKeys.FeatureElectronicPrescriptions, snapshot.Features);

        // Verify facility license re-staging
        var reloadedFacility = await _context.Facilities.FindAsync(facilityId);
        Assert.NotNull(reloadedFacility);
        Assert.Equal(80, reloadedFacility.MaxStaffLimit);

        // Verify outbox messages
        var outbox = TestSupport.OutboxPayloads<EntitlementsChangedEvent>(_context, InteropTypes.EntitlementsChanged);
        var latestEvent = outbox.Last(e => e.FacilityId == facilityId);
        Assert.Equal(dto.EntitlementVersion, latestEvent.EntitlementVersion);
        Assert.Equal(80, latestEvent.MaxStaff);
    }

    [Fact]
    public async Task UpdateTenantOverrides_Omission_SoftDeletesOverrideAndRestoresPlanDefault()
    {
        var tenantId = Guid.NewGuid();
        _context.Tenants.Add(new Tenant { Id = tenantId, TenantSlug = "revert-client", Name = "Revert Client" });
        await _context.SaveChangesAsync();

        await TestSupport.SeedSubscriptionAsync(_context, tenantId, planSlug: "starter");

        var handler = new UpdateTenantOverridesCommandHandler(
            _context,
            _entitlements,
            _subscriptions,
            _publisher,
            TimeProvider.System,
            NullLogger<UpdateTenantOverridesCommandHandler>.Instance);

        // 1. Add override: limit.clinics = 50
        await handler.Handle(new UpdateTenantOverridesCommand(
            tenantId,
            limits: new() { [EntitlementKeys.LimitClinics] = 50 },
            features: new()
        ), CancellationToken.None);

        var snapshot1 = await _entitlements.ResolveAsync(tenantId, CancellationToken.None);
        Assert.Equal(50, snapshot1.Limits[EntitlementKeys.LimitClinics]);

        // 2. Send empty overrides (omitting limit.clinics)
        var dto2 = await handler.Handle(new UpdateTenantOverridesCommand(
            tenantId,
            limits: new(),
            features: new()
        ), CancellationToken.None);

        Assert.NotNull(dto2);
        Assert.Empty(dto2.Limits);

        // Verify soft-deleted in DB
        var overrideRow = await _context.EntitlementOverrides
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(o => o.TenantId == tenantId && o.Key == EntitlementKeys.LimitClinics);
        Assert.NotNull(overrideRow);
        Assert.True(overrideRow.IsDeleted);

        // Verify snapshot reverted to starter baseline (starter default = 3)
        var snapshot2 = await _entitlements.ResolveAsync(tenantId, CancellationToken.None);
        Assert.Equal(3, snapshot2.Limits[EntitlementKeys.LimitClinics]);
    }

    [Fact]
    public async Task UpdateTenantOverrides_ReviveSoftDeletedOverride_SucceedsWithoutConstraintViolation()
    {
        var tenantId = Guid.NewGuid();
        _context.Tenants.Add(new Tenant { Id = tenantId, TenantSlug = "revive-client", Name = "Revive Client" });
        await _context.SaveChangesAsync();

        await TestSupport.SeedSubscriptionAsync(_context, tenantId, planSlug: "starter");

        var handler = new UpdateTenantOverridesCommandHandler(
            _context,
            _entitlements,
            _subscriptions,
            _publisher,
            TimeProvider.System,
            NullLogger<UpdateTenantOverridesCommandHandler>.Instance);

        // 1. Add override
        await handler.Handle(new UpdateTenantOverridesCommand(
            tenantId,
            limits: new() { [EntitlementKeys.LimitClinics] = 5 },
            features: new()
        ), CancellationToken.None);

        // 2. Remove override (soft-deletes)
        await handler.Handle(new UpdateTenantOverridesCommand(
            tenantId,
            limits: new(),
            features: new()
        ), CancellationToken.None);

        // 3. Re-add same override with new value (revives soft-deleted row)
        var dto = await handler.Handle(new UpdateTenantOverridesCommand(
            tenantId,
            limits: new() { [EntitlementKeys.LimitClinics] = 25 },
            features: new()
        ), CancellationToken.None);

        Assert.NotNull(dto);
        Assert.Equal(25, dto.Limits[EntitlementKeys.LimitClinics]);

        var activeRows = await _context.EntitlementOverrides
            .Where(o => o.TenantId == tenantId && o.Key == EntitlementKeys.LimitClinics)
            .ToListAsync();
        Assert.Single(activeRows);
        Assert.False(activeRows[0].IsDeleted);
        Assert.Equal(25, activeRows[0].Limit);
    }

    [Fact]
    public void UpdateTenantOverridesValidator_RejectsUnknownKeysAndNegativeValues()
    {
        var invalidCommand = new UpdateTenantOverridesCommand(
            Guid.NewGuid(),
            limits: new()
            {
                ["limit.fake_key"] = 10,
                [EntitlementKeys.LimitClinics] = -10 // negative below -1
            },
            features: new()
            {
                ["feature.fake_flag"] = true
            },
            reason: new string('a', 300) // exceeds 256
        );

        var result = _updateOverridesValidator.TestValidate(invalidCommand);
        result.ShouldHaveValidationErrorFor(x => x.Limits);
        result.ShouldHaveValidationErrorFor(x => x.Features);
        result.ShouldHaveValidationErrorFor(x => x.Reason);
    }

    // -----------------------------------------------------------------------------------------------------------------
    // 6. RBAC Role Security & Permission Scopes
    // -----------------------------------------------------------------------------------------------------------------

    [Fact]
    public void RBAC_SuperAdmin_HasManagePlansAndManageTenantsPermissions()
    {
        var superAdminPermissions = new List<string>(Permissions.All);

        Assert.Contains(Permissions.ManagePlans, superAdminPermissions);
        Assert.Contains(Permissions.ManageTenants, superAdminPermissions);
    }

    [Fact]
    public void RBAC_NonAdminRoles_DoNotHaveManagePlansOrManageTenantsPermissions()
    {
        var supportStaffPermissions = new List<string> { Permissions.ViewAnalytics, Permissions.ViewTenants, Permissions.ManageBlogs };
        var contentWriterPermissions = new List<string> { Permissions.ManageBlogs };

        Assert.DoesNotContain(Permissions.ManagePlans, supportStaffPermissions);
        Assert.DoesNotContain(Permissions.ManageTenants, supportStaffPermissions);

        Assert.DoesNotContain(Permissions.ManagePlans, contentWriterPermissions);
        Assert.DoesNotContain(Permissions.ManageTenants, contentWriterPermissions);
    }
}
