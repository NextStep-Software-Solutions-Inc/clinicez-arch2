using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Interop.Application.Messaging;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Transport;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicEz.Interop.Application.Local;

/// <summary>
/// Local mode: ships the outbound queue (messages addressed beyond the edge cell) to the cloud hub. Store-and-forward:
/// a row stays queued until the cloud accepts it (or answers duplicate), transport failures back off exponentially, and
/// only a cloud "rejected" verdict dead-letters a row. Rows leave oldest-first per correlation id.
/// </summary>
public sealed class OutboundForwarder(
    IOutboundStore store,
    IUpstreamHub upstream,
    IEnvelopeProtector protector,
    IOptions<HubOptions> options,
    TimeProvider time,
    ILogger<OutboundForwarder> logger)
{
    /// <summary>Forwards one batch of due rows; returns how many rows were settled (sent, rejected or expired).</summary>
    public async Task<int> RunOnceAsync(CancellationToken ct)
    {
        var upstreamOptions = options.Value.Upstream;
        var due = await store.GetDueAsync(upstreamOptions.BatchSize, ct);
        if (due.Count == 0) return 0;

        var now = time.GetUtcNow().UtcDateTime;
        var settled = 0;
        var live = new List<(Domain.Entities.HubOutboundMessage Row, InteropEnvelope Envelope)>();
        foreach (var row in due)
        {
            if (row.ExpiresAtUtc <= now)
            {
                await store.RejectAsync(row.Seq, "expired", ct);
                settled++;
                continue;
            }

            live.Add((row, InteropEnvelope.FromJson(protector.Unprotect(row.Envelope))));
        }

        if (live.Count == 0) return settled;

        IReadOnlyList<SendResult> results;
        try
        {
            results = await upstream.SendAsync(live.Select(l => l.Envelope).ToList(), ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            foreach (var (row, _) in live) await FailAsync(row, ex.Message, ct);
            logger.LogWarning(ex, "Upstream hub unreachable; {Count} message(s) stay queued.", live.Count);
            return settled;
        }

        var byId = results.GroupBy(r => r.MessageId).ToDictionary(g => g.Key, g => g.First());
        foreach (var (row, _) in live)
        {
            if (!byId.TryGetValue(row.MessageId, out var result))
            {
                await FailAsync(row, "Upstream returned no result for this message.", ct);
            }
            else if (result.IsSuccess)
            {
                await store.CompleteAsync(row.Seq, ct);
                settled++;
            }
            else
            {
                await store.RejectAsync(row.Seq, result.Reason ?? "Rejected by upstream hub.", ct);
                logger.LogError("Upstream hub rejected {MessageId} ({Type}): {Reason}", row.MessageId, row.Type, result.Reason);
                settled++;
            }
        }

        return settled;
    }

    private Task FailAsync(Domain.Entities.HubOutboundMessage row, string error, CancellationToken ct)
    {
        var attempts = row.AttemptCount + 1;
        var delaySeconds = Math.Min(Math.Pow(2, Math.Min(attempts, 12)), options.Value.Upstream.MaxBackoffSeconds);
        return store.FailAsync(row.Seq, attempts, error, time.GetUtcNow().UtcDateTime.AddSeconds(delaySeconds), ct);
    }
}

/// <summary>
/// Local mode: pulls the cell mailbox from the cloud hub (long poll, outbound HTTPS only) and fans every message out into the
/// local service mailbox of the facility it is addressed to. Acks upstream only after the message is safely in the local mailbox.
/// </summary>
public sealed class CellInboxPuller(
    IUpstreamHub upstream,
    MessageService messages,
    IOptions<HubOptions> options,
    ILogger<CellInboxPuller> logger)
{
    /// <summary>Pulls and fans out one batch; returns the number of messages received.</summary>
    public async Task<int> RunOnceAsync(int waitSeconds, CancellationToken ct)
    {
        var pulled = await upstream.PullCellInboxAsync(options.Value.Upstream.BatchSize, waitSeconds, ct);
        if (pulled.Count == 0) return 0;

        var acks = new List<Guid>();
        var nacks = new List<NackItem>();
        foreach (var message in pulled)
        {
            try
            {
                await messages.AcceptFromUpstreamAsync(message.Envelope, ct);
                acks.Add(message.DeliveryId);
            }
            catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
            {
                logger.LogError(ex, "Cannot place cell-inbox message {MessageId} locally.", message.Envelope.MessageId);
                nacks.Add(new NackItem(message.DeliveryId, ex.Message));
            }
        }

        if (acks.Count > 0) await upstream.AckCellInboxAsync(acks, ct);
        if (nacks.Count > 0) await upstream.NackCellInboxAsync(nacks, ct);
        return pulled.Count;
    }
}

/// <summary>Local mode: keeps the read-only directory copy current so facility search and local routing work offline.</summary>
public sealed class DirectorySyncer(IUpstreamHub upstream, IDirectoryStore directory, ILogger<DirectorySyncer> logger)
{
    /// <summary>Returns true when a newer snapshot was applied.</summary>
    public async Task<bool> RunOnceAsync(CancellationToken ct)
    {
        var cursor = await directory.GetSnapshotCursorAsync(ct);
        var snapshot = await upstream.GetSnapshotAsync(cursor, ct);
        if (snapshot.Unchanged) return false;

        await directory.ApplySnapshotAsync(snapshot, ct);
        logger.LogInformation("Directory snapshot v{Version} applied: {Facilities} facilities, {Links} links.", snapshot.Version, snapshot.Facilities.Count, snapshot.Links.Count);
        return true;
    }
}
