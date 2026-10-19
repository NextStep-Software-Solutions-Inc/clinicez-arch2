using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public enum ProblemStatus
{
    Active = 1,
    Resolved = 2,
    Inactive = 3,
    Relapsed = 4
}

public enum ProblemSeverity
{
    Mild = 1,
    Moderate = 2,
    Severe = 3
}

public sealed class PatientProblem : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid PatientId { get; set; }
    public Guid? ConsultationEncounterId { get; set; }

    public required string Icd10Code { get; set; } // e.g. "I10", "E11.9"
    public required string ProblemTitle { get; set; }

    /// <summary>Direct link to PhilHealth lib_mdiseases code for 1:1 Yakap MEDHIST generation.</summary>
    public string? PhilHealthMdiseaseCode { get; set; }

    public ProblemStatus Status { get; set; } = ProblemStatus.Active;
    public ProblemSeverity Severity { get; set; } = ProblemSeverity.Moderate;
    public bool IsChronicNcd { get; set; } = false;

    public DateOnly? OnsetDate { get; set; }
    public DateOnly? ResolvedDate { get; set; }
    public string? ClinicalNotes { get; set; }

    public Guid RecordedByDoctorId { get; set; }
    public required string RecordedByDoctorName { get; set; }
}
