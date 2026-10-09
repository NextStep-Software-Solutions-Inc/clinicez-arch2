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

public record AdminTenantResponseDto(
    Guid Id,
    string Name,
    string TenantSlug,
    string TenantType,
    string OwnerName,
    string Email,
    DateTime CreatedAt,
    string SubscriptionStatus,
    string SubscriptionPlanId,
    bool IsAnnual,
    int FacilitiesCount,
    int StaffAccountsCount,
    int ActivePatientRecordsCount,
    int MonthlyApiQuotaUsed,
    int MonthlyApiQuotaLimit
);

public record GetAdminTenantsQuery : IRequest<List<AdminTenantResponseDto>>;

public class GetAdminTenantsQueryHandler(IApplicationDbContext context) : IRequestHandler<GetAdminTenantsQuery, List<AdminTenantResponseDto>>
{
    public async Task<List<AdminTenantResponseDto>> Handle(GetAdminTenantsQuery request, CancellationToken cancellationToken)
    {
        var tenants = await context.Tenants
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync(cancellationToken);
        var subscriptions = await context.Subscriptions
            .AsNoTracking()
            .Include(s => s.Plan)
            .ToDictionaryAsync(s => s.TenantId, cancellationToken);

        var result = new List<AdminTenantResponseDto>();
        foreach (var t in tenants)
        {
            var subscription = subscriptions.GetValueOrDefault(t.Id);
            result.Add(new AdminTenantResponseDto(
                t.Id,
                t.Name,
                t.TenantSlug,
                t.TenantType,
                $"{t.FirstName} {t.LastName}".Trim(),
                t.Email,
                t.CreatedAt,
                SubscriptionWire.Status(subscription?.Status ?? SubscriptionStatus.Trialing),
                subscription?.Plan.Slug ?? SubscriptionWire.NoPlan,
                subscription?.IsAnnual ?? false,
                t.FacilitiesCount,
                t.StaffAccountsCount,
                t.ActivePatientRecordsCount,
                t.MonthlyApiQuotaUsed,
                t.MonthlyApiQuotaLimit
            ));
        }

        return result;
    }
}
