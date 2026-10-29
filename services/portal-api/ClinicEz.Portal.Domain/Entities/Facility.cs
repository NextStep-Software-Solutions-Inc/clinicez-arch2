using ClinicEz.Portal.Domain.Common;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Contracts;
using System;
using System.Text.Json.Serialization;

namespace ClinicEz.Portal.Domain.Entities;

[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum FacilityStatus
{
    Provisioning,
    Active,
    Suspended,
    Failed
}

/// <summary>Where a facility's service is hosted. Each facility is its own deployable service.</summary>
[JsonConverter(typeof(StrictJsonStringEnumConverter))]
public enum FacilityDeploymentMode
{
    SharedCloud,
    OnPremise
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

    // Deployment: shared cloud by default; on-prem facilities keep their own console address.
    public FacilityDeploymentMode DeploymentMode { get; set; } = FacilityDeploymentMode.SharedCloud;
    /// <summary>Explicit https console address that replaces the generated subdomain URL (typically on-prem).</summary>
    public string? ConsoleBaseUrl { get; set; }

    // Interop hub directory: who may address this facility and which cell (hub) serves it.
    public FacilityVisibility Visibility { get; set; } = FacilityVisibility.Private;
    public bool AcceptsExternalRequests { get; set; }
    public bool IsPatientDiscoveryEligible { get; set; } = false;
    /// <summary>
    /// Routing cell: the shared cloud cell for SharedCloud facilities, <c>edge-{tenantId}</c> for on-premise ones.
    /// Derived from <see cref="DeploymentMode"/> whenever the facility is saved.
    /// </summary>
    public string CellId { get; set; } = string.Empty;
    /// <summary>Hub client created for an on-premise facility. The secret is never stored (the hub keeps only a hash).</summary>
    public string? HubClientId { get; set; }

    // Cryptographic License & Plan Profile
    public string? LicenseToken { get; set; }
    public string PlanTier { get; set; } = "Community";
    public int MaxStaffLimit { get; set; } = 5;
    public DateTime? LicenseExpiresAt { get; set; }

    /// <summary>Last <c>facility.heartbeat</c> received from the facility itself; null until it first reports.</summary>
    public DateTime? LastSeenAt { get; set; }
    public string? AppVersion { get; set; }

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

    // 10-digit Philippine Standard Geographic Code (PSGC) Hierarchy
    public string? RegionPsgc { get; set; }
    public string? ProvincePsgc { get; set; }
    public string? CityMunicipalityPsgc { get; set; }
    public string? BarangayPsgc { get; set; }

    // Facility letterhead/logo/stamp are owned by each facility's own service (e.g. clinic ClinicSettings),
    // not by the portal. Workspace-level brand defaults live in WorkspaceSettings.

    // Notification Preferences
    public string? NotificationPreferencesJson { get; set; }

    // Public Join Link Settings
    public bool IsJoinEnabled { get; set; } = true;
    public string? JoinCode { get; set; }
    public DateTime? JoinCodeExpiresAtUtc { get; set; }
    public DateTime? JoinSettingsUpdatedAtUtc { get; set; }
}
