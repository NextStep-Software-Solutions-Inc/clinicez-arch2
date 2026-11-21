using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Entitlements;

public sealed class EntitlementGuard(IApplicationDbContext context, IEntitlementService entitlements) : IEntitlementGuard
{
    public const string SubscriptionInactiveCode = "subscription_inactive";
    public const string LimitReachedCode = "limit_reached";
    public const string FeatureUnavailableCode = "feature_unavailable";

    public async Task EnsureFeatureAsync(Guid tenantId, string featureKey, CancellationToken cancellationToken = default)
    {
        var snapshot = await ActiveSnapshotAsync(tenantId, cancellationToken);
        if (!snapshot.Has(featureKey))
        {
            throw new EntitlementException(
                $"Your {snapshot.PlanName} plan does not include this capability ({featureKey}). Please upgrade your subscription.",
                FeatureUnavailableCode);
        }
    }

    public async Task EnsureCanCreateFacilityAsync(Guid tenantId, FacilityType facilityType, CancellationToken cancellationToken = default)
    {
        var snapshot = await ActiveSnapshotAsync(tenantId, cancellationToken);
        var key = EntitlementKeys.FacilityLimitFor(facilityType);
        var current = await context.Facilities.CountAsync(f => f.TenantId == tenantId && f.FacilityType == facilityType, cancellationToken);
        Enforce(snapshot, key, current, $"{facilityType.ToString().ToLowerInvariant()} location");
    }

    public async Task EnsureCanAddMemberAsync(Guid tenantId, CancellationToken cancellationToken = default)
    {
        var snapshot = await ActiveSnapshotAsync(tenantId, cancellationToken);
        var current = await context.WorkspaceMembers.CountAsync(
            m => m.TenantId == tenantId && m.Status != MemberStatus.Suspended && m.Status != MemberStatus.Revoked, cancellationToken);
        Enforce(snapshot, EntitlementKeys.LimitMembers, current, "team member");
    }

    public async Task EnsureCanCreateBranchAsync(Guid tenantId, CancellationToken cancellationToken = default)
    {
        var snapshot = await ActiveSnapshotAsync(tenantId, cancellationToken);
        var current = await context.Branches.CountAsync(b => b.TenantId == tenantId, cancellationToken);
        Enforce(snapshot, EntitlementKeys.LimitBranches, current, "branch");
    }

    private async Task<EntitlementSnapshot> ActiveSnapshotAsync(Guid tenantId, CancellationToken cancellationToken)
    {
        var snapshot = await entitlements.ResolveAsync(tenantId, cancellationToken);
        if (!snapshot.IsActive)
        {
            throw new EntitlementException(
                "Your subscription is not active. Please activate or renew a plan to continue.",
                SubscriptionInactiveCode);
        }

        return snapshot;
    }

    private static void Enforce(EntitlementSnapshot snapshot, string limitKey, int current, string noun)
    {
        var limit = snapshot.Limit(limitKey);
        if (current >= limit)
        {
            var plural = limit == 1 ? noun : noun + "s";
            throw new EntitlementException(
                $"Feature Limit Reached: your {snapshot.PlanName} plan allows up to {limit} {plural}. Please upgrade your subscription to add more.",
                LimitReachedCode);
        }
    }
}
