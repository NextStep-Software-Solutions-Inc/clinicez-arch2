using System.Collections.Generic;

namespace ClinicEz.Shared.Interoperability;

/// <summary>
/// Any service -> portal-api (<c>InteropTypes.NotificationEmailRequested</c>). Asks the portal to send a
/// templated email from the unified mail server. Only templates registered in portal-api can be requested:
/// a requester never supplies a raw body, so the mail server cannot be used as an open relay.
/// </summary>
public sealed record NotificationEmailRequestedPayload
{
    public string To { get; init; } = string.Empty;
    public string Subject { get; init; } = string.Empty;

    /// <summary>Registered template, for example <c>staff.invitation</c>.</summary>
    public string TemplateKey { get; init; } = string.Empty;

    /// <summary>Template values. They are HTML-encoded by the portal before rendering.</summary>
    public Dictionary<string, string> Model { get; init; } = new();

    /// <summary>Shown as the sender name (for example the facility), when the template supports it.</summary>
    public string? FromFacilityName { get; init; }
}
