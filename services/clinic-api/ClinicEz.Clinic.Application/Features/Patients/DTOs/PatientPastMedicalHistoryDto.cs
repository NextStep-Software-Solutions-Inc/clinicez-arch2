using System;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record PatientPastMedicalHistoryDto(
    Guid Id,
    Guid PatientId,
    string ConditionTitle,
    string? PhilHealthMdiseaseCode,
    string? Icd10Code,
    string? SpecificDescription,
    DateOnly? OnsetDate,
    bool IsResolved,
    string? ClinicalNotes,
    DateTime CreatedAt);
