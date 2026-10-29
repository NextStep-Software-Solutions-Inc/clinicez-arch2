using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Application.Features.Appointments.Services;

public sealed class AppointmentNotificationDispatcher : IAppointmentNotificationDispatcher
{
    private readonly IRepository<Patient> _patientRepository;
    private readonly IRepository<FacilitySettings> _settingsRepository;
    private readonly IRepository<StaffNotification> _staffNotificationRepository;
    private readonly IInteropPublisher _publisher;
    private readonly ILogger<AppointmentNotificationDispatcher> _logger;

    public AppointmentNotificationDispatcher(
        IRepository<Patient> patientRepository,
        IRepository<FacilitySettings> settingsRepository,
        IRepository<StaffNotification> staffNotificationRepository,
        IInteropPublisher publisher,
        ILogger<AppointmentNotificationDispatcher> logger)
    {
        _patientRepository = patientRepository;
        _settingsRepository = settingsRepository;
        _staffNotificationRepository = staffNotificationRepository;
        _publisher = publisher;
        _logger = logger;
    }

    public async Task DispatchAlertAsync(Appointment appointment, string alertKind, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(appointment);

        var syncPatientId = await _patientRepository.Query(
                p => p.Id == appointment.PatientId && p.ClinicId == appointment.ClinicId,
                ignoreQueryFilters: true)
            .Select(p => p.CloudPatientId)
            .FirstOrDefaultAsync(ct);

        if (!syncPatientId.HasValue || syncPatientId.Value == Guid.Empty)
        {
            _logger.LogInformation(
                "Appointment {AppointmentId} patient {PatientId} is not linked to mobile app account (CloudPatientId is null). Skipping push notification.",
                appointment.Id, appointment.PatientId);
            return;
        }

        var settings = await _settingsRepository.Query(
                s => s.ClinicId == appointment.ClinicId,
                ignoreQueryFilters: true)
            .FirstOrDefaultAsync(ct);

        var clinicName = !string.IsNullOrWhiteSpace(settings?.ClinicName) ? settings.ClinicName.Trim() : "Clinic";
        var message = FormatAlertMessage(appointment, alertKind, clinicName);

        var payload = new PatientAppointmentAlertPayload(
            AppointmentId: appointment.Id,
            ClinicId: appointment.ClinicId,
            ClinicName: clinicName,
            DoctorId: appointment.DoctorId,
            DoctorName: appointment.DoctorName,
            ServiceType: appointment.ServiceType,
            ScheduledAtUtc: appointment.ScheduledAt.ToUniversalTime(),
            DurationMinutes: appointment.DurationMinutes > 0 ? appointment.DurationMinutes : 30,
            AlertKind: alertKind,
            Message: message,
            TimestampUtc: DateTime.UtcNow);

        var from = Party.ForFacility(appointment.TenantId ?? "clinic", appointment.ClinicId.ToString(), FacilityType.Clinic);
        var to = Party.ForPatient(syncPatientId.Value.ToString());

        _publisher.Enqueue(InteropTypes.PatientAppointmentAlert, from, to, appointment.Id, payload);

        _logger.LogInformation(
            "Enqueued {AlertKind} alert for appointment {AppointmentId} to patient {CloudPatientId}.",
            alertKind, appointment.Id, syncPatientId.Value);
    }

    public async Task DispatchStaffNotificationAsync(Appointment appointment, string eventType, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(appointment);

        if (!appointment.DoctorId.HasValue || appointment.DoctorId.Value == Guid.Empty)
        {
            _logger.LogDebug(
                "Appointment {AppointmentId} has no assigned doctor. Skipping staff notification.",
                appointment.Id);
            return;
        }

        var settings = await _settingsRepository.Query(
                s => s.ClinicId == appointment.ClinicId,
                ignoreQueryFilters: true)
            .FirstOrDefaultAsync(ct);

        if (settings != null && !settings.EnableStaffAppointmentNotifications)
        {
            _logger.LogInformation(
                "Staff appointment notifications disabled for clinic {ClinicId}. Suppressing staff notification for appointment {AppointmentId}.",
                appointment.ClinicId, appointment.Id);
            return;
        }

        var title = ResolveStaffNotificationTitle(appointment, eventType);
        var body = ResolveStaffNotificationBody(appointment, eventType);

        var staffNotification = new StaffNotification
        {
            Id = Guid.NewGuid(),
            TenantId = appointment.TenantId ?? settings?.TenantId ?? "clinic",
            ClinicId = appointment.ClinicId,
            RecipientStaffId = appointment.DoctorId,
            RecipientRole = "Doctor",
            Title = title,
            Body = body,
            Category = StaffNotificationCategory.Appointment,
            Urgency = NotificationUrgency.Routine,
            ActionRoute = "Appointments",
            ActionParamsJson = $"{{\"appointmentId\":\"{appointment.Id}\",\"date\":\"{appointment.ScheduledAt:yyyy-MM-dd}\"}}",
            SourceType = "Appointment",
            SourceId = appointment.Id.ToString(),
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };

        await _staffNotificationRepository.AddAsync(staffNotification, ct);

        _logger.LogInformation(
            "Created staff appointment notification {NotificationId} for doctor {DoctorId} on appointment {AppointmentId} (EventType: {EventType}).",
            staffNotification.Id, appointment.DoctorId.Value, appointment.Id, eventType);
    }

    private static string FormatAlertMessage(Appointment appointment, string alertKind, string clinicName)
    {
        var doctorPart = string.IsNullOrWhiteSpace(appointment.DoctorName)
            ? string.Empty
            : appointment.DoctorName.Trim().StartsWith("Dr.", StringComparison.OrdinalIgnoreCase)
                ? $" with {appointment.DoctorName.Trim()}"
                : $" with Dr. {appointment.DoctorName.Trim()}";

        var servicePart = string.IsNullOrWhiteSpace(appointment.ServiceType)
            ? string.Empty
            : $" for {appointment.ServiceType.Trim()}";

        var datePart = appointment.ScheduledAt.ToString("MMM dd, yyyy 'at' h:mm tt");

        return alertKind switch
        {
            AppointmentAlertKinds.Booked =>
                $"Your appointment{servicePart}{doctorPart} at {clinicName} has been booked for {datePart}.",
            AppointmentAlertKinds.Rescheduled =>
                $"Your appointment{servicePart}{doctorPart} at {clinicName} has been rescheduled to {datePart}.",
            AppointmentAlertKinds.Cancelled =>
                $"Your appointment{servicePart}{doctorPart} at {clinicName} scheduled for {datePart} has been cancelled.",
            AppointmentAlertKinds.Reminder24h =>
                $"Reminder: You have an upcoming appointment{servicePart}{doctorPart} at {clinicName} tomorrow at {datePart}.",
            AppointmentAlertKinds.Reminder2h =>
                $"Reminder: You have an upcoming appointment{servicePart}{doctorPart} at {clinicName} in 2 hours at {datePart}.",
            AppointmentAlertKinds.ManualReminder =>
                $"Reminder: You have an upcoming appointment{servicePart}{doctorPart} at {clinicName} scheduled for {datePart}.",
            _ =>
                $"Update regarding your appointment{servicePart}{doctorPart} at {clinicName} scheduled for {datePart}."
        };
    }

    private static string ResolveStaffNotificationTitle(Appointment appointment, string eventType)
    {
        if (string.Equals(eventType, "booked", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(eventType, AppointmentAlertKinds.Booked, StringComparison.OrdinalIgnoreCase))
        {
            return $"New Appointment: {appointment.PatientName}";
        }

        if (string.Equals(eventType, "rescheduled", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(eventType, AppointmentAlertKinds.Rescheduled, StringComparison.OrdinalIgnoreCase))
        {
            return $"Appointment Rescheduled: {appointment.PatientName}";
        }

        if (string.Equals(eventType, "cancelled", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(eventType, AppointmentAlertKinds.Cancelled, StringComparison.OrdinalIgnoreCase))
        {
            return $"Appointment Cancelled: {appointment.PatientName}";
        }

        return $"Appointment Update: {appointment.PatientName}";
    }

    private static string ResolveStaffNotificationBody(Appointment appointment, string eventType)
    {
        var datePart = appointment.ScheduledAt.ToString("MMM dd, yyyy 'at' h:mm tt");

        if (string.Equals(eventType, "booked", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(eventType, AppointmentAlertKinds.Booked, StringComparison.OrdinalIgnoreCase))
        {
            return $"Appointment for {appointment.PatientName} has been booked for {datePart}.";
        }

        if (string.Equals(eventType, "rescheduled", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(eventType, AppointmentAlertKinds.Rescheduled, StringComparison.OrdinalIgnoreCase))
        {
            return $"Appointment for {appointment.PatientName} has been rescheduled to {datePart}.";
        }

        if (string.Equals(eventType, "cancelled", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(eventType, AppointmentAlertKinds.Cancelled, StringComparison.OrdinalIgnoreCase))
        {
            return $"Appointment for {appointment.PatientName} scheduled for {datePart} has been cancelled.";
        }

        return $"Appointment for {appointment.PatientName} has been updated.";
    }
}
