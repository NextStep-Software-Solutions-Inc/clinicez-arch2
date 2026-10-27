using System;

namespace ClinicEz.MediaBroker.Domain.Entities;

public sealed class MediaAuditLog
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string TenantId { get; set; } = string.Empty;
    public Guid CallId { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string Details { get; set; } = string.Empty;
    public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;
}
