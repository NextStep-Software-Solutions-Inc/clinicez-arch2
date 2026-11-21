using ClinicEz.Portal.Domain.Common;
using System;

namespace ClinicEz.Portal.Domain.Entities;

public class AdminUser : BaseEntity
{
    public string? ClerkUserId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public Guid RoleId { get; set; }
    public AdminRole? Role { get; set; }
    public bool IsActive { get; set; } = true;

    // Invitation & Account Status Tracking
    public AdminUserStatus Status { get; set; } = AdminUserStatus.Active;
    public string? InvitationToken { get; set; }
    public DateTime? InvitationExpiresAt { get; set; }
    public DateTime? JoinedAt { get; set; }
}
