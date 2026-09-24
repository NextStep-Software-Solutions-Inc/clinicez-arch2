using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class ConsultationEncounter : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }

    public Guid? QueueItemId { get; set; }
    public QueueItem? QueueItem { get; set; }

    public Guid? AppointmentId { get; set; }
    public Appointment? Appointment { get; set; }

    public Guid PatientId { get; set; }
    public required string PatientName { get; set; }

    public Guid DoctorId { get; set; }
    public required string DoctorName { get; set; }

    public DateTime EncounterDate { get; set; } = DateTime.UtcNow;

    // Structured SOAP Documentation
    public string Subjective { get; set; } = string.Empty;
    public string Objective { get; set; } = string.Empty;
    public string Assessment { get; set; } = string.Empty;
    public string Plan { get; set; } = string.Empty;

    // Physician credential snapshot at encounter signing
    public string? DoctorPrcLicense { get; set; }
    public string? DoctorPtr { get; set; }
    public string? DoctorS2License { get; set; }

    // Lock status
    public bool IsSigned { get; set; } = false;
    public DateTime? SignedAt { get; set; }

    // Navigations
    public ICollection<EncounterDiagnosis> Diagnoses { get; set; } = new List<EncounterDiagnosis>();
    public ICollection<PrescriptionItem> Prescriptions { get; set; } = new List<PrescriptionItem>();
}
