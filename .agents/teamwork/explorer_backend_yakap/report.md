# Technical Exploration & Architectural Analysis: Backend Architecture & PhilHealth-Case1 Yakap Compliance

**Author**: Explorer 1 (Backend Architecture & PhilHealth-Case1 Yakap Compliance Specialist)  
**Date**: October 9, 2026  
**Target Services**: `services/clinic-api/`, `services/interop-hub/`, `services/philhealth-proxy/`, `services/patient-api/`, `packages/shared-dotnet/`  
**Repository Root**: `c:\Users\User\projects\nextstep\github\clinicez-arch2`  

---

## 1. Executive Summary & Monorepo Topology

The ClinicEZ monorepo is an enterprise Philippine healthcare platform featuring a distributed microservices architecture alongside React Native / Expo frontends. The backend ecosystem is built upon **.NET 9 / C# 13**, adhering strictly to **Clean Architecture** patterns, **Entity Framework Core (Npgsql)** with multi-tenant schema isolation, **MediatR CQRS** message orchestration, and an asynchronous **Transactional Outbox / Interop Hub** communication bus.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                CLINICEZ MONOREPO                                 │
└──────────────────────────────────────────────────────────────────────────────────┘
            │                                                      │
     [HTTP REST / JSON]                                     [Interop Hub / Outbox]
            │                                                      │
            ▼                                                      ▼
┌─────────────────────────┐                            ┌─────────────────────────┐
│       clinic-api        │◄───[HTTP Proxy/Ann. D]────►│    philhealth-proxy     │
│   (Clean Architecture)  │                            │ (SOAP / DTD Validation) │
└─────────────────────────┘                            └─────────────────────────┘
            │                                                      │
   [Interop Envelope]                                     [Interop Envelope]
            │                                                      │
            ▼                                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                       interop-hub (Core Routing Service)                         │
└──────────────────────────────────────────────────────────────────────────────────┘
            ▲                                                      ▲
            │                                                      │
   [Interop Envelope]                                     [Interop Envelope]
            │                                                      │
┌─────────────────────────┐                            ┌─────────────────────────┐
│       patient-api       │                            │      laboratory-api     │
│ (Patient Health Record) │                            │      & pharmacy-api     │
└─────────────────────────┘                            └─────────────────────────┘
```

The primary clinical workload executes inside `services/clinic-api/`. A crucial requirement for national clinic operation is complete statutory alignment with the **Philippine Health Insurance Corporation (PhilHealth) Konsulta / Yakap Primary Care Benefits program**, governed by `KonsultaData_v1.14.dtd` and the PhilHealth Primary Care Implementation Guide.

This report documents the internal architecture of `clinic-api`, the PhilHealth Yakap integration, the Interop Hub bus protocols, and establishes the precise architectural specifications required to implement:
1. **Doctor Schedule, Rostering & Availability Engine (R1)**
2. **PhilHealth-Case1 Compliant Immunization & Vaccine Administration (R2)**
3. **Structured Problem List, Allergies & PhilHealth-Aligned Chronic Care (NCD) (R3)**
4. **Clinical SOAP Templates, Growth Charts & Yakap Consultation Alignment (R4)**

---

## 2. Clean Architecture Implementation in `clinic-api`

The `services/clinic-api/` solution is divided into four distinct architectural layers, maintaining strict dependency inversion where inner layers have no dependency on outer layers:

```
ClinicEz.Clinic.Api (Controllers, Middlewares, Auth Filters)
        │
        ▼
ClinicEz.Clinic.Infrastructure (EF Core, Repositories, Outbox, Proxies)
        │
        ▼
ClinicEz.Clinic.Application (CQRS Commands, Queries, DTOs, Mappers)
        │
        ▼
ClinicEz.Clinic.Domain (Entities, Enums, Value Objects, Core Interfaces)
```

### 2.1 Domain Layer (`ClinicEz.Clinic.Domain`)
- **Path**: `services/clinic-api/ClinicEz.Clinic.Domain/`
- **Responsibilities**: Contains enterprise entities, aggregate roots, domain enums, domain interfaces, and common base classes. It has zero external dependencies beyond standard C# libraries.
- **Key Files**:
  - `Common/BaseEntity.cs` & `Common/IEntity.cs`: Defines primary key `Guid Id`, audit stamps (`CreatedAt`, `CreatedBy`, `UpdatedAt`, `UpdatedBy`), soft deletion (`IsDeleted`, `DeletedAt`, `DeletedBy`), and unmapped `AllowHardDelete`.
  - `Interfaces/IClinicContext.cs`: Ambient multi-tenant execution context providing `TenantId`, `ClinicId`, `BranchId`, `StaffId`, and `Permissions`.
  - `Interfaces/IRepository.cs`: Generic repository interface exposing LINQ queries, asynchronous CRUD, bulk operations (`EFCore.BulkExtensions`), and `SieveModel` pagination/sorting.
  - `Interfaces/IUnitOfWork.cs`: Manages atomic transactions and `SaveChangesAsync(ct)`.
  - `Entities/ConsultationEncounter.cs`: Encapsulates clinical notes (`Subjective`, `Objective`, `Assessment`, `Plan`), signing status (`IsSigned`, `DoctorPrcLicense`), and PhilHealth transmittal tracking numbers.
  - `Entities/ClinicPatient.cs`: Master Patient Index (MPI) entity storing demographics, PhilHealth numbers (`PhilHealthNumber`, `PhilHealthCaseNo`, `PhilHealthEnlistmentNo`), and an untyped dictionary `CustomFields` for tenant-specific JSON extensions.
  - `Entities/Appointment.cs`: Basic appointment model (`PatientId`, `DoctorId`, `ScheduledAt`, `DurationMinutes`, `Status`).
  - `Entities/TriageVitals.cs`: Triage measurements (`SystolicBp`, `DiastolicBp`, `HeartRateBpm`, `TemperatureCelsius`, `HeightCm`, `WeightKg`, `Bmi`).
  - `Entities/PhilHealthCatalog.cs`: Models statutory library rows (`PhilHealthCatalogItem`) and kit import audits (`PhilHealthCatalogImportLog`).
  - `Entities/YakapTransmittal.cs` & `YakapTransmittalItem.cs`: Tracks claims transmittals, Tranche tagging ("1" vs "2"), batch XML payloads, and item-level validation remarks.

### 2.2 Application Layer (`ClinicEz.Clinic.Application`)
- **Path**: `services/clinic-api/ClinicEz.Clinic.Application/`
- **Responsibilities**: Orchestrates business workflows using **MediatR (CQRS)**. Contains request handlers, validators (**FluentValidation**), data transfer objects (DTOs), and clinical transformation mappers.
- **Key Features**:
  - `Features/Appointments/`: Commands (`CreateAppointmentCommand`, `RescheduleAppointmentCommand`, `CancelAppointmentCommand`) and queries (`GetAppointmentsQuery`).
  - `Features/Consultations/`: `CreateConsultationCommand`, `UpdateConsultationCommand`, and `SignConsultationCommand`.
  - `Features/Yakap/`:
    - `Services/YakapClinicalMapper.cs`: Transforms relational entities into `YakapReportDocumentDto`.
    - `Services/PhilHealthCatalogResolver.cs`: Resolves unstructured clinical strings to statutory catalog codes.
    - `Commands/CreateYakapTransmittal/`: Aggregates eligible encounters and drafts transmittals.
    - `Commands/ValidateYakapTransmittal/`: Pre-flights XML validation against PhilHealth DTD v1.14 via proxy.
    - `Commands/SubmitYakapTransmittal/`: Submits encrypted claims via SOAP proxy.

### 2.3 Infrastructure Layer (`ClinicEz.Clinic.Infrastructure`)
- **Path**: `services/clinic-api/ClinicEz.Clinic.Infrastructure/`
- **Responsibilities**: Implements domain interfaces using PostgreSQL / EF Core, handles database migrations, provides HTTP clients to external services, and implements the transactional outbox messaging bus.
- **Key Files**:
  - `Persistence/ApplicationDbContext.cs`: Configures schema isolation, global query filters (`ClinicId == CurrentClinicId && !IsDeleted`), value converters for JSON dictionaries, and interop outbox/inbox tables.
  - `Persistence/Repositories/Repository.cs`: Implementation of `IRepository<T>` using `Sieve` and `EFCore.BulkExtensions`.
  - `Services/PhilHealthProxyClient.cs`: HTTP client implementing `IPhilHealthProxyClient`, attaching tenancy headers (`X-Tenant-Id`, `X-Facility-Id`).
  - `Services/PhilHealthSequenceGenerator.cs`: Generates standard PhilHealth reference numbers (`RHCI...`, `THCI...`, `EHCI...`, `PHCI...`, `SHCI...`).
  - `PhilHealth/Catalog/PhilHealthCatalogSeedHostedService.cs`: Automatically seeds official statutory libraries from local JSON assets on service bootstrap.

### 2.4 Presentation Layer (`ClinicEz.Clinic.Api`)
- **Path**: `services/clinic-api/ClinicEz.Clinic.Api/`
- **Responsibilities**: Exposes ASP.NET Core REST API controllers, enforces permission attributes (`[HasPermission(...)]`), manages Swagger/OpenAPI documentation, and handles centralized exception translation.
- **Key Controllers**:
  - `Controllers/AppointmentsController.cs`: CRUD operations on appointments.
  - `Controllers/ConsultationsController.cs`: Consultation lifecycle (Draft -> Sign).
  - `Controllers/YakapPatientProfileController.cs`: Standalone PhilHealth profiling endpoint.
  - `Controllers/YakapTransmittalsController.cs`: Claim transmittal generation and status queries.

---

## 3. Current PhilHealth Yakap Integration & XML Architecture

PhilHealth Konsulta / Yakap claims submission is governed by the official document type definition `KonsultaData_v1.14.dtd`. All submissions must be packaged as an XML document with a `<PCB>` root element, strictly validated against the DTD, encrypted according to PhilHealth Annex D (AES cipher key protection), and dispatched via SOAP endpoints.

### 3.1 DTD Root Structure & Element Hierarchy (`KonsultaData_v1.14.dtd`)

The root element definition in `KonsultaData_v1.14.dtd` (Line 67) requires:
```dtd
<!ELEMENT PCB (ENLISTMENTS+,PROFILING+,SOAPS+,DIAGNOSTICEXAMRESULTS*,MEDICINES+,DOCUMENTS*)>
<!ATTLIST PCB
   pUsername CDATA #REQUIRED
   pPassword CDATA #REQUIRED
   pHciAccreNo CDATA #REQUIRED
   pPMCCNo CDATA #REQUIRED
   pEnlistTotalCnt CDATA #REQUIRED
   pProfileTotalCnt CDATA #REQUIRED
   pSoapTotalCnt CDATA #REQUIRED
   pCertificationId CDATA #REQUIRED
   pHciTransmittalNumber CDATA #REQUIRED 
>
```

#### Multiplicity & Tranche Rules:
1. **Tranche 1 (`pReportTagging="1"`)**: Primary Care Enlistment and Baseline Profiling.
   - Enlistment (`<ENLISTMENT>`) and Profiling (`<PROFILE>`) contain actual patient clinical data.
   - Because the DTD mandates `SOAPS+` and `MEDICINES+` (at least one occurrence of each), Tranche 1 requires synthetic placeholder `<SOAP>` and `<MEDICINE>` entries (`DrugCode="NOMED0000000000000000000000000"`, `IcdCodes=["Z00.0"]`, `CoPay="0.00"`).
2. **Tranche 2 (`pReportTagging="2"`)**: Complete Consultation Encounters, Diagnostics, and Dispensed GAMOT Medications.
   - Full `<SOAP>` nodes for each consultation encounter.
   - `<DIAGNOSTICEXAMRESULTS>` containing laboratory analytes (`<FBS>`, `<RBS>`, `<CBC>`, `<URINALYSIS>`, `<CHESTXRAY>`).
   - `<MEDICINES>` detailing actual prescribed and dispensed medications with PhilHealth Drug Codes.

### 3.2 The `<PROFILE>` Schema & Statutory Immunization Mandate

The `<PROFILE>` element (Line 119 in `KonsultaData_v1.14.dtd`) requires 15 mandatory sub-elements:
```dtd
<!ELEMENT PROFILE (MEDHISTS,MHSPECIFICS,SURGHISTS,FAMHISTS,FHSPECIFICS,SOCHIST,IMMUNIZATIONS,MENSHIST,PREGHIST,PEPERT,BLOODTYPE,PEGENSURVEY,PEMISCS,PESPECIFIC,NCDQANS)>
```

#### Immunization Sub-element Specification:
Line 202-213 in `KonsultaData_v1.14.dtd`:
```dtd
<!ELEMENT IMMUNIZATIONS (IMMUNIZATION)+>
<!ELEMENT IMMUNIZATION EMPTY>
<!ATTLIST IMMUNIZATION
   pChildImmcode CDATA #REQUIRED
   pYoungwImmcode CDATA #REQUIRED
   pPregwImmcode CDATA #REQUIRED
   pElderlyImmcode CDATA #REQUIRED
   pOtherImm CDATA #REQUIRED
   pReportStatus (U|V|F) #REQUIRED
   pDeficiencyRemarks CDATA #REQUIRED
>
```
**Crucial DTD Compliance Rules**:
- The multiplicity `(IMMUNIZATION)+` dictates that **every `<PROFILE>` must contain at least one `<IMMUNIZATION>` element**. An empty `<IMMUNIZATIONS/>` tag causes immediate DTD parser failure (`XmlException: The element 'IMMUNIZATIONS' has incomplete content`).
- Each `<IMMUNIZATION>` node maps to one of four age-group statutory libraries, or the `pOtherImm` fallback:
  1. `pChildImmcode`: References library `lib_immchild` (e.g., `C01` for BCG, `C02` for OPV1).
  2. `pYoungwImmcode`: References library `lib_immyoungw` (e.g., `Y01` for HPV, `Y02` for MMR).
  3. `pPregwImmcode`: References library `lib_immpregw` (e.g., `P01` for Tetanus Toxoid).
  4. `pElderlyImmcode`: References library `lib_immelderly` (e.g., `E01` for Pneumococcal, `E02` for Flu).
  5. `pOtherImm`: Any non-catalogued vaccine or statutory fallback code.
- **The Statutory Fallback Rule (`999`)**: If a patient has received no vaccines or immunization history is undocumented, the system must emit an `<IMMUNIZATION>` element with `pOtherImm="999"` (where `999` is officially defined across PhilHealth libraries as "None / Not Given"):
```xml
<IMMUNIZATIONS>
  <IMMUNIZATION pChildImmcode="" pYoungwImmcode="" pPregwImmcode="" pElderlyImmcode="" pOtherImm="999" pReportStatus="U" pDeficiencyRemarks="" />
</IMMUNIZATIONS>
```

### 3.3 Pediatric Anthropometrics & WHO Z-Score Structure (`<PEPERT>`)

In `KonsultaData_v1.14.dtd` (Lines 354-376), physical examination pertinents (`<PEPERT>`) are mandatory in **both** `<PROFILE>` and `<SOAP>`:
```dtd
<!ELEMENT PEPERT EMPTY>
<!ATTLIST PEPERT
   pSystolic CDATA #REQUIRED
   pDiastolic CDATA #REQUIRED
   pHr CDATA #REQUIRED
   pRr CDATA #REQUIRED
   pTemp CDATA #REQUIRED
   pHeight CDATA #REQUIRED
   pWeight CDATA #REQUIRED
   pBMI CDATA #REQUIRED
   pZScore CDATA #REQUIRED
   pLeftVision CDATA #REQUIRED
   pRightVision CDATA #REQUIRED
   pLength CDATA #REQUIRED
   pHeadCirc CDATA #REQUIRED
   pSkinfoldThickness CDATA #REQUIRED
   pWaist CDATA #REQUIRED
   pHip CDATA #REQUIRED
   pLimbs CDATA #REQUIRED
   pMidUpperArmCirc CDATA #REQUIRED
   pReportStatus (U|V|F) #REQUIRED
   pDeficiencyRemarks CDATA #REQUIRED
>
```
- **Pediatric Attributes**:
  - `pLength`: Recumbent length in cm (for infants 0-23 months).
  - `pHeight`: Standing height in cm (for children >= 24 months and adults).
  - `pHeadCirc`: Head circumference in cm.
  - `pMidUpperArmCirc`: Mid-upper arm circumference (MUAC) in cm.
  - `pSkinfoldThickness`: Triceps/subscapular skinfold in mm.
  - `pZScore`: Standardized WHO growth z-score string resolved from library `lib_zscore` (e.g., `<-3SD`, `-3SD`, `<-2SD`, `-2SD`, `+2SD`, `>+2SD`, `+3SD`, `>+3SD`).

### 3.4 PhilPEN 24-Question NCD Risk Assessment (`<NCDQANS>`)

Lines 283-320 of `KonsultaData_v1.14.dtd` define `<NCDQANS>`, containing 24 distinct question attributes:
- `pQid1_Yn` to `pQid4_Yn`: Diet & physical activity (processed food, vegetable intake, fruit intake, 2.5h moderate exercise).
- `pQid5_Ynx` to `pQid8_Yn`: Diabetes screening and classic symptoms (Polyphagia, Polydipsia, Polyuria).
- `pQid9_Yn` to `pQid16_Yn`: Cardiovascular symptoms (angina, chest heaviness, pain radiation, relief with rest/nitrates, transient ischemic symptoms).
- `pQid17_Abcde`: WHO/ISH cardiovascular risk stratification band (`A` = <10%, `B` = 10-<20%, `C` = 20-<30%, `D` = 30-<40%, `E` = >=40%).
- `pQid18_Yn`: Diabetes medication status.
- `pQid19_Yn`, `pQid19_Fbsmg`, `pQid19_Fbsmmol`, `pQid19_Fbsdate`: Hyperglycemia / Fasting Blood Sugar tracking.
- `pQid20_Yn`, `pQid20_Choleval`, `pQid20_Choledate`: Total cholesterol screening.
- `pQid21_Yn`, `pQid21_Ketonval`, `pQid21_Ketondate`: Urine ketones screening.
- `pQid22_Yn`, `pQid22_Proteinval`, `pQid22_Proteindate`: Urine protein / microalbuminuria screening.
- `pQid23_Yn` & `pQid24_Yn`: Prior personal history of Angina/Myocardial Infarction or Stroke/TIA.

### 3.5 XML Generator & Mapper Analysis

In `services/clinic-api/ClinicEz.Clinic.Application/Features/Yakap/Services/YakapClinicalMapper.cs`:
- Currently builds `YakapReportDocumentDto` from entity inputs.
- Extracts patient profiling data from an untyped dictionary entry: `patient.CustomFields["philhealth_profile"]` (Lines 502-525).
- Maps immunizations via `MapImmunizations` (Lines 609-635):
  ```csharp
  // PhilHealth DTD requires at least 1 IMMUNIZATION element (IMMUNIZATION+).
  // Code 999 is standard PhilHealth code for "None / Not Given" without assuming age group.
  if (list.Count == 0)
  {
      list.Add(new YakapImmunizationDto(
          ChildImmcode: "", YoungwImmcode: "", PregwImmcode: "", ElderlyImmcode: "",
          OtherImm: _resolver.NoImmunizationCode()));
  }
  ```
- In `services/philhealth-proxy/ClinicEz.PhilHealthProxy.Infrastructure/Services/KonsultaXmlGenerator.cs`, the DTD-compliant XML is serialized via `XElement` LINQ-to-XML.

---

## 4. Statutory Coding Libraries (`lib_*`)

PhilHealth distributes official reference libraries encoded in JSON format. In ClinicEZ, these are bundled in `services/clinic-api/ClinicEz.Clinic.Infrastructure/PhilHealth/Catalog/Seed/` and seeded into the `PhilHealthCatalogItems` table on boot.

### 4.1 Vaccine Statutory Libraries Breakdown

| Library Name | Target Group | Standard Codes | Key Vaccine Entries | Statutory Fallback |
|---|---|---|---|---|
| `lib_immchild` | Infants & Children (0-17 yrs) | `C01` - `C13` | BCG (`C01`), OPV1-3 (`C02`-`C04`), DPT1-3 (`C05`-`C07`), Measles (`C08`), HepB1-3 (`C09`-`C11`), HepA (`C12`), Varicella (`C13`) | `999` ("None") |
| `lib_immyoungw` | Young / Adolescent Women (10-49 yrs) | `Y01` - `Y02` | Human Papillomavirus (`Y01`), MMR (`Y02`) | `999` ("None") |
| `lib_immpregw` | Pregnant Women | `P01` | Tetanus Toxoid (`P01`) | `999` ("None") |
| `lib_immelderly` | Senior Citizens (>= 60 yrs) | `E01` - `E02` | Pneumococcal Vaccine (`E01`), Influenza Vaccine (`E02`) | `999` ("None") |
| `OtherImm` | All populations | Free text / `999` | Rabies, Typhoid, Japanese Encephalitis, COVID-19, etc. | `999` ("None / Not Given") |

### 4.2 Diagnostic & ICD-10 Libraries
- `lib_icd`: Contains over 14,000 ICD-10 codes formatted for Philippine claims adjudication.
- `lib_diagnostic`: 13 accredited diagnostic procedures (`1` = CBC, `2` = Urinalysis, `3` = Fecalysis, `4` = Sputum Microscopy, `5` = FBS, `6` = Lipid Profile, `7` = Chest X-Ray, etc., with `13` = "Others").
- `lib_medicine`: Official Philippine National Formulary (PNF) / GAMOT drug dictionary with standard 30-character concatenated codes (`pDrugCode` composed of 5-char Generic + 5-char Salt + 5-char Strength + 5-char Form + 5-char Unit + 5-char Package).

---

## 5. Interop Hub Architecture & Cross-Service Messaging

ClinicEZ implements an asynchronous, decoupled event-driven architecture using **Interop Hub** (`services/interop-hub/`) and the shared library `packages/shared-dotnet/Interop/`.

### 5.1 The Interop Envelope Contract (`InteropEnvelope.cs`)

Every message crossing service or cell boundaries is encapsulated in a standardized `InteropEnvelope`:

```csharp
public sealed record InteropEnvelope
{
    public Guid MessageId { get; init; } = Guid.NewGuid();
    public Guid CorrelationId { get; init; }
    public string Type { get; init; } = string.Empty;
    public int SchemaVersion { get; init; } = 1;
    public Party From { get; init; } = new();
    public Party To { get; init; } = new();
    public DateTime SentAtUtc { get; init; } = DateTime.UtcNow;
    public DateTime? ExpiresAtUtc { get; init; }
    public JsonElement Payload { get; init; }
    public string? Signature { get; init; }
    public string? SignerKeyId { get; init; }
    public Party? SignedTo { get; init; }
}
```

#### Addressing with `Party` (`Party.cs`):
- `PartyKind`: `Facility`, `Patient`, `ControlPlane`.
- Facilities are addressed by `(TenantId, FacilityId, FacilityType, Service)`.
- Patients are addressed by `PatientId`.
- Hub Mailbox format: `{cellId}:{service}` (e.g., `local:clinic`, `local:patient`, `local:laboratory`, `local:pharmacy`).

### 5.2 Transactional Outbox Pattern
1. Publishing services **never** perform fire-and-forget network calls.
2. `IInteropPublisher.Enqueue<T>(...)` serializes the envelope and inserts an `InteropOutboxMessage` row into the service's relational database within the active business transaction.
3. The message is only committed when `DbContext.SaveChangesAsync()` succeeds.
4. An outbox relay worker pulls unsent messages from `InteropOutbox` and dispatches them via HTTP POST to `interop-hub` at `/v1/messages`.
5. The receiving service's inbox worker pulls messages from `/v1/inbox`, executes the registered handler via `InteropDispatcher`, records idempotency in `InteropInboxMessage`, and acknowledges (`/v1/inbox/ack`).

### 5.3 Existing Topic Catalog (`InteropTypes.cs`) & Gaps for New Features

```
Existing Interop Message Types:
├── Provisioning: facility.license.issued, workspace.profile.updated
├── Appointments: patient.appointment.booked, clinic.appointment.updated
├── Records:      patient.record.shared, patient.share.redeem, patient.document.issued
├── Laboratory:   lab.order.issued, lab.order.status.changed, lab.result.finalized, lab.result.panic
└── Pharmacy:     rx.issued, rx.status.changed, rx.dispensed
```

#### Required New Events:
1. **Immunization Synchronization**:
   - `clinical.immunization.administered`: Published by `clinic-api` upon vaccine administration.
   - Consumed by `patient-api` to update the patient's lifelong immunization record and issue a digital vaccination passport.
2. **Patient Schedule Availability**:
   - Real-time availability query or slot broadcast when doctor schedules change.

---

## 6. EF Core DbContext, Tenancy & Auditing Patterns

### 6.1 Multi-Tenancy Architecture
- Isolated by PostgreSQL schemas (`DbSchema` setting, e.g., `clinic_dashboard`).
- Global query filters applied in `ApplicationDbContext.OnModelCreating`:
  ```csharp
  modelBuilder.Entity<ConsultationEncounter>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
  modelBuilder.Entity<ClinicPatient>().HasQueryFilter(e => !e.IsDeleted && e.ClinicId == CurrentClinicId);
  ```
- Reference tables (e.g., `PhilHealthCatalogItem`) are server-wide and do not filter on `ClinicId`.

### 6.2 Auditing & Soft Deletion
- All clinical entities inherit from `BaseEntity`.
- Soft delete is enforced via query filter `!e.IsDeleted`. Hard delete is blocked unless `entity.AllowHardDelete = true`.
- Concurrency and idempotency are tracked via `IdempotencyRecord` and unique constraint indexes.

---

## 7. Concrete Architecture & Integration Specification for Missing Features

Here is the exact architectural specification for the missing features required by the authoritative user request.

### 7.1 Requirement R1: Doctor Schedule, Rostering & Slot Availability Engine

#### 7.1.1 Problem Statement & Existing Gap
Currently, `Appointment.cs` records only a flat `ScheduledAt` and `DurationMinutes`. There are no doctor shift models, no recurring weekly templates, no break time definitions, no slot interval configurations, no blackout/leave date tracking, and `CreateAppointmentCommandHandler` does zero double-booking or availability validation.

#### 7.1.2 Proposed Domain Entities (`ClinicEz.Clinic.Domain/Entities/`)

```csharp
// 1. DoctorShiftTemplate.cs
namespace ClinicEz.Clinic.Domain.Entities;

public sealed class DoctorShiftTemplate : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid? BranchId { get; set; }
    public Guid DoctorId { get; set; }
    public required string DoctorName { get; set; }

    /// <summary>Day of week: 0 = Sunday, 1 = Monday, ..., 6 = Saturday.</summary>
    public DayOfWeek DayOfWeek { get; set; }

    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }

    /// <summary>Slot interval in minutes: 15, 20, 30, 45, 60.</summary>
    public int SlotDurationMinutes { get; set; } = 30;

    /// <summary>Maximum patients per slot (typically 1 for private, >1 for walk-in clinics).</summary>
    public int MaxPatientsPerSlot { get; set; } = 1;

    public bool IsActive { get; set; } = true;
    public DateOnly EffectiveStartDate { get; set; }
    public DateOnly? EffectiveEndDate { get; set; }

    public ICollection<DoctorShiftBreak> Breaks { get; set; } = new List<DoctorShiftBreak>();
}

// 2. DoctorShiftBreak.cs
public sealed class DoctorShiftBreak : BaseEntity
{
    public Guid ShiftTemplateId { get; set; }
    public DoctorShiftTemplate ShiftTemplate { get; set; } = null!;
    public TimeOnly BreakStartTime { get; set; }
    public TimeOnly BreakEndTime { get; set; }
    public string Description { get; set; } = "Lunch / Recess";
}

// 3. DoctorLeave.cs (Blackout dates)
public sealed class DoctorLeave : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid DoctorId { get; set; }
    public required string DoctorName { get; set; }

    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public TimeOnly? PartialDayStartTime { get; set; }
    public TimeOnly? PartialDayEndTime { get; set; }

    public string Reason { get; set; } = string.Empty;
    public string LeaveType { get; set; } = "Vacation"; // Vacation, Sick, CME, Official
    public bool IsApproved { get; set; } = true;
}
```

#### 7.1.3 Availability Query Engine Algorithm
- Input: `DoctorId`, `Date`, `DurationMinutes`.
- Steps:
  1. Check if `DoctorLeave` overlaps with `Date`. If full-day leave, return 0 available slots.
  2. Locate active `DoctorShiftTemplate` for `Date.DayOfWeek`. If none, return 0 slots.
  3. Generate candidate slot intervals starting from `StartTime` to `EndTime - SlotDurationMinutes`.
  4. Filter out any candidate slot overlapping with `DoctorShiftBreak`.
  5. Query `Appointments` where `DoctorId == request.DoctorId` and date matches, excluding `Status == Cancelled`.
  6. Discard slots where existing appointment count >= `MaxPatientsPerSlot`.
  7. Return available slots list.

---

### 7.2 Requirement R2: PhilHealth-Case1 Compliant Immunization & Vaccine Administration

#### 7.2.1 Problem Statement & Existing Gap
Currently, patient immunization data is trapped inside a non-relational JSON blob in `patient.CustomFields["philhealth_profile"]`. The clinic has no relational entity to record batch/lot tracking, expiry dates, dose numbers, anatomical injection sites, adverse reactions, or healthcare provider credentials.

#### 7.2.2 Proposed Domain Entity (`ClinicEz.Clinic.Domain/Entities/PatientImmunization.cs`)

```csharp
namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientImmunization : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid? BranchId { get; set; }
    public Guid PatientId { get; set; }
    public required string PatientName { get; set; }
    public Guid? ConsultationEncounterId { get; set; }

    // PhilHealth Statutory Coding Alignment
    /// <summary>Target PhilHealth library: lib_immchild, lib_immyoungw, lib_immpregw, lib_immelderly, or OtherImm.</summary>
    public required string PhilHealthLibrary { get; set; }
    
    /// <summary>Statutory code, e.g. "C01" (BCG), "Y01" (HPV), "P01" (TT), "E01" (Pneumo), or "999" (None/Not Given).</summary>
    public required string PhilHealthCode { get; set; }
    public required string VaccineName { get; set; }

    // Clinical Administration Attributes
    public string? BrandName { get; set; }
    public string? Manufacturer { get; set; }
    public required string LotBatchNumber { get; set; }
    public DateOnly ExpirationDate { get; set; }

    public int DoseSequence { get; set; } = 1; // 1 = Dose 1, 2 = Dose 2, 3 = Dose 3, 4 = Booster
    public string Route { get; set; } = "Intramuscular"; // IM, SC, Intradermal, Oral
    public string InjectionSite { get; set; } = "Left Deltoid"; // Left Deltoid, Right Deltoid, Anterolateral Thigh

    public DateTime AdministeredAtUtc { get; set; } = DateTime.UtcNow;
    public Guid AdministeredByStaffId { get; set; }
    public required string AdministeredByStaffName { get; set; }
    public string? AdministeredByPrcLicense { get; set; }

    // Adverse Reaction Tracking
    public string AdverseReactionStatus { get; set; } = "None"; // None, Local, Systemic, Severe
    public string? AdverseReactionRemarks { get; set; }

    // Cross-Service Interop
    public bool IsSynchronizedToPatientApp { get; set; } = false;
    public DateTime? SynchronizedAtUtc { get; set; }
}
```

#### 7.2.3 1:1 Mapping to `YakapClinicalMapper.cs`
In `YakapClinicalMapper.cs`, rather than reading untyped strings from `patient.CustomFields`, the mapper will query `PatientImmunization` entities:
- If records exist: group by `PhilHealthLibrary` and output appropriate `<IMMUNIZATION>` elements (`pChildImmcode`, `pYoungwImmcode`, etc.).
- If zero records exist: emit the statutory fallback element:
  `<IMMUNIZATION pChildImmcode="" pYoungwImmcode="" pPregwImmcode="" pElderlyImmcode="" pOtherImm="999" pReportStatus="U" pDeficiencyRemarks="" />`.

#### 7.2.4 Interop Hub Cross-Service Event Specification
- **Event Type**: `clinical.immunization.administered`
- **Topic**: `InteropTypes.ClinicalImmunizationAdministered`
- **Envelope Payload**:
```csharp
public sealed record ImmunizationAdministeredPayload
{
    public Guid ImmunizationId { get; init; }
    public Guid PatientId { get; init; }
    public string VaccineName { get; init; } = string.Empty;
    public string PhilHealthCode { get; init; } = string.Empty;
    public string PhilHealthLibrary { get; init; } = string.Empty;
    public string LotBatchNumber { get; init; } = string.Empty;
    public DateOnly ExpirationDate { get; init; }
    public int DoseSequence { get; init; }
    public string Route { get; init; } = string.Empty;
    public string InjectionSite { get; init; } = string.Empty;
    public DateTime AdministeredAtUtc { get; init; }
    public string AdministeredByName { get; init; } = string.Empty;
    public string FacilityName { get; init; } = string.Empty;
}
```

---

### 7.3 Requirement R3: Structured Problem List, Allergies & PhilHealth NCD Alignment

#### 7.3.1 Problem Statement & Existing Gap
Currently, `ClinicPatient.cs` stores `Allergies` and `ChronicConditions` as flat comma-separated text strings (`"Penicillin, Aspirin"`). There is no ICD-10 coding on chronic problems, no onset dates, no resolution status, no allergy reaction classification (Drug vs Food vs Environmental), and no structured longitudinal vital sign trend linkage to PhilHealth NCD questions (`<NCDQANS>`).

#### 7.3.2 Proposed Domain Entities (`ClinicEz.Clinic.Domain/Entities/`)

```csharp
// 1. PatientProblem.cs (Structured Problem List)
namespace ClinicEz.Clinic.Domain.Entities;

public sealed class PatientProblem : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid PatientId { get; set; }

    public required string Icd10Code { get; set; }
    public required string ProblemTitle { get; set; }

    public string Status { get; set; } = "Active"; // Active, Resolved, Inactive, RuledOut
    public string Severity { get; set; } = "Moderate"; // Mild, Moderate, Severe

    public DateOnly? OnsetDate { get; set; }
    public DateOnly? ResolvedDate { get; set; }

    /// <summary>Links problem directly to PhilHealth lib_mdiseases code for 1:1 Yakap MEDHIST generation.</summary>
    public string? PhilHealthMdiseaseCode { get; set; }

    public string? ClinicalNotes { get; set; }
    public Guid RecordedByDoctorId { get; set; }
    public required string RecordedByDoctorName { get; set; }
}

// 2. PatientAllergy.cs (Structured Allergies)
public sealed class PatientAllergy : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid PatientId { get; set; }

    public string AllergyType { get; set; } = "Medication"; // Medication, Food, Environmental, Biologic
    public required string Allergen { get; set; } // e.g. "Penicillin G", "Amoxicillin", "Peanuts"
    
    /// <summary>Optional PhilHealth PNF generic drug code if medication allergy.</summary>
    public string? AllergenDrugCode { get; set; }

    public string ReactionSeverity { get; set; } = "Moderate"; // Mild, Moderate, Severe, LifeThreatening/Anaphylaxis
    public string? ReactionManifestation { get; set; } // e.g. "Urticaria, Angioedema, Bronchospasm"

    public string Status { get; set; } = "Active"; // Active, Inactive, Suspected, Refuted
    public DateOnly? OnsetDate { get; set; }
}
```

#### 7.3.3 Integration with PhilHealth NCD (`<NCDQANS>`)
- Longitudinal tracking of Blood Pressure (from `TriageVitals.SystolicBp` & `DiastolicBp`) feeds cardiovascular risk questions (Q9-Q16).
- Fasting Blood Sugar lab orders (`ClinicLabOrder` with FBS analyte) automatically populate `pQid19_Fbsmg`, `pQid19_Fbsmmol`, and `pQid19_Fbsdate`.
- Lipid profile lab orders populate `pQid20_Choleval` and `pQid20_Choledate`.
- Urinalysis lab orders populate `pQid21_Ketonval` and `pQid22_Proteinval`.
- Active problems with ICD-10 `E11` (Type 2 Diabetes) automatically set `pQid5_Ynx="Y"`.
- Active problems with ICD-10 `I20-I25` set `pQid23_Yn="Y"`.
- Active problems with ICD-10 `I60-I69` set `pQid24_Yn="Y"`.

---

### 7.4 Requirement R4: Clinical SOAP Templates, Growth Charts & Yakap Alignment

#### 7.4.1 Problem Statement & Existing Gap
Currently, `Consultations.screen.tsx` offers only plain multiline text inputs for `Subjective`, `Objective`, `Assessment`, and `Plan`. There are no specialty templates, no physical exam checklists, and no WHO pediatric growth chart calculations (weight-for-age, height-for-age, BMI-for-age, head circumference z-scores) that map to PhilHealth's `<PEPERT>` and `<PROFILE>` structures.

#### 7.4.2 Proposed Domain Entities (`ClinicEz.Clinic.Domain/Entities/`)

```csharp
// 1. ClinicalSoapTemplate.cs
namespace ClinicEz.Clinic.Domain.Entities;

public sealed class ClinicalSoapTemplate : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }

    public required string TemplateName { get; set; }
    public string Specialty { get; set; } = "GeneralPractice"; // Pediatrics, OBGYN, InternalMedicine, Cardiology

    public string? SubjectiveTemplate { get; set; }
    public string? ObjectiveTemplate { get; set; }
    public string? AssessmentTemplate { get; set; }
    public string? PlanTemplate { get; set; }

    /// <summary>JSON schema defining structured physical exam checklists and clinical macros.</summary>
    public string? StructuredSectionsJson { get; set; }

    public bool IsDefault { get; set; } = false;
    public bool IsSystemStandard { get; set; } = false;
}

// 2. PediatricGrowthMeasurement.cs
public sealed class PediatricGrowthMeasurement : BaseEntity
{
    public required string TenantId { get; set; }
    public Guid ClinicId { get; set; }
    public Guid PatientId { get; set; }
    public Guid? ConsultationEncounterId { get; set; }

    public DateOnly MeasurementDate { get; set; }
    public int AgeInMonths { get; set; }

    public decimal WeightKg { get; set; }
    public decimal LengthHeightCm { get; set; }
    public decimal? HeadCircumferenceCm { get; set; }
    public decimal? MidUpperArmCircumferenceCm { get; set; }

    // Calculated WHO Metrics
    public decimal WeightForAgeZScore { get; set; }
    public decimal HeightForAgeZScore { get; set; }
    public decimal WeightForHeightZScore { get; set; }
    public decimal BmiForAgeZScore { get; set; }

    public int WeightForAgePercentile { get; set; }
    public int HeightForAgePercentile { get; set; }
    public int BmiForAgePercentile { get; set; }

    /// <summary>Statutory Z-Score categorization string matching PhilHealth lib_zscore.</summary>
    public required string PhilHealthZScoreCategory { get; set; } // Normal, Moderately Wasted, Severely Wasted, Overweight, Obese
}
```

#### 7.4.3 Bi-directional Mapping into PhilHealth `<SOAP>` and `<PROFILE>`
The WHO pediatric metrics map directly into PhilHealth XML attributes:
- `LengthHeightCm` -> `pHeight` & `pLength`
- `WeightKg` -> `pWeight`
- `Bmi` -> `pBMI`
- `HeadCircumferenceCm` -> `pHeadCirc`
- `MidUpperArmCircumferenceCm` -> `pMidUpperArmCirc`
- `PhilHealthZScoreCategory` -> `pZScore`

---

## 8. Summary Matrix & Architecture Checklist

| Requirement | Proposed Entities | MediatR Commands / Queries | Interop Hub Topics | PhilHealth DTD Target |
|---|---|---|---|---|
| **R1. Rostering & Availability** | `DoctorShiftTemplate`, `DoctorShiftBreak`, `DoctorLeave` | `CreateDoctorShiftTemplateCommand`, `GetDoctorAvailableSlotsQuery`, `CreateDoctorLeaveCommand` | N/A (Clinic internal) | Enlistment / Appointment scheduling |
| **R2. Immunization Management** | `PatientImmunization` | `AdministerVaccineCommand`, `GetPatientImmunizationsQuery`, `SyncPatientImmunizationCommand` | `clinical.immunization.administered` | `<IMMUNIZATIONS>` (`lib_immchild`, `lib_immyoungw`, `lib_immpregw`, `lib_immelderly`, `999`) |
| **R3. Problem List & Allergies** | `PatientProblem`, `PatientAllergy` | `AddPatientProblemCommand`, `ResolvePatientProblemCommand`, `AddPatientAllergyCommand` | N/A | `<MEDHISTS>`, `<MHSPECIFICS>`, `<NCDQANS>` (PhilPEN Q1-Q24) |
| **R4. Clinical Templates & Growth Charts** | `ClinicalSoapTemplate`, `PediatricGrowthMeasurement` | `CreateSoapTemplateCommand`, `CalculateGrowthZScoresCommand`, `GetGrowthChartQuery` | N/A | `<SOAP>`, `<PEPERT>`, `<PROFILE>` |

---

## 9. Conclusion

The ClinicEZ backend architecture possesses robust Clean Architecture separation, transactional integrity, and PhilHealth DTD v1.14 plumbing. However, critical clinical domain entities for doctor availability, immunization tracking, structured problem lists, and pediatric growth metrics currently reside only as untyped JSON dictionaries or missing modules.

By formalizing the relational entities, MediatR handlers, and Interop Hub envelopes documented in this report, the platform will achieve complete, rigorous compliance with PhilHealth-case1 Yakap standards with zero risk of schema misalignment or transmittal rejection.
