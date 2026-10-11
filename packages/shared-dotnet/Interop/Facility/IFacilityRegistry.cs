using ClinicEz.Shared.Common;

namespace ClinicEz.Shared.Interop.Facility;

/// <summary>One facility provisioned in a service, as reported in its heartbeat.</summary>
public sealed record FacilityRegistryEntry(string TenantId, Guid FacilityId, FacilityType FacilityType, DateTime? LicenseExpiresAt);

/// <summary>
/// Per-service list of the facilities this service holds. Implemented once per service on its settings table; the shared
/// <see cref="FacilityHeartbeatService"/> sends one <c>facility.heartbeat</c> per entry.
/// </summary>
public interface IFacilityRegistry
{
    /// <summary>Every provisioned facility regardless of tenant (no ambient request scope applies in a background job).</summary>
    Task<IReadOnlyList<FacilityRegistryEntry>> ListAsync(CancellationToken ct);
}
