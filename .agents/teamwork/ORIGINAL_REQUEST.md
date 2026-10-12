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
