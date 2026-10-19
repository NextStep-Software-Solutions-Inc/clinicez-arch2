using ClinicEz.Portal.Application.Features.Billing;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClinicEz.Portal.Application.Features.Entitlements;

public sealed class EntitlementService(
    IApplicationDbContext context,
    IOptions<BillingOptions> billingOptions,
    TimeProvider timeProvider,
    ISystemSettingsService? settingsService = null) : IEntitlementService
{
    public async Task<EntitlementSnapshot> ResolveAsync(Guid tenantId, CancellationToken cancellationToken)
    {
        var subscription = await LoadSubscriptionAsync(tenantId, cancellationToken)
            ?? await StartTrialAsync(tenantId, cancellationToken);

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var status = subscription.EffectiveStatus(now);

        var limits = new Dictionary<string, long>(StringComparer.Ordinal);
        var features = new HashSet<string>(StringComparer.Ordinal);

        if (subscription.GrantsEntitlements(now))
        {
            foreach (var entitlement in subscription.Plan.Entitlements.Where(e => !e.IsDeleted))
            {
                Apply(limits, features, entitlement.Key, entitlement.Kind, entitlement.Limit, entitlement.Enabled);
            }

            var overrides = await context.EntitlementOverrides
                .AsNoTracking()
                .Where(o => o.TenantId == tenantId)
                .ToListAsync(cancellationToken);

            foreach (var entitlement in overrides)
            {
                Apply(limits, features, entitlement.Key, entitlement.Kind, entitlement.Limit, entitlement.Enabled);
            }
        }

        return new EntitlementSnapshot(
            tenantId,
            subscription.EntitlementVersion,
            status,
            subscription.Plan.Slug,
            subscription.Plan.Name,
            subscription.Plan.Rank,
            subscription.Status == SubscriptionStatus.Trialing ? subscription.TrialEndsAt : subscription.CurrentPeriodEnd,
            limits,
            features);
    }

    private static void Apply(
        Dictionary<string, long> limits,
        HashSet<string> features,
        string key,
        EntitlementKind kind,
        long? limit,
        bool? enabled)
    {
        if (kind == EntitlementKind.Limit)
        {
            limits[key] = limit ?? EntitlementSnapshot.Unlimited;
            return;
        }

        if (enabled == true)
        {
            features.Add(key);
        }
        else
        {
            features.Remove(key);
        }
    }

    private Task<Subscription?> LoadSubscriptionAsync(Guid tenantId, CancellationToken cancellationToken) =>
        context.Subscriptions
            .Include(s => s.Plan).ThenInclude(p => p.Entitlements)
            .FirstOrDefaultAsync(s => s.TenantId == tenantId, cancellationToken);

    private async Task<Subscription> StartTrialAsync(Guid tenantId, CancellationToken cancellationToken)
    {
        var created = await TrialSubscription.CreateAsync(context, billingOptions.Value, timeProvider, tenantId, cancellationToken, settingsService);
        try
        {
            await context.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // Another request started the trial first (unique subscription per workspace): use theirs.
            context.Subscriptions.Remove(created);
            var existing = await LoadSubscriptionAsync(tenantId, cancellationToken);
            return existing ?? throw new InvalidOperationException("Could not start a subscription for the workspace.");
        }

        return (await LoadSubscriptionAsync(tenantId, cancellationToken))!;
    }
}

/// <summary>Builds the trial subscription a workspace starts on: the configured default plan (else the lowest-ranked one).</summary>
internal static class TrialSubscription
{
    public static async Task<Subscription> CreateAsync(
        IApplicationDbContext context,
        BillingOptions options,
        TimeProvider timeProvider,
        Guid tenantId,
        CancellationToken cancellationToken,
        ISystemSettingsService? settingsService = null)
    {
        var defaultPlanSlug = options.DefaultPlanSlug;
        if (string.IsNullOrWhiteSpace(defaultPlanSlug) && settingsService is not null)
        {
            defaultPlanSlug = await settingsService.GetSettingValueAsync("Billing:DefaultPlanSlug", string.Empty, cancellationToken);
        }

        var trialDays = options.TrialDays;
        if (settingsService is not null)
        {
            trialDays = await settingsService.GetSettingIntAsync("Billing:TrialDays", trialDays, cancellationToken);
        }

        var plans = context.Plans.AsNoTracking();
        Plan? plan = null;
        if (!string.IsNullOrWhiteSpace(defaultPlanSlug))
        {
            plan = await plans.FirstOrDefaultAsync(p => p.Slug == defaultPlanSlug, cancellationToken);
        }

        plan ??= await plans.OrderBy(p => p.Rank).FirstOrDefaultAsync(cancellationToken)
            ?? throw new InvalidOperationException("No billing plans are configured; cannot start a trial.");

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var tenantCreatedAt = await context.Tenants
            .AsNoTracking()
            .Where(t => t.Id == tenantId)
            .Select(t => t.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);
        var trialStart = tenantCreatedAt == default ? now : tenantCreatedAt;

        var subscription = new Subscription
        {
            TenantId = tenantId,
            PlanId = plan.Id,
            Status = SubscriptionStatus.Trialing,
            TrialEndsAt = trialStart.AddDays(trialDays),
            EntitlementVersion = 1
        };
        context.Subscriptions.Add(subscription);
        return subscription;
    }
}
