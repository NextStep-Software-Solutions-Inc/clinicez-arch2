using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Contracts;

namespace ClinicEz.Interop.Application;

public enum HubMode
{
    /// <summary>The cloud hub: policy authority, directory owner, admin API.</summary>
    Cloud,
    /// <summary>An edge cell's local hub, federated to the cloud hub (plan 4.5.1).</summary>
    Local
}

/// <summary>Bound from the <c>Hub</c> configuration section.</summary>
public sealed class HubOptions
{
    public const string Section = "Hub";

    public HubMode Mode { get; set; } = HubMode.Cloud;

    /// <summary>Cell whose mailboxes serve patients and the portal (<c>{CloudCellId}:patient</c>, <c>{CloudCellId}:portal</c>).</summary>
    public string CloudCellId { get; set; } = "cloud";

    /// <summary>Local mode: the id of the edge cell this hub serves (registered in the cloud directory).</summary>
    public string? LocalCellId { get; set; }

    public int MaxEnvelopeBytes { get; set; } = 1_048_576;
    public int MaxSendBatch { get; set; } = 100;
    public int MessageTtlDays { get; set; } = 7;
    public int MaxDeliveryAttempts { get; set; } = 10;
    public int VisibilityTimeoutSeconds { get; set; } = 60;
    /// <summary>Delay before a nacked message is redelivered; grows linearly with the attempt number (capped at 5 minutes).</summary>
    public int NackDelaySeconds { get; set; } = 5;
    public int DeadLetterRetentionDays { get; set; } = 14;
    public int ConversationRetentionDays { get; set; } = 30;
    public int MaxPullBatch { get; set; } = 100;
    public int MaxLongPollSeconds { get; set; } = 25;
    public int LongPollIntervalMs { get; set; } = 1000;

    /// <summary>Base64 32-byte key. When set, envelopes are AES-GCM encrypted at the application level before storage.</summary>
    public string? PayloadEncryptionKey { get; set; }

    public AuthOptions Auth { get; set; } = new();
    public ClaimOptions Claims { get; set; } = new();
    public DatabaseOptions Database { get; set; } = new();
    public BackgroundOptions Background { get; set; } = new();
    public UpstreamOptions Upstream { get; set; } = new();
    public BootstrapOptions? Bootstrap { get; set; }

    public bool IsLocal => Mode == HubMode.Local;

    /// <summary>Local mode with a cloud connection: forwarding, cell-inbox pull and directory sync run.</summary>
    public bool UpstreamActive => IsLocal && Upstream.Enabled;

    /// <summary>Cell id of the mailboxes this hub hosts for facilities.</summary>
    public string? OwnCellId => IsLocal ? LocalCellId : CloudCellId;
}

public sealed class AuthOptions
{
    public int Pbkdf2Iterations { get; set; } = 100_000;
    /// <summary>How long a verified credential is cached in memory (revocation reaches other hub instances within this window).</summary>
    public int CacheSeconds { get; set; } = 30;
    /// <summary>Minimum secret length accepted from <c>Hub:Bootstrap</c> outside Development.</summary>
    public int MinBootstrapSecretLength { get; set; } = 24;
}

public sealed class ClaimOptions
{
    public int DefaultTtlHours { get; set; } = 168;
    public int MaxTtlHours { get; set; } = 720;
}

public sealed class DatabaseOptions
{
    /// <summary>Apply migrations at startup. Always on in Development; set true for edge bundles.</summary>
    public bool AutoMigrate { get; set; }
}

public sealed class BackgroundOptions
{
    public bool Enabled { get; set; } = true;
    public int MaintenanceIntervalSeconds { get; set; } = 30;
}

public sealed class UpstreamOptions
{
    /// <summary>
    /// Local mode only. False runs the hub air-gapped: nothing is forwarded, pulled or synced, and messages addressed beyond
    /// the edge cell are rejected with the <c>upstream_disabled</c> reason. Url and credentials are then not required.
    /// </summary>
    public bool Enabled { get; set; } = true;

    public string Url { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
    public int PollWaitSeconds { get; set; } = 20;
    public int BatchSize { get; set; } = 50;
    public int ForwardIntervalMs { get; set; } = 1000;
    public int MaxBackoffSeconds { get; set; } = 300;
    public int DirectorySyncSeconds { get; set; } = 60;
}

public sealed class BootstrapOptions
{
    public List<BootstrapCell> Cells { get; set; } = [];
    public List<BootstrapClient> Clients { get; set; } = [];
    public List<BootstrapFacility> Facilities { get; set; } = [];
}

public sealed class BootstrapCell
{
    public string CellId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public CellKind Kind { get; set; }
    public string? TenantId { get; set; }
}

public sealed class BootstrapClient
{
    public string ClientId { get; set; } = string.Empty;
    public string Secret { get; set; } = string.Empty;
    public string CellId { get; set; } = string.Empty;
    public string Service { get; set; } = string.Empty;
    public HubClientKind Kind { get; set; }
}

/// <summary>Seeds a facility into the directory (edge bundles that must work before their first cloud sync).</summary>
public sealed class BootstrapFacility
{
    public string TenantId { get; set; } = string.Empty;
    public string FacilityId { get; set; } = string.Empty;
    public FacilityType FacilityType { get; set; }
    public string CellId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? City { get; set; }
    public FacilityVisibility Visibility { get; set; } = FacilityVisibility.Private;
    public bool AcceptsExternalRequests { get; set; }
}
