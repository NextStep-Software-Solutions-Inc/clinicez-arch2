using System;
using ClinicEz.Pharmacy.Domain.Common;
using ClinicEz.Pharmacy.Domain.Enums;

namespace ClinicEz.Pharmacy.Domain.Entities;

public sealed class PharmacySettings : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid PharmacyId { get; set; }
    public required string PharmacyName { get; set; }

    /// <summary>Whether this pharmacy collects payment before dispensing, after, or not at all. Applied to each order as it is received.</summary>
    public PharmacyPaymentPolicy PaymentPolicy { get; set; } = PharmacyPaymentPolicy.Prepaid;

    // Cryptographic License & Hard Limit Profile
    public string? LicenseToken { get; set; }
    public string PlanTier { get; set; } = "Community";
    public int MaxStaffLimit { get; set; } = 5;
    public DateTime? LicenseExpiresAt { get; set; }

    public string? LicenseToOperateNumber { get; set; } // FDA LTO
    public string? TaxIdentificationNumber { get; set; }
}
