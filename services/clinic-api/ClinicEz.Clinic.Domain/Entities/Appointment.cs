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
}
