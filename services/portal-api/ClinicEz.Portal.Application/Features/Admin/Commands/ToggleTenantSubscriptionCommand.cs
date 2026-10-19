using ClinicEz.Portal.Application.Features.Billing;
using ClinicEz.Portal.Application.Features.Entitlements;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public record ToggleTenantSubscriptionResult(Guid Id, string SubscriptionStatus, string SubscriptionPlanId);

public record ToggleTenantSubscriptionCommand(Guid Id) : IRequest<ToggleTenantSubscriptionResult?>;

/// <summary>Support override: switches a workspace between a paid-active and an inactive subscription through the normal subscription service.</summary>
public class ToggleTenantSubscriptionCommandHandler(
    IApplicationDbContext context,
    ISubscriptionService subscriptions,
    TimeProvider timeProvider) : IRequestHandler<ToggleTenantSubscriptionCommand, ToggleTenantSubscriptionResult?>
{
    public async Task<ToggleTenantSubscriptionResult?> Handle(ToggleTenantSubscriptionCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants.FirstOrDefaultAsync(t => t.Id == request.Id, cancellationToken);
        if (tenant == null) return null;

        var current = await subscriptions.StartTrialAsync(tenant.Id, cancellationToken);
        var subscription = await context.Subscriptions.Include(s => s.Plan).FirstAsync(s => s.Id == current.Id, cancellationToken);

        if (subscription.Status == SubscriptionStatus.Active)
        {
            await subscriptions.CancelAsync(tenant.Id, cancellationToken);
        }
        else
        {
            var periodEnd = timeProvider.GetUtcNow().UtcDateTime.AddMonths(subscription.IsAnnual ? 12 : 1);
            await subscriptions.ActivateAsync(tenant.Id, subscription.Plan, subscription.IsAnnual, periodEnd, cancellationToken);
        }

        var updated = await context.Subscriptions.AsNoTracking().Include(s => s.Plan).FirstAsync(s => s.TenantId == tenant.Id, cancellationToken);
        return new ToggleTenantSubscriptionResult(tenant.Id, SubscriptionWire.Status(updated.Status), updated.Plan.Slug);
    }
}
