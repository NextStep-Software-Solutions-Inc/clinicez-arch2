using System.Text.Json;
using System.Text.Json.Serialization;

namespace ClinicEz.Shared.Interop;

/// <summary>Shared JSON settings so every service reads and writes envelopes identically.</summary>
public static class InteropJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };
}

/// <summary>
/// The only shape in which anything crosses a service/cell boundary. Payloads are typed by
/// <see cref="Type"/> + <see cref="SchemaVersion"/>; <see cref="CorrelationId"/> stays the same for
/// the whole workflow (for example the requisition id of a lab order).
/// </summary>
public sealed record InteropEnvelope
{
    /// <summary>Idempotency key: the hub and every inbox de-duplicate on it.</summary>
    public Guid MessageId { get; init; } = Guid.NewGuid();
    public Guid CorrelationId { get; init; }
    public string Type { get; init; } = string.Empty;
    public int SchemaVersion { get; init; } = 1;
    public Party From { get; init; } = new();
    public Party To { get; init; } = new();
    public DateTime SentAtUtc { get; init; } = DateTime.UtcNow;
    public DateTime? ExpiresAtUtc { get; init; }
    public JsonElement Payload { get; init; }

    /// <summary>Reserved for v2 sealed (end-to-end encrypted) payloads. Unused in v1.</summary>
    public string? SealedPayload { get; init; }

    /// <summary>Reserved for per-message signatures. v1 authenticates the sending client instead.</summary>
    public string? Signature { get; init; }

    public static InteropEnvelope Create<T>(
        string type,
        Party from,
        Party to,
        Guid correlationId,
        T payload,
        int schemaVersion = 1,
        TimeSpan? ttl = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(type);
        ArgumentNullException.ThrowIfNull(from);
        ArgumentNullException.ThrowIfNull(to);
        var now = DateTime.UtcNow;
        return new InteropEnvelope
        {
            Type = type,
            From = from,
            To = to,
            CorrelationId = correlationId,
            SchemaVersion = schemaVersion,
            SentAtUtc = now,
            ExpiresAtUtc = ttl is null ? null : now + ttl.Value,
            Payload = JsonSerializer.SerializeToElement(payload, InteropJson.Options)
        };
    }

    public T GetPayload<T>() =>
        Payload.Deserialize<T>(InteropJson.Options)
        ?? throw new InvalidOperationException($"Envelope {MessageId} ({Type}) has an empty payload.");

    public string ToJson() => JsonSerializer.Serialize(this, InteropJson.Options);

    public static InteropEnvelope FromJson(string json) =>
        JsonSerializer.Deserialize<InteropEnvelope>(json, InteropJson.Options)
        ?? throw new InvalidOperationException("Invalid interop envelope JSON.");

    public bool IsExpired(DateTime? nowUtc = null) =>
        ExpiresAtUtc is { } e && e <= (nowUtc ?? DateTime.UtcNow);
}
