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
