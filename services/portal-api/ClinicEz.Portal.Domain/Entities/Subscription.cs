using System;
using ClinicEz.Portal.Domain.Common;

namespace ClinicEz.Portal.Domain.Entities;

public enum SubscriptionStatus
{
    Trialing,
    Active,
    PastDue,
    Cancelled,
    Expired
}

/// <summary>
/// The workspace's one subscription (unique per tenant). Payment-provider ids live here and nowhere else: the
/// <see cref="Tenant"/> knows nothing about who collects the money. Billing is workspace-level, never per facility.
/// </summary>
public class Subscription : BaseEntity
{
    /// <summary>Slack after <see cref="CurrentPeriodEnd"/> before a paid subscription counts as expired (renewal webhooks can lag).</summary>
    public static readonly TimeSpan RenewalSlack = TimeSpan.FromDays(3);

    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;

    public Guid PlanId { get; set; }
    public Plan Plan { get; set; } = null!;

    public SubscriptionStatus Status { get; set; } = SubscriptionStatus.Trialing;
    public bool IsAnnual { get; set; }

    public DateTime? TrialEndsAt { get; set; }
    public DateTime? CurrentPeriodEnd { get; set; }

    /// <summary>Bumped on every change that can alter what the workspace is entitled to (plan, status, overrides).</summary>
    public int EntitlementVersion { get; set; } = 1;

    public string? ProviderName { get; set; }
    public string? ProviderCustomerId { get; set; }
    public string? ProviderSubscriptionId { get; set; }

    /// <summary>The status that applies right now: a lapsed trial or an unpaid period is Expired even if no webhook said so.</summary>
    public SubscriptionStatus EffectiveStatus(DateTime utcNow) => Status switch
    {
        SubscriptionStatus.Trialing when TrialEndsAt is { } trialEnd && trialEnd < utcNow => SubscriptionStatus.Expired,
        SubscriptionStatus.Active or SubscriptionStatus.PastDue when CurrentPeriodEnd is { } end && end + RenewalSlack < utcNow => SubscriptionStatus.Expired,
        SubscriptionStatus.Active when CurrentPeriodEnd is { } end && end < utcNow => SubscriptionStatus.PastDue,
        SubscriptionStatus.Cancelled when CurrentPeriodEnd is { } end && end < utcNow => SubscriptionStatus.Expired,
        _ => Status
    };

    /// <summary>When the entitlements the subscription last paid for (or the trial) ran out, if it has a known end.</summary>
    public DateTime? EntitlementsEndAt => Status == SubscriptionStatus.Trialing ? TrialEndsAt : CurrentPeriodEnd;

    /// <summary>Whether the plan's entitlements still apply (cancelled subscriptions keep them until the paid period ends).</summary>
    public bool GrantsEntitlements(DateTime utcNow) => EffectiveStatus(utcNow) != SubscriptionStatus.Expired;
}
