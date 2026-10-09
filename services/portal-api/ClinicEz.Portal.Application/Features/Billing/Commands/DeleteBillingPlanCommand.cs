using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Billing.Commands;

public class DeleteBillingPlanCommand : IRequest<bool>
{
    public Guid Id { get; set; }
}

public class DeleteBillingPlanCommandHandler(IApplicationDbContext context) : IRequestHandler<DeleteBillingPlanCommand, bool>
{
    public async Task<bool> Handle(DeleteBillingPlanCommand request, CancellationToken cancellationToken)
    {
        var plan = await context.Plans.FindAsync(new object[] { request.Id }, cancellationToken);

        if (plan == null) return false;

        if (await context.Subscriptions.AnyAsync(s => s.PlanId == plan.Id, cancellationToken))
        {
            throw new InvalidOperationException("Plan is in use by a workspace subscription and cannot be deleted.");
        }

        context.Plans.Remove(plan);
        await context.SaveChangesAsync(cancellationToken);
        return true;
    }
}
