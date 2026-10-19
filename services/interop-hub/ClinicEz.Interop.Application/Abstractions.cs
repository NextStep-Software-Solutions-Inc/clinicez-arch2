using ClinicEz.Interop.Domain.Entities;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;

namespace ClinicEz.Interop.Application.Abstractions;

public enum EnqueueOutcome { Accepted, Duplicate }

/// <summary>"<c>FromKey</c> addressed <c>ToKey</c> within <c>CorrelationId</c>": lets the recipient reply later.</summary>
public sealed record ConversationEntry(Guid CorrelationId, string FromKey, string ToKey);

public interface IClientStore
{
    Task<HubClient?> FindAsync(string clientId, CancellationToken ct);
    Task AddAsync(HubClient client, CancellationToken ct);
    /// <summary>Persists changes made to a client previously returned by <see cref="FindAsync"/>.</summary>
    Task UpdateAsync(HubClient client, CancellationToken ct);
    Task<bool> AnyActiveAsync(HubClientKind kind, CancellationToken ct);
}

/// <summary>A facility as seen by a viewing workspace.</summary>
public sealed record VisibleFacility(HubFacility Facility, bool IsOwnWorkspace, LinkStatus? LinkStatus);

/// <summary>
/// Directory query. <see cref="ViewerTenants"/> is the set of tenants the viewer represents; <c>null</c> means an
/// unrestricted (control-plane) view. A facility is visible when it belongs to a viewer tenant, is Public,
/// or is Network and Active-linked to a facility of a viewer tenant.
/// </summary>
public sealed record DirectoryQuery(IReadOnlyCollection<string>? ViewerTenants, FacilityType? Type = null, string? Search = null, string? City = null);

public interface IDirectoryStore
{
    Task<HubCell?> GetCellAsync(string cellId, CancellationToken ct);
    Task<HubFacility?> GetFacilityAsync(string tenantId, string facilityId, CancellationToken ct);
    /// <summary>Tenants that have a facility in the cell (plus the cell's own tenant for an edge cell).</summary>
    Task<IReadOnlyList<string>> GetTenantsOfCellAsync(string cellId, CancellationToken ct);
    /// <summary>Active links in either direction between two facilities.</summary>
    Task<IReadOnlyList<HubLink>> GetActiveLinksBetweenAsync(string facilityKeyA, string facilityKeyB, CancellationToken ct);

    Task UpsertCellAsync(DirectoryCellUpsertedPayload cell, CancellationToken ct);
    Task UpsertFacilityAsync(DirectoryFacilityUpsertedPayload facility, CancellationToken ct);
    Task UpsertLinkAsync(DirectoryLinkUpsertedPayload link, CancellationToken ct);

    Task<IReadOnlyList<VisibleFacility>> QueryAsync(DirectoryQuery query, CancellationToken ct);
    Task<long> GetVersionAsync(CancellationToken ct);

    /// <summary>Local mode: replaces the directory with the upstream snapshot and records its version as the cursor.</summary>
    Task ApplySnapshotAsync(DirectorySnapshotDto snapshot, CancellationToken ct);
    Task<long> GetSnapshotCursorAsync(CancellationToken ct);
    Task<DirectorySnapshotDto> BuildSnapshotAsync(IReadOnlyCollection<string> viewerTenants, string ownCellId, CancellationToken ct);
}

public interface IMessageStore
{
    Task<EnqueueOutcome> EnqueueAsync(HubMessage message, ConversationEntry? conversation, CancellationToken ct);
    /// <summary>Atomically hands up to <paramref name="max"/> visible messages to the caller (compare-and-set claim, safe with several hub instances).</summary>
    Task<IReadOnlyList<HubMessage>> ClaimAsync(string mailbox, int max, CancellationToken ct);
    /// <summary>Purges the delivered messages (envelope removed, id kept for dedupe). Only deliveries in <paramref name="mailboxes"/> are touched.</summary>
    Task<int> AckAsync(IReadOnlyCollection<string> mailboxes, IReadOnlyCollection<Guid> deliveryIds, CancellationToken ct);
    Task NackAsync(IReadOnlyCollection<string> mailboxes, IReadOnlyList<NackItem> items, CancellationToken ct);
    Task<bool> HasConversationAsync(Guid correlationId, string fromKey, string toKey, CancellationToken ct);
    Task<MaintenanceReport> RunMaintenanceAsync(CancellationToken ct);
}

public sealed record MaintenanceReport(int DeadLettered, int ExpiredPurged, int DeadLettersPurged, int ConversationsPurged, int ClaimsPurged, int OutboundPurged);

public interface IOutboundStore
{
    Task<EnqueueOutcome> EnqueueAsync(HubOutboundMessage message, CancellationToken ct);
    /// <summary>Due rows, oldest first, at most one per correlation id (preserves order per correlation).</summary>
    Task<IReadOnlyList<HubOutboundMessage>> GetDueAsync(int max, CancellationToken ct);
    Task CompleteAsync(long seq, CancellationToken ct);
    Task RejectAsync(long seq, string reason, CancellationToken ct);
    Task FailAsync(long seq, int attemptCount, string error, DateTime nextAttemptAtUtc, CancellationToken ct);
    Task<int> CountPendingAsync(CancellationToken ct);
}

public interface IClaimStore
{
    Task AddAsync(HubClaim claim, CancellationToken ct);
    Task<HubClaim?> FindByTokenHashAsync(string tokenHash, CancellationToken ct);
    /// <summary>
    /// Single-use redeem: marks the claim redeemed and delivers <paramref name="message"/> in one transaction.
    /// Returns false when somebody else redeemed it first.
    /// </summary>
    Task<bool> TryRedeemAsync(HubClaim claim, string tenantId, string facilityId, HubMessage message, ConversationEntry conversation, CancellationToken ct);
}

/// <summary>Optional application-level encryption of stored envelopes (<c>Hub:PayloadEncryptionKey</c>).</summary>
public interface IEnvelopeProtector
{
    string Protect(string envelopeJson);
    string Unprotect(string stored);
}

/// <summary>Wakes long-polling pullers on this instance when a message lands in a mailbox.</summary>
public interface IMailboxNotifier
{
    Task WaitAsync(string mailbox, TimeSpan timeout, CancellationToken ct);
    void Notify(string mailbox);
}

/// <summary>Outbound-only connection from a local hub to the cloud hub.</summary>
public interface IUpstreamHub
{
    Task<IReadOnlyList<SendResult>> SendAsync(IReadOnlyList<InteropEnvelope> envelopes, CancellationToken ct);
    Task<IReadOnlyList<PulledMessage>> PullCellInboxAsync(int max, int waitSeconds, CancellationToken ct);
    Task AckCellInboxAsync(IReadOnlyList<Guid> deliveryIds, CancellationToken ct);
    Task NackCellInboxAsync(IReadOnlyList<NackItem> items, CancellationToken ct);
    Task<DirectorySnapshotDto> GetSnapshotAsync(long sinceVersion, CancellationToken ct);
    /// <summary>Proxies an HTTP call (claims) to the upstream hub with this hub's credentials.</summary>
    Task<UpstreamResponse> ForwardAsync(HttpMethod method, string pathAndQuery, string? jsonBody, CancellationToken ct);
}

public sealed record UpstreamResponse(int StatusCode, string? Body);
