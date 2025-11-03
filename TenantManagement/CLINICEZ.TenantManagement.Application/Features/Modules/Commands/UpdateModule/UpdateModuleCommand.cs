using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Application.Features.Modules.Dtos;
using CLINICEZ.TenantManagement.Domain.Entities;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.Modules.Commands.UpdateModule;

public sealed class UpdateModuleCommand :IRequest<ApiResponse<Module>>
{
    public Guid Id { get; set; }
    public required UpdateModuleDto UpdateModule { get; set; }
}
