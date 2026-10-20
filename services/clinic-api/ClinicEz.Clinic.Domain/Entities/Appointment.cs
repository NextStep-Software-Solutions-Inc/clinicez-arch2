using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class Appointment : BaseEntity
{
    public string? TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid? DraftId { get; set; }
    public Guid PatientId { get; set; }
    public required string PatientName { get; set; }
    public Guid? DoctorId { get; set; }
    public string? DoctorName { get; set; }

    public DateTime ScheduledAt { get; set; }
    public int DurationMinutes { get; set; } = 30;

    private DateTime _endTimeUtc;
    public DateTime EndTimeUtc
    {
        get => _endTimeUtc == default && ScheduledAt != default
            ? ScheduledAt.AddMinutes(DurationMinutes > 0 ? DurationMinutes : 30)
            : _endTimeUtc;
        set => _endTimeUtc = value;
    }

    /// <summary>PostgreSQL xmin rowversion for optimistic concurrency checking.</summary>
    public uint Version { get; set; }

    /// <summary>
    /// Stored as string in database: "Pending", "Confirmed", "CheckedIn", "InConsultation", "Completed", "Cancelled"
    /// </summary>
    public AppointmentStatus Status { get; set; } = AppointmentStatus.Confirmed;

    public string? ServiceType { get; set; }
    public string? Reason { get; set; }
    public string? Notes { get; set; }
    public string ShareFieldsJson { get; set; } = "[]";
    public string AttachedFileIdsJson { get; set; } = "[]";

    /// <summary>The record sections the patient's booking grant covers (<c>None</c> when the booking carried no share).</summary>
    public SharingScopes SharedScopes { get; set; }

    /// <summary>The record items the patient shared with the booking, as a JSON array of <c>ShareItemDto</c>.</summary>
    public string SharedItemsJson { get; set; } = "[]";

    public bool Reminder24hSent { get; set; } = false;
    public bool Reminder2hSent { get; set; } = false;
    public DateTime? Reminder24hSentAt { get; set; }
    public DateTime? Reminder2hSentAt { get; set; }
    public DateTime? LastReminderSentAt { get; set; }
    public string? LastReminderType { get; set; }
}
