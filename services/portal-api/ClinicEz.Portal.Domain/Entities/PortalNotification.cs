using System;
using ClinicEz.Portal.Domain.Common;

namespace ClinicEz.Portal.Domain.Entities;

public class PortalNotification : BaseEntity
{
    public Guid TenantId { get; set; }
    public string? UserId { get; set; }
    public required string Title { get; set; }
    public required string Body { get; set; }
    public string Category { get; set; } = "System";
    public string Severity { get; set; } = "Info";
    public string? ActionUrl { get; set; }
    public bool IsRead { get; set; } = false;
    public DateTime? ReadAt { get; set; }
}
