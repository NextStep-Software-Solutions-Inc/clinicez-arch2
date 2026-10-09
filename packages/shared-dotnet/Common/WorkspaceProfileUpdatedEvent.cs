using System;

namespace ClinicEz.Shared.Common;

/// <summary>
/// Published by portal-api whenever the workspace-level identity (brand or regional defaults) changes.
/// Facility services - on any server, cloud or on-prem - invalidate their cached workspace profile on
/// receipt and re-pull it. Carries no profile data on purpose: the pull endpoint stays the single
/// source of truth, and a facility that missed the event converges via the cache TTL / ETag anyway.
/// </summary>
public record WorkspaceProfileUpdatedEvent
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string TenantId { get; init; } = string.Empty;
    public string TenantSlug { get; init; } = string.Empty;
    public long Version { get; init; }
    public DateTime OccurredAt { get; init; } = DateTime.UtcNow;
}
