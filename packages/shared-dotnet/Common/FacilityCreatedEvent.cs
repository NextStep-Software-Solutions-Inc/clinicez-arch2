using System;
using ClinicEz.Shared.Licensing;

namespace ClinicEz.Shared.Common;

public record FacilityCreatedEvent
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string TenantId { get; init; } = string.Empty;
    public string? TenantSlug { get; init; }
    public FacilityType FacilityType { get; init; }
    public Guid ResourceId { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Slug { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;

    // Cryptographically signed license information rooted upon facility activation
    public string? LicenseToken { get; init; }
    public FacilityLimits? Limits { get; init; }
    public string? PlanTier { get; init; }
    public DateTime? LicenseExpiresAt { get; init; }
}
