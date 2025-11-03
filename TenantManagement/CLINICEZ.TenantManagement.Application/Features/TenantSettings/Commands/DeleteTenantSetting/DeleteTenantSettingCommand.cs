using CLINICEZ.Shared.Common;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.TenantSettings.Commands.DeleteTenantSetting;

public record DeleteTenantSettingCommand(Guid Id) : IRequest<ApiResponse<Unit>>;