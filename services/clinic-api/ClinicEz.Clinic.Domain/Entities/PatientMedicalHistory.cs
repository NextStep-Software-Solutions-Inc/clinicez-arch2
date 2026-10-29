using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientMedicalHistory : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public MedicalHistoryCategory Category { get; set; } = MedicalHistoryCategory.MedicalHistory;
    public ConditionVerificationStatus VerificationStatus { get; set; } = ConditionVerificationStatus.Confirmed;
    public string ConditionTitle { get; set; } = string.Empty;
    public string? Icd10Code { get; set; }
    public string? SnomedCode { get; set; }
    public string? PhilHealthMdiseaseCode { get; set; }
    public string? SpecificDescription { get; set; }

    public ProblemStatus Status { get; set; } = ProblemStatus.Active;
    public ProblemSeverity? Severity { get; set; }
    public bool IsChronicNcd { get; set; }

    public DateOnly? OnsetDate { get; set; }
    public DateOnly? ResolvedDate { get; set; }

    public bool? IsOnDialysis { get; set; }
    public string? DialysisType { get; set; }
    public int? DialysisYearStarted { get; set; }

    public Guid? ConsultationEncounterId { get; set; }
    public ConsultationEncounter? ConsultationEncounter { get; set; }

    public string? ClinicalNotes { get; set; }
    public Guid? RecordedByStaffId { get; set; }
    public string? RecordedByStaffName { get; set; }
}
