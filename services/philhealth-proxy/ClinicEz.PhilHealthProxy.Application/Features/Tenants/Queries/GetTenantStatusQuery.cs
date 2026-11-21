using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Domain.Interfaces;
using ClinicEz.PhilHealthProxy.Domain.Models;
using MediatR;

namespace ClinicEz.PhilHealthProxy.Application.Features.Tenants.Queries;

public sealed record GetTenantStatusQuery(Guid TenantId, Guid? BranchId = null) : IRequest<TenantConfigurationStatusResponse>;

public sealed class GetTenantStatusQueryHandler(ITenantRepository tenantRepo)
    : IRequestHandler<GetTenantStatusQuery, TenantConfigurationStatusResponse>
{
    public async Task<TenantConfigurationStatusResponse> Handle(GetTenantStatusQuery query, CancellationToken ct)
    {
        var tenant = query.BranchId.HasValue
            ? await tenantRepo.GetByBranchIdAsync(query.BranchId.Value, ct)
            : await tenantRepo.GetByTenantIdAsync(query.TenantId, ct);

        if (tenant == null)
        {
            return new TenantConfigurationStatusResponse(
                query.TenantId,
                query.BranchId,
                string.Empty,
                string.Empty,
                string.Empty,
                string.Empty,
                HasSecretKey: false,
                HasCipherKey: false,
                BaseUrl: "https://staging.philhealth.gov.ph",
                IsActive: false,
                UpdatedAt: null);
        }

        return new TenantConfigurationStatusResponse(
            tenant.TenantId,
            tenant.BranchId,
            tenant.FacilityName,
            tenant.AccreditationNumber,
            tenant.PmccNumber,
            tenant.SoftwareCertificateId,
            HasSecretKey: !string.IsNullOrEmpty(tenant.EncryptedSecretKey),
            HasCipherKey: !string.IsNullOrEmpty(tenant.EncryptedCipherKey),
            tenant.BaseUrl,
            tenant.IsActive,
            tenant.UpdatedAt);
    }
}
