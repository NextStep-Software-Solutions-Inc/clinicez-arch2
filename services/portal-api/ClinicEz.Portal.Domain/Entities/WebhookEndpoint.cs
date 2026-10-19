using ClinicEz.Portal.Domain.Common;
using System;
using System.Collections.Generic;

namespace ClinicEz.Portal.Domain.Entities;

/// <summary>
/// An https URL in the customer's own systems that ClinicEz notifies when a workspace event happens.
/// Payloads carry workspace and facility metadata only - never patient or clinical data.
/// </summary>
public class WebhookEndpoint : BaseEntity
{
    public Guid TenantId { get; set; }
    public Tenant Tenant { get; set; } = null!;

    public string Url { get; set; } = string.Empty;
    public string? Description { get; set; }

    /// <summary>Comma separated event types this endpoint is subscribed to.</summary>
    public string Events { get; set; } = string.Empty;

    public bool IsActive { get; set; } = true;

    /// <summary>
    /// HMAC-SHA256 key used to sign deliveries. It has to be recoverable to sign, so it is stored as-is, shown to
    /// the admin once at creation, and never returned by the API again or written to the audit log.
    /// </summary>
    public string SigningSecret { get; set; } = string.Empty;

    public List<WebhookDelivery> Deliveries { get; set; } = [];
}
