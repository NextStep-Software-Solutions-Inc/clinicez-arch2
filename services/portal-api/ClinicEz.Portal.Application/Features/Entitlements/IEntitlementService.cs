using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Common;

namespace ClinicEz.Portal.Application.Features.Entitlements;

/// <summary>A workspace tried something its plan does not allow. Endpoints turn <see cref="InvalidOperationException"/> into a 4xx.</summary>
public sealed class EntitlementException(string message, string code) : InvalidOperationException(message)
{
    public string Code { get; } = code;
}

public interface IEntitlementService
{
    /// <summary>
    /// The workspace's current entitlements. A workspace that has no subscription yet gets its trial started
    /// (lowest-ranked plan, trial length from configuration) on the spot.
    /// </summary>
    Task<EntitlementSnapshot> ResolveAsync(Guid tenantId, CancellationToken cancellationToken);
}

/// <summary>Create-time checks against the workspace's entitlements. Throws <see cref="EntitlementException"/> when refused.</summary>
public interface IEntitlementGuard
{
    Task EnsureFeatureAsync(Guid tenantId, string featureKey, CancellationToken cancellationToken = default);

    /// <summary>The facility-count limit for <paramref name="facilityType"/> (counted from existing facilities).</summary>
    Task EnsureCanCreateFacilityAsync(Guid tenantId, FacilityType facilityType, CancellationToken cancellationToken = default);

    /// <summary>Workspace members (owner, admins, invited and active; not suspended) against <c>limit.members</c>.</summary>
    Task EnsureCanAddMemberAsync(Guid tenantId, CancellationToken cancellationToken = default);

    Task EnsureCanCreateBranchAsync(Guid tenantId, CancellationToken cancellationToken = default);
}

/// <summary>Moves the workspace's one subscription between states. Every change bumps the entitlement version and tells the facilities.</summary>
public interface ISubscriptionService
{
    Task<Subscription> StartTrialAsync(Guid tenantId, CancellationToken cancellationToken);

    /// <summary>A payment succeeded: the subscription becomes Active on <paramref name="plan"/> until <paramref name="periodEnd"/>.</summary>
    Task ActivateAsync(Guid tenantId, Plan plan, bool isAnnual, DateTime periodEnd, CancellationToken cancellationToken);

    Task MarkPastDueAsync(Guid tenantId, CancellationToken cancellationToken);

    /// <summary>Cancelled subscriptions keep their entitlements until the paid period ends.</summary>
    Task CancelAsync(Guid tenantId, CancellationToken cancellationToken);

    Task ChangePlanAsync(Guid tenantId, Plan plan, bool isAnnual, CancellationToken cancellationToken);
}
