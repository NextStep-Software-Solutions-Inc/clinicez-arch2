using System.Collections.Concurrent;

namespace ClinicEz.Shared.Interop.Transport;

/// <summary>
/// A single-process hub for tests and local experiments: same semantics as the real hub
/// (de-duplicate by MessageId, per-service mailboxes, ack/nack, redelivery, dead-letter).
/// Not used in production (<c>Messaging:Transport=InProcess</c> is for tests only).
/// </summary>
public sealed class InProcessHub
{
    private sealed class Entry
    {
        public required InteropEnvelope Envelope { get; init; }
        public int Attempt { get; set; }
        public Guid? DeliveryId { get; set; }
    }

    private readonly object _gate = new();
    private readonly Dictionary<string, List<Entry>> _mailboxes = new(StringComparer.Ordinal);
    private readonly HashSet<Guid> _seen = new();
    private readonly List<Entry> _deadLetters = new();
    private readonly List<InteropEnvelope> _sent = new();

    public int MaxAttempts { get; set; } = 5;

    /// <summary>Every accepted envelope, in order. Handy for assertions.</summary>
    public IReadOnlyList<InteropEnvelope> Sent { get { lock (_gate) return _sent.ToList(); } }

    public IReadOnlyList<InteropEnvelope> DeadLetters { get { lock (_gate) return _deadLetters.Select(d => d.Envelope).ToList(); } }

    public int Pending(string service)
    {
        lock (_gate) return _mailboxes.TryGetValue(service, out var l) ? l.Count : 0;
    }

    public SendResult Send(InteropEnvelope envelope)
    {
        string service;
        try { service = InteropServices.For(envelope.To); }
        catch (InvalidOperationException ex) { return new SendResult(envelope.MessageId, SendResult.Rejected, ex.Message); }

        if (envelope.IsExpired()) return new SendResult(envelope.MessageId, SendResult.Rejected, "expired");

        lock (_gate)
        {
            if (!_seen.Add(envelope.MessageId)) return new SendResult(envelope.MessageId, SendResult.Duplicate);
            if (!_mailboxes.TryGetValue(service, out var box)) _mailboxes[service] = box = new List<Entry>();
            box.Add(new Entry { Envelope = envelope });
            _sent.Add(envelope);
        }
        return new SendResult(envelope.MessageId, SendResult.Accepted);
    }

    public IReadOnlyList<PulledMessage> Pull(string service, int max)
    {
        lock (_gate)
        {
            if (!_mailboxes.TryGetValue(service, out var box)) return Array.Empty<PulledMessage>();
            var result = new List<PulledMessage>();
            foreach (var e in box.Where(e => e.DeliveryId is null).Take(max))
            {
                e.Attempt++;
                e.DeliveryId = Guid.NewGuid();
                result.Add(new PulledMessage(e.DeliveryId.Value, e.Attempt, e.Envelope));
            }
            return result;
        }
    }

    public void Ack(IEnumerable<Guid> deliveryIds)
    {
        var ids = deliveryIds.ToHashSet();
        lock (_gate)
            foreach (var box in _mailboxes.Values)
                box.RemoveAll(e => e.DeliveryId is { } d && ids.Contains(d));
    }

    public void Nack(IEnumerable<NackItem> items)
    {
        var ids = items.Select(i => i.DeliveryId).ToHashSet();
        lock (_gate)
            foreach (var box in _mailboxes.Values)
            {
                foreach (var e in box.Where(e => e.DeliveryId is { } d && ids.Contains(d)).ToList())
                {
                    if (e.Attempt >= MaxAttempts) { box.Remove(e); _deadLetters.Add(e); }
                    else e.DeliveryId = null; // visible again
                }
            }
    }
}

public sealed class InProcessHubClient : IHubClient
{
    private readonly InProcessHub _hub;
    public InProcessHubClient(InProcessHub hub) => _hub = hub;

    public Task<IReadOnlyList<SendResult>> SendAsync(IReadOnlyList<InteropEnvelope> envelopes, CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<SendResult>>(envelopes.Select(_hub.Send).ToList());

    public Task<IReadOnlyList<PulledMessage>> PullAsync(string service, int max, int waitSeconds, CancellationToken ct) =>
        Task.FromResult(_hub.Pull(service, max));

    public Task AckAsync(IReadOnlyList<Guid> deliveryIds, CancellationToken ct)
    {
        _hub.Ack(deliveryIds);
        return Task.CompletedTask;
    }

    public Task NackAsync(IReadOnlyList<NackItem> items, CancellationToken ct)
    {
        _hub.Nack(items);
        return Task.CompletedTask;
    }
}
