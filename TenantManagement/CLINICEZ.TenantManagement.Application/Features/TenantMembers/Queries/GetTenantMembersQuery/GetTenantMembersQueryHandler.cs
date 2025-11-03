using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Domain.Entities;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using MediatR;
using Sieve.Models;

namespace CLINICEZ.TenantManagement.Application.Features.TenantMembers.Queries.GetTenantMembersQuery;

public class GetTenantMembersQueryHandler(IUnitOfWork unitOfWork) : IRequestHandler<GetTenantMembersQuery, PaginatedApiResponse<TenantMember>>
{
    public async Task<PaginatedApiResponse<TenantMember>> Handle(GetTenantMembersQuery query, CancellationToken cancellationToken)
    {
        var sieveModel = new SieveModel
        {
            PageSize = query.PageSize,
            Page = query.PageNumber,
            Filters = query.Filters,
            Sorts = query.Sorts
        };
        var (tenantMembers, totalCount) = await unitOfWork.TenantMemberRepository.GetAllAsync(sieveModel, cancellationToken: cancellationToken);

        return new PaginatedApiResponse<TenantMember>(
            [.. tenantMembers],
            query.PageNumber,
            query.PageSize,
            totalCount);
    }
}
