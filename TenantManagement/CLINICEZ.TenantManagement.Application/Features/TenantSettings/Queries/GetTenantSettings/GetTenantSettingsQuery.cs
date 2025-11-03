using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Domain.Entities;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.TenantSettings.Queries.GetTenantSettings;

public class GetTenantSettingsQuery : IRequest<PaginatedApiResponse<TenantSetting>>
{
    public int PageNumber { get; set; } = 1;
    public int PageSize { get; set; } = 10;
    public string? Filters { get; set; }
    public string? Sorts { get; set; }
}
