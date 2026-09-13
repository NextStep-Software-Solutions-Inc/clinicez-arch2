using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MainPortalBE.Application.Interfaces;
using MainPortalBE.Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace MainPortalBE.Application.Features.Billing.Commands;

public class UpdateBillingPlanCommand : IRequest<bool>
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal PriceMonthly { get; set; }
    public decimal PriceAnnually { get; set; }
    public bool IsHighlighted { get; set; }
    public bool RequiresCheckout { get; set; }
    public List<string> Features { get; set; } = new();
}

public class UpdateBillingPlanCommandHandler(IApplicationDbContext context) : IRequestHandler<UpdateBillingPlanCommand, bool>
{
    public async Task<bool> Handle(UpdateBillingPlanCommand request, CancellationToken cancellationToken)
    {
        var plan = await context.SubscriptionPlans
            .Include(p => p.Features)
            .FirstOrDefaultAsync(p => p.Id == request.Id, cancellationToken);

        if (plan == null) return false;

        plan.Name = request.Name;
        plan.Slug = request.Slug;
        plan.Description = request.Description;
        plan.PriceMonthly = request.PriceMonthly;
        plan.PriceAnnually = request.PriceAnnually;
        plan.IsHighlighted = request.IsHighlighted;
        plan.RequiresCheckout = request.RequiresCheckout;

        // Re-sync features (clear and re-add for simplicity)
        context.SubscriptionPlanFeatures.RemoveRange(plan.Features);
        plan.Features.Clear();

        for (int i = 0; i < request.Features.Count; i++)
        {
            plan.Features.Add(new SubscriptionPlanFeature
            {
                Name = request.Features[i],
                DisplayOrder = i + 1
            });
        }

        await context.SaveChangesAsync(cancellationToken);
        return true;
    }
}
