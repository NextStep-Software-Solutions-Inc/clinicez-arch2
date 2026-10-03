using System;
using System.Collections.Generic;

namespace ClinicEz.Shared.Interoperability;

public record DispensedMedicationDto
{
    public Guid ItemId { get; init; }
    public string GenericName { get; init; } = string.Empty;
    public string? BrandName { get; init; }
    public string Dosage { get; init; } = string.Empty;
    public string Form { get; init; } = string.Empty;
    public int QuantityDispensed { get; init; }
    public string BatchNumber { get; init; } = string.Empty;
    public string ExpiryDate { get; init; } = string.Empty;
    public decimal UnitPrice { get; init; }
    public decimal Subtotal { get; init; }
}

public record PrescriptionDispensedEvent
{
    public Guid DispenseId { get; init; } = Guid.NewGuid();
    public Guid PrescriptionId { get; init; }
    public string PrescriptionNumber { get; init; } = string.Empty;
    public string PharmacyFacilityId { get; init; } = string.Empty;
    public string PharmacyFacilityName { get; init; } = string.Empty;
    public string PharmacyTenantId { get; init; } = string.Empty;
    public string DispensingPharmacistName { get; init; } = string.Empty;
    public string DispensingPharmacistPrcLicense { get; init; } = string.Empty;
    public DateTime DispensedAt { get; init; } = DateTime.UtcNow;
    public List<DispensedMedicationDto> DispensedItems { get; init; } = new();
    public decimal TotalAmount { get; init; }
    public string? ReceiptNumber { get; init; }
    public string? Notes { get; init; }
}
