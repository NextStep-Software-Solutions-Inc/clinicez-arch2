using ClinicEz.Pharmacy.Domain.Entities;

namespace ClinicEz.Pharmacy.Application.Features.Prescriptions.DTOs;

public static class PrescriptionOrderMapper
{
    /// <summary>Maps an order (with <see cref="PrescriptionOrder.Items"/> and <see cref="PrescriptionOrder.DispenseRecords"/> loaded) to its DTO.</summary>
    public static PrescriptionOrderDto ToDto(PrescriptionOrder o) => new PrescriptionOrderDto(
        o.Id,
        o.TenantId,
        o.PharmacyId,
        o.ExternalPrescriptionId,
        o.PrescriptionNumber,
        o.OrderingFacilityId,
        o.OrderingFacilityName,
        o.OrderingDoctorName,
        o.DoctorPrcLicense,
        o.DoctorPtr,
        o.DoctorS2License,
        o.PatientId,
        o.PatientName,
        o.PatientAge,
        o.PatientGender,
        o.PatientContact,
        o.PatientAllergies,
        o.ClinicalDiagnosis,
        o.SpecialInstructions,
        o.Status.ToString(),
        o.IssuedAt,
        o.DispensedAt,
        o.DispensingPharmacistName,
        o.DispensingPharmacistPrc,
        o.TotalAmount,
        o.Items.Select(i => new PrescriptionItemResponseDto(
            i.Id,
            i.InventoryItemId,
            i.GenericName,
            i.BrandName,
            i.Dosage,
            i.Form,
            i.Sig,
            i.QuantityPrescribed,
            i.QuantityDispensed,
            i.AllocatedBatchNumber,
            i.AllocatedBatchExpiry,
            i.UnitPrice,
            i.Subtotal,
            i.Status.ToString(),
            i.IsDangerousDrug,
            i.Remarks,
            new List<BatchAllocationRecommendationDto>())).ToList(),
        o.DispenseRecords.Select(d => new DispenseAuditRecordDto(
            d.Id,
            d.PharmacistName,
            d.PharmacistPrcLicense,
            d.DispensedAt,
            d.TotalAmount,
            d.ReceiptNumber,
            d.BatchDeductionsJson,
            d.Notes)).ToList(),
        o.BranchId).WithWorkflow(o);
}
