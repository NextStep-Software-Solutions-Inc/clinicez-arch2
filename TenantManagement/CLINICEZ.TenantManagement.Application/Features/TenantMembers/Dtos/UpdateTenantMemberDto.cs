using CLINICEZ.TenantManagement.Domain.Enums;

namespace CLINICEZ.TenantManagement.Application.Features.TenantMembers.Dtos;

public class UpdateTenantMemberDto
{
    public Guid? TenantId { get; set; }
    public string? UserId { get; set; }
    public TenantMemberRole? Role { get; set; }
    public Status? Status { get; set; }
}
