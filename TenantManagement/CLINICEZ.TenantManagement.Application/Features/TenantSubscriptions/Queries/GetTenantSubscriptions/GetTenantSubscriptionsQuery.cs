using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Application.Features.TenantSubscriptions.Dtos;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.TenantSubscriptions.Queries.GetTenantSubscriptions;

public class GetTenantSubscriptionsQuery : IRequest<PaginatedApiResponse<TenantSubscriptionDto>>
{
    public int PageNumber { get; set; } = 1;
    public int PageSize { get; set; } = 10;
    public string? Filters { get; set; }
    public string? Sorts { get; set; }
}
