using CLINICEZ.Shared.Common;
using CLINICEZ.TenantManagement.Domain.Enums;
using MediatR;

namespace CLINICEZ.TenantManagement.Application.Features.TenantMembers.Commands.CreateTenantMember;

public class CreateTenantMemberCommand : IRequest<ApiResponse<Guid>>
{
    public Guid TenantId { get; set; }
    public string UserId { get; set; } = string.Empty;
    public TenantMemberRole Role { get; set; }
    public Status Status { get; set; }
}
