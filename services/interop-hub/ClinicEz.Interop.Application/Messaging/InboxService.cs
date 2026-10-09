using System.Diagnostics;
using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Interop.Application.Security;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using Microsoft.Extensions.Options;

namespace ClinicEz.Interop.Application.Messaging;

/// <summary>
/// Mailbox reads: <c>GET /v1/inbox</c>, <c>/v1/cell-inbox</c> and their ack / nack. A client's cell comes from its credentials and
/// it may read only its own service mailbox (an edge-cell client additionally its cell-inbox). Delivery is at-least-once:
/// a pulled message is hidden for the visibility timeout, then redelivered unless acked; after
/// <see cref="HubOptions.MaxDeliveryAttempts"/> attempts it is dead-lettered.
/// </summary>
public sealed class InboxService(IMessageStore messages, IEnvelopeProtector protector, IMailboxNotifier notifier, IOptions<HubOptions> options)
{
    public Task<IReadOnlyList<PulledMessage>> PullAsync(HubPrincipal client, string? service, int max, int waitSeconds, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(service)) throw HubRequestException.BadRequest("service is required.");
        if (!string.Equals(service, client.Service, StringComparison.Ordinal))
            throw HubRequestException.Forbidden($"This client may only read the '{client.Service}' mailbox.");
        return PullMailboxAsync(MailboxNames.For(client.CellId, service), max, waitSeconds, ct);
    }

    public Task<IReadOnlyList<PulledMessage>> PullCellInboxAsync(HubPrincipal client, int max, int waitSeconds, CancellationToken ct)
    {
        RequireEdgeCell(client);
        return PullMailboxAsync(MailboxNames.CellInbox(client.CellId), max, waitSeconds, ct);
    }

    public async Task AckAsync(HubPrincipal client, IReadOnlyList<Guid>? deliveryIds, bool cellInbox, CancellationToken ct)
    {
        if (deliveryIds is null || deliveryIds.Count == 0) return;
        await messages.AckAsync(MailboxesFor(client, cellInbox), deliveryIds, ct);
    }

    public async Task NackAsync(HubPrincipal client, IReadOnlyList<NackItem>? items, bool cellInbox, CancellationToken ct)
    {
        if (items is null || items.Count == 0) return;
        await messages.NackAsync(MailboxesFor(client, cellInbox), items, ct);
    }

    private async Task<IReadOnlyList<PulledMessage>> PullMailboxAsync(string mailbox, int max, int waitSeconds, CancellationToken ct)
    {
        var opt = options.Value;
        max = Math.Clamp(max, 1, opt.MaxPullBatch);
        var wait = TimeSpan.FromSeconds(Math.Clamp(waitSeconds, 0, opt.MaxLongPollSeconds));
        var interval = TimeSpan.FromMilliseconds(Math.Max(50, opt.LongPollIntervalMs));
        var clock = Stopwatch.StartNew();

        while (true)
        {
            var claimed = await messages.ClaimAsync(mailbox, max, ct);
            if (claimed.Count > 0)
                return claimed
                    .Select(m => new PulledMessage(m.DeliveryId!.Value, m.AttemptCount, InteropEnvelope.FromJson(protector.Unprotect(m.Envelope))))
                    .ToList();

            var remaining = wait - clock.Elapsed;
            if (remaining <= TimeSpan.Zero) return [];
            await notifier.WaitAsync(mailbox, remaining < interval ? remaining : interval, ct);
        }
    }

    private static string[] MailboxesFor(HubPrincipal client, bool cellInbox)
    {
        if (!cellInbox) return [MailboxNames.For(client.CellId, client.Service)];
        RequireEdgeCell(client);
        return [MailboxNames.CellInbox(client.CellId)];
    }

    private static void RequireEdgeCell(HubPrincipal client)
    {
        if (client.Kind != HubClientKind.EdgeCell) throw HubRequestException.Forbidden("Only edge-cell clients have a cell-inbox.");
    }
}
