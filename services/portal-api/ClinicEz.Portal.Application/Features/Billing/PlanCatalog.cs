using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Billing;

/// <summary>
/// Creates the plans of the <see cref="BillingOptions"/> catalogue that do not exist yet. Idempotent by plan slug and
/// deliberately never touches a plan that already exists: once it is in the database, admins own it (price and entitlement edits
/// through the billing-plan endpoints must survive restarts).
/// </summary>
public static class PlanCatalog
{
    public static async Task SeedMissingAsync(
        IApplicationDbContext context, BillingOptions options, CancellationToken cancellationToken)
    {
        foreach (var seed in options.Plans)
        {
            ValidateSeed(seed);

            if (await context.Plans.AnyAsync(p => p.Slug == seed.Slug, cancellationToken))
            {
                continue;
            }

            var plan = new Plan
            {
                Slug = seed.Slug,
                Name = seed.Name,
                Description = seed.Description,
                Rank = seed.Rank,
                PriceMonthly = seed.PriceMonthly,
                PriceAnnually = seed.PriceAnnually,
                IsHighlighted = seed.IsHighlighted,
                RequiresCheckout = seed.RequiresCheckout
            };

            for (var i = 0; i < seed.Features.Count; i++)
            {
                plan.Features.Add(new PlanFeature { Name = seed.Features[i], DisplayOrder = i + 1 });
            }

            ApplyEntitlements(context, plan, seed.Limits, seed.EnabledFeatures);

            context.Plans.Add(plan);
        }

        await context.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Makes the plan's entitlements exactly <paramref name="limits"/> (-1 = unlimited) plus <paramref name="enabledFeatures"/>.
    /// Returns whether what the plan grants changed.
    /// </summary>
    public static bool ApplyEntitlements(
        IApplicationDbContext context, Plan plan, IReadOnlyDictionary<string, long> limits, IReadOnlyCollection<string> enabledFeatures)
    {
        var unknown = limits.Keys.Concat(enabledFeatures).FirstOrDefault(k => !EntitlementKeys.IsKnown(k));
        if (unknown is not null)
        {
            throw new InvalidOperationException($"Unknown entitlement key '{unknown}'.");
        }

        var wanted = new Dictionary<string, (EntitlementKind Kind, long? Limit, bool? Enabled)>();
        foreach (var (key, value) in limits)
        {
            wanted[key] = (EntitlementKind.Limit, value == PlanSeedOptions.UnlimitedMarker ? null : value, null);
        }

        foreach (var key in EntitlementKeys.Features)
        {
            wanted[key] = (EntitlementKind.Feature, null, enabledFeatures.Contains(key));
        }

        var changed = false;
        foreach (var stale in plan.Entitlements.Where(e => !wanted.ContainsKey(e.Key)).ToList())
        {
            context.PlanEntitlements.Remove(stale);
            changed = true;
        }

        foreach (var (key, value) in wanted)
        {
            var existing = plan.Entitlements.FirstOrDefault(e => e.Key == key);
            if (existing is null)
            {
                plan.Entitlements.Add(new PlanEntitlement { Key = key, Kind = value.Kind, Limit = value.Limit, Enabled = value.Enabled });
                changed = true;
            }
            else if (existing.Limit != value.Limit || existing.Enabled != value.Enabled)
            {
                existing.Limit = value.Limit;
                existing.Enabled = value.Enabled;
                changed = true;
            }
        }

        return changed;
    }

    private static void ValidateSeed(PlanSeedOptions seed)
    {
        if (string.IsNullOrWhiteSpace(seed.Slug) || string.IsNullOrWhiteSpace(seed.Name))
        {
            throw new InvalidOperationException("Every Billing:Plans entry needs a Slug and a Name.");
        }
    }
}
