using ClinicEz.Shared.Common;

namespace ClinicEz.Interop.Domain.Entities;

/// <summary>
/// A message waiting in a mailbox (<c>{cellId}:{service}</c>, or <c>{cellId}:cell-inbox</c> for edge cells).
/// Pulling sets <see cref="DeliveryId"/> and hides the row until <see cref="VisibleAfterUtc"/> (visibility timeout);
/// a nack or a lapsed timeout makes it visible again. Ack purges the envelope immediately; an id-only tombstone
/// (<see cref="AckedAtUtc"/>) stays until <see cref="ExpiresAtUtc"/> so a late retry of the same MessageId is still a duplicate.
/// </summary>
public class HubMessage
{
    public long Seq { get; set; }
    public Guid MessageId { get; set; }
    public Guid CorrelationId { get; set; }
    public string Mailbox { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    /// <summary>The envelope JSON (optionally AES-GCM protected at rest). Empty once acked.</summary>
    public string Envelope { get; set; } = string.Empty;
    public int SizeBytes { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime VisibleAfterUtc { get; set; }
    public Guid? DeliveryId { get; set; }
    public int AttemptCount { get; set; }
    public string? LastError { get; set; }
    public DateTime? DeadLetteredAtUtc { get; set; }
    public DateTime? AckedAtUtc { get; set; }
}

/// <summary>
/// Local mode only: a message addressed beyond the edge cell, waiting to be forwarded to the cloud hub.
/// Forwarded oldest-first per correlation id; deleted once the upstream accepts it.
/// </summary>
public class HubOutboundMessage
{
    public long Seq { get; set; }
    public Guid MessageId { get; set; }
    public Guid CorrelationId { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Envelope { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public int AttemptCount { get; set; }
    public DateTime NextAttemptAtUtc { get; set; }
    public string? LastError { get; set; }
    public DateTime? DeadLetteredAtUtc { get; set; }
}

/// <summary>
/// A patient-carried claim: the issuing facility parks an order (for example a lab request) at the hub and the
/// patient takes the token (QR on the slip) to any facility of <see cref="TargetFacilityType"/>. Redeeming it once
/// delivers the order to the redeemer and opens the correlation for replies, without any partner link.
/// Only the SHA-256 of the token is stored.
/// </summary>
public class HubClaim
{
    public Guid Id { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public Guid CorrelationId { get; set; }
    public Guid MessageId { get; set; }
    public string IssuerTenantId { get; set; } = string.Empty;
    public string IssuerFacilityId { get; set; } = string.Empty;
    public FacilityType? TargetFacilityType { get; set; }
    /// <summary>The order envelope (cleared once redeemed).</summary>
    public string Envelope { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? RedeemedAtUtc { get; set; }
    public string? RedeemedByTenantId { get; set; }
    public string? RedeemedByFacilityId { get; set; }
}
