using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Portal.Application.Features.Notifications;

/// <summary>
/// Background job that renders and dispatches an email message with automatic Hangfire retry policies.
/// </summary>
public interface IEmailDispatchJob
{
    Task SendEmailAsync(NotificationEmailRequestedPayload payload, Guid correlationId, CancellationToken ct);
}
