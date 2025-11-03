using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Application.Features.Tenants.Dtos;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.Tenants.Commands.UpdateTenant;

public sealed class UpdateTenantCommand : IRequest<ApiResponse<Guid>>
{
    public Guid Id { get; set; }
    public required UpdateTenantDto UpdateTenant { get; set; }
}