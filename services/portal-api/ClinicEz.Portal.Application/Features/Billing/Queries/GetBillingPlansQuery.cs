using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Billing.Queries;

public record BillingPlanDto(
    string Id,
    string Name,
    string Description,
    object PriceMonthly,
    object PriceAnnually,
    List<string> Features,
    bool Highlighted,
    bool RequiresCheckout,
    int Rank,
    Dictionary<string, long> Limits,
    List<string> EnabledFeatures,
    Guid? PlanId = null,
    string? Slug = null,
    int Version = 1,
    int ActiveSubscribersCount = 0
);

public class GetBillingPlansQuery : IRequest<List<BillingPlanDto>> { }

public class GetBillingPlansQueryHandler(IApplicationDbContext context) : IRequestHandler<GetBillingPlansQuery, List<BillingPlanDto>>
{
    public async Task<List<BillingPlanDto>> Handle(GetBillingPlansQuery request, CancellationToken cancellationToken)
    {
        var plans = await context.Plans
            .Include(p => p.Features)
            .Include(p => p.Entitlements)
            .OrderBy(p => p.Rank)
            .ToListAsync(cancellationToken);

        var subscriberCounts = await context.Subscriptions
            .Where(s => !s.IsDeleted)
            .GroupBy(s => s.PlanId)
            .Select(g => new { PlanId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.PlanId, g => g.Count, cancellationToken);

        return plans.Select(p => new BillingPlanDto(
            p.Slug,
            p.Name,
            p.Description,
            p.PriceMonthly == 0 ? "Custom" : p.PriceMonthly,
            p.PriceAnnually == 0 ? "Custom" : p.PriceAnnually,
            p.Features.OrderBy(f => f.DisplayOrder).Select(f => f.Name).ToList(),
            p.IsHighlighted,
            p.RequiresCheckout,
            p.Rank,
            p.Entitlements
                .Where(e => e.Kind == EntitlementKind.Limit)
                .ToDictionary(e => e.Key, e => e.Limit ?? PlanSeedOptions.UnlimitedMarker),
            p.Entitlements
                .Where(e => e.Kind == EntitlementKind.Feature && e.Enabled == true)
                .Select(e => e.Key)
                .ToList(),
            p.Id,
            p.Slug,
            p.Version,
            subscriberCounts.GetValueOrDefault(p.Id, 0)
        )).ToList();
    }
}
