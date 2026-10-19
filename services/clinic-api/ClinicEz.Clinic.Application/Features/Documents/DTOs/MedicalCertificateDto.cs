using System;

namespace ClinicEz.Clinic.Application.Features.Documents.DTOs;

public sealed record MedicalCertificateDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    string CertificateNumber,
    Guid PatientId,
    string PatientName,
    Guid? ConsultationId,
    Guid DoctorId,
    string DoctorName,
    string PrcLicenseNumber,
    string? PtrNumber,
    DateOnly IssueDate,
    string Diagnosis,
    string? ClinicalFindings,
    string FitnessStatus,
    int? RecommendedRestDays,
    DateOnly? RestStartDate,
    DateOnly? RestEndDate,
    string Purpose,
    string? Remarks,
    bool IsSigned,
    DateTime? SignedAt,
    DateTime CreatedAt);
