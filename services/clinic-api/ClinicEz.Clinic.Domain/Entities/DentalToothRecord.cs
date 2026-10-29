using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

/// <summary>
/// Relational record for a patient's individual tooth state in the dental odontogram.
/// Tracks tooth status, affected surfaces, and clinical notes across encounters.
/// </summary>
public sealed class DentalToothRecord : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient? Patient { get; set; }
    public string? PatientName { get; set; }
    public Guid? ConsultationId { get; set; }

    /// <summary>
    /// FDI World Dental Federation notation (ISO 3950):
    /// Adult teeth: 11-18, 21-28, 31-38, 41-48
    /// Primary/Child teeth: 51-55, 61-65, 71-75, 81-85
    /// </summary>
    public int ToothNumber { get; set; }

    public ToothStatus Status { get; set; } = ToothStatus.Healthy;

    /// <summary>
    /// Comma-separated or combined tooth surfaces originally recorded at the time of the encounter:
    /// M (Mesial), O (Occlusal), D (Distal), B (Buccal), L (Lingual).
    /// Standardized to uppercase (e.g. "MOD", "DO", "B").
    /// Immutable across future encounters so historical visit logs remain accurate.
    /// </summary>
    public string? Surface { get; set; }

    /// <summary>
    /// Surfaces from this record that remain currently active on the tooth (e.g. "M" after "O" is later filled).
    /// Null when whole-tooth or when all surfaces of this record have been superseded.
    /// </summary>
    public string? ActiveSurface { get; set; }

    /// <summary>
    /// True while this record still governs the whole tooth or at least one active surface;
    /// false once superseded by a newer treatment, extraction (Missing), or Healthy reset.
    /// </summary>
    public bool IsCurrent { get; set; } = true;

    public DateTime? SupersededAt { get; set; }
    public Guid? SupersededByRecordId { get; set; }
    public string? RecordedBy { get; set; }

    public string? Notes { get; set; }

    /// <summary>
    /// True when this signed/committed tooth condition was voided by a clinician to correct an error
    /// while preserving the clinical audit trail.
    /// </summary>
    public bool IsVoided { get; set; } = false;
    public DateTime? VoidedAt { get; set; }
    public string? VoidedBy { get; set; }
    public string? VoidReason { get; set; }
}
