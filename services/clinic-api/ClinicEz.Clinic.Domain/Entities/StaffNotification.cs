using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public enum NotificationUrgency
{
    Routine = 0,
    Urgent = 1,
    Stat = 2
}

public enum StaffNotificationCategory
{
    LabResult = 0,
    Queue = 1,
    ClinicalAlert = 2,
    System = 3,
    Appointment = 4
}

public sealed class StaffNotification : ClinicScopedEntity
{
    public Guid? RecipientStaffId { get; set; }
    public string? RecipientRole { get; set; } // e.g. "Doctor", "Nurse", null for All
    public required string Title { get; set; }
    public required string Body { get; set; }
    public StaffNotificationCategory Category { get; set; }
    public NotificationUrgency Urgency { get; set; } = NotificationUrgency.Routine;
    public string? ActionRoute { get; set; } // e.g. "ResultReview", "Consultations"
    public string? ActionParamsJson { get; set; } // e.g. { "orderId": "..." }
    public string? SourceType { get; set; } // "LabOrder", "QueueItem"
    public string? SourceId { get; set; }
    public bool IsRead { get; set; } = false;
    public DateTime? ReadAt { get; set; }
}
