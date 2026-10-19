using System;

namespace ClinicEz.Clinic.Application.Features.Allergies.Dtos;

public sealed record CreateAllergyRequest(
    string Category = "Medication",
    string Allergen = "",
    string? AllergenDrugCode = null,
    string Severity = "Moderate",
    string? ReactionManifestation = null,
    bool IsAnaphylactic = false,
    DateOnly? OnsetDate = null,
    string? Notes = null
);
