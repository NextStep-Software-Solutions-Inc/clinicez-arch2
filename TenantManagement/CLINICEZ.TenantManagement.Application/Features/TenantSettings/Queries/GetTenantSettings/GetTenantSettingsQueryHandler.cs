using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Domain.Entities;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using MediatR;
using Sieve.Models;

namespace CLINICEZ.TenantManagement.Application.Features.TenantSettings.Queries.GetTenantSettings;

public sealed class GetTenantSettingsQueryHandler (IUnitOfWork unitOfWork) : IRequestHandler<GetTenantSettingsQuery, PaginatedApiResponse<TenantSetting>>
{
    public async Task<PaginatedApiResponse<TenantSetting>> Handle(GetTenantSettingsQuery query, CancellationToken cancellationToken)
    {
        var sieveModel = new SieveModel
        {
            PageSize = query.PageSize,
            Page = query.PageNumber,
            Filters = query.Filters,
            Sorts = query.Sorts
        };
        var (tenantSettings, totalCount) = await unitOfWork.TenantSettingRepository.GetAllAsync(sieveModel, cancellationToken: cancellationToken);

        return new PaginatedApiResponse<TenantSetting>(
            [.. tenantSettings],
            query.PageNumber,
            query.PageSize,
            totalCount);
    }
}
