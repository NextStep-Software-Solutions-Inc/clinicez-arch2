using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Domain.Entities;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.Modules.Commands.CreateModule;

public class CreateModuleCommand : IRequest<ApiResponse<Guid>>
{
    public string Name { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty ;
    public string? Description { get; set; }
    public bool IsActive { get; set; }
}
