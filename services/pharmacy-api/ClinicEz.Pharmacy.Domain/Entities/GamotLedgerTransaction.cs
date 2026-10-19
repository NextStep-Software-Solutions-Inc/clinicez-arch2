using System;
using ClinicEz.Pharmacy.Domain.Common;
using ClinicEz.Pharmacy.Domain.Enums;

namespace ClinicEz.Pharmacy.Domain.Entities;

public sealed class GamotLedgerTransaction : BaseEntity
{
    public GamotLedgerTransaction() { }

    public string TenantId { get; set; } = string.Empty;
    public string PharmacyId { get; set; } = string.Empty;

    public Guid GamotBeneficiaryLedgerId { get; set; }
    public GamotBeneficiaryLedger? Ledger { get; set; }

    public Guid PrescriptionOrderId { get; set; }
    public Guid? PrescriptionOrderItemId { get; set; }
    public required string PrescriptionNumber { get; set; }

    public DateTime TransactionDate { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// 30-character concatenated PhilHealth drug code per KonsultaData_v1.14.dtd.
    /// </summary>
    public required string PhilHealthDrugCode { get; set; }

    public required string GenericName { get; set; }
    public string? BrandName { get; set; }

    public int QuantityDispensed { get; set; }
    public decimal PhilHealthReferencePrice { get; set; }
    public decimal TotalGamotAmount { get; set; }
    public decimal PatientCoPay { get; set; } = 0.00m;

    /// <summary>
    /// Unique Prescription Security Code (UPSC) for digital authentication per PhilHealth Circular No. 2025-0013.
    /// </summary>
    public required string UniquePrescriptionSecurityCode { get; set; }

    public required string DispensingPharmacistName { get; set; }
    public required string DispensingPharmacistPrc { get; set; }

    /// <summary>
    /// HCI Accreditation Number of the dispensing facility.
    /// </summary>
    public required string HciAccreditationNumber { get; set; }

    public GamotTransactionStatus Status { get; set; } = GamotTransactionStatus.Dispensed;

    public string? PhilHealthClaimSequenceNumber { get; set; }
    public string? Notes { get; set; }
}
