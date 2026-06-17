namespace PatientApp.Application.Common.Constants;

/// <summary>
/// Canonical entity type names used in sync payloads.
/// Match the mobile app's syncQueue.entityType enum (snake_case).
/// </summary>
public static class SyncableEntityTypes
{
    // ── Part A: Patient self-entry ───────────────────────────────────────────
    public const string Patient                     = "patient";
    public const string PatientGovernmentId         = "patient_government_ids";
    public const string PatientAddress              = "patient_addresses";
    public const string EmergencyContact            = "emergency_contacts";
    public const string PatientAllergy              = "patient_allergies";
    public const string PatientMedication           = "patient_medications";
    public const string PatientSurgicalHistory      = "patient_surgical_history";
    public const string PatientPastIllness          = "patient_past_illnesses";
    public const string PatientChronicCondition     = "patient_chronic_conditions";
    public const string PatientFamilyHistory        = "patient_family_history";
    public const string PatientSocialHistory        = "patient_social_history";
    public const string PatientObstetricProfile     = "patient_obstetric_profile";
    public const string PatientMentalHealthProfile  = "patient_mental_health_profile";
    public const string PatientHealthcareProvider   = "patient_healthcare_providers";
    public const string PatientImmunizationSelf     = "patient_immunizations_self";
    public const string PatientDisability           = "patient_disabilities";
    public const string PatientOccupation           = "patient_occupation";
    public const string PatientTravelHistory        = "patient_travel_history";
    public const string PatientContraceptiveHistory = "patient_contraceptive_history";
    public const string PatientPregnancy            = "patient_pregnancies";
    public const string PatientMaleReproductive     = "patient_male_reproductive";
    public const string PatientDentalVision         = "patient_dental_vision";

    // ── Files & folders ──────────────────────────────────────────────────────
    public const string FileRecord   = "file";
    public const string FileFolder   = "file_folder";

    // ── Memberships & drafts ─────────────────────────────────────────────────
    public const string ClinicMembership        = "clinic_memberships";
    public const string OrganizationMembership  = "organization_memberships";
    public const string BookingDraft            = "booking_drafts";
    public const string NotificationPreferences = "notification_preferences";

    public static readonly HashSet<string> All =
    [
        Patient, PatientGovernmentId, PatientAddress, EmergencyContact,
        PatientAllergy, PatientMedication, PatientSurgicalHistory, PatientPastIllness,
        PatientChronicCondition, PatientFamilyHistory, PatientSocialHistory,
        PatientObstetricProfile, PatientMentalHealthProfile,
        PatientHealthcareProvider, PatientImmunizationSelf, PatientDisability,
        PatientOccupation, PatientTravelHistory, PatientContraceptiveHistory,
        PatientPregnancy, PatientMaleReproductive, PatientDentalVision,
        FileRecord, FileFolder,
        ClinicMembership, OrganizationMembership, BookingDraft, NotificationPreferences,
    ];
}
