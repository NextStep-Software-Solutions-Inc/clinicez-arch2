using System;
using System.Collections.Generic;

namespace ClinicEz.Shared.Interoperability;

/// <summary>
/// Portal -> facility, type <c>entitlements.changed</c> (<c>InteropTypes.EntitlementsChanged</c>). Sent to every routable
/// facility of a workspace when its plan, subscription, overrides or pool allocations change, and again before the
/// current license expires (renewal). The facility replaces its stored license with <see cref="LicenseToken"/> when
/// <see cref="EntitlementVersion"/> is not older than the one it holds. Limits are the facility's own share of the workspace pool.
/// </summary>
public record EntitlementsChangedEvent
{
    public string TenantId { get; init; } = string.Empty;
    public Guid FacilityId { get; init; }

    /// <summary>Signed license (same format as <c>FacilityCreatedEvent.LicenseToken</c>).</summary>
    public string LicenseToken { get; init; } = string.Empty;

    public int EntitlementVersion { get; init; }

    /// <summary>Trialing, Active, PastDue, Cancelled or Expired.</summary>
    public string WorkspaceStatus { get; init; } = string.Empty;
    public string PlanSlug { get; init; } = string.Empty;

    public int MaxStaff { get; init; }
    public int MaxStorageMb { get; init; }
    public int ConcurrentTerminals { get; init; }
    public int MaxBeds { get; init; }
    public int MaxAnalyzers { get; init; }
    public int MaxMonthlyConsultations { get; init; }

    /// <summary>Enabled <c>FacilityFeatureKeys</c> values.</summary>
    public List<string> EnabledFeatures { get; init; } = new();

    public DateTime LicenseExpiresAtUtc { get; init; }

    /// <summary>After the license expires the facility stays usable read-only for this many days.</summary>
    public int GraceDays { get; init; } = 14;
    public DateTime ReadOnlyGraceUntilUtc { get; init; }
}

/// <summary>
/// Facility -> portal, type <c>facility.heartbeat</c> (<c>InteropTypes.FacilityHeartbeat</c>), To = <c>Party.Portal</c>,
/// From = the facility's own party. The portal records <c>LastSeenAt</c> and <c>AppVersion</c> only when the sender is the
/// facility the heartbeat is about (the envelope sender is authoritative; there is no id in the payload to forge).
/// </summary>
public record FacilityHeartbeatPayload
{
    public string AppVersion { get; init; } = string.Empty;
    public DateTime? LicenseExpiresAt { get; init; }
    public DateTime ClockUtc { get; init; } = DateTime.UtcNow;
}
