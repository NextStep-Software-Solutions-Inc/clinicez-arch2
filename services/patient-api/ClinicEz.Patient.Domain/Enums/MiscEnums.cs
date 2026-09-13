namespace ClinicEz.Patient.Domain.Enums;

public enum AppointmentStatus
{
    Pending, Confirmed, Cancelled,
    Completed, NoShow, ActionRequired
}

public enum NotificationType
{
    AppointmentReminder, ClinicAnnouncement, MedicationReminder,
    LabResult, NewMessage, System, SyncConflict
}
