using System;
using ClinicEz.Pharmacy.Domain.Common;

namespace ClinicEz.Pharmacy.Domain.Entities;

public sealed class PharmacySettings : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid PharmacyId { get; set; }
    public required string PharmacyName { get; set; }

    // Cryptographic License & Hard Limit Profile
    public string? LicenseToken { get; set; }
    public string PlanTier { get; set; } = "Community";
    public int MaxStaffLimit { get; set; } = 5;
    public DateTime? LicenseExpiresAt { get; set; }

    public string? LicenseToOperateNumber { get; set; } // FDA LTO
    public string? TaxIdentificationNumber { get; set; }
}
