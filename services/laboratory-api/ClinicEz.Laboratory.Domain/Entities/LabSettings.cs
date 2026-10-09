using System;
using ClinicEz.Laboratory.Domain.Common;
using ClinicEz.Laboratory.Domain.Enums;

namespace ClinicEz.Laboratory.Domain.Entities;

public sealed class LabSettings : BaseEntity, ILabScopedEntity
{
    public required string TenantId { get; set; }
    public Guid LaboratoryId { get; set; }
    public required string LaboratoryName { get; set; }

    /// <summary>Whether orders must be paid before specimen collection (default), are billed afterwards, or are not billed.</summary>
    public PaymentPolicy PaymentPolicy { get; set; } = PaymentPolicy.Prepaid;

    // Cryptographic License & Hard Limit Profile
    public string? LicenseToken { get; set; }
    public string PlanTier { get; set; } = "Community";
    public int MaxStaffLimit { get; set; } = 5;
    public int MaxAnalyzersLimit { get; set; } = 1;
    public DateTime? LicenseExpiresAt { get; set; }

    public string? LicenseToOperateNumber { get; set; }
    public string? TaxIdentificationNumber { get; set; }
}
