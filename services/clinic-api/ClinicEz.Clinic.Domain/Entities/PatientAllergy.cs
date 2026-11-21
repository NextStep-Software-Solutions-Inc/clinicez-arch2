using System;
using ClinicEz.Clinic.Domain.Common;

namespace ClinicEz.Clinic.Domain.Entities;

public enum AllergyCategory
{
    Medication = 1,
    Food = 2,
    Environmental = 3,
    Biologic = 4,
    Other = 5
}

public enum AllergySeverity
{
    Mild = 1,
    Moderate = 2,
    Severe = 3,
    LifeThreatening = 4 // Anaphylaxis
}

public enum AllergyStatus
{
    Active = 1,
    Inactive = 2,
    Refuted = 3
}

public sealed class PatientAllergy : ClinicScopedEntity
{
    public Guid PatientId { get; set; }
    public Patient Patient { get; set; } = null!;

    public AllergyCategory Category { get; set; } = AllergyCategory.Medication;
    public required string Allergen { get; set; } // e.g. "Penicillin", "Amoxicillin", "Peanuts"
    
    /// <summary>PNF generic code or RxNorm concept code for medication cross-reactivity screening.</summary>
    public string? AllergenDrugCode { get; set; }

    public AllergySeverity Severity { get; set; } = AllergySeverity.Moderate;
    public string? ReactionManifestation { get; set; } // e.g. "Angioedema, Bronchospasm, Urticaria"
    public bool IsAnaphylactic { get; set; } = false;

    public AllergyStatus Status { get; set; } = AllergyStatus.Active;
    public DateOnly? OnsetDate { get; set; }
    public string? Notes { get; set; }
}
