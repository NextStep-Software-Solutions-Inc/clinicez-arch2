using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Shared.Workspace;

/// <summary>
/// The workspace-level identity inherited by every facility (mirrors portal-api's WorkspaceProfileDto).
/// Contains no secrets; the DPO contact and privacy notice are published to data subjects by design (RA 10173).
/// It travels inside <c>workspace.profile.updated</c> and each facility service keeps its own copy.
/// </summary>
public sealed record WorkspaceProfile(
    string TenantSlug,
    long Version,
    string DisplayName,
    string? LogoUrl,
    string? AccentColorHex,
    string TimeZoneId,
    string Locale,
    string DateFormat,
    string CurrencyCode,
    string? DpoName = null,
    string? DpoEmail = null,
    string? PrivacyNoticeUrl = null);

/// <summary>
/// Read access to the workspace profile for a facility service. The profile is pushed by portal-api in
/// <c>workspace.profile.updated</c> and persisted in the service's own database, so reads never touch the network and a
/// facility (cloud or on-premise, online or not) keeps working with the last profile it received. Implementations must never
/// throw: they return null until the first message has arrived.
/// </summary>
public interface IWorkspaceProfileProvider
{
    /// <summary>The profile for the tenant (id or slug), or null when none has been received yet.</summary>
    Task<WorkspaceProfile?> GetAsync(string tenantIdentifier, CancellationToken ct = default);

    /// <summary>
    /// Synchronous read for code paths such as PDF rendering that cannot await: memory first, then one local database read
    /// (cached afterwards). No network call.
    /// </summary>
    WorkspaceProfile? TryGetCached(string tenantIdentifier);

    /// <summary>Drops the in-memory copy so the next read goes back to the store.</summary>
    void Invalidate(string tenantIdentifier);
}
