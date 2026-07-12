using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MainPortalBE.Application.Interfaces;
using MainPortalBE.Domain.Entities;
using MediatR;

namespace MainPortalBE.Application.Features.Billing.Commands;

public class CreateBillingPlanCommand : IRequest<Guid>
{
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal PriceMonthly { get; set; }
    public decimal PriceAnnually { get; set; }
    public bool IsHighlighted { get; set; }
    public bool RequiresCheckout { get; set; }
    public List<string> Features { get; set; } = new();
}

public class CreateBillingPlanCommandHandler(IApplicationDbContext context) : IRequestHandler<CreateBillingPlanCommand, Guid>
{
    public async Task<Guid> Handle(CreateBillingPlanCommand request, CancellationToken cancellationToken)
    {
        var plan = new SubscriptionPlan
        {
            Name = request.Name,
            Slug = request.Slug,
            Description = request.Description,
            PriceMonthly = request.PriceMonthly,
            PriceAnnually = request.PriceAnnually,
            IsHighlighted = request.IsHighlighted,
            RequiresCheckout = request.RequiresCheckout
        };

        for (int i = 0; i < request.Features.Count; i++)
        {
            plan.Features.Add(new SubscriptionPlanFeature
            {
                Name = request.Features[i],
                DisplayOrder = i + 1
            });
        }

        context.SubscriptionPlans.Add(plan);
        await context.SaveChangesAsync(cancellationToken);

        return plan.Id;
    }
}
