using System;
using System.Threading;
using ClinicEz.Portal.Application.Features.Notifications;
using ClinicEz.Shared.Interoperability;
using Hangfire;

namespace ClinicEz.Portal.Infrastructure.Notifications;

public sealed class HangfireNotificationService(IBackgroundJobClient backgroundJobClient) : INotificationService
{
    public string EnqueueEmail(NotificationEmailRequestedPayload payload, Guid correlationId) =>
        backgroundJobClient.Enqueue<IEmailDispatchJob>(job => job.SendEmailAsync(payload, correlationId, CancellationToken.None));
}
