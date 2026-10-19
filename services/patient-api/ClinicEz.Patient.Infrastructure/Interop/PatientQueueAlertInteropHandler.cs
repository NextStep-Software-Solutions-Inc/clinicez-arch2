using System;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Handling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Patient.Infrastructure.Interop;

/// <summary>
/// Handles <c>patient.queue.alert</c>: clinic called the patient to a consultation room or notified
/// the patient that their turn is approaching. Idempotently records an in-app notification and dispatches
/// an FCM mobile push notification.
/// </summary>
public sealed class PatientQueueAlertInteropHandler : IInteropHandler<PatientQueueAlertPayload>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly IDeviceSessionRepository _deviceSessionRepository;
    private readonly IPushNotificationService _pushNotificationService;
    private readonly ILogger<PatientQueueAlertInteropHandler> _logger;

    public PatientQueueAlertInteropHandler(
        ApplicationDbContext dbContext,
        IDeviceSessionRepository deviceSessionRepository,
        IPushNotificationService pushNotificationService,
        ILogger<PatientQueueAlertInteropHandler> logger)
    {
        _dbContext = dbContext;
        _deviceSessionRepository = deviceSessionRepository;
        _pushNotificationService = pushNotificationService;
        _logger = logger;
    }

    public async Task HandleAsync(PatientQueueAlertPayload message, InteropMessageContext context, CancellationToken ct)
    {
        if (context.To.Kind != PartyKind.Patient || string.IsNullOrWhiteSpace(context.To.PatientId))
        {
            _logger.LogWarning(
                "Ignoring patient.queue.alert {MessageId} from {Sender} to {Recipient}: recipient kind is not Patient.",
                context.MessageId, context.From.Address, context.To.Address);
            return;
        }

        if (!Guid.TryParse(context.To.PatientId, out var targetPatientId))
        {
            _logger.LogWarning(
                "Ignoring patient.queue.alert {MessageId}: invalid patient GUID '{RecipientId}'.",
                context.MessageId, context.To.PatientId);
            return;
        }

        var patientExists = await _dbContext.Patients.AnyAsync(p => p.Id == targetPatientId, ct);
        if (!patientExists)
        {
            _logger.LogWarning("Patient {PatientId} not found in patient-api for queue alert {MessageId}.", targetPatientId, context.MessageId);
            return;
        }

        var sourceId = $"{message.QueueTicketId}:{message.AlertKind}";
        var existingNotification = await _dbContext.Notifications
            .FirstOrDefaultAsync(n => n.PatientId == targetPatientId && n.SourceId == sourceId, ct);

        if (existingNotification != null)
        {
            _logger.LogInformation("Queue alert notification {SourceId} already recorded for patient {PatientId}. Idempotently skipping.", sourceId, targetPatientId);
            return;
        }

        string title = QueueAlertKinds.IsCalled(message.AlertKind)
            ? $"Called: Ticket {message.TicketNumber}"
            : $"Queue Update: Ticket {message.TicketNumber}";

        string payloadJson = JsonSerializer.Serialize(new
        {
            queueTicketId = message.QueueTicketId,
            ticketNumber = message.TicketNumber,
            alertKind = message.AlertKind,
            doctorName = message.DoctorName,
            roomOrStation = message.RoomOrStation,
            aheadInLine = message.AheadInLine
        });

        var notification = new Notification
        {
            Id = Guid.NewGuid(),
            PatientId = targetPatientId,
            Title = title,
            Body = message.Message,
            Type = NotificationType.System,
            Category = NotificationCategory.Clinic,
            SourceId = sourceId,
            Payload = payloadJson,
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };

        await _dbContext.Notifications.AddAsync(notification, ct);
        await _dbContext.SaveChangesAsync(ct);
        _logger.LogInformation("Created in-app notification {NotificationId} for ticket {TicketNumber} patient {PatientId}.", notification.Id, message.TicketNumber, targetPatientId);

        // Dispatch FCM Push Notification to active device sessions
        try
        {
            var sessions = await _deviceSessionRepository.GetActiveByPatientIdAsync(targetPatientId, ct);
            var pushTokens = sessions
                .Select(s => s.PushToken)
                .Where(t => !string.IsNullOrWhiteSpace(t))
                .Distinct()
                .ToList();

            foreach (var token in pushTokens)
            {
                try
                {
                    await _pushNotificationService.SendPushNotificationAsync(token!, title, message.Message, "queue", ct);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Could not send push notification to token for patient {PatientId}.", targetPatientId);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to resolve active device sessions for push delivery to patient {PatientId}.", targetPatientId);
        }
    }
}
