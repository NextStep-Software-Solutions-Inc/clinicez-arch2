using ClinicEz.Patient.Domain.Common;
using ClinicEz.Patient.Domain.Enums;

namespace ClinicEz.Patient.Domain.Entities;

public sealed class Appointment : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
    public Guid ClinicId { get; set; }
    public Guid ProviderId { get; set; }

    public string? Subject { get; set; }
    public string? ChiefComplaint { get; set; }
    public string? Notes { get; set; }
    public string AttachedFileIdsJson { get; set; } = "[]";

    public string? ServiceType { get; set; }
    public DateTime ScheduledAt { get; set; }
    public int DurationMinutes { get; set; }
    public AppointmentStatus Status { get; set; }

    // Raw payload from Clinic Dashboard for lossless deserialization
    public DateTime CachedAt { get; set; }
    public string RawJson { get; set; } = string.Empty;
}
