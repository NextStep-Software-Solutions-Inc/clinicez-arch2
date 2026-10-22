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

/// <summary>The unified mail server, configured under <c>Smtp</c>. Credentials come from secrets or environment, never from source.</summary>
public sealed class SmtpOptions
{
    public const string SectionName = "Smtp";

    public SmtpMode Mode { get; set; } = SmtpMode.Smtp;
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 587;
    public SmtpSecurity Security { get; set; } = SmtpSecurity.Auto;
    public string User { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;

    /// <summary>Sender address. The only address mail is ever sent from.</summary>
    public string FromEmail { get; set; } = string.Empty;

    public string FromName { get; set; } = "Clinic EZ";
    public string? ReplyTo { get; set; }

    public string? FindProblem(bool isDevelopment)
    {
        if (Mode == SmtpMode.Log)
        {
            return isDevelopment ? null : "Smtp:Mode 'Log' is only allowed in the Development environment.";
        }

        // Host, FromEmail, Port, and Security are managed dynamically via Platform Settings (SystemSettings) in DB.
        // Static configuration in appsettings/env is an optional fallback.
        if (Port is < 1 or > 65535) return "Smtp:Port must be between 1 and 65535.";
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
    ClinicEz.Portal.Application.Interfaces.ISystemSettingsService? settingsService = null,
    ILogger<SmtpEmailSender>? logger = null) : IEmailSender
{
    public async Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        var smtp = options.Value;
        var host = smtp.Host;
        var port = smtp.Port;
        var fromEmail = smtp.FromEmail;
        var fromName = smtp.FromName;
        var defaultReplyTo = smtp.ReplyTo;
        var security = smtp.Security;

        // Platform Settings (SystemSettings) in DB is the primary source of truth for all non-secret mailer parameters.
        if (settingsService is not null)
        {
            var dbHost = await settingsService.GetSettingValueAsync("Mailer:SmtpHost", string.Empty, cancellationToken);
            if (!string.IsNullOrWhiteSpace(dbHost))
            {
                host = dbHost.Trim();
            }

            var dbPort = await settingsService.GetSettingValueAsync("Mailer:SmtpPort", string.Empty, cancellationToken);
            if (int.TryParse(dbPort, out var parsedPort) && parsedPort > 0)
            {
                port = parsedPort;
            }

            var dbSec = await settingsService.GetSettingValueAsync("Mailer:SmtpSecurity", string.Empty, cancellationToken);
            if (!string.IsNullOrWhiteSpace(dbSec) && Enum.TryParse<SmtpSecurity>(dbSec, true, out var parsedSec))
            {
                security = parsedSec;
            }

            var dbFromEmail = await settingsService.GetSettingValueAsync("Mailer:SmtpFromEmail", string.Empty, cancellationToken);
            if (!string.IsNullOrWhiteSpace(dbFromEmail))
            {
                fromEmail = dbFromEmail.Trim();
            }

            var dbFromName = await settingsService.GetSettingValueAsync("Mailer:SmtpFromName", string.Empty, cancellationToken);
            if (!string.IsNullOrWhiteSpace(dbFromName))
            {
                fromName = dbFromName.Trim();
            }

            var dbReplyTo = await settingsService.GetSettingValueAsync("Mailer:SmtpReplyTo", string.Empty, cancellationToken);
            if (!string.IsNullOrWhiteSpace(dbReplyTo))
            {
                defaultReplyTo = dbReplyTo.Trim();
            }
        }

        if (string.IsNullOrWhiteSpace(host))
        {
            throw new InvalidOperationException(
                "SMTP host is not configured. Please configure 'Mailer:SmtpHost' in Platform Settings (/admin/settings) or provide Smtp:Host in configuration.");
        }

        if (string.IsNullOrWhiteSpace(fromEmail))
        {
            throw new InvalidOperationException(
                "SMTP sender email is not configured. Please configure 'Mailer:SmtpFromEmail' in Platform Settings (/admin/settings) or provide Smtp:FromEmail in configuration.");
        }

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
