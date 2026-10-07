using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace ClinicEz.Shared.Licensing;

public record FacilityLicensePayload
{
    [JsonPropertyName("licenseId")]
    public Guid LicenseId { get; init; } = Guid.NewGuid();

    [JsonPropertyName("facilityId")]
    public Guid FacilityId { get; init; }

    [JsonPropertyName("tenantId")]
    public string TenantId { get; init; } = string.Empty;

    [JsonPropertyName("tenantSlug")]
    public string? TenantSlug { get; init; }

    [JsonPropertyName("facilityName")]
    public string FacilityName { get; init; } = string.Empty;

    [JsonPropertyName("facilityType")]
    public string FacilityType { get; init; } = string.Empty; // "Clinic", "Laboratory", "Pharmacy"

    /// <summary>
    /// Facility owner email (signed). Lets an offline/LAN install bootstrap its first administrator
    /// from the license key alone, without the FacilityCreated event or any cloud call.
    /// </summary>
    [JsonPropertyName("ownerEmail")]
    public string? OwnerEmail { get; init; }

    [JsonPropertyName("ownerName")]
    public string? OwnerName { get; init; }

    [JsonPropertyName("planTier")]
    public string PlanTier { get; init; } = "Community"; // "Community", "Standard", "Enterprise"

    [JsonPropertyName("limits")]
    public FacilityLimits Limits { get; init; } = new();

    [JsonPropertyName("enabledFeatures")]
    public List<string> EnabledFeatures { get; init; } = new();

    [JsonPropertyName("issuedAtUtc")]
    public DateTime IssuedAtUtc { get; init; } = DateTime.UtcNow;

    [JsonPropertyName("expiresAtUtc")]
    public DateTime? ExpiresAtUtc { get; init; }

    [JsonPropertyName("issuer")]
    public string Issuer { get; init; } = "ClinicEz-Authority";
}
