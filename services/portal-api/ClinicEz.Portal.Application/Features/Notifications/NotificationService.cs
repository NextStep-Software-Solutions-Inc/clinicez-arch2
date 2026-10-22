using System.Net.Mail;
using ClinicEz.Shared.Interoperability;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Application.Features.Notifications;

/// <summary>
/// Dispatches emails directly through the unified email sender (<see cref="IEmailSender"/>) and template renderer (<see cref="IEmailTemplateRenderer"/>).
/// </summary>
public interface INotificationService
{
    /// <summary>
    /// Renders and sends the requested email directly.
    /// </summary>
    Task RequestEmailAsync(NotificationEmailRequestedPayload payload, Guid correlationId, CancellationToken ct = default);

    /// <summary>
    /// Synchronous compatibility wrapper.
    /// </summary>
    void RequestEmail(NotificationEmailRequestedPayload payload, Guid correlationId);
}

public sealed class NotificationService(
    IEmailTemplateRenderer renderer,
    IEmailSender sender,
    ILogger<NotificationService> logger) : INotificationService
{
    private const int MaxSubjectLength = 300;
    private const int MaxDisplayNameLength = 100;

    public async Task RequestEmailAsync(NotificationEmailRequestedPayload payload, Guid correlationId, CancellationToken ct = default)
    {
        var to = payload.To?.Trim() ?? string.Empty;
        var subject = payload.Subject?.Trim() ?? string.Empty;

        if (!IsSingleEmailAddress(to) || !IsSafeSubject(subject))
        {
            logger.LogWarning("Dropping email request {CorrelationId} ({Template}): the recipient or subject is invalid.", correlationId, payload.TemplateKey);
            return;
        }

        RenderedEmail rendered;
        try
        {
            rendered = renderer.Render(payload.TemplateKey, subject, payload.Model ?? new Dictionary<string, string>());
        }
        catch (EmailTemplateException ex)
        {
            logger.LogWarning("Dropping email request {CorrelationId} ({Template}): {Reason}", correlationId, payload.TemplateKey, ex.Message);
            return;
        }

        var message = new EmailMessage(
            to,
            subject,
            rendered.Html,
            rendered.Text,
            SafeDisplayName(payload.FromFacilityName),
            rendered.ReplyTo);

        try
        {
            await sender.SendAsync(message, ct);
            logger.LogInformation("Directly dispatched email {CorrelationId} ({Template}) to {To}.", correlationId, payload.TemplateKey, to);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to send email {CorrelationId} ({Template}) to {To}: {ErrorMessage}", correlationId, payload.TemplateKey, to, ex.Message);
            throw;
        }
    }

    public void RequestEmail(NotificationEmailRequestedPayload payload, Guid correlationId) =>
        RequestEmailAsync(payload, correlationId, CancellationToken.None).GetAwaiter().GetResult();

    private static bool IsSingleEmailAddress(string value) =>
        value.Length is > 0 and <= 254
        && !value.Any(c => char.IsControl(c) || c is ',' or ';' or ' ')
        && MailAddress.TryCreate(value, out var parsed) && parsed.Address == value;

    private static bool IsSafeSubject(string value) =>
        value.Length is > 0 and <= MaxSubjectLength && !value.Any(char.IsControl);

    private static string? SafeDisplayName(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;

        var cleaned = new string(value.Where(c => !char.IsControl(c) && c is not ('"' or '<' or '>' or '\\')).ToArray()).Trim();
        if (cleaned.Length == 0) return null;
        return cleaned.Length > MaxDisplayNameLength ? cleaned[..MaxDisplayNameLength] : cleaned;
    }
}
