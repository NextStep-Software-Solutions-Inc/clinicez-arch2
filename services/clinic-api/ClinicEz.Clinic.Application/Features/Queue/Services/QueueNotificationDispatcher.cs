using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Application.Features.Queue.Services;

public sealed class QueueNotificationDispatcher : IQueueNotificationDispatcher
{
    private readonly IRepository<FacilitySettings> _settingsRepository;
    private readonly IRepository<QueueItem> _queueRepository;
    private readonly IRepository<Patient> _patientRepository;
    private readonly IInteropPublisher _publisher;
    private readonly ILogger<QueueNotificationDispatcher> _logger;

    public QueueNotificationDispatcher(
        IRepository<FacilitySettings> settingsRepository,
        IRepository<QueueItem> queueRepository,
        IRepository<Patient> patientRepository,
        IInteropPublisher publisher,
        ILogger<QueueNotificationDispatcher> logger)
    {
        _settingsRepository = settingsRepository;
        _queueRepository = queueRepository;
        _patientRepository = patientRepository;
        _publisher = publisher;
        _logger = logger;
    }

    public async Task DispatchCalledAlertAsync(QueueItem item, string? doctorName, string? roomOrStation, CancellationToken ct)
    {
        var settings = await _settingsRepository.Query(s => s.ClinicId == item.ClinicId)
            .FirstOrDefaultAsync(ct);

        if (settings != null && !settings.EnableQueuePushNotifications)
        {
            _logger.LogInformation("Queue push notifications disabled for clinic {ClinicId}. Suppressing called alert for ticket {QueueNumber}.", item.ClinicId, item.QueueNumber);
            return;
        }

        if (item.CalledNotificationSent)
        {
            _logger.LogDebug("Called alert already sent for ticket {QueueNumber}.", item.QueueNumber);
            return;
        }

        var syncPatientId = item.CloudPatientId;
        if (!syncPatientId.HasValue || syncPatientId.Value == Guid.Empty)
        {
            syncPatientId = await _patientRepository.Query(p => p.Id == item.PatientId && p.ClinicId == item.ClinicId)
                .Select(p => p.CloudPatientId)
                .FirstOrDefaultAsync(ct);

            if (syncPatientId.HasValue && syncPatientId.Value != Guid.Empty)
            {
                item.CloudPatientId = syncPatientId;
            }
        }

        if (!syncPatientId.HasValue || syncPatientId.Value == Guid.Empty)
        {
            _logger.LogInformation("Ticket {QueueNumber} patient {PatientId} is not linked to mobile app account. Skipping push notification.", item.QueueNumber, item.PatientId);
            return;
        }

        var effectiveRoom = !string.IsNullOrWhiteSpace(roomOrStation) ? roomOrStation.Trim() : item.RoomOrStation;
        var effectiveDoctor = !string.IsNullOrWhiteSpace(doctorName) ? doctorName.Trim() : item.DoctorName;

        var payload = new PatientQueueAlertPayload(
            QueueTicketId: item.Id,
            TicketNumber: item.QueueNumber,
            AlertKind: QueueAlertKinds.Called,
            Message: $"Ticket {item.QueueNumber} has been called to {effectiveRoom ?? "the clinic"}.",
            DoctorName: effectiveDoctor,
            RoomOrStation: effectiveRoom,
            AheadInLine: 0,
            TimestampUtc: DateTime.UtcNow);

        var from = Party.ForFacility(item.TenantId, item.ClinicId.ToString(), FacilityType.Clinic);
        var to = Party.ForPatient(syncPatientId.Value.ToString());

        _publisher.Enqueue(InteropTypes.PatientQueueAlert, from, to, item.Id, payload);
        item.CalledNotificationSent = true;
        _logger.LogInformation("Enqueued called to room push alert for ticket {QueueNumber} to patient {CloudPatientId}.", item.QueueNumber, syncPatientId.Value);
    }

    public async Task EvaluateAndDispatchApproachingAlertsAsync(Guid clinicId, DateOnly queueDate, CancellationToken ct)
    {
        var settings = await _settingsRepository.Query(s => s.ClinicId == clinicId)
            .FirstOrDefaultAsync(ct);

        if (settings != null && !settings.EnableQueuePushNotifications)
        {
            return;
        }

        int threshold = settings?.QueuePushNotificationThreshold ?? 2;
        threshold = Math.Clamp(threshold, 1, 5);

        var waitingLine = await _queueRepository.Query(q =>
            q.ClinicId == clinicId &&
            q.QueueDate == queueDate &&
            (q.Status == QueueStatus.Waiting || q.Status == QueueStatus.Triaged))
            .OrderByDescending(q => q.Priority)
            .ThenBy(q => q.SequenceNumber)
            .ToListAsync(ct);

        for (int i = 0; i < waitingLine.Count; i++)
        {
            var ticket = waitingLine[i];
            int aheadInLine = i;

            if (aheadInLine <= threshold && !ticket.ApproachingNotificationSent)
            {
                var syncPatientId = ticket.CloudPatientId;
                if (!syncPatientId.HasValue || syncPatientId.Value == Guid.Empty)
                {
                    syncPatientId = await _patientRepository.Query(p => p.Id == ticket.PatientId && p.ClinicId == clinicId)
                        .Select(p => p.CloudPatientId)
                        .FirstOrDefaultAsync(ct);

                    if (syncPatientId.HasValue && syncPatientId.Value != Guid.Empty)
                    {
                        ticket.CloudPatientId = syncPatientId;
                    }
                }

                if (!syncPatientId.HasValue || syncPatientId.Value == Guid.Empty)
                {
                    continue;
                }

                string message = aheadInLine == 0
                    ? "You are next in line! Please proceed near the examination rooms."
                    : $"You are {aheadInLine} patient{(aheadInLine > 1 ? "s" : "")} away in line. Please be ready.";

                var payload = new PatientQueueAlertPayload(
                    QueueTicketId: ticket.Id,
                    TicketNumber: ticket.QueueNumber,
                    AlertKind: QueueAlertKinds.ApproachingTurn,
                    Message: message,
                    DoctorName: ticket.DoctorName,
                    RoomOrStation: ticket.RoomOrStation,
                    AheadInLine: aheadInLine,
                    TimestampUtc: DateTime.UtcNow);

                var from = Party.ForFacility(ticket.TenantId, ticket.ClinicId.ToString(), FacilityType.Clinic);
                var to = Party.ForPatient(syncPatientId.Value.ToString());

                _publisher.Enqueue(InteropTypes.PatientQueueAlert, from, to, ticket.Id, payload);
                ticket.ApproachingNotificationSent = true;
                _queueRepository.Update(ticket);
                _logger.LogInformation("Enqueued approaching turn alert for ticket {QueueNumber} (ahead: {AheadInLine}) to patient {CloudPatientId}.", ticket.QueueNumber, aheadInLine, syncPatientId.Value);
            }
        }
    }
}
