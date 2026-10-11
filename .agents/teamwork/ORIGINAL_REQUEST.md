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
