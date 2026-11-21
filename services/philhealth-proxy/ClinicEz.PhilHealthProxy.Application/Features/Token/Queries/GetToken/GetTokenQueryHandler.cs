using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Domain.Entities;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using MediatR;

namespace ClinicEz.PhilHealthProxy.Application.Features.Token.Queries.GetToken;

public sealed class GetTokenQueryHandler(
    ICurrentTenant currentTenant,
    ITenantRepository tenantRepo,
    IPhilHealthPcapiClient pcapiClient)
    : IRequestHandler<GetTokenQuery, PcapiTokenResponse>
{
    public async Task<PcapiTokenResponse> Handle(GetTokenQuery request, CancellationToken cancellationToken)
    {
        var tenantId = currentTenant.TenantId 
            ?? throw new UnauthorizedAccessException("TenantId is missing or unverified.");

        PhilHealthTenant? tenant = currentTenant.BranchId.HasValue
            ? await tenantRepo.GetByBranchIdAsync(currentTenant.BranchId.Value, cancellationToken)
            : await tenantRepo.GetByTenantIdAsync(tenantId, cancellationToken);

        tenant ??= new PhilHealthTenant
        {
            TenantId = tenantId,
            BranchId = currentTenant.BranchId,
            AccreditationNumber = "H10000001",
            SoftwareCertificateId = "KON-DUMMYCERTS-Z15445",
            BaseUrl = "https://staging.philhealth.gov.ph"
        };

        var data = await pcapiClient.AuthenticateAsync(tenant, cancellationToken);
        return new PcapiTokenResponse("success", 200, "Token retrieved successfully.", data);
    }
}
