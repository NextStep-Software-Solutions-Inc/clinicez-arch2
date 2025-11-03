using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Application.Features.Tenants.Dtos;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.Tenants.Queries.GetTenantById;

public record GetTenantByIdQuery(Guid Id) : IRequest<ApiResponse<TenantDto>>;