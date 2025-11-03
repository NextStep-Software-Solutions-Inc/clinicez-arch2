using CLINICEZ.Shared.Common;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.Tenants.Commands.DeleteTenant;

public record DeleteTenantCommand(Guid Id) : IRequest<ApiResponse<Unit>>;