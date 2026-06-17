namespace PatientApp.Domain.Enums;

public enum HealthcareProviderType { PrimaryCare, Specialist1, Specialist2 }

public enum ImmunizationCategory { Child, YoungWoman, Pregnant, Elderly, Other }

public enum WorkEnvironment { Office, Field, Factory, Healthcare, Agriculture, Other }

public enum TravelPurpose { Leisure, Business, Ofw, MedicalTourism, Other }

public enum CorrectiveLenses { None, Glasses, Contacts, Both }

public enum ClinicMembershipStatus { Pending, Active }

public enum BookingDraftStatus { Draft, Ready }

public enum NotificationCategory
{
    Appointments, Reminders, Clinic, Messages, System
}

public enum FileSyncStatus { Local, Queued, Syncing, Synced, Failed, Deleted }

public enum SleepQuality { Good, Fair, Poor }
