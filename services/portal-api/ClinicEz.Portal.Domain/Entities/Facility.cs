using ClinicEz.Portal.Domain.Common;
using ClinicEz.Shared.Common;
using System;
using System.Text.Json.Serialization;

namespace ClinicEz.Portal.Domain.Entities;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum FacilityStatus
{
    Provisioning,
    Active,
    Suspended,
    Failed
}

public class Facility : BaseEntity
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;
    public Guid? BranchId { get; set; }
    public Branch? Branch { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public FacilityType FacilityType { get; set; }
    public FacilityStatus Status { get; set; } = FacilityStatus.Provisioning;

    // Cryptographic License & Plan Profile
    public string? LicenseToken { get; set; }
    public string PlanTier { get; set; } = "Community";
    public int MaxStaffLimit { get; set; } = 5;
    public DateTime? LicenseExpiresAt { get; set; }

    // Regulatory & Classification Profile
    public string? Classification { get; set; } // Ambulatory Clinic, Primary Lab, Community Pharmacy, etc.
    public string? LicenseToOperate { get; set; } // DOH LTO Number
    public string? PhilHealthAccreditationNumber { get; set; }
    public string? TaxIdentificationNumber { get; set; } // BIR TIN
    public string? OperatingHours { get; set; }

    // Geolocation & Philippine Standard Address
    public string? Region { get; set; }
    public string? Province { get; set; }
    public string? City { get; set; }
    public string? Barangay { get; set; }
    public string? ZipCode { get; set; }
    public string? StreetAddress { get; set; }
    public string? ContactNumber { get; set; }
    public string? ContactEmail { get; set; }

    // Facility letterhead/logo/stamp are owned by each facility's own service (e.g. clinic ClinicSettings),
    // not by the portal. Workspace-level brand defaults live in WorkspaceSettings.

    // Notification Preferences
    public string? NotificationPreferencesJson { get; set; }
}
