using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Sharing;

namespace ClinicEz.Patient.Application.Features.Documents;

/// <summary>Whether the patient still has to pay for a lab request; serialised by member name in <see cref="LabRequestDto.PaymentStatus"/>.</summary>
public enum LabPaymentStatus { None, Pending, Paid }

public sealed record LabRequestItemDto(string Code, string Name, string Category);

public sealed record LabRequestDto(
    Guid Id,
    Guid RequisitionId,
    string OrderingTenantId,
    string OrderingFacilityId,
    string OrderingFacilityName,
    string AccessionNumber,
    string Title,
    string Urgency,
    IReadOnlyList<LabRequestItemDto> Items,
    string Stage,
    decimal? QuotedAmount,
    string? Currency,
    bool PaymentRequired,
    string PaymentStatus,
    string? LaboratoryName,
    string? ClaimToken,
    string? Reason,
    DateTime IssuedAt,
    DateTime UpdatedAt);

public sealed record PrescriptionItemViewDto(
    string GenericName,
    string? BrandName,
    string Dosage,
    string Form,
    string Sig,
    int Quantity,
    int? DurationDays,
    string? Remarks);

public sealed record PrescriptionDto(
    Guid Id,
    string PrescriptionNumber,
    string OrderingTenantId,
    string OrderingFacilityId,
    string OrderingFacilityName,
    string PrescriberName,
    string PrescriberPrcLicense,
    string? Diagnosis,
    string? Instructions,
    IReadOnlyList<PrescriptionItemViewDto> Items,
    string Stage,
    decimal? QuotedAmount,
    string? PharmacyName,
    string? ClaimToken,
    string? VerificationUrl,
    string? ReceiptNumber,
    DateTime? DispensedAt,
    string? ExternalPharmacyName,
    DateTime IssuedAt,
    DateTime UpdatedAt);

public sealed record LabObservationDto(string Panel, string Name, string Value, string Unit, string ReferenceRange, string Flag);

public sealed record LabResultDto(
    Guid Id,
    Guid? RequisitionId,
    string LaboratoryName,
    string Title,
    string Source,
    string Verification,
    string? ReviewedByName,
    DateTime? ReviewedAt,
    string? Remarks,
    string? Impression,
    bool IsCritical,
    DateTime ResultedAt,
    string? FileUrl,
    IReadOnlyList<LabObservationDto> Observations,
    DateTime UpdatedAt);

public sealed record MedicalCertificateDto(
    Guid Id,
    string CertificateNumber,
    string IssuerName,
    string DoctorName,
    string DoctorPrcLicense,
    string Purpose,
    string? Diagnosis,
    string? Remarks,
    int? RestDays,
    DateTime? ValidFrom,
    DateTime? ValidTo,
    string? VerificationUrl,
    DateTime IssuedAt,
    DateTime UpdatedAt);

/// <summary>One page of the incremental pull: rows changed since the caller's cursor.</summary>
public sealed record SyncChangesDto(
    string Cursor,
    bool HasMore,
    IReadOnlyList<LabRequestDto> LabRequests,
    IReadOnlyList<PrescriptionDto> Prescriptions,
    IReadOnlyList<LabResultDto> LabResults,
    IReadOnlyList<MedicalCertificateDto> MedicalCertificates,
    IReadOnlyList<AccessGrantDto> Grants,
    IReadOnlyList<NotificationDto> Notifications);