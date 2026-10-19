namespace ClinicEz.Portal.Application.Features.Notifications;

/// <summary>A fully rendered email ready for an <see cref="IEmailSender"/>.</summary>
/// <param name="FromDisplayName">Sender name shown to the recipient; the sender address always comes from configuration.</param>
public sealed record EmailMessage(
    string To,
    string Subject,
    string HtmlBody,
    string TextBody,
    string? FromDisplayName = null,
    string? ReplyTo = null);

/// <summary>Delivers email. Throws when delivery fails so the caller can retry.</summary>
public interface IEmailSender
{
    Task SendAsync(EmailMessage message, CancellationToken cancellationToken);
}
