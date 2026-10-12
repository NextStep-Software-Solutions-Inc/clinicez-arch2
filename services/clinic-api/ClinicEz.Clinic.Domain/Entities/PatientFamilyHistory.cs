using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientFamilyHistory : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid PatientId { get; set; }
    public ClinicPatient? Patient { get; set; }

    /// <summary>
    /// Clinical description of the hereditary/familial condition (e.g. "Diabetes Mellitus", "Coronary Artery Disease", "Cancer", "Hypertension").
    /// </summary>
    public required string ConditionTitle { get; set; }

    /// <summary>
    /// Direct link to PhilHealth lib_mdiseases code (e.g. "006", "005", "003", "011", "998").
    /// </summary>
    public string? PhilHealthMdiseaseCode { get; set; }

    /// <summary>
    /// Optional ICD-10 diagnostic code.
    /// </summary>
    public string? Icd10Code { get; set; }

    /// <summary>
    /// Free-text description for PhilHealth '998 Others' or custom familial condition description.
    /// </summary>
    public string? SpecificDescription { get; set; }

    /// <summary>
    /// Relationship of the affected family member (e.g. "Father", "Mother", "Sibling", "Maternal Grandfather", "First-degree relative").
    /// </summary>
    public string? Relationship { get; set; }

    /// <summary>
    /// Clinical notes or pedigree context (e.g. age of onset in relatives, lineage details).
    /// </summary>
    public string? ClinicalNotes { get; set; }
}
