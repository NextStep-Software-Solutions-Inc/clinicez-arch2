using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

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
}
