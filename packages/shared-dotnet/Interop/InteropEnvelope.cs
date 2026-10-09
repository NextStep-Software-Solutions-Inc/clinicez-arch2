using System.Text.Json;
using System.Text.Json.Serialization;
using ClinicEz.Shared.Common;

namespace ClinicEz.Shared.Interop;

/// <summary>Shared JSON settings so every service reads and writes envelopes identically.</summary>
public static class InteropJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Converters = { new StrictJsonStringEnumConverter() },
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

    /// <summary>
    /// ECDSA P-256 / SHA-256 signature (base64) over <see cref="EnvelopeSigning.CanonicalBytes"/>, made with the private key of
    /// the hub client named in <see cref="SignerKeyId"/>. The sending SDK sets it; the hub verifies it against the key registered
    /// for that client and forwards it unchanged; receiving SDKs verify it against the key the hub publishes.
    /// </summary>
    public string? Signature { get; init; }

    /// <summary>Hub client id whose key made <see cref="Signature"/> (a local hub re-signs forwarded messages as itself).</summary>
    public string? SignerKeyId { get; init; }

    /// <summary>
    /// Set by the hub when it rewrites <see cref="To"/> (claim redemption turns a type-only address into a concrete
    /// facility): the address the sender actually signed. Signature checks use this when present.
    /// </summary>
    public Party? SignedTo { get; init; }

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
