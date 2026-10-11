using System;

namespace ClinicEz.Clinic.Application.Features.Allergies.Dtos;

public record PatientAllergyDto(
    Guid Id,
    Guid ClinicId,
    Guid PatientId,
    string Category,
    string Allergen,
    string? AllergenDrugCode,
    string Severity,
    string? ReactionManifestation,
    bool IsAnaphylactic,
    string Status,
    DateOnly? OnsetDate,
    string? Notes,
    DateTime CreatedAt
);
