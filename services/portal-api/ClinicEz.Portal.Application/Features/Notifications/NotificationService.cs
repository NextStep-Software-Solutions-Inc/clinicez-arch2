using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interoperability;

namespace ClinicEz.Portal.Application.Features.Notifications;

/// <summary>
/// Entry point for "send an email" inside portal-api. The request is staged in the interop outbox and delivered
/// asynchronously by <see cref="NotificationEmailRequestedHandler"/>, so SMTP trouble never fails or slows the
/// business action, and a failed send is retried.
/// </summary>
public interface INotificationService
{
    /// <summary>
    /// Stages the request. Call it BEFORE the <c>SaveChanges</c> that persists the business change so both commit together.
    /// </summary>
    void RequestEmail(NotificationEmailRequestedPayload payload, Guid correlationId);
}

public sealed class NotificationService(IInteropPublisher publisher) : INotificationService
{
    public void RequestEmail(NotificationEmailRequestedPayload payload, Guid correlationId) =>
        publisher.Enqueue(InteropTypes.NotificationEmailRequested, Party.Portal, Party.Portal, correlationId, payload);
}
