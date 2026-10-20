using System;

namespace ClinicEz.Shared.Interop.Contracts;

public static class AppointmentAlertKinds
{
    public const string Booked = "appointment_booked";
    public const string Rescheduled = "appointment_rescheduled";
    public const string Cancelled = "appointment_cancelled";
    public const string Reminder24h = "appointment_reminder_24h";
    public const string Reminder2h = "appointment_reminder_2h";
    public const string ManualReminder = "appointment_reminder_manual";

    public static bool IsReminder(string? kind) =>
        string.Equals(kind, Reminder24h, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(kind, Reminder2h, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(kind, ManualReminder, StringComparison.OrdinalIgnoreCase);

    public static bool IsLifecycle(string? kind) =>
        string.Equals(kind, Booked, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(kind, Rescheduled, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(kind, Cancelled, StringComparison.OrdinalIgnoreCase);
}

public sealed record PatientAppointmentAlertPayload(
    Guid AppointmentId,
    Guid ClinicId,
    string ClinicName,
    Guid? DoctorId,
    string? DoctorName,
    string? ServiceType,
    DateTime ScheduledAtUtc,
    int DurationMinutes,
    string AlertKind,
    string Message,
    DateTime TimestampUtc
);
