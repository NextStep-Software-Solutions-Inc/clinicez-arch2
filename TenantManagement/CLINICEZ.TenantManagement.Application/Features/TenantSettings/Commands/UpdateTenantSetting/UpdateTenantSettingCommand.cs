using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Application.Features.TenantSettings.Dtos;
using CLINICEZ.TenantManagement.Domain.Entities;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.TenantSettings.Commands.UpdateTenantSetting;

public sealed class UpdateTenantSettingCommand : IRequest<ApiResponse<Guid>>
{
    public Guid Id { get; set; }
    public required UpdateTenantSettingDto UpdateTenantSetting { get; set; }
}
