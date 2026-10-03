using System;
using System.Collections.Generic;

namespace ClinicEz.Clinic.Application.Features.Prescriptions.DTOs;

public record PrescriptionSlipItemDto(
    Guid ItemId,
    string GenericName,
    string? BrandName,
    string Dosage,
    string Form,
    string Sig,
    int Quantity,
    int? DurationDays,
    int Refills,
    bool IsDangerousDrug,
    string? Remarks
);

public record PrescriptionSlipDto(
    Guid ConsultationId,
    string PrescriptionNumber,
    DateTime IssuedAt,
    string ClinicName,
    string ClinicAddress,
    string ClinicContact,
    string DoctorName,
    string DoctorPrcLicense,
    string? DoctorPtr,
    string? DoctorS2License,
    string? DoctorSpecialization,
    Guid PatientId,
    string PatientName,
    int PatientAge,
    string PatientGender,
    string? PhilHealthNumber,
    string? PatientAllergies,
    string? ClinicalDiagnosis,
    string? SpecialInstructions,
    List<PrescriptionSlipItemDto> Items,
    string PublicVerificationToken,
    string PublicVerificationUrl,
    string QrPayload,
    string DispenseStatus,
    string? DispensedPharmacyName,
    string? DispensedPharmacistName,
    string? DispensedPharmacistPrc,
    string? DispensedReceiptNumber,
    string? DispensedReceiptUrl,
    DateTime? DispensedAt,
    string? DispenseNotes
);

public record PublicRxVerificationInfoDto(
    string PrescriptionNumber,
    DateTime IssuedAt,
    string ClinicName,
    string ClinicAddress,
    string ClinicContact,
    string DoctorName,
    string DoctorPrcLicense,
    string? DoctorPtr,
    string? DoctorS2License,
    string PatientName,
    string PatientInitials,
    int PatientAge,
    string PatientGender,
    string? PatientAllergies,
    string? ClinicalDiagnosis,
    List<PrescriptionSlipItemDto> Items,
    string DispenseStatus,
    bool IsValid,
    bool IsAlreadyDispensed,
    string? DispensedPharmacyName,
    string? DispensedReceiptNumber,
    DateTime? DispensedAt,
    string? DispenseNotes,
    DateTime? ExpiresAt = null,
    bool IsExpired = false
);
