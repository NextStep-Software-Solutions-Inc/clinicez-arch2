using System;

namespace ClinicEz.Clinic.Application.Features.Problems.Dtos;

public record PatientProblemDto(
    Guid Id,
    Guid ClinicId,
    Guid PatientId,
    Guid? ConsultationEncounterId,
    string Icd10Code,
    string ProblemTitle,
    string? PhilHealthMdiseaseCode,
    string Status,
    string Severity,
    bool IsChronicNcd,
    DateOnly? OnsetDate,
    DateOnly? ResolvedDate,
    string? ClinicalNotes,
    Guid RecordedByDoctorId,
    string RecordedByDoctorName,
    DateTime CreatedAt
);
