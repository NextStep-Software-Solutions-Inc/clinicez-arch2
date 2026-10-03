using System;

namespace ClinicEz.Shared.Interoperability;

public record ExternalPrescriptionDispensedEvent
{
    public Guid EventId { get; init; } = Guid.NewGuid();
    public Guid PrescriptionId { get; init; }
    public string PrescriptionNumber { get; init; } = string.Empty;
    public string ExternalPharmacyName { get; init; } = string.Empty; // e.g. "Mercury Drug", "Watsons", "Rose Pharmacy"
    public string? ExternalBranchLocation { get; init; }
    public string? PharmacistName { get; init; }
    public string? PharmacistPrcLicense { get; init; }
    public string? OfficialReceiptNumber { get; init; }
    public string? ReceiptDocumentUrl { get; init; }
    public string? ReceiptDocumentBase64 { get; init; }
    public string? Notes { get; init; }
    public DateTime DispensedAt { get; init; } = DateTime.UtcNow;
}
