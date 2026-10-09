using System.Text;
using ClinicEz.Interop.Application.Abstractions;
using ClinicEz.Interop.Application.Directory;
using ClinicEz.Interop.Application.Routing;
using ClinicEz.Interop.Application.Security;
using ClinicEz.Interop.Domain.Entities;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Transport;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicEz.Interop.Application.Messaging;

/// <summary>
/// <c>POST /v1/messages</c>: validates each envelope (shape, size, expiry, From-ownership), applies hub-internal
/// <c>directory.*</c> messages, routes everything else (<see cref="RoutingPolicy"/>) into a mailbox or the local outbound
/// queue, and de-duplicates on MessageId. Every envelope gets its own verdict; a rejection is final (the SDK never retries it).
/// </summary>
public sealed class MessageService(
    OwnershipValidator ownership,
    RoutingPolicy routing,
    DirectoryService directory,
    IMessageStore messages,
    IOutboundStore outbound,
    IEnvelopeProtector protector,
    IMailboxNotifier notifier,
    IOptions<HubOptions> options,
    TimeProvider time,
    ILogger<MessageService> logger)
{
    private const int MaxTypeLength = 128;

    public async Task<IReadOnlyList<SendResult>> SendAsync(HubPrincipal sender, IReadOnlyList<InteropEnvelope>? envelopes, CancellationToken ct)
    {
        if (envelopes is null || envelopes.Count == 0) return [];
        if (envelopes.Count > options.Value.MaxSendBatch)
            throw HubRequestException.BadRequest($"At most {options.Value.MaxSendBatch} envelopes per request.");

        var results = new List<SendResult>(envelopes.Count);
        foreach (var envelope in envelopes)
            results.Add(await SendOneAsync(sender, envelope, ct));
        return results;
    }

    private async Task<SendResult> SendOneAsync(HubPrincipal sender, InteropEnvelope? envelope, CancellationToken ct)
    {
        if (envelope is null) return Reject(Guid.Empty, "Envelope is null.");
        var id = envelope.MessageId;
        var opt = options.Value;
        var now = time.GetUtcNow().UtcDateTime;

        var shape = ValidateShape(envelope);
        if (shape is not null) return Reject(id, shape);

        var json = envelope.ToJson();
        var size = Encoding.UTF8.GetByteCount(json);
        if (size > opt.MaxEnvelopeBytes) return Reject(id, $"Envelope is {size} bytes; the limit is {opt.MaxEnvelopeBytes}.");
        if (envelope.IsExpired(now)) return Reject(id, "expired");

        var ownershipError = await ownership.ValidateFromAsync(sender, envelope.From, ct);
        if (ownershipError is not null) return Reject(id, ownershipError);

        if (envelope.To.Service == InteropServices.Hub) return await HandleHubInternalAsync(sender, envelope, ct);

        var route = await routing.RouteAsync(sender, envelope, ct);
        switch (route.Kind)
        {
            case RouteKind.Reject:
                return Reject(id, route.Reason ?? "Rejected by routing policy.");

            case RouteKind.Forward:
                var queued = await outbound.EnqueueAsync(new HubOutboundMessage
                {
                    MessageId = id,
                    CorrelationId = envelope.CorrelationId,
                    Type = envelope.Type,
                    Envelope = protector.Protect(json),
                    CreatedAtUtc = now,
                    ExpiresAtUtc = ExpiryFor(envelope, now),
                    NextAttemptAtUtc = now
                }, ct);
                if (queued == EnqueueOutcome.Accepted) notifier.Notify(MailboxNames.OutboundSignal);
                return Verdict(id, queued);

            default:
                var outcome = await messages.EnqueueAsync(NewMessage(envelope, json, size, route.Mailbox!, now), route.Conversation, ct);
                if (outcome == EnqueueOutcome.Accepted) notifier.Notify(route.Mailbox!);
                return Verdict(id, outcome);
        }
    }

    /// <summary>
    /// Local mode: lands a message pulled from the cloud cell-inbox in the local service mailbox of the facility it is
    /// addressed to. Idempotent on MessageId; throws when the envelope cannot be placed (the caller nacks it upstream).
    /// </summary>
    public async Task<EnqueueOutcome> AcceptFromUpstreamAsync(InteropEnvelope envelope, CancellationToken ct)
    {
        var opt = options.Value;
        if (!opt.IsLocal || string.IsNullOrWhiteSpace(opt.LocalCellId))
            throw new InvalidOperationException("Cell-inbox fan-out is only available in Local mode.");
        if (envelope.To.Kind != PartyKind.Facility) throw new InvalidOperationException($"Cell-inbox message {envelope.MessageId} is not addressed to a facility.");

        string service;
        try
        {
            service = InteropServices.For(envelope.To);
        }
        catch (Exception ex) when (ex is ArgumentOutOfRangeException or InvalidOperationException)
        {
            throw new InvalidOperationException($"{RoutingPolicy.UnknownFacilityType}: cell-inbox message {envelope.MessageId} has no target service; name it in To.Service.", ex);
        }

        if (!MailboxNames.IsValidService(service)) throw new InvalidOperationException($"Cell-inbox message {envelope.MessageId} targets invalid service '{service}'.");

        var json = envelope.ToJson();
        var mailbox = MailboxNames.For(opt.LocalCellId, service);
        var now = time.GetUtcNow().UtcDateTime;
        var outcome = await messages.EnqueueAsync(NewMessage(envelope, json, Encoding.UTF8.GetByteCount(json), mailbox, now), null, ct);
        if (outcome == EnqueueOutcome.Accepted) notifier.Notify(mailbox);
        return outcome;
    }

    private async Task<SendResult> HandleHubInternalAsync(HubPrincipal sender, InteropEnvelope envelope, CancellationToken ct)
    {
        if (sender.Kind != HubClientKind.ControlPlane) return Reject(envelope.MessageId, "Only control-plane clients may address the hub.");
        if (options.Value.IsLocal) return Reject(envelope.MessageId, "A local hub does not accept directory updates; it syncs a snapshot from the cloud hub.");
        if (!InteropTypes.IsHubInternal(envelope.Type)) return Reject(envelope.MessageId, $"Unknown hub message type '{envelope.Type}'.");

        var error = await directory.ApplyFeedAsync(envelope, ct);
        if (error is not null) return Reject(envelope.MessageId, error);

        logger.LogInformation("Applied {Type} from {ClientId}", envelope.Type, sender.ClientId);
        return new SendResult(envelope.MessageId, SendResult.Accepted);
    }

    private HubMessage NewMessage(InteropEnvelope envelope, string json, int size, string mailbox, DateTime now) => new()
    {
        MessageId = envelope.MessageId,
        CorrelationId = envelope.CorrelationId,
        Mailbox = mailbox,
        Type = envelope.Type,
        Envelope = protector.Protect(json),
        SizeBytes = size,
        CreatedAtUtc = now,
        ExpiresAtUtc = ExpiryFor(envelope, now),
        VisibleAfterUtc = now
    };

    private DateTime ExpiryFor(InteropEnvelope envelope, DateTime now)
    {
        var max = now.AddDays(options.Value.MessageTtlDays);
        if (envelope.ExpiresAtUtc is not { } requested) return max;
        var utc = requested.Kind == DateTimeKind.Unspecified ? DateTime.SpecifyKind(requested, DateTimeKind.Utc) : requested.ToUniversalTime();
        return utc < max ? utc : max;
    }

    private static string? ValidateShape(InteropEnvelope envelope)
    {
        if (envelope.MessageId == Guid.Empty) return "MessageId is required.";
        if (string.IsNullOrWhiteSpace(envelope.Type) || envelope.Type.Length > MaxTypeLength) return "Type is required (max 128 characters).";
        if (envelope.From is null || envelope.To is null) return "From and To are required.";
        if (envelope.Payload.ValueKind == System.Text.Json.JsonValueKind.Undefined) return "Payload is required.";
        return null;
    }

    private static SendResult Reject(Guid id, string reason) => new(id, SendResult.Rejected, reason);

    private static SendResult Verdict(Guid id, EnqueueOutcome outcome) =>
        new(id, outcome == EnqueueOutcome.Accepted ? SendResult.Accepted : SendResult.Duplicate);
}
