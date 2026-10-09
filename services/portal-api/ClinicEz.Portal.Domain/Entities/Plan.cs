using System;
using System.Collections.Generic;
using ClinicEz.Portal.Domain.Common;

namespace ClinicEz.Portal.Domain.Entities;

/// <summary>How moving from one plan (and billing interval) to another affects the running subscription.</summary>
public enum PlanChange
{
    Same,
    Upgrade,
    Downgrade,
    /// <summary>Same tier, but from annual to monthly billing.</summary>
    IntervalDowngrade
}

/// <summary>
/// A commercial plan. What it grants is data (<see cref="Entitlements"/>), never code: the portal reads limits and
/// features through the entitlement snapshot. <see cref="Rank"/> orders plans from smallest to largest.
/// </summary>
public class Plan : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int Rank { get; set; }

    /// <summary>Bumped when the plan's entitlements are edited, so workspaces on it get fresh licenses.</summary>
    public int Version { get; set; } = 1;

    public decimal PriceMonthly { get; set; }
    public decimal PriceAnnually { get; set; }
    public bool IsHighlighted { get; set; }
    public bool RequiresCheckout { get; set; }

    /// <summary>Marketing bullet points shown on the pricing page.</summary>
    public ICollection<PlanFeature> Features { get; set; } = new List<PlanFeature>();

    public ICollection<PlanEntitlement> Entitlements { get; set; } = new List<PlanEntitlement>();

    /// <summary>Classifies a move from this plan to <paramref name="target"/> using <see cref="Rank"/>, not plan names.</summary>
    public PlanChange ChangeTo(Plan target, bool currentIsAnnual, bool targetIsAnnual)
    {
        if (target.Rank > Rank) return PlanChange.Upgrade;
        if (target.Rank < Rank) return PlanChange.Downgrade;
        return currentIsAnnual && !targetIsAnnual ? PlanChange.IntervalDowngrade : PlanChange.Same;
    }
}

public static class PlanChangeExtensions
{
    /// <summary>A downgrade keeps what was paid for until the current period ends.</summary>
    public static bool TakesEffectAtPeriodEnd(this PlanChange change) =>
        change is PlanChange.Downgrade or PlanChange.IntervalDowngrade;
}
