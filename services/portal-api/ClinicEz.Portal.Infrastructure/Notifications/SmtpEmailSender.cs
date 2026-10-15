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

        if (string.IsNullOrWhiteSpace(Host)) return "Smtp:Host is required when Smtp:Mode is 'Smtp'.";
        if (string.IsNullOrWhiteSpace(FromEmail)) return "Smtp:FromEmail is required when Smtp:Mode is 'Smtp'.";
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
    ClinicEz.Portal.Application.Interfaces.ISystemSettingsService? settingsService = null) : IEmailSender
{
    public async Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        var smtp = options.Value;
        var host = smtp.Host;
        var port = smtp.Port;
        var fromEmail = smtp.FromEmail;
        var fromName = smtp.FromName;
        var defaultReplyTo = smtp.ReplyTo;

        if (settingsService is not null)
        {
            fromEmail = await settingsService.GetSettingValueAsync("Mailer:SmtpFromEmail", fromEmail, cancellationToken);
            fromName = await settingsService.GetSettingValueAsync("Mailer:SmtpFromName", fromName, cancellationToken);
            defaultReplyTo = await settingsService.GetSettingValueAsync("Mailer:SmtpReplyTo", defaultReplyTo ?? string.Empty, cancellationToken);
        }

        var mime = new MimeMessage();
        mime.From.Add(new MailboxAddress(DisplayName(fromName, message), fromEmail));
        mime.To.Add(MailboxAddress.Parse(message.To));

        var replyTo = message.ReplyTo ?? defaultReplyTo;
        if (!string.IsNullOrWhiteSpace(replyTo)) mime.ReplyTo.Add(MailboxAddress.Parse(replyTo));

        mime.Subject = message.Subject;
        mime.Body = new BodyBuilder { HtmlBody = message.HtmlBody, TextBody = message.TextBody }.ToMessageBody();

        using var client = new SmtpClient();
        await client.ConnectAsync(host, port, SocketOptions(smtp), cancellationToken);
        if (!string.IsNullOrEmpty(smtp.User))
        {
            await client.AuthenticateAsync(smtp.User, smtp.Password, cancellationToken);
        }

        await client.SendAsync(mime, cancellationToken);
        await client.DisconnectAsync(true, cancellationToken);
    }

    private static string DisplayName(string fromName, EmailMessage message) =>
        string.IsNullOrWhiteSpace(message.FromDisplayName) ? fromName : $"{message.FromDisplayName} (via {fromName})";

    private static SecureSocketOptions SocketOptions(SmtpOptions smtp) => smtp.Security switch
    {
        SmtpSecurity.None => SecureSocketOptions.None,
        SmtpSecurity.StartTls => SecureSocketOptions.StartTls,
        SmtpSecurity.SslOnConnect => SecureSocketOptions.SslOnConnect,
        _ => smtp.Port == 465 ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTlsWhenAvailable
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
