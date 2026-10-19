using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Billing.Commands;

public class CreateBillingPlanCommand : IRequest<Guid>
{
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int Rank { get; set; }
    public decimal PriceMonthly { get; set; }
    public decimal PriceAnnually { get; set; }
    public bool IsHighlighted { get; set; }
    public bool RequiresCheckout { get; set; }
    public List<string> Features { get; set; } = new();

    /// <summary>Limit key to ceiling (<c>-1</c> = unlimited), e.g. <c>limit.clinics</c>.</summary>
    public Dictionary<string, long> Limits { get; set; } = new();

    /// <summary>Feature keys the plan switches on, e.g. <c>feature.cross_tenant_interop</c>.</summary>
    public List<string> EnabledFeatures { get; set; } = new();
}

public class CreateBillingPlanCommandHandler(IApplicationDbContext context) : IRequestHandler<CreateBillingPlanCommand, Guid>
{
    public async Task<Guid> Handle(CreateBillingPlanCommand request, CancellationToken cancellationToken)
    {
        var normalizedSlug = request.Slug.Trim().ToLowerInvariant();
        var slugExists = await context.Plans
            .AnyAsync(p => !p.IsDeleted && p.Slug.ToLower() == normalizedSlug, cancellationToken);
        if (slugExists)
        {
            throw new ValidationException($"Plan slug '{normalizedSlug}' is already taken. Please choose a different unique slug.");
        }

        var otherPlans = await context.Plans
            .Where(p => !p.IsDeleted)
            .ToListAsync(cancellationToken);

        PlanCatalog.BumpRanksOnInsertOrUpdate(otherPlans, request.Rank);

        var plan = new Plan
        {
            Name = request.Name.Trim(),
            Slug = normalizedSlug,
            Description = request.Description.Trim(),
            Rank = request.Rank,
            PriceMonthly = request.PriceMonthly,
            PriceAnnually = request.PriceAnnually,
            IsHighlighted = request.IsHighlighted,
            RequiresCheckout = request.RequiresCheckout
        };

        for (int i = 0; i < request.Features.Count; i++)
        {
            plan.Features.Add(new PlanFeature
            {
                Name = request.Features[i],
                DisplayOrder = i + 1
            });
        }

        PlanCatalog.ApplyEntitlements(context, plan, request.Limits, request.EnabledFeatures);

        context.Plans.Add(plan);
        await context.SaveChangesAsync(cancellationToken);

        return plan.Id;
    }
}
