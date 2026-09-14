using MediatR;
using ClinicEz.Portal.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Portal.Application.Features.Admin.Commands;

public record UpdateTenantUsageResult(
    Guid Id, 
    int FacilitiesCount, 
    int StaffAccountsCount, 
    int ActivePatientRecordsCount, 
    int MonthlyApiQuotaUsed, 
    int MonthlyApiQuotaLimit
);

public record UpdateTenantUsageCommand(
    Guid Id, 
    int FacilitiesCount, 
    int StaffAccountsCount, 
    int ActivePatientRecordsCount, 
    int MonthlyApiQuotaUsed, 
    int MonthlyApiQuotaLimit
) : IRequest<UpdateTenantUsageResult?>;

public class UpdateTenantUsageCommandHandler(IApplicationDbContext context) : IRequestHandler<UpdateTenantUsageCommand, UpdateTenantUsageResult?>
{
    public async Task<UpdateTenantUsageResult?> Handle(UpdateTenantUsageCommand request, CancellationToken cancellationToken)
    {
        var tenant = await context.Tenants.FirstOrDefaultAsync(t => t.Id == request.Id, cancellationToken);
        if (tenant == null) return null;

        tenant.FacilitiesCount = request.FacilitiesCount;
        tenant.StaffAccountsCount = request.StaffAccountsCount;
        tenant.ActivePatientRecordsCount = request.ActivePatientRecordsCount;
        tenant.MonthlyApiQuotaUsed = request.MonthlyApiQuotaUsed;
        tenant.MonthlyApiQuotaLimit = request.MonthlyApiQuotaLimit;

        await context.SaveChangesAsync(cancellationToken);
        
        return new UpdateTenantUsageResult(
            tenant.Id,
            tenant.FacilitiesCount,
            tenant.StaffAccountsCount,
            tenant.ActivePatientRecordsCount,
            tenant.MonthlyApiQuotaUsed,
            tenant.MonthlyApiQuotaLimit
        );
    }
}
