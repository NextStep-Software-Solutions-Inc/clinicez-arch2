using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Application.Common;
using CLINICEZ.TenantManagement.Domain.Entities;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using MediatR;
using Sieve.Models;

namespace CLINICEZ.TenantManagement.Application.Features.Modules.Queries.GetModules;


public class GetModulesQueryHandler (IUnitOfWork unitOfWork) : IRequestHandler<GetModulesQuery, PaginatedApiResponse<Module>>
{
    public async Task<PaginatedApiResponse<Module>> Handle(GetModulesQuery query, CancellationToken cancellationToken)
    {
        var sieveModel = new SieveModel
        {
            PageSize = query.PageSize,
            Page = query.PageNumber,
            Filters = query.Filters,
            Sorts = query.Sorts
        };
        var (modules, totalCount) = await unitOfWork.ModuleRepository.GetAllAsync(sieveModel, cancellationToken: cancellationToken);

        return new PaginatedApiResponse<Module>(
            [.. modules],
            query.PageNumber,
            query.PageSize,
            totalCount);
    }
}
