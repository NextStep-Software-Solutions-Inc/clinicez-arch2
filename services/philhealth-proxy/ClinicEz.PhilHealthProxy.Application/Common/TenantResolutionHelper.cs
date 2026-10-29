using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;

namespace ClinicEz.PhilHealthProxy.Application.Common;

public static class TenantResolutionHelper
{
    public static async Task<PhilHealthTenant> ResolveTenantAsync(
        ICurrentTenant currentTenant,
        ITenantRepository tenantRepo,
        CancellationToken ct)
    {
        var tenantId = currentTenant.TenantId
            ?? throw new UnauthorizedAccessException("TenantId is missing or unverified.");

        PhilHealthTenant? tenant = currentTenant.BranchId.HasValue
            ? await tenantRepo.GetByBranchIdAsync(currentTenant.BranchId.Value, ct)
            : await tenantRepo.GetByTenantIdAsync(tenantId, ct);

        tenant ??= new PhilHealthTenant
        {
            TenantId = tenantId,
            BranchId = currentTenant.BranchId,
            FacilityName = "Default Health Center",
            AccreditationNumber = "H10000001",
            PmccNumber = "Z15445",
            SoftwareCertificateId = "KON-DUMMYCERTS-Z15445",
            BaseUrl = "https://staging.philhealth.gov.ph"
        };

        return tenant;
    }
}
