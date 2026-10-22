using ClinicEz.Portal.Application.Features.Notifications;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;

namespace ClinicEz.Portal.Infrastructure.Notifications;

/// <summary>How emails leave the portal.</summary>
public enum SmtpMode
{
    /// <summary>Deliver through the configured SMTP server.</summary>
    Smtp,

    /// <summary>Write the email to the log instead of sending it. Development only.</summary>
    Log
}

public enum SmtpSecurity
{
    /// <summary>Implicit TLS on port 465, otherwise STARTTLS when the server offers it.</summary>
    Auto,
    None,
    StartTls,
    SslOnConnect
}

/// <summary>SMTP secrets and execution mode configured under <c>Smtp</c>. All non-secret mail server parameters (Host, Port, Security, FromEmail, FromName, ReplyTo) are managed exclusively in Platform Settings (SystemSettings) in the database.</summary>
public sealed class SmtpOptions
{
    public const string SectionName = "Smtp";

    public SmtpMode Mode { get; set; } = SmtpMode.Smtp;
    public string User { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;

    public string? FindProblem(bool isDevelopment)
    {
        if (Mode == SmtpMode.Log)
        {
            return isDevelopment ? null : "Smtp:Mode 'Log' is only allowed in the Development environment.";
        }

        return null;
    }
}

/// <summary>Fails host start-up on an unusable mail configuration instead of silently losing email later.</summary>
internal sealed class SmtpOptionsValidator(IHostEnvironment environment) : IValidateOptions<SmtpOptions>
{
    public ValidateOptionsResult Validate(string? name, SmtpOptions options) =>
        options.FindProblem(environment.IsDevelopment()) is { } problem
            ? ValidateOptionsResult.Fail(problem)
            : ValidateOptionsResult.Success;
}

public sealed class SmtpEmailSender(
    IOptions<SmtpOptions> options,
    ClinicEz.Portal.Application.Interfaces.ISystemSettingsService settingsService,
    ILogger<SmtpEmailSender>? logger = null) : IEmailSender
{
    public async Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        var smtp = options.Value;

        // Platform Settings (SystemSettings) in the database is the exclusive source of truth for all non-secret mailer parameters.
        var host = (await settingsService.GetSettingValueAsync("Mailer:SmtpHost", string.Empty, cancellationToken))?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(host))
        {
            throw new InvalidOperationException(
                "SMTP host is not configured. Please configure 'Mailer:SmtpHost' in Platform Settings (/admin/settings).");
        }

        var fromEmail = (await settingsService.GetSettingValueAsync("Mailer:SmtpFromEmail", string.Empty, cancellationToken))?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(fromEmail))
        {
            throw new InvalidOperationException(
                "SMTP sender email is not configured. Please configure 'Mailer:SmtpFromEmail' in Platform Settings (/admin/settings).");
        }

        var dbPort = await settingsService.GetSettingValueAsync("Mailer:SmtpPort", "587", cancellationToken);
        var port = int.TryParse(dbPort, out var parsedPort) && parsedPort > 0 ? parsedPort : 587;

        var dbSec = await settingsService.GetSettingValueAsync("Mailer:SmtpSecurity", "StartTls", cancellationToken);
        var security = Enum.TryParse<SmtpSecurity>(dbSec, true, out var parsedSec) ? parsedSec : SmtpSecurity.StartTls;

        var fromName = (await settingsService.GetSettingValueAsync("Mailer:SmtpFromName", "Clinic EZ Support", cancellationToken))?.Trim();
        if (string.IsNullOrWhiteSpace(fromName)) fromName = "Clinic EZ Support";

        var defaultReplyTo = (await settingsService.GetSettingValueAsync("Mailer:SmtpReplyTo", string.Empty, cancellationToken))?.Trim();

        var mime = new MimeMessage();
        mime.From.Add(new MailboxAddress(DisplayName(fromName, message), fromEmail));
        mime.To.Add(MailboxAddress.Parse(message.To));

        var replyTo = message.ReplyTo ?? defaultReplyTo;
        if (!string.IsNullOrWhiteSpace(replyTo)) mime.ReplyTo.Add(MailboxAddress.Parse(replyTo));

        mime.Subject = message.Subject;
        mime.Body = new BodyBuilder { HtmlBody = message.HtmlBody, TextBody = message.TextBody }.ToMessageBody();

        using var client = new SmtpClient();
        client.CheckCertificateRevocation = false;

        try
        {
            logger?.LogInformation("Connecting to SMTP host {Host}:{Port} (Security: {Security}) to send email to {To}...",
                host, port, security, message.To);
            await client.ConnectAsync(host, port, SocketOptions(security, port), cancellationToken);
            if (!string.IsNullOrEmpty(smtp.User))
            {
                await client.AuthenticateAsync(smtp.User, smtp.Password, cancellationToken);
            }

            await client.SendAsync(mime, cancellationToken);
            await client.DisconnectAsync(true, cancellationToken);
            logger?.LogInformation("Successfully dispatched email to {To} via SMTP host {Host}.", message.To, host);
        }
        catch (Exception ex)
        {
            logger?.LogError(ex, "Failed to send email to {To} via SMTP host {Host}:{Port}: {ErrorMessage}",
                message.To, host, port, ex.Message);
            throw;
        }
    }

    private static string DisplayName(string fromName, EmailMessage message) =>
        string.IsNullOrWhiteSpace(message.FromDisplayName) ? fromName : $"{message.FromDisplayName} (via {fromName})";

    private static SecureSocketOptions SocketOptions(SmtpSecurity security, int port) => security switch
    {
        SmtpSecurity.None => SecureSocketOptions.None,
        SmtpSecurity.StartTls => SecureSocketOptions.StartTls,
        SmtpSecurity.SslOnConnect => SecureSocketOptions.SslOnConnect,
        _ => port == 465 ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTlsWhenAvailable
    };
}

/// <summary>Development stand-in for SMTP: the email goes to the log, nothing leaves the machine.</summary>
public sealed class LogEmailSender(ILogger<LogEmailSender> logger) : IEmailSender
{
    public Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        logger.LogInformation(
            "[Smtp:Mode=Log] Email not sent. To: {To}; Subject: {Subject}; From: {From}; ReplyTo: {ReplyTo}\n{Body}",
            message.To, message.Subject, message.FromDisplayName, message.ReplyTo, message.TextBody);
        return Task.CompletedTask;
    }
}
