namespace PatientApp.Domain.Enums;

public enum AppointmentStatus
{
    Pending, Confirmed, Cancelled,
    Completed, NoShow, ActionRequired
}

public enum FileCategory
{
    Lab, Imaging, Consent, Identification, Prescription, Other
}

public enum NotificationType
{
    AppointmentReminder, ClinicAnnouncement, MedicationReminder,
    LabResult, NewMessage, System, SyncConflict
}
