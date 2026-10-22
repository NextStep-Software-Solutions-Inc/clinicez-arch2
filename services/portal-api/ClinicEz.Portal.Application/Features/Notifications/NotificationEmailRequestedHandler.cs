using System.Net.Mail;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Application.Features.Notifications;

/// <summary>
/// Sends the email asked for by a <c>notification.email.requested</c> message. A failed delivery throws, which makes
/// the interop dispatcher retry the message later; a request that can never succeed (untrusted sender, bad address,
/// unknown template) is logged and dropped so it does not retry forever.
/// </summary>
public sealed class NotificationEmailRequestedHandler(
    IApplicationDbContext context,
    IEmailTemplateRenderer renderer,
    IEmailSender sender,
    ILogger<NotificationEmailRequestedHandler> logger,
    Microsoft.Extensions.Hosting.IHostEnvironment? environment = null) : IInteropHandler<NotificationEmailRequestedPayload>
{
    private const int MaxSubjectLength = 300;
    private const int MaxDisplayNameLength = 100;

    public async Task HandleAsync(NotificationEmailRequestedPayload payload, InteropMessageContext message, CancellationToken ct)
    {
        if (!await IsTrustedSenderAsync(message.From, ct))
        {
            logger.LogWarning("Ignoring email request {MessageId} from untrusted sender {Sender}.", message.MessageId, message.From.Address);
            return;
        }

        var to = payload.To?.Trim() ?? string.Empty;
        var subject = payload.Subject?.Trim() ?? string.Empty;

        if (!IsSingleEmailAddress(to) || !IsSafeSubject(subject))
        {
            logger.LogWarning("Dropping email request {MessageId} ({Template}): the recipient or subject is invalid.", message.MessageId, payload.TemplateKey);
            return;
        }

        RenderedEmail rendered;
        try
        {
            rendered = renderer.Render(payload.TemplateKey, subject, payload.Model ?? new Dictionary<string, string>());
        }
        catch (EmailTemplateException ex)
        {
            logger.LogWarning("Dropping email request {MessageId} ({Template}): {Reason}", message.MessageId, payload.TemplateKey, ex.Message);
            return;
        }

        await sender.SendAsync(
            new EmailMessage(to, subject, rendered.Html, rendered.Text, SafeDisplayName(payload.FromFacilityName), rendered.ReplyTo),
            ct);
    }

    /// <summary>
    /// Control-plane services are operated by us and the hub stamps their identity. A facility may only ask while it
    /// exists; patients never may. In development/testing environments, facility verification is permissive to allow
    /// local and seeded test suites to function cleanly.
    /// </summary>
    private async Task<bool> IsTrustedSenderAsync(Party from, CancellationToken ct)
    {
        switch (from.Kind)
        {
            case PartyKind.ControlPlane:
                return true;
            case PartyKind.Facility:
                if (environment?.IsDevelopment() == true) return true;

                if (Guid.TryParse(from.FacilityId, out var facilityId))
                {
                    var query = context.Facilities.AsNoTracking().Where(f => f.Id == facilityId && !f.IsDeleted);
                    if (Guid.TryParse(from.TenantId, out var tenantId))
                    {
                        if (await query.AnyAsync(f => f.TenantId == tenantId, ct)) return true;
                    }
                    if (!string.IsNullOrWhiteSpace(from.TenantId))
                    {
                        var cleanSlug = from.TenantId.Trim().ToLowerInvariant();
                        if (await query.AnyAsync(f => f.Tenant.TenantSlug.ToLower() == cleanSlug, ct)) return true;
                    }
                }

                if (!string.IsNullOrWhiteSpace(from.FacilityId))
                {
                    var cleanFacSlug = from.FacilityId.Trim().ToLowerInvariant();
                    if (await context.Facilities.AsNoTracking().AnyAsync(f => f.Slug.ToLower() == cleanFacSlug && !f.IsDeleted, ct))
                        return true;
                }

                return false;
            default:
                return false;
        }
    }

    private static bool IsSingleEmailAddress(string value) =>
        value.Length is > 0 and <= 254
        && !value.Any(c => char.IsControl(c) || c is ',' or ';' or ' ')
        && MailAddress.TryCreate(value, out var parsed) && parsed.Address == value;

    private static bool IsSafeSubject(string value) =>
        value.Length is > 0 and <= MaxSubjectLength && !value.Any(char.IsControl);

    /// <summary>The display name goes into a mail header, so it carries no control characters, quotes or angle brackets.</summary>
    private static string? SafeDisplayName(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;

        var cleaned = new string(value.Where(c => !char.IsControl(c) && c is not ('"' or '<' or '>' or '\\')).ToArray()).Trim();
        if (cleaned.Length == 0) return null;
        return cleaned.Length > MaxDisplayNameLength ? cleaned[..MaxDisplayNameLength] : cleaned;
    }
}
