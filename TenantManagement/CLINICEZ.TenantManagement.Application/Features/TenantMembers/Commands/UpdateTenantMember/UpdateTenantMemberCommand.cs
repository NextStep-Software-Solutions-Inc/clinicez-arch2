using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Application.Features.TenantMembers.Dtos;
using CLINICEZ.TenantManagement.Domain.Entities;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.TenantMembers.Commands.UpdateTenantMember;

public class UpdateTenantMemberCommand : IRequest<ApiResponse<Guid>>
{
    public Guid Id { get; set; }
    public required UpdateTenantMemberDto UpdateTenantMember { get; set; }
}
