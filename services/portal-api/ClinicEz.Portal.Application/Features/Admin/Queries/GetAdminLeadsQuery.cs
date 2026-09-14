using MediatR;
using ClinicEz.Portal.Application.Interfaces;
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
        var leads = await context.Tenants
            .Where(t => t.SubscriptionStatus != "ACTIVE")
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync(cancellationToken);

        return leads.Select(t => new AdminLeadResponseDto(
            t.Id,
            t.Name,
            t.TenantSlug,
            t.TenantType,
            $"{t.FirstName} {t.LastName}".Trim(),
            t.Email,
            t.CreatedAt,
            t.SubscriptionStatus,
            t.SubscriptionPlanId ?? "None"
        )).ToList();
    }
}
