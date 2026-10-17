using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Licensing;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using ClinicEz.Shared.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Portal.Application.Features.Billing.Commands;

public class UpdateBillingPlanCommand : IRequest<bool>
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int Rank { get; set; }
    public decimal PriceMonthly { get; set; }
    public decimal PriceAnnually { get; set; }
    public bool IsHighlighted { get; set; }
    public bool RequiresCheckout { get; set; }
    public List<string> Features { get; set; } = new();

    /// <summary>Limit key to ceiling (<c>-1</c> = unlimited). Replaces the plan's limits.</summary>
    public Dictionary<string, long> Limits { get; set; } = new();

    /// <summary>Feature keys the plan switches on. Replaces the plan's features.</summary>
    public List<string> EnabledFeatures { get; set; } = new();
}

/// <summary>
/// Edits a plan. When what the plan grants changes, its version is bumped and every workspace subscribed to it gets
/// a new entitlement version and fresh facility licenses.
/// </summary>
public class UpdateBillingPlanCommandHandler(IApplicationDbContext context, IEntitlementsPublisher publisher)
    : IRequestHandler<UpdateBillingPlanCommand, bool>
{
    public async Task<bool> Handle(UpdateBillingPlanCommand request, CancellationToken cancellationToken)
    {
        var plan = await context.Plans
            .Include(p => p.Features)
            .Include(p => p.Entitlements)
            .FirstOrDefaultAsync(p => p.Id == request.Id, cancellationToken);

        if (plan == null) return false;

        var normalizedSlug = request.Slug.Trim().ToLowerInvariant();
        var slugExists = await context.Plans
            .AnyAsync(p => !p.IsDeleted && p.Id != plan.Id && p.Slug.ToLower() == normalizedSlug, cancellationToken);
        if (slugExists)
        {
            throw new ValidationException($"Plan slug '{normalizedSlug}' is already taken. Please choose a different unique slug.");
        }

        var otherPlans = await context.Plans
            .Where(p => !p.IsDeleted && p.Id != plan.Id)
            .ToListAsync(cancellationToken);

        var bumpedPlans = PlanCatalog.BumpRanksOnInsertOrUpdate(otherPlans, request.Rank);

        var rankChanged = plan.Rank != request.Rank;

        plan.Name = request.Name.Trim();
        plan.Slug = normalizedSlug;
        plan.Description = request.Description.Trim();
        plan.Rank = request.Rank;
        plan.PriceMonthly = request.PriceMonthly;
        plan.PriceAnnually = request.PriceAnnually;
        plan.IsHighlighted = request.IsHighlighted;
        plan.RequiresCheckout = request.RequiresCheckout;

        // Re-sync features (clear and re-add for simplicity)
        context.PlanFeatures.RemoveRange(plan.Features);
        plan.Features.Clear();

        for (int i = 0; i < request.Features.Count; i++)
        {
            plan.Features.Add(new PlanFeature
            {
                Name = request.Features[i],
                DisplayOrder = i + 1
            });
        }

        var grantsChanged = PlanCatalog.ApplyEntitlements(context, plan, request.Limits, request.EnabledFeatures) || rankChanged;
        List<Guid> subscribedTenants = [];
        if (grantsChanged)
        {
            plan.Version++;
            var subscriptions = await context.Subscriptions
                .Where(s => s.PlanId == plan.Id && !s.IsDeleted)
                .ToListAsync(cancellationToken);
            foreach (var subscription in subscriptions)
            {
                subscription.EntitlementVersion++;
            }

            subscribedTenants.AddRange(subscriptions.Select(s => s.TenantId));
        }

        // For any other plans bumped as a side-effect, bump their Version and cascade to active subscribers
        foreach (var bumped in bumpedPlans)
        {
            bumped.Version++;
            var bumpedSubs = await context.Subscriptions
                .Where(s => s.PlanId == bumped.Id && !s.IsDeleted)
                .ToListAsync(cancellationToken);
            foreach (var sub in bumpedSubs)
            {
                sub.EntitlementVersion++;
            }
            subscribedTenants.AddRange(bumpedSubs.Select(s => s.TenantId));
        }

        await context.SaveChangesAsync(cancellationToken);

        foreach (var tenantId in subscribedTenants.Distinct())
        {
            await publisher.StageForWorkspaceAsync(tenantId, cancellationToken);
        }

        await context.SaveChangesAsync(cancellationToken);
        return true;
    }
}
