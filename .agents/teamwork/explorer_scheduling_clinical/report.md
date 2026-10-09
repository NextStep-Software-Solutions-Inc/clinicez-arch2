# Comprehensive Research & Architectural Specification: Appointments, Scheduling, Consultation Workflows & Clinical Models

**Author:** Explorer 2 (Scheduling & Clinical Specialist)  
**Date:** October 9, 2026  
**Target Services:** `services/clinic-api/`, `apps/clinic-app/`, and `services/philhealth-proxy/`  
**Reference Standards:** PhilHealth Konsulta / Yakap Data Dictionary (`KonsultaData_v1.14.dtd`), WHO Child Growth Standards (LMS Methodology), PhilHealth Statutory Catalogs (`lib_zscore`, `lib_ncdq`, `lib_immchild`, `lib_icd`, `lib_mdiseases`).  

---

## 1. Executive Summary

A comprehensive investigation into the Clinic EZ monorepo architecture reveals that while basic appointment booking, consultation encounter logging, and PhilHealth claims transmittal generation are functionally implemented, significant foundational architectural gaps exist in doctor scheduling, clinical documentation structuring, chronic disease tracking, and pediatric anthropometry.

### Core Discoveries:
1. **Appointment Management & Rostering (R1 Context)**:
   - `AppointmentsController.cs` and `CreateAppointmentCommandHandler.cs` persist appointments directly with a hardcoded `DurationMinutes = 30` without **any schedule validation, doctor availability check, or double-booking conflict prevention**.
   - No doctor schedule entities (`DoctorScheduleTemplate`, `DoctorShift`, `DoctorBreakTime`, `DoctorLeave`) exist in `services/clinic-api/`.
   - In `apps/clinic-app/navigation/screens/Appointments.screen.tsx`, the booking UI uses raw text inputs for date and time (`YYYY-MM-DD` and `HH:MM`) with zero slot generation or calendar roster visualization.
2. **Clinical Consultations & SOAP Structuring (R4 Context)**:
   - `ConsultationEncounter.cs` stores SOAP documentation as four flat, unstructured string properties (`Subjective`, `Objective`, `Assessment`, `Plan`).
   - There is no clinical note templating engine, no specialty-specific layouts (e.g., Pediatrics, Cardiology, OB-GYN), no physical examination structured checklists, and no clinical macros (dot-phrases).
   - Vitals are only captured through `TriageVitals.cs` which requires an active `QueueItem` from walk-in triage; consultations lack native encounter-level vitals or longitudinal tracking.
3. **Problem Lists, Allergies & Chronic Care (R3 Context)**:
   - `ClinicPatient.cs` stores patient allergies and chronic conditions as comma-separated text strings (`Allergies`, `ChronicConditions`).
   - The Clinical Decision Support engine (`ClinicalDecisionSupportEvaluator.cs`) relies on crude string-splitting and substring matching.
   - PhilHealth Profiling and PhilPEN (24 NCD questions) are currently stored serialized as JSON within `ClinicPatient.CustomFields["philhealth_profile"]`, resulting in unindexed, unstructured blob storage that cannot be queried longitudinally.
4. **Pediatric Growth & WHO Z-Scores (R4 Context)**:
   - A 656 KB PhilHealth statutory table (`lib_zscore.json`) exists in the seed catalog directory (`services/clinic-api/ClinicEz.Clinic.Infrastructure/PhilHealth/Catalog/Seed/lib_zscore.json`), but **is not integrated into any domain service or calculator**.
   - Vitals entities lack head circumference, waist/hip circumferences, and calculated WHO Z-scores/percentiles.
   - In claims transmittal generation (`YakapClinicalMapper.cs`), the `ZScore` field on `<PEPERT>` is either left blank or read from unvalidated custom text fields.

---

## 2. Investigation of Existing Appointment Management (R1)

### 2.1 API and Application Layer Analysis

#### `AppointmentsController.cs` (`services/clinic-api/ClinicEz.Clinic.Api/Controllers/AppointmentsController.cs`)
- Endpoints:
  - `GET /api/v1/appointments?date={date}&status={status}`: Handled by `GetAppointmentsQuery`. Requires `ClinicPermissions.AppointmentsRead`.
  - `POST /api/v1/appointments`: Handled by `CreateAppointmentCommand`. Requires `ClinicPermissions.AppointmentsManage`.
  - `PUT /api/v1/appointments/{id}/reschedule`: Handled by `RescheduleAppointmentCommand`. Requires `ClinicPermissions.AppointmentsManage`.
  - `PUT /api/v1/appointments/{id}/cancel`: Handled by `CancelAppointmentCommand`. Requires `ClinicPermissions.AppointmentsManage`.
- Observations:
  - No endpoints exist for doctor working hours, shift templates, break times, blackout dates, or slot availability queries.
  - The permissions defined in `ClinicPermissions.cs` only include `AppointmentsRead` and `AppointmentsManage`. Permissions for schedules (e.g. `schedules:read`, `schedules:manage`) are missing.

#### `CreateAppointmentCommand.cs` (`services/clinic-api/ClinicEz.Clinic.Application/Features/Appointments/CreateAppointmentCommand.cs`)
```csharp
// Lines 41-58 of CreateAppointmentCommand.cs:
var appointment = new Appointment
{
    Id = Guid.NewGuid(),
    TenantId = _clinicContext.TenantId,
    ClinicId = _clinicContext.ClinicId,
    PatientId = request.PatientId,
    PatientName = request.PatientName.Trim(),
    DoctorId = request.DoctorId,
    DoctorName = request.DoctorName?.Trim(),
    ScheduledAt = request.ScheduledAt.ToUniversalTime(),
    DurationMinutes = request.DurationMinutes > 0 ? request.DurationMinutes : 30,
    Status = AppointmentStatus.Confirmed,
    ServiceType = request.ServiceType?.Trim(),
    Reason = request.Reason?.Trim(),
    Notes = request.Notes?.Trim(),
    CreatedAt = DateTime.UtcNow,
    CreatedBy = "ClinicStaff"
};
```
- **Vulnerability**: The handler directly instantiates the `Appointment` and persists it to `_appointmentRepo`. It contains **no verification** of:
  1. Whether the assigned doctor is on duty or scheduled on `ScheduledAt`.
  2. Whether `ScheduledAt` falls within the doctor's working hours or during a break time.
  3. Whether the doctor has approved leave or a blackout date.
  4. Whether another appointment already occupies the same doctor's time window (`[ScheduledAt, ScheduledAt + DurationMinutes]`).

#### `RescheduleAppointmentCommand.cs` (`services/clinic-api/ClinicEz.Clinic.Application/Features/Appointments/RescheduleAppointmentCommand.cs`)
- Lines 42-46 simply update `appointment.ScheduledAt = request.NewScheduledAt.ToUniversalTime();` without checking for collisions with existing appointments or provider availability.

### 2.2 Domain and Persistence Model

#### `Appointment.cs` (`services/clinic-api/ClinicEz.Clinic.Domain/Entities/Appointment.cs`)
- Fields: `Id`, `TenantId`, `ClinicId`, `DraftId`, `PatientId`, `PatientName`, `DoctorId`, `DoctorName`, `ScheduledAt`, `DurationMinutes` (default 30), `Status` (`AppointmentStatus`), `ServiceType`, `Reason`, `Notes`, `ShareFieldsJson`, `AttachedFileIdsJson`.
- Derived / Navigation properties: None. It does not compute or persist `EndTimeUtc`.
- EF Core Configuration (`ApplicationDbContext.cs` lines 190-200):
  ```csharp
  modelBuilder.Entity<Appointment>(entity =>
  {
      entity.HasKey(e => e.Id);
      entity.Property(e => e.TenantId).HasMaxLength(100);
      entity.Property(e => e.PatientName).IsRequired().HasMaxLength(150);
      entity.Property(e => e.ServiceType).HasMaxLength(100);
      entity.Property(e => e.Reason).HasMaxLength(255);
      entity.HasIndex(e => new { e.TenantId, e.ClinicId });
      entity.HasIndex(e => e.ScheduledAt);
  });
  ```
- **Concurrency & Collision Gaps**: There is no index on `(ClinicId, DoctorId, ScheduledAt)`, no PostgreSQL range exclusion constraint, and no concurrency token (`xmin` or `RowVersion`).

### 2.3 Cross-Service Ingestion via Interop Hub

#### `AppointmentBookedHandler.cs` (`services/clinic-api/ClinicEz.Clinic.Infrastructure/Messaging/Handlers/AppointmentBookedHandler.cs`)
- Handles incoming `patient.appointment.booked` events sent from `patient-api` when a patient books through the mobile app.
- Lines 192-212 instantiate an `Appointment` with `DurationMinutes = 30` and `Status = AppointmentStatus.Confirmed`.
- It performs idempotent deduplication against `DraftId`, but **does not perform slot availability or double-booking validation**. If two patients submit booking drafts for the same doctor at the same minute, both are saved as confirmed appointments.

### 2.4 Frontend Analysis (`Appointments.screen.tsx`)

#### `apps/clinic-app/navigation/screens/Appointments.screen.tsx`
- Lines 58-65 calculate a default time two hours from now (`defaultSlot()`).
- Lines 467-474 render raw text inputs:
  ```tsx
  <View style={styles.fieldRow}>
    <View style={styles.flexFill}>
      <Input label="Date" placeholder="YYYY-MM-DD" value={formDate} onChangeText={setFormDate} />
    </View>
    <View style={styles.flexFill}>
      <Input label="Time" placeholder="HH:MM" value={formTime} onChangeText={setFormTime} />
    </View>
  </View>
  ```
- The user must manually type arbitrary dates and times. There is no slot availability picker, no indicator of doctor shift timings, and no collision alert before submission.

---

## 3. Investigation of Clinical Encounter & Consultation Workflows (R4)

### 3.1 API and Domain Models

#### `ConsultationsController.cs` (`services/clinic-api/ClinicEz.Clinic.Api/Controllers/ConsultationsController.cs`)
- Endpoints:
  - `GET /api/v1/consultations`: Queries encounters with filters for `patientId`, `doctorId`, `isSigned`.
  - `GET /api/v1/consultations/{id}`: Retrieves single encounter with diagnoses and prescriptions.
  - `POST /api/v1/consultations`: Drafts encounter via `CreateConsultationCommand`.
  - `PUT /api/v1/consultations/{id}`: Updates encounter draft via `UpdateConsultationCommand`.
  - `POST /api/v1/consultations/{id}/sign`: Signs and locks encounter via `SignConsultationCommand`.

#### `ConsultationEncounter.cs` (`services/clinic-api/ClinicEz.Clinic.Domain/Entities/ConsultationEncounter.cs`)
- Properties:
  - Identifiers: `Id`, `TenantId`, `ClinicId`, `BranchId`, `QueueItemId`, `AppointmentId`, `PatientId`, `PatientName`, `DoctorId`, `DoctorName`, `EncounterDate`.
  - SOAP Documentation:
    ```csharp
    public string Subjective { get; set; } = string.Empty;
    public string Objective { get; set; } = string.Empty;
    public string Assessment { get; set; } = string.Empty;
    public string Plan { get; set; } = string.Empty;
    ```
  - Lock Status: `IsSigned` (bool), `SignedAt` (DateTime?).
  - Physician Credentials snapshot: `DoctorPrcLicense`, `DoctorPtr`, `DoctorS2License`.
  - PhilHealth YAKAP Encounter Tracking: `IsYakapEligible`, `PhilHealthSignSympCode`, `PhilHealthOtherComplaint`, `PhilHealthPainSite`, `PhilHealthCaseNo`, `PhilHealthSoapTransNo`.
  - Navigations: `ICollection<EncounterDiagnosis> Diagnoses`, `ICollection<PrescriptionItem> Prescriptions`.

#### `EncounterDiagnosis.cs` (`services/clinic-api/ClinicEz.Clinic.Domain/Entities/EncounterDiagnosis.cs`)
- Fields: `ConsultationEncounterId`, `Icd10Code`, `Description`, `IsPrimary`.
- Searched in real-time against `lib_icd.json` (over 1.25 MB, containing standard ICD-10-CM / PhilHealth codes).

#### `PrescriptionItem.cs` (`services/clinic-api/ClinicEz.Clinic.Domain/Entities/PrescriptionItem.cs`)
- Fields: `GenericName`, `BrandName`, `Dosage`, `Form`, `Sig`, `Quantity`, `DurationDays`, `Refills`, `IsDangerousDrug`, `PhilHealthDrugCode`.
- Evaluated via `ClinicalDecisionSupportEvaluator.cs` for drug-drug interactions, renal adjustments, and contraindications.

#### `TriageVitals.cs` (`services/clinic-api/ClinicEz.Clinic.Domain/Entities/TriageVitals.cs`)
- Fields: `SystolicBp`, `DiastolicBp`, `HeartRateBpm`, `TemperatureCelsius`, `RespiratoryRateBreathsPerMin`, `OxygenSaturationPercent`, `HeightCm`, `WeightKg`, `Bmi`, `PainScore`, `Notes`.
- **Architectural Limitation**: Foreign key `QueueItemId` links vitals exclusively to the walk-in triage queue. If a patient is seen without passing through the nurse triage station (or for longitudinal visits), vitals cannot be directly associated with the encounter or patient profile without orphaned dummy queue records.

### 3.2 Frontend Workflow (`Consultations.screen.tsx`)

- At 2,983 lines, `Consultations.screen.tsx` manages queue retrieval, patient selection, CDS alerts, laboratory order generation, prescription authoring, document issuance (Medical Certificates and Referral Letters), and PhilHealth complaint coding.
- In lines 1624–1868:
  - Subjective, Objective, Assessment, and Plan are rendered as raw multiline text inputs (`<Input multiline ... />`).
  - No template selector exists to pre-populate clinical questions or examination systems based on specialty (e.g. Well-Child Exam, Hypertension Follow-up, Prenatal Checkup).
  - No clinical macro engine exists to expand shortcuts (e.g. typing `.normal` to generate standard review of systems).

---

## 4. Investigation of Problem Lists, Allergies, Chronic Disease (NCD) & Pediatric Growth (R3)

### 4.1 Problem List and Allergies State

In `ClinicPatient.cs`:
- Line 49: `public string? Allergies { get; set; } // e.g. "Penicillin, Aspirin, Seafood"`
- Line 50: `public string? ChronicConditions { get; set; } // e.g. "Hypertension, T2DM"`
- Line 51: `public string? Alerts { get; set; } // e.g. "Fall risk, Bleeding tendency"`

#### Gaps Identified:
1. **Unstructured Data**: Stored as unparsed strings. No onset date, resolved date, severity, clinical status (`Active`, `Resolved`, `Inactive`, `Relapsed`), or ICD-10 diagnostic code linkage.
2. **CDS Compromise**: In `ClinicalDecisionSupportEvaluator.cs` (lines 107-188), allergy checking uses:
   ```csharp
   var allergies = patientAllergies.Split(new[] { ',', ';', '/' }, StringSplitOptions.RemoveEmptyEntries)
       .Select(a => a.Trim()).ToList();
   ```
   If a clinician writes "Mild nausea with amoxicillin (not allergic)", the substring check detects "amoxicillin" and triggers a false-positive critical anaphylaxis alert.
3. **No Bi-directional Historical Tracking**: Once a condition is resolved, clinicians must manually delete it from the text string, losing historical medical records.

### 4.2 Chronic Disease (NCD) & PhilPEN Tracking

- In `YakapPatientProfileController.cs` (`services/clinic-api/ClinicEz.Clinic.Api/Controllers/YakapPatientProfileController.cs`):
  - Patient profiles and PhilPEN answers are stored as serialized JSON inside `patient.CustomFields["philhealth_profile"]`.
  - The model `PhilHealthPatientProfileDto` (`YakapDtoModels.cs` lines 489-595) holds:
    - `MedicalHistories` (`List<PhilHealthConditionEntryDto>`)
    - `SurgicalHistories` (`List<PhilHealthSurgicalEntryDto>`)
    - `SocialHistory` (smoking, alcohol, drugs)
    - `NcdAnswers` (`YakapNcdAnswersDto` mapping Q1–Q24)
- **Database Defect**: Storing this data in `CustomFields` (a PostgreSQL `text` column with JSON conversion) prevents relational querying, prevents longitudinal trend analysis of blood pressure or blood glucose, and prevents multi-patient cohort reporting (e.g., identifying all active diabetic patients with HbA1c > 8.0%).
- **Seed Catalog Reference**: `lib_ncdq.json` in `ClinicEz.Clinic.Infrastructure/PhilHealth/Catalog/Seed/lib_ncdq.json` defines all 24 PhilPEN questions:
  - Q1–Q4: Dietary and physical activity risk factors.
  - Q5–Q8: Diabetes symptoms (polyphagia, polydipsia, polyuria).
  - Q9–Q16: Cardiovascular symptoms (angina, dyspnea, stroke/TIA symptoms).
  - Q17: WHO/ISH Risk Level percentage categorization (`A: <10%`, `B: 10-20%`, `C: 20-30%`, `D: 30-40%`, `E: >=40%`).
  - Q18–Q24: Lab metrics (FBS mg/dL, cholesterol, urine ketones, urine protein).

### 4.3 Pediatric Growth Metrics & WHO Z-Scores

- **Available Statutory Data**: `lib_zscore.json` (3,863 lines, 656 KB) in `ClinicEz.Clinic.Infrastructure/PhilHealth/Catalog/Seed/lib_zscore.json` contains sex- and age-specific weight-for-length/height tables for children aged 0–23 months and 24–59 months, with standard deviation cutoffs (`< -3SD`, `-3SD`, `< -2SD`, `-2SD`, `+2SD`, `> +2SD`, `+3SD`, `> +3SD`) and nutritional classifications (`Severely Wasted`, `Moderately Wasted`, `Normal`, `Overweight`, `Obese`).
- **Complete Lack of Integration**:
  - `TriageVitals.cs` only contains `HeightCm`, `WeightKg`, and `Bmi`.
  - It **lacks** `HeadCircumferenceCm`, `WaistCircumferenceCm`, `MidUpperArmCircumferenceCm` (MUAC), `LengthCm`, `WeightForAgeZScore`, `HeightForAgeZScore`, `WeightForHeightZScore`, and `BmiForAgeZScore`.
  - There is no calculation service to evaluate anthropometric Z-scores using WHO LMS formulas or `lib_zscore.json` lookups.
  - In `apps/clinic-app/components/PhilHealthProfileModal.tsx` (lines 603-653), `headCircCm` and `muacCm` are raw manual numeric inputs with no automatic calculation or percentile curve plotting.

---

## 5. PhilHealth Yakap Data Dictionary Compliance Analysis

The XML generator (`services/philhealth-proxy/ClinicEz.PhilHealthProxy.Infrastructure/Services/KonsultaXmlGenerator.cs`) validates generated XML against `KonsultaData_v1.14.dtd`. Any schema mismatch or missing required element causes transmittal rejection.

### 5.1 Mapping Matrix: Clinical Models to PhilHealth XML

| PhilHealth XML Element | Statutory Library | Existing Clinic EZ Source | Status & Deficiencies | Remediation Required |
| :--- | :--- | :--- | :--- | :--- |
| `<PEPERT>` (in `<PROFILE>` & `<SOAP>`) | DTD Schema | `TriageVitals` + `PhilHealthPatientProfileDto` | **Partial**: Height, weight, BP mapped; `pZScore`, `pLength`, `pHeadCirc`, `pWaist`, `pHip`, `pMidUpperArmCirc` default to empty strings. | Add structured anthropometry entity with WHO Z-score calculator. |
| `<PEMISC>` | `lib_skin_extremities`, `lib_heent`, `lib_chest`, `lib_heart`, `lib_abdomen`, `lib_neuro`, `lib_digital_rectal`, `lib_genitourinary` | `PhilHealthProfileModal` (manual selection); defaults to "1" (Essentially Normal) | **Functional but disconnected**: Stored in `CustomFields`; disconnected from encounter SOAP objective note. | Structured Physical Exam checklist in SOAP templates that binds directly to catalog IDs. |
| `<MEDHISTS>` & `<SPECIFICHISTS>` | `lib_mdiseases` | `ClinicPatient.ChronicConditions` (free text) & `PhilHealthPatientProfileDto.MedicalHistories` | **High Risk**: Relies on string parsing heuristics in `PhilHealthCatalogResolver.cs`. | Structured `PatientProblem` entity with explicit PhilHealth disease code binding. |
| `<NCDQANS>` | `lib_ncdq` | `ClinicPatient.CustomFields` (`ncd_qid1`..`ncd_qid24`, etc.) | **Unstructured**: Stored as arbitrary JSON; no validation of mandatory lab values for Q19–Q22. | Dedicated `NcdRiskAssessment` entity with PhilPEN scoring engine. |
| `<IMMUNIZATION+>` | `lib_immchild`, `lib_immyoungw`, `lib_immpregw`, `lib_immelderly` | `PhilHealthPatientProfileDto` (arrays of strings); fallback code `"999"` | **Unstructured**: No lot number, expiration, injection site, dose sequence, or adverse reactions. | Dedicated `PatientImmunization` entity (covered under R2). |
| `<SOAP>` | DTD Schema | `ConsultationEncounter` | **Flat text**: `pIllnessHistory` and `pSignsSymptoms` populated; diagnostics and managements mapped. | Specialty SOAP templates that structure narrative into clinical sections while retaining PhilHealth codes. |

---

## 6. Architectural Specification & Gap Remediation Blueprint

### 6.1 Requirement R1: Doctor Schedule, Rostering & Availability Engine

#### 6.1.1 Domain Entities (`ClinicEz.Clinic.Domain/Entities/`)

##### `DoctorScheduleTemplate.cs`
Represents recurring weekly working schedules for clinic doctors.
```csharp
namespace ClinicEz.Clinic.Domain.Entities;

public sealed class DoctorScheduleTemplate : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid DoctorId { get; set; }
    public DayOfWeek DayOfWeek { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public int SlotIntervalMinutes { get; set; } = 30; // 15, 20, 30, 45, 60
    public bool IsActive { get; set; } = true;
    public DateOnly EffectiveStartDate { get; set; }
    public DateOnly? EffectiveEndDate { get; set; }

    public ICollection<DoctorBreakTime> BreakTimes { get; set; } = new List<DoctorBreakTime>();
}
```

##### `DoctorBreakTime.cs`
Defines non-bookable intervals within a template or shift (e.g. lunch, ward rounds).
```csharp
namespace ClinicEz.Clinic.Domain.Entities;

public sealed class DoctorBreakTime : BaseEntity
{
    public Guid DoctorScheduleTemplateId { get; set; }
    public DoctorScheduleTemplate? DoctorScheduleTemplate { get; set; }
    public required string Description { get; set; } // "Lunch Break", "Clinical Admin"
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
}
```

##### `DoctorLeave.cs`
Defines blackout periods, vacations, sick leaves, and clinic-wide holiday closures.
```csharp
namespace ClinicEz.Clinic.Domain.Entities;

public enum DoctorLeaveType
{
    Vacation = 1,
    SickLeave = 2,
    Conference = 3,
    Emergency = 4,
    ClinicHoliday = 5
}

public sealed class DoctorLeave : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid? DoctorId { get; set; } // Null if entire clinic is closed
    public DoctorLeaveType LeaveType { get; set; }
    public DateTime StartDateTimeUtc { get; set; }
    public DateTime EndDateTimeUtc { get; set; }
    public string? Reason { get; set; }
    public bool IsApproved { get; set; } = true;
    public string? ApprovedByStaffId { get; set; }
}
```

##### `DoctorScheduleOverride.cs`
Handles date-specific shift modifications (e.g. covering for another physician or working on a weekend).
```csharp
namespace ClinicEz.Clinic.Domain.Entities;

public sealed class DoctorScheduleOverride : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid DoctorId { get; set; }
    public DateOnly OverrideDate { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public int SlotIntervalMinutes { get; set; } = 30;
    public bool IsCancelled { get; set; } = false; // Mark true to cancel normal template for this date
    public string? Reason { get; set; }
}
```

#### 6.1.2 Concurrency & Double-Booking Prevention

1. **Entity Updates to `Appointment.cs`**:
   - Add calculated `EndTimeUtc`: `public DateTime EndTimeUtc { get; set; }`
   - Add PostgreSQL GiST range index and exclusion constraint preventing overlapping active appointments for the same doctor:
     ```csharp
     entity.HasIndex(e => new { e.ClinicId, e.DoctorId, e.ScheduledAt, e.EndTimeUtc })
           .HasFilter("\"Status\" NOT IN ('Cancelled')");
     ```
   - Add Optimistic Concurrency Token: `public uint Version { get; set; }` (mapped to PostgreSQL `xmin`).
2. **Transactional Collision Guard**:
   In `CreateAppointmentCommandHandler` and `RescheduleAppointmentCommandHandler`, execute a pessimistic existence check inside an explicit serializable or snapshot database transaction:
   ```csharp
   var hasCollision = await _appointmentRepo.Query(a =>
       a.ClinicId == clinicId &&
       a.DoctorId == request.DoctorId &&
       a.Status != AppointmentStatus.Cancelled &&
       a.Id != request.AppointmentId && // When rescheduling
       a.ScheduledAt < newAppointmentEndUtc &&
       request.ScheduledAt < a.EndTimeUtc)
       .AnyAsync(ct);

   if (hasCollision)
   {
       throw new ConflictException("The selected doctor is already booked for this time slot.");
   }
   ```

#### 6.1.3 Slot Generation Algorithm (`ISlotAvailabilityService`)

The engine computes available appointment slots for a doctor on a target date:
```
AvailableSlots(Doctor, Date) =
    GeneratedSlots(WorkingHours(Doctor, Date), Interval)
    - BreakTimes(Doctor, Date)
    - Leaves/Blackouts(Doctor, Date)
    - ActiveAppointments(Doctor, Date)
    - PastSlots(If Date == Today)
```

#### 6.1.4 MediatR Commands, Queries & Controllers

- **Controller**: `DoctorSchedulesController` (`Route: api/v1/doctors/{doctorId}/schedules`)
  - `GET /`: `GetDoctorWeeklyScheduleQuery(Guid DoctorId)`
  - `POST /`: `UpsertDoctorScheduleTemplateCommand(...)`
  - `GET /slots?date=YYYY-MM-DD`: `GetDoctorAvailableSlotsQuery(Guid DoctorId, DateOnly Date)`
  - `POST /leaves`: `CreateDoctorLeaveCommand(...)`
  - `GET /leaves`: `GetDoctorLeavesQuery(Guid? DoctorId, DateOnly? From, DateOnly? To)`

---

### 6.2 Requirement R3: Structured Problem List, Allergies & PhilHealth Chronic Care (NCD)

#### 6.2.1 Domain Entities (`ClinicEz.Clinic.Domain/Entities/`)

##### `PatientProblem.cs`
Replaces raw `ClinicPatient.ChronicConditions` with an active and resolved problem registry.
```csharp
namespace ClinicEz.Clinic.Domain.Entities;

public enum ProblemStatus
{
    Active = 1,
    Resolved = 2,
    Inactive = 3,
    Relapsed = 4
}

public enum ProblemSeverity
{
    Mild = 1,
    Moderate = 2,
    Severe = 3
}

public sealed class PatientProblem : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid PatientId { get; set; }
    public ClinicPatient? Patient { get; set; }

    public required string Icd10Code { get; set; }
    public required string Description { get; set; }
    public string? PhilHealthMdiseaseCode { get; set; } // Mapped from lib_mdiseases
    public ProblemStatus Status { get; set; } = ProblemStatus.Active;
    public ProblemSeverity Severity { get; set; } = ProblemSeverity.Moderate;

    public DateOnly? OnsetDate { get; set; }
    public DateOnly? ResolvedDate { get; set; }
    public string? Notes { get; set; }
    public Guid? DiagnosingDoctorId { get; set; }
}
```

##### `PatientAllergy.cs`
Replaces raw `ClinicPatient.Allergies` with structured clinical allergy documentation.
```csharp
namespace ClinicEz.Clinic.Domain.Entities;

public enum AllergyCategory
{
    Drug = 1,
    Food = 2,
    Environmental = 3,
    Biologic = 4,
    Other = 5
}

public enum AllergySeverity
{
    Mild = 1,
    Moderate = 2,
    Severe = 3,
    LifeThreatening = 4 // Anaphylaxis
}

public sealed class PatientAllergy : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid PatientId { get; set; }
    public ClinicPatient? Patient { get; set; }

    public AllergyCategory Category { get; set; }
    public required string Allergen { get; set; } // e.g., "Penicillin", "Sulfonamides", "Peanuts"
    public string? AllergenDrugCode { get; set; } // PhilHealth or RxNorm code if drug
    public string? Reaction { get; set; } // e.g., "Urticaria", "Anaphylaxis", "Angioedema"
    public AllergySeverity Severity { get; set; } = AllergySeverity.Moderate;
    public bool IsVerified { get; set; } = true;
    public DateOnly? IdentifiedDate { get; set; }
}
```

##### `NcdRiskAssessment.cs`
Structured entity storing PhilPEN / Yakap NCD evaluations.
```csharp
namespace ClinicEz.Clinic.Domain.Entities;

public sealed class NcdRiskAssessment : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid PatientId { get; set; }
    public ClinicPatient? Patient { get; set; }
    public Guid? ConsultationEncounterId { get; set; }

    public DateTime AssessmentDate { get; set; } = DateTime.UtcNow;
    public Guid AssessedByStaffId { get; set; }

    // PhilPEN Behavioral & Family Risk Factors (Q1-Q4)
    public bool EatsProcessedFoodWeekly { get; set; } // Q1
    public bool ThreeServingsVegetablesDaily { get; set; } // Q2
    public bool TwoToThreeServingsFruitDaily { get; set; } // Q3
    public bool PhysicalActivityAtLeast150MinsWeekly { get; set; } // Q4

    // Diabetes Profile (Q5-Q8, Q18-Q19)
    public bool DiagnosedDiabetes { get; set; } // Q5
    public bool HasPolyphagia { get; set; } // Q6
    public bool HasPolydipsia { get; set; } // Q7
    public bool HasPolyuria { get; set; } // Q8
    public string? DiabetesMedicationStatus { get; set; } // Q18: "Y" with med, "N" without
    public bool HasRaisedBloodGlucose { get; set; } // Q19_Yn
    public decimal? FastingBloodSugarMgDl { get; set; } // Q19_Fbsmg
    public decimal? FastingBloodSugarMmolL { get; set; } // Q19_Fbsmmol
    public DateOnly? FastingBloodSugarDate { get; set; } // Q19_Fbsdate

    // Cardiovascular & Angina Assessment (Q9-Q16, Q20, Q23-Q24)
    public bool HasChestPain { get; set; } // Q9
    public bool PainInCenterOfChestOrLeftArm { get; set; } // Q10
    public bool PainWhenWalkingUphill { get; set; } // Q11
    public bool SlowsDownWhenPainOccurs { get; set; } // Q12
    public bool PainRelievedWithin10MinsOrNitrates { get; set; } // Q13 & Q14
    public bool SevereChestPainOver30Mins { get; set; } // Q15
    public bool TransientNeurologicalDeficits { get; set; } // Q16
    public bool HasRaisedBloodLipids { get; set; } // Q20_Yn
    public decimal? TotalCholesterolMgDl { get; set; } // Q20_Choleval
    public DateOnly? TotalCholesterolDate { get; set; } // Q20_Choledate
    public bool HasHistoryAnginaHeartAttack { get; set; } // Q23
    public bool HasHistoryStrokeOrTia { get; set; } // Q24

    // Urinalysis Indicators (Q21-Q22)
    public bool UrineKetonesPresent { get; set; } // Q21_Yn
    public string? UrineKetonesValue { get; set; } // Q21_Ketonval
    public DateOnly? UrineKetonesDate { get; set; }
    public bool UrineProteinPresent { get; set; } // Q22_Yn
    public string? UrineProteinValue { get; set; } // Q22_Proteinval
    public DateOnly? UrineProteinDate { get; set; }

    // WHO/ISH Risk Level Classification (Q17)
    public string RiskLevelLetter { get; set; } = "A"; // A: <10%, B: 10-<20%, C: 20-<30%, D: 30-<40%, E: >=40%
    public decimal? CalculatedRiskScorePercent { get; set; }
}
```

#### 6.2.2 Integration with Clinical Decision Support

In `ClinicalDecisionSupportEvaluator.cs`, update the allergy check method to take structured `IEnumerable<PatientAllergy>` instead of a raw string:
```csharp
public static List<CdsAlert> Evaluate(
    IEnumerable<PrescriptionCandidate> candidates,
    IEnumerable<PatientAllergy>? structuredAllergies = null,
    ...)
{
    if (structuredAllergies != null)
    {
        foreach (var allergy in structuredAllergies.Where(a => a.Category == AllergyCategory.Drug))
        {
            // Evaluate exact allergen, drug class, and cross-reactivity
        }
    }
}
```

#### 6.2.3 MediatR & API Endpoints

- `PatientProblemsController`:
  - `GET /api/v1/patients/{patientId}/problems`: `GetPatientProblemsQuery`
  - `POST /api/v1/patients/{patientId}/problems`: `CreatePatientProblemCommand`
  - `PUT /api/v1/patients/{patientId}/problems/{id}`: `UpdatePatientProblemCommand`
- `PatientAllergiesController`:
  - `GET /api/v1/patients/{patientId}/allergies`: `GetPatientAllergiesQuery`
  - `POST /api/v1/patients/{patientId}/allergies`: `CreatePatientAllergyCommand`
  - `DELETE /api/v1/patients/{patientId}/allergies/{id}`: `DeletePatientAllergyCommand`
- `NcdAssessmentsController`:
  - `GET /api/v1/patients/{patientId}/ncd-assessments`: `GetPatientNcdAssessmentsQuery`
  - `POST /api/v1/patients/{patientId}/ncd-assessments`: `CreateNcdAssessmentCommand`

---

### 6.3 Requirement R4: Clinical SOAP Templates, WHO Growth Charts & Yakap Alignment

#### 6.3.1 Domain Entities (`ClinicEz.Clinic.Domain/Entities/`)

##### `SoapTemplate.cs`
Allows clinics and specialty doctors to define structured templates.
```csharp
namespace ClinicEz.Clinic.Domain.Entities;

public sealed class SoapTemplate : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public required string Title { get; set; } // "General Adult", "Pediatric Well-Child", "Hypertension Follow-Up"
    public string? Specialty { get; set; } // "Pediatrics", "Cardiology", "Internal Medicine"

    public string? SubjectivePrompt { get; set; }
    public string? ObjectivePrompt { get; set; }
    public string? AssessmentPrompt { get; set; }
    public string? PlanPrompt { get; set; }

    /// <summary>
    /// JSON array of organ systems to evaluate (Skin, HEENT, Chest, Heart, etc.)
    /// with default findings mapped to PhilHealth lib_* library item keys.
    /// </summary>
    public string PhysicalExamChecklistJson { get; set; } = "[]";

    public bool IsDefault { get; set; } = false;
}
```

##### `ClinicalMacro.cs`
Provides shorthand dot-phrases (`.macros`) that expand automatically into formatted clinical notes.
```csharp
namespace ClinicEz.Clinic.Domain.Entities;

public sealed class ClinicalMacro : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid? DoctorId { get; set; } // Null if shared clinic-wide
    public required string TriggerKey { get; set; } // e.g., ".normalpe", ".htnplan", ".vitals"
    public required string ReplacementText { get; set; }
    public string? Description { get; set; }
}
```

##### `PediatricGrowthMetric.cs`
Longitudinal child growth tracking compliant with WHO Child Growth Standards and PhilHealth `lib_zscore`.
```csharp
namespace ClinicEz.Clinic.Domain.Entities;

public enum NutritionalStatus
{
    SeverelyWasted = 1,
    ModeratelyWasted = 2,
    Normal = 3,
    Overweight = 4,
    Obese = 5
}

public sealed class PediatricGrowthMetric : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid PatientId { get; set; }
    public Guid? ConsultationEncounterId { get; set; }
    public DateTime MeasurementDate { get; set; } = DateTime.UtcNow;

    public int AgeMonths { get; set; }
    public decimal WeightKg { get; set; }
    public decimal HeightCm { get; set; }
    public decimal? HeadCircumferenceCm { get; set; }
    public decimal? MidUpperArmCircumferenceCm { get; set; }

    // Calculated WHO Z-scores
    public decimal? WeightForAgeZScore { get; set; }
    public decimal? HeightForAgeZScore { get; set; }
    public decimal? WeightForHeightZScore { get; set; }
    public decimal? BmiForAgeZScore { get; set; }
    public decimal? HeadCircumferenceZScore { get; set; }

    // PhilHealth lib_zscore mapping
    public string? PhilHealthZScoreCode { get; set; } // e.g. "girls-0-23/004"
    public string? PhilHealthZScoreResult { get; set; } // e.g. "-2SD", "Normal"
    public NutritionalStatus NutritionalStatus { get; set; } = NutritionalStatus.Normal;
}
```

#### 6.3.2 WHO Pediatric Growth Calculator (`IWhoGrowthCalculator`)

The calculator implements:
1. **The WHO LMS Box-Cox Formula**:
   $$Z = \frac{\left(\frac{X}{M}\right)^L - 1}{L \times S}$$
   Where $X$ is the observed measurement, $L$ is Box-Cox power, $M$ is median, and $S$ is coefficient of variation.
2. **PhilHealth `lib_zscore` Mapping**:
   Lookup in the seeded `lib_zscore.json` dataset matching `(Sex, AgeMonths, Length/Height, Weight)` to return the exact statutory result string (`< -3SD`, `-2SD`, `Normal`, `Overweight`, etc.) for seamless inclusion in `<PEPERT pZScore="...">`.

#### 6.3.3 Yakap Clinical Mapper Refactoring (`YakapClinicalMapper.cs`)

Update `YakapClinicalMapper.cs` so that:
1. `MapPhysicalExam()` takes structured `PediatricGrowthMetric` and `TriageVitals`.
2. Emits all required `<PEPERT>` attributes without loss:
   - `pZScore`: Populated directly from `PediatricGrowthMetric.PhilHealthZScoreResult`.
   - `pLength`: `PediatricGrowthMetric.HeightCm.ToString("F1")`.
   - `pHeadCirc`: `PediatricGrowthMetric.HeadCircumferenceCm.ToString("F1")`.
   - `pMidUpperArmCirc`: `PediatricGrowthMetric.MidUpperArmCircumferenceCm.ToString("F1")`.
3. `MapMedicalHistories()` extracts directly from `PatientProblem` table, matching `Icd10Code` and `PhilHealthMdiseaseCode` without free-text regex guesswork.
4. `MapNcdAnswers()` reads directly from the latest `NcdRiskAssessment` entity.

---

## 7. Database Migration & Schema Evolution Strategy

### 7.1 Phased Migration Plan
1. **Migration 1: `AddDoctorSchedulingSuite`**:
   - Creates `DoctorScheduleTemplates`, `DoctorBreakTimes`, `DoctorLeaves`, `DoctorScheduleOverrides`.
   - Adds `EndTimeUtc` to `Appointments` and creates unique/exclusion indexes.
2. **Migration 2: `AddStructuredProblemsAndNcdCare`**:
   - Creates `PatientProblems`, `PatientAllergies`, `NcdRiskAssessments`.
   - Adds indexes on `(ClinicId, PatientId, Status)`.
3. **Migration 3: `AddSoapTemplatesAndPediatricGrowth`**:
   - Creates `SoapTemplates`, `ClinicalMacros`, `PediatricGrowthMetrics`.
   - Seeds default SOAP templates (General Consultation, Pediatric Well-Child, Hypertension, Diabetes).

### 7.2 Data Migration from `ClinicPatient.CustomFields`
A migration service or EF Core seeding migration will:
1. Parse existing `patient.CustomFields["philhealth_profile"]` JSON blobs.
2. Unpack `MedicalHistories` into `PatientProblems`.
3. Unpack `NcdAnswers` into `NcdRiskAssessments`.
4. Parse existing comma-separated strings (`Allergies`, `ChronicConditions`) into initial `PatientAllergy` and `PatientProblem` records.

---

## 8. Frontend Component Architecture (`apps/clinic-app`)

### 8.1 Scheduling & Availability (`Appointments.screen.tsx`)
- Replace raw date/time text inputs with:
  1. **Provider Date Picker**: Calendar view showing available doctor days.
  2. **Slot Selection Grid**: Visual pills grouped by Period (Morning, Afternoon, Evening) fetched via `clinicService.getDoctorSlots(doctorId, date)`.
  3. **Doctor Rostering Modal**: Staff management screen allowing doctors and clinic admins to configure weekly shifts, lunch breaks, and leaves.

### 8.2 Clinical Consultations & SOAP (`Consultations.screen.tsx`)
- **Template Bar**: Dropdown to select and load SOAP templates.
- **Physical Exam Checklist**: Expandable accordions for 8 organ systems with single-click "Mark All Normal" button generating compliant PhilHealth IDs.
- **Macro Expansion**: Text input listener expanding dot-phrases upon pressing space or tab.

### 8.3 Pediatric Growth & NCD Tracking
- **Interactive Growth Charts**: React Native SVG line charts rendering WHO percentile curves ($3^{\text{rd}}, 15^{\text{th}}, 50^{\text{th}}, 85^{\text{th}}, 97^{\text{th}}$) with patient growth trajectory points.
- **PhilPEN Questionnaire Form**: Dedicated wizard tab in patient summary displaying risk percentage and recommended interventions.

---

## 9. Inter-Service Synchronization (Interop Hub)

### Cross-Service Messages:
1. `clinic.schedule.slot_updated`: Broadcast when a doctor's schedule or leave changes, invalidating cache in `patient-api`.
2. `patient.appointment.booked`: Enriched to validate slot existence before confirmation.
3. `clinic.problem.updated` / `clinic.allergy.updated`: Published to `patient-api` so the patient mobile app displays verified active problems and allergies.

---

## 10. Conclusion

The Clinic EZ clinic API and frontend possess strong core foundations, but currently rely on workarounds (free-text string parsing, unstructured JSON in `CustomFields`, and unvalidated appointment inputs) that compromise scalability, patient safety, and seamless PhilHealth claims automation.

Implementing the blueprints outlined above for **R1 (Scheduling & Rostering Engine)**, **R3 (Structured Problem List & NCD Care)**, and **R4 (Clinical SOAP Templates & WHO Growth Charts)** will establish a robust, standards-compliant, and PhilHealth Yakap-certified architecture.
