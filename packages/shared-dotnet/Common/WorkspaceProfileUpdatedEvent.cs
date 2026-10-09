using System;
using ClinicEz.Shared.Workspace;

namespace ClinicEz.Shared.Common;

/// <summary>
/// Published by portal-api whenever the workspace-level identity (brand or regional defaults) changes, and once when a facility
/// is created. It carries the full <see cref="Profile"/> (no secrets, no PHI): every facility service stores its own copy and
/// never calls the portal for it. <see cref="Version"/> orders updates; a receiver applies a profile only when it is newer than
/// the one it holds. <see cref="Profile"/> is null in messages from a portal that predates the push model (receivers ignore those).
/// </summary>
public record WorkspaceProfileUpdatedEvent
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string TenantId { get; init; } = string.Empty;
    public string TenantSlug { get; init; } = string.Empty;
    public long Version { get; init; }
    public DateTime OccurredAt { get; init; } = DateTime.UtcNow;

    /// <summary>The complete workspace profile at <see cref="Version"/>.</summary>
    public WorkspaceProfile? Profile { get; init; }
}
