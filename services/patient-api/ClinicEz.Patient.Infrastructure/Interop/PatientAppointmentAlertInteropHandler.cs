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
/// Handles <c>patient.appointment.alert</c>: clinic dispatched an appointment lifecycle event (booked, rescheduled, cancelled)
/// or scheduled/manual advance reminder. Idempotently records an in-app notification and dispatches FCM push notifications
/// to the patient's active device sessions.
/// </summary>
public sealed class PatientAppointmentAlertInteropHandler : IInteropHandler<PatientAppointmentAlertPayload>
{
    private readonly ApplicationDbContext _dbContext;
    private readonly IDeviceSessionRepository _deviceSessionRepository;
    private readonly IPushNotificationService _pushNotificationService;
    private readonly ILogger<PatientAppointmentAlertInteropHandler> _logger;

    public PatientAppointmentAlertInteropHandler(
        ApplicationDbContext dbContext,
        IDeviceSessionRepository deviceSessionRepository,
        IPushNotificationService pushNotificationService,
        ILogger<PatientAppointmentAlertInteropHandler> logger)
    {
        _dbContext = dbContext;
        _deviceSessionRepository = deviceSessionRepository;
        _pushNotificationService = pushNotificationService;
        _logger = logger;
    }

    public async Task HandleAsync(PatientAppointmentAlertPayload message, InteropMessageContext context, CancellationToken ct)
    {
        if (context.To.Kind != PartyKind.Patient || string.IsNullOrWhiteSpace(context.To.PatientId))
        {
            _logger.LogWarning(
                "Ignoring patient.appointment.alert {MessageId} from {Sender} to {Recipient}: recipient kind is not Patient.",
                context.MessageId, context.From.Address, context.To.Address);
            return;
        }

        if (!Guid.TryParse(context.To.PatientId, out var targetPatientId))
        {
            _logger.LogWarning(
                "Ignoring patient.appointment.alert {MessageId}: invalid patient GUID '{RecipientId}'.",
                context.MessageId, context.To.PatientId);
            return;
        }

        var patientExists = await _dbContext.Patients.AnyAsync(p => p.Id == targetPatientId, ct);
        if (!patientExists)
        {
            _logger.LogWarning(
                "Patient {PatientId} not found in patient-api for appointment alert {MessageId}.",
                targetPatientId, context.MessageId);
            return;
        }

        var sourceId = $"appointment:{message.AppointmentId}:{message.AlertKind}";
        var existingNotification = await _dbContext.Notifications
            .FirstOrDefaultAsync(n => n.PatientId == targetPatientId && n.SourceId == sourceId, ct);

        if (existingNotification != null)
        {
            _logger.LogInformation(
                "Appointment alert notification {SourceId} already recorded for patient {PatientId}. Idempotently skipping.",
                sourceId, targetPatientId);
            return;
        }

        var title = ResolveTitle(message);

        var payloadJson = JsonSerializer.Serialize(new
        {
            appointmentId = message.AppointmentId,
            clinicId = message.ClinicId,
            clinicName = message.ClinicName,
            doctorId = message.DoctorId,
            doctorName = message.DoctorName,
            serviceType = message.ServiceType,
            scheduledAtUtc = message.ScheduledAtUtc,
            durationMinutes = message.DurationMinutes,
            alertKind = message.AlertKind,
            message = message.Message,
            timestampUtc = message.TimestampUtc
        });

        var notification = new Notification
        {
            Id = Guid.NewGuid(),
            PatientId = targetPatientId,
            Title = title,
            Body = message.Message,
            Type = NotificationType.AppointmentReminder,
            Category = NotificationCategory.Appointments,
            SourceId = sourceId,
            Payload = payloadJson,
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };

        await _dbContext.Notifications.AddAsync(notification, ct);
        await _dbContext.SaveChangesAsync(ct);
        _logger.LogInformation(
            "Created in-app notification {NotificationId} for appointment {AppointmentId} patient {PatientId}.",
            notification.Id, message.AppointmentId, targetPatientId);

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
                    await _pushNotificationService.SendPushNotificationAsync(token!, title, message.Message, "appointment", ct);
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

    private static string ResolveTitle(PatientAppointmentAlertPayload message)
    {
        var suffix = string.IsNullOrWhiteSpace(message.ClinicName) ? string.Empty : $": {message.ClinicName}";
        return message.AlertKind switch
        {
            AppointmentAlertKinds.Booked => $"Appointment Confirmed{suffix}",
            AppointmentAlertKinds.Rescheduled => $"Appointment Rescheduled{suffix}",
            AppointmentAlertKinds.Cancelled => $"Appointment Cancelled{suffix}",
            AppointmentAlertKinds.Reminder24h => $"Appointment Reminder (Tomorrow){suffix}",
            AppointmentAlertKinds.Reminder2h => $"Appointment Reminder (In 2 Hours){suffix}",
            AppointmentAlertKinds.ManualReminder => $"Appointment Reminder{suffix}",
            _ => $"Appointment Notice{suffix}"
        };
    }
}
