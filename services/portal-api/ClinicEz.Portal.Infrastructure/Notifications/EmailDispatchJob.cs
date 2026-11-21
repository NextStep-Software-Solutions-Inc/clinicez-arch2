using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Mail;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Shared.Interoperability;
using Hangfire;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Infrastructure.Notifications;

public sealed class EmailDispatchJob(
    IEmailTemplateRenderer renderer,
    IEmailSender sender,
    ILogger<EmailDispatchJob> logger) : IEmailDispatchJob
{
    private const int MaxSubjectLength = 300;
    private const int MaxDisplayNameLength = 100;

    [AutomaticRetry(Attempts = 5, DelaysInSeconds = [30, 60, 300, 900, 3600], LogEvents = true, OnAttemptsExceeded = AttemptsExceededAction.Fail)]
    public async Task SendEmailAsync(NotificationEmailRequestedPayload payload, Guid correlationId, CancellationToken ct)
    {
        var to = payload.To?.Trim() ?? string.Empty;
        var subject = payload.Subject?.Trim() ?? string.Empty;

        if (!IsSingleEmailAddress(to) || !IsSafeSubject(subject))
        {
            logger.LogWarning("Dropping email job {CorrelationId} ({Template}): invalid recipient '{To}' or subject.", correlationId, payload.TemplateKey, to);
            return;
        }

        RenderedEmail rendered;
        try
        {
            rendered = renderer.Render(payload.TemplateKey, subject, payload.Model ?? new Dictionary<string, string>());
        }
        catch (EmailTemplateException ex)
        {
            logger.LogWarning("Dropping email job {CorrelationId} ({Template}): template error: {Reason}", correlationId, payload.TemplateKey, ex.Message);
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
            logger.LogInformation("Hangfire successfully dispatched email job {CorrelationId} ({Template}) to {To}.", correlationId, payload.TemplateKey, to);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to send email job {CorrelationId} ({Template}) to {To} via SMTP: {Message}. Hangfire will retry according to policy.", correlationId, payload.TemplateKey, to, ex.Message);
            throw;
        }
    }

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
