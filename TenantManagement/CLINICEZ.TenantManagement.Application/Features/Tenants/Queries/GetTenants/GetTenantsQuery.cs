using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Application.Features.Tenants.Dtos;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.Tenants.Queries.GetTenants;

public class GetTenantsQuery : IRequest<PaginatedApiResponse<TenantDto>>
{
    public int PageNumber {  get; set; } = 1;
    public int PageSize { get; set; } = 10;
    public string? Filters { get; set; }
    public string? Sorts { get; set; }
}
