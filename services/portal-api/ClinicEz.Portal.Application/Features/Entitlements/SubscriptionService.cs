using ClinicEz.Portal.Application.Features.Billing;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ClinicEz.Portal.Application.Features.Entitlements;

public sealed class SubscriptionService(
    IApplicationDbContext context,
    IOptions<BillingOptions> billingOptions,
    TimeProvider timeProvider,
    IEntitlementsPublisher publisher) : ISubscriptionService
{
    public async Task<Subscription> StartTrialAsync(Guid tenantId, CancellationToken cancellationToken)
    {
        var existing = await context.Subscriptions.FirstOrDefaultAsync(s => s.TenantId == tenantId, cancellationToken);
        if (existing is not null) return existing;

        var subscription = await TrialSubscription.CreateAsync(context, billingOptions.Value, timeProvider, tenantId, cancellationToken);
        await context.SaveChangesAsync(cancellationToken);
        return subscription;
    }

    public Task ActivateAsync(Guid tenantId, Plan plan, bool isAnnual, DateTime periodEnd, CancellationToken cancellationToken) =>
        ChangeAsync(tenantId, subscription =>
        {
            subscription.Plan = plan;
            subscription.PlanId = plan.Id;
            subscription.IsAnnual = isAnnual;
            subscription.Status = SubscriptionStatus.Active;
            subscription.CurrentPeriodEnd = periodEnd;
        }, cancellationToken);

    public Task MarkPastDueAsync(Guid tenantId, CancellationToken cancellationToken) =>
        ChangeAsync(tenantId, subscription => subscription.Status = SubscriptionStatus.PastDue, cancellationToken);

    public Task CancelAsync(Guid tenantId, CancellationToken cancellationToken) =>
        ChangeAsync(tenantId, subscription => subscription.Status = SubscriptionStatus.Cancelled, cancellationToken);

    public Task ChangePlanAsync(Guid tenantId, Plan plan, bool isAnnual, CancellationToken cancellationToken) =>
        ChangeAsync(tenantId, subscription =>
        {
            subscription.Plan = plan;
            subscription.PlanId = plan.Id;
            subscription.IsAnnual = isAnnual;
        }, cancellationToken);

    private async Task ChangeAsync(Guid tenantId, Action<Subscription> change, CancellationToken cancellationToken)
    {
        var subscription = await StartTrialAsync(tenantId, cancellationToken);

        change(subscription);
        subscription.EntitlementVersion++;
        await context.SaveChangesAsync(cancellationToken);

        // Saved first so the entitlement snapshot the facilities' licenses are derived from already sees the change.
        await publisher.StageForWorkspaceAsync(tenantId, cancellationToken);
        await context.SaveChangesAsync(cancellationToken);
    }
}
