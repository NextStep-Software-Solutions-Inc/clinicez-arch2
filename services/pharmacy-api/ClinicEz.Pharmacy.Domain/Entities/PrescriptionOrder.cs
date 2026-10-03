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

    public string PharmacyId { get; set; } = string.Empty;

    [Sieve(CanFilter = true, CanSort = true)]
    public Guid ExternalPrescriptionId { get; set; }

    [Sieve(CanFilter = true, CanSort = true)]
    public required string PrescriptionNumber { get; set; }

    public string OrderingFacilityId { get; set; } = string.Empty;

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

    public ICollection<PrescriptionOrderItem> Items { get; set; } = new List<PrescriptionOrderItem>();

    public ICollection<DispenseAuditRecord> DispenseRecords { get; set; } = new List<DispenseAuditRecord>();
}
