using ClinicEz.Shared.Interop.Persistence;

namespace ClinicEz.Shared.Interop;

/// <summary>
/// Queues a message in the service's transactional outbox. It is shipped to the hub by the relay only
/// after the surrounding <c>SaveChanges</c> commits, so publish BEFORE saving (never after, never fire-and-forget).
/// </summary>
public interface IInteropPublisher
{
    InteropEnvelope Enqueue<T>(
        string type,
        Party from,
        Party to,
        Guid correlationId,
        T payload,
        int schemaVersion = 1,
        TimeSpan? ttl = null);

    /// <summary>Queue an already-built envelope (for example a reply that reuses the request's correlation id).</summary>
    void Enqueue(InteropEnvelope envelope);
}

public sealed class InteropPublisher : IInteropPublisher
{
    private readonly IInteropDbContext _db;

    public InteropPublisher(IInteropDbContext db) => _db = db;

    public InteropEnvelope Enqueue<T>(
        string type, Party from, Party to, Guid correlationId, T payload, int schemaVersion = 1, TimeSpan? ttl = null)
    {
        var envelope = InteropEnvelope.Create(type, from, to, correlationId, payload, schemaVersion, ttl);
        Enqueue(envelope);
        return envelope;
    }

    public void Enqueue(InteropEnvelope envelope)
    {
        ArgumentNullException.ThrowIfNull(envelope);
        if (string.IsNullOrWhiteSpace(envelope.Type))
            throw new ArgumentException("Envelope type is required.", nameof(envelope));

        // Fail at publish time (inside the caller's transaction), not later in a background relay.
        _ = InteropServices.For(envelope.To);

        _db.InteropOutbox.Add(new InteropOutboxMessage
        {
            MessageId = envelope.MessageId,
            CorrelationId = envelope.CorrelationId,
            Type = envelope.Type,
            EnvelopeJson = envelope.ToJson(),
            CreatedAtUtc = DateTime.UtcNow,
            NextAttemptAtUtc = DateTime.UtcNow
        });
    }
}
