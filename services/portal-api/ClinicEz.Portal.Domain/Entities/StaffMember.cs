namespace ClinicEz.Portal.Domain.Entities;

using ClinicEz.Portal.Domain.Common;
using System;

public class StaffMember : BaseEntity
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;

    public string? UserId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Role { get; set; } = "Staff"; // "Owner", "Admin", "Doctor", "Nurse", "Receptionist", "Staff"
    public string Status { get; set; } = "Active"; // "Active", "PendingInvitation", "Suspended"

    public Guid? FacilityId { get; set; }
    public Facility? Facility { get; set; }

    public string? InvitationToken { get; set; }
    public DateTime? InvitationExpiresAt { get; set; }
    public DateTime? JoinedAt { get; set; }
}
