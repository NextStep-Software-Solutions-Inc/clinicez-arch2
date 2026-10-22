using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Portal.Application.Features.Notifications;

/// <summary>
/// Entry point for dispatching notifications in portal-api by enqueuing them into Hangfire background jobs.
/// </summary>
public interface INotificationService
{
    /// <summary>
    /// Enqueues the email request into Hangfire for resilient background delivery.
    /// Returns the Hangfire job ID.
    /// </summary>
    string EnqueueEmail(NotificationEmailRequestedPayload payload, Guid correlationId);
}
