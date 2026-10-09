using System;
using System.Collections.Generic;
using ClinicEz.Pharmacy.Domain.Common;
using ClinicEz.Pharmacy.Domain.Enums;
using Sieve.Attributes;

namespace ClinicEz.Pharmacy.Domain.Entities;

public sealed class PrescriptionOrder : BaseEntity
{
    public PrescriptionOrder() { }

    [Sieve(CanFilter = true, CanSort = true)]
    public string TenantId { get; set; } = string.Empty;

    [Sieve(CanFilter = true, CanSort = true)]
    public string? BranchId { get; set; }

    public string PharmacyId { get; set; } = string.Empty;

    [Sieve(CanFilter = true, CanSort = true)]
    public Guid ExternalPrescriptionId { get; set; }

    [Sieve(CanFilter = true, CanSort = true)]
    public required string PrescriptionNumber { get; set; }

    public string OrderingFacilityId { get; set; } = string.Empty;

    /// <summary>Tenant of the ordering clinic, taken from the rx.issued envelope's From party.</summary>
    public string OrderingTenantId { get; set; } = string.Empty;

    /// <summary>Envelope correlation id of rx.issued (the clinic's PrescriptionId); reused on rx.dispensed.</summary>
    public Guid CorrelationId { get; set; }

    /// <summary>This pharmacy's display name, copied from its provisioned settings when the order is received.</summary>
    public string PharmacyName { get; set; } = string.Empty;

    /// <summary>Clinic encounter / queue id used to group this pharmacy's lines into the consolidated visit bill.</summary>
    public string? VisitKey { get; set; }

    /// <summary>Payment policy in force when the order was received. <c>None</c> for orders that predate the payment gate.</summary>
    public PharmacyPaymentPolicy PaymentPolicy { get; set; } = PharmacyPaymentPolicy.None;

    public PrescriptionPaymentStatus PaymentStatus { get; set; } = PrescriptionPaymentStatus.NotRequired;

    /// <summary>Quote computed from inventory prices when staff accepted the order (accepted items only).</summary>
    public decimal? QuotedAmount { get; set; }

    public decimal? PaidAmount { get; set; }

    public DateTime? PaidAt { get; set; }

    public string? PaymentReceiptNumber { get; set; }

    /// <summary>Why the order was rejected or only partially accepted.</summary>
    public string? StatusReason { get; set; }

    public DateTime? ReviewedAt { get; set; }

    public string OrderingFacilityName { get; set; } = string.Empty;

    public string OrderingDoctorName { get; set; } = string.Empty;

    public string DoctorPrcLicense { get; set; } = string.Empty;

    public string? DoctorPtr { get; set; }

    public string? DoctorS2License { get; set; }

    public Guid PatientId { get; set; }

    [Sieve(CanFilter = true, CanSort = true)]
    public required string PatientName { get; set; }

    public int PatientAge { get; set; }

    public string PatientGender { get; set; } = "Unknown";

    public string? PatientContact { get; set; }

    public string? PatientAllergies { get; set; }

    public string? ClinicalDiagnosis { get; set; }

    public string? SpecialInstructions { get; set; }

    [Sieve(CanFilter = true, CanSort = true)]
    public PrescriptionStatus Status { get; set; } = PrescriptionStatus.Pending;

    [Sieve(CanFilter = true, CanSort = true)]
    public DateTime IssuedAt { get; set; } = DateTime.UtcNow;

    public DateTime? DispensedAt { get; set; }

    public string? DispensingPharmacistName { get; set; }

    public string? DispensingPharmacistPrc { get; set; }

    public decimal TotalAmount { get; set; }

    // PhilHealth Yakap / GAMOT Benefit Fields
    public bool IsPhilHealthGamot { get; set; } = false;
    public string? PhilHealthIdentificationNumber { get; set; }
    public string? PhilHealthMemberPin { get; set; }
    public decimal GamotCoverageAmount { get; set; } = 0.00m;
    public decimal PatientCoPayAmount { get; set; } = 0.00m;

    public ICollection<PrescriptionOrderItem> Items { get; set; } = new List<PrescriptionOrderItem>();

    public ICollection<DispenseAuditRecord> DispenseRecords { get; set; } = new List<DispenseAuditRecord>();
}
