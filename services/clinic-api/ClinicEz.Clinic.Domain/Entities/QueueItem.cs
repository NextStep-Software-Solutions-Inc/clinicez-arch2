using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class QueueItem : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }

    /// <summary>
    /// Formatted daily ticket number e.g. "Q-001"
    /// </summary>
    public required string QueueNumber { get; set; }
    public int SequenceNumber { get; set; }
    public DateOnly QueueDate { get; set; }

    public Guid PatientId { get; set; }
    public required string PatientName { get; set; }

    public Guid? AppointmentId { get; set; }
    public Appointment? Appointment { get; set; }

    public Guid? DoctorId { get; set; }
    public string? DoctorName { get; set; }

    /// <summary>
    /// Stored as string in database: "Routine", "Urgent", "Emergency"
    /// </summary>
    public QueuePriority Priority { get; set; } = QueuePriority.Routine;

    /// <summary>
    /// Stored as string in database: "Waiting", "Triaged", "InConsultation", "Completed", "Cancelled", "NoShow"
    /// </summary>
    public QueueStatus Status { get; set; } = QueueStatus.Waiting;

    public DateTime CheckInTime { get; set; } = DateTime.UtcNow;
    public DateTime? CalledTime { get; set; }
    public DateTime? CompletedTime { get; set; }

    public string? ChiefComplaint { get; set; }

    // Navigations
    public TriageVitals? TriageVitals { get; set; }
    public ConsultationEncounter? Consultation { get; set; }
}
