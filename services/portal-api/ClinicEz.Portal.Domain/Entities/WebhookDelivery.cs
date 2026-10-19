using ClinicEz.Portal.Domain.Common;
using System;

namespace ClinicEz.Portal.Domain.Entities;

public enum WebhookDeliveryStatus
{
    /// <summary>Waiting for its first attempt or for the next retry.</summary>
    Pending = 0,
    Succeeded = 1,
    /// <summary>Gave up after the last retry, or could not be sent at all.</summary>
    Failed = 2
}

/// <summary>
/// One event queued for one endpoint. Written in the same transaction as the event that caused it,
/// then sent (and retried with backoff) by a background job. Doubles as the delivery log.
/// </summary>
public class WebhookDelivery : BaseEntity
{
    public Guid TenantId { get; set; }

    public Guid EndpointId { get; set; }
    public WebhookEndpoint Endpoint { get; set; } = null!;

    public string EventType { get; set; } = string.Empty;

    /// <summary>The exact JSON body that is signed and sent.</summary>
    public string Payload { get; set; } = "{}";

    public WebhookDeliveryStatus Status { get; set; } = WebhookDeliveryStatus.Pending;
    public int AttemptCount { get; set; }
    public DateTime NextAttemptAt { get; set; }
    public DateTime? LastAttemptAt { get; set; }
    public DateTime? DeliveredAt { get; set; }

    /// <summary>HTTP status of the last attempt, when the receiver answered.</summary>
    public int? ResponseStatusCode { get; set; }

    /// <summary>Short reason the last attempt failed. Never contains the payload or the secret.</summary>
    public string? LastError { get; set; }
}
