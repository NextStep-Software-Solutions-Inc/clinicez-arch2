using System;
using ClinicEz.Pharmacy.Domain.Common;

namespace ClinicEz.Pharmacy.Domain.Entities;

public sealed class DispenseAuditRecord : BaseEntity
{
    public DispenseAuditRecord() { }

    public Guid PrescriptionOrderId { get; set; }
    public PrescriptionOrder? PrescriptionOrder { get; set; }

    public required string PharmacistName { get; set; }

    public required string PharmacistPrcLicense { get; set; }

    public DateTime DispensedAt { get; set; } = DateTime.UtcNow;

    public decimal TotalAmount { get; set; }

    public string? ReceiptNumber { get; set; }

    public string BatchDeductionsJson { get; set; } = string.Empty;

    public string? Notes { get; set; }
}
