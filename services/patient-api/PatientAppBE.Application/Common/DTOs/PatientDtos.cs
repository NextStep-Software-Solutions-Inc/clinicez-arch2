namespace PatientAppBE.Application.Common.DTOs;

// ── Demographics (A1–A3) ─────────────────────────────────────────────────

public sealed record PatientSummaryDto(
    Guid Id,
    string FirstName, string? MiddleName, string LastName, string? Suffix,
    string? Sex, DateOnly? DateOfBirth, string? PlaceOfBirth,
    string? BloodType, string? CivilStatus,
    string? Nationality, string? Ethnicity, string? Religion, string? PrimaryLanguage,
    string? EducationLevel,
    string? Mobile, string? AltPhone, string? Email, string? MessengerHandle,
    string? AvatarUrl,
    bool ConsentToShareInfo);

// ── Contact sub-entities ──────────────────────────────────────────────────

public sealed record PatientGovernmentIdDto(
    Guid Id, Guid ClientId,
    string IdType, string IdNumber,
    DateOnly? IssuedAt, DateOnly? ExpiresAt,
    DateTime? UpdatedAt);

public sealed record PatientAddressDto(
    Guid Id, Guid ClientId,
    string Type,
    string? HouseStreet, string? Barangay, string? CityMunicipality,
    string? Province, string? Region, string? ZipCode, string? Country,
    bool IsPrimary, DateTime? UpdatedAt);

public sealed record EmergencyContactDto(
    Guid Id, Guid ClientId,
    string FullName, string? Relationship,
    string? Mobile, string? AltPhone,
    bool IsPrimary, DateTime? UpdatedAt);

public sealed record PatientHealthcareProviderDto(
    Guid Id, Guid ClientId,
    string ProviderType,
    string? Name, string? Specialty, string? ClinicHospital, string? Phone,
    DateTime? UpdatedAt);

// ── Medical history (A5–A7) ───────────────────────────────────────────────

public sealed record PatientAllergyDto(
    Guid Id, Guid ClientId,
    string AllergenName, string AllergyType, string Severity,
    string? Reaction, DateOnly? OnsetDate, string? Notes,
    DateTime? UpdatedAt);

public sealed record PatientMedicationDto(
    Guid Id, Guid ClientId,
    string MedicationName, string? GenericName,
    string? Dosage, string? Frequency, string? Route,
    DateOnly? StartDate, DateOnly? EndDate,
    bool IsCurrentlyTaking, string? PrescribedBy, string? Purpose, string? Notes,
    DateTime? UpdatedAt);

public sealed record PatientSurgicalHistoryDto(
    Guid Id, Guid ClientId,
    string ProcedureName, string? SurgeonName, string? Hospital,
    DateOnly? SurgeryDate, string? AnesthesiaType, string? Complications, string? Notes,
    DateTime? UpdatedAt);

public sealed record PatientPastIllnessDto(
    Guid Id, Guid ClientId,
    string IllnessName, DateOnly? DiagnosedAt, DateOnly? ResolvedAt,
    string? TreatmentReceived, string? Notes,
    DateTime? UpdatedAt);

public sealed record PatientChronicConditionDto(
    Guid Id, Guid ClientId,
    string ConditionName, DateOnly? DiagnosedAt,
    bool IsControlled, string? TreatmentNotes, string? CurrentMedications,
    DateTime? UpdatedAt);

public sealed record PatientFamilyHistoryDto(
    Guid Id, Guid ClientId,
    string Relation, string ConditionName,
    int? AgeOfOnset, bool IsDeceased, string? Notes,
    DateTime? UpdatedAt);

public sealed record PatientImmunizationSelfDto(
    Guid Id, Guid ClientId,
    string? ImmunizationCategory, string VaccineName,
    string? DoseNumber, string? LotNumber, DateOnly? Date,
    string? AdministeredBy, DateTime? UpdatedAt);

public sealed record PatientDisabilityDto(
    Guid Id, Guid ClientId,
    string? BodyPart, string? Classification, bool IsPwdCertified,
    DateTime? UpdatedAt);

// ── One-to-one profiles (A8–A15) ────────────────────────────────────────────

public sealed record PatientSocialHistoryDto(
    Guid Id, Guid ClientId,
    string? SmokingStatus, int? CigsPerDay, decimal? PackYears,
    DateOnly? QuitDate, string? OtherTobaccoProducts,
    string? AlcoholUse, string? AlcoholType,
    int? AlcoholFrequencyDaysPerWeek, int? AlcoholQuantityPerOccasion,
    bool UsesSubstances, string? SubstanceName, string? SubstanceRoute, string? SubstanceFrequency,
    string? ActivityLevel, string? ExerciseType, int? ExerciseFrequencyDaysPerWeek,
    string? DietPattern, string? FoodRestrictions,
    decimal? SleepAvgHours, string? SleepQuality,
    bool? IsSexuallyActive, string? WaterIntake, string? OccupationalHazards,
    DateTime? UpdatedAt);

public sealed record PatientOccupationDto(
    Guid Id, Guid ClientId,
    string? Occupation, string? Employer, string? Industry,
    string? WorkEnvironment, int? YearsInOccupation, string? HazardExposure,
    DateTime? UpdatedAt);

public sealed record PatientTravelHistoryDto(
    Guid Id, Guid ClientId,
    string Destination, string? CityProvince,
    DateOnly? DepartureDate, DateOnly? ReturnDate,
    string? Purpose, string? IllnessDuringAfterTravel,
    DateTime? UpdatedAt);

public sealed record PatientObstetricProfileDto(
    Guid Id, Guid ClientId,
    int? Gravida, int? Para, int? AbortusCount, int? LivingChildren,
    DateOnly? LastMenstrualPeriod, DateOnly? Menarche,
    bool IsPregnant, int? MenstrualCycleLengthDays, bool HasDysmenorrhea,
    string? Notes, DateTime? UpdatedAt);

public sealed record PatientPregnancyDto(
    Guid Id, Guid ClientId,
    int? Year, string? Outcome, int? GestationalAgeWeeks,
    string? DeliveryType, decimal? BirthWeightKg,
    string? Complications, string? Facility, DateTime? UpdatedAt);

public sealed record PatientContraceptiveHistoryDto(
    Guid Id, Guid ClientId,
    string Method, bool IsCurrent,
    DateOnly? DateStarted, string? ReasonForStopping,
    DateTime? UpdatedAt);

public sealed record PatientMaleReproductiveDto(
    Guid Id, Guid ClientId,
    bool HasVasectomy, DateOnly? VasectomyDate, string? Conditions,
    DateTime? UpdatedAt);

public sealed record PatientDentalVisionDto(
    Guid Id, Guid ClientId,
    string? DentistName, string? DentistClinic, string? OrthodonticDevice,
    string? EyeDoctorName, string? CorrectiveLenses,
    DateTime? UpdatedAt);

public sealed record PatientMentalHealthProfileDto(
    Guid Id, Guid ClientId,
    bool HasDiagnosis, string? DiagnosisName,
    bool IsOnMedication, string? MedicationName,
    string? TherapistName, string? TherapyType, string? SessionFrequency, string? Notes,
    DateTime? UpdatedAt);

// ── Slim profile (list views / dashboards) ─────────────────────────────────────

public sealed record PatientProfileDto(
    PatientSummaryDto Demographics,
    IReadOnlyList<PatientAddressDto> Addresses,
    IReadOnlyList<EmergencyContactDto> EmergencyContacts);

// ── Full record — all 22 ISyncable categories (first-install device hydration) ──

public sealed record PatientFullRecordDto(
    PatientSummaryDto Demographics,
    // Contact & identifiers
    IReadOnlyList<PatientGovernmentIdDto> GovernmentIds,
    IReadOnlyList<PatientAddressDto> Addresses,
    IReadOnlyList<EmergencyContactDto> EmergencyContacts,
    IReadOnlyList<PatientHealthcareProviderDto> HealthcareProviders,
    // Medical history (lists)
    IReadOnlyList<PatientAllergyDto> Allergies,
    IReadOnlyList<PatientMedicationDto> Medications,
    IReadOnlyList<PatientSurgicalHistoryDto> SurgicalHistories,
    IReadOnlyList<PatientPastIllnessDto> PastIllnesses,
    IReadOnlyList<PatientChronicConditionDto> ChronicConditions,
    IReadOnlyList<PatientFamilyHistoryDto> FamilyHistories,
    IReadOnlyList<PatientImmunizationSelfDto> ImmunizationsSelf,
    IReadOnlyList<PatientDisabilityDto> Disabilities,
    IReadOnlyList<PatientTravelHistoryDto> TravelHistories,
    IReadOnlyList<PatientContraceptiveHistoryDto> ContraceptiveHistories,
    IReadOnlyList<PatientPregnancyDto> Pregnancies,
    // One-to-one profiles
    PatientSocialHistoryDto? SocialHistory,
    PatientOccupationDto? Occupation,
    PatientObstetricProfileDto? ObstetricProfile,
    PatientMaleReproductiveDto? MaleReproductive,
    PatientDentalVisionDto? DentalVision,
    PatientMentalHealthProfileDto? MentalHealthProfile);
