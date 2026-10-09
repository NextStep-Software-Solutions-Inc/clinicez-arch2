using ClinicEz.Organization.Domain.Common;

namespace ClinicEz.Organization.Domain.Entities;

/// <summary>An organization workspace provisioned in this service, with the signed license it currently holds.</summary>
public sealed class OrganizationFacility : BaseEntity
{
    public OrganizationFacility() { }

    public required string TenantId { get; set; }

    public Guid FacilityId { get; set; }

    public required string Name { get; set; }

    public string? LicenseToken { get; set; }

    /// <summary>Workspace entitlement version of <see cref="LicenseToken"/>; a replacement license older than this is ignored.</summary>
    public int EntitlementVersion { get; set; }

    public string PlanTier { get; set; } = "Community";

    public DateTime? LicenseExpiresAt { get; set; }
}
