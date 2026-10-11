using ClinicEz.Portal.Domain.Common;
using System;

namespace ClinicEz.Portal.Domain.Entities;

public class Tenant : BaseEntity
{
    /// <summary>Name of the unique index enforcing one owned (non-purged) workspace per user.</summary>
    public const string UniqueOwnerIndexName = "UX_Tenants_OwnerId_Active";

    public string OwnerId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string TenantSlug { get; set; } = string.Empty;
    public string TenantType { get; set; } = "Workplace";

    /// <summary>Set when the owner archived the workspace. The portal closes it; data is kept and support can restore it.</summary>
    public DateTime? ArchivedAt { get; set; }
    
    // Additional contact info based on registration
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;

    // Contact & Address Details (Xendit Mapping)
    public string? PhoneNumber { get; set; }
    public string? Country { get; set; }
    public string? StreetLine1 { get; set; }
    public string? StreetLine2 { get; set; }
    public string? City { get; set; }
    public string? Province { get; set; }
    public string? PostalCode { get; set; }

    // Business Details (Xendit Mapping)
    public string? TradingName { get; set; }
    public string? BusinessType { get; set; }
    public string? TaxId { get; set; }

    // Telemetry Usage & Limits
    public int FacilitiesCount { get; set; } = 0;
    public int StaffAccountsCount { get; set; } = 1;
    public int ActivePatientRecordsCount { get; set; } = 0;
    public int MonthlyApiQuotaUsed { get; set; } = 0;
    public int MonthlyApiQuotaLimit { get; set; } = 10000;

    // Branches associated with this tenant
    public ICollection<Branch> Branches { get; set; } = new List<Branch>();
}
