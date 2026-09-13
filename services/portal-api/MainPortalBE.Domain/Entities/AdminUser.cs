using MainPortalBE.Domain.Common;
using System;

namespace MainPortalBE.Domain.Entities;

public class AdminUser : BaseEntity
{
    public string ClerkUserId { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public Guid RoleId { get; set; }
    public AdminRole? Role { get; set; }
    public bool IsActive { get; set; } = true;
}
