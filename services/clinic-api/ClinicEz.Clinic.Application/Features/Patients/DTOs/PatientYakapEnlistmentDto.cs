using System;

namespace ClinicEz.Clinic.Application.Features.Patients.DTOs;

public sealed record PatientYakapEnlistmentDto(
    Guid? Id,
    int EffectiveYear,
    string Status,
    string Source,
    string PackageType,
    DateOnly EnlistmentDate,
    DateOnly ValidUntil,
    string? CaseNo = null,
    string? EnlistmentTransNo = null,
    string? ProfilingTransNo = null,
    DateOnly? ProfilingDate = null,
    string? ProfilingAtc = null,
    bool IsWalkedIn = false,
    bool HasPatientConsent = true,
    DateTime? ConsentSignedAtUtc = null,
    Guid? CreatedByStaffId = null,
    string? CreatedByStaffName = null,
    DateOnly? EnlistmentTransDate = null,
    Guid? PatientId = null,
    string? HciAccreditationNumber = null,
    string? YesReferenceNo = null,
    TimeOnly? ProfilingTime = null,
    string? FpeClassificationType = null,
    string? ServiceDeliveryMethod = null,
    string? FacilitatorType = null,
    string? FacilitatorName = null,
    bool HasCoPayment = false,
    DateOnly? CoPaymentDate = null,
    decimal? CoPaymentAmount = null,
    decimal? CoPaymentBalance = null,
    string? Remarks = null
);
