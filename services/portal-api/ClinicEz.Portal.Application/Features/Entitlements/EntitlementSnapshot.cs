using ClinicEz.Portal.Domain.Entities;

namespace ClinicEz.Portal.Application.Features.Entitlements;

/// <summary>
/// Everything a workspace is entitled to right now, resolved from its subscription's plan plus per-workspace overrides.
/// A lapsed workspace (expired trial or unpaid period) resolves with no limits and no features, so every create-guard fails closed.
/// </summary>
public sealed record EntitlementSnapshot(
    Guid TenantId,
    int Version,
    SubscriptionStatus Status,
    string PlanSlug,
    string PlanName,
    int PlanRank,
    DateTime? PeriodEnd,
    IReadOnlyDictionary<string, long> Limits,
    IReadOnlySet<string> Features)
{
    /// <summary>Stands for "no ceiling" (a plan limit stored as null).</summary>
    public const long Unlimited = long.MaxValue;

    public bool IsActive => Status != SubscriptionStatus.Expired;

    /// <summary>The ceiling for <paramref name="key"/>; 0 when the workspace has no such entitlement.</summary>
    public long Limit(string key) => Limits.TryGetValue(key, out var value) ? value : 0;

    public bool Has(string featureKey) => Features.Contains(featureKey);

    /// <summary>A limit as an int for license fields, clamped to the int range.</summary>
    public int LimitAsInt(string key)
    {
        var value = Limit(key);
        return value >= int.MaxValue ? int.MaxValue : (int)value;
    }
}
