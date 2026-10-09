using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Portal.Infrastructure.Persistence;
using ClinicEz.Portal.Tests.Support;
using ClinicEz.Shared.Common;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ClinicEz.Portal.Tests.Entitlements;

public class EntitlementGuardTests : IDisposable
{
    private readonly ApplicationDbContext _context = TestSupport.NewContext();
    private readonly Guid _tenantId = Guid.NewGuid();
    private readonly TestClock _clock = new(new DateTimeOffset(2026, 3, 1, 0, 0, 0, TimeSpan.Zero));

    public EntitlementGuardTests()
    {
        _context.Tenants.Add(new Tenant { Id = _tenantId, TenantSlug = "metro", Name = "Metro", OwnerId = "owner", Email = "o@metro.ph" });
        _context.SaveChanges();
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private EntitlementGuard Guard()
    {
        var entitlements = TestSupport.Entitlements(_context, _clock);
        return new EntitlementGuard(_context, entitlements);
    }

    private Task<Subscription> SeedAsync(string plan, SubscriptionStatus status = SubscriptionStatus.Active, DateTime? periodEnd = null, DateTime? trialEndsAt = null) =>
        TestSupport.SeedSubscriptionAsync(_context, _tenantId, status, plan, periodEnd ?? _clock.GetUtcNow().UtcDateTime.AddDays(20), trialEndsAt);

    private async Task AddFacilitiesAsync(FacilityType type, int count)
    {
        for (var i = 0; i < count; i++)
        {
            _context.Facilities.Add(new Facility { Id = Guid.NewGuid(), TenantId = _tenantId, Name = $"{type}-{i}", FacilityType = type });
        }

        await _context.SaveChangesAsync();
    }

    private async Task AddMembersAsync(int count, MemberStatus status = MemberStatus.Active)
    {
        for (var i = 0; i < count; i++)
        {
            _context.WorkspaceMembers.Add(new WorkspaceMember { Id = Guid.NewGuid(), TenantId = _tenantId, Email = $"m{i}-{status}@metro.ph", FullName = "M", Status = status });
        }

        await _context.SaveChangesAsync();
    }

    [Fact]
    public async Task FacilityLimit_BelowTheCeiling_IsAllowed()
    {
        await SeedAsync("starter");
        await AddFacilitiesAsync(FacilityType.Clinic, 2);

        await Guard().EnsureCanCreateFacilityAsync(_tenantId, FacilityType.Clinic);
    }

    [Fact]
    public async Task FacilityLimit_AtTheCeiling_IsRefusedWithLimitReached()
    {
        await SeedAsync("starter");
        await AddFacilitiesAsync(FacilityType.Clinic, 3);

        var ex = await Assert.ThrowsAsync<EntitlementException>(() => Guard().EnsureCanCreateFacilityAsync(_tenantId, FacilityType.Clinic));

        Assert.Equal(EntitlementGuard.LimitReachedCode, ex.Code);
        Assert.Contains("clinic", ex.Message);
    }

    [Fact]
    public async Task FacilityLimit_IsCountedPerFacilityType()
    {
        await SeedAsync("starter");
        await AddFacilitiesAsync(FacilityType.Clinic, 3);

        await Guard().EnsureCanCreateFacilityAsync(_tenantId, FacilityType.Laboratory);
    }

    [Fact]
    public async Task MemberLimit_CountsInvitedAndActiveButNotSuspendedMembers()
    {
        await SeedAsync("starter");
        await AddMembersAsync(3);
        await AddMembersAsync(1, MemberStatus.Invited);
        await AddMembersAsync(4, MemberStatus.Suspended);
        await Guard().EnsureCanAddMemberAsync(_tenantId);

        await AddMembersAsync(1, MemberStatus.Invited);
        var ex = await Assert.ThrowsAsync<EntitlementException>(() => Guard().EnsureCanAddMemberAsync(_tenantId));

        Assert.Equal(EntitlementGuard.LimitReachedCode, ex.Code);
    }

    [Fact]
    public async Task BranchLimit_AtTheCeiling_IsRefused()
    {
        await SeedAsync("starter");
        for (var i = 0; i < 2; i++)
        {
            _context.Branches.Add(new Branch { Id = Guid.NewGuid(), TenantId = _tenantId, Name = $"Branch {i}" });
        }

        await _context.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<EntitlementException>(() => Guard().EnsureCanCreateBranchAsync(_tenantId));

        Assert.Equal(EntitlementGuard.LimitReachedCode, ex.Code);
    }

    [Fact]
    public async Task UnlimitedLimits_NeverRefuse()
    {
        await SeedAsync("pro");
        await AddFacilitiesAsync(FacilityType.Clinic, 12);

        await Guard().EnsureCanCreateFacilityAsync(_tenantId, FacilityType.Clinic);
    }

    [Fact]
    public async Task Feature_NotInThePlan_IsRefusedWithFeatureUnavailable()
    {
        await SeedAsync("starter");

        var ex = await Assert.ThrowsAsync<EntitlementException>(() => Guard().EnsureFeatureAsync(_tenantId, EntitlementKeys.FeatureCrossTenantInterop));

        Assert.Equal(EntitlementGuard.FeatureUnavailableCode, ex.Code);
    }

    [Fact]
    public async Task Feature_InThePlan_IsAllowed()
    {
        await SeedAsync("starter");
        await Guard().EnsureFeatureAsync(_tenantId, EntitlementKeys.FeatureElectronicPrescriptions);

        await SeedOverrideFreeUpgradeAsync();
        await Guard().EnsureFeatureAsync(_tenantId, EntitlementKeys.FeatureCrossTenantInterop);
    }

    private async Task SeedOverrideFreeUpgradeAsync()
    {
        _context.EntitlementOverrides.Add(new EntitlementOverride
        {
            TenantId = _tenantId,
            Key = EntitlementKeys.FeatureCrossTenantInterop,
            Kind = EntitlementKind.Feature,
            Enabled = true
        });
        await _context.SaveChangesAsync();
    }

    [Fact]
    public async Task LimitOverride_RaisesThePlanCeiling_ForThatWorkspaceOnly()
    {
        await SeedAsync("starter");
        await AddFacilitiesAsync(FacilityType.Clinic, 3);
        _context.EntitlementOverrides.Add(new EntitlementOverride
        {
            TenantId = _tenantId,
            Key = EntitlementKeys.LimitClinics,
            Kind = EntitlementKind.Limit,
            Limit = 10
        });
        await _context.SaveChangesAsync();

        await Guard().EnsureCanCreateFacilityAsync(_tenantId, FacilityType.Clinic);
    }

    [Fact]
    public async Task FeatureOverride_CanSwitchAFeatureOff()
    {
        await SeedAsync("pro");
        _context.EntitlementOverrides.Add(new EntitlementOverride
        {
            TenantId = _tenantId,
            Key = EntitlementKeys.FeatureCrossTenantInterop,
            Kind = EntitlementKind.Feature,
            Enabled = false
        });
        await _context.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<EntitlementException>(() => Guard().EnsureFeatureAsync(_tenantId, EntitlementKeys.FeatureCrossTenantInterop));

        Assert.Equal(EntitlementGuard.FeatureUnavailableCode, ex.Code);
    }

    [Fact]
    public async Task ExpiredTrial_RefusesEveryCreateWithSubscriptionInactive()
    {
        await SeedAsync("pro", SubscriptionStatus.Trialing, periodEnd: null, trialEndsAt: _clock.GetUtcNow().UtcDateTime.AddDays(-1));
        var guard = Guard();

        var codes = new[]
        {
            (await Assert.ThrowsAsync<EntitlementException>(() => guard.EnsureCanCreateFacilityAsync(_tenantId, FacilityType.Clinic))).Code,
            (await Assert.ThrowsAsync<EntitlementException>(() => guard.EnsureCanAddMemberAsync(_tenantId))).Code,
            (await Assert.ThrowsAsync<EntitlementException>(() => guard.EnsureCanCreateBranchAsync(_tenantId))).Code,
            (await Assert.ThrowsAsync<EntitlementException>(() => guard.EnsureFeatureAsync(_tenantId, EntitlementKeys.FeatureTeleconsultation))).Code
        };

        Assert.All(codes, code => Assert.Equal(EntitlementGuard.SubscriptionInactiveCode, code));
    }

    [Fact]
    public async Task ActiveSubscription_PastItsPeriodAndTheRenewalSlack_CountsAsExpired()
    {
        var now = _clock.GetUtcNow().UtcDateTime;
        await SeedAsync("pro", SubscriptionStatus.Active, periodEnd: now - Subscription.RenewalSlack - TimeSpan.FromHours(1));

        var ex = await Assert.ThrowsAsync<EntitlementException>(() => Guard().EnsureCanCreateBranchAsync(_tenantId));

        Assert.Equal(EntitlementGuard.SubscriptionInactiveCode, ex.Code);
    }

    [Fact]
    public async Task ActiveSubscription_JustPastItsPeriod_StillWorksDuringTheRenewalSlack()
    {
        var now = _clock.GetUtcNow().UtcDateTime;
        await SeedAsync("pro", SubscriptionStatus.Active, periodEnd: now - TimeSpan.FromHours(6));

        await Guard().EnsureCanCreateBranchAsync(_tenantId);
    }

    [Fact]
    public async Task CancelledSubscription_KeepsItsEntitlementsUntilThePaidPeriodEnds()
    {
        var now = _clock.GetUtcNow().UtcDateTime;
        await SeedAsync("pro", SubscriptionStatus.Cancelled, periodEnd: now.AddDays(5));
        await Guard().EnsureCanCreateBranchAsync(_tenantId);

        _clock.Advance(TimeSpan.FromDays(6));
        var ex = await Assert.ThrowsAsync<EntitlementException>(() => Guard().EnsureCanCreateBranchAsync(_tenantId));

        Assert.Equal(EntitlementGuard.SubscriptionInactiveCode, ex.Code);
    }

    [Fact]
    public async Task WorkspaceWithoutASubscription_StartsATrialOnTheDefaultPlan()
    {
        TestSupport.Entitlements(_context);

        var snapshot = await TestSupport.Entitlements(_context, _clock).ResolveAsync(_tenantId, CancellationToken.None);

        Assert.Equal(SubscriptionStatus.Trialing, snapshot.Status);
        Assert.Equal("starter", snapshot.PlanSlug);
        var subscription = await _context.Subscriptions.SingleAsync();
        Assert.Equal(_tenantId, subscription.TenantId);
    }

    [Fact]
    public async Task ExpiredSnapshot_HasNoLimitsAndNoFeatures()
    {
        await SeedAsync("pro", SubscriptionStatus.Trialing, periodEnd: null, trialEndsAt: _clock.GetUtcNow().UtcDateTime.AddDays(-2));

        var snapshot = await TestSupport.Entitlements(_context, _clock).ResolveAsync(_tenantId, CancellationToken.None);

        Assert.False(snapshot.IsActive);
        Assert.Empty(snapshot.Limits);
        Assert.Empty(snapshot.Features);
    }
}
