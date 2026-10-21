# Original User Request

## 2026-10-09T15:32:01Z

Research the Clinic EZ monorepo architecture and produce a comprehensive, production-ready, full-stack implementation plan and architectural specification for essential missing clinic features (Doctor Rostering & Slot Availability, PhilHealth-Case1 Compliant Immunization & Vaccine Administration, Structured Problem List/NCD Chronic Care, and Clinical SOAP Templates with Pediatric Growth Charts), ensuring all existing and newly planned clinical models strictly align with the PhilHealth-case1 Yakap Data Dictionary Structure for streamlined integration and claims transmittal, with zero source code modifications.

Working directory: c:\Users\User\projects\nextstep\github\clinicez-arch2
Integrity mode: development

## Requirements

### R1. Doctor Schedule, Rostering & Availability Engine
Architect the full-stack design for doctor shift schedules, weekly recurring templates, working hours, break times, slot intervals (e.g., 15m, 30m), leave/blackout dates, real-time slot availability queries, and double-booking conflict prevention integrated into the existing `AppointmentsController` and React Native Expo appointment workflow.

### R2. PhilHealth-Case1 Compliant Immunization & Vaccine Administration Management
Design a clinical immunization module fully compliant with the PhilHealth-case1 Vaccination and Immunization data dictionary and statutory coding libraries (`lib_immchild`, `lib_immyoungw`, `lib_immpregw`, `lib_immelderly`, `OtherImm`, and `999` non-given fallback). Include batch/lot tracking, expiry dates, dose sequences, injection sites, adverse reactions, clinical administration workflow in `clinic-api` and `clinic-app`, and cross-service synchronization with `patient-api` via Interop Hub message envelopes.

### R3. Structured Problem List, Allergies & PhilHealth-Aligned Chronic Care (NCD)
Design an active and resolved patient problem list with ICD-10 coding, onset dates, severity, structured allergies (drug, environmental, food, with reaction severity), and longitudinal vital signs/lab metric tracking (e.g., blood pressure, HbA1c, BMI trends) structured to feed seamlessly into the PhilHealth Konsulta / Yakap NCD Risk Assessment and Profile data dictionary.

### R4. Clinical SOAP Templates, Growth Charts & Yakap Consultation Alignment
Design a customizable clinical note templating engine (specialty SOAP templates, physical exam checklists, clinical macros) alongside WHO pediatric growth chart calculations (weight-for-age, height-for-age, BMI-for-age, head circumference percentiles and z-scores) engineered to map directly into the PhilHealth Yakap `<SOAP>` and `<PROFILE>` XML data structures without data loss.

### R5. Complete Implementation Plan Specification Document
Compile the comprehensive research and design into a detailed technical design document (`docs/plans/comprehensive-clinic-features-plan.md` and planning artifact) including domain entities, EF Core migration schemas, MediatR commands/queries, API endpoints, permissions, Interop Hub event schemas, and Expo frontend component architecture. Strictly produce planning specifications without modifying existing source code files.

## Acceptance Criteria

### PhilHealth-Case1 Yakap Data Dictionary Compliance
- [ ] Immunization domain entities and DTOs map 1:1 to PhilHealth-case1 statutory libraries (`lib_immchild`, `lib_immyoungw`, `lib_immpregw`, `lib_immelderly`, `OtherImm`) with statutory fallback code `999` ("None / Not Given") guaranteeing valid `<IMMUNIZATION+>` generation.
- [ ] Clinical encounter, diagnosis (ICD-10), medication, vitals, and diagnostic test schemas maintain seamless bi-directional mapping with the PhilHealth Yakap Data Dictionary XML schema (`<ENLISTMENT>`, `<PROFILE>`, `<SOAP>`, `<DIAGNOSTIC>`, `<MEDICINE>`), ensuring zero manual reconciliation or schema mismatches during claims transmittal generation in `services/clinic-api/ClinicEz.Clinic.Application/Features/Yakap/Services/YakapClinicalMapper.cs`.

### Architectural Completeness
- [ ] Every requirement (R1-R4) has complete C# entity definitions matching Clean Architecture (`ClinicEz.Clinic.Domain` and EF Core configurations in `ClinicEz.Clinic.Infrastructure`).
- [ ] MediatR commands, queries, validators, and DTO contracts are fully specified for every new endpoint.
- [ ] Interop Hub message envelopes, topics, and handler signatures are defined for cross-service events (e.g., vaccine sync with `patient-api`).
- [ ] Frontend screen layouts, state management hooks, and UI component hierarchies are documented for `apps/clinic-app`.
- [ ] Phased implementation roadmap, dependency graph, and database migration sequencing are explicitly detailed.

### Non-Invasiveness & Integrity
- [ ] Zero source code files in `apps/` or `services/` are modified, deleted, or introduced during this planning task.
- [ ] Verification command `git status --porcelain` confirms no existing source files are touched.

## 2026-10-09T16:33:09Z

Server restarted. Please resume orchestrating the adversarial feedback integration into docs/plans/comprehensive-clinic-features-plan.md (incorporating Challenger 1 and Challenger 2 findings: PostgreSQL btree_gist exclusion constraints, overnight shift handling, PhilHealth DTD v1.14 element sequence, lib_zscore.json 7..9 sanitization & bracket cutoff lookup) and complete the mandatory Sentinel Victory Audit.

## 2026-10-11T11:38:43Z

Execute an autonomous live inter-service smoke test across the microservices stack on remote cloud host 38.54.16.240. Verify end-to-end ECDSA P-256 signed message delivery, routing via Interop Hub, downstream business entity persistence in PostgreSQL, and zero dead-lettering.

Working directory: c:\Users\User\projects\nextstep\github\clinicez-arch2  
Integrity mode: development  

## Environment & Access Credentials
- SSH Host: 38.54.16.240 (user: root)
- SSH Key: C:\Users\User\.gemini\antigravity\brain\7592b2b1-a72e-43ec-8ded-7a41e670765b\scratch\ssh\id_rsa_nopass
  Command example: ssh -i "C:\Users\User\.gemini\antigravity\brain\7592b2b1-a72e-43ec-8ded-7a41e670765b\scratch\ssh\id_rsa_nopass" -o StrictHostKeyChecking=no root@38.54.16.240 "<command>"
- PostgreSQL: docker container postgres (user: db_admin_node)
  Databases: CLINICEZ-INTEROP_DB, CLINICEZ_CLINIC_DB, CLINICEZ_LABORATORY_DB, CLINICEZ-BILLING_DB, CLINICEZ_PATIENT_DB
- Test Tenant ID: 6db50468-e107-4007-b187-5a8d8a0bc525
- Test Clinic Facility ID: 3c8cca56-0e4f-4494-aef0-18f89c736346
- Test Laboratory Facility ID: 556a7871-d4c6-414f-a8b5-2f5dcad3a2fc

## Requirements
### R1. End-to-End Interop Transaction Flow
Execute a synthetic clinical requisition transaction between Clinic (clinic-api) and Laboratory (laboratory-api) through the live cloud interop-hub. The envelope must be signed with the sender's ECDSA P-256 private key, verified by the Hub, routed to the target facility's service mailbox, retrieved by the laboratory inbox poller, and acknowledged with an ACK.

### R2. Downstream Workflow Cascading (Laboratory to Billing)
Upon laboratory requisition ingestion, verify that the subsequent billing invoice request is dispatched through the Hub to billing-api, resulting in a corresponding open invoice in the billing database.

### R3. Safe Autonomous Verification & Zero Regressions
All smoke test transactions must use isolated synthetic test identifiers (SMOKE-TEST-*) within the existing registered test tenant (6db50468-e107-4007-b187-5a8d8a0bc525). The test must run autonomously via SSH on 38.54.16.240 without manual intervention or disruption to existing services.

## Acceptance Criteria
- Interop Hub receives the signed envelope, passes signature verification, and logs 0 authentication or policy challenge errors.
- Message row in interop_hub."Messages" transitions from queued to AckedAtUtc IS NOT NULL within 30 seconds.
- Zero messages enter dead-letter state (DeadLetteredAtUtc IS NULL across all smoke test messages).
- Record created in laboratory_dashboard."LabRequisitions" matching the test correlation GUID and ordering facility ID.
- Record created in billing."Invoices" with status Open linked to the test correlation GUID.
- Container logs for interop-hub, clinic-api, laboratory-api, and billing-api show successful HTTP 200 responses with zero unhandled exceptions.


## 2026-10-11T11:44:17Z

Implement the Comprehensive Clinic Features and PhilHealth-Case1 Yakap Alignment plan in Clinic EZ according to the specifications in docs/plans/comprehensive-clinic-features-plan.md and C:\Users\User\.gemini\antigravity\brain\92dda760-3f73-49db-a5af-e335896e08ab\comprehensive_clinic_features_implementation_plan.md.

Working directory: c:\Users\User\projects\nextstep\github\clinicez-arch2
Integrity mode: development

## Requirements

### R1. Doctor Schedule, Rostering & Availability Engine with Concurrency Guarding
Implement doctor shift templates, working hours, shift breaks, slot intervals (15m, 30m, 60m), and blackout leaves in services/clinic-api. Enforce double-booking collision prevention at the database level using PostgreSQL btree_gist extension and GiST exclusion constraints (EXCLUDE USING gist) over tstzrange with &&. Implement MediatR commands/queries for schedule templates, slot calculation, and DoctorSchedulesController. Build the React Native Expo SlotPicker and DoctorRosterCalendarModal components in apps/clinic-app.

### R2. Native Patient Ingestion & Relational Chart Profiling (Zero Disconnected Modals)
Replace the unstructured JSON blob CustomFields["philhealth_profile"] and deprecate PhilHealthProfileModal.tsx in favor of Clean Architecture relational entities: PatientSurgicalHistory, PatientSocialHistory, PatientReproductiveHistory, and NcdRiskAssessment in ClinicEz.Clinic.Domain and EF Core migrations. Embed native full-width chart workspace tabs in apps/clinic-app/navigation/screens/Patients.screen.tsx (ClinicalHistoryTab, LifestyleSocialTab, ReproductiveHealthTab, and CardiometabolicRiskTab). Extend triage vitals in TriageVitals.cs and TriageModal.tsx to capture Respiratory Rate (pRr), Left/Right Snellen visual acuity, pediatric anthropometrics (Head Circ, MUAC), and WHO Z-score calculations.

### R3. Dual-Mode Consultation Workstation & Inline Physical Exam
Implement dual-mode consultation ergonomics in apps/clinic-app/navigation/screens/Consultations.screen.tsx:
1. Standard clinical encounters (Cash, Private, HMO) must be 100% free of PhilHealth bureaucracy (no ATC prompts, no Case/Trans numbers, no forced statutory questionnaires).
2. PhilHealth Konsulta encounters (IsYakapEligible = true) provide seamless statutory guidance: inline 1-click Physical Exam Checklist (InlinePhysicalExamCard.tsx) with "All Essentially Normal" button and expandable remarks for abnormal findings, encounter ATC header banner, and automated Doctor PAN snapshotting. Behind the scenes, automatically generate and link all statutory keys (pHciCaseNo, pHciTransNo, pSoapTransNo, pHciAccreNo, pPMCCNo).

### R4. PhilHealth-Case1 Immunization Management & Interop Hub Synchronization
Implement PatientImmunization entity with lot/batch tracking, expiry date guarding, dose sequence numbers, injection sites, adverse reactions, and cold-chain logging. Map vaccine administration 1:1 to PhilHealth statutory libraries (lib_immchild, lib_immyoungw, lib_immpregw, lib_immelderly, OtherImm) with statutory fallback 999 ("None / Not Given"). Publish clinical.immunization.administered event envelopes via Interop Hub transactional outbox and synchronize with patient-api.

### R5. Structured Problem List, Allergies & CDS Decision Support
Implement structured PatientProblem with active/resolved lifecycle and ICD-10 coding. Implement structured PatientAllergy (drug, food, environmental) with severity and reaction types. Enhance the Clinical Decision Support (CDS) evaluator with drug-allergy cross-reactivity (e.g. Penicillins to Cephalosporins) and drug-disease interaction (DDI) rules. Implement the PhilPEN 24-question cardiometabolic risk scorer with WHO/ISH cardiovascular risk bands (Bands A through E).

### R6. Claims Transmittal Engine & DTD v1.14 Verification
Update YakapClinicalMapper.cs to aggregate data directly from strongly-typed relational repositories rather than untyped JSON blobs. Validate that generated XML transmittals pass 100% against KonsultaData_v1.14.dtd using automated test suites in ClinicEz.PhilHealthProxy.Tests and ClinicEz.Clinic.Application.Tests.

## Acceptance Criteria

### Doctor Scheduling & Concurrency
- [ ] PostgreSQL migration introduces DoctorScheduleTemplates, DoctorShiftBreaks, and DoctorLeaves with btree_gist GiST exclusion constraint on appointments.
- [ ] Concurrent booking attempts for overlapping slots result in PostgreSQL exclusion violation 23P01, mapped cleanly to HTTP 409 Conflict.
- [ ] React Native Expo SlotPicker dynamically reflects available time slots based on templates, breaks, and existing bookings.

### Native Patient Profiling
- [ ] Relational tables PatientSurgicalHistories, PatientSocialHistories, PatientReproductiveHistories, and NcdRiskAssessments are created with multi-tenant query filters (ClinicId == CurrentClinicId).
- [ ] PhilHealthProfileModal.tsx is deprecated and replaced by native chart tabs (ClinicalHistoryTab, LifestyleSocialTab, ReproductiveHealthTab, CardiometabolicRiskTab) in Patients.screen.tsx.
- [ ] Triage captures Respiratory Rate, Left/Right Snellen visual acuity, and pediatric Z-scores without crashing on missing data.

### Dual-Mode Consultation & Ergonomics
- [ ] Standard clinical consultations display zero PhilHealth fields (no ATC, no case numbers, no PMCC codes).
- [ ] PhilHealth Konsulta consultations display ATC header, auto-snapshot doctor PAN upon signing, and provide a 1-click "All Essentially Normal" 9-system physical exam checklist.
- [ ] Backend auto-generates pHciCaseNo, pHciTransNo, and pSoapTransNo without requiring clinician manual entry.

### Immunization & Interop
- [ ] PatientImmunization records support batch, lot, expiry date, dose sequence, and adverse reaction tracking.
- [ ] Administering a vaccine enqueues a typed clinical.immunization.administered event in InteropOutboxMessages, and patient-api idempotently updates the patient's record.
- [ ] Patients with zero recorded vaccines emit statutory fallback code 999 in <IMMUNIZATION+>, passing DTD validation.

### Decision Support & Claims Verification
- [ ] CDS evaluator blocks or warns on drug-allergy cross-reactivity and contraindications (e.g. non-selective beta-blockers in active asthma).
- [ ] YakapClinicalMapper.cs successfully maps relational entities into KonsultaData_v1.14.dtd compliant XML, verified by automated test harness in ClinicEz.PhilHealthProxy.Tests.
- [ ] All unit and integration test suites compile and pass with zero regressions.
## 2026-10-11T13:39:20Z

Execute comprehensive enhancements across the ClinicEZ monorepo covering database schema alignment (billing-api EF Core migration), frontend CI/CD pipelines (portal-web dev preview workflow and cashier-app), mobile clinical UX improvements (camera QR scanner in facility apps and LAN server switcher), and NuGet advisory remediation.

Working directory: c:\Users\User\projects\nextstep\github\clinicez-arch2  
Integrity mode: development  

## Requirements

### R1. Billing API Schema Alignment & Migration
Generate and commit the official EF Core migration AddBillingFacilityLicenseColumns in services/billing-api/ClinicEz.Billing.Infrastructure adding EntitlementVersion, LicenseToken, PlanTier, and LicenseExpiresAt to billing.billing_facilities. Synchronize ApplicationDbContextModelSnapshot.cs and verify all billing unit tests pass.

### R2. Frontend CI/CD & Preview Deployments
Create .github/workflows/deploy-portal-web-dev.yml targeting Vercel preview deployments on push to development with strict typecheck and lint checks. Configure automated web build verification for apps/cashier-app.

### R3. Mobile Clinical UX Enhancements
- Implement a shared CameraQrScannerModal using expo-camera in apps/clinic-app for scanning patient ClinicEZ IDs and one-time share grant codes in Patients.screen.tsx and ShareImport.screen.tsx.
- Add an Edge Server URL Switcher in the facility settings allowing staff to select between Cloud and Local Edge Cell LAN endpoints.

### R4. Security & Build Integrity
Resolve the NU1903 security advisory for System.Security.Cryptography.Xml. Verify that dotnet build CLINICEZ.sln, dotnet test CLINICEZ.sln, tests/ClinicEz.Interop.E2E, and bun run typecheck:all compile and pass with 0 errors.

## Acceptance Criteria

### Schema & Backend Tests
- New migration file created under services/billing-api/ClinicEz.Billing.Infrastructure/Persistence/Migrations/ and listed in dotnet ef migrations list.
- ApplicationDbContextModelSnapshot.cs contains the four license properties on BillingFacility.
- dotnet test services/billing-api/ClinicEz.Billing.Tests passes with 100% green.

### Workflows & Frontend
- .github/workflows/deploy-portal-web-dev.yml is syntactically valid YAML and includes Vercel preview deployment steps.
- bun run typecheck:all and bun --filter @clinicez/portal-web typecheck pass with 0 errors.
- bun run build:portal succeeds.

### Mobile Components
- Camera QR scanner modal renders with permission handling and camera fallback in apps/clinic-app.
- TypeScript typecheck passes for @clinicez/clinic-app (bun run typecheck:clinic).


## 2026-10-11T17:03:54Z

Redesign and enhance the ClinicEZ EMR Patient Registration, Management, and Full Chart architecture across clinic-app and clinic-api to support high-density glanceable clinical charting, efficient multi-doctor/multi-nurse collaborative workflows, and 100% strict compliance with PhilHealth Konsulta (Yakap) statutory standards.

Working directory: c:\Users\User\projects\nextstep\github\clinicez-arch2
Integrity mode: development

## Requirements

### R1. Patient Registration & Triage Routing (with PhilHealth PIN Validation)
Modernize the patient registration experience in `apps/clinic-app` with real-time debounced duplicate detection (matching PhilHealth PIN, Contact Number, or Name + DOB against `/api/v1/patients`), strict PhilHealth Identification Number formatting (12-digit format `XX-XXXXXXXXX-X` under RA 11223), structured clinical allergy categorization (medication, food, environmental with severity and anaphylaxis flags), and a 1-click "Register & Send to Triage" flow that automatically creates the queue ticket and routes the patient to the nursing triage queue.

### R2. High-Density Glanceable EMR Patient Summary Spine
Implement an always-visible, information-dense clinical patient spine component (`PatientSummarySpine.tsx`) rendered on both the EMR Full Chart and the active Consultation workstation. Within 5 seconds, clinicians can perceive: verified patient demographics, PhilHealth Member/Dependent status with active Case No and ATC badges, Senior/PWD identifiers, high-urgency red alert banners (anaphylactic allergies, fall risk, pregnancy), today's latest triage vitals with color-coded abnormal indicators and WHO pediatric Z-scores, active chronic problem pills, and ongoing active medications.

### R3. Comprehensive EMR Full Chart with 100% PhilHealth Statutory Coverage
Consolidate `PatientChartDto` and `GetPatientChartQueryHandler` in `services/clinic-api` so that problems, allergies, immunizations, and record attachments are returned alongside encounters, vitals, procedures, and lab orders in a single atomic query. Reorganize the EMR Full Chart into a high-density, modular workstation layout that strictly supports all PhilHealth statutory libraries (`lib_*`):
1. Executive Clinical Summary Dashboard (4-quadrant glanceable view of Problems, Allergies, Active Meds, and Vitals/Lab Timeline).
2. Longitudinal SOAP Encounters Timeline (with expandable encounter details, provider filters, and PhilHealth Case/Trans links).
3. Diagnostic Laboratory & Pathology Reports (ClinicEZ orders, critical panic values with readback, and external reports mapped to `lib_diagnostic`).
4. In-Clinic Nursing Procedures (ordered by physicians, executed by nurses with lot numbers, pre/post vitals, and `lib_management` mapping).
5. Statutory Immunizations Card (100% integration with PhilHealth libraries: `lib_immchild` for children 0-17y, `lib_immyoungw` for adolescent/young women, `lib_immpregw` for pregnant women, `lib_immelderly` for senior citizens 60+, with dose sequences and AEFI tracking).
6. Health Profiles (Surgical history, Lifestyle/Social history with smoking pack-years, Reproductive OB-GYN health, and Cardiometabolic NCD risk assessments strictly mapped to `lib_mdiseases` and `lib_ncdq` 24-question survey).
7. External Document Vault (scanned COR, outside films mapped to `lib_chestxray_findings` and `lib_chestxray_observation`, and medical clearances with staff verification audit trail).

### R4. 100% PhilHealth Konsulta (Yakap) Consultation Compliance & DTD Validation
Ensure the Consultation workflow in `apps/clinic-app` and backend services strictly meets PhilHealth Konsulta accreditation rules (`KonsultaData_v1.14.dtd`):
1. **Automated Credential Snapshotting**: Attending Physician's PhilHealth Accreditation Number (PAN), PRC License, PTR, and S2 licenses automatically snapshot upon signing.
2. **Statutory Code Mapping**: 100% compliance mapping for statutory complaints (`lib_signs_symptoms` including mandatory pain site and other complaint descriptions), 9-system physical exam findings (`lib_heent`, `lib_chest`, `lib_heart`, `lib_abdomen`, `lib_genitourinary`, `lib_digital_rectal`, `lib_skin_extremities`, `lib_neuro`, and General Survey), ICD-10 primary/secondary diagnoses (`lib_icd`), and medicines (`lib_medicine`).
3. **Statutory Pre-Flight Validation**: Provide an inline "Yakap Claim Readiness" validator before encounter signing that guarantees 0 missing statutory fields, preventing claim rejections during batch XML generation and transmission.

### R5. Multi-Doctor & Multi-Nurse Workstation Collaboration
Enhance the Queue management and Consultation workstation to support busy clinics with concurrent multi-doctor and multi-nurse teams:
1. Support Station and Room assignment ("Exam Room 1 - Dr. Santos", "Exam Room 2 - Dr. Reyes", "Triage Station A", "Procedure Bay").
2. Multi-provider queue filtering allowing physicians to view "My Room / Assigned", "Waiting for Doctor", or "All Clinic Queue", and nurses to view "Triage Queue" and "Procedure Execution Queue".
3. Closed-loop procedure handoffs: when a doctor orders an in-clinic procedure during consultation (e.g. nebulization, IV therapy, wound dressing, vaccination), the patient can transition to `PendingProcedure` for nurse execution and return to `ReEvaluation` or final doctor signing without prematurely dropping off the active queue.
4. Split-screen workstation layout: on desktop screens ($\ge 1024\text{px}$), the consultation screen displays active SOAP documentation and order entry side-by-side with the patient's longitudinal EMR chart and summary spine, eliminating modal context switching.

## Acceptance Criteria

### Patient Registration & Intake
- [ ] Debounced duplicate detection checks existing records while typing and displays an actionable warning if PhilHealth PIN, Contact Number, or Name + DOB match an existing patient.
- [ ] PhilHealth PIN field validates standard 12-digit format (`XX-XXXXXXXXX-X`) per RA 11223.
- [ ] Structured allergies can be recorded during intake with category (Medication, Food, Environmental) and severity (Mild, Moderate, Severe, LifeThreatening/Anaphylactic), saving as first-class `PatientAllergy` entities.
- [ ] Front-desk staff can register a walk-in patient and route them directly to the triage queue with a single submission action.

### EMR Full Chart & Information Density
- [ ] Persistent `PatientSummarySpine` renders on both the patient chart and active consultation views adhering to `@clinicez/design-tokens` semantic tokens (`emergencyText`, `urgentText`, `warningText`, `primary`).
- [ ] `PatientChartDto` returns consultations, vitals, procedures, lab orders, invoices, problems, allergies, immunizations, and attachments in a single backend roundtrip.
- [ ] Statutory immunization schedule tab displays child (`lib_immchild`), young women (`lib_immyoungw`), pregnant (`lib_immpregw`), and elderly (`lib_immelderly`) vaccines with batch/lot numbers and AEFI tracking.
- [ ] Pediatric anthropometrics displays calculated WHO Z-scores (WAZ, HAZ, WHZ) and PhilHealth Z-score categorization code (`lib_zscore`).
- [ ] NCD Risk Assessment tab strictly adheres to the PhilHealth 24-question survey (`lib_ncdq`) and 10-year CVD risk scoring.

### PhilHealth Konsulta Standard Compliance & DTD Verification
- [ ] All Konsulta encounter fields strictly conform to `KonsultaData_v1.14.dtd` structure and pass pre-flight validation before signing.
- [ ] Attending physician's PhilHealth PAN and PRC license numbers are validated and stored with the encounter record.
- [ ] 9-system physical examination checklist maps directly to PhilHealth physical exam libraries (`lib_heent`, `lib_chest`, etc.) with 1-click "All Normal" and explicit abnormal findings.

### Multi-Provider Queue & Collaboration
- [ ] Queue items support room/station assignment and clinician-specific filtering ("My Room / Assigned" vs "All Clinic Queue").
- [ ] Doctors can order in-clinic nursing procedures or vaccinations during consultation with queue transition to `PendingProcedure` and handoff back to `ReEvaluation`.
- [ ] Consultation screen on widescreen desktop ($\ge 1024\text{px}$) supports side-by-side split view of active SOAP notes and longitudinal chart history.
- [ ] All automated test suites (`dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests` and `bun test apps/clinic-app/tests`) pass with 0 failures.

## 2026-10-12T03:58:40Z

Fix 7 core clinical usability and validation defects across the ClinicEZ EMR workstation in `apps/clinic-app` and `services/clinic-api`: patient demographic editing with missing Sex/Gender fields, long-format age calculation (`Yrs, Months, Weeks, Days`), debounced ICD-10 autocomplete search for structured problems, strict date input validation and bounds constraints, in-chart vaccination administration and historical vaccine modals, resolution of the External Document Vault `documentDate` JSON conversion crash with real file attachments, and integrated personal and family medical history (`lib_mdiseases`).

Working directory: c:\Users\User\projects\nextstep\github\clinicez-arch2
Integrity mode: development

## Requirements

### R1. Patient Demographic Editing & Missing Sex/Gender Field
Add an interactive demographic editing workflow accessible from both the persistent `PatientSummarySpine` and the patient card in `Patients.screen.tsx` that communicates with `PUT /api/v1/patients/{id}`. Restore the missing Sex/Gender input field (`Male`, `Female`, `Other`) in both the `Register Walk-In Patient` modal and the `EditPatientModal`. Allow updating First/Middle/Last Name, Suffix, DOB, Sex, Civil Status, Contact Number, Email, Address, Emergency Contact, PhilHealth PIN, Senior/PWD IDs, Blood Type, and Institutional classification.

### R2. Long-Format Age Calculation & Presentation
Implement a standardized chronological age calculation utility (`formatLongAge`) that computes exact years, months, weeks, and days based on `dateOfBirth` (e.g. `33 yrs, 10 mos, 1 wk, 4 days`, or for infants: `3 mos, 2 wks, 4 days`, or newborns: `12 days`). Display this long-format age consistently across `PatientSummarySpine`, `PatientChartModal` headers, patient registry cards, and consultation headers.

### R3. Debounced Autocomplete ICD-10 Search for Structured Problems
Replace the plain text inputs in the `Record Clinical Problem` modal (`ClinicalHistoryTab.tsx`) with an interactive autocomplete component powered by `clinicService.searchIcd10(q)` (`lib_icd`). When typing an ICD code or diagnosis term (e.g. `I10` or `hypertension`), display matching suggestions; selecting an item automatically fills both `icd10Code` and `problemTitle` with standard PhilHealth terminology.

### R4. Strict Date Input Validation & Constraints
Create and deploy a `<ValidatedDateInput>` component across all clinical date inputs in `apps/clinic-app`. The component must enforce `YYYY-MM-DD` masking, reject non-numeric/malformed text (preventing inputs like `2026-10asaasoalkslak`), validate calendar validity (month 1-12, days per month, leap years), and enforce boundary constraints (disallow future dates for DOB, Onset Date, Surgery Date, LMP, and Document Date; require future/valid dates for vaccine Expiration Date).

### R5. In-Chart Vaccination & Immunization Administration Controls
In `StatutoryImmunizationsTab.tsx`, add prominent `+ Administer Vaccine` and `+ Add Historical Vaccine` action controls. Build `AdministerVaccineModal` supporting PhilHealth cohorts (`lib_immchild`, `lib_immyoungw`, `lib_immpregw`, `lib_immelderly`) with lot/batch number, expiry date, dose sequence, route, site, and administering clinician PRC license. Build `HistoricalVaccineModal` for outside immunizations. Wire both directly to `onAdministerVaccine` and `onRecordHistoricalVaccine` in `PatientChartModal.tsx` and `clinicService`.

### R6. External Document Vault DateOnly Fix & Real File Attachment
Fix the JSON deserialization error in `Patients.screen.tsx` by formatting `documentDate` as a `DateOnly` string (`YYYY-MM-DD`, e.g. `new Date().toISOString().split('T')[0]`) instead of a full ISO timestamp, eliminating the `Path: $.documentDate` crash. Enhance the upload modal with real file picking (PDF, JPEG, PNG) via Expo DocumentPicker / ImagePicker and dispatch to `/records/attachments/upload` multipart endpoint.

### R7. Personal and Family Medical History Integration
In `HealthProfilesTab.tsx` and `ClinicalHistoryTab.tsx`, add interactive statutory personal past medical history and family medical history sections mapped to PhilHealth's `lib_mdiseases`. Clinicians must be able to toggle conditions (Hypertension, Diabetes, Asthma, Cancer, CAD, etc.), record free-text clinical notes, and persist the records via `PUT /api/v1/yakap/patients/{id}/profile`, updating both PhilHealth records and the longitudinal EMR chart.

## Acceptance Criteria

### Demographics & Registration
- [ ] Clinicians can click "Edit Demographics" from `PatientSummarySpine` or the patient card to open `EditPatientModal`.
- [ ] Sex/Gender is selectable (`Male`, `Female`, `Other`) in both registration and demographic edit modals.
- [ ] Updating demographics persists to backend `PUT /api/v1/patients/{id}` and immediately updates the patient list and chart spine.

### Age Display
- [ ] Patient age is rendered in long format (`Yrs, Months, Weeks, Days`) whenever DOB is available.
- [ ] Handles adults, pediatric patients, infants, and edge cases (leap years) accurately.

### Structured Problems & ICD-10 Search
- [ ] Typing in the ICD-10 problem modal displays debounced autocomplete suggestions from `clinicService.searchIcd10`.
- [ ] Selecting a result automatically populates `icd10Code` and `problemTitle`.

### Date Validation
- [ ] Entering invalid text like `2026-10asaasoalkslak` is blocked; input enforces valid `YYYY-MM-DD`.
- [ ] Future dates are rejected for DOB, Onset Date, Surgery Date, and LMP.

### Immunization Controls
- [ ] `StatutoryImmunizationsTab` displays `+ Administer Vaccine` and `+ Add Historical Vaccine` action buttons.
- [ ] Submitting an administered vaccine creates an immunization record with lot/batch, expiry, and PRC license, updating the immunization list.

### Document Vault Upload
- [ ] Attaching an external document submits `documentDate` as `YYYY-MM-DD` and successfully saves with no JSON conversion error.
- [ ] Supports selecting and uploading genuine PDF and image files.

### Medical & Family History
- [ ] `HealthProfilesTab` allows toggling Personal Past Medical History and Family Medical History conditions from `lib_mdiseases`.
- [ ] Saved conditions persist to the PhilHealth profile and reflect on the patient chart.

### Quality Gate
- [ ] All automated test suites (`dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests` and `bun test apps/clinic-app/tests`) pass with 0 failures.
- [ ] Strict design token audit passes with 0 violations (`node apps/clinic-app/scripts/check-tokens.mjs --strict`).
- [ ] TypeScript compilation passes with 0 errors (`bun run typecheck:clinic`).


## 2026-10-12T18:55:51Z

Build an extensible, generic Entity Custom Metadata Engine in ClinicEZ that allows clinic administrators to define, arrange/reorder, and mark custom fields as mandatory/required with conditional visibility rules, cascading dropdown options, and pre-built suggested templates, initially implemented and fully integrated across all Patient intake, registration, and profile touchpoints in accordance with the @clinicez/design-tokens UI/UX standards.

Working directory: c:\Users\User\projects\nextstep\github\clinicez-arch2
Integrity mode: development

## Requirements

### R1. Generic Entity Metadata Engine Architecture
Design a modular, generic metadata layer where custom field definitions are scoped by EntityType (e.g. ClinicPatient today, extensible to ClinicConsultation or ClinicAppointment later). Each field definition must support:
- Machine key (FieldKey), UI label (Label), category (Category), display order (DisplayOrder), mandatory flag (IsRequired), and data types (Text, Number, Date, Boolean, Select).
- Mandatory / Required Rules: Support marking fields as required (IsRequired: true), which is dynamically enforced only when the field is visible on the intake form.
- Ordering & Arrangement: Persistent ordering (DisplayOrder) with a bulk reorder endpoint (PUT /api/v1/custom-fields/reorder) to allow clinic administrators to arrange the visual sequence of fields.
- Conditional Visibility Rules (VisibilityRuleJson): Determines when a field is visible based on answers to either static entity properties (e.g., gender, civilStatus, age) or preceding custom field values (e.g., affiliation == 'Student').
- Conditional Select Options (ConditionalOptionsJson): Enables cascading/dependent dropdowns where available choices are determined by the selected value of a parent field (e.g., selecting College updates Program choices; selecting Campus updates Dormitory choices).
- CRUD operations (Create, Read, Update, Delete, Reorder) and active toggling via API and repository layers without requiring legacy backward-compatibility constraints.

### R2. Clinic Admin Intake Fields Management, Arrangement & Template Library (Settings)
In apps/clinic-app under Settings & Configuration -> Intake Fields, implement an administrative workstation interface adhering to @clinicez/design-tokens:
- Mandatory Toggle: Add a clear switch/toggle in the Add/Edit Field Modal for "Mark field as mandatory / required", reflected by a badge in the list.
- Arranging / Reordering Controls: Up / Down movement controls (or drag arrangement) allowing clinic administrators to intuitively arrange question sequence, saving changes via the reorder API.
- Interactive modal to add/edit custom fields with live rule builder for visibility conditions (parent field selector, operator, expected value) and cascading dropdown options mapper.
- Suggested Common Templates Library: Provide 1-click installable bundles so clinics can immediately adopt standard setups:
  - University / School Clinic Preset (USTP): Affiliation (Student, Employee/Faculty, Dependent, Guest), Student ID (conditional on Student, required), College, Program (cascading on College), Year Level, Employee ID (conditional on Employee, required), Department, Campus Location.
  - Workplace / Corporate Health Preset: Employment Type (Regular, Probationary, Contractor), Department, Employee ID, HMO Provider.
  - General Clinical Demographics Preset: Religion, Mother's Maiden Name, Spouse Information (conditional on Civil Status = Married).

### R3. Dynamic Patient Intake & Registration Form Integration
Refactor the patient registration and editing flows to replace hardcoded silos with a reactive DynamicCustomFieldsRenderer:
- Render fields strictly in their configured DisplayOrder so conditional rules flow logically (e.g., asking Affiliation first, then dependent details).
- Display a red asterisk * for mandatory fields.
- Defensive Validation: Form submission must validate that any visible custom field marked as isRequired is not left blank, highlighting the field with error messaging if omitted.
- Render appropriate UI components for each data type (Input, ValidatedDateInput, SegmentedControl/Toggle for Boolean, and dynamic Select pills/dropdowns).
- Dynamically evaluate visibility rules in real-time as the user fills in the form.
- Dynamically derive cascading choices for dependent select fields.
- Cleanly reset/strip values of hidden fields so invisible data is not erroneously persisted or validated.
- Persist custom metadata uniformly into ClinicPatient.CustomFields dictionary.
- Ensure integration across:
  - Patient Registration modal in apps/clinic-app/navigation/screens/Patients.screen.tsx
  - Patient Edit modal in apps/clinic-app/components/patient/EditPatientModal.tsx
  - Patient detail / longitudinal chart view in apps/clinic-app
  - Public Student Intake portal in apps/portal-web/src/app/student-intake/[tenantSlug]/StudentIntakeClient.tsx

### R4. UI/UX Design System Compliance (clinicez-ui-ux-expert)
Every modified and newly created UI screen and component must strictly comply with the clinicez-ui-ux-expert guidelines:
- Strictly consume semantic tokens from @clinicez/design-tokens (lightColors.primary #0D6963, lightColors.border, semantic typography scales, radii, and spacing). No raw hex codes or direct imports from palette.ts.
- Explicitly implement all 4 core UX states: Loading (structural Skeletons), Empty (illustration/icon + clear CTA), Error (actionable message + retry), and Active/Success (toast feedback).
- Responsive workstation density supporting desktop workstation (>=1024px), tablet (768px-1023px), and mobile viewports.

## Acceptance Criteria

### Schema & Backend API
- [ ] Backend tests for custom field CRUD, IsRequired persistence, and bulk reorder (PUT /api/v1/custom-fields/reorder) pass.
- [ ] Query returns fields sorted deterministically by DisplayOrder.
- [ ] Template installation endpoint successfully persists the University / School Clinic bundle with correct condition, display order, required flags, and cascading mappings.
- [ ] Patient registration and update commands correctly accept and persist dynamic custom field dictionaries.

### Conditional Evaluation, Validation & Cascading Logic
- [ ] Fields render in the exact sequence specified by DisplayOrder.
- [ ] Required fields (isRequired: true) display a mandatory asterisk * and block form submission with an inline validation alert if visible but empty.
- [ ] If a required field is currently hidden due to an unmet condition, it does NOT block form submission.
- [ ] A custom field configured with a static condition (e.g. gender == 'Female') is visible only when the condition is met, and immediately hides when the condition ceases to hold.
- [ ] A custom field configured with a custom field condition (e.g. affiliation == 'Student') is visible only when affiliation is set to Student.
- [ ] A cascading select field dynamically updates its available options when the parent field value changes, and gracefully handles unknown or unselected parent values.
- [ ] Hidden fields do not pollute or submit stale data to the backend.

### User Interface & Token Standards
- [ ] Settings modal includes an explicit toggle for "Mark field as mandatory / required", and the list displays Required vs Optional badges.
- [ ] Settings tab displays custom fields categorized clearly, with Move Up / Move Down reordering controls and badges indicating condition rules and cascading dependencies.
- [ ] Admin modal allows adding, editing, and deleting fields, with visual preview of condition and cascading options.
- [ ] Suggested template library allows 1-click installation of the University Preset into the clinic's active custom fields.
- [ ] Patient registration, edit modal, and patient chart display custom fields reactively and cleanly in configured order with inline validation.
- [ ] bun test packages/design-tokens/src/tokens.test.ts passes with 0 failures, and no forbidden raw hex color literals exist in touched frontend files.


## 2026-10-12T21:00:58Z

Implement structured error handling and contextual cause resolution across ClinicEZ backend services and frontend applications, eliminating raw database/ORM leaks and providing clear, actionable error feedback to clinicians and clinic staff.

Working directory: c:\Users\User\projects\nextstep\github\clinicez-arch2
Integrity mode: development

## Requirements

### R1. Database Exception Translation & Structured Error Responses
Intercept unhandled database exceptions (including PostgreSQL unique constraint violations, string data right truncation, foreign key violations, not-null violations, and EF Core concurrency conflicts) within the shared .NET pipeline (`packages/shared-dotnet`). Map these exceptions to standardized HTTP status codes (HTTP 409 Conflict for unique and concurrency conflicts, HTTP 400 Bad Request for truncation and missing fields, HTTP 500 for general database errors) and structured response payloads containing `errorCode`, `traceId`, a user-friendly `message`, and `errors` array with field attribution. Never leak raw internal ORM exception strings (such as *"An error occurred while saving the entity changes. See the inner exception for details."*) to clients.

### R2. Database Sequence & Validation Hardening
Harden patient code generation in `services/clinic-api` (`RegisterClinicPatientCommand`, `BulkRegisterClinicPatientsCommand`, and `PublicStudentSelfEnrollCommand`) to query the maximum existing sequence number ignoring soft-delete query filters, preventing duplicate code collisions (`23505`). Enforce maximum length validation (255 characters) on `ChiefComplaint` in `CheckInPatientCommandValidator` and sanitize inputs before saving to prevent string truncation exceptions (`22001`).

### R3. Shared TypeScript Contract & Error Client Sanitization
Extend the shared TypeScript API layer (`packages/shared-ts`) so `ApiResponse` and `ApiError` carry `errorCode`, `traceId`, and field-specific errors with a helper method to retrieve errors by field name. Implement a client-side safety net in `extractApiError` that sanitizes any legacy or untranslated ORM error strings into user-friendly messages with support reference IDs.

### R4. Contextual UI Feedback & Workstation Form Attribution
Update `apps/clinic-app` feedback components (`FeedbackHost`, `notify.error`) to support structured error payloads, extend error toast duration to 10 seconds with an explicit dismiss button and a "Copy Ref ID" action. In patient registration and demographic edit modals, bind returned field errors directly to form inputs so input fields display error borders and captions.

## Acceptance Criteria

### Backend Translation & Response Verification
- [ ] Database exception translator accurately maps PostgreSQL error code `23505` to HTTP 409 with `DUPLICATE_RESOURCE` or `DUPLICATE_PATIENT_CODE` and field attribution.
- [ ] Database exception translator maps PostgreSQL error code `22001` to HTTP 400 with `FIELD_TOO_LONG` and field attribution.
- [ ] Database exception translator maps `DbUpdateConcurrencyException` to HTTP 409 with `CONCURRENCY_CONFLICT`.
- [ ] `GlobalExceptionHandler` logs full exception details and stack traces with `traceId` on the server and attaches `traceId` to the response.
- [ ] `packages/shared-dotnet.Tests` has automated test coverage for exception translation and passes via `dotnet test`.

### Sequence & Validation Verification
- [ ] Patient code generation does not collide when soft-deleted patients exist in the clinic.
- [ ] `CheckInPatientCommandValidator` rejects `ChiefComplaint` exceeding 255 characters with HTTP 400.
- [ ] `services/clinic-api` tests pass via `dotnet test`.

### Frontend & Client Verification
- [ ] `packages/shared-ts` extracts `errorCode`, `traceId`, and field errors correctly into `ApiError`.
- [ ] Client-side safety net intercepts raw strings matching `"An error occurred while saving the entity changes"` and formats them with reference IDs.
- [ ] Automated tests in `packages/shared-ts` pass via `pnpm --filter @clinicez/shared-ts test`.
- [ ] `apps/clinic-app` builds cleanly and renders field error states and copyable trace IDs in toasts.


## 2026-10-12T21:01:17Z

This is a single self-contained fix; keep it small and focused.

Refine and elevate the 3 Medical Chart workstation layouts (Centered Modal, Split-Pane Workstation, Slide-Over Drawer) in `apps/clinic-app` to:
1. Fix the critical layout reset bug where clicking any tab reverts the user's active layout back to the default setting.
2. Fully restore the authentic padding, margins, spacing, and surface backgrounds of the default Centered Modal layout.
3. Normalize viewport padding across all 7 chart tabs (eliminating tab edge touching and double-padding).
4. Remove double-plus `+ +` strings from action buttons and fix MRN line-wrapping in Split-Pane.

Working directory: c:\Users\User\projects\nextstep\github\clinicez-arch2
Integrity mode: development

## Requirements

### R1. Fix Layout Reset Bug on Tab Navigation
In `PatientChartModal.tsx`, decouple `activeLayout` from `activeTabProp`. Use a transition ref so `setActiveLayout(configuredLayout)` only executes when `visible` transitions from `false` to `true` or when `configuredLayout` changes. Clinician layout choice must persist across all 7 tabs during the consultation.

### R2. Restore Default Centered Modal Padding, Margins & Backgrounds
Restore the original styling in `CenteredModalChartLayout.tsx`:
- `header`: `paddingHorizontal: theme.spacing.xl`, `paddingVertical: theme.spacing.md`, `backgroundColor: theme.colors.surfaceSubtle`, `borderBottomColor: theme.colors.borderLight`.
- `spineWrapper`: `paddingHorizontal: theme.spacing.xl`, `paddingTop: theme.spacing.sm`, `paddingBottom: theme.spacing.xs`, `backgroundColor: theme.colors.surface`, `borderBottomColor: theme.colors.borderLight`.
- `tabBarContainer`: `paddingHorizontal: theme.spacing.xl`, `paddingVertical: theme.spacing.xs`, `backgroundColor: theme.colors.surfaceSubtle`, `borderBottomColor: theme.colors.borderLight`.
- `viewport`: `flex: 1`, `minHeight: 0`, `paddingHorizontal: theme.spacing.xl`, `paddingVertical: theme.spacing.md`, `backgroundColor: theme.colors.surface`.
- Modal dimensions: `maxWidth: 1400`, `width: '95%'`, `height: '92%'`, `...theme.shadows.lg`.

### R3. Harmonize Padding & Margins in Slide-Over Drawer & Split-Pane
- In `SlideOverDrawerChartLayout.tsx`, provide balanced workstation padding (`paddingHorizontal: theme.spacing.lg`, `paddingVertical: theme.spacing.md`, `backgroundColor: theme.colors.surface`) on the viewport, and slim header bar padding (`paddingVertical: theme.spacing.sm`).
- In `SplitPaneChartLayout.tsx`, set canvas viewport to `paddingHorizontal: theme.spacing.xl`, `paddingVertical: theme.spacing.md`, `backgroundColor: theme.colors.surface`.

### R4. Normalize Tab Content Padding
In `StatutoryImmunizationsTab.tsx`, update `contentContainerStyle` to `paddingBottom: theme.spacing.lg, gap: theme.spacing.md` (removing redundant internal `padding: theme.spacing.xl`), ensuring perfect visual alignment with `ExecutiveSummaryTab`, `EncountersTimelineTab`, `DiagnosticLabTab`, etc.

### R5. Button Label & Line-Wrapping Polish
- Remove literal `+ ` prefixes from button titles in `StatutoryImmunizationsTab.tsx` (`"Administer Vaccine"`, `"Add Historical Vaccine"`).
- Restructure the patient identity block in `SplitPaneChartLayout.tsx` to stack MRN, PHIC, and demographics into non-breaking key-value rows.

## Acceptance Criteria

### Bug Fixes & UX Behaviors
- [ ] Switching between any of the 7 tabs (`Summary`, `Encounters`, `Diagnostics`, `Procedures`, `Vaccines`, `Health Profiles`, `Doc Vault`) NEVER resets the active layout mode back to default.
- [ ] The default Centered Modal layout matches its original padding (24px horizontal, 16px vertical), surface backgrounds, and clean visual borders.
- [ ] Tab content in `ExecutiveSummaryTab`, `EncountersTimelineTab`, `DiagnosticLabTab`, `StatutoryImmunizationsTab`, `NursingProceduresTab`, `HealthProfilesTab`, and `ExternalDocumentVaultTab` renders with consistent, non-zero padding across all layouts without edge clipping or double-padding.
- [ ] No double-plus `+ +` strings appear on any action button in the Medical Chart.
- [ ] Patient MRN / Code never breaks across lines in the Split-Pane left sidebar rail.
- [ ] Zero raw hex codes in any modified `.tsx` file; 100% compliance with `@clinicez-design-tokens` verified by `bun run lint:clinic`.

### Quality Verification & Builds
- [ ] All `apps/clinic-app` unit & integration tests pass cleanly (`bun test apps/clinic-app/tests`).
- [ ] TypeScript check passes with zero errors (`bun run typecheck:clinic`).
- [ ] Production web bundle exports without build errors (`bun run build:web` in `apps/clinic-app`).


## 2026-10-13T03:16:03Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: Full team

Implement the Secured Clinic Join Link (`/join/[tenantSlug]/[facilitySlug]`), asynchronously relayed via the Interop Hub (`patient.join.requested`) with external document quarantine, clinic administrator Join Code configuration with expiration, PhilHealth Member Type integration, and complete removal of the legacy `/student-intake` route.

Working directory: c:\Users\User\projects\nextstep\github\clinicez-arch2
Integrity mode: development

## Requirements

### R1. Secured Join Link Route & Facility Pre-Selection
Construct the public `/join/[tenantSlug]/[facilitySlug]` route in `apps/portal-web` that pre-selects and locks the destination clinic facility, alongside a `/join/[tenantSlug]` route that provides an intuitive campus/branch selector for multi-facility tenants. Completely remove the legacy `/student-intake/[tenantSlug]` route and associated files without redirection.

### R2. Interop Hub Asynchronous Relay & Zero Technical Debt
Replace all synchronous proxying with the platform's standard Interop Hub backbone. Submissions from `/join` must enqueue an envelope (`patient.join.requested`) from `Party.Portal` to `Party.ForFacility(Clinic)` via `IInteropPublisher`. The clinic facility must process this message asynchronously via an idempotent `IInteropHandler<PatientJoinRequestedPayload>`.

### R3. External Document Review Quarantine
Allow patients to attach outside diagnostic files (X-Rays, lab results, medical certificates) during registration. The clinic handler must persist these attachments in `ClinicRecordAttachments` under `VerificationStatus = "PendingVerification"`, enabling clinic staff in `clinic-app` to review and approve/reject them.

### R4. Administrator Join Code & Expiration Configuration
In `apps/clinic-app`, provide a settings card allowing clinic administrators to toggle join link availability, set an alphanumeric Join Code (or generate one), configure expiration windows (24h, 7d, 30d, custom date, or never), and display a printable reception QR code containing `?code=...`. The public join form must gate registration behind this code, enforcing valid, unexpired entry.

### R5. Clinical Form Realignment & PhilHealth Member Type Integration
Realign the join form to match the clinical workstation's patient registration modal (`Patients.screen.tsx`), supporting demographics, PhilHealth PIN with Mod-11 validation, Senior/PWD IDs, dynamic custom fields with real-time condition evaluation and cascading choices, structured allergies, medical history, and reason for visit. Add a PhilHealth Member Type selector (`Member (MM)` vs `Dependent (DD)` with principal member credentials when `DD`) across both the clinic-app registration modal and the public `/join` form.

### R6. Design System Compliance (`clinicez-ui-ux-expert`)
All modified and newly created UI screens in `portal-web` and `clinic-app` must strictly consume semantic tokens from `@clinicez/design-tokens` (Teal `#0D6963` primary, semantic borders, radii, typography) and explicitly implement all 4 core UX states (Skeleton loading, Empty, Error with retry, Active/Success digital pass) with full mobile and desktop responsiveness.

## Acceptance Criteria

### Interop Hub & Backend Ingestion
- [ ] `InteropTypes.PatientJoinRequested` and contract payloads are registered and compile cleanly in `packages/shared-dotnet`.
- [ ] Submitting the public join form enqueues `patient.join.requested` to the Interop Hub without direct synchronous HTTP calls to `clinic-api`.
- [ ] `PatientJoinRequestedHandler` in `clinic-api` idempotently creates `ClinicPatient`, assigns `ClinicId`, records custom fields and allergies, and enqueues a `QueueToken`.
- [ ] External document attachments are persisted with `VerificationStatus = "PendingVerification"`.

### Join Code Security & Expiration
- [ ] Clinic administrators can configure `JoinCode`, `JoinCodeExpiresAt`, and `IsJoinEnabled` from `clinic-app` settings.
- [ ] Public `/join` blocks access when the code is expired or invalid, displaying an actionable error.
- [ ] Opening `/join/.../?code=<validCode>` unlocks the registration form.

### Route & Form Experience
- [ ] `/student-intake/[tenantSlug]` is completely removed from `apps/portal-web`.
- [ ] Accessing `/join/[tenantSlug]/[facilitySlug]` pre-selects the clinic facility.
- [ ] PhilHealth Member Type (`MM` vs `DD`) is selectable in both `Patients.screen.tsx` and the public `/join` form, with principal credentials displayed when `DD`.
- [ ] Successful submission renders a digital registration pass with a queue token (e.g. `Q-105`), patient code, and scannable QR ticket.

### Build & Verification
- [ ] `bun test packages/design-tokens/src/tokens.test.ts` passes with 0 failures.
- [ ] `bun --cwd apps/portal-web run build` passes with 0 type or lint errors.
- [ ] `dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj` passes.

## 2026-10-13T06:40:47Z

This is a single self-contained fix; keep it small and focused.

Refactor the ClinicEZ patient unique identifier (`PAT-`) generation in `services/clinic-api` into a centralized, atomic $O(1)$ collision-resistant sequence generator service with optimistic retry handling and standardized external intake prefixes (`PAT-EXT-`).

Working directory: c:\Users\User\projects\nextstep\github\clinicez-arch2
Integrity mode: development

## Requirements

### R1. Centralized Sequence Generator Service
Provide an atomic sequence generation service (`IPatientCodeGenerator`) in the clinic API that replaces duplicated in-memory table scans across `RegisterClinicPatientCommand`, `BulkRegisterClinicPatientsCommand`, and `PublicStudentSelfEnrollCommand`.

### R2. Atomic Sequence Tracker & O(1) Allocation
Implement a persistent sequence tracker entity and database table scoped to clinic and year. Single patient intake and batch allocations must query only the tracker, supporting contiguous reservations without scanning existing patient rows.

### R3. Concurrency Protection & Optimistic Retries
Ensure concurrent intake requests cannot fail with unhandled database unique constraint collisions on `(TenantId, ClinicId, PatientCode)`. Wrap persistence with an optimistic retry mechanism that attempts allocation with the next sequence up to 3 times before erroring.

### R4. Standardized Interop External Intake Prefix
Update external auto-provisioning intake handlers (`AppointmentBookedHandler` and `PatientShareSnapshotHandler`) to use a dedicated external prefix `PAT-EXT-{yyyyMMdd}-{GUID_SHORT}` so unverified external intake is immediately distinct from clinic front-desk verified records.

### R5. Test Verification & Zero Regressions
Verify all changes with automated unit and integration tests, including concurrent intake simulation and full regression coverage of `ClinicEz.Clinic.Application.Tests`.

## Acceptance Criteria

### Scalability
- [ ] No in-memory scans (`ToListAsync()` of all patient codes for a clinic/year) occur during patient registration.
- [ ] Bulk registration of $K$ patients allocates a continuous range in a single sequence tracker operation.

### Concurrency & Data Integrity
- [ ] Parallel concurrent registrations (e.g. 10 simultaneous registration tasks) complete successfully without unhandled unique constraint violations (`23505` / `DbUpdateException`).
- [ ] Sequence tracker initializes smoothly from pre-existing maximum numeric patient codes when existing records are present.

### Pattern Adherence
- [ ] Front-desk patient intake, bulk registration, and student self-enrollment generate `PAT-{YYYY}-{NNNNN}` with 5-digit zero-padding.
- [ ] External Interop auto-provisioned intake generates `PAT-EXT-{yyyyMMdd}-{GUID_SHORT}`.

### Automated Test Passing
- [ ] `dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "PatientCodeSequence"` passes with 0 failures.
- [ ] All tests in `ClinicEz.Clinic.Application.Tests` build and pass.


## 2026-10-13T06:46:20Z

Deliver a robust Outpatient Department (OPD) Queue Management System for ClinicEZ that prevents duplicate tickets, blocks check-in spam, enforces active queue uniqueness, introduces complete absence and hold controls (No-Show, On Hold, Cancel/Walkout, Re-activate), and establishes an automated visit completion lifecycle.

Working directory: c:\Users\User\projects\nextstep\github\clinicez-arch2
Integrity mode: development

## Requirements

### R1. Active Queue Guardrail & Anti-Spam Check-In
Enforce active queue uniqueness per patient per clinic day.
- Prevent duplicate active queue tickets for the same patient on the same day (`Waiting`, `Triaged`, `InConsultation`, `PendingProcedure`, `ReEvaluation`, `OnHold`). If a patient already has an active ticket, reject duplicate check-in with a conflict response containing the existing ticket reference.
- Allow checking in for a second distinct visit if the patient's previous ticket today is already in a terminal state (`Completed`, `Cancelled`, `NoShow`).
- Prevent rapid double-click submissions in front desk workstations (`Patients.screen.tsx`, `Appointments.screen.tsx`) via client debouncing and immediate loading state. Display an alert modal showing the current ticket details when a patient is already in line.

### R2. Absence & Queue Exception Controls (No-Show, On Hold, Cancel, Re-activate)
Provide reception and clinical staff with direct queue management controls on the Dashboard.
- **Mark No-Show**: Transition unresponsive patients to `NoShow`, recording the departure timestamp and removing them from active waiting lists.
- **Put On Hold (Skip)**: Move a patient who is temporarily away (restroom, lab, cafeteria) to `OnHold` status so the queue can advance.
- **Cancel Visit (LWBS)**: Cancel a ticket if the patient leaves without being seen.
- **Re-activate**: Allow staff to restore a ticket from `OnHold` or `NoShow` back to `Waiting` at the top of the line without re-registering.
- Add corresponding filter views and visual badges on the Dashboard card for each status.

### R3. Queue Metrics Integrity & Lifecycle Auto-Closure
Ensure clinic operational metrics and encounters reflect actual patient flow.
- Exclude `Cancelled` and `NoShow` tickets from average wait time KPI calculations.
- Display a prominent warning tag for any patient waiting longer than 60 minutes.
- Ensure that completing/signing an encounter in `Consultations.screen.tsx` reliably marks the corresponding queue ticket as `Completed`.

## Acceptance Criteria

### Duplicate Prevention & Anti-Spam
- [ ] Attempting to check in a patient who already has an active ticket returns HTTP 409 Conflict with the existing ticket ID and status.
- [ ] Attempting to check in a patient whose previous ticket today is `Completed` succeeds and generates a new ticket.
- [ ] The workstation UI displays a clear modal: "Patient [Name] is already checked in as [TicketNumber] ([Status])" instead of creating a second ticket.
- [ ] Rapid repeated clicks on check-in buttons create only a single ticket.

### Absence & Queue Controls
- [ ] Calling `POST /api/v1/queue/{id}/no-show` marks the ticket status as `NoShow` and records `CompletedTime`.
- [ ] Calling `POST /api/v1/queue/{id}/hold` marks the ticket status as `OnHold`.
- [ ] Calling `POST /api/v1/queue/{id}/reactivate` restores an `OnHold` or `NoShow` ticket back to `Waiting`.
- [ ] Calling `POST /api/v1/queue/{id}/cancel` marks the ticket status as `Cancelled`.
- [ ] Dashboard cards provide direct action buttons for No-Show, On Hold, and Cancel.
- [ ] Segmented filter tabs on the Dashboard allow filtering by `On hold` and `No show`.

### Analytics & Workflow Integrity
- [ ] `GetQueueMetrics` excludes cancelled and no-show tickets from the average wait time computation.
- [ ] Patients waiting > 60 minutes display a `Waiting > 60m` warning badge.
- [ ] Signing a consultation in `Consultations.screen.tsx` transitions the queue ticket to `Completed`.
- [ ] All new and modified backend commands have unit tests in `ClinicEz.Clinic.Application.Tests` and pass cleanly.


## 2026-10-13T11:39:58Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: Full team

Implement Progressive Patient Account Claiming (Option A) across the ClinicEZ ecosystem: enable patients who register via the public secured join link (`/join/{code}`) to effortlessly convert their guest intake registration into a persistent ClinicEZ Patient Account (`patient-app` / PHR) without retyping their demographics, PhilHealth credentials, or allergies. Implement platform settings for configurable claim token expiration (default 48h) and App Store / Google Play links, automated email confirmation delivery (no SMS), fast-track onboarding for existing ClinicEZ users, and a robust multi-identity conflict resolution engine (family/dependent proxies, alternate email linking, and medical privacy guardrails) strictly compliant with `@clinicez/design-tokens` (Teal `#0D6963`) and the Philippine Data Privacy Act (RA 10173).

Working directory: c:\Users\User\projects\nextstep\github\clinicez-arch2
Integrity mode: development

## Requirements

### R1. Progressive Account Claim Card & Digital Pass UI (`clinicez-ui-ux-expert`)
On the Digital Registration Pass screen (`DigitalPassCard.tsx`) in `apps/portal-web`, render an engaging, high-trust Progressive Account Claim Card directly below the queue ticket:
- Surface key patient benefits: real-time queue call notifications, access to digital e-prescriptions & lab results, and 1-click check-in at all ClinicEZ facilities without retyping.
- Provide a primary "Claim My Patient Account in 1-Click" action button styled with `@clinicez/design-tokens` primary Teal (`#0D6963`), supporting all 4 core UI states (loading skeleton, empty, error with retry, and active/success pass).
- Render downloadable mobile badges for Apple App Store and Google Play Store, dynamically populated from platform settings.
- Automatically hide the claim card during print mode (`@media print`).

### R2. Existing User Fast-Track & Web Autofill
- On the `/join/{code}` web form, provide a prominent "Already have a ClinicEZ account? Sign in to Autofill" action that uses Clerk authentication to pre-populate all form fields (demographics, PhilHealth PIN, contact info, allergies) from the patient's existing `patient-api` profile.
- Support Universal Link / Deep Link handling (`clinicez://join/{code}`) so opening a join link or scanning the reception placard on a device with `patient-app` installed triggers a 1-Tap Fast Check-In modal (`"Check in at [Facility] as [User]"`), bypassing manual entry.
- When an existing user claims an account from a guest submission, the backend must enroll their existing `PatientId` into the clinic's `ClinicMembership` and display their active queue token (`Q-105`) on their home screen without creating a duplicate `Patient` profile.

### R3. Multi-Identity Conflict Resolution Engine
In `patient-api` and `portal-web`, handle identity divergence safely during the claim process:
- **Parent / Dependent Proxy**: When an authenticated parent claims an intake pass for a minor or PhilHealth dependent (`DD`), provide an option to create a managed dependent profile under the parent's account, preventing email and identity collisions.
- **Alternate Email Linking**: When name and date of birth match an existing user but the email differs (e.g. work vs. personal), prompt the user to link the clinic record to their authenticated personal account without creating an orphaned record.
- **Medical Privacy Guardrail**: When an authenticated adult attempts to claim a registration pass belonging to an unrelated adult, block merging with an actionable warning ("For medical privacy, foreign health records cannot be merged into your personal account") and provide options to sign out or add as an authorized legal ward.

### R4. Cryptographically Signed Claim Tokens & Platform Settings
- Implement `ClaimTokenService` in `packages/shared-dotnet` utilizing HMAC-SHA256 (or AES-GCM) with tamper detection, encoding `JoinRequestId`, `TenantSlug`, `FacilitySlug`, `Email`, `FirstName`, `LastName`, `DateOfBirth`, `MemberType`, and `ExpiresAt`.
- Integrate `JoinClaim:TtlHours` (defaulting to 48 hours) into `SystemSettingsService` in `portal-api`, allowing platform administrators to adjust the claim token validity window.
- Store configurable store links in `SystemSettingsService` (`PatientApp:AppleAppStoreUrl` and `PatientApp:GooglePlayStoreUrl`).
- When a patient submits `/public/join` with an email address, `portal-api` must enqueue a `notification.email.requested` envelope containing the digital queue pass summary and direct claim link (`/join/claim?token=...`). No SMS gateway is used.

### R5. Profile Hydration Endpoint & Central Patient Ingestion
In `services/patient-api`:
- Expose an authenticated endpoint `POST /api/v1/patients/claim-intake` requiring Clerk Bearer JWT.
- Validate token authenticity and expiration.
- Implement `ClaimIntakeCommandHandler` to hydrate `Patient` demographics, PhilHealth credentials (`ConsentToShareInfo = true`), and structured `PatientAllergy` entities.
- Transactionally create or activate `ClinicMembership` for the referenced clinic facility.
- Return the updated `PatientSummary` with `ClinicEzId` and assigned relationship type (`Self` vs `Dependent`).

## Acceptance Criteria

### Security & Token Signing
- [ ] `ClaimTokenService` in `packages/shared-dotnet` generates and verifies tamper-proof HMAC-SHA256 tokens and rejects expired or altered tokens.
- [ ] `portal-api`'s `PublicJoinEndpoints` issues `claimToken` and `expiresAt` in the `202 Accepted` response.
- [ ] `JoinClaim:TtlHours` defaults to 48 and is configurable via platform settings.

### Email Confirmation Delivery
- [ ] When an email is supplied on `/join/{code}`, `portal-api` enqueues a `notification.email.requested` envelope to Interop Hub with the digital pass details and direct claim link.
- [ ] No SMS notifications are dispatched.

### UI/UX & Design Token Compliance (`@clinicez/design-tokens`)
- [ ] Progressive Account Claim card is rendered on `DigitalPassCard.tsx` consuming semantic tokens (Teal `#0D6963`, zero raw hex values).
- [ ] All 4 core UX states (Skeleton loading, Empty, Error with retry, Active/Success pass) are explicitly implemented.
- [ ] Apple App Store and Google Play store badges are rendered with configurable platform URLs.
- [ ] Claim card and action buttons are cleanly hidden during `@media print`.

### Central Patient Hydration & Identity Resolution
- [ ] `POST /api/v1/patients/claim-intake` successfully hydrates demographics, PhilHealth PIN, and allergies into `patient-api` for authenticated users.
- [ ] Existing users receive a `ClinicMembership` without duplicate `Patient` creation.
- [ ] Dependent / Minor passes can be claimed as a managed dependent under a parent's account.
- [ ] Unrelated adult identity mismatches are blocked with a clear privacy warning.

### Build & Verification
- [ ] Full solution build (`dotnet build CLINICEZ.sln`) passes with 0 errors and 0 warnings.
- [ ] Backend test suites (`ClinicEz.Portal.Tests` and `ClinicEz.Patient.Application.Tests`) pass with 100% success.
- [ ] `bun --cwd apps/portal-web run test` and `bun --cwd apps/portal-web run build` pass with 0 errors.


## 2026-10-13T11:45:59Z

Deliver a comprehensive OPD Queue, Display, Notification & Intake Suite for ClinicEZ: configurable End-of-Day (EOD) reconciliation with manual force-close, a dedicated waiting area public TV display board, configurable patient app push notifications with queue threshold alerts, and fuzzy duplicate patient detection with interactive warning safeguards.

Working directory: c:\Users\User\projects\nextstep\github\clinicez-arch2
Integrity mode: development

## Requirements

### R1. Configurable End-of-Day (EOD) Reconciliation & Force EOD
Support automated and manual clinic day closure.
- Add configurable EOD auto-reconciliation time (`EodReconciliationTime`, e.g. 21:00, 24h format) and an enable/disable toggle in clinic settings.
- Implement an on-demand "Force EOD / Close Clinic Day" action in settings and dashboard that transitions all remaining active waiting tickets (`Waiting`, `Triaged`, `OnHold`) for today to `NoShow`, stamps the completion timestamp, and records an EOD reconciliation audit entry.
- Implement an automated background job that checks the clinic's local time against `EodReconciliationTime` and auto-reconciles leftover tickets.

### R2. Waiting Area Public TV Display Board
Deliver a public display mode tailored for lobby TV monitors.
- High-contrast, responsive display board layout designed for 1080p/4K lobby screens.
- Prominent "NOW SERVING" section displaying ticket numbers, assigned doctor, and room/station with visual pulse animation upon changes.
- Audible chime alert when a ticket is called (enabled by default with an on-screen mute/unmute control).
- Upcoming "UP NEXT" list with patient privacy masking support (e.g. "Cassandra A.") configurable in settings.
- Real-time auto-refresh mechanism (polling / live sync) so the display runs continuously without manual intervention.

### R3. Patient App Push Notifications with Configurable Threshold
Automate queue alerts to the mobile patient app with configurable thresholds.
- Provide clinic settings to toggle queue push notifications and configure the "patients ahead" threshold (default: 2 patients ahead, range 1 to 5).
- Automatically dispatch notification messages via the Interop Hub to the patient app when a patient reaches the configured queue threshold ("You are 2 patients away in line...") and when called ("Ticket Q-003 has been called to Room 1").

### R4. Fuzzy Duplicate Patient Detection & Warning Safeguards
Prevent duplicate patient profile creation at intake.
- Analyze existing patient records using normalized names (Levenshtein distance / phonetic match), Date of Birth, contact number, and PhilHealth ID.
- When registering a new patient, surface an interactive warning modal if potential duplicates are detected:
  - Display matched profiles with similarity reasons (e.g. matching name + birthdate).
  - Allow staff to choose "Use Existing Profile" (navigates to existing chart) or "Create New Profile Anyway" (proceeds with registration).

## Acceptance Criteria

### EOD Reconciliation
- [ ] Updating clinic settings successfully saves `EodReconciliationTime` and `AutoEodEnabled`.
- [ ] Executing `POST /api/v1/queue/reconcile-eod` (Force EOD) transitions all active `Waiting`, `Triaged`, and `OnHold` tickets to `NoShow` and records `CompletedTime`.
- [ ] Tickets already `Completed` or `InConsultation` are not corrupted or invalidated by EOD reconciliation.
- [ ] The General Settings tab provides an operational card with EOD time picker, toggle, and "Force EOD / Close Clinic Day" button with confirmation.

### Public TV Display Board
- [ ] Navigating to the queue display board route renders the current serving ticket, doctor name, and room/station.
- [ ] Calling a patient from the clinic dashboard triggers a visual pulse and audio chime on the display board.
- [ ] When patient name masking is enabled in settings, public display masks patient names (e.g. "Cassandra A.") while showing full ticket numbers.
- [ ] Display board updates automatically without page reloads as the queue changes.

### Patient App Push Notifications
- [ ] Calling a patient triggers an immediate "called to room" push notification payload via Interop Hub.
- [ ] Advancing the queue triggers an "approaching turn" notification for the patient at the configured threshold (default 2 ahead).
- [ ] Clinic settings correctly toggle push alerts on/off and persist the ahead-of-line threshold.

### Fuzzy Duplicate Patient Detection
- [ ] Querying `GET /api/v1/patients/check-duplicates` with a name and matching DOB of an existing patient returns the matching profile.
- [ ] Exact phone or PhilHealth matches are identified with high confidence.
- [ ] In "+ New patient" intake, detecting a duplicate displays `<DuplicatePatientWarningModal />`.
- [ ] Selecting "Use Existing Profile" opens the existing chart without creating a duplicate; selecting "Create New Profile Anyway" completes the registration.

### Quality & Test Suite Integrity
- [ ] All new backend commands, queries, and background jobs have unit tests in `ClinicEz.Clinic.Application.Tests` and pass cleanly.
- [ ] Frontend unit tests for TV display, EOD settings, duplicate warning modal, and push threshold controls pass cleanly.
- [ ] Design token checks (`check-tokens.mjs`) pass with 0 violations.
- [ ] TypeScript compilation (`tsc --noEmit`) passes with 0 errors.


## 2026-10-14T08:53:01Z

This is a single self-contained fix; keep it small and focused. In the ClinicEZ `clinic-app` Consultation screen, remove all statutory, XML attribute/node, and raw catalog code jargon from the right-hand consultation pane while retaining/paraphrasing PhilHealth instructional labels, and split the vertical scroll independently between the left Longitudinal Medical Chart pane and the right Consultation Workspace pane.

Working directory: c:\Users\User\projects\nextstep\github\clinicez-arch2
Integrity mode: development

## Reference Material & Skills
- Skill: `c:\Users\User\projects\nextstep\github\clinicez-arch2\.agents\skills\clinicez-ui-ux-expert\SKILL.md` (Strict UI Token Mandate: never use hardcoded hex values or direct `palette.ts` imports in `.tsx`/`.jsx`; consume semantic tokens via `theme` / `@clinicez/design-tokens`).
- Target files in `apps/clinic-app`:
  - `apps/clinic-app/navigation/screens/Consultations.screen.tsx`
  - `apps/clinic-app/components/consultation/InlinePhysicalExamCard.tsx`
  - `apps/clinic-app/components/consultation/YakapClaimReadinessCard.tsx`

## Requirements

### R1. Remove Statutory, XML Schema, and Catalog Code Jargon from the Right Consultation Pane while Retaining/Paraphrasing PhilHealth Instructional Labels
In the right-hand consultation documentation workspace (`Consultations.screen.tsx`, `InlinePhysicalExamCard.tsx`, and `YakapClaimReadinessCard.tsx`), remove all non-clinical statutory jargon, XML attribute/node names (`pHciCaseNo`, `pHciTransNo`, `pSoapTransNo`, `pDoctorPan`, `pDoctorPrc`, `pPin`, `pPhilHealthAtc`, `pSignSympCode`, `PESPECIFIC`, `pIcdCode`, `VITALS`, `pDrugCode`, `KONSULTADATA`), DTD schema filenames (`KonsultaData_v1.14.dtd`, `DTD v1.14`), statutory law citations (`RA 11223`), raw PhilHealth catalog codes displayed on UI pills/badges (`meta={symp.code}` showing `01`–`38` and `X` on Subjective symptom chips, `Code 1` in Physical Exam hint, `Yakap <philHealthCode>` on Laboratory order chips, raw 30-character `newRxDrugCode` and `GAMOT <philHealthDrugCode>` on Prescriptions, `NOMED`), and internal jargon (`Statutory keys`, `Auto-Snapshotted`, `Snapshotted`, `statutory conditions`, `statutory requirements`). Retain and paraphrase all PhilHealth instructional labels in clear, clinician-friendly language so physicians understand what is required to complete and sign a PhilHealth Konsulta consultation. Standard clinical ICD-10 diagnosis codes (`I10`, `J06.9`, etc.) in the Assessment section remain intact.

### R2. Split Independent Vertical Scrolling for the Medical Chart and Consult Workspace
On desktop workstations (`isDesktopWorkstation`, width >= 1024px), decouple the vertical scrolling of the left pane (Longitudinal Medical Chart) and the right pane (Consult Workspace / SOAP Documentation) so that scrolling the medical chart does not scroll the consult workspace and vice versa. Ensure each pane has its own independent `ScrollView` with bounded viewport height and `nestedScrollEnabled`, while preserving 1-click "Jump to section" (`handleJumpToSection`) behavior for both top patient spine sections (`patient-pin`, `vitals`) and right-pane consultation sections (`atc`, `symptoms`, `physical-exam`, `primary-diagnosis`, `medicines`, `doctor-pan`, `doctor-prc`, `doctor-s2`).

### R3. Preserve ClinicEZ UI/UX Design Token Compliance and Existing Test Contracts
All UI styles must strictly use semantic tokens from `theme` / `@clinicez/design-tokens` with zero raw hex values. All existing unit and stress tests in `apps/clinic-app/tests/` (including `challenger_m5_empirical_stress.test.ts` which inspects `sectionOffsets.current['<key>'] =` in `Consultations.screen.tsx`) and `packages/design-tokens` must pass, and any test assertions updated or added to verify the new jargon-free labels and independent split-scroll structure.

## Verification Resources
- Existing test suites:
  - `bun test apps/clinic-app/tests/consultationWorkstation.test.ts`
  - `bun test apps/clinic-app/tests/physicalExamChecklist.test.ts`
  - `bun test apps/clinic-app/tests/challenger_m4_1_features17_18_stress.test.ts`
  - `bun test apps/clinic-app/tests/challenger_m5_empirical_stress.test.ts`
  - `bun test packages/design-tokens/src/tokens.test.ts`

## Acceptance Criteria

### Jargon Removal & Paraphrased PhilHealth Instructions
- [ ] Zero XML attribute/node identifiers (`pHciCaseNo`, `pHciTransNo`, `pSoapTransNo`, `pDoctorPan`, `pDoctorPrc`, `pPin`, `pPhilHealthAtc`, `pSignSympCode`, `PESPECIFIC`, `pIcdCode`, `VITALS`, `pDrugCode`, `KONSULTADATA`) or DTD filenames (`KonsultaData_v1.14.dtd`, `DTD v1.14`) are rendered in `Consultations.screen.tsx`, `InlinePhysicalExamCard.tsx`, or `YakapClaimReadinessCard.tsx`.
- [ ] Subjective symptom `ToggleChip` components do not pass `meta={symp.code}`, so catalog codes (`01`..`38`, `X`) are not displayed next to symptom names.
- [ ] Laboratory order `ToggleChip` components and Prescription cards/forms do not display raw PhilHealth catalog codes (`Yakap ${diag.philHealthCode}`, raw 30-char drug codes, `GAMOT ${rx.philHealthDrugCode}`, `NOMED`), showing clean PhilHealth formulary labels instead.
- [ ] Physical Examination card (`InlinePhysicalExamCard.tsx`), Attending Physician badges, and PhilHealth Claim Readiness card (`YakapClaimReadinessCard.tsx`) use clean clinical and paraphrased PhilHealth instructional labels (no `(Code 1)`, `Auto-Snapshotted`, `RA 11223`, or `code '38' (PAIN)` / `code 'X'`).

### Independent Split Scroll
- [ ] In `Consultations.screen.tsx`, when `isDesktopWorkstation` is true, `leftChartPane` and `rightSoapPane` each render an independent `ScrollView` (`chartScrollViewRef` and `soapScrollViewRef`) with bounded height so scrolling one pane does not scroll the other.
- [ ] `handleJumpToSection` scrolls the appropriate scroll container for all 10 section keys (`patient-pin`, `vitals`, `atc`, `symptoms`, `physical-exam`, `primary-diagnosis`, `medicines`, `doctor-pan`, `doctor-prc`, `doctor-s2`), and all 10 `sectionOffsets.current['...'] =` assignments remain intact.

### Automated Verification
- [ ] All tests in `apps/clinic-app/tests/` and `packages/design-tokens/src/tokens.test.ts` pass with 0 failures under `bun test`.


## 2026-10-14T10:27:11Z

Replace the single-room `AssignedRoomId` on `StaffMember` with multi-room `AssignedRoomIds` (`ClinicRoom * <-> * StaffMember`) as the single source of truth across `services/clinic-api` and `apps/clinic-app`, and implement Scoped Station Visibility by Role and multi-room patient call/check-in resolution in the ClinicEZ workstation UI following the `clinicez-ui-ux-expert` design system guidelines (`c:\Users\User\projects\nextstep\github\clinicez-arch2\.agents\skills\clinicez-ui-ux-expert\SKILL.md`).

Working directory: c:\Users\User\projects\nextstep\github\clinicez-arch2
Integrity mode: development

## Requirements

### R1. Single Source of Truth for Multi-Room Staff Assignment (`services/clinic-api`)
Remove the redundant scalar `AssignedRoomId` / `AssignedRoom` navigation property from `StaffMember` and replace it with `AssignedRoomIdsJson` (and domain helpers `GetAssignedRoomIds()` / `SetAssignedRoomIds(IEnumerable<Guid>? roomIds)`) on `StaffMember` (with an EF Core migration in `ClinicEz.Clinic.Infrastructure`). Update `StaffMemberDto`, `GetStaffMembersQuery`, `CreateStaffMemberCommand`, `UpdateStaffMemberCommand`, `UpdateMyProfileCommand`, and `StaffController` to accept `IReadOnlyList<Guid>? AssignedRoomIds` and return `IReadOnlyList<Guid> AssignedRoomIds` and `IReadOnlyList<string> AssignedRoomNames`.

### R2. Additive Room-to-Staff Synchronization & Multi-Room Queue Routing (`services/clinic-api`)
Update `GetClinicRoomsQuery`, `CreateClinicRoomCommand`, `UpdateClinicRoomCommand`, and `DeleteClinicRoomCommand` so assigning a staff member to a room adds that room's `Id` to `staff.GetAssignedRoomIds()` without removing their other assigned rooms, and unchecking/deleting a room removes only that room's `Id` from `staff.GetAssignedRoomIds()`. Update `CheckInPatientCommand`, `CallQueueItemCommand`, and `RecordProcedureExecutionCommand` to resolve a doctor's assigned rooms from `GetAssignedRoomIds()` (preserving the queue item's `RoomId` if it already belongs to the doctor's `GetAssignedRoomIds()`, or defaulting to the first active room in `GetAssignedRoomIds()`).

### R3. Multi-Room Staff Assignment UI in Settings (`apps/clinic-app`)
Update `clinicService.ts`, `ClinicRoomsSettingsCard.tsx`, and `StaffManagementTab.tsx` (adhering strictly to `@clinicez/design-tokens` and `clinicez-ui-ux-expert`) to use `assignedRoomIds: string[]` and `assignedRoomNames: string[]` (removing `assignedRoomId` / `assignedRoomName`). In `ClinicRoomsSettingsCard.tsx`, when a staff member already assigned to another room is shown in the staff picker, display `"Also in <Room> · Will cover both"` instead of `"Will move from <Room>"`. In `StaffManagementTab.tsx`, allow multi-selecting rooms for Doctors and Nurses (`Unassigned / Floating` clears the selection) and render all `assignedRoomNames` badges on each staff row.

### R4. Scoped Station Visibility by Role & Smart Call/Check-In Room Resolution (`apps/clinic-app`)
In `Consultations.screen.tsx` and `Queue.screen.tsx`, compute `visibleRooms` based on the active staff member's role and `assignedRoomIds`:
- Doctors with `assignedRoomIds.length > 0` see only their assigned Consultation Room(s) (labeled `<Room> (Mine)`), plus shared `Triage` and `Treatment` stations and `All My Stations`—hiding other doctors' unassigned Consultation Rooms from the pill bar and excluding patients sitting in hidden Consultation Rooms (unless assigned to that doctor).
- Nurses with `assignedRoomIds.length > 0` see their assigned room(s) (`(Mine)`) plus shared `Triage` and `Treatment` stations, hiding unassigned Consultation Rooms, and default to `assignedRoomIds[0]` on load.
- Unassigned/floating staff (`assignedRoomIds.length === 0`), Receptionists, Cashiers, and Clinic Admins see all active rooms (`All Stations`).
In `Queue.screen.tsx`, replace the hardcoded `STATIONS` and Call to Room modal options with dynamic rooms from `useClinic().rooms`, pre-selecting the target room when calling a patient using the 4-step priority order: (1) active station pill if valid, (2) ticket's check-in room if in the clinician's rooms, (3) `assignedRoomIds[0]`, (4) first available consultation room. In `Patients.screen.tsx`, when selecting an Attending Doctor at walk-in check-in, pre-select `doctor.assignedRoomIds[0]` and badge all rooms in `doctor.assignedRoomIds` with `(Doctor's Room)`.

## Acceptance Criteria

### Backend Verification (`services/clinic-api`)
- [ ] `StaffMember` and `StaffMemberDto` no longer expose the redundant scalar `AssignedRoomId` / `AssignedRoomName` properties, using `AssignedRoomIds` and `AssignedRoomNames` as the single source of truth.
- [ ] Assigning a doctor to `Room 1` and then assigning the same doctor to `Room 2` via `UpdateClinicRoomCommand` retains both `Room 1` and `Room 2` in `AssignedRoomIds` and returns the doctor under both rooms in `GetClinicRoomsQuery`.
- [ ] `dotnet test services/clinic-api/ClinicEz.Clinic.UnitTests/ClinicEz.Clinic.UnitTests.csproj` passes with 0 errors and includes unit tests for multi-room staff assignment, room deletion cleanup, check-in routing, and call-to-room resolution.

### Frontend & UI/UX Verification (`apps/clinic-app`)
- [ ] `Consultations.screen.tsx` and `Queue.screen.tsx` dynamically scope visible station pills by role and `assignedRoomIds`, with zero hardcoded room arrays remaining in `Queue.screen.tsx`.
- [ ] `pnpm --filter clinic-app test -- --runTestsByPath services/__tests__/clinicRoomsAndRouting.test.ts` passes with unit tests covering scoped station visibility by role (single-room doctor, multi-room doctor, assigned nurse, floating staff) and 4-step call-to-room resolution.
- [ ] `pnpm --filter clinic-app typecheck` and `pnpm lint:tokens` pass with 0 errors and zero raw hex color violations.


## 2026-10-15T00:07:44Z

Implement payment override (manual payment recording with official invoice/receipt generation and workspace licensing activation) and full plan, feature, and entitlement management across Portal API (.NET 10) and Portal Web (Next.js 16).

Working directory: c:\Users\User\projects\nextstep\github\clinicez-arch2

## Requirements

### R1. SuperAdmin Payment Override & Activation
Provide an administrative capability to record manual/offline payments (Bank Transfer, GCash/Maya, Check, Cash, Promotional) for a tenant workspace.
- Generate an official `BillingInvoice` (marked `Paid`) with sequential numbering.
- Generate an official `PaymentReceipt` with payment method and transaction reference details.
- Activate the workspace subscription on the selected plan with the appropriate expiration date (1 month or 1 year) and stage cryptographic facility licenses.

### R2. Tenant Billing Guidance
In the tenant workspace console (`/{tenant}/dashboard/billing`), provide offline payment instructions (Bank Deposit / GCash details) and ensure recorded manual invoices and receipts appear seamlessly in the Billing History table and details modal.

### R3. Plan, Feature & Entitlement Management UI
In the SuperAdmin Portal (`/admin/plans`), deliver full administrative management for plans and entitlements following ClinicEZ design tokens (`@clinicez/design-tokens`):
- Configure plan pricing (monthly/annual), rank, and checkout requirements.
- Manage marketing features (`PlanFeature`).
- Manage quantitative limits (clinics, labs, pharmacies, staff, patients, consultations, API quotas).
- Manage capability feature flags (teleconsultation, e-prescriptions, LIS, PMS, PhilHealth Konsulta, multi-terminal sync, cross-tenant interop).
- Support per-workspace custom entitlement overrides on `/admin/tenants/[slug]`.

## Acceptance Criteria

### Payment Override
- [ ] SuperAdmin can record an offline payment for any tenant workspace via `POST /admin/tenants/{id}/record-payment`.
- [ ] A `BillingInvoice` with status `Paid` and a `PaymentReceipt` are persisted in PostgreSQL.
- [ ] The tenant's `Subscription.Status` updates to `Active` and facility licenses are re-staged.
- [ ] The tenant workspace billing history immediately reflects the generated invoice and downloadable receipt.

### Plan & Entitlement Management
- [ ] SuperAdmin can view, create, and update plans and their limits/features at `/admin/plans`.
- [ ] Updating plan entitlements increments the plan version, updates all subscribed workspaces, and re-issues facility licenses.
- [ ] SuperAdmin can view and apply workspace-specific entitlement overrides at `/admin/tenants/[slug]`.
- [ ] All new UI components adhere strictly to `@clinicez/design-tokens` without hardcoded arbitrary hex values.

### Build & Verification
- [ ] All unit and integration tests pass: `dotnet test CLINICEZ.sln`.
- [ ] Portal frontend passes typecheck and production build: `bun run typecheck:all` and `bun run build:portal`.


## 2026-10-16T03:07:34Z

# Teamwork Project Prompt — Dynamic Lab Orders & In-Clinic Procedures

Implement dual diagnostic fulfillment (In-House Clinic vs. Outside Laboratory), automatic clinic invoice billing for in-house tests, dynamic catalog search modal, and past encounter rehydration in ClinicEZ Consultation workstation.

Working directory: c:\Users\User\projects\nextstep\github\clinicez-arch2

## Requirements

### R1. Dual Fulfillment Modes for Diagnostic Orders
- In Consultations.screen.tsx, upgrade orderedLabs to structured objects containing serviceItemId, code, name, category, standardPrice, philHealthCode, and fulfillmentMode: 'in_house' | 'outside'.
- In-House tests (e.g., RBS fingerstick, ECG, rapid dipsticks) perform immediate clinical order and route to the clinic Cashier invoice (billItems).
- Outside Laboratory tests (e.g., CBC, Lipid, Pap Smear) generate external requisition slips (createLabOrder) and are NOT billed on the clinic consultation invoice.

### R2. Fee Schedule Search Modal & Quick-Select Chips (Hybrid UX)
- Retain top frequently ordered items as 1-click quick-access chips on the consultation cards.
- Add + Add test and + Add procedure buttons that open OrderCatalogSearchModal.tsx.
- Modal allows searching the clinic fee schedule by name, code, or PhilHealth code, selecting fulfillment mode, and adding optional clinical notes/fasting instructions.
- Enforce ClinicEZ UI/UX expert standards (@clinicez/design-tokens, teal #0D6963, semantic states, no hardcoded colors).

### R3. Cashier Invoice Billing Integration
- In handleSignEncounter, include consultation fee, in-clinic procedures, and in-house diagnostic tests (subject to PhilHealth Yakap ₱0 co-pay) in createInvoice.
- Outside lab orders must not be billed on the clinic invoice.

### R4. Past Encounter Rehydration
- When opening an existing signed encounter in loadPatientContext, rehydrate orderedLabs and orderedProcedures so clinicians see what was ordered.

## Acceptance Criteria

- [ ] Diagnostic tests can be toggled between In-House and Outside Lab.
- [ ] In-House diagnostic tests appear as line items in the clinic Cashier invoice upon signing.
- [ ] Outside laboratory orders do NOT appear as line items on the clinic invoice.
- [ ] PhilHealth Yakap covered in-house tests apply ₱0 patient co-pay.
- [ ] OrderCatalogSearchModal filters catalog items and supports adding tests/procedures with custom clinical notes.
- [ ] Previously signed encounters rehydrate ordered tests and procedures accurately upon opening.
- [ ] Automated tests in consultationsDynamicOrders.test.ts pass cleanly.

## 2026-10-17T03:10:29Z

Requested team: Full multi-agent team (UI/UX, domain persistence, PhilHealth compliance, privacy engineering, automated verification)

Build an exhaustive, clinic-wide Audit Log and Forensic Activity Trail system for Clinic Administrators in ClinicEZ (`apps/clinic-app` and `services/clinic-api`), capturing 100% of clinic actions (security, administration, patient access, clinical workflows, billing, and PhilHealth Yakap statutory transmittals) with built-in Privacy-by-Design PHI redaction compliant with the Philippine Data Privacy Act (RA 10173) and styled using `@clinicez/design-tokens`.

Working directory: c:\Users\User\projects\nextstep\github\clinicez-arch2
Integrity mode: development

## Requirements

### R1. Exhaustive Clinic-Wide Event Interception (100% Action Coverage)
Implement an automated audit capture pipeline in `services/clinic-api` that intercepts every modifying and access action across all clinic operations without exception:
- **Security & Authentication**: Logins, logouts, failed login attempts, password resets, role permissions granted/revoked, staff activation/deactivation.
- **Clinic Administration**: Schedule overrides, doctor leaves, room reassignments, fee schedules, custom fields, and clinic profile updates.
- **Patient Access & Directory**: Patient registration, demographic edits, chart views/access trails, and search queries.
- **Appointments & Queue**: Booking, rescheduling, cancellations, check-in, triage assessments, call to room, and queue completion.
- **Clinical Care & EMR**: Consultation creation, vital signs recording, problem/allergy additions or resolutions, physical exam recordings (`lib_pe*`), SOAP notes authored, consultation signing, lab orders, lab result reviews, and prescription issuances.
- **Billing & Cashier**: Invoice generation, item additions, discount applications (SC/PWD), payment collections, receipt number issuance, shift open/close/reconciliation, invoice voids (with audited mandatory reasons), and refunds.
- **PhilHealth Yakap (Konsulta)**: PIN verification queries, masterlist synchronizations, eKAS availment generation, ATC code generation, GAMOT medicine dispensations, UPSC voucher checks, XML transmittal payload generation (`KonsultaData_v1.14.dtd`), AES-256 payload encryption, SOAP transmittal submissions, claims acceptance/rejection responses, and claim voids.
- **Auditing the Auditor**: Querying, filtering, or exporting the audit log itself writes an immutable audit entry (`audit.log.viewed` / `audit.log.exported`).

### R2. Privacy-by-Design & PHI Redaction Engine (DPA RA 10173 & HIPAA)
Implement strict privacy controls ensuring the audit log provides complete forensic accountability without acting as a backdoor to Protected Health Information (PHI):
- **Metadata vs. Payload Segregation**: Audit entries record *who, what, when, action type, target entity ID, IP address, and outcome*.
- **Automatic PHI Sanitization**: Sensitive medical prose (SOAP subjective/objective narratives, psychiatric details, infectious disease notes) and authentication secrets (passwords, tokens, AES keys) are automatically stripped or masked (`[Clinical Text Redacted - DPA RA 10173]`) before saving to the audit store. Structural metadata (e.g. modified field names, `lib_icd` codes, `lib_pe*` statutory codes, hashes) is preserved for forensic integrity.
- **Patient Identity Protection**: Support privacy-masked patient identifiers in administrative views (e.g., `J*** D***` / PhilHealth PIN `12-****5678-9`) with role-based access checks.
- **Zero Mutation (WORM Immutability)**: The `ClinicAuditEntry` table is append-only. Hard deletes, soft deletes, and update mutations are blocked at the database and EF Core levels (`InvalidOperationException`).

### R3. High-Density Clinic Admin Audit Workstation UI (`apps/clinic-app`)
Deliver a clinical workstation screen and tab in `apps/clinic-app` for Clinic Administrators and compliance personnel adhering strictly to `@clinicez-ui-ux-expert`:
- **Categorized Multi-Filter Controls**: Filter across `All`, `Security`, `Operations`, `Billing`, `Clinical Access`, and `PhilHealth Yakap`, plus date range, actor, and entity ID search.
- **Urgency & Severity Visual Coding**: Consumes `@clinicez/design-tokens` semantic tokens:
  - `Emergency / High Risk` (`emergencyBg`, red token): Security anomalies, failed logins, voided invoices, and deleted clinic templates.
  - `Urgent / Warning` (`urgentBg`, orange token): PhilHealth transmittal rejections, payment refunds, and doctor leave overrides.
  - `Routine / Info` (`routineBg`, teal `#0D6963` token): Standard clinical consultations, check-ins, and successful transmittals.
- **Defensive State Handling**: Skeleton loaders reflecting table rows (`skeletonBase`/`skeletonHighlight`), contextual empty states with clear reset CTAs, inline filter validation, and backward cursor pagination (`before` timestamp).
- **Inspection Drawer / Modal**: High-density side drawer allowing administrators to inspect complete forensic metadata (timestamp, actor credentials, client IP, action verb, and sanitized change summary).
- **Zero Hex Literals**: 100% of UI styling consumes `@clinicez/design-tokens` semantic variables.

### R4. Role-Based Access Control & Audit Query Gating
- Introduce `ClinicPermissions.AuditRead` (`audit:read`) and `ClinicPermissions.AuditExport` (`audit:export`) in `ClinicPermissions.cs`.
- Restrict audit endpoints and UI tabs strictly to the `Admin` role and designated Data Protection Officers / Supervisors.
- Enforce EF Core multi-tenant global query filter: `ClinicId == CurrentClinicId`, guaranteeing zero cross-tenant or cross-facility data leakage.

## Acceptance Criteria

### Comprehensive Event Interception & Immutability
- [ ] Every domain action across billing, triage, consultation, settings, staff, and PhilHealth writes a `ClinicAuditEntry` asynchronously.
- [ ] Hard deletion and updates on `ClinicAuditEntries` throw an `InvalidOperationException` and are blocked in `ApplicationDbContext.SaveChangesAsync`.
- [ ] Central EF Core query filter enforces `ClinicId == CurrentClinicId` across all audit log queries.

### Data Privacy & PHI Masking
- [ ] Raw consultation notes, psychiatric narratives, passwords, and encryption keys are strictly omitted or masked in audit diffs (`[Clinical Text Redacted - DPA RA 10173]`).
- [ ] Structural audit metadata (Actor StaffId, Role, Action, Target Entity, Timestamp, IP Address, ICD-10 code, statutory PE category) is preserved accurately for forensic auditing.
- [ ] Querying or exporting the audit log automatically records an audit event (`audit.log.viewed` / `audit.log.exported`).

### PhilHealth Yakap Statutory Event Auditing
- [ ] PhilHealth PIN verifications, eKAS creation, GAMOT dispensing, XML DTD v1.14 generations, SOAP transmittals, and rejection logs are accurately recorded in the audit trail.
- [ ] Transmittal rejection reasons and claim void reasons are captured in the audit log for regulatory reconciliation.

### UI/UX & Design Token Compliance
- [ ] Audit log workstation renders with `@clinicez/design-tokens` (teal `#0D6963` primary theme, semantic urgency badges, and typography scales).
- [ ] Zero raw hex color literals (`#0D6963`, `#F8FAFC`, etc.) exist in newly created or updated UI components.
- [ ] Loading states display animated skeleton table rows; empty states provide clear contextual feedback.
- [ ] Desktop workstation mode ($\ge 1024\text{px}$) supports persistent high-density inspection with a slide-out metadata drawer.

### Test Automation & Regression Verification
- [ ] Backend tests in `ClinicEz.Clinic.Application.Tests` verify comprehensive event creation, PHI sanitization, query filtering, and immutability guardrails.
- [ ] Frontend tests in `apps/clinic-app` verify audit log rendering, category filter switching, and skeleton states.
- [ ] All existing test suites pass with zero regressions.


## 2026-10-18T23:46:55Z

Decouple ClinicEZ's multi-tenant architecture across Facility Network (B2B Interoperability), Online Presence (Patient Directory Discovery), and Service Catalog (Clinical Intake & Booking), implementing the missing two-tier publishing governance, resilient Interop Hub event synchronization to patient-api, and hybrid gated patient-app intake access workflows conforming strictly to @clinicez/design-tokens.

Working directory: /Users/macuser/projects/github/nextstep/clinicez-arch2
Integrity mode: development
Requested team: Full team (Cross-service architecture, backend interop, portal & clinic & patient app UI/UX)

## Requirements

### R1. Architectural Tri-Domain Decoupling
Decouple Facility Network (cross-tenant B2B interop links), Online Presence (patient-facing public directory identity), and Service Catalog (clinical procedures, doctor schedules, and intake booking access) across `portal-api`, `clinic-api`, and `patient-api`. Ensure changes to one domain do not unintentionally expose or restrict another.

### R2. Two-Tier Facility Publishing Governance
Implement a two-tier governance model:
- **Workspace Level (`portal-web` / `portal-api`)**: Workspace owner sets master directory eligibility (`Enable Patient App Discovery`). Newly provisioned facilities default to `Draft / Private`.
- **Facility Level (`clinic-app` / `clinic-api`)**: Clinic manager/receptionist configures the public profile, verifies the readiness checklist (hours, licensed doctors, service catalog), toggles "Publish to Patient Directory", and can pause online booking dynamically for capacity control.

### R3. Resilient Interop Hub Synchronization to patient-api
Fix the outbox/relay bridge between `portal-api`, `clinic-api`, and `patient-api` so that facility creation and publishing status updates (`facility.directory.updated`) reliably upsert into `patient-api`'s PostgreSQL database (`Clinics` and `ClinicHealthcareProviders` tables), ensuring real clinics appear rather than being masked by dev seeders.

### R4. Hybrid Gated Service Catalog & Tiered Patient Intake Experience
Implement hybrid access gating for facilities with public online presence but private/network services (e.g. campus clinics like USTP CDO - UHC, corporate occupational centers):
- Clinic profile card is publicly discoverable (location, hours, contact, accreditation).
- Clinical services and doctor appointment booking can be unlocked by patients via either:
  1. Entering a 6-character Clinic Join Code / scanning the reception QR code, OR
  2. Joining a linked partner Organization (e.g. university or employer network).

### R5. ClinicEZ Design System & Clinical Workstation UX Compliance
Enforce `@clinicez/design-tokens` standards across all new and modified UI components in `portal-web`, `clinic-app`, and `patient-app`:
- Zero raw hex values; strictly consume semantic tokens (`lightColors`/`darkColors`, radii, typography).
- Full 4-state coverage (loading skeleton matching layout, empty state with action, actionable error toast via `apiError`, active state).
- Clinical urgency encoding (`STAT`, `Urgent`, `Routine`).

## Acceptance Criteria

### Directory & Publishing Governance
- [ ] Facilities created in a workspace default to `Private / Draft` until explicitly published.
- [ ] Workspace admin in `portal-web` can control master directory eligibility per facility.
- [ ] Clinic admin in `clinic-app` can view readiness status, toggle public online presence, and pause online booking in real time.
- [ ] Publishing triggers a validated `facility.directory.updated` event delivered through the Interop Hub to `patient-api`.

### Patient Discovery & Gated Access
- [ ] Published clinics appear in `patient-api`'s `/clinics` search and the Patient App Explore/Discover screens.
- [ ] Clinics with public presence but private services render a clean locked state with an "Enter Join Code / Scan QR" CTA instead of exposing private schedules or showing a blank screen.
- [ ] Entering a valid join code or linking a recognized organization unlocks the service catalog and appointment booking.

### UI/UX & Design Tokens
- [ ] All new UI components strictly consume `@clinicez/design-tokens` semantic tokens.
- [ ] Token unit tests pass without regressions (`bun test packages/design-tokens/src/tokens.test.ts`).
- [ ] Backend test suites pass (`dotnet test services/patient-api/ClinicEz.Patient.Application.Tests` and `dotnet test services/portal-api/ClinicEz.Portal.Tests`).


## 2026-10-19T01:39:27Z

This is a single self-contained feature; keep it small and focused.

Implement a functional, keyboard-accessible Workspace-Wide Search Tool (⌘K / Ctrl+K) in ClinicEZ's tenant portal (apps/portal-web), replacing the unrouted placeholder icon next to Quick Create.

Working directory: /Users/macuser/projects/github/nextstep/clinicez-arch2
Integrity mode: development

## Requirements

### R1. Trigger Button in Sidebar
Replace the unrouted placeholder mail icon next to 'Quick Create' in `apps/portal-web/src/components/dashboard/nav-main.tsx` with a search icon button (`IconSearch` from `@tabler/icons-react`) that opens the workspace search modal and displays an accessible tooltip showing "Search workspace (⌘K)".

### R2. Workspace Search Modal (Spotlight / Command Palette)
Create `apps/portal-web/src/components/dashboard/WorkspaceSearchDialog.tsx` using Radix Dialog (`@radix-ui/react-dialog`) that opens on click or globally when `⌘K` (Mac) or `Ctrl+K` (Windows/Linux) is pressed. The dialog must auto-focus the search input with instant search filtering.

### R3. Search Index & Coverage
The search tool must index and filter across:
1. **Navigation & Pages**: Overview, Branches, PhilHealth YAKAP, Workspace Team, Network, Finance, Settings, Plan & Usage, Ownership, Billing.
2. **Branches & Facilities**: Live search physical branches and their child facilities (Clinics, Laboratories, Pharmacies) via `branchService.getBranches(tenantSlug)` with address and PhilHealth tags.
3. **Workspace Team**: Live search staff members and roles via `staffService.getTenantStaff(tenantSlug)`.
4. **Quick Actions**: Fast shortcuts for creating branches, provisioning facilities, and inviting staff.

### R4. Keyboard Navigation & UI Polish
Provide full arrow key navigation (`ArrowDown` / `ArrowUp`) to cycle items, `Enter` key to select and navigate, and `Escape` to dismiss. Support empty state and zero-state suggestions conforming to `@clinicez/design-tokens` styling and dark/light mode.

## Acceptance Criteria

### Functionality & Navigation
- [ ] Clicking the search icon next to Quick Create opens the search dialog.
- [ ] Pressing `⌘K` or `Ctrl+K` from any route in the tenant dashboard opens/toggles the search dialog.
- [ ] Pressing `Escape` closes the search dialog.
- [ ] Pressing `ArrowDown` and `ArrowUp` moves active selection through search results.
- [ ] Pressing `Enter` navigates to the selected route and closes the dialog.

### Search Filtering & Content
- [ ] Querying "branch", "clinic", "lab", or "pharmacy" filters to the respective facilities and pages.
- [ ] Querying team members or roles filters matching staff.
- [ ] When query is empty, displays zero-state suggested pages and quick actions.
- [ ] When no results match, displays a helpful empty state.

### Code Quality & Compatibility
- [ ] Preserves all existing sidebar functionalities and responsiveness.
- [ ] Strict TypeScript typing with no compile errors.


## 2026-10-19T03:31:55Z

Implement the Universal Pluggable Search Provider Framework across ClinicEZ (shared in `packages/shared-dotnet` and `packages/shared-ts`), strictly governed by the project skills `clinicez-search-provider-expert` and `clinicez-ui-ux-expert`. The framework enables any service across the platform (`clinic-api`, `laboratory-api`, `pharmacy-api`, `billing-api`, `organization-api`, etc.) and client workstation to automatically register or unregister searchable domain entities via assembly scanning and contributor registries without touching central orchestrators. Clinic Workspace (`services/clinic-api` and `apps/clinic-app`) is the flagship first beneficiary.

Working directory: `/Users/macuser/projects/github/nextstep/clinicez-arch2`
Integrity mode: development
Reference skills:
- `.agents/skills/clinicez-search-provider-expert/SKILL.md`
- `.agents/skills/clinicez-ui-ux-expert/SKILL.md`

## Requirements

### R1. Shared Platform Standards (`packages/shared-dotnet` & `packages/shared-ts`)
- Implement `ISearchProvider`, `SearchResultItemDto`, `SearchResponseDto`, and the `AddPluggableSearch()` assembly-scanning DI extension in `packages/shared-dotnet/Search/`.
- Implement `universalSearchRegistry.ts` and `SearchContributor` in `packages/shared-ts/search/`.
- Export all search contracts so any backend service or frontend app in the monorepo can consume them.

### R2. Clinic Backend Pluggable Implementation (`services/clinic-api`)
- Call `services.AddPluggableSearch<...>()` in `ClinicEz.Clinic.Application/DependencyInjection.cs`.
- Implement domain feature search providers following `clinicez-search-provider-expert`:
  - `PatientSearchProvider` (Name, PhilHealth PIN, patient code, DOB)
  - `ConsultationSearchProvider` (Chief complaint, diagnosis, visit notes)
  - `AppointmentSearchProvider` (Patient name, doctor, date/time, status)
  - `SettingSearchProvider` (Rooms, Services catalog fees, Staff & Roles, Operating hours, Facility details)
  - `QueueSearchProvider` (Active tickets, priority, assigned station)
  - `BillingSearchProvider` (Invoice numbers, patient, payment status)
  - `LabOrderSearchProvider` (Order number, test name, panic value flags)
- Implement `GlobalClinicSearchQueryHandler` executing active providers concurrently via `Task.WhenAll`.
- Enforce strict `TenantId` isolation and staff permission filtering (`RequiredPermission`) on every provider.
- Expose via `SearchController` (`GET /api/v1/search?q={query}&category={category}&limit={limit}`).

### R3. Clinic Workstation Command Palette UX (`apps/clinic-app`)
- Implement `GlobalSearchModal` with keyboard shortcut listener (`Cmd+K` / `Ctrl+K` or `/` outside inputs) and persistent search input in `ClinicHeaderBar`.
- Dynamic category filter tabs derived from active providers.
- Debounced (200ms) query execution and keyboard navigation (Arrow Up/Down, Enter, Esc).
- Quick Actions when query is empty (Register Patient, View Queue, Doctor Rosters, Services Catalog).
- Strict adherence to `@clinicez/design-tokens` per `clinicez-ui-ux-expert`:
  - Teal `#0D6963` brand accent and semantic tokens (`surface`, `surfaceHover`, `text`, `textMuted`).
  - Semantic urgency badges for priority & panic alerts (`routineBg`, `urgentBg`, `emergencyBg`).
  - Never use hardcoded hex values. Handle skeleton loading and empty states cleanly.

### R4. Deep Navigation Dispatch & Portal Web Integration
- Selecting a search result deep-links directly into the target record or specific Settings tab (`general`, `services`, `staff`, `access`, `facility`, etc.).
- Connect `apps/portal-web`'s `WorkspaceSearchDialog` to the shared registry and clinic search API for cross-app parity.

## Acceptance Criteria

### Universal Extensibility & Zero-Touch
- [ ] Shared contracts in `packages/shared-dotnet` and `packages/shared-ts` can be imported and consumed by any service in the monorepo.
- [ ] Adding a new `ISearchProvider` in any feature folder auto-registers in `/api/v1/search` without editing `SearchController` or query handlers.
- [ ] Deleting or disabling a provider cleanly removes that category from search without broken references.
- [ ] Users lacking permissions (e.g. `BillingRead`) receive zero items from that provider.

### Workstation Navigation & Hotkeys
- [ ] Pressing `Cmd+K` or `Ctrl+K` (or `/` outside input fields) opens `GlobalSearchModal` from any workstation screen.
- [ ] Pressing `Esc` closes the modal immediately and restores focus.
- [ ] Arrow Up/Down navigates result items with active highlight; `Enter` executes deep navigation.

### Search Performance & Coverage
- [ ] Parallel provider queries execute and return aggregated results under 150ms.
- [ ] Searching settings (e.g. "Services", "Room 101", "Staff", "PhilHealth") navigates to the exact active tab in Settings.
- [ ] Searching patients, consults, and appointments displays accurate records and urgency badges.
- [ ] Visual styling conforms to `@clinicez/design-tokens` with zero raw color hex codes.


## 2026-10-19T05:00:54Z

Implement the **Clean, Integrated Dental Module** inside ClinicEZ (`services/clinic-api`, `apps/clinic-app`, and `apps/portal-web`), strictly governed by the project skills `clinicez-ui-ux-expert` and `clinicez-search-provider-expert`, and coordinated with the active **Clinic Workspace Global Search** implementation in the repository.

Working directory: `/Users/macuser/projects/github/nextstep/clinicez-arch2`
Integrity mode: development
Reference skills:
- `.agents/skills/clinicez-ui-ux-expert/SKILL.md`
- `.agents/skills/clinicez-search-provider-expert/SKILL.md`

## Coordination Directive with "Clinic Workspace Global Search Plan"
- `packages/shared-dotnet/Search/` (`ISearchProvider`, `SearchResultItemDto`, `SearchBadgeVariant`, `AddPluggableSearch`) and `packages/shared-ts/search/` (`universalSearchRegistry`, `SearchContributor`) and `services/clinic-api/ClinicEz.Clinic.Application/Features/Search/` (`GlobalClinicSearchQuery`, `SearchController`) are already present/active in the workspace.
- **DO NOT overwrite, delete, or revert** any existing search framework files in `packages/shared-dotnet/Search/`, `packages/shared-ts/search/`, `services/clinic-api/ClinicEz.Clinic.Api/Controllers/SearchController.cs`, `services/clinic-api/ClinicEz.Clinic.Application/Features/*/Search/`, or `apps/clinic-app/components/search/`.
- Instead, plug the Dental Module directly into that foundation via zero-touch extensibility: implement `DentalChartSearchProvider : ISearchProvider` in `services/clinic-api/ClinicEz.Clinic.Application/Features/Dental/Search/DentalChartSearchProvider.cs` and register a dental `SearchContributor` in `universalSearchRegistry`.

## Requirements

### R1. Reuse Existing Rooms, Documents, Orders, Billing & Patient App Directory Exposure
- **Document Outputs**: Reuse existing **Prescription** (`PrescriptionItem` / `PrescriptionSlipModal`), **Medical Certificate** (`MedicalCertificate`), **Lab / Diagnostic Orders** (`ClinicLabOrder` / `OrderCatalogSearchModal`), **Home Instructions**, and **Doc Vault** (`ClinicRecordAttachment`) with zero duplicate document pipelines.
- **Room & Station Assignment**: Reuse existing `ClinicRoom` (`Consultation`, `Triage`, `Treatment`) and staff-to-room assignment as-is. Do not introduce a separate chair-based queue or room type.
- **Procedures & Billing**: Extend `ClinicalProcedure` (and its DTOs/commands) with optional `ToothNumber` (`int?`) and `ToothSurface` (`string?`) fields so dental procedures flow through the existing procedure order catalog and Cashier `Invoice` pipeline.
- **Patient App / Directory Exposure (`PublishClinicToDirectoryCommand.cs`)**: Update `PublishClinicToDirectoryCommand.cs` so `FacilityCreatedEvent.Classification` maps dynamically from `ClinicSettings.SpecialtyMode` (`"Dental"` -> `"Dental Clinic"`, `"MultiSpecialty"` -> `"Multi-Specialty Clinic"`, `"Medical"` -> `"Ambulatory Clinic"`), exposing dental clinics, dentist providers, and dental services to `patient-api` and `patient-app` automatically.

### R2. Dental Chart Backend & Specialty Mode (`services/clinic-api`, `apps/portal-web`)
- Add `SpecialtyMode` (`"Medical"`, `"Dental"`, `"MultiSpecialty"`, default `"Medical"`) and `EnableDentalModule` (`bool`, default `false`) to `ClinicSettings` (and settings DTOs/commands/queries).
- Add `"Dental Clinic"` to `FACILITY_CLASSIFICATIONS.Clinic` in `apps/portal-web/src/constants/philippine-addresses.ts`.
- Create `DentalToothRecord` entity in `ClinicEz.Clinic.Domain/Entities/DentalToothRecord.cs` (`TenantId`, `ClinicId`, `PatientId`, `ConsultationId`, `ToothNumber` 11–48 Adult / 51–85 Child, `Status`: `Healthy`, `Decay`, `Filled`, `Missing`, `Crown`, `Extraction`, optional `Surface` `M,O,D,B,L`, and `Notes`), configured in `ClinicDbContext`.
- Implement CQRS queries and commands in `ClinicEz.Clinic.Application/Features/Dental/` (`GetPatientDentalChartQuery`, `UpsertDentalToothRecordCommand`, `BatchSaveDentalChartCommand`) and expose via `DentalController` (`api/v1/dental`).

### R3. Clean, Jargon-Free UI in Consultation & Patient Chart (`apps/clinic-app`)
- **Strict No-Clutter / No-Jargon Rule**: Use short, plain English labels (`Dental Chart`, `Adult`, `Child`, `Healthy`, `Decay`, `Filled`, `Missing`, `Crown`, `Extraction`). No verbose descriptions or complex clinical jargon.
- **`InlineDentalChartCard.tsx` in Consultation (`Consultations.screen.tsx`)**: Modeled on `InlinePhysicalExamCard.tsx`. Provides a clean `Adult` (11–48) / `Child` (51–85) toggle, visual upper/lower teeth grid, compact tooth status & surface (`M, O, D, B, L`) selector, short notes, and quick action to order a dental procedure tagged with the selected tooth number. Render in `Consultations.screen.tsx` when `enableDentalModule` is active (and hide 9-system `InlinePhysicalExamCard` when `specialtyMode === 'Dental'`).
- **`DentalChartTab.tsx` in `PatientChartModal`**: Add `'dental'` tab (`label: 'Dental'`) to `CHART_TABS` when dental is enabled, rendering the patient's tooth chart and dental procedure history across `modal`, `split`, and `drawer` chart layouts.
- **Settings UI (`GeneralSettingsTab.tsx`)**: Add a clean `Clinic Specialty` selector (`Medical`, `Dental`, `Multi-Specialty`) to configure `specialtyMode` and `enableDentalModule`.
- **Design Token & 4-State Compliance (`clinicez-ui-ux-expert`)**: Consume only semantic tokens from `@clinicez/design-tokens` (`lightColors` / `darkColors` — zero raw hex codes or `palette.ts` imports) and implement Skeleton, Empty, Error, and Active states.

### R4. Pluggable Search Provider Integration (`clinicez-search-provider-expert`)
- Implement `DentalChartSearchProvider : ISearchProvider` in `services/clinic-api/ClinicEz.Clinic.Application/Features/Dental/Search/DentalChartSearchProvider.cs` following the exact pattern of `ConsultationSearchProvider.cs` (`Category => "Dental"`, `Priority => 25`, `RequiredPermission => ClinicPermissions.ConsultationsRead`, strict `ClinicId == tenantId` filtering).
- Register a frontend `SearchContributor` (`id: 'clinic-dental'`) in `universalSearchRegistry` (`@clinicez/shared-ts`) so `Cmd+K` searches dental tooth records and dental procedures seamlessly.

## Acceptance Criteria

### Backend, Directory Sync & Search Verification
- [ ] `dotnet build` and `dotnet test` pass across `ClinicEz.Clinic.Application.Tests` and `ClinicEz.Shared.Tests` with 0 errors.
- [ ] Unit tests verify `DentalToothRecord` CRUD, `ToothNumber` tagging on `ClinicalProcedure`, `PublishClinicToDirectoryCommand` classification mapping (`"Dental Clinic"` / `"Multi-Specialty Clinic"`), tenant isolation, and `DentalChartSearchProvider` auto-discovery via `AddPluggableSearch`.

### Frontend, Design Tokens & UI Simplicity Verification
- [ ] Zero raw hex color literals or direct `palette.ts` imports exist in any new or modified `.tsx`/`.ts` files.
- [ ] `bun test` passes for `packages/design-tokens`, `packages/shared-ts`, and `apps/clinic-app`.
- [ ] UI labels are concise and free of technical jargon; existing Room assignment, Prescriptions, Certificates, and Lab Orders work seamlessly for dental encounters.


## 2026-10-20T02:05:39Z

Implement first-class Dental Clinic support within the ClinicEZ Service Catalog across `services/clinic-api` and `apps/clinic-app`, providing canonical dental service presets, specialty-aware auto-seeding, and seamless ordering integration with the dental chart.

Working directory: /Users/macuser/projects/github/nextstep/clinicez-dental-services
Integrity mode: development

## Reference Skills
- `.agents/skills/clinicez-ui-ux-expert/SKILL.md`

## Requirements

### R1. Canonical Dental Clinic Service Catalog & Specialty-Aware Seeding (`services/clinic-api`)
- Define canonical Philippine primary care dental service catalog defaults in `services/clinic-api/ClinicEz.Clinic.Application/Features/ServicesCatalog/Common/DentalCatalogDefaults.cs`:
  - `DENT-CONS`: Dental Consultation & Oral Examination (₱500, Category: `Dental`)
  - `DENT-CLEAN`: Oral Prophylaxis / Dental Cleaning (₱850, Category: `Dental`)
  - `DENT-FILL-COMP`: Composite Light-Cure Tooth Restoration (₱950, Category: `Dental`)
  - `DENT-EXT-SIMPLE`: Tooth Extraction - Simple Exodontia (₱1,000, Category: `Dental`)
  - `DENT-EXT-SURG`: Surgical Odontectomy - Impacted Third Molar (₱3,500, Category: `Dental`)
  - `DENT-SEALANT`: Pit and Fissure Sealant (₱600, Category: `Dental`)
  - `DENT-FLUOR`: Topical Fluoride Varnish Application (₱500, Category: `Dental`)
  - `DENT-XR-PA`: Dental Periapical Radiograph / X-Ray (₱400, Category: `Dental`)
  - `DENT-RCT`: Root Canal Therapy / Endodontic Treatment (₱4,000, Category: `Dental`)
  - `DENT-PULP`: Pediatric Pulpotomy (₱1,500, Category: `Dental`)
- Update `GetClinicServicesQueryHandler` (`services/clinic-api/ClinicEz.Clinic.Application/Features/ServicesCatalog/Queries/GetClinicServicesQuery.cs`) with optional `IRepository<ClinicSettings>? settingsRepo = null`:
  - When the clinic catalog is empty:
    - If `ClinicSettings.SpecialtyMode == "Dental"`, auto-seed the canonical dental catalog items.
    - If `ClinicSettings.SpecialtyMode == "MultiSpecialty"`, auto-seed both medical primary care and dental catalog items.
    - If `ClinicSettings.SpecialtyMode == "Medical"` (or unspecified), seed general medical defaults.
- Document and support `Dental` as a standard category on `ClinicServiceItem` entity.

### R2. Idempotent Dental Preset Seeding Command & API Endpoint (`services/clinic-api`)
- Implement `SeedDentalServicesCommand` in `services/clinic-api/ClinicEz.Clinic.Application/Features/ServicesCatalog/Commands/SeedDentalServicesCommand.cs`:
  - Checks existing service codes for the clinic.
  - Adds any missing dental items from `DentalCatalogDefaults` without overwriting or duplicating existing items.
  - Returns the list of created/existing `ClinicServiceItemDto` items.
- Expose `POST /api/v1/services/seed-dental` in `services/clinic-api/ClinicEz.Clinic.Api/Controllers/ServicesController.cs` guarded with `[HasPermission(ClinicPermissions.ServicesManage)]`.

### R3. First-Class Dental Category & Preset Seeding UI in Services Catalog (`apps/clinic-app`)
- In `apps/clinic-app/services/clinicService.ts`, add `seedDentalServices()` invoking `POST /services/seed-dental`.
- In `apps/clinic-app/components/settings/ServicesCatalogTab.tsx`:
  - Add `'Dental': 'Dental Services'` to `SERVICE_CATEGORY_LABEL`.
  - Include `'Dental'` in the category filter chips bar: `(['All', 'Consultation', 'Procedure', 'Diagnostic', 'Dental', 'Medicine', 'NursingService'] as const)`.
  - Include `'Dental'` in the category selector in both the "Add Service" and "Edit Service" modals.
  - Add a clean "Add Dental Services" button with loading and success feedback to allow clinic administrators to populate dental services on demand.

### R4. Consultation Odontogram & Order Catalog Modal Integration (`apps/clinic-app`)
- In `apps/clinic-app/components/consultation/OrderCatalogSearchModal.tsx`:
  - Add `'Dental'` to `CategoryTab`: `type CategoryTab = 'All' | 'Diagnostic' | 'Procedure' | 'Dental';`.
  - Add `'Dental'` to `CATEGORY_TABS`.
  - When `selectedCategory === 'Dental'`, filter items with `item.category.toLowerCase().includes('dental')`.
  - When `selectedCategory === 'Procedure'`, include items where category contains `procedure`, `nursing`, or `dental`.
  - When `selectedCategory === 'Dental'` or tooth number is set, provide dental clinical instruction chips (`Local anesthesia (Infiltration)`, `Mandibular nerve block`, `Rubber dam isolation`, `Post-extraction care instructions`, `Suture removal 7 days`).
- In `apps/clinic-app/navigation/screens/Consultations.screen.tsx`:
  - Update `procedureCatalog = catalogByCategory('procedure', 'nursingservice', 'dental')` so ordered dental procedures properly match catalog items and flow through to Cashier billing invoice line items upon signing.
  - In `handleQuickOrderDentalProcedure`, set `orderSearchInitialCategory('Dental')` so clicking "+ Order Dental Procedure" from the tooth odontogram opens directly to the Dental tab.

### R5. Directory Publishing & Regression Integrity
- Ensure active dental catalog items are included in `PublishClinicToDirectoryCommand` and verified through existing tests.
- Strictly adhere to `@clinicez/design-tokens` (zero raw hex colors).

## Acceptance Criteria

### Automated Backend Tests
- [ ] `/Users/macuser/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~ServicesCatalogTests"` passes with 0 failures, including new tests for dental seeding and idempotent preset addition.
- [ ] `/Users/macuser/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~Dental"` passes with 0 failures.
- [ ] `/Users/macuser/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~PublishClinicToDirectoryTests"` passes with 0 failures.

### Automated Frontend Tests
- [ ] `cd apps/clinic-app && /Users/macuser/.bun/bin/bun test tests/challenger_m1_1_catalog_search.test.ts` passes with 0 failures.
- [ ] `cd apps/clinic-app && /Users/macuser/.bun/bin/bun test tests/consultationsDynamicOrders.test.ts` passes with 0 failures.
- [ ] New unit test file `apps/clinic-app/tests/dentalServiceCatalog.test.ts` passes verifying:
  - `ServicesCatalogTab` displays `Dental Services` category, filter counts, and category chip selection in modal.
  - `OrderCatalogSearchModal` filters by `'Dental'` category tab and includes dental procedures.
  - Quick order with tooth number from dental odontogram pre-selects Dental category.
- [ ] Design token check passes: `cd apps/clinic-app && bun run check-tokens.mjs --strict` or no raw hex colors in modified files.
- [ ] TypeScript check passes: `cd apps/clinic-app && /Users/macuser/.bun/bin/bun run typecheck:clinic` with 0 errors.

## 2026-10-20T01:24:26Z

Resolve all 10 live-testing bug reports and UX enhancements for the **Dental Module & Clinical Workstation** in ClinicEZ (`services/clinic-api` and `apps/clinic-app`), strictly governed by the project skill `clinicez-ui-ux-expert` and executed inside the dedicated isolated git worktree `/Users/macuser/projects/github/nextstep/clinicez-dental-fix` (branch `fix/dental-chart-and-workstation-ux`).

Working directory: `/Users/macuser/projects/github/nextstep/clinicez-dental-fix`
Integrity mode: development
Reference skills:
- `.agents/skills/clinicez-ui-ux-expert/SKILL.md`
- `.agents/skills/clinicez-search-provider-expert/SKILL.md`

## Requirements

### R1. Patient Chart Dental Sync & Longitudinal Encounter Dental Summary (`services/clinic-api`, `apps/clinic-app`)
- **Backend `GetPatientChartQuery` & `PatientChartDto`**:
  - Inject `IRepository<DentalToothRecord>` into `GetPatientChartQueryHandler` (`services/clinic-api/ClinicEz.Clinic.Application/Features/Patients/Queries/GetPatientChartQuery.cs`) and include `DentalTeeth` (`List<DentalToothRecordDto>`) in `PatientChartDto`.
  - Map `ToothNumber` (`int?`) and `ToothSurface` (`string?`) onto `ClinicalProcedureDto` in `PatientChartDto.Procedures`.
  - Add `DentalFindings` (`List<DentalToothRecordDto>`) to `EncounterTimelineItemDto` (grouped by `ConsultationId` or encounter date) so each historical consultation encounter carries the teeth charted during that visit.
- **Frontend Chart Sync (`Consultations.screen.tsx`, `Patients.screen.tsx`)**:
  - In `Consultations.screen.tsx`, persist tooth updates via `clinicService.upsertDentalTooth` / `batchSaveDentalChart` and immediately synchronize `patientChart.dentalTeeth` / `patientChart.dentalChart` in state and inside `refreshPatientChart()` so tooth statuses, surfaces, and DMFT counts are always up to date both before and after signing.
  - In `Patients.screen.tsx` (`handleOpenChart`), ensure `PatientChartModal` receives the populated `dentalTeeth` from `getPatientChart` (with `getPatientDentalChart` fallback if needed).
- **Consultation Left-Pane `Dental` Tab (`Consultations.screen.tsx`)**:
  - Add `'dental'` (`label: 'Dental'`) to `ChartReviewTab` and `chartTabs` in the left-pane longitudinal chart when `isDentalEnabled` is true, rendering `<DentalChartTab />`.
- **Generic `"Patient Chart"` Labeling & Encounter Tab Dental Summary**:
  - Rename `"Medical chart"` / `"Patient Medical Chart"` to `"Patient Chart"` (and `"Open full patient chart"`) across `CenteredModalChartLayout.tsx`, `SlideOverDrawerChartLayout.tsx`, `SplitPaneChartLayout.tsx`, and `Consultations.screen.tsx`.
  - In `EncountersTimelineTab.tsx`, render a concise **"Dental Findings & Procedures"** summary section inside each encounter card whenever that encounter has `dentalFindings` or tooth-tagged procedures (`toothNumber != null`).

### R2. 5-Surface Odontogram Visualization & Multi-Condition Tooth Status (`apps/clinic-app`, `services/clinic-api`)
- **5-Surface Geometric Tooth Diagram (`ToothSurfaceDiagram.tsx`)**:
  - Build a reusable `ToothSurfaceDiagram` component in `apps/clinic-app/components/dental/ToothSurfaceDiagram.tsx` that renders a visual 5-zone tooth schematic: Top (`B` Buccal/Labial), Bottom (`L` Lingual/Palatal), Left/Right (`M` Mesial / `D` Distal oriented toward the dental midline), and Center (`O` Occlusal/Incisal).
  - Embed `ToothSurfaceDiagram` in every tooth cell of `InlineDentalChartCard.tsx` and `DentalChartTab.tsx`, and render a larger interactive `ToothSurfaceDiagram` in the Tooth Inspector where clicking any surface zone (`M, O, D, B, L`) toggles that surface.
- **Multi-Condition Tooth Status**:
  - Support multiple simultaneous conditions on a single tooth (e.g., an existing `Filled` or `Crown` tooth with recurrent `Decay`, or `Decay` with `Extraction` planned).
  - Update backend validation in `UpsertDentalToothRecordCommand` and `BatchSaveDentalChartCommand` to accept comma-separated multi-condition status strings (e.g., `"Filled,Decay"`, `"Crown,Decay"`, `"Decay,Extraction"`) where every token is a valid `AllowedStatuses` value (`Healthy`, `Decay`, `Filled`, `Missing`, `Crown`, `Extraction`).
  - In `InlineDentalChartCard.tsx` and `DentalChartTab.tsx`, selecting `Healthy` clears other conditions; selecting non-healthy conditions toggles them in the tooth's condition set (`conditions: ToothStatus[]`, serialized in `status` as comma-joined tokens) and displays multi-condition badges/dots on the tooth cell. Update DMFT calculation so multi-condition teeth are accurately counted in `Decayed`, `Missing`, `Filled`, and `DMFT Index`.

### R3. Procedure Room Selection, Per-Procedure Sent Indicator & Button Label Polish (`apps/clinic-app`)
- **Room Selection When Ordering or Sending Procedures (`OrderCatalogSearchModal.tsx`, `Consultations.screen.tsx`)**:
  - Pass active procedure/treatment rooms (`ClinicRoom[]`) into `OrderCatalogSearchModal.tsx`. When ordering a `Procedure` and active rooms exist, display a **"Send / Assign to Room"** selector in the modal so the clinician can pick which room (e.g., `Treatment Room 1`, `Dental Chair 2`) the procedure is assigned to.
  - On each ordered procedure row in `Consultations.screen.tsx`, allow changing the target room inline while in `Draft` state (when multiple rooms exist) and provide both per-procedure **"Send to [Room]"** and batch **"Send Draft Procedures to Room"** actions.
- **Per-Procedure Sent & Room Indicator (`Consultations.screen.tsx`)**:
  - Display an explicit badge on every added procedure row:
    - Before handoff: `Draft • Room: [Room Name]` (`warning` / `outline` badge).
    - After handoff: `Sent to [Room Name] • HH:MM AM` (`success` badge with `checkCircle` icon).
- **Fix Double `+ +` in Action Button Labels (`Button.tsx`, `InlineDentalChartCard.tsx`, `DentalChartTab.tsx`, `Consultations.screen.tsx`)**:
  - Remove literal leading `"+ "` prefixes from button titles that also pass `icon="plus"`, and normalize `title` in `Button.tsx` (`icon === 'plus' ? title.replace(/^\+\s*/, '') : title`) so double `+ +` never renders.

### R4. Full-Width Responsive Workstation Layout (`apps/clinic-app`)
- Remove `maxWidth: theme.sizes.contentMaxWidth` and `alignSelf: 'center'` from `styles.content` in `Consultations.screen.tsx`, `Patients.screen.tsx`, and `Dashboard.screen.tsx` so these screens span the full remaining width of wide desktop displays (matching `Settings.screen.tsx`, `Billing.screen.tsx`, and `Appointments.screen.tsx`) while preserving mobile responsiveness.

## Acceptance Criteria

### Backend & Data Sync Verification
- [ ] `dotnet build` and `dotnet test` pass across `ClinicEz.Clinic.Application.Tests` and `ClinicEz.Shared.Tests` with 0 errors.
- [ ] Unit tests verify `GetPatientChartQuery` populates `DentalTeeth`, `ClinicalProcedureDto.ToothNumber`/`ToothSurface`, and `EncounterTimelineItemDto.DentalFindings`.
- [ ] Unit tests verify `UpsertDentalToothRecordCommand` and `BatchSaveDentalChartCommand` accept and persist multi-condition statuses (e.g. `"Filled,Decay"`).

### Frontend, Visual Odontogram & Workstation UX Verification
- [ ] `bun test` passes across `packages/design-tokens`, `packages/shared-ts`, and `apps/clinic-app` with new tests covering `ToothSurfaceDiagram`, multi-condition tooth toggling and DMFT calculation, procedure room selection/indicators, and `Button` `+` normalization.
- [ ] Zero raw hex color literals or direct `palette.ts` imports exist in any new or modified `.tsx`/`.ts` files (strict `@clinicez/design-tokens` compliance).
- [ ] `Consultations.screen.tsx`, `Patients.screen.tsx`, and `Dashboard.screen.tsx` span the full remaining width on desktop without `maxWidth: theme.sizes.contentMaxWidth` constraint.


## 2026-10-20T01:34:11Z

Resolve all 10 live-testing bug reports and UX enhancements for the **Dental Module & Clinical Workstation** in ClinicEZ (`services/clinic-api` and `apps/clinic-app`), strictly governed by the project skill `clinicez-ui-ux-expert` and executed inside the dedicated isolated git worktree `/Users/macuser/projects/github/nextstep/clinicez-dental-fix` (branch `fix/dental-chart-and-workstation-ux`).

Working directory: `/Users/macuser/projects/github/nextstep/clinicez-dental-fix`
Integrity mode: development
Reference skills:
- `.agents/skills/clinicez-ui-ux-expert/SKILL.md`
- `.agents/skills/clinicez-search-provider-expert/SKILL.md`

## Requirements

### R1. Patient Chart Dental Sync & Longitudinal Encounter Dental Summary (`services/clinic-api`, `apps/clinic-app`)
- **Backend `GetPatientChartQuery` & `PatientChartDto`**:
  - Inject `IRepository<DentalToothRecord>` into `GetPatientChartQueryHandler` (`services/clinic-api/ClinicEz.Clinic.Application/Features/Patients/Queries/GetPatientChartQuery.cs`) and include `DentalTeeth` (`List<DentalToothRecordDto>`) in `PatientChartDto`.
  - Map `ToothNumber` (`int?`) and `ToothSurface` (`string?`) onto `ClinicalProcedureDto` in `PatientChartDto.Procedures`.
  - Add `DentalFindings` (`List<DentalToothRecordDto>`) to `EncounterTimelineItemDto` (grouped by `ConsultationId` or encounter date) so each historical consultation encounter carries the tooth condition records noted during that visit.
- **Frontend Chart Sync (`Consultations.screen.tsx`, `Patients.screen.tsx`)**:
  - In `Consultations.screen.tsx`, persist tooth updates via `clinicService.upsertDentalTooth` / `batchSaveDentalChart` and immediately synchronize `patientChart.dentalTeeth` / `patientChart.dentalChart` in state and inside `refreshPatientChart()` so tooth statuses, surfaces, and DMFT counts are always up to date both before and after signing.
  - In `Patients.screen.tsx` (`handleOpenChart`), ensure `PatientChartModal` receives the populated `dentalTeeth` from `getPatientChart` (with `getPatientDentalChart` fallback if needed).
- **Consultation Left-Pane `Dental` Tab (`Consultations.screen.tsx`)**:
  - Add `'dental'` (`label: 'Dental'`) to `ChartReviewTab` and `chartTabs` in the left-pane longitudinal chart when `isDentalEnabled` is true, rendering `<DentalChartTab />`.
- **Generic `"Patient Chart"` Labeling & Encounter Tab Dental Summary**:
  - Rename `"Medical chart"` / `"Patient Medical Chart"` to `"Patient Chart"` (and `"Open full patient chart"`) across `CenteredModalChartLayout.tsx`, `SlideOverDrawerChartLayout.tsx`, `SplitPaneChartLayout.tsx`, and `Consultations.screen.tsx`.
  - In `EncountersTimelineTab.tsx`, render a concise **"Dental Findings & Procedures"** summary section inside each encounter card whenever that encounter has `dentalFindings` or tooth-tagged procedures (`toothNumber != null`).

### R2. 5-Surface Odontogram Visualization & Structured Multi-Condition Tooth Records (`apps/clinic-app`, `services/clinic-api`)
- **Structured Multi-Condition Records per Tooth (With Recorded Timestamp, Doctor, Surface & Notes)**:
  - A single tooth (`ToothNumber`) can have multiple simultaneous condition records (`DentalToothRecord`), where each condition record stores its own `Status` (`Decay`, `Filled`, `Crown`, `Extraction`, `Missing`, `Healthy`), its own `Surface` (`MODBL` specific to that condition, e.g., `Filled` on `O` from a prior visit and `Decay` on `MD` noted today), its own clinical `Notes`, its own `CreatedAt`/`UpdatedAt` timestamp (**when** that condition was recorded), its own `RecordedBy` (`CreatedBy`/`UpdatedBy` clinician name), and its `ConsultationId`.
  - Update `DentalToothRecordDto` to include `string? RecordedBy = null` (populated from `UpdatedBy ?? CreatedBy`).
  - Update `UpsertDentalToothRecordCommand` and `BatchSaveDentalChartCommand`:
    - When upserting a non-healthy condition (`Decay`, `Filled`, `Crown`, `Extraction`, `Missing`), match existing active records by `(ClinicId, PatientId, ToothNumber, Status)` so adding `Decay` to a tooth that already has `Filled` inserts a new `DentalToothRecord` row for `Decay` while preserving the existing `Filled` record (and its original `CreatedAt` timestamp, `Surface`, and `Notes`), and removes any `Healthy` placeholder row on that tooth.
    - When `Status == ToothStatus.Healthy` (or when `RemoveCondition = true` is passed on `UpsertDentalToothRecordCommand` / `ToothRecordInput`), soft-delete (`IsDeleted = true`) the targeted condition(s) on that tooth.
  - Update `GetPatientDentalChartQuery` summary counts (`DentalSummaryDto`) to compute distinct tooth counts per condition and total distinct teeth charted.
- **5-Surface Geometric Tooth Diagram (`ToothSurfaceDiagram.tsx`)**:
  - Build a reusable `ToothSurfaceDiagram` component in `apps/clinic-app/components/dental/ToothSurfaceDiagram.tsx` that renders a visual 5-zone tooth schematic: Top (`B` Buccal/Labial), Bottom (`L` Lingual/Palatal), Left/Right (`M` Mesial / `D` Distal oriented toward the dental midline), and Center (`O` Occlusal/Incisal).
  - Color each surface zone (`B, L, M, D, O`) with the semantic color of the condition affecting that surface (so a tooth with `Filled (O)` and `Decay (M, D)` visually shows a Blue center `O` and Red `M`/`D` sides!), and display multi-condition dots below the tooth cell.
  - In the Tooth Inspector of `InlineDentalChartCard.tsx` and `DentalChartTab.tsx`, display the list of **Recorded Conditions on Tooth #XX** (each showing its Status badge, Surfaces, Notes, Recorded Date/Time, and Recorded By doctor, plus a Remove action in editable mode) alongside the interactive 5-surface diagram for adding/updating a condition.

### R3. Procedure Room Selection, Per-Procedure Sent Indicator & Button Label Polish (`apps/clinic-app`)
- **Room Selection When Ordering or Sending Procedures (`OrderCatalogSearchModal.tsx`, `Consultations.screen.tsx`)**:
  - Pass active procedure/treatment rooms (`ClinicRoom[]`) into `OrderCatalogSearchModal.tsx`. When ordering a `Procedure` and active rooms exist, display a **"Send / Assign to Room"** selector in the modal so the clinician can pick which room (e.g., `Treatment Room 1`, `Dental Chair 2`) the procedure is assigned to.
  - On each ordered procedure row in `Consultations.screen.tsx`, allow changing the target room inline while in `Draft` state (when multiple rooms exist) and provide both per-procedure **"Send to [Room]"** and batch **"Send Draft Procedures to Room"** actions.
- **Per-Procedure Sent & Room Indicator (`Consultations.screen.tsx`)**:
  - Display an explicit badge on every added procedure row:
    - Before handoff: `Draft • Room: [Room Name]` (`warning` / `outline` badge).
    - After handoff: `Sent to [Room Name] • HH:MM AM` (`success` badge with `checkCircle` icon).
- **Fix Double `+ +` in Action Button Labels (`Button.tsx`, `InlineDentalChartCard.tsx`, `DentalChartTab.tsx`, `Consultations.screen.tsx`)**:
  - Remove literal leading `"+ "` prefixes from button titles that also pass `icon="plus"`, and normalize `title` in `Button.tsx` (`icon === 'plus' ? title.replace(/^\+\s*/, '') : title`) so double `+ +` never renders.

### R4. Full-Width Responsive Workstation Layout (`apps/clinic-app`)
- Remove `maxWidth: theme.sizes.contentMaxWidth` and `alignSelf: 'center'` from `styles.content` in `Consultations.screen.tsx`, `Patients.screen.tsx`, and `Dashboard.screen.tsx` so these screens span the full remaining width of wide desktop displays (matching `Settings.screen.tsx`, `Billing.screen.tsx`, and `Appointments.screen.tsx`) while preserving mobile responsiveness.

## Acceptance Criteria

### Backend & Structured Multi-Condition Verification
- [ ] `dotnet build` and `dotnet test` pass across `ClinicEz.Clinic.Application.Tests` and `ClinicEz.Shared.Tests` with 0 errors.
- [ ] Unit tests verify `GetPatientChartQuery` populates `DentalTeeth`, `ClinicalProcedureDto.ToothNumber`/`ToothSurface`, and `EncounterTimelineItemDto.DentalFindings`.
- [ ] Unit tests verify `UpsertDentalToothRecordCommand` and `BatchSaveDentalChartCommand` support multiple `DentalToothRecord` entries on the same `ToothNumber` (e.g. `Filled` on `O` + `Decay` on `MD`), preserving each condition's own `Surface`, `Notes`, `CreatedAt` timestamp, `RecordedBy`, and `ConsultationId`.

### Frontend, Visual Odontogram & Workstation UX Verification
- [ ] `bun test` passes across `packages/design-tokens`, `packages/shared-ts`, and `apps/clinic-app` with new tests covering `ToothSurfaceDiagram`, structured multi-condition tooth records (with per-condition surfaces, notes, and timestamps), DMFT calculation, procedure room selection/indicators, and `Button` `+` normalization.
- [ ] Zero raw hex color literals or direct `palette.ts` imports exist in any new or modified `.tsx`/`.ts` files (strict `@clinicez/design-tokens` compliance).
- [ ] `Consultations.screen.tsx`, `Patients.screen.tsx`, and `Dashboard.screen.tsx` span the full remaining width on desktop without `maxWidth: theme.sizes.contentMaxWidth` constraint.


## 2026-10-20T02:23:38Z

Overhaul and harden the Clinic Analytics and Statutory Reports module in ClinicEZ to production-grade quality. This involves completely eliminating hardcoded mock fallbacks across queries, implementing performant server-side aggregations with indexed database queries in PostgreSQL, delivering comprehensive interactive SVG charts (Line, Bar, Donut, Pie) in `apps/clinic-app` rooted in `@clinicez/design-tokens`, and generating enterprise-grade, print-ready vector PDF reports with QuestPDF in .NET featuring cryptographic verification, institutional letterhead, and DOH/BIR audit compliance.

Working directory: /Users/macuser/projects/github/nextstep/clinicez-arch2
Integrity mode: development

## Requirements

### R1. Elimination of Mock Fallbacks & Genuine Data Fidelity
Remove all synthetic dummy doctors (e.g. Dr. Cruz, Dr. Reyes), hardcoded diagnoses (e.g. I10, J06.9), static wait/consult durations (14.5m, 18.0m), hardcoded clinic names, and mock invoices across all handlers in `services/clinic-api/ClinicEz.Clinic.Application/Features/Reports/Queries/`. Queries must return genuine zero counts and empty lists when no records match the query window. Retrieve actual clinic metadata (clinic name, consultation fee, default share) from `ClinicSettings`.

### R2. High-Performance Server-Side DB Aggregations & Indexing
Refactor memory-heavy in-process iterations (`ToListAsync()` followed by C# LINQ `.Where()` and `.Sum()`) into database-level EF Core aggregations (`SumAsync`, `CountAsync`, `GroupBy` projections). Add composite temporal indexes on `(TenantId, ClinicId, Date/Time)` for `ConsultationEncounters`, `PaymentRecords`, `ClinicalProcedures`, `ClinicLabOrders`, and `QueueItems` in `ApplicationDbContext.cs`.

### R3. Comprehensive Interactive Charting Components (`@clinicez/design-tokens`)
Build responsive, interactive SVG chart components (`TrendLineChart`, `WorkloadBarChart`, `TenderDonutChart`, `MorbidityDistributionChart`) in `apps/clinic-app/components/analytics/` using `react-native-svg` and semantic colors from `@clinicez/design-tokens`. Charts must feature hover/touch tooltips, filter toggles, smooth responsiveness across workstation widths, and full 4-state completion (Skeleton loader, Empty state with CTA, Error state with retry, Active data). Zero hardcoded hex colors or external network dependencies.

### R4. Enterprise-Grade Print-Ready Vector PDF Generation
Implement QuestPDF document builders in `ClinicEz.Clinic.Infrastructure/Services/ClinicDocumentPdfService` and expose streaming endpoints in `ReportsController.cs` (`/api/v1/reports/{reportType}/pdf`). Generate publication-ready vector PDFs for Daily EOD Reconciliation, DOH Outpatient Morbidity Summary, BIR Tax/Discount Audit, and Doctor Shares Settlement. Include institutional letterhead, QR cryptographic verification stamp, multi-page data tables, and print formatting. Update `Dashboard.screen.tsx` to stream and preview these PDFs directly.

## Acceptance Criteria

### Data Authenticity & Query Performance
- [ ] No hardcoded fallback diagnoses, doctors, consult fees, or arbitrary wait-time constants exist in report queries.
- [ ] Empty date ranges or newly provisioned clinics return genuine zero counts and empty lists without mock data injection.
- [ ] EF Core queries execute aggregations (`SumAsync`, `CountAsync`, `GroupBy`) on PostgreSQL rather than loading unpaged entity trees into memory.
- [ ] Composite date indexes are added to `ApplicationDbContext.cs` for `ConsultationEncounters`, `PaymentRecords`, `ClinicalProcedures`, `ClinicLabOrders`, and `QueueItems`.

### Interactive Data Visualization (UI/UX)
- [ ] Interactive charts (Line, Bar, Donut/Pie) render cleanly and responsively in `apps/clinic-app` on mobile (<768px), tablet (768-1023px), and desktop (>=1024px).
- [ ] Hover and touch interactions display exact metrics (currency formatted in Philippine Peso `₱`, case counts, percentages).
- [ ] All 4 UI states (Skeleton loading, Empty state with CTA, Error state with retry, Active data) are explicitly handled.
- [ ] Passes design tokens audit: `cd apps/clinic-app && bun run lint:tokens` passes with 0 violations.
- [ ] Passes network isolation audit: `cd apps/clinic-app && bun run lint:hosts` passes with 0 violations.

### Enterprise Print & PDF
- [ ] Dedicated endpoints exist for streaming vector PDFs:
  - `GET /api/v1/reports/daily-eod/pdf`
  - `GET /api/v1/reports/morbidity/pdf`
  - `GET /api/v1/reports/tax-discounts/pdf`
  - `GET /api/v1/reports/doctor-shares/pdf`
  - `GET /api/v1/reports/analytics/pdf`
- [ ] Generated PDFs contain institutional letterhead (clinic name, address, contact, TIN/Accreditation), cryptographic digest, and QR verification code.
- [ ] The raw monospace `<pre>` receipt print dialog in `Dashboard.screen.tsx` is replaced by official PDF preview/print actions.

### Automated Test Verification
- [ ] `dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj` passes with 0 failures, including empty-dataset assertions.
- [ ] `cd apps/clinic-app && bun test tests` passes with 0 failures.


## 2026-10-20T02:28:31Z

Conduct a rigorous multi-perspective code, architecture, and security review of the ClinicEZ Billing System hardening across `services/clinic-api`, `apps/clinic-app`, `services/billing-api`, and `apps/cashier-app`.

Working directory: /Users/macuser/projects/github/nextstep/clinicez-billing
Integrity mode: development

## Requirements

### R1. Dual-Mode Cashier Routing & Concurrency Audit (`services/clinic-api`)
Review the implementation of `ClinicSettings.CashierMode` (`ClinicDesk` vs `CashierCounter`):
- Audit `CreateInvoiceCommandHandler` and `UpdateInvoiceCommandHandler`: ensure `billing.invoice.requested` is only enqueued to `billing-api` in `CashierCounter` mode, and that `ClinicDesk` mode leaves `BillingRequestedAt` null so local payments never encounter HTTP 409 `PaidAtBillingCounterException`.
- Audit `RecordPaymentCommandHandler`: verify payment allocation, receipt numbering (`OR-YYYYMMDD-XXX`), and idempotency.
- Verify `UpdateInvoiceCommand` (`PUT api/v1/billing/invoices/{id}`) properly recalculates gross, net, and statutory discounts (Senior/PWD 20%, PhilHealth Konsulta 100%) and re-publishes to `billing-api` when counter-owned.

### R2. Clinic Station Settings & UI/UX Audit (`apps/clinic-app`)
Review `GeneralSettingsTab.tsx` and `Settings.screen.tsx` against `@clinicez/design-tokens`:
- Verify strict adherence to design tokens: zero raw hex color values, use of semantic tokens (`theme.colors.primary` Teal `#0D6963`, `surface`, `border`, `textSecondary`), and standard typography scales.
- Verify 4-state lifecycle (Skeleton loading, Error with retry, Empty, Active saved state) and seamless persistence of `cashierMode`.

### R3. Clinical Workstation Non-Disruptive Queue Flow Audit (`apps/clinic-app`)
Review `Consultations.screen.tsx`:
- Confirm that encounter signing does NOT forcefully redirect the doctor to `Billing.screen.tsx`.
- Review the **Post-Encounter Action Dialog**: ensure the primary action is **"Call Next Patient"** (using `nextEligiblePatient`) to maintain clinical momentum, while providing secondary options for printing Rx slips, opening billing, or closing.

### R4. Statement of Account (SOA) Review & Settlement Audit (`apps/clinic-app`)
Review `Billing.screen.tsx`:
- Verify that patients with existing open draft invoices load their Statement of Account (SOA) directly instead of triggering a duplicate invoice error.
- Verify rehydration of consultation fees, ordered procedures, and point-of-care lab tests.
- Verify statutory discount computation (Senior OSCA ID, PWD ID, PhilHealth Konsulta) and seamless settlement via `updateInvoice` + `recordPayment`.
- Confirm advisory banner display when an SOA has been dispatched to the central cashier station.

### R5. Architecture Documentation & Interop Integrity
Review `docs/architecture/billing.md`:
- Verify that documentation accurately reflects the `CashierMode` topology, `UpdateInvoiceCommand`, and post-encounter workstation flows.
- Ensure cross-service interop message schemas (`BillingInvoiceRequestedPayload`, `BillingPaymentConfirmedPayload`) match the shared library contracts.

## Verification Resources & Test Suites

The review team should execute and verify the following test suites in `/Users/macuser/projects/github/nextstep/clinicez-billing`:
1. Clinic API Billing & Cashier Tests:
   `~/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ --filter "FullyQualifiedName~Billing|FullyQualifiedName~Cashier"`
2. Billing API Service Tests:
   `~/.dotnet/dotnet test services/billing-api/ClinicEz.Billing.Tests/`
3. Clinic App Billing & Cashier Mode Test Suite:
   `ln -s /Users/macuser/projects/github/nextstep/clinicez-arch2/node_modules node_modules && ln -s /Users/macuser/projects/github/nextstep/clinicez-arch2/apps/clinic-app/node_modules apps/clinic-app/node_modules && ~/.bun/bin/bun test apps/clinic-app/tests/billing_and_cashier_mode.test.ts && rm node_modules apps/clinic-app/node_modules`
4. Clinic App Fulfillment & Billing Stress Tests:
   `ln -s /Users/macuser/projects/github/nextstep/clinicez-arch2/node_modules node_modules && ln -s /Users/macuser/projects/github/nextstep/clinicez-arch2/apps/clinic-app/node_modules apps/clinic-app/node_modules && ~/.bun/bin/bun test apps/clinic-app/tests/challenger_m2_1_fulfillment_billing_stress.test.ts && rm node_modules apps/clinic-app/node_modules`
5. Cashier App Tests:
   `ln -s /Users/macuser/projects/github/nextstep/clinicez-arch2/node_modules node_modules && ln -s /Users/macuser/projects/github/nextstep/clinicez-arch2/apps/cashier-app/node_modules apps/cashier-app/node_modules && ~/.bun/bin/bun test apps/cashier-app/tests/ && rm node_modules apps/cashier-app/node_modules`
6. Design Tokens Compliance:
   `~/.bun/bin/bun test packages/design-tokens/src/tokens.test.ts`
7. Static Token Audit:
   Verify 0 raw hex color values (`#[0-9a-fA-F]{3,8}`) exist in `Consultations.screen.tsx` and `Billing.screen.tsx`.

## Acceptance Criteria

### Audit Findings & Quality Gates
- [ ] Concurrency and double-payment risk: Confirm no possibility of a 409 conflict in `ClinicDesk` mode and no duplicate payment risk in `CashierCounter` mode.
- [ ] UI/UX Design System Compliance: 100% compliance with `@clinicez/design-tokens` (0 raw hex values).
- [ ] Clinical Momentum: Verified that "Call Next Patient" is the primary autofocused action in the post-encounter flow.
- [ ] SOA Rehydration: Verified that opening an open visit bill loads all consultation line items and permits discount application and receipt generation without false duplicate blocks.
- [ ] Test Suite Execution: All automated test suites report 100% pass rate.
- [ ] Deliver a structured Review & Verification Report detailing findings, risk assessment, and merge readiness.

## 2026-10-20T02:26:31Z

Implement a production-ready, interactive, multi-provider Clinic Calendar feature in apps/clinic-app rooted in @clinicez/design-tokens, featuring Month, Week, Day, and Agenda views, 1-click slot booking, arrival check-in routing, appointment rescheduling, doctor shift overlays, and date-range filtering in services/clinic-api.

Working directory: /Users/macuser/projects/github/nextstep/clinicez-calendar
Integrity mode: development

## Requirements

### R1. Multi-Mode Clinic Calendar Component Suite (@clinicez/design-tokens)
Build an interactive calendar component suite in apps/clinic-app/components/calendar/ supporting Month, Week, Day, and Agenda/List views.
The calendar must strictly consume semantic tokens from @clinicez/design-tokens (via theme.colors), with zero raw hex codes or direct palette.ts imports.
Every view must explicitly implement the 4 core UI/UX states:
- Skeleton loading state with shimmering cells (skeletonBase / skeletonHighlight) matching the calendar grid layout.
- Contextual empty state (EmptyState with calendar icon, explanatory text, and primary Book appointment CTA).
- Actionable error state (ErrorState with retry button).
- Active state with immediate visual confirmation toasts (notify.success).
All appointment chips and cards must visually encode clinical urgency using semantic badges and borders: STAT/Emergency (red), Urgent (orange), Routine (teal), Checked-In (green), Completed (muted), and Cancelled (strikethrough).

### R2. Interactive Slot Booking, Rescheduling & Workstation Quick Actions
Enable clinical desk staff and doctors to:
- Click any empty time slot in Week or Day views to launch the appointment booking modal with the selected Date, Time, and Provider pre-filled.
- Click any scheduled appointment card to open an inspection drawer/modal displaying patient demographics, attending physician, room assignment, reason for visit, and notes.
- Reschedule an appointment via a dedicated modal (AppointmentRescheduleModal) with date/time pickers and reason input, calling clinicService.rescheduleAppointment(id, payload) with conflict detection.
- Fast-track patient arrival with a 1-click Check In action directly into the clinic queue, confirming doctor and room assignment via QueueRoutingSelector.

### R3. Multi-Provider Workstation Day Timeline & Doctor Schedule Overlays
On desktop workstation screens (>=1024px), Day View must support a multi-provider layout where active clinic physicians appear in side-by-side columns against a unified time axis (07:00 to 19:00 with 30-minute intervals).
Display doctor shift schedule templates (working hours vs break times vs on-leave blackout intervals) so staff immediately see when each physician is available or off-duty.
On mobile screens (<768px), seamlessly adapt to an agenda timeline paired with a compact 7-day date selector carousel to prevent horizontal crowding.

### R4. Optimized Server-Side Date-Range & Provider Filtering in services/clinic-api
Enhance GetAppointmentsQuery.cs and AppointmentsController.cs in services/clinic-api to accept optional startDate, endDate, and doctorId query parameters alongside existing date and status, filtering efficiently in PostgreSQL via EF Core without breaking backward compatibility.
Update apps/clinic-app/services/clinicService.ts to support passing date ranges and doctor IDs to getAppointments().

### R5. Integration into Appointments.screen.tsx & Workstation Navigation
Unify the new Calendar views with the existing Appointment List in apps/clinic-app/navigation/screens/Appointments.screen.tsx using a clean SegmentedControl view switcher (Month, Week, Day, Agenda).
Ensure full backward compatibility with all existing route parameters (patientId, patientName, patientCode, date), workstation shortcuts (key 4), search contributor routes, and existing test suites.

## Acceptance Criteria

### Token Compliance & UI/UX Standards
- [ ] Zero hardcoded hex values (#...) or direct palette.ts imports exist in any newly added or modified .ts / .tsx files.
- [ ] cd apps/clinic-app && bun apps/clinic-app/scripts/check-tokens.mjs reports 0 violations and passes cleanly.
- [ ] Urgency levels are visually encoded using semantic tokens: emergency for STAT, urgent for Urgent, and routine/primary for Routine.
- [ ] All 4 interaction states (Skeleton loader, Empty state with CTA, Error state with retry, Active data) are explicitly implemented and verified.
- [ ] Responsive parity verified: Desktop Workstation (>=1024px), Tablet (768-1023px), and Mobile (<768px).

### Calendar Functionality & Desk Workflows
- [ ] Month View calculates correct 7-column Gregorian calendar grids across month transitions, short months, and leap years adhering to Asia/Manila time.
- [ ] Week View renders a 7-day time matrix (07:00 - 19:00) with appointment blocks correctly positioned by scheduled time.
- [ ] Day View renders side-by-side multi-provider columns on workstation widths and overlays doctor shift templates.
- [ ] Clicking an empty slot opens the booking modal pre-populated with that date, time, and doctor.
- [ ] Appointment cards support 1-click inspection, arrival check-in, and rescheduling via clinicService.rescheduleAppointment.

### Automated Verification
- [ ] cd apps/clinic-app && bun run typecheck passes with 0 TypeScript errors.
- [ ] cd apps/clinic-app && bun test tests passes with 0 failures, including new comprehensive calendar view tests.
- [ ] Existing appointment regression tests pass: bun test apps/clinic-app/tests/appointmentsPreselectBooking.test.ts and rosterEdgeStates.test.ts.

## 2026-10-20T08:02:47Z

Implement a production-grade, end-to-end Calendar Appointment Push Notification and Reminder System in ClinicEZ across packages/shared-dotnet, services/clinic-api, services/patient-api, and apps/clinic-app. The system must feature automated scheduled 24-hour and 2-hour advance reminders via a dedicated background service, instant push notifications for appointment lifecycle events (booking, rescheduling, cancellation), doctor staff notifications in the clinic workstation notification center, on-demand manual reminder dispatch from the appointment inspection drawer, and configurable reminder settings strictly governed by @clinicez/design-tokens.

Working directory: /Users/macuser/projects/github/nextstep/clinicez-reminders
Integrity mode: development
Reference skills:
- .agents/skills/clinicez-ui-ux-expert/SKILL.md
- .agents/skills/interop-hub-expert/SKILL.md

## Requirements

### R1. Shared Interoperability Envelope & Contracts (packages/shared-dotnet)
Define the cross-service interop contracts in packages/shared-dotnet:
- In packages/shared-dotnet/Interop/InteropTypes.cs, register public const string PatientAppointmentAlert = "patient.appointment.alert";.
- In packages/shared-dotnet/Interop/Contracts/AppointmentNotificationContracts.cs, define AppointmentAlertKinds:
  - Booked = "appointment_booked"
  - Rescheduled = "appointment_rescheduled"
  - Cancelled = "appointment_cancelled"
  - Reminder24h = "appointment_reminder_24h"
  - Reminder2h = "appointment_reminder_2h"
  - ManualReminder = "appointment_reminder_manual"
- Define PatientAppointmentAlertPayload containing:
  - AppointmentId (Guid), ClinicId (Guid), ClinicName (string), DoctorId (Guid?), DoctorName (string?), ServiceType (string?), ScheduledAtUtc (DateTime), DurationMinutes (int), AlertKind (string), Message (string), TimestampUtc (DateTime).

### R2. Instant Event Push Notifications & Interop Delivery (services/clinic-api, services/patient-api)
- In services/clinic-api, implement IAppointmentNotificationDispatcher and AppointmentNotificationDispatcher:
  - Resolve the patient's linked mobile app account (ClinicPatient.SyncPatientId).
  - When linked, format human-readable messages and enqueue patient.appointment.alert via IInteropPublisher inside the transactional outbox before SaveChanges.
  - Trigger appointment_booked alert on CreateAppointmentCommand.
  - Trigger appointment_rescheduled alert on RescheduleAppointmentCommand and reset Reminder24hSent and Reminder2hSent flags to false so the rescheduled slot receives timely reminders.
  - Trigger appointment_cancelled alert on CancelAppointmentCommand.
- In services/patient-api, implement PatientAppointmentAlertInteropHandler implementing IInteropHandler<PatientAppointmentAlertPayload>:
  - Idempotently record an in-app Notification entity (Type = NotificationType.AppointmentReminder, Category = NotificationCategory.Appointments or Reminders, SourceId = $"appointment:{message.AppointmentId}:{message.AlertKind}").
  - Resolve active device sessions for the patient via IDeviceSessionRepository and dispatch FCM push notifications via IPushNotificationService.SendPushNotificationAsync(token, title, body, action, ct).
  - Register the handler in DependencyInjection.cs.

### R3. Automated Background Reminder Service (services/clinic-api)
- In services/clinic-api/ClinicEz.Clinic.Infrastructure/BackgroundServices/, build AppointmentReminderBackgroundService.cs:
  - Implements BackgroundService running on a periodic 60-second polling cycle.
  - Scans active clinics where EnableAppointmentReminders == true.
  - Evaluates confirmed upcoming appointments:
    - 24-Hour Window: Scheduled between now + 23h and now + 25h where !Reminder24hSent and AppointmentReminder24hEnabled == true. Dispatches appointment_reminder_24h alert and sets Reminder24hSent = true, Reminder24hSentAt = DateTime.UtcNow, LastReminderSentAt = DateTime.UtcNow, LastReminderType = "24h".
    - 2-Hour Window: Scheduled between now + 1h and now + 2.5h where !Reminder2hSent and AppointmentReminder2hEnabled == true. Dispatches appointment_reminder_2h alert and sets Reminder2hSent = true, Reminder2hSentAt = DateTime.UtcNow, LastReminderSentAt = DateTime.UtcNow, LastReminderType = "2h".
  - Atomically records updates to Appointment entity in PostgreSQL.
  - Registered as AddHostedService<AppointmentReminderBackgroundService> in DependencyInjection.cs.
- Add composite indices on Appointment in ApplicationDbContext.cs for performant reminder scanning:
  - entity.HasIndex(e => new { e.Status, e.ScheduledAt, e.Reminder24hSent });
  - entity.HasIndex(e => new { e.Status, e.ScheduledAt, e.Reminder2hSent });
- Add an EF Core migration AddAppointmentRemindersAndNotificationSettings.

### R4. Clinic Staff Notifications & On-Demand Manual Reminder (services/clinic-api, apps/clinic-app)
- In services/clinic-api:
  - Add Appointment = 4 to StaffNotificationCategory in ClinicStaffNotification.cs.
  - When appointments are created, rescheduled, or cancelled, and EnableStaffAppointmentNotifications is active: create a ClinicStaffNotification for the assigned doctor (RecipientStaffId = DoctorId, ActionRoute = "Appointments", ActionParamsJson = { appointmentId, date }).
  - Implement SendAppointmentReminderCommand and expose POST /api/v1/appointments/{id}/remind in AppointmentsController.cs guarded by [HasPermission(ClinicPermissions.AppointmentsManage)]. Dispatches an immediate appointment_reminder_manual push alert and updates LastReminderSentAt = DateTime.UtcNow and LastReminderType = "manual".
- In apps/clinic-app:
  - In AppointmentInspectionModal.tsx, add a Push Notification & Reminder Status section:
    - Display confirmation status and 24h/2h reminder statuses (Sent vs Scheduled).
    - Display last reminder sent timestamp.
    - Provide an interactive "Send Push Reminder" button with icon, loading state, error handling, and notify.success('Appointment push reminder sent to patient.') feedback.
  - In AppointmentCard.tsx, display a reminder bell icon / badge when lastReminderSentAt is present.
  - In ClinicNotificationCenterModal.tsx, add an 'appointments' tab in filter tabs (all | stat | appointments | queue | system), map Appointment category to calendar icon, and navigate to Appointments on press.
  - In services/clinicService.ts, add sendAppointmentReminder(id: string).

### R5. Configurable Reminder Settings Card (services/clinic-api, apps/clinic-app)
- In services/clinic-api:
  - Add to ClinicSettings:
    - bool EnableAppointmentReminders = true;
    - bool AppointmentReminder24hEnabled = true;
    - bool AppointmentReminder2hEnabled = true;
    - bool EnableStaffAppointmentNotifications = true;
  - Expose in ClinicSettingsDto and support in UpdateClinicSettingsCommand and GetClinicSettingsQuery.
- In apps/clinic-app:
  - Build AppointmentReminderSettingsCard.tsx in components/settings/ and embed into GeneralSettingsTab.tsx.
  - Include toggles for Master Reminders, 24-Hour advance reminder, 2-Hour advance reminder, and Staff appointment notifications.
  - Strictly adhere to @clinicez/design-tokens (zero raw hex colors, semantic tokens via theme.colors).

## Acceptance Criteria

### Automated Backend Tests
- [ ] dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~Appointment" passes with 0 failures, including new tests for:
  - AppointmentNotificationDispatcher (booked, rescheduled, cancelled, manual reminders).
  - SendAppointmentReminderCommand (dispatch, timestamp updates, not found error).
  - AppointmentReminderBackgroundService (24h window, 2h window, disabled settings, idempotent skip).
- [ ] dotnet test services/patient-api/ClinicEz.Patient.Application.Tests/ClinicEz.Patient.Application.Tests.csproj passes with 0 failures, verifying PatientAppointmentAlertInteropHandler creates in-app notification and dispatches FCM push notification.
- [ ] dotnet build passes with 0 errors across the solution.

### Automated Frontend Tests & UI/UX Compliance
- [ ] New unit test suite apps/clinic-app/tests/appointmentReminders.test.ts passes with 0 failures, verifying:
  - AppointmentInspectionModal renders reminder status and triggers "Send Push Reminder".
  - AppointmentCard displays reminder bell indicator.
  - AppointmentReminderSettingsCard toggles and persists settings.
  - ClinicNotificationCenterModal filters appointment notifications.
- [ ] cd apps/clinic-app && bun scripts/check-tokens.mjs --strict passes with 0 violations (no raw hex codes).
- [ ] cd apps/clinic-app && bun run typecheck passes with 0 TypeScript errors.


## 2026-10-21T00:05:08Z

Implement the multi-doctor clinic encounter signing, Statement of Account (SOA) drafting, official receipt issuance, and cashier workstation workflows in ClinicEZ, adhering strictly to real clinic practice and `@clinicez/design-tokens` standards.

Working directory: `/Users/macuser/projects/github/nextstep/clinicez-arch2`
Integrity mode: development

## Core Engineering Principles
- **No Backward-Compatibility Compromises**: The codebase is in active development. Do not carry deprecated properties, obsolete legacy columns, or backward-compatibility workarounds. Execute clean, principled domain models and database schemas.
- **Automated EF Core Migrations**: Database migrations MUST NOT be hand-crafted or manually written. They must be generated directly using the EF Core CLI tools (`dotnet ef migrations add <MigrationName> --project services/clinic-api/ClinicEz.Clinic.Infrastructure --startup-project services/clinic-api/ClinicEz.Clinic.Api`) with `export DOTNET_ROOT="/Users/macuser/.dotnet"`.

---

## Requirements

### R1. Multi-Doctor Charge Capture & Single Visit Draft SOA
When doctors sign encounters or execute procedures for a patient visit, their charges must automatically populate or append into a single unified Draft Statement of Account (`INV-...`). If an encounter for that patient or queue item already has an active invoice in `Draft` or `PartiallyPaid`, incoming charges from another doctor or procedure must merge into the existing draft invoice rather than throwing a duplicate `ConflictException (409)`. Strict duplicate blocking must only apply if the existing invoice is already fully `Paid` and `AllowDuplicate` is false.

### R2. Per-Item Clinician Attribution & Clean Invoice Bounding
An invoice is a financial document belonging to the Clinic Facility (`ClinicId`, `TenantId`), while clinical responsibility belongs to individual practitioners.
- Add `DoctorId` (Guid?) and `DoctorName` (string?) directly to `InvoiceLineItem` (and corresponding DTOs, request models, and print structures).
- Remove reliance on a single/comma-separated `AttendingDoctorName` on `Invoice`. The invoice is bounded to the clinic; line items carry the clinician attribution.
- Each line item on the invoice must clearly state which clinician charged it (e.g. `Consultation • Dr. Wave Ambray`, `Tooth Restoration • Dr. Allan Santos`).
- Ensure `GetDoctorSharesReportQuery` computes doctor revenue share accurately based on line-item clinician attribution (`InvoiceLineItem.DoctorId` / `DoctorName`).

### R3. Document Separation: Statement of Account vs. Official Receipt
Clearly separate the Billing Statement from the Payment Receipt:
- **Invoice / Statement of Account (`INV-YYYYMMDD-###`)**: Generated upon clinical charge capture; starts as `Draft` and transitions to `Paid` only upon settlement. Can be printed as a Statement of Account (SOA).
- **Official Receipt (`OR-YYYYMMDD-###`)**: Generated strictly upon payment collection; carries its own official receipt number, cashier name, payment method breakdown (Cash/GCash/Maya/Card), tendered/change details, and BIR tax compliance notices. Can be printed as POS Thermal (58/80mm) or Professional A4 Official Receipt.

### R4. Cashier Workstation UI/UX & Queue Lifecycle
Update the Billing screen (`Billing.screen.tsx`) using `@clinicez/design-tokens` and clinical workstation UX guidelines:
- **Tabbed Queue Navigation**: Provide tabs for `Active Queue`, `Unsettled / Promissory`, and `Billed & Paid Today`.
- **Cross-Date Draft Retrieval**: Automatically fetch open draft SOAs across date boundaries so night-shift or yesterday's draft invoices are seamlessly linked when selecting a patient.
- **Defensive Cashiering**: Cashiers can freely adjust quantities, delete items, add clinic supplies/meds with practitioner attribution, and apply statutory Senior/PWD discounts. Never dead-end the cashier with a blocking error alert.
- **"Defer / Promissory Note" Action**: Allow cashiers to discharge patients who cannot pay today with an audit reason and due date, moving them to `Unsettled / Promissory` and updating the End-of-Day audit report's `TotalUnpaidBalances`.

### R5. Encounter Signing UX Alignment
In `Consultations.screen.tsx`, update the signing flow and feedback modals to reflect real clinic operations: the doctor signs the clinical chart and posts a **Charge Slip / Draft SOA** to the cashier. If another doctor has already signed for this visit, the charges merge smoothly without error.

---

## Acceptance Criteria

### Backend Multi-Doctor & Invoice Logic
- [ ] `InvoiceLineItem` entity, DTOs, and mappings include `DoctorId` (Guid?) and `DoctorName` (string?).
- [ ] Database migration is generated cleanly via `dotnet ef migrations add AddDoctorToInvoiceLineItem --project services/clinic-api/ClinicEz.Clinic.Infrastructure --startup-project services/clinic-api/ClinicEz.Clinic.Api`.
- [ ] Calling `CreateInvoiceCommand` on a queue item that already has a `Draft` or `PartiallyPaid` invoice appends the new line items into the existing draft and returns the updated invoice without throwing a 409 conflict.
- [ ] Calling `CreateInvoiceCommand` on an already `Paid` invoice still throws `ConflictException` unless `AllowDuplicate: true`.
- [ ] `GetDoctorSharesReportQuery` attributes revenue accurately to each doctor based on `InvoiceLineItem.DoctorId` / `DoctorName`.
- [ ] `GetInvoicesQuery` supports fetching open `Draft` invoices across date boundaries when `Status == Draft` and `Date == null`.

### Frontend Cashier Workstation & UX Standards
- [ ] The Billing screen provides a 3-way tabbed view: `Active Queue`, `Unsettled / Promissory`, and `Billed & Paid Today`.
- [ ] Selecting a patient in the queue automatically binds to their open Draft SOA, even if created on a previous date.
- [ ] Each line item in the review list displays the charging physician's name and category badge.
- [ ] Cashiers can add items, change quantities, remove items, and apply Senior/PWD 20% discounts with live subtotal updates.
- [ ] Clicking "Collect & Issue Receipt" updates the draft invoice to `Paid` and generates a separate Official Receipt (`OR-...`).
- [ ] The receipt completion modal offers distinct print actions: `Thermal POS (58/80mm)`, `Professional OR (A4)`, and `Statement of Account (PDF)`.
- [ ] Clicking "Defer / Promissory Note" moves the patient from `Active Queue` to `Unsettled / Promissory`, leaves the invoice open, and logs the receivable.
- [ ] No unhandled or dead-end alerts when collecting payment or managing queue encounters.

### Verification Suite
- [ ] Backend tests pass:
  ```bash
  export DOTNET_ROOT="/Users/macuser/.dotnet"
  export PATH="/Users/macuser/.dotnet:/Users/macuser/.dotnet/tools:$PATH"
  dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~Invoice"
  ```
- [ ] Frontend tests pass:
  ```bash
  export PATH="/Users/macuser/.bun/bin:$PATH"
  bun test apps/clinic-app/tests/billingReceiptAndSoaReview.test.ts apps/clinic-app/tests/billing_and_cashier_mode.test.ts
  ```
- [ ] Type check passes with 0 errors: `cd apps/clinic-app && bun x tsc --noEmit`


## 2026-10-21T08:13:16Z

Independent architectural review, security validation, and deployment confirmation of the Clinic File Storage migration to S3-compatible object storage (supporting both Cloudflare R2 and private subscriber on-premise servers such as MinIO and Ceph) across clinic-api.

Working directory: c:\Users\User\projects\nextstep\github\clinicez-arch2
Integrity mode: development

## Requirements

### R1. Architecture & Provider Abstraction Review
Review the storage abstraction and DI wiring in services/clinic-api/ClinicEz.Clinic.Infrastructure:
- IClinicStorageService contract supporting byte array and stream overloads (SaveEncryptedStreamAsync, OpenReadEncryptedStreamAsync).
- S3ClinicStorageAdapter: Generalized S3 client supporting custom on-premise endpoints (S3:ServiceUrl), path-style addressing (ForcePathStyle), and Cloudflare R2 fallback resolution.
- R2ClinicStorageService: Clean specialization for Cloudflare R2.
- FallbackClinicStorageService: Read fallback bridge ensuring zero downtime during migration.
- DependencyInjection.cs: Storage provider configuration resolving "S3", "R2", and "Local".

### R2. Cryptographic Security & Multi-Tenancy Boundary Audit
Audit the encryption pipeline against zero-knowledge Clinic Master Key (CMK) requirements:
- Ensure files are encrypted with AES-256-GCM via ClinicEncryptionService using per-file DEKs wrapped with HKDF-derived CMK before reaching storage.
- Confirm that the S3 storage bucket contains solely opaque .cez ciphertexts with zero plaintext patient data or PHI in object keys or metadata.
- Verify strict folder partitioning per tenant and clinic (tenants/{tenantId}/clinics/{clinicId}/records/{attachmentId}.cez and tenants/{tenantId}/clinics/{clinicId}/lab-results/{resultId}.cez).
- Confirm that cross-tenant decryption attempts fail authentication tag verification.

### R3. On-Premise Subscriber & Cloud S3 Compatibility
Verify that on-premise subscribers hosting their own storage servers (e.g., MinIO, Ceph, Wasabi, Dell EMC ECS) can configure S3:ServiceUrl and authentication credentials seamlessly, while cloud instances default to Cloudflare R2.

### R4. Deployment & Migration Runbook Verification
Audit deployment configs and one-time migration tooling:
- deploy/clinic-api/docker-compose.yml: Correct environment variable mapping (Storage__*, S3__*, R2__*) and volume retention.
- .github/workflows/deploy-clinic-api-dev.yml: GitHub secrets mapping and validation logic.
- scripts/migrate-clinic-storage-to-r2.sh and scripts/migrate-clinic-storage-to-r2.ps1: Idempotent migration script supporting dry-run and custom S3 endpoints.
- Documentation in docs/architecture/data-ownership.md and docs/deployment-configuration.md.

## Verification Resources

- Test suite: services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj
- S3 & Fallback Unit Tests: R2ClinicStorageServiceTests.cs, FallbackClinicStorageServiceTests.cs
- Cryptographic Round-Trip & Boundary Tests: ClinicStorageEncryptionIntegrationTests.cs
- Architecture Reference: clinic-file-storage-migration-plan.md

## Acceptance Criteria

### Security & Functional Criteria
- [ ] Zero unencrypted data or PHI is stored in S3 object keys or S3 custom metadata headers.
- [ ] Storage keys strictly adhere to tenants/{tenantId}/clinics/{clinicId}/records/{id}.cez and tenants/{tenantId}/clinics/{clinicId}/lab-results/{id}.cez.
- [ ] Attempting to decrypt Tenant A's ciphertext using Tenant B's credentials throws CryptographicException.
- [ ] All unit and integration tests pass with zero failures: dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj.
- [ ] Solution compiles cleanly with zero warnings or errors: dotnet build services/clinic-api/ClinicEz.Clinic.Infrastructure/ClinicEz.Clinic.Infrastructure.csproj.
- [ ] Migration scripts (.sh and .ps1) operate idempotently without modifying source ciphertext or re-uploading identical existing keys.


## 2026-10-21T11:26:25Z

Full multi-agent team.

Add Cloudflare Turnstile bot challenge protection across all ClinicEZ public entry point forms (Contact Us, Newsletter subscription, and Patient Self-Intake Join) with defense-in-depth verification enforced across both the Next.js BFF route handlers and ASP.NET Core portal-api endpoints, while relying on Clerk Attack Protection for authentication entry points.

Working directory: c:\Users\User\projects\nextstep\github\clinicez-arch2
Integrity mode: development

## Requirements

### R1. Client-Side Challenge Integration
Integrate non-intrusive bot challenge execution into public entry point forms in @clinicez/portal-web (Contact Us, Newsletter subscription, and Patient Self-Intake Join), ensuring challenge tokens are automatically acquired on interaction/submission and attached to request payloads.

### R2. BFF Route Handler Verification
Enforce server-side verification of incoming challenge tokens in Next.js App Router public API routes (/api/v1/public/contact, /api/v1/public/newsletter, /api/v1/public/join) using Cloudflare's siteverify endpoint before proxying requests to upstream microservices. Reject invalid, expired, or missing tokens with 403 Forbidden.

### R3. Backend Core API Defense-in-Depth
Validate challenge tokens within the ASP.NET Core portal-api endpoints (/contact, /public/newsletter, /public/join) so that direct API invocations cannot bypass client-side verification.

### R4. Development and Testing Compatibility
Provide automatic fallback to official Cloudflare test keys (1x00000000000000000000AA / 1x0000000000000000000000000000000AA) when environment credentials are not supplied, ensuring local development and CI pipelines run without external friction.

## Acceptance Criteria

### Automated Token Verification
- [ ] Requests to /api/v1/public/contact, /api/v1/public/newsletter, and /api/v1/public/join without a challenge token or with an invalid token receive a 400 or 403 response.
- [ ] Requests with a valid challenge token succeed and proceed to normal processing.
- [ ] services/portal-api rejects direct invalid submissions when bot protection is active.

### Build and Test Integrity
- [ ] dotnet test services/portal-api/ClinicEz.Portal.Tests passes with new test coverage for token validation.
- [ ] Next.js unit and integration tests pass for the new verification helper and route handlers.
- [ ] Full workspace build and typecheck (bun run typecheck, bun run lint) complete without errors.
