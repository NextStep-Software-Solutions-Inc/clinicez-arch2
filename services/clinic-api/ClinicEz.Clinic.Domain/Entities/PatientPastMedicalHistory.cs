using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientPastMedicalHistory : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid PatientId { get; set; }
    public ClinicPatient? Patient { get; set; }

    /// <summary>
    /// Clinical description of the condition (e.g. "Hypertension", "Asthma", "Allergy", "Peptic Ulcer").
    /// </summary>
    public required string ConditionTitle { get; set; }

    /// <summary>
    /// Direct link to PhilHealth lib_mdiseases code (e.g. "001", "002", "011", "998").
    /// </summary>
    public string? PhilHealthMdiseaseCode { get; set; }

    /// <summary>
    /// Optional ICD-10 diagnostic code (e.g. "I10", "J45.9").
    /// </summary>
    public string? Icd10Code { get; set; }

    /// <summary>
    /// Free-text description for PhilHealth '998 Others' or custom diagnosis notes.
    /// </summary>
    public string? SpecificDescription { get; set; }

    /// <summary>
    /// Documented date or approximate year of diagnosis/onset.
    /// </summary>
    public DateOnly? OnsetDate { get; set; }

    /// <summary>
    /// Indicates whether the condition is resolved (e.g. childhood pneumonia, cured infection) or active chronic.
    /// </summary>
    public bool IsResolved { get; set; } = false;

    /// <summary>
    /// Clinical notes regarding severity, medication control, or clinical context.
    /// </summary>
    public string? ClinicalNotes { get; set; }
}
