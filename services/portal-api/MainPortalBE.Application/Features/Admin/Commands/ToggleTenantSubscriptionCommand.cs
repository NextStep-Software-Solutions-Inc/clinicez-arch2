using MediatR;
using MainPortalBE.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace MainPortalBE.Application.Features.Admin.Commands;

public record ToggleTenantSubscriptionResult(Guid Id, string SubscriptionStatus, string SubscriptionPlanId);

public record ToggleTenantSubscriptionCommand(Guid Id) : IRequest<ToggleTenantSubscriptionResult?>;

public class ToggleTenantSubscriptionCommandHandler(IApplicationDbContext context) : IRequestHandler<ToggleTenantSubscriptionCommand, ToggleTenantSubscriptionResult?>
{
    public async Task<ToggleTenantSubscriptionResult?> Handle(ToggleTenantSubscriptionCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants.FirstOrDefaultAsync(t => t.Id == request.Id, cancellationToken);
        if (tenant == null) return null;

        if (tenant.SubscriptionStatus == "ACTIVE")
        {
            tenant.SubscriptionStatus = "TRIALING";
        }
        else
        {
            tenant.SubscriptionStatus = "ACTIVE";
            if (string.IsNullOrEmpty(tenant.SubscriptionPlanId))
            {
                tenant.SubscriptionPlanId = "starter";
            }
        }

        await context.SaveChangesAsync(cancellationToken);
        return new ToggleTenantSubscriptionResult(tenant.Id, tenant.SubscriptionStatus, tenant.SubscriptionPlanId ?? "None");
    }
}
