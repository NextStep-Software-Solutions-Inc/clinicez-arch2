using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Domain.Entities;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.TenantMembers.Queries.GetTenantMemberByIdQuery;

public record class GetTenantMemberByIdQuery(Guid Id) : IRequest<ApiResponse<TenantMember>>;
