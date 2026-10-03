using System;
using ClinicEz.Laboratory.Domain.Common;

namespace ClinicEz.Laboratory.Domain.Entities;

public sealed class LabSettings : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid LaboratoryId { get; set; }
    public required string LaboratoryName { get; set; }

    // Cryptographic License & Hard Limit Profile
    public string? LicenseToken { get; set; }
    public string PlanTier { get; set; } = "Community";
    public int MaxStaffLimit { get; set; } = 5;
    public int MaxAnalyzersLimit { get; set; } = 1;
    public DateTime? LicenseExpiresAt { get; set; }

    public string? LicenseToOperateNumber { get; set; }
    public string? TaxIdentificationNumber { get; set; }
}
