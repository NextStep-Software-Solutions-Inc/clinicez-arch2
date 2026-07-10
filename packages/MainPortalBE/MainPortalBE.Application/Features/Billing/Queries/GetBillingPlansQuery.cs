using MediatR;
using MainPortalBE.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace MainPortalBE.Application.Features.Billing.Queries;

public record BillingPlanDto(
    string Id,
    string Name,
    string Description,
    object PriceMonthly,
    object PriceAnnually,
    List<string> Features,
    bool Highlighted,
    bool RequiresCheckout
);

public class GetBillingPlansQuery : IRequest<List<BillingPlanDto>> { }

public class GetBillingPlansQueryHandler(IApplicationDbContext context) : IRequestHandler<GetBillingPlansQuery, List<BillingPlanDto>>
{
    public async Task<List<BillingPlanDto>> Handle(GetBillingPlansQuery request, CancellationToken cancellationToken)
    {
        var plans = await context.SubscriptionPlans
            .Include(p => p.Features)
            .OrderBy(p => p.PriceMonthly)
            .ToListAsync(cancellationToken);

        return plans.Select(p => new BillingPlanDto(
            p.Slug,
            p.Name,
            p.Description,
            p.PriceMonthly == 0 ? "Custom" : p.PriceMonthly,
            p.PriceAnnually == 0 ? "Custom" : p.PriceAnnually,
            p.Features.OrderBy(f => f.DisplayOrder).Select(f => f.Name).ToList(),
            p.IsHighlighted,
            p.RequiresCheckout
        )).ToList();
    }
}
