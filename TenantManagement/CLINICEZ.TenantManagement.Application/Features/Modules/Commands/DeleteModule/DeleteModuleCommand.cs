using CLINICEZ.Shared.Common;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.Modules.Commands.DeleteModule;

public record class DeleteModuleCommand(Guid Id) : IRequest<ApiResponse<Unit>>;
