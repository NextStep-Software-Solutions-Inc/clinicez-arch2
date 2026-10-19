namespace ClinicEz.Portal.Application.Features.Billing;

/// <summary>
/// The commercial catalogue as configuration (<c>Billing</c> section): which plans exist and what each one grants. The
/// seeder applies it idempotently by slug in every environment; nothing about plan contents lives in code.
/// </summary>
public sealed class BillingOptions
{
    public const string SectionName = "Billing";

    /// <summary>Slug of the plan a new workspace's trial starts on. When empty or unknown the lowest-ranked plan is used.</summary>
    public string? DefaultPlanSlug { get; set; }

    /// <summary>Default billing cadence selected on public pricing and subscription pages ("monthly" or "annually").</summary>
    public string DefaultBillingCadence { get; set; } = "monthly";

    public int TrialDays { get; set; } = 14;

    public List<PlanSeedOptions> Plans { get; set; } = [];
}

public sealed class PlanSeedOptions
{
    /// <summary>Limit value meaning "no ceiling" in configuration.</summary>
    public const long UnlimitedMarker = -1;

    public string Slug { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int Rank { get; set; }
    public decimal PriceMonthly { get; set; }
    public decimal PriceAnnually { get; set; }
    public bool IsHighlighted { get; set; }
    public bool RequiresCheckout { get; set; }

    /// <summary>Marketing bullet points for the pricing page.</summary>
    public List<string> Features { get; set; } = [];

    /// <summary>Limit key to ceiling, e.g. <c>"limit.clinics": 5</c>; <c>-1</c> means unlimited.</summary>
    public Dictionary<string, long> Limits { get; set; } = [];

    /// <summary>Feature keys this plan switches on, e.g. <c>"feature.cross_tenant_interop"</c>.</summary>
    public List<string> EnabledFeatures { get; set; } = [];
}
