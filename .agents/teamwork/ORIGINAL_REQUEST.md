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
