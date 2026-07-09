using PatientApp.Domain.Common;
using PatientApp.Domain.Enums;

namespace PatientApp.Domain.Entities;

public sealed class Notification : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public NotificationType Type { get; set; }
    public NotificationCategory Category { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public bool IsRead { get; set; }
    public DateTime? ReadAt { get; set; }
    public DateTime? ExpiresAt { get; set; }
    /// <summary>Reference to the triggering entity (appointment id, clinic id, etc.)</summary>
    public string? SourceId { get; set; }
    /// <summary>JSON-encoded extra data, e.g. { appointmentId, clinicId }</summary>
    public string? Payload { get; set; }
}
