using System;
using System.Collections.Generic;

namespace ClinicEz.Pharmacy.Application.Features.Prescriptions.DTOs;

public record BatchAllocationRecommendationDto(
    Guid BatchId,
    string BatchNumber,
    DateTime ExpiryDate,
    int QuantityAvailable,
    int SuggestedAllocation
);

public record PrescriptionItemResponseDto(
    Guid Id,
    Guid? InventoryItemId,
    string GenericName,
    string? BrandName,
    string Dosage,
    string Form,
    string Sig,
    int QuantityPrescribed,
    int QuantityDispensed,
    string? AllocatedBatchNumber,
    DateTime? AllocatedBatchExpiry,
    decimal UnitPrice,
    decimal Subtotal,
    string Status,
    bool IsDangerousDrug,
    string? Remarks,
    List<BatchAllocationRecommendationDto> AvailableBatches
);

public record DispenseAuditRecordDto(
    Guid Id,
    string PharmacistName,
    string PharmacistPrcLicense,
    DateTime DispensedAt,
    decimal TotalAmount,
    string? ReceiptNumber,
    string BatchDeductionsJson,
    string? Notes
);

public record PrescriptionOrderDto(
    Guid Id,
    string TenantId,
    string PharmacyId,
    Guid ExternalPrescriptionId,
    string PrescriptionNumber,
    string OrderingFacilityId,
    string OrderingFacilityName,
    string OrderingDoctorName,
    string DoctorPrcLicense,
    string? DoctorPtr,
    string? DoctorS2License,
    Guid PatientId,
    string PatientName,
    int PatientAge,
    string PatientGender,
    string? PatientContact,
    string? PatientAllergies,
    string? ClinicalDiagnosis,
    string? SpecialInstructions,
    string Status,
    DateTime IssuedAt,
    DateTime? DispensedAt,
    string? DispensingPharmacistName,
    string? DispensingPharmacistPrc,
    decimal TotalAmount,
    List<PrescriptionItemResponseDto> Items,
    List<DispenseAuditRecordDto> DispenseRecords
);
