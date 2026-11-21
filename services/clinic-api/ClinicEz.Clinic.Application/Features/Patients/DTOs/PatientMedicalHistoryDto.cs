using System;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record PatientMedicalHistoryDto(
    Guid? Id,
    string Category,
    string VerificationStatus,
    string ConditionTitle,
    string? Icd10Code = null,
    string? SnomedCode = null,
    string? PhilHealthMdiseaseCode = null,
    string? SpecificDescription = null,
    string Status = "Active",
    string? Severity = null,
    bool IsChronicNcd = false,
    DateOnly? OnsetDate = null,
    DateOnly? ResolvedDate = null,
    Guid? ConsultationEncounterId = null,
    string? ClinicalNotes = null,
    Guid? RecordedByStaffId = null,
    string? RecordedByStaffName = null
);
