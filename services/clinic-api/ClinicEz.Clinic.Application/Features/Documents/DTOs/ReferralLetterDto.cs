using System;

namespace ClinicEz.Clinic.Application.Features.Documents.DTOs;

public sealed record ReferralLetterDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    string ReferralNumber,
    Guid PatientId,
    string PatientName,
    Guid? ConsultationId,
    Guid ReferringDoctorId,
    string ReferringDoctorName,
    string? ReferredToDoctor,
    string ReferredToFacility,
    string ReferredDepartment,
    DateOnly ReferralDate,
    string Urgency,
    string ReasonForReferral,
    string ProvisionalDiagnosis,
    string ClinicalSummary,
    string? CurrentMedications,
    string? AttachedDiagnostics,
    bool IsSigned,
    DateTime? SignedAt,
    DateTime CreatedAt,
    string? SecurityDigest = null);
