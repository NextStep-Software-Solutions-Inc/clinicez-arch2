using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Application.Features.Queue.Services;

public interface IQueueNotificationDispatcher
{
    Task DispatchCalledAlertAsync(QueueItem item, string? doctorName, string? roomOrStation, CancellationToken ct);
    Task EvaluateAndDispatchApproachingAlertsAsync(Guid clinicId, DateOnly queueDate, CancellationToken ct);
}
