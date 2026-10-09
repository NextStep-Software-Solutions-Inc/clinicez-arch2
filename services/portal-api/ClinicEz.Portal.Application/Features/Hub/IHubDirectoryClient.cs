using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Portal.Application.Features.Hub;

/// <summary>Filters of a directory search. Everything is optional; the hub applies visibility rules on top.</summary>
public sealed record DirectorySearchCriteria(FacilityType? FacilityType, string? Query, string? City);

/// <summary>
/// Reads the hub's facility directory on behalf of one workspace (portal-api acts as a ControlPlane client). The hub
/// decides what the workspace may see: its own facilities, public facilities, and facilities it holds an active link to.
/// </summary>
public interface IHubDirectoryClient
{
    /// <summary>Searches the directory as <paramref name="tenantId"/>; the tenant is always passed to the hub, never omitted.</summary>
    Task<IReadOnlyList<DirectoryFacilityDto>> SearchFacilitiesAsync(
        Guid tenantId,
        DirectorySearchCriteria criteria,
        CancellationToken cancellationToken);
}
