namespace ClinicEz.Shared.Interop.Transport;

public sealed record SendResult(Guid MessageId, string Status, string? Reason = null)
{
    public const string Accepted = "accepted";
    public const string Duplicate = "duplicate";
    public const string Rejected = "rejected";

    public bool IsSuccess => Status is Accepted or Duplicate;
}

/// <summary>A message handed to a receiver. <see cref="DeliveryId"/> is what gets acked or nacked.</summary>
public sealed record PulledMessage(Guid DeliveryId, int Attempt, InteropEnvelope Envelope);

public sealed record NackItem(Guid DeliveryId, string Error);

/// <summary>
/// The wire contract to a hub (cloud or local). Implemented by <see cref="HubHttpClient"/> in production and
/// <see cref="InProcessHubClient"/> in tests. HTTP mapping:
/// POST /v1/messages, GET /v1/inbox, POST /v1/inbox/ack, POST /v1/inbox/nack.
/// </summary>
public interface IHubClient
{
    Task<IReadOnlyList<SendResult>> SendAsync(IReadOnlyList<InteropEnvelope> envelopes, CancellationToken ct);

    Task<IReadOnlyList<PulledMessage>> PullAsync(string service, int max, int waitSeconds, CancellationToken ct);

    Task AckAsync(IReadOnlyList<Guid> deliveryIds, CancellationToken ct);

    Task NackAsync(IReadOnlyList<NackItem> items, CancellationToken ct);
}
