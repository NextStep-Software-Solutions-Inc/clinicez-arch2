using System;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record PatientFamilyHistoryDto(
    Guid Id,
    Guid PatientId,
    string ConditionTitle,
    string? PhilHealthMdiseaseCode,
    string? Icd10Code,
    string? SpecificDescription,
    string? Relationship,
    string? ClinicalNotes,
    DateTime CreatedAt);
