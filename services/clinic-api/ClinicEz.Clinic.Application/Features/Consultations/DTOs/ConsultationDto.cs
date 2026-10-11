using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;

namespace ClinicEz.Clinic.Application.Features.Consultations.DTOs;

public sealed record EncounterDiagnosisDto(
    Guid Id,
    string Icd10Code,
    string Description,
    bool IsPrimary);

public sealed record PrescriptionItemDto(
    Guid Id,
    string GenericName,
    string? BrandName,
    string Dosage,
    string Form,
    string Sig,
    int Quantity,
    int? DurationDays,
    int Refills,
    bool IsDangerousDrug,
    string? Remarks,
    string? PhilHealthDrugCode = null);

public sealed record ConsultationEncounterDto(
    Guid Id,
    string TenantId,
    Guid ClinicId,
    Guid? QueueItemId,
    Guid? AppointmentId,
    Guid PatientId,
    string PatientName,
    Guid DoctorId,
    string DoctorName,
    DateTime EncounterDate,
    string Subjective,
    string Objective,
    string Assessment,
    string Plan,
    string? DoctorPrcLicense,
    string? DoctorPtr,
    string? DoctorS2License,
    bool IsSigned,
    DateTime? SignedAt,
    IReadOnlyList<EncounterDiagnosisDto> Diagnoses,
    IReadOnlyList<PrescriptionItemDto> Prescriptions,
    bool IsYakapEligible = false,
    string? PhilHealthSignSympCode = null,
    string? PhilHealthOtherComplaint = null,
    string? PhilHealthPainSite = null,
    string? PhilHealthCaseNo = null,
    string? PhilHealthSoapTransNo = null,
    RxPharmacyStatusDto? RxStatus = null);
