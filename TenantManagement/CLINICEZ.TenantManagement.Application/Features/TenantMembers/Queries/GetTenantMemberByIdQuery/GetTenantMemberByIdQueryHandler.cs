using CLINICEZ.Shared.Common;
using CLINICEZ.Shared.Exceptions;
using CLINICEZ.TenantManagement.Domain.Entities;
using CLINICEZ.TenantManagement.Domain.Interfaces;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.TenantMembers.Queries.GetTenantMemberByIdQuery;

public class GetTenantMemberByIdQueryHandler(IUnitOfWork unitOfWork) : IRequestHandler<GetTenantMemberByIdQuery, ApiResponse<TenantMember>>
{
    public async Task<ApiResponse<TenantMember>> Handle(
        GetTenantMemberByIdQuery request,
        CancellationToken cancellationToken)
    {
        var tenantSetting = await unitOfWork.TenantMemberRepository.GetByIdAsync(request.Id, cancellationToken: cancellationToken) ?? throw new NotFoundException("Tenant member not found.");

        return ApiResponse<TenantMember>.Success(tenantSetting, "Tenant member retrieved successfully.");
    }
}
