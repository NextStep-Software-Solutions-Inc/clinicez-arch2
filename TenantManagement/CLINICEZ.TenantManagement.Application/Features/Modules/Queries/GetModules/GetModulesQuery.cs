using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Application.Common;
using CLINICEZ.TenantManagement.Domain.Entities;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.Modules.Queries.GetModules;

public class GetModulesQuery : IRequest<PaginatedApiResponse<Module>>
{
    public int PageNumber { get; set; } = 1;
    public int PageSize { get; set; } = 10;
    public string? Filters { get; set; }
    public string? Sorts { get; set; }
}
