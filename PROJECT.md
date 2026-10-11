# Project: Clinic EZ Comprehensive Clinic Features & PhilHealth-Case1 Yakap Alignment

## Architecture
Clinic EZ is a multi-tenant clinical workstation and healthcare platform composed of Clean Architecture .NET microservices (`services/clinic-api`, `services/patient-api`, `services/interop-hub`, `services/philhealth-proxy`) backed by PostgreSQL, alongside a cross-platform React Native Expo mobile/tablet application (`apps/clinic-app`).
- **Domain Layer (`ClinicEz.Clinic.Domain`)**: Rich domain aggregates, entities, value objects, and domain events.
- **Application Layer (`ClinicEz.Clinic.Application`)**: CQRS with MediatR, command validators, domain service contracts, transactional outbox message producers.
- **Infrastructure Layer (`ClinicEz.Clinic.Infrastructure`)**: EF Core DbContext, PostgreSQL GiST exclusion constraints (`btree_gist`), multi-tenant query filters (`ClinicId == CurrentClinicId`), sequence generators, statutory seed catalogs.
- **API Layer (`ClinicEz.Clinic.Api`)**: REST API controllers with standard `ApiResponse<T>`, exception middleware mapping PostgreSQL error codes (e.g. 23P01 -> 409 Conflict).
- **Client Layer (`apps/clinic-app`)**: React Native Expo screens, components adhering to `@clinicez/design-tokens` (teal `#0D6963` palette), interactive slot picker, native clinical chart tabs, dual-mode consultation ergonomics.
- **Interop Hub**: Transactional outbox event bus ensuring reliable asynchronous messaging between `clinic-api` and `patient-api` via ECDSA P-256 signed envelopes.
- **Statutory Claims**: Direct relational aggregation in `YakapClinicalMapper.cs` producing 100% compliant XML transmittals verified against `KonsultaData_v1.14.dtd`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Doctor Schedule Templates & Breaks | Recurring weekly shift schedules, break intervals, slot durations (15/30/60m) | M1 | R1 |
| 2 | Doctor Leaves & Blackouts | Blackout leave calendar preventing appointment booking during time-off | M1 | R1 |
| 3 | Slot Availability Engine | Calculation of available booking slots considering shifts, breaks, leaves, and booked appointments | M1 | R1 |
| 4 | PostgreSQL GiST Concurrency Guarding | Database-level double-booking collision prevention with `btree_gist` and `tstzrange` GiST exclusion constraint | M1 | R1 |
| 5 | Scheduling Exception Mapping | PostgreSQL 23P01 exclusion violation mapped to HTTP 409 Conflict | M1 | R1 |
| 6 | SlotPicker & Roster UI Components | React Native Expo SlotPicker and DoctorRosterCalendarModal with teal `#0D6963` styling | M1 | R1 |
| 7 | Relational Patient Surgical History | Clean Architecture `PatientSurgicalHistory` entity replacing untyped JSON CustomFields | M2 | R2 |
| 8 | Relational Patient Social History | Clean Architecture `PatientSocialHistory` entity (tobacco, alcohol) replacing untyped JSON | M2 | R2 |
| 9 | Relational Patient Reproductive History | Clean Architecture `PatientReproductiveHistory` entity replacing untyped JSON | M2 | R2 |
| 10 | Deprecation of PhilHealthProfileModal | Removal of disconnected 1,184-line modal in favor of integrated workspace tabs | M2 | R2 |
| 11 | Native Clinical Chart Tabs | Embedding `ClinicalHistoryTab`, `LifestyleSocialTab`, `ReproductiveHealthTab`, and `CardiometabolicRiskTab` in `Patients.screen.tsx` | M2 | R2 |
| 12 | Extended Triage Vitals | Respiratory Rate (`pRr`), Snellen visual acuity (Left/Right), Head Circumference, MUAC | M2 | R2 |
| 13 | WHO Pediatric Z-Score Calculator | Age-bracket percentile and z-score computation with `"7..9"` typo sanitization and Under-5 boundary checking | M2 | R2 |
| 14 | Dual-Mode Consultation Ergonomics | Complete bifurcation between standard clinical encounters (0% PhilHealth fields) and Konsulta encounters | M3 | R3 |
| 15 | Inline 9-System Physical Exam Card | `InlinePhysicalExamCard.tsx` with 1-click "All Essentially Normal" button and abnormal remarks | M3 | R3 |
| 16 | ATC Header & Doctor PAN Snapshotting | Encounter ATC banner and auto-snapshotting of physician's PhilHealth PAN on signing | M3 | R3 |
| 17 | Statutory Key Auto-Generation | Automatic derivation and linking of `pHciCaseNo`, `pHciTransNo`, `pSoapTransNo`, `pHciAccreNo`, `pPMCCNo` | M3 | R3 |
| 18 | Patient Immunization Entity | Batch/lot tracking, expiration guarding, dose sequence numbers, injection sites, adverse reactions, cold-chain | M4 | R4 |
| 19 | Statutory Vaccine Library Mapping | 1:1 mapping against `lib_immchild`, `lib_immyoungw`, `lib_immpregw`, `lib_immelderly`, `OtherImm` | M4 | R4 |
| 20 | Statutory Immunization Fallback 999 | Fallback code `999` ("None / Not Given") ensuring valid `<!ELEMENT IMMUNIZATIONS (IMMUNIZATION)+>` in DTD v1.14 | M4 | R4 |
| 21 | Immunization Outbox Synchronization | Outbox event `clinical.immunization.administered` published via Interop Hub and ingested by `patient-api` | M4 | R4 |
| 22 | Structured Problem List | `PatientProblem` entity with active/resolved lifecycle, onset dates, ICD-10 and `lib_mdiseases` linkage | M5 | R5 |
| 23 | Structured Patient Allergies | `PatientAllergy` entity with classifications (drug/food/env), reaction manifestations, and anaphylaxis severity flag | M5 | R5 |
| 24 | Enhanced CDS Evaluator | Drug-allergy cross-reactivity (Penicillins to Cephalosporins, Aspirin to NSAIDs) and Drug-Disease Interactions (NSAIDs in PUD/CKD, Beta-blockers in Asthma/COPD) | M5 | R5 |
| 25 | PhilPEN 24-Question Risk Scorer | WHO/ISH Western Pacific Region B 10-year CVD risk score (Bands A-E) with non-laboratory BMI fallback and crisis overrides | M5 | R5 |
| 26 | Relational Yakap Transmittal Aggregation | Updating `YakapClinicalMapper.cs` and commands to query strongly-typed relational repositories | M6 | R6 |
| 27 | DTD v1.14 Automated XML Verification | 100% compliance against `KonsultaData_v1.14.dtd` verified by automated test suites in `ClinicEz.PhilHealthProxy.Tests` and `ClinicEz.Clinic.Application.Tests` | M6 | R6 |
| 28 | Comprehensive E2E Testing Suite | Opaque-box Tier 1-4 tests and adversarial Tier 5 coverage hardening covering all 27 features | M7 | Dual Track |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Doctor Schedule, Rostering & Availability Engine | Features 1-6 (R1: Shift templates, breaks, leaves, btree_gist GiST exclusion, 23P01 mapping, SlotPicker UI) | none | DONE |
| M2 | Native Patient Ingestion & Relational Chart Profiling | Features 7-13 (R2: Relational surgical/social/reproductive/NCD entities, chart tabs, extended triage vitals, WHO Z-scores) | none | DONE |
| M3 | Dual-Mode Consultation Workstation & Inline Physical Exam | Features 14-17 (R3: Standard vs Konsulta ergonomics, 9-system physical exam card, Doctor PAN snapshot, statutory key auto-gen) | M2 | DONE |
| M4 | PhilHealth-Case1 Immunization Management & Interop Hub Synchronization | Features 18-21 (R4: PatientImmunization, statutory libraries, fallback 999, outbox event & patient-api sync) | none | PLANNED |
| M5 | Structured Problem List, Allergies & CDS Decision Support | Features 22-25 (R5: PatientProblem, PatientAllergy, enhanced CDS evaluator with cross-reactivity & DDIs, PhilPEN risk scorer) | M2 | PLANNED |
| M6 | Claims Transmittal Engine & DTD v1.14 Verification | Features 26-27 (R6: YakapClinicalMapper relational migration, 100% KonsultaData_v1.14.dtd compliance) | M2, M4, M5 | PLANNED |
| M7 | Final Milestone: 100% E2E Test Suite Pass & Adversarial Hardening | Feature 28 (Pass 100% E2E test suite Tiers 1-4, then Tier 5 adversarial hardening) | M1, M3, M6 | PLANNED |

## Interface Contracts
### Appointments ↔ Doctor Schedules (M1)
- `ISlotAvailabilityService.GetAvailableSlotsAsync(Guid clinicId, Guid doctorId, DateOnly date, CancellationToken ct)` -> `Task<IReadOnlyList<TimeSlotDto>>`
- `Appointment`: `EndTimeUtc = ScheduledAt.AddMinutes(DurationMinutes)`
- Database constraint: `EXCLUDE USING gist ("ClinicId" WITH =, "DoctorId" WITH =, tstzrange("ScheduledAt", "EndTimeUtc", '[)') WITH &&) WHERE ("Status" != 'Cancelled' AND "IsDeleted" = false AND "DoctorId" IS NOT NULL)`
- Exception handling: Catch `PostgresException { SqlState: "23P01" }`, throw `ConflictException("The selected doctor already has an appointment during this time window.")`.

### Relational Patient Charts ↔ Consultations (M2 ↔ M3)
- `ConsultationEncounter`:
  - `IsYakapEligible: bool`
  - `DoctorPhilHealthPan: string?`
  - `PhilHealthAtc: string?`
  - `HciCaseNo: string?`, `HciTransNo: string?`, `SoapTransNo: string?`
- `InlinePhysicalExamCard`: Emits structured 9-system findings matching PhilHealth `<PEPERT>` elements (`Skin`, `Heent`, `Chest`, `Heart`, `Abdomen`, `Neuro`, `Rectal`, `Gu`, `Musculoskeletal`).

### Immunization ↔ Interop Hub ↔ Patient API (M4)
- Event Topic: `clinical.immunization.administered`
- Envelope: Signed ECDSA P-256 payload with `PatientId`, `ClinicId`, `VaccineCode`, `VaccineName`, `LotNumber`, `DoseNumber`, `AdministeredAtUtc`, `AdministeredByStaffId`.
- Idempotent Ingestion: `ClinicalImmunizationAdministeredInteropHandler` in `services/patient-api` updates `PatientImmunizationSelf` by `InteropMessageId`.
- DTD Fallback: If 0 vaccines recorded for patient, emit `<IMMUNIZATION pOtherImm="999" pVaccineDate="1900-01-01" />`.

### CDS Decision Support ↔ Consultations & Transmittals (M5 ↔ M3 & M6)
- `ICdsEvaluator.EvaluateOrderSafetyAsync(Guid patientId, IReadOnlyList<PrescriptionItemDto> newMedications, CancellationToken ct)` -> `Task<CdsEvaluationResult>`
  - Checks `PatientAllergy` for drug class cross-reactivity (Penicillins <-> Cephalosporins, NSAIDs <-> Aspirin).
  - Checks `PatientProblem` for DDI contraindications (NSAIDs in PUD `K25-K28` / CKD `N18`, Non-selective beta-blockers in Asthma `J45` / COPD `J44`).
- `IPhilPenRiskScorer.CalculateRiskScore(PhilPenAnswersDto answers, TriageVitals vitals)` -> `PhilPenRiskResult { RiskBand: BandA..BandE, ScorePercentage: decimal, OverridesApplied: bool }`.

### Relational Repositories ↔ Yakap Transmittal Engine (M6)
- `IYakapClinicalMapper.MapToYakapReportDocument(ClinicPatient patient, IEnumerable<PatientProblem> problems, IEnumerable<PatientAllergy> allergies, IEnumerable<PatientImmunization> immunizations, NcdRiskAssessment? ncd, IEnumerable<PediatricGrowthMeasurement> growth, ConsultationEncounter encounter, ...)` -> `YakapReportDocument`.
- Output must pass `KonsultaXmlValidator.ValidateReportXml(xml)` against `KonsultaData_v1.14.dtd` with 0 warnings or errors.

## Code Layout
### Backend (`services/clinic-api/`)
- Domain: `ClinicEz.Clinic.Domain/Entities/` (`DoctorScheduleTemplate.cs`, `DoctorBreakTime.cs`, `DoctorLeave.cs`, `PatientSurgicalHistory.cs`, `PatientSocialHistory.cs`, `PatientReproductiveHistory.cs`, `PatientImmunization.cs`, `PatientProblem.cs`, `PatientAllergy.cs`, `NcdRiskAssessment.cs`)
- Persistence: `ClinicEz.Clinic.Infrastructure/Persistence/ApplicationDbContext.cs` & `Configurations/`
- Migrations: `ClinicEz.Clinic.Infrastructure/Migrations/`
- Features: `ClinicEz.Clinic.Application/Features/` (`Schedules/`, `Patients/`, `Consultations/`, `Immunizations/`, `Problems/`, `Allergies/`, `Cds/`, `Yakap/`)
- Controllers: `ClinicEz.Clinic.Api/Controllers/` (`DoctorSchedulesController.cs`, `PatientsController.cs`, `ConsultationsController.cs`, `ImmunizationsController.cs`, `ProblemsController.cs`, `AllergiesController.cs`, `YakapTransmittalController.cs`)

### Frontend (`apps/clinic-app/`)
- Components: `components/roster/SlotPicker.tsx`, `components/roster/DoctorRosterCalendarModal.tsx`, `components/chart/ClinicalHistoryTab.tsx`, `components/chart/LifestyleSocialTab.tsx`, `components/chart/ReproductiveHealthTab.tsx`, `components/chart/CardiometabolicRiskTab.tsx`, `components/consultation/InlinePhysicalExamCard.tsx`
- Navigation/Screens: `navigation/screens/Appointments.screen.tsx`, `navigation/screens/Patients.screen.tsx`, `navigation/screens/Consultations.screen.tsx`
- Services: `services/clinicService.ts`
