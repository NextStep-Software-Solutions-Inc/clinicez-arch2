using System;
using ClinicEz.Clinic.Domain.Common;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientFamilyHistory : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient? Patient { get; set; }

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
    /// Relationship of the affected family member.
    /// </summary>
    public FamilyRelationship Relationship { get; set; } = FamilyRelationship.Other;

    public int? RelativeAgeAtOnset { get; set; }
    public bool? IsRelativeDeceased { get; set; }

    /// <summary>
    /// Clinical notes or pedigree context (e.g. age of onset in relatives, lineage details).
    /// </summary>
    public string? ClinicalNotes { get; set; }

    public string? ConditionCategoryCode { get; set; }
    public decimal? FbsMgDl { get; set; }
    public decimal? FbsMmolL { get; set; }
    public DateOnly? FbsDate { get; set; }
    public decimal? RbsMgDl { get; set; }
    public decimal? RbsMmolL { get; set; }
    public DateOnly? RbsDate { get; set; }
}
