namespace CLINICEZ.TenantManagement.Application.Features.TenantMembers.Dtos;

public class TenantMemberDto
{
    public Guid Id { get; set; }
    public Guid? TenantId { get; set; }
    public string? UserId { get; set; }
    public string? Role { get; set; }
    public string? Status { get; set; }
}
