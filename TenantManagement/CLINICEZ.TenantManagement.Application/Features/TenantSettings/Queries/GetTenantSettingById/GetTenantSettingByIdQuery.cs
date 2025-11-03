using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Domain.Entities;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.TenantSettings.Queries.GetTenantSettingById;

public record GetTenantSettingByIdQuery(Guid Id) : IRequest<ApiResponse<TenantSetting>>;
