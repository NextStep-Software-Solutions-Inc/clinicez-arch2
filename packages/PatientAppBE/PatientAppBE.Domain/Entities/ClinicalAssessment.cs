using PatientAppBE.Domain.Common;
using PatientAppBE.Domain.Enums;

namespace PatientAppBE.Domain.Entities;

/// <summary>Provider-documented clinical assessments — pushed from Clinic Dashboard, read-only for patient.</summary>
public sealed class ClinicalAssessment : BaseEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;
    public Guid? ClinicId { get; set; }

    public ClinicalAssessmentType AssessmentType { get; set; }
    public DateOnly Date { get; set; }
    public string? AssessedBy { get; set; }
    /// <summary>JSON object — type-specific scores (PHQ-9 score, GAD-7 score, etc.)</summary>
    public string? ScoresJson { get; set; }
    /// <summary>JSON object — type-specific findings (cervical, breast exam findings, etc.)</summary>
    public string? FindingsJson { get; set; }

    public DateTime? SyncedAt { get; set; }
    public string? ServerId { get; set; }
}
