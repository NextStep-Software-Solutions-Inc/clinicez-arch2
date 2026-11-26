using System.Collections.Generic;
using ClinicEz.V1Sync.Api.Models;

namespace ClinicEz.V1Sync.Api.Services;

/// <summary>
/// Authoritative, zero-PHI reference catalog documenting how Classic Clinic EZ (v1)
/// tables, columns, enums, folders, and file objects transform into Clinic EZ v2
/// across Track 1 (Clinic Sync), Track 2 (Patient Accounts), and Track 3 (File Storage).
/// </summary>
public static class V1SyncMappingGuideCatalog
{
    public const string CatalogVersion = "2026.11";

    private static MappingGuideColumnRule Col(string v1, string v2, string? transform = null) =>
        new(v1, v2, transform);

    public static MappingGuideResponse Build() => new(
        Version: CatalogVersion,
        CoreProtections:
        [
            "v2-Wins Conflict Protection: Once a migrated record is edited in Clinic EZ v2, later v1 updates never overwrite it silently; they pause as an open review item (Keep v2, Replace with v1, or Dismiss).",
            "Deletion Shield: Soft-deleting a record in Classic (v1) never deletes the migrated record in Clinic EZ v2.",
            "Deterministic Idempotent IDs: Every v1 primary key maps to a deterministic UUIDv5 in v2, so re-running previews, migrations, or live syncs never duplicates rows.",
            "Zero-Auth0 & Zero-Fabrication Policy: Legacy auth0|* identifiers are stripped before entering v2, and out-of-range measurements are safely nulled rather than fabricated.",
            "Privacy & Vault Isolation: Private patient files remain isolated in the Patient App and never copy into Clinic charts; file binaries are encrypted separately for Clinic and Patient cloud vaults."
        ],
        Tracks:
        [
            BuildTrack1Clinic(),
            BuildTrack2Patient(),
            BuildTrack3Storage()
        ]
    );

    private static MappingGuideTrackSection BuildTrack1Clinic() => new(
        Track: SyncTrack.Track1Clinic,
        Title: "Clinic Sync",
        TargetDatabase: "Clinic Database (Clinic EZ v2)",
        Overview: "Migrates tenant- and clinic-scoped clinical charts, intake demographics, visits, consultations, vitals, prescriptions, dispensing logs, lab/imaging/cardiology orders, certificates, physical exams, and shared attachments into the target Clinic EZ v2 workspace.",
        GlobalRules:
        [
            "Every destination row is stamped with explicit TenantId and ClinicId for strict multi-tenant isolation.",
            "System audit columns use CreatedBy/UpdatedBy = 'System:V1Sync' and preserve original v1 CreatedAt/UpdatedAt timestamps.",
            "v1 UPPER_CASE enums (Gender, CivilStatus, BloodType, Status, Severity, System) are normalized to Clinic EZ v2 PascalCase enums.",
            "Institutional student/employee and intake extras are preserved losslessly in Patients.CustomFields JSONB with auto-provisioned CustomFieldDefinitions."
        ],
        Entities:
        [
            new(
                Key: "CustomFieldDefinitions",
                DisplayName: "Custom Profile Field Definitions",
                Category: "Setup & Schema",
                V1SourceTables: "public.\"OrganizationMember\", public.\"UserStudentRecord\", public.\"UserEmploymentRecord\", public.\"User\", public.\"PhilHealthRecord\"",
                V2TargetTable: "public.\"CustomFieldDefinitions\"",
                Summary: "Auto-provisions institutional, intake contact, and 9 dynamic v1 schema definitions before patient import so extra v1 attributes render cleanly in clinic profiles.",
                Rules:
                [
                    "Seeds standard institutional template keys (affiliation, student_id, college, program, year_level, employee_id, department, campus_location) plus intake fallback contact/address keys.",
                    "Auto-creates 9 lossless v1 dynamic fields: lrn, student_level, office, position, designation, place_of_birth, legacy_case_number, tin, philsys_id."
                ],
                Columns:
                [
                    Col("Template + v1 dynamic field catalog", "FieldKey, Label, DataType, Category", "Idempotent upsert keyed by (TenantId, ClinicId, EntityType='Patient', FieldKey)"),
                    Col("OrganizationCollege / Program / Department catalogs", "OptionsJson, VisibilityRuleJson", "Populated dynamically from v1 institutional lookup tables"),
                    Col("Tenant/Clinic binding", "TenantId, ClinicId, EntityType", "Scoped to bound v2 tenant & clinic; EntityType = 'Patient'")
                ],
                ConflictPolicy: "Idempotent upsert; existing active v2 field definitions are preserved and enriched."
            ),
            new(
                Key: "Patients",
                DisplayName: "Clinic Patients",
                Category: "Patient Profile",
                V1SourceTables: "public.\"User\" (+ ClinicPatient, OrganizationMember, UserStudentRecord, UserEmploymentRecord, UserAddress, UserEmergencyContact, PhilHealthRecord, PhilHealthDependent)",
                V2TargetTable: "public.\"Patients\"",
                Summary: "Imports each clinic patient's core demographics, primary contact, emergency contact, PhilHealth PIN, and lossless institutional/intake JSONB CustomFields.",
                Rules:
                [
                    "Sex maps MALE/M -> Male, FEMALE/F -> Female, INTERSEX -> Intersex, else Unknown.",
                    "BloodType normalizes A_POSITIVE/A+ -> APositive, O_POSITIVE/O+ -> OPositive, UNKNOWN/RH_POSITIVE -> Unknown.",
                    "CivilStatus maps to PascalCase (Single, Married, Widowed, Separated, Divorced, Annulled, Cohabiting, CommonLaw, Other).",
                    "Institutional fields, secondary address, PhilHealth dependents snapshot, and v1 metadata are stored in sorted CustomFields JSONB."
                ],
                Columns:
                [
                    Col("User.id", "Id, PatientCode", "Deterministic UUIDv5 per (v2ClinicId, User.id); PatientCode derived from ClinicPatient / v1 ID"),
                    Col("User.firstName, lastName, middleName, suffix, nickname", "FirstName, LastName, MiddleName, Suffix, PreferredName", "Trimmed; blank strings normalized to NULL"),
                    Col("User.birthDate", "DateOfBirth", "Dates before 1900 or in the future are safely nulled"),
                    Col("User.gender", "Sex", "MALE/M -> Male, FEMALE/F -> Female, INTERSEX -> Intersex, else Unknown"),
                    Col("User.civilStatus", "CivilStatus", "UPPER_CASE -> PascalCase enum"),
                    Col("User.bloodType", "BloodType", "e.g. O_POSITIVE / O+ -> OPositive; invalid -> NULL"),
                    Col("User.phone, email, occupation, nationality, religion", "ContactNumber, Email, Occupation, Nationality, Religion", "Trimmed & length-checked to v2 column limits"),
                    Col("UserEmergencyContact (primary)", "EmergencyContactName, EmergencyContactNumber, EmergencyContactRelationship", "Primary contact mirrored onto patient summary columns"),
                    Col("PhilHealthRecord.pin", "PhilHealthNumber", "Primary PIN mirrored onto patient record"),
                    Col("UserStudentRecord + UserEmploymentRecord + UserAddress + PhilHealthDependent", "CustomFields", "Sorted JSONB containing institutional, intake, secondary address, and dependents snapshot"),
                    Col("ClinicPatient.verificationStatus", "VerificationStatus", "VERIFIED -> Verified, PENDING -> PendingVerification, REJECTED -> Rejected")
                ],
                ConflictPolicy: "v2-Wins field hash check; protected against v1 soft-delete."
            ),
            new(
                Key: "PatientAddresses",
                DisplayName: "Patient Addresses",
                Category: "Patient Profile",
                V1SourceTables: "public.\"UserAddress\"",
                V2TargetTable: "public.\"PatientAddresses\"",
                Summary: "Maps each patient's residential and secondary addresses into structured Philippine address columns.",
                Rules:
                [
                    "StreetAddress coalesces addressLine, street, and address in priority order.",
                    "ProvinceName coalesces state and region when province is unset."
                ],
                Columns:
                [
                    Col("UserAddress.id, userId", "Id, PatientId", "Deterministic UUIDv5"),
                    Col("UserAddress.type / isPrimary", "AddressType, IsSameAsPermanent", "Normalized to Permanent / Present"),
                    Col("UserAddress.region, state, city, barangay, zipCode", "RegionName, ProvinceName, CityMunicipalityName, BarangayName, ZipCode", "Trimmed; state falls back to region"),
                    Col("UserAddress.addressLine / street / address", "StreetAddress", "First non-empty trimmed street value")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientGuardians",
                DisplayName: "Guardians & Emergency Contacts",
                Category: "Patient Profile",
                V1SourceTables: "public.\"UserEmergencyContact\"",
                V2TargetTable: "public.\"PatientGuardians\"",
                Summary: "Transfers patient emergency contacts and guardians, preserving primary contact flags and relationship details.",
                Rules:
                [
                    "When v1 stores a combined name without split firstName/lastName, the name is split cleanly without fabricating missing parts.",
                    "Marks IsEmergencyContact = true and preserves IsPrimaryGuardian from isPrimary."
                ],
                Columns:
                [
                    Col("UserEmergencyContact.id, userId", "Id, PatientId", "Deterministic UUIDv5"),
                    Col("UserEmergencyContact.firstName, middleName, lastName, suffix, name", "FirstName, MiddleName, LastName, Suffix", "Split safely if only full name exists"),
                    Col("UserEmergencyContact.phone", "ContactNumber", "Trimmed"),
                    Col("UserEmergencyContact.relationship", "RelationshipCode, RelationshipOtherSpecify", "Normalized relationship code with custom text preserved"),
                    Col("UserEmergencyContact.isPrimary", "IsPrimaryGuardian, IsEmergencyContact", "IsEmergencyContact = true")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientAllergies",
                DisplayName: "Allergies",
                Category: "Clinical History",
                V1SourceTables: "public.\"UserAllergy\" (+ public.\"Allergen\")",
                V2TargetTable: "public.\"PatientAllergies\"",
                Summary: "Imports patient allergen records with inferred category, reaction details, and clinical notes.",
                Rules:
                [
                    "Category is inferred from Allergen.name keywords into Medication, Food, Environmental, or Other.",
                    "Missing severity defaults to Moderate; anaphylaxis keywords flag IsAnaphylactic."
                ],
                Columns:
                [
                    Col("UserAllergy.id, userId", "Id, PatientId", "Deterministic UUIDv5"),
                    Col("Allergen.name", "Allergen, Category", "Category inferred: Medication | Food | Environmental | Other"),
                    Col("UserAllergy.reaction", "ReactionManifestation, IsAnaphylactic", "Anaphylaxis flag detected from reaction text"),
                    Col("UserAllergy.notes", "Notes", "Trimmed"),
                    Col("Derived", "Severity, Status", "Severity normalized to Mild/Moderate/Severe/LifeThreatening; Status = Active")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientMedicalHistories",
                DisplayName: "Medical Histories & Conditions",
                Category: "Clinical History",
                V1SourceTables: "public.\"UserHealthCondition\" + public.\"MedicalHistory\" + public.\"UserDisability\" (+ HealthCondition, Disability)",
                V2TargetTable: "public.\"PatientMedicalHistories\"",
                Summary: "Unifies active chronic conditions, past medical history items, and disabilities into one clinic medical history timeline using prefixed composite keys.",
                Rules:
                [
                    "Uses collision-free source prefixes: hc:<id> (UserHealthCondition), mh:<id> (MedicalHistory), and dis:<id> (UserDisability).",
                    "Preserves PhilHealth disease codes (HealthCondition.code) and onset/resolved dates."
                ],
                Columns:
                [
                    Col("hc:<id> | mh:<id> | dis:<id>", "Id, Category", "Deterministic UUIDv5 per prefixed key; Category reflects chronic, past illness, or disability"),
                    Col("HealthCondition.name / Disability.name", "ConditionTitle", "Disabilities prefixed with 'Disability: '"),
                    Col("HealthCondition.code", "PhilHealthMdiseaseCode", "Preserved when present"),
                    Col("severity, status", "Severity, Status, IsChronicNcd", "Severity -> Mild/Moderate/Severe/LifeThreatening"),
                    Col("dateDiagnosed, dateResolved", "OnsetDate, ResolvedDate", "Validated date range"),
                    Col("notes / details / reason", "ClinicalNotes", "Trimmed")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientFamilyHistories",
                DisplayName: "Family Medical Histories",
                Category: "Clinical History",
                V1SourceTables: "public.\"FamilyMedicalHistory\" (+ public.\"HealthCondition\")",
                V2TargetTable: "public.\"PatientFamilyHistories\"",
                Summary: "Migrates familial health conditions along with PhilHealth disease codes and parsed family member relationship.",
                Rules:
                [
                    "Extracts relationship (Mother, Father, Sibling, etc.) from FamilyMedicalHistory.details while keeping full details in ClinicalNotes."
                ],
                Columns:
                [
                    Col("FamilyMedicalHistory.id, userId", "Id, PatientId", "Deterministic UUIDv5"),
                    Col("HealthCondition.name, code", "ConditionTitle, PhilHealthMdiseaseCode", "Joined from HealthCondition catalog"),
                    Col("FamilyMedicalHistory.details", "Relationship, ClinicalNotes", "Relationship parsed from details; raw text preserved in ClinicalNotes")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientSocialHistories",
                DisplayName: "Social & Lifestyle Histories",
                Category: "Clinical History",
                V1SourceTables: "public.\"PersonalHistory\"",
                V2TargetTable: "public.\"PatientSocialHistories\"",
                Summary: "Transfers one social/lifestyle history profile per patient covering smoking, alcohol, illicit drug use, and activity flags.",
                Rules:
                [
                    "SmokingStatus maps to CurrentSmoker, FormerSmoker, or NeverSmoked; IsSmoker derived from active smoking statuses.",
                    "AlcoholStatus maps to Heavy, Moderate, Occasional, or Never; IsAlcoholDrinker derived accordingly.",
                    "SmokingPackYears outside 0..999.99 is safely nulled to avoid numeric overflow."
                ],
                Columns:
                [
                    Col("PersonalHistory.userId", "Id, PatientId", "1 row per patient (latest active v1 row)"),
                    Col("PersonalHistory.smokingStatus, packYears", "IsSmoker, SmokingStatus, SmokingPackYears", "Normalized enum + clamped to 0..999.99"),
                    Col("PersonalHistory.alcoholStatus, alcoholBottlesPerDay", "IsAlcoholDrinker, AlcoholStatus, AlcoholBottlesPerDay", "Normalized enum"),
                    Col("PersonalHistory.illicitDrugs, sexuallyActive, physicallyActive, fluorideToothpaste", "UsesIllicitDrugs, IsSexuallyActive, IsPhysicallyActive, UsesFluorideToothpaste", "Boolean normalization")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientReproductiveHistories",
                DisplayName: "OB-GYN & Reproductive Histories",
                Category: "Clinical History",
                V1SourceTables: "public.\"ObGyneHistory\"",
                V2TargetTable: "public.\"PatientReproductiveHistories\"",
                Summary: "Migrates obstetric and gynecologic history metrics (menarche, LMP, GTPAL counts, pregnancy and delivery history).",
                Rules:
                [
                    "1 row per patient; preserves GTPAL counts, cycle metrics, and obstetric risk flags."
                ],
                Columns:
                [
                    Col("ObGyneHistory.userId", "Id, PatientId, IsApplicable", "1 row per patient"),
                    Col("menarcheAge, lastMenstrualPeriod, menopauseAge, isMenopausal", "MenarcheAge, LastMenstrualPeriod, MenopauseAge, IsMenopausal", "Validated date & age values"),
                    Col("gravidity, parity, termBirths, pretermBirths, abortions, livingChildren", "Gravidity, Parity, TermBirths, PretermBirths, Abortions, LivingChildren", "Direct integer mapping"),
                    Col("deliveryType, contraceptiveMethod, periodDuration, cycleInterval", "DeliveryType, ContraceptiveMethod, PeriodDurationDays, CycleIntervalDays", "Trimmed / normalized")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientSurgicalHistories",
                DisplayName: "Surgical Histories",
                Category: "Clinical History",
                V1SourceTables: "public.\"SurgicalHistory\"",
                V2TargetTable: "public.\"PatientSurgicalHistories\"",
                Summary: "Imports prior surgeries with procedure name, operation date, and surgical remarks.",
                Rules:
                [
                    "Dates outside 1900..today+1 are nulled safely rather than rejected."
                ],
                Columns:
                [
                    Col("SurgicalHistory.id, userId", "Id, PatientId", "Deterministic UUIDv5"),
                    Col("SurgicalHistory.operationName", "ProcedureName", "Trimmed"),
                    Col("SurgicalHistory.operationDate", "SurgeryDate", "Validated DateOnly"),
                    Col("SurgicalHistory.notes", "Remarks", "Trimmed")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientImmunizations",
                DisplayName: "Immunizations",
                Category: "Clinical History",
                V1SourceTables: "public.\"UserVaccination\" (+ Vaccine, Dose, Route)",
                V2TargetTable: "public.\"PatientImmunizations\"",
                Summary: "Migrates clinic and historical patient vaccinations with vaccine name, dose sequence, administration route, and administering provider.",
                Rules:
                [
                    "Joins Vaccine, Dose, and Route lookup tables so clinic charts store human-readable strings."
                ],
                Columns:
                [
                    Col("UserVaccination.id, userId", "Id, PatientId", "Deterministic UUIDv5"),
                    Col("Vaccine.name, Dose.dose, Route.route", "VaccineName, DoseSequence, Route", "Joined from v1 catalogs"),
                    Col("UserVaccination.dateGiven, administeredBy", "AdministeredAtUtc, AdministeredByStaffName", "Preserved timestamps & staff name"),
                    Col("UserVaccination.notes", "Remarks", "Trimmed")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientPhilHealthMemberships",
                DisplayName: "PhilHealth Memberships",
                Category: "Patient Profile",
                V1SourceTables: "public.\"PhilHealthRecord\" (+ public.\"PhilHealthDependent\")",
                V2TargetTable: "public.\"PatientPhilHealthMemberships\"",
                Summary: "Maps each patient's primary PhilHealth membership PIN, member type (MM/DD), and dependent relationship.",
                Rules:
                [
                    "MemberType normalizes DD/DEPENDENT/D/DEP -> DD, all others -> MM.",
                    "DependentRelationship normalizes to S (Spouse), C (Child), P (Parent), or D (Disabled Dependent).",
                    "Additional PhilHealthDependent rows are preserved in Patients.CustomFields.philhealth_dependents to respect the 1:1 membership constraint."
                ],
                Columns:
                [
                    Col("PhilHealthRecord.userId", "Id, PatientId", "1 active membership row per patient"),
                    Col("PhilHealthRecord.pin, principalMemberPin", "MemberPin, PrincipalMemberPin", "Trimmed"),
                    Col("PhilHealthRecord.memberType", "MemberType", "DD | MM"),
                    Col("PhilHealthDependent.relationship", "DependentRelationship", "S | C | P | D")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientAlerts",
                DisplayName: "Patient Safety Alerts & Insights",
                Category: "Patient Profile",
                V1SourceTables: "public.\"PatientInsight\"",
                V2TargetTable: "public.\"PatientAlerts\"",
                Summary: "Converts Classic clinic patient insights into structured clinic safety alerts with expiration tracking.",
                Rules:
                [
                    "Active non-expired alerts synchronize Patients.HasActiveSafetyAlert."
                ],
                Columns:
                [
                    Col("PatientInsight.id, patientId", "Id, PatientId", "Deterministic UUIDv5"),
                    Col("PatientInsight.content", "Title, Notes", "Summary title + full note body"),
                    Col("PatientInsight.validUntil", "ExpiresAt, Status", "Expired timestamps set Status accordingly")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "Appointments",
                DisplayName: "Appointments",
                Category: "Visits & Encounters",
                V1SourceTables: "public.\"Appointment\" (+ AppointmentRequester, AppointmentAttribute, AppointmentMode, AppointmentType, AppointmentRouting, Service, HealthcareProvider)",
                V2TargetTable: "public.\"Appointments\"",
                Summary: "Migrates scheduled and walk-in clinic appointments, including service type, teleconsult vs. in-person mode, provider info, and routing notes.",
                Rules:
                [
                    "Status maps COMPLETED -> Completed, CANCELLED/REJECTED/DROPPED -> Cancelled, RECEIVED/ROUTED -> CheckedIn, PENDING -> Pending.",
                    "AppointmentType maps VIRTUAL/TELE mode or non-empty meetingUrl -> Teleconsult, otherwise InPerson.",
                    "Routing amendments and return reasons are aggregated cleanly into appointment notes."
                ],
                Columns:
                [
                    Col("Appointment.id, AppointmentRequester.userId", "Id, PatientId", "Deterministic UUIDv5"),
                    Col("AppointmentAttribute.date, timeStart, maxDuration", "ScheduledAt, DurationMinutes, EndTimeUtc", "Combines date + timeStart into UTC timestamp"),
                    Col("AppointmentAttribute.status", "Status", "Completed | Cancelled | CheckedIn | Pending"),
                    Col("AppointmentMode.name, meetingUrl", "AppointmentType", "Teleconsult | InPerson"),
                    Col("Service.name, Appointment.subject, complaint", "ServiceType, Reason, Notes", "Includes aggregated AppointmentRouting remarks"),
                    Col("HealthcareProvider / HPProfile", "DoctorId, DoctorName", "Resolved provider name")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "HistoricalQueueItems",
                DisplayName: "Visit Queue Items",
                Category: "Visits & Encounters",
                V1SourceTables: "public.\"Appointment\" + public.\"ConsultationTicket\"",
                V2TargetTable: "public.\"QueueItems\"",
                Summary: "Builds the clinic visit spine by creating historical queue items for appointments and standalone walk-in consultation tickets.",
                Rules:
                [
                    "Cancelled/rejected appointments without a consultation map to Cancelled; all completed visits map to Completed.",
                    "ConsultationTickets without a parent Appointment create a direct-visit QueueItem (IsDirectVisit = true) so every encounter has a valid visit spine."
                ],
                Columns:
                [
                    Col("Appointment.id / ConsultationTicket.id", "Id, AppointmentId, QueueNumber", "Deterministic UUIDv5; QueueNumber derived from caseNumber or ID"),
                    Col("AppointmentAttribute.receivedAt, completedAt", "CheckInTime, CompletedTime, QueueDate", "Preserves visit timing"),
                    Col("Appointment.complaint / ConsultationTicket.subject", "ChiefComplaint, VisitType, IsDirectVisit", "Direct-visit flag set for standalone tickets")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "Consultations",
                DisplayName: "Clinical Consultations (SOAP)",
                Category: "Visits & Encounters",
                V1SourceTables: "public.\"ConsultationTicket\" (+ ConsultationTicketHP, ConsultationNote, ConsultationDiagnosis, ConsultationManagement, KonsultaManagementCode, System, HPProfile, ProfessionalDetails)",
                V2TargetTable: "public.\"Consultations\"",
                Summary: "Assembles full SOAP clinical encounters, physician PRC/PTR credentials, PhilHealth Konsulta/YAKAP metadata, ROS category, and management codes.",
                Rules:
                [
                    "Aggregates ConsultationNote sections in chronological order into Subjective, Objective, Assessment, and Plan.",
                    "Maps all 22 v1 System.name values to exact v2 PascalCase RosCategory values.",
                    "Flattens JSON-encoded Konsulta advice and diagnostic service options into plain clinical text and codes."
                ],
                Columns:
                [
                    Col("ConsultationTicket.id, appointmentId", "Id, QueueItemId, AppointmentId, PatientId", "Linked to migrated patient and visit QueueItem"),
                    Col("ConsultationNote (by section)", "Subjective, Objective, Assessment, Plan", "Chronologically concatenated section notes"),
                    Col("ConsultationTicketHP + HPProfile + ProfessionalDetails", "DoctorName, DoctorPrcLicense, DoctorPtr", "Physician identity & license credentials"),
                    Col("ConsultationTicket.konsultaHciCaseNo, soapTransNo, konsultaAtc, konsultaIsWalkedIn", "PhilHealthCaseNo, PhilHealthSoapTransNo, PhilHealthAtc, IsWalkedIn, IsYakapEligible", "PhilHealth Konsulta / YAKAP linkage preserved"),
                    Col("System.name", "RosCategory", "22 v1 systems -> PascalCase RosSystem enum"),
                    Col("ConsultationManagement + KonsultaManagementCode", "HomeInstructions, DiagnosticServicesOption, PhilHealthManagementCodes", "Flattened JSON/text advice and management codes")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientVitals",
                DisplayName: "Vital Signs & Pre-Assessments",
                Category: "Visits & Encounters",
                V1SourceTables: "public.\"VitalSign\" + public.\"PreAssessmentNote\"",
                V2TargetTable: "public.\"PatientVitals\"",
                Summary: "Migrates vital signs, anthropometrics, visual acuity, and merges companion PreAssessmentNote observations into the encounter's vital sign record.",
                Rules:
                [
                    "Out-of-range measurements are safely nulled: Temperature (25..45 °C), SpO2 (0..100%), Weight (0..999.99 kg), Height (0..9999.9 cm), BMI (0..999.99).",
                    "PreAssessmentNote records matching an existing consultation attach directly onto the VitalSign row; standalone PreAssessmentNotes create a dedicated PatientVitals entry."
                ],
                Columns:
                [
                    Col("VitalSign.id, consultationTicketId", "Id, ConsultationEncounterId, QueueItemId, PatientId", "Deterministic UUIDv5"),
                    Col("bloodPressureSystolic, bloodPressureDiastolic, heartRate, respiratoryRate", "SystolicBp, DiastolicBp, HeartRateBpm, RespiratoryRateBreathsPerMin", "Direct numeric mapping"),
                    Col("temperature, oxygenSaturation, weight, height, bmi", "TemperatureCelsius, OxygenSaturationPercent, WeightKg, HeightCm, Bmi", "Bounds-validated & rounded to v2 decimal precision"),
                    Col("headCircumference, hip, waist, muac, skinfold, visualAcuity*", "HeadCircumferenceCm, HipCircumferenceCm, WaistCircumferenceCm, MidUpperArmCircumferenceCm, SkinfoldThicknessMm, VisualAcuityLeft/Right", "Anthropometric fields preserved"),
                    Col("PreAssessmentNote.notes, remarks, homeInstructions", "PreAssessmentNotes, PreAssessmentRemarks, HomeInstructions", "Merged into matching consultation vitals or created standalone")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "Prescriptions",
                DisplayName: "Prescriptions & Medication Lines",
                Category: "Orders, Rx & Certificates",
                V1SourceTables: "public.\"Prescription\" + public.\"Medicine\" (+ MedicinePhilHealthData, MedicineDispenseRecord, HPProfile, ProfessionalDetails)",
                V2TargetTable: "public.\"Prescriptions\"",
                Summary: "Imports prescribed medications per consultation along with dosage, sig, quantity, PhilHealth GAMOT drug codes, and dispensing summary flags.",
                Rules:
                [
                    "Each v1 Medicine line becomes a v2 Prescriptions row linked to its parent ConsultationEncounterId.",
                    "Preserves PhilHealth drug codes, GAMOT coverage flags, and clinic dispensing totals."
                ],
                Columns:
                [
                    Col("Medicine.id, Prescription.consultationTicketId", "Id, ConsultationEncounterId", "Deterministic UUIDv5"),
                    Col("Medicine.genericName, brandName, dosage, form, route, frequency, duration", "GenericName, BrandName, Dosage, Form, Route, Frequency, DurationDays", "Trimmed & normalized"),
                    Col("Medicine.instructions, quantity, doseQuantity, doseUnit", "Sig, Quantity, DoseQuantity, DoseUnit", "Direct mapping"),
                    Col("MedicinePhilHealthData.*", "PhilHealthDrugCode, PhilHealthCategory, IsGamotCovered", "PhilHealth / GAMOT metadata preserved"),
                    Col("HPProfile / ProfessionalDetails", "PrescribingPhysicianName, PrescribingPhysicianPrcNo", "Prescriber identity"),
                    Col("MedicineDispenseRecord (aggregated)", "IsDispensed, IsClinicDispensed, ClinicDispensedQuantity, ClinicDispensedAt", "Reflected when dispensed")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "ClinicDispensingLogs",
                DisplayName: "Clinic Dispensing Logs",
                Category: "Orders, Rx & Certificates",
                V1SourceTables: "public.\"MedicineDispenseRecord\" (where isDispensed = true)",
                V2TargetTable: "public.\"ClinicDispensingLogs\"",
                Summary: "Transfers verified clinic pharmacy dispensing events linked back to the patient, visit queue item, and prescription line.",
                Rules:
                [
                    "Only records with isDispensed = true are migrated into ClinicDispensingLogs."
                ],
                Columns:
                [
                    Col("MedicineDispenseRecord.id", "Id, PrescriptionItemId, ConsultationEncounterId, PatientId", "Deterministic UUIDv5"),
                    Col("Medicine.genericName / brandName, dosage, form", "ItemName, DosageOrSpec, FormOrUnit", "Joined from parent Medicine row"),
                    Col("MedicineDispenseRecord.quantity, dispensedBy, dispensedAt", "QuantityDispensed, DispensedByStaffName, DispensedAt", "Preserves dispensing audit trail")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "DiagnosticLabOrders",
                DisplayName: "Diagnostic Orders (Lab, Imaging & ECG)",
                Category: "Orders, Rx & Certificates",
                V1SourceTables: "public.\"ClinicLaboratoryRequest\" + public.\"ClinicImagingRequest\" + public.\"ClinicHeartStationRequest\"",
                V2TargetTable: "public.\"LabOrders\"",
                Summary: "Unifies all three v1 diagnostic requisition tables (Laboratory, Imaging, Heart Station/ECG) into a single clinic LabOrders table.",
                Rules:
                [
                    "Uses deterministic modality prefixes (lab:, img:, ecg:) so IDs across the three v1 tables never collide.",
                    "Preserves serial numbers as OrderNumber and ordering physician PRC license numbers."
                ],
                Columns:
                [
                    Col("lab:<id> | img:<id> | ecg:<id>", "Id, OrderNumber", "Deterministic UUIDv5; OrderNumber from serialNumber"),
                    Col("ClinicPatient.patientId, consultationTicketId", "PatientId, ConsultationId, QueueItemId", "Linked to clinic patient & encounter"),
                    Col("impression, reason / history", "ClinicalDiagnosis, Notes", "Trimmed"),
                    Col("HPProfile / ProfessionalDetails", "OrderedByDoctorName, RequestingPhysicianName, RequestingPhysicianPrcNo", "Requesting physician credentials")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "LabOrderItems",
                DisplayName: "Diagnostic Order Procedures",
                Category: "Orders, Rx & Certificates",
                V1SourceTables: "public.\"ClinicLaboratoryRequestProcedure\" + public.\"ClinicImagingRequestProcedure\" + public.\"ClinicHeartStationRequestProcedure\" (+ Procedure catalogs)",
                V2TargetTable: "public.\"LabOrderItems\"",
                Summary: "Migrates individual ordered procedures (tests, imaging studies, ECG/cardiology procedures) under their unified LabOrder.",
                Rules:
                [
                    "Joins v1 procedure catalogs to capture canonical TestName, Category, and RVS/procedure TestCode."
                ],
                Columns:
                [
                    Col("RequestProcedure.id, requestId", "Id, LabOrderId", "Deterministic UUIDv5 linked to parent unified LabOrder"),
                    Col("Procedure.name, category, rvsCode", "TestName, Category, TestCode", "Joined from Lab / Imaging / HeartStation procedure catalog"),
                    Col("RequestProcedure.notes / instructions", "Instructions, Status", "Trimmed")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "MedicalCertificates",
                DisplayName: "Medical Certificates (Admin Vault)",
                Category: "Orders, Rx & Certificates",
                V1SourceTables: "public.\"ClinicMedicalCertificate\" (+ MedicalCertificateReason, MedicalCertificateFinding, MedicalCertificateClassification, HPProfile, ProfessionalDetails)",
                V2TargetTable: "public.\"MedicalCertificates\"",
                Summary: "Imports issued medical certificates into the Clinic Admin Vault with diagnosis, findings, normalized fitness status, and physician credentials.",
                Rules:
                [
                    "FitnessStatus maps classification keywords to UnfitToWork, FitToWork, FitWithRestrictions, LightDuty, or FitToSchool.",
                    "Preserves physician PRC & PTR numbers and deterministic security digest."
                ],
                Columns:
                [
                    Col("ClinicMedicalCertificate.id, serialNumber", "Id, CertificateNumber", "Deterministic UUIDv5"),
                    Col("ClinicMedicalCertificate.issueDate, remarks", "IssueDate, Remarks, IsSigned, SignedAt", "Preserves issuance dates"),
                    Col("MedicalCertificateReason.name, Finding, Diagnosis", "Purpose, ClinicalFindings, Diagnosis", "Joined from certificate lookup tables"),
                    Col("MedicalCertificateClassification.name", "FitnessStatus", "Normalized to FitToWork | FitWithRestrictions | UnfitToWork | LightDuty | FitToSchool"),
                    Col("HPProfile / ProfessionalDetails", "DoctorName, PrcLicenseNumber, PtrNumber", "Issuing doctor credentials")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "RecordAttachments",
                DisplayName: "Clinic Files & Attachments (Doc Vault)",
                Category: "Documents & Vault",
                V1SourceTables: "public.\"File\" (+ Folder, FileSetting, FolderSetting, FileClinicShare, FolderClinicShare, OrgMemberRequirementFile, FileType) + public.\"AppointmentAttachment\"",
                V2TargetTable: "public.\"RecordAttachments\"",
                Summary: "Imports clinic-shared patient files, org requirement uploads, and appointment attachments into the Clinic Doc Vault while strictly excluding private patient files and deleted folders.",
                Rules:
                [
                    "Strict Privacy Filter: Excludes any File or Folder marked PRIVATE and excludes files inside deleted folders.",
                    "Folder Flattening: Nested v1 Folder hierarchies are dissolved into flat typed RecordAttachments while preserving folder context in Title/metadata.",
                    "FileType.name maps to 8 v2 RecordType values: ECGStrip, ImagingReport, LabResult, DischargeSummary, ConsentForm, ExternalReferral, MedicalCertificate, or Other.",
                    "Non-Clobber Storage Guard: Live sync updates to file metadata never overwrite encrypted StorageUri or encryption columns already migrated by Track 3."
                ],
                Columns:
                [
                    Col("File.id / AppointmentAttachment.id", "Id, PatientId", "Deterministic UUIDv5; excludes PRIVATE & deleted-folder files"),
                    Col("FileType.name", "RecordType", "35 v1 FileTypes -> 8 v2 RecordType enum values"),
                    Col("File.name, Folder.name", "FileName, Title", "Original folder context preserved in flat record metadata"),
                    Col("File.mimeType, size", "ContentType, FileSizeBytes", "Updated with verified size/MIME when Track 3 encrypts binary"),
                    Col("File.url / Attachment.url", "StorageUri, EncryptionAlgorithm", "Starts with v1 URL & EncryptionAlgorithm='NONE' until Track 3 encrypts into Clinic Cloud Vault")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield; encrypted Track 3 storage pointers are never overwritten."
            ),
            new(
                Key: "PatientPhysicalExams",
                DisplayName: "Physical Examinations & Findings",
                Category: "Visits & Encounters",
                V1SourceTables: "public.\"PhysicalExamination\" (+ PhysicalExamLibrary, System)",
                V2TargetTable: "public.\"PatientPhysicalExams\" + public.\"PatientPhysicalExamFindings\"",
                Summary: "Migrates structured physical exam summaries by body system alongside granular child findings rows.",
                Rules:
                [
                    "GeneralSurveyStatus normalizes code '2' or 'ABNORMAL' -> Abnormal, otherwise Normal.",
                    "System categories map to GeneralSurvey, Skin, Heent, Chest, Heart, Abdomen, Neurological, Rectal, or Genitourinary."
                ],
                Columns:
                [
                    Col("PhysicalExamination.id, consultationTicketId", "Id, ConsultationEncounterId, PatientId, ExamDate", "Deterministic UUIDv5"),
                    Col("PhysicalExamination.genSurvey*, skin*, heent*, chest*, heart*, abdomen*, neuro*, rectal*, gu*", "GeneralSurveyStatus, *Remarks, *Id", "Per-system remarks & library IDs mapped"),
                    Col("PhysicalExamLibrary / System items", "PatientPhysicalExamFindings (System, IsNormal, FindingTitle, PhilHealthFindingCode, Remarks)", "Child findings table populated per exam")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientHomeMedications",
                DisplayName: "Home & Maintenance Medications",
                Category: "Clinical History",
                V1SourceTables: "public.\"Medication\" + public.\"MedicationDrug\" (+ public.\"Drug\")",
                V2TargetTable: "public.\"PatientHomeMedications\"",
                Summary: "Imports patient-reported and maintenance medications into the clinic chart's active medication list.",
                Rules:
                [
                    "Joins MedicationDrug and Drug catalogs for generic and brand names, preserving active vs. stopped dates."
                ],
                Columns:
                [
                    Col("MedicationDrug.id / Medication.id", "Id, PatientId", "Deterministic UUIDv5"),
                    Col("Drug.genericName, brandName, dosage, form", "GenericDrugName, BrandName, DoseStrength, Form", "Joined from v1 drug catalog"),
                    Col("Medication.frequency, duration, startDate, endDate, isActive", "Frequency, Duration, StartDate, StoppedDate, IsActive", "Active status preserved"),
                    Col("Medication.indication, prescribedBy", "Indication, PrescribingPhysicianName, Source", "Preserves clinical context")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            )
        ]
    );

    private static MappingGuideTrackSection BuildTrack2Patient() => new(
        Track: SyncTrack.Track2Patient,
        Title: "Patient Accounts",
        TargetDatabase: "Patient Database (Clinic EZ v2)",
        Overview: "Migrates portable patient-owned accounts, identities, personal health profiles, private & shared documents (Group A), plus mirrored clinical records from bound clinics (Group B) into the Clinic EZ v2 Patient App.",
        GlobalRules:
        [
            "Strict Zero-Auth0 Rule: Legacy auth0|* IDs are converted to clerk_user_id = NULL so zero Auth0 strings ever enter v2. Active Clerk user_* IDs are preserved and matched to existing Clerk accounts.",
            "Cohort Scope: Supports Scoped mode (only patients belonging to the selected clinic/organization) or Global mode (all active v1 patient accounts).",
            "Group A (15 tables) covers patient-owned profile & files (including PRIVATE files). Group B (9 tables) mirrors clinical records from bound clinics into the Patient App.",
            "All snake_case string columns are trimmed and length-bounded cleanly to match Patient DB schemas."
        ],
        Entities:
        [
            new(
                Key: "Patients",
                DisplayName: "Patient Accounts & Identity",
                Category: "Identity & Account",
                V1SourceTables: "public.\"User\"",
                V2TargetTable: "public.patients",
                Summary: "Creates or adopts each patient's master Clinic EZ v2 account with clean Clerk identity linkage and a unique deterministic Clinic EZ ID.",
                Rules:
                [
                    "Zero-Auth0: User.userId starting with auth0| becomes clerk_user_id = NULL; starting with user_ is preserved as a live Clerk ID.",
                    "Account Adoption: If a v2 patient already signed up with the same Clerk user_*, Track 2 adopts that existing UUID instead of creating a duplicate.",
                    "Deterministic clinic_ez_id generated from User.id with automatic salt retry on collision.",
                    "Sex maps MALE/M -> Male, FEMALE/F -> Female, OTHER/INTERSEX -> Other, else NULL; CivilStatus maps to Single/Married/Widowed/Separated/Divorced."
                ],
                Columns:
                [
                    Col("User.id", "id, client_id, clinic_ez_id", "Deterministic UUIDv5 (or adopted Clerk UUID); deterministic clinic_ez_id"),
                    Col("User.userId", "clerk_user_id", "Keeps user_* only; auth0|* -> NULL"),
                    Col("User.firstName, middleName, lastName, suffix", "first_name, middle_name, last_name, suffix", "Trimmed to column width"),
                    Col("User.gender, birthDate, placeOfBirth, civilStatus, bloodType", "sex, date_of_birth, place_of_birth, civil_status, blood_type", "Normalized enums; invalid birthDate -> NULL"),
                    Col("User.phone, altPhone, email, nationality, religion, avatarUrl", "mobile, alt_phone, email, nationality, religion, avatar_url", "Trimmed & normalized")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield; existing live Clerk accounts are adopted rather than duplicated."
            ),
            new(
                Key: "PatientAddresses",
                DisplayName: "Patient Addresses",
                Category: "Personal Health Profile",
                V1SourceTables: "public.\"UserAddress\"",
                V2TargetTable: "public.patient_addresses",
                Summary: "Transfers patient residential addresses into both legacy short fields and normalized Philippine geographic name fields.",
                Rules:
                [
                    "Populates paired name columns (barangay_name, city_municipality_name, province_name, region_name) alongside legacy text fields."
                ],
                Columns:
                [
                    Col("UserAddress.id, userId", "id, client_id, patient_id", "Deterministic UUIDv5"),
                    Col("UserAddress.addressLine / street / address", "house_street, street_address", "Coalesced trimmed street line"),
                    Col("UserAddress.barangay, city, state, region, zipCode, country", "barangay_name, city_municipality_name, province_name, region_name, zip_code, country", "Preserves full address hierarchy"),
                    Col("UserAddress.type, isPrimary", "type, is_primary", "Primary address indicator preserved")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "EmergencyContacts",
                DisplayName: "Emergency Contacts",
                Category: "Personal Health Profile",
                V1SourceTables: "public.\"UserEmergencyContact\"",
                V2TargetTable: "public.emergency_contacts",
                Summary: "Migrates each patient's personal emergency contact list into the Patient App.",
                Rules:
                [
                    "full_name coalesces name or concatenates firstName, middleName, lastName, and suffix."
                ],
                Columns:
                [
                    Col("UserEmergencyContact.id, userId", "id, client_id, patient_id", "Deterministic UUIDv5"),
                    Col("UserEmergencyContact.name / first+middle+last+suffix", "full_name", "Single formatted contact name"),
                    Col("UserEmergencyContact.relationship, phone, isPrimary", "relationship, mobile, is_primary", "Trimmed")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientAllergies",
                DisplayName: "Patient Allergies",
                Category: "Personal Health Profile",
                V1SourceTables: "public.\"UserAllergy\" (+ public.\"Allergen\")",
                V2TargetTable: "public.patient_allergies",
                Summary: "Imports patient-owned allergies with categorized allergy_type (Drug, Food, Environmental, Other).",
                Rules:
                [
                    "Medication allergens map to allergy_type = 'Drug' in Patient DB (vs. 'Medication' in Clinic DB)."
                ],
                Columns:
                [
                    Col("UserAllergy.id, userId", "id, client_id, patient_id", "Deterministic UUIDv5"),
                    Col("Allergen.name", "allergen_name, allergy_type", "allergy_type inferred: Drug | Food | Environmental | Other"),
                    Col("UserAllergy.reaction, notes", "reaction, notes, severity", "Severity normalized")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientChronicConditions",
                DisplayName: "Chronic Conditions",
                Category: "Personal Health Profile",
                V1SourceTables: "public.\"UserHealthCondition\" (+ public.\"HealthCondition\")",
                V2TargetTable: "public.patient_chronic_conditions",
                Summary: "Migrates ongoing patient health conditions separately from historical past illnesses.",
                Rules:
                [
                    "Maps diagnosis date, controlled status, and treatment notes."
                ],
                Columns:
                [
                    Col("UserHealthCondition.id, userId", "id, client_id, patient_id", "Deterministic UUIDv5"),
                    Col("HealthCondition.name", "condition_name", "Joined from catalog"),
                    Col("UserHealthCondition.dateDiagnosed, status, notes", "diagnosed_at, is_controlled, treatment_notes", "Validated date & notes")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientPastIllnesses",
                DisplayName: "Past Illnesses",
                Category: "Personal Health Profile",
                V1SourceTables: "public.\"MedicalHistory\" (+ public.\"HealthCondition\")",
                V2TargetTable: "public.patient_past_illnesses",
                Summary: "Imports patient-reported past illnesses into the dedicated Patient App past-illness table.",
                Rules:
                [
                    "Kept separate from active chronic conditions in Patient DB for clearer self-service editing."
                ],
                Columns:
                [
                    Col("MedicalHistory.id, userId", "id, client_id, patient_id", "Deterministic UUIDv5"),
                    Col("HealthCondition.name", "illness_name", "Joined from HealthCondition catalog"),
                    Col("MedicalHistory.details", "notes", "Trimmed")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientFamilyHistories",
                DisplayName: "Family Histories",
                Category: "Personal Health Profile",
                V1SourceTables: "public.\"FamilyMedicalHistory\" (+ public.\"HealthCondition\")",
                V2TargetTable: "public.patient_family_histories",
                Summary: "Migrates family medical conditions with parsed relative relation and notes.",
                Rules:
                [
                    "Parses relation keywords (Mother, Father, Sibling, Grandparent, etc.) from details."
                ],
                Columns:
                [
                    Col("FamilyMedicalHistory.id, userId", "id, client_id, patient_id", "Deterministic UUIDv5"),
                    Col("HealthCondition.name", "condition_name", "Joined from catalog"),
                    Col("FamilyMedicalHistory.details", "relation, notes, is_deceased", "Parsed relation + raw notes preserved")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientSocialHistories",
                DisplayName: "Social Histories",
                Category: "Personal Health Profile",
                V1SourceTables: "public.\"PersonalHistory\"",
                V2TargetTable: "public.patient_social_histories",
                Summary: "Transfers smoking, alcohol, substance use, and sexual activity flags for the patient profile.",
                Rules:
                [
                    "smoking_status maps to CurrentSmoker | FormerSmoker | NeverSmoked; alcohol_use maps to Heavy | Moderate | Occasional | Never.",
                    "pack_years outside 0..9999.9 is safely nulled."
                ],
                Columns:
                [
                    Col("PersonalHistory.userId", "id, client_id, patient_id", "1 row per patient"),
                    Col("PersonalHistory.smokingStatus, packYears", "smoking_status, pack_years", "Enum normalized + clamped 0..9999.9"),
                    Col("PersonalHistory.alcoholStatus, illicitDrugs, sexuallyActive", "alcohol_use, uses_substances, is_sexually_active", "Normalized enum & flags")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientObstetricProfiles",
                DisplayName: "Obstetric Profiles",
                Category: "Personal Health Profile",
                V1SourceTables: "public.\"ObGyneHistory\"",
                V2TargetTable: "public.patient_obstetric_profiles",
                Summary: "Imports patient OB-GYN summary metrics (gravida, para, abortus, living children, LMP, cycle length).",
                Rules:
                [
                    "1 row per patient; invalid dates are safely nulled."
                ],
                Columns:
                [
                    Col("ObGyneHistory.userId", "id, client_id, patient_id", "1 row per patient"),
                    Col("gravidity, parity, abortions, livingChildren", "gravida, para, abortus_count, living_children", "Direct integer mapping"),
                    Col("lastMenstrualPeriod, isPregnant, cycleInterval", "last_menstrual_period, is_pregnant, menstrual_cycle_length_days, has_dysmenorrhea", "Validated dates & metrics")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientSurgicalHistories",
                DisplayName: "Surgical Histories",
                Category: "Personal Health Profile",
                V1SourceTables: "public.\"SurgicalHistory\"",
                V2TargetTable: "public.patient_surgical_histories",
                Summary: "Migrates personal surgical history records into the Patient App.",
                Rules:
                [
                    "Operation dates validated against 1900..today+1 range."
                ],
                Columns:
                [
                    Col("SurgicalHistory.id, userId", "id, client_id, patient_id", "Deterministic UUIDv5"),
                    Col("SurgicalHistory.operationName, operationDate, notes", "procedure_name, surgery_date, notes", "Trimmed & validated")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientDisabilities",
                DisplayName: "Disabilities & PWD Status",
                Category: "Personal Health Profile",
                V1SourceTables: "public.\"UserDisability\" (+ public.\"Disability\")",
                V2TargetTable: "public.patient_disabilities",
                Summary: "Imports patient-reported disabilities into a dedicated table in the Patient App.",
                Rules:
                [
                    "Preserves disability classification, affected body part, and PWD certification flag."
                ],
                Columns:
                [
                    Col("UserDisability.id, userId", "id, client_id, patient_id", "Deterministic UUIDv5"),
                    Col("Disability.name, UserDisability.bodyPart / reason", "classification, body_part, is_pwd_certified", "Joined from Disability catalog")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientImmunizationsSelf",
                DisplayName: "Self-Reported Immunizations",
                Category: "Personal Health Profile",
                V1SourceTables: "public.\"UserVaccination\" (where hpId IS NULL, + Vaccine, Dose)",
                V2TargetTable: "public.patient_immunizations_self",
                Summary: "Imports patient self-logged vaccinations (without a clinic provider ID) separately from clinic-administered immunizations.",
                Rules:
                [
                    "Split Rule: UserVaccination rows with hpId IS NULL go to patient_immunizations_self; rows with hpId IS NOT NULL go to vaccinations_administered."
                ],
                Columns:
                [
                    Col("UserVaccination.id, userId (hpId IS NULL)", "id, client_id, patient_id", "Deterministic UUIDv5"),
                    Col("Vaccine.name, Vaccine.type, Dose.dose", "vaccine_name, immunization_category, dose_number", "Category mapped from Vaccine.type"),
                    Col("UserVaccination.dateGiven, administeredBy", "date, administered_by", "Validated date")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientMedications",
                DisplayName: "Personal Medications",
                Category: "Personal Health Profile",
                V1SourceTables: "public.\"Medication\" + public.\"MedicationDrug\" (+ public.\"Drug\")",
                V2TargetTable: "public.patient_medications",
                Summary: "Transfers patient-maintained home medications into the Patient App medication tracker.",
                Rules:
                [
                    "Preserves generic/brand names, dosage, frequency, active status, and prescribing doctor."
                ],
                Columns:
                [
                    Col("MedicationDrug.id / Medication.id", "id, client_id, patient_id", "Deterministic UUIDv5"),
                    Col("Drug.brandName / genericName", "medication_name, generic_name", "Joined from Drug catalog"),
                    Col("dosage, frequency, startDate, endDate, isActive, prescribedBy", "dosage, frequency, start_date, end_date, is_currently_taking, prescribed_by, notes", "Trimmed & normalized")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PatientGovernmentIds",
                DisplayName: "Government IDs (PhilHealth, TIN, PhilSys)",
                Category: "Identity & Account",
                V1SourceTables: "public.\"PhilHealthRecord\" + public.\"User\"",
                V2TargetTable: "public.patient_government_ids",
                Summary: "Fans out PhilHealth PIN, TIN, and PhilSys ID numbers into standardized typed rows in the patient's ID wallet.",
                Rules:
                [
                    "1-to-Many Fan-Out: Creates up to 3 typed rows per patient (PhilHealth, TIN, PhilSys) whenever each identifier is populated.",
                    "Maps PhilHealth member category and sponsor PIN onto the PhilHealth row."
                ],
                Columns:
                [
                    Col("PhilHealthRecord.pin", "id_type='PhilHealth', id_number, philhealth_category, sponsor_pin", "Mapped when PIN is non-empty"),
                    Col("User.tin / PhilHealthRecord.tin", "id_type='TIN', id_number", "Mapped when TIN is non-empty"),
                    Col("User.philSysId / PhilHealthRecord.philSysId", "id_type='PhilSys', id_number", "Mapped when PhilSys ID is non-empty")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "FileRecords (Incl. PRIVATE)",
                DisplayName: "Patient Files (Includes Private Files)",
                Category: "Personal Documents",
                V1SourceTables: "public.\"File\" (+ public.\"Folder\", public.\"FileType\", public.\"FileSetting\")",
                V2TargetTable: "public.file_records",
                Summary: "Migrates all active patient documents—including PRIVATE files—into the Patient App's flat typed document vault while preserving original v1 folder names in notes.",
                Rules:
                [
                    "Includes PRIVATE Files: Private documents stay accessible to the patient in Patient App and are strictly excluded from Clinic Sync.",
                    "Deleted Folder Exclusion: Files inside deleted v1 folders are skipped cleanly.",
                    "Folder Flattening: Nested v1 Folder structures are dissolved; the original Folder.name is appended to file_records.notes as 'Folder: <name>' so no organizational context is lost.",
                    "Document Classification: Maps 35 v1 FileType.name values (plus filename fallback hints) into 6 fixed seeded document_types UUIDs (X-Ray/Imaging, Lab Result, Medical Certificate, Prescription, Government ID, Other).",
                    "Non-Clobber Storage Guard: Live sync metadata updates never overwrite encrypted storage_key or encryption columns once Track 3 has encrypted the file."
                ],
                Columns:
                [
                    Col("File.id, File.userId", "id, client_id, patient_id", "Deterministic UUIDv5; includes PRIVATE files, skips deleted folders"),
                    Col("File.name, File.mimeType, File.size", "file_name, title, mime_type, extension, size_bytes", "Extension extracted from filename or MIME fallback"),
                    Col("FileType.name (+ filename fallback)", "document_type_id", "Maps to 6 seeded v2 document_types UUIDs"),
                    Col("Folder.name + File.notes", "notes", "Flattened: appends 'Folder: <Folder.name>' into notes"),
                    Col("File.url", "storage_key, encryption_algorithm", "Starts with v1 URL & encryption_algorithm='NONE' until Track 3 encrypts into Patient Cloud Vault")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield; encrypted Track 3 storage keys are never overwritten."
            ),
            new(
                Key: "ClinicMemberships",
                DisplayName: "Clinic Memberships & Directory Link",
                Category: "Mirrored Clinic Records",
                V1SourceTables: "public.\"ClinicPatient\" (+ public.\"Clinic\" -> public.clinics)",
                V2TargetTable: "public.clinic_memberships (+ public.clinics)",
                Summary: "Links each migrated patient to their bound Clinic EZ v2 clinic in the Patient App and ensures the clinic directory entry exists.",
                Rules:
                [
                    "Ensures the target clinic row exists in public.clinics before inserting patient memberships.",
                    "Preserves membership status and consent timestamps."
                ],
                Columns:
                [
                    Col("ClinicPatient.id, patientId, bound v2ClinicId", "id, client_id, patient_id, clinic_id", "Deterministic UUIDv5"),
                    Col("ClinicPatient.status, createdAt", "status, consented_at, consent_privacy_policy, consent_terms_and_conditions, consent_data_sharing", "Mirrors active membership")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "BoundClinicAppointments",
                DisplayName: "Mirrored Clinic Appointments",
                Category: "Mirrored Clinic Records",
                V1SourceTables: "public.\"Appointment\" (+ AppointmentRequester, AppointmentAttribute, AppointmentRouting, Service)",
                V2TargetTable: "public.appointments",
                Summary: "Mirrors bound-clinic appointment history into the Patient App so patients can review past and upcoming visits.",
                Rules:
                [
                    "Status maps RECEIVED/ROUTED -> Confirmed (Patient App perspective), COMPLETED -> Completed, CANCELLED/REJECTED/DROPPED -> Cancelled, PENDING -> Pending."
                ],
                Columns:
                [
                    Col("Appointment.id, AppointmentRequester.userId", "id, patient_id, clinic_id", "Deterministic UUIDv5"),
                    Col("Appointment.subject, complaint, Service.name", "subject, chief_complaint, service_type, notes", "Includes routing notes"),
                    Col("AppointmentAttribute.date, timeStart, maxDuration, status, receivedAt", "scheduled_at, duration_minutes, status, checked_in_at", "UTC timestamp & patient-facing status")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "BoundClinicConsultations",
                DisplayName: "Mirrored Consultations",
                Category: "Mirrored Clinic Records",
                V1SourceTables: "public.\"ConsultationTicket\" (+ ConsultationNote, ConsultationDiagnosis, ConsultationTicketHP)",
                V2TargetTable: "public.consultations",
                Summary: "Mirrors bound-clinic consultation summaries, diagnoses, ICD-10 codes, and care plans into the Patient App.",
                Rules:
                [
                    "Aggregates consultation notes by section and carries primary diagnosis and ICD-10 code."
                ],
                Columns:
                [
                    Col("ConsultationTicket.id", "id, patient_id, clinic_id, consulted_at", "Deterministic UUIDv5"),
                    Col("ConsultationTicket.subject, ConsultationNote.*", "chief_complaint, assessment, plan, notes", "Section notes concatenated chronologically"),
                    Col("ConsultationDiagnosis.diagnosis, icd10Code", "diagnosis, icd10code", "Primary diagnosis preserved")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "VitalSigns",
                DisplayName: "Mirrored Vital Signs",
                Category: "Mirrored Clinic Records",
                V1SourceTables: "public.\"VitalSign\"",
                V2TargetTable: "public.vital_signs",
                Summary: "Mirrors clinic-recorded vital signs into the Patient App health timeline with source='ClinicV1'.",
                Rules:
                [
                    "Out-of-range measurements (weight, height, BMI, temperature, SpO2) are safely nulled so dirty legacy entries never block migration.",
                    "Stamped with source = 'ClinicV1' to distinguish migrated clinic measurements from self-logged readings."
                ],
                Columns:
                [
                    Col("VitalSign.id, consultationTicketId", "id, patient_id, clinic_id, consultation_id, recorded_at", "Deterministic UUIDv5"),
                    Col("weight, height, bmi, bloodPressure*, heartRate, temperature, oxygenSaturation, respiratoryRate", "weight_kg, height_cm, bmi, systolic_bp, diastolic_bp, heart_rate_bpm, temperature_celsius, oxygen_saturation_percent, respiratory_rate_breaths_per_min", "Bounds-checked numeric precision"),
                    Col("Constant", "source", "Stamped 'ClinicV1'")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "PrescriptionDocuments",
                DisplayName: "Prescription Documents",
                Category: "Mirrored Clinic Records",
                V1SourceTables: "public.\"Prescription\" (+ HPProfile, ProfessionalDetails, ConsultationDiagnosis)",
                V2TargetTable: "public.prescription_documents",
                Summary: "Creates patient-viewable prescription headers with facility details, prescriber PRC license, diagnosis, and fulfillment stage.",
                Rules:
                [
                    "Links parent prescription headers to individual medication lines in public.prescriptions."
                ],
                Columns:
                [
                    Col("Prescription.id, serialNumber", "id, prescription_id, prescription_number, patient_id", "Deterministic UUIDv5"),
                    Col("HPProfile / ProfessionalDetails", "prescriber_name, prescriber_prc_license", "Issuing doctor credentials"),
                    Col("Bound clinic coordinates", "ordering_tenant_id, ordering_facility_id, ordering_facility_name", "Facility context"),
                    Col("Prescription.issuedAt, instructions", "issued_at, diagnosis, instructions, stage, has_details", "Preserves prescription status")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "Prescriptions",
                DisplayName: "Prescription Line Items",
                Category: "Mirrored Clinic Records",
                V1SourceTables: "public.\"Medicine\" (+ MedicinePhilHealthData, MedicineDispenseRecord)",
                V2TargetTable: "public.prescriptions",
                Summary: "Mirrors individual prescribed medications under each patient's PrescriptionDocument.",
                Rules:
                [
                    "Links every medication row to both consultation_id and prescription_document_id.",
                    "Preserves PhilHealth GAMOT coverage flags and dispensing status."
                ],
                Columns:
                [
                    Col("Medicine.id, prescriptionId", "id, prescription_document_id, consultation_id, patient_id, clinic_id", "Deterministic UUIDv5"),
                    Col("Medicine.genericName, brandName, form, dosage, frequency, duration, instructions, quantity", "medication_name, generic_name, brand_name, form, dosage, frequency, duration, instructions, quantity", "Full medication sig preserved"),
                    Col("MedicinePhilHealthData / MedicineDispenseRecord", "is_dispensed, is_phil_health_gamot, phil_health_drug_code", "GAMOT & dispensed flags")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "MedicalCertificates",
                DisplayName: "Mirrored Medical Certificates",
                Category: "Mirrored Clinic Records",
                V1SourceTables: "public.\"ClinicMedicalCertificate\" (+ MedicalCertificateReason, HPProfile, ProfessionalDetails)",
                V2TargetTable: "public.medical_certificates",
                Summary: "Mirrors clinic-issued medical certificates so patients can view their certificate history inside the Patient App.",
                Rules:
                [
                    "Preserves issuer clinic name, doctor PRC & PTR numbers, purpose, diagnosis, and remarks."
                ],
                Columns:
                [
                    Col("ClinicMedicalCertificate.id, serialNumber", "id, certificate_id, certificate_number, patient_id", "Deterministic UUIDv5"),
                    Col("Bound clinic + HPProfile / ProfessionalDetails", "issuer_tenant_id, issuer_facility_id, issuer_name, doctor_name, doctor_prc_license, doctor_ptr_number", "Issuer & doctor metadata"),
                    Col("Reason, diagnosis, remarks, issueDate", "purpose, diagnosis, remarks, issued_at", "Trimmed & validated")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "LabRequestSlips",
                DisplayName: "Mirrored Lab, Imaging & ECG Slips",
                Category: "Mirrored Clinic Records",
                V1SourceTables: "public.\"ClinicLaboratoryRequest\" + public.\"ClinicImagingRequest\" + public.\"ClinicHeartStationRequest\" (+ RequestProcedure catalogs)",
                V2TargetTable: "public.lab_request_slips",
                Summary: "Combines laboratory, imaging, and heart station requisitions into unified Patient App request slips with a structured JSON list of ordered tests.",
                Rules:
                [
                    "Serializes ordered child procedures into camelCase JSON objects inside items_json (testCode, testName, category).",
                    "Uses modality prefixes (lab:, img:, ecg:) for collision-free deterministic IDs."
                ],
                Columns:
                [
                    Col("lab:<id> | img:<id> | ecg:<id>, serialNumber", "id, requisition_id, accession_number, patient_id", "Deterministic UUIDv5"),
                    Col("Request modality + impression / reason", "title, urgency, reason, stage, issued_at", "Normalized slip metadata"),
                    Col("Joined RequestProcedure rows", "items_json", "Structured camelCase JSON array of ordered procedures")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            ),
            new(
                Key: "VaccinationsAdministered",
                DisplayName: "Clinic-Administered Vaccinations",
                Category: "Mirrored Clinic Records",
                V1SourceTables: "public.\"UserVaccination\" (where hpId IS NOT NULL, + Vaccine, Dose, Route)",
                V2TargetTable: "public.vaccinations_administered",
                Summary: "Mirrors provider-administered immunizations (where hpId is present) into the verified vaccinations section of the Patient App.",
                Rules:
                [
                    "Complements patient_immunizations_self: records with an administering clinician (hpId IS NOT NULL) land here with facility attribution."
                ],
                Columns:
                [
                    Col("UserVaccination.id, userId (hpId IS NOT NULL)", "id, patient_id, clinic_id", "Deterministic UUIDv5"),
                    Col("Vaccine.name, Dose.dose, Route.route", "vaccine_name, dose_number, route", "Joined from catalogs"),
                    Col("UserVaccination.dateGiven, administeredBy", "date_administered, administered_by, facility, synced_at", "Includes administering clinic context")
                ],
                ConflictPolicy: "v2-Wins with Deletion Shield."
            )
        ]
    );

    private static MappingGuideTrackSection BuildTrack3Storage() => new(
        Track: SyncTrack.Track3Storage,
        Title: "File Storage",
        TargetDatabase: "Isolated Clinic & Patient Cloud Vaults",
        Overview: "Downloads reachable legacy file binaries once, encrypts independent copies using AES-256-GCM envelope encryption with separate clinic and patient key hierarchies, uploads them to isolated cloud vaults, and updates v2 database pointers atomically.",
        GlobalRules:
        [
            "Prerequisite: Run Clinic Sync (Track 1) and/or Patient Accounts (Track 2) first so file metadata rows exist in v2.",
            "Zero Cross-Plane Key Reuse: Even when the same source file is referenced by both a Clinic attachment and a Patient file, Track 3 downloads the source once in memory and encrypts two completely independent copies with unique per-file keys and IVs.",
            "Zero-Failure Resilience: External links (such as Google Drive), retired storage hosts, 404/empty blobs, and access-gated links are safely classified as Kept As-Is without failing the migration.",
            "Live Sync Non-Clobber: Once Track 3 encrypts a file, Track 1 and Track 2 live CDC updates preserve the encrypted storage pointer and encryption metadata."
        ],
        Entities:
        [
            new(
                Key: "ClinicStorageMigration",
                DisplayName: "Clinic Files (Encrypted Cloud Vault)",
                Category: "Clinic Cloud Vault",
                V1SourceTables: "public.\"RecordAttachments\" (pending rows where EncryptionAlgorithm = 'NONE') + Primary Storage source link",
                V2TargetTable: "Clinic Cloud Vault + public.\"RecordAttachments\"",
                Summary: "Encrypts eligible clinic record attachments with tenant/clinic-scoped envelope encryption and replaces the legacy URL with an encrypted vault object key.",
                Rules:
                [
                    "Streams and validates each file against the configured maximum file size (default 50 MB) and rejects HTML sign-in interstitials.",
                    "Encrypts each binary with a unique per-file key wrapped by the clinic encryption key, writing to tenants/{tenantId}/clinics/{clinicId}/records/{attachmentId}.",
                    "Updates StorageUri, ContentType, FileSizeBytes (when missing), and all encryption metadata columns atomically."
                ],
                Columns:
                [
                    Col("RecordAttachments.StorageUri (legacy URL)", "RecordAttachments.StorageUri (vault object key)", "Replaces external URL with tenant-isolated encrypted vault path"),
                    Col("Downloaded binary bytes", "EncryptionAlgorithm, EncryptionKeyId, EncryptionIvBase64, EncryptionTagBase64", "AES-256-GCM envelope encryption with unique IV & auth tag"),
                    Col("Encrypted payload & wrapped key", "EncryptedSizeBytes, EncryptedHash, WrappedKeyJson", "SHA-256 integrity hash + wrapped per-file key"),
                    Col("Detected HTTP Content-Type & byte length", "ContentType, FileSizeBytes", "Backfills ContentType and missing FileSizeBytes")
                ],
                ConflictPolicy: "Atomic pointer swap after successful cloud upload; idempotent via sync_storage_objects ledger."
            ),
            new(
                Key: "PatientStorageMigration",
                DisplayName: "Patient Files (Encrypted Cloud Vault)",
                Category: "Patient Cloud Vault",
                V1SourceTables: "public.file_records (pending rows where encryption_algorithm = 'NONE') + Primary Storage source link",
                V2TargetTable: "Patient Cloud Vault + public.file_records",
                Summary: "Encrypts eligible patient portal documents (including PRIVATE files) with patient-scoped envelope encryption into an isolated Patient Cloud Vault.",
                Rules:
                [
                    "Uses an independent patient encryption key hierarchy and separate cloud vault from clinic files.",
                    "Shared URL Overlap Deduplication: If a shared file was already downloaded for Clinic Files in the same batch, the plaintext bytes are reused in memory to save bandwidth while still generating a brand-new per-file key and IV for the Patient Vault.",
                    "Preserves original mime_type unless the downloaded stream supplies a more specific type."
                ],
                Columns:
                [
                    Col("file_records.storage_key (legacy URL)", "file_records.storage_key (vault object key)", "Replaces external URL with patient-isolated encrypted vault path"),
                    Col("Downloaded binary bytes", "encryption_algorithm, encryption_key_id, encryption_iv_base64, encryption_tag_base64", "AES-256-GCM envelope encryption with independent patient key"),
                    Col("Encrypted payload & wrapped key", "encrypted_size_bytes, encrypted_hash, wrapped_key_json", "SHA-256 integrity hash + wrapped per-file key"),
                    Col("Detected Content-Type & byte length", "mime_type, size_bytes", "Preserves existing mime_type when stream returns generic octet-stream")
                ],
                ConflictPolicy: "Atomic pointer swap after successful cloud upload; completely isolated from Clinic Vault."
            ),
            new(
                Key: "ExternalAndUnavailableLinks",
                DisplayName: "External & Unavailable Links (Kept As-Is)",
                Category: "Exceptions & Fallbacks",
                V1SourceTables: "Google Drive links, Legacy Storage links, unreachable/404 links, 0-byte files, access-gated links",
                V2TargetTable: "sync_storage_objects (Ledger Tracking; v2 URL untouched)",
                Summary: "Classifies links that cannot or should not be copied into cloud vaults and leaves their original database links intact for auditability.",
                Rules:
                [
                    "Google Drive and retired Legacy Storage links are marked External Link (Kept As-Is) and never altered.",
                    "404/DNS unreachable links and 0-byte blobs are marked Unavailable (Kept As-Is).",
                    "Links returning 401/403 or HTML login pages are marked Needs Access (Kept As-Is) and can be retried after access is granted.",
                    "Transient network/5xx errors are marked Transfer Failed and support one-click Retry Failed."
                ],
                Columns:
                [
                    Col("Source URL hostname & HTTP response", "sync_storage_objects.source_provider, status", "Classified as Primary Storage, Legacy Storage, Google Drive, or Other"),
                    Col("Error status code / category", "sync_storage_objects.last_error_code, attempt_count", "Zero-PHI error classification; raw signed URLs are never shown in UI")
                ],
                ConflictPolicy: "Never fails the overall run; original v2 file link remains preserved."
            ),
            new(
                Key: "VerificationAndNonClobber",
                DisplayName: "Integrity Verification & Live Sync Protection",
                Category: "Verification & Safety",
                V1SourceTables: "Migrated Clinic & Patient encrypted vault objects",
                V2TargetTable: "sync_storage_objects.verified_at + Track 1/2 CDC Guards",
                Summary: "Verifies end-to-end decryptability and SHA-256 integrity of migrated vault objects and shields them from live sync metadata refreshes.",
                Rules:
                [
                    "Sample Verification: During Migrate All Files, a configurable percentage (default 2% in Migration Settings) is downloaded back from cloud storage, decrypted in memory, and verified against its original SHA-256 digest.",
                    "Final Verification Sweep: Performs a 100% end-to-end verification pass before connection retirement.",
                    "Non-Clobber Guard: Track 1 (RecordAttachments) and Track 2 (file_records) live sync compare against the recorded pre-encryption baseline URL so editing a file title or note in v1 never reverts an encrypted vault pointer back to a legacy URL."
                ],
                Columns:
                [
                    Col("Encrypted cloud vault object", "sync_storage_objects.status='VERIFIED', verified_at", "Read-back decrypt + SHA-256 match against source_sha256"),
                    Col("Pre-encryption baseline URL", "sync_storage_objects.source_url", "Used by Track 1/2 live sync to avoid false conflicts or pointer clobbering")
                ],
                ConflictPolicy: "Final Verification Sweep must confirm zero pending files and zero unverified retryable failures before Freeze & Retire."
            )
        ]
    );
}
