using System;
using ClinicEz.Pharmacy.Domain.Common;
using ClinicEz.Pharmacy.Domain.Enums;

namespace ClinicEz.Pharmacy.Domain.Entities;

public sealed class PrescriptionOrderItem : BaseEntity
{
    public PrescriptionOrderItem() { }

    public Guid PrescriptionOrderId { get; set; }
    public PrescriptionOrder? PrescriptionOrder { get; set; }

    public Guid? InventoryItemId { get; set; }

    public required string GenericName { get; set; }

    public string? BrandName { get; set; }

    public required string Dosage { get; set; }

    public string Form { get; set; } = "Tablet";

    public required string Sig { get; set; }

    public int QuantityPrescribed { get; set; }

    public int QuantityDispensed { get; set; }

    public string? AllocatedBatchNumber { get; set; }

    public DateTime? AllocatedBatchExpiry { get; set; }

    public decimal UnitPrice { get; set; }

    public decimal Subtotal { get; set; }

    public ItemDispenseStatus Status { get; set; } = ItemDispenseStatus.Pending;

    public bool IsDangerousDrug { get; set; } = false;

    // PhilHealth Yakap / GAMOT Item Fields
    public bool IsGamotCovered { get; set; } = false;
    public string? PhilHealthDrugCode { get; set; }
    public string? UniquePrescriptionSecurityCode { get; set; } // UPSC
    public decimal? GamotReferencePrice { get; set; }

    public string? Remarks { get; set; }
}
