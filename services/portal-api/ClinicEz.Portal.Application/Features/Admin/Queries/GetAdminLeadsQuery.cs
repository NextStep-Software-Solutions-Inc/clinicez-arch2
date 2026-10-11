using MediatR;
using ClinicEz.Portal.Application.Features.Billing;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Portal.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Queries;

public record AdminLeadResponseDto(
    Guid Id,
    string Name,
    string TenantSlug,
    string TenantType,
    string OwnerName,
    string Email,
    DateTime CreatedAt,
    string SubscriptionStatus,
    string SubscriptionPlanId
);

public record GetAdminLeadsQuery : IRequest<List<AdminLeadResponseDto>>;

public class GetAdminLeadsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetAdminLeadsQuery, List<AdminLeadResponseDto>>
{
    public async Task<List<AdminLeadResponseDto>> Handle(GetAdminLeadsQuery request, CancellationToken cancellationToken)
    {
        var tenants = await context.Tenants
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync(cancellationToken);
        var subscriptions = await context.Subscriptions
            .AsNoTracking()
            .Include(s => s.Plan)
            .ToDictionaryAsync(s => s.TenantId, cancellationToken);

        return tenants
            .Select(t => (Tenant: t, Subscription: subscriptions.GetValueOrDefault(t.Id)))
            .Where(x => x.Subscription is null || x.Subscription.Status != SubscriptionStatus.Active)
            .Select(x => new AdminLeadResponseDto(
                x.Tenant.Id,
                x.Tenant.Name,
                x.Tenant.TenantSlug,
                x.Tenant.TenantType,
                $"{x.Tenant.FirstName} {x.Tenant.LastName}".Trim(),
                x.Tenant.Email,
                x.Tenant.CreatedAt,
                SubscriptionWire.Status(x.Subscription?.Status ?? SubscriptionStatus.Trialing),
                x.Subscription?.Plan.Slug ?? SubscriptionWire.NoPlan
            )).ToList();
    }
}
