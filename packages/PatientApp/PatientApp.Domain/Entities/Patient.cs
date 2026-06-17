using PatientApp.Domain.Common;
using PatientApp.Domain.Enums;

namespace PatientApp.Domain.Entities;

public sealed class Patient : BaseEntity, ISyncable
{
    public Guid ClientId { get; set; }
    public string? ClerkUserId { get; set; }

    // A1 — Personal Demographics
    public string FirstName { get; set; } = string.Empty;
    public string? MiddleName { get; set; }
    public string LastName { get; set; } = string.Empty;
    public string? Suffix { get; set; }
    public SexType? Sex { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    public string? PlaceOfBirth { get; set; }
    public CivilStatus? CivilStatus { get; set; }
    public BloodType? BloodType { get; set; }
    public string? Nationality { get; set; }
    public string? Ethnicity { get; set; }
    public string? Religion { get; set; }
    public string? PrimaryLanguage { get; set; }
    public EducationLevel? EducationLevel { get; set; }
    public string? AvatarUrl { get; set; }

    // A3 — Contact Information
    public string? Mobile { get; set; }
    public string? AltPhone { get; set; }
    public string? Email { get; set; }
    public string? MessengerHandle { get; set; }

    // PhilHealth consent
    public bool ConsentToShareInfo { get; set; }

    // Navigation — patient self-entry (ISyncable children)
    public ICollection<PatientGovernmentId> GovernmentIds { get; set; } = [];
    public ICollection<PatientAddress> Addresses { get; set; } = [];
    public ICollection<EmergencyContact> EmergencyContacts { get; set; } = [];
    public ICollection<PatientAllergy> Allergies { get; set; } = [];
    public ICollection<PatientMedication> Medications { get; set; } = [];
    public ICollection<PatientSurgicalHistory> SurgicalHistories { get; set; } = [];
    public ICollection<PatientPastIllness> PastIllnesses { get; set; } = [];
    public ICollection<PatientChronicCondition> ChronicConditions { get; set; } = [];
    public ICollection<PatientFamilyHistory> FamilyHistories { get; set; } = [];
    public PatientSocialHistory? SocialHistory { get; set; }
    public PatientObstetricProfile? ObstetricProfile { get; set; }
    public PatientMentalHealthProfile? MentalHealthProfile { get; set; }
    // New self-entry entities
    public ICollection<PatientHealthcareProvider> HealthcareProviders { get; set; } = [];
    public ICollection<PatientImmunizationSelf> ImmunizationsSelf { get; set; } = [];
    public ICollection<PatientDisability> Disabilities { get; set; } = [];
    public PatientOccupation? Occupation { get; set; }
    public ICollection<PatientTravelHistory> TravelHistories { get; set; } = [];
    public ICollection<PatientContraceptiveHistory> ContraceptiveHistories { get; set; } = [];
    public ICollection<PatientPregnancy> Pregnancies { get; set; } = [];
    public PatientMaleReproductive? MaleReproductive { get; set; }
    public PatientDentalVision? DentalVision { get; set; }
    public ICollection<FileFolder> FileFolders { get; set; } = [];

    // Navigation — clinical records (HCW entry, read-only for patient)
    public ICollection<VitalSigns> VitalSigns { get; set; } = [];
    public ICollection<Consultation> Consultations { get; set; } = [];
    public ICollection<LabResult> LabResults { get; set; } = [];
    public ICollection<ImagingResult> ImagingResults { get; set; } = [];
    public ICollection<FileRecord> Files { get; set; } = [];
    public ICollection<Appointment> Appointments { get; set; } = [];
    public ICollection<VaccinationAdministered> VaccinationsAdministered { get; set; } = [];
    public ICollection<ClinicalAssessment> ClinicalAssessments { get; set; } = [];
    public ICollection<PatientPhysicalExamProfile> PhysicalExamProfiles { get; set; } = [];
    public PatientNcdQuestionnaire? NcdQuestionnaire { get; set; }

    // Navigation — infrastructure
    public ICollection<SyncLog> SyncLogs { get; set; } = [];
    public ICollection<DeviceSession> DeviceSessions { get; set; } = [];
    public ICollection<Notification> Notifications { get; set; } = [];
    public ICollection<ClinicMembership> ClinicMemberships { get; set; } = [];
    public ICollection<OrganizationMembership> OrganizationMemberships { get; set; } = [];
    public ICollection<BookingDraft> BookingDrafts { get; set; } = [];
    public ICollection<NotificationPreferences> NotificationPreferences { get; set; } = [];
}
