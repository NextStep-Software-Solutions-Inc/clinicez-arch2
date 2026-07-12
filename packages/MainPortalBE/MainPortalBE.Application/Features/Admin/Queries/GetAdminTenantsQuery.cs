using MediatR;
using MainPortalBE.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace MainPortalBE.Application.Features.Admin.Queries;

public record AdminTenantResponseDto(
    Guid Id,
    string ClinicName,
    string TenantSlug,
    string FacilityType,
    string OwnerName,
    string Email,
    DateTime CreatedAt,
    string SubscriptionStatus,
    string SubscriptionPlanId,
    bool IsAnnual,
    int ClinicalBranchesCount,
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

        var result = new List<AdminTenantResponseDto>();
        foreach (var t in tenants)
        {
            var latestInvoice = await context.BillingInvoices
                .Where(i => i.TenantId == t.Id)
                .OrderByDescending(i => i.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);

            result.Add(new AdminTenantResponseDto(
                t.Id,
                t.ClinicName,
                t.TenantSlug,
                t.FacilityType,
                $"{t.FirstName} {t.LastName}".Trim(),
                t.Email,
                t.CreatedAt,
                t.SubscriptionStatus,
                t.SubscriptionPlanId ?? "None",
                latestInvoice?.IsAnnual ?? false,
                t.ClinicalBranchesCount,
                t.StaffAccountsCount,
                t.ActivePatientRecordsCount,
                t.MonthlyApiQuotaUsed,
                t.MonthlyApiQuotaLimit
            ));
        }

        return result;
    }
}
