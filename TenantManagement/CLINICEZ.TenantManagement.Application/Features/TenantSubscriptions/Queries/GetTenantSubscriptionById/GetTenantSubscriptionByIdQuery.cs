using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Application.Features.TenantSubscriptions.Dtos;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.TenantSubscriptions.Queries.GetTenantSubscriptionById;

public record GetTenantSubscriptionByIdQuery(Guid Id) : IRequest<ApiResponse<TenantSubscriptionDto>>;
