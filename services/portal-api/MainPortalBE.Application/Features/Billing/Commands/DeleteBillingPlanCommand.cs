using System;
using System.Threading;
using System.Threading.Tasks;
using MainPortalBE.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace MainPortalBE.Application.Features.Billing.Commands;

public class DeleteBillingPlanCommand : IRequest<bool>
{
    public Guid Id { get; set; }
}

public class DeleteBillingPlanCommandHandler(IApplicationDbContext context) : IRequestHandler<DeleteBillingPlanCommand, bool>
{
    public async Task<bool> Handle(DeleteBillingPlanCommand request, CancellationToken cancellationToken)
    {
        var plan = await context.SubscriptionPlans.FindAsync(new object[] { request.Id }, cancellationToken);

        if (plan == null) return false;

        context.SubscriptionPlans.Remove(plan);
        await context.SaveChangesAsync(cancellationToken);
        return true;
    }
}
