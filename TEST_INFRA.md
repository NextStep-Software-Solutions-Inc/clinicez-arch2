# E2E Test Infra: Clinic Patient List, Dashboard UI/UX & Queue/Filter Enhancements

## Test Philosophy
- **Opaque-Box & Requirement-Driven**: Tests are derived strictly from `ORIGINAL_REQUEST.md`, `PROJECT.md`, and `clinic_patient_list_and_dashboard_ui_ux_plan.md`, validating observable contracts, user flows, state transitions, and UI component outputs.
- **4-Tier Testing Methodology**:
  - **Tier 1 (Feature Coverage)**: Isolated behavioral verification of all 20 features (F1 to F20) defined in `PROJECT.md § Feature Inventory`.
  - **Tier 2 (Boundary & Corner Cases)**: Edge conditions, empty states, age boundary thresholds (59 vs 60), doctors on leave, missing contact info, multiple room assignments, and ticket sequence formatting.
  - **Tier 3 (Cross-Feature Combinations)**: Multi-step workflows connecting directory filters, scheduling dialogs, multi-service check-in, ticket generation, and live dashboard cluster updates.
  - **Tier 4 (Real-World Application Scenarios)**: Realistic end-to-end clinical workstation operations reflecting daily Philippine outpatient clinic routines.

---

## Feature Inventory & Test Mapping

| # | Feature | Requirement Source | Tier 1 | Tier 2 | Tier 3 | Primary Test Target |
|---|---------|---------------------|:------:|:------:|:------:|---------------------|
| **F1** | 'My patients' Toolbar Tab | ORIGINAL_REQUEST R1, PROJECT.md F1 | ✓ | ✓ | ✓ | `Patients.screen.tsx`, `SegmentedControl.tsx` |
| **F2** | Doctor Patient Ownership Filter | ORIGINAL_REQUEST R1, PROJECT.md F2 | ✓ | ✓ | ✓ | `Patients.screen.tsx`, `clinicService.ts` |
| **F3** | Nurse Patient Ownership Filter | ORIGINAL_REQUEST R1, PROJECT.md F3 | ✓ | ✓ | ✓ | `Patients.screen.tsx`, `clinicService.ts` |
| **F4** | Backend Query `MY_PATIENTS` Filter Contract | ORIGINAL_REQUEST R1, PROJECT.md F4 | ✓ | ✓ | ✓ | `GetClinicPatientsQuery.cs` |
| **F5** | Reactive MyPatients Count | ORIGINAL_REQUEST R1, PROJECT.md F5 | ✓ | ✓ | ✓ | `GetClinicPatientCountsQuery.cs` |
| **F6** | Relabel "Schedule visit" Button | ORIGINAL_REQUEST R2, PROJECT.md F6 | ✓ | ✓ | ✓ | `PatientDirectoryCard.tsx` (Card/Table/Menu) |
| **F7** | In-Place `ScheduleVisitModal.tsx` | ORIGINAL_REQUEST R2, PROJECT.md F7 | ✓ | ✓ | ✓ | `ScheduleVisitModal.tsx` |
| **F8** | Dynamic Doctor Shift Slots | ORIGINAL_REQUEST R2, PROJECT.md F8 | ✓ | ✓ | ✓ | `clinicService.getDoctorAvailableSlots` |
| **F9** | Post-Appointment Setup Dialog (4 Actions) | ORIGINAL_REQUEST R2, PROJECT.md F9 | ✓ | ✓ | ✓ | `ScheduleVisitModal.tsx` |
| **F10** | Relabel "Queue Patient" Button | ORIGINAL_REQUEST R3, PROJECT.md F10 | ✓ | ✓ | ✓ | `PatientDirectoryCard.tsx` |
| **F11** | ActionMenu Direct Service Intents | ORIGINAL_REQUEST R3, PROJECT.md F11 | ✓ | ✓ | ✓ | `PatientDirectoryCard.tsx` (ActionMenu) |
| **F12** | Dedicated `ServiceCheckInModal.tsx` (4 Views) | ORIGINAL_REQUEST R3, PROJECT.md F12 | ✓ | ✓ | ✓ | `ServiceCheckInModal.tsx` |
| **F13** | Prefix Ticket Series System (`Q`/`SQ`, `V`/`SV`, `P`/`SP`, `A`/`SA`) | ORIGINAL_REQUEST R3, PROJECT.md F13 | ✓ | ✓ | ✓ | Ticket Series Generation Engine |
| **F14** | Senior/PWD Priority Auto-Selection | ORIGINAL_REQUEST R3, PROJECT.md F14 | ✓ | ✓ | ✓ | Age & ID Auto-Selector Logic |
| **F15** | Backend `SeriesPrefix` Support Contract | ORIGINAL_REQUEST R3, PROJECT.md F15 | ✓ | ✓ | ✓ | `CheckInPatientCommand.cs` |
| **F16** | Domain Boundary Enforcement | ORIGINAL_REQUEST R3, PROJECT.md F16 | ✓ | ✓ | ✓ | Workstation Boundary Gatekeeper |
| **F17** | Dashboard Toolbar Cleanup (Removed TV & EOD) | ORIGINAL_REQUEST R4, PROJECT.md F17 | ✓ | ✓ | ✓ | `Dashboard.screen.tsx` |
| **F18** | 4 Semantic Clusters for Actions | ORIGINAL_REQUEST R4, PROJECT.md F18 | ✓ | ✓ | ✓ | `Dashboard.screen.tsx` Action Groups |
| **F19** | Formatted Service Badges (Semantic Badges) | ORIGINAL_REQUEST R4, PROJECT.md F19 | ✓ | ✓ | ✓ | Badge Formatter & Token Styler |
| **F20** | Zero Jargon Clinical UI Copy | ORIGINAL_REQUEST R5, PROJECT.md F20 | ✓ | ✓ | ✓ | UI Copy & Clinical Language Validator |

---

## Test Architecture

- **Test Runner**: Bun test runner (`bun test`) executing headless React Native and TypeScript suites.
- **Locations**:
  - `apps/clinic-app/tests/e2e_clinicPatientWorkflows.test.ts`: Master E2E suite executing Tiers 1 through 4 across all 20 features.
  - `apps/clinic-app/tests/patientDirectoryUi.test.ts`: Directory cards, table mode, and demographic line tests.
  - `apps/clinic-app/tests/queueDashboardControls.test.ts`: Queue dashboard control logic and action guards.
- **Execution Command**:
  ```bash
  cd apps/clinic-app && bun test tests/e2e_clinicPatientWorkflows.test.ts
  ```

---

## Real-World Application Scenarios (Tier 4)

| # | Scenario | Features Exercised | Clinical Workflow Summary | Complexity |
|---|----------|--------------------|---------------------------|------------|
| **S1** | **Outpatient Morning Rush: Doctor Consultation** | F1, F2, F6, F10, F11, F12, F13, F18, F19, F20 | Walk-in patient arrives with acute fever and cough. Receptionist queues patient for Dr. Santos in Consultation Room 101. Regular ticket `Q-001` is generated. Dr. Santos sees ticket in Care & Encounter cluster, calls patient, conducts examination, and completes consultation. | High |
| **S2** | **Walk-In Vitals Triage (Nursing Bay)** | F3, F10, F12, F13, F14, F18, F19, F20 | Senior citizen (72 yo with Senior ID) arrives for routine hypertension monitoring. System automatically defaults to Senior & PWD Priority series `SV-001`. Triage nurse records vitals (BP, HR, SpO2) and completes non-doctor triage discharge without doctor presence or SOAP note. | Medium |
| **S3** | **Minor Treatment Bay Clinical Procedure** | F3, F10, F11, F12, F13, F18, F19, F20 | Walk-in patient requires wound dressing change for arm laceration ordered by outside physician. Staff uses ActionMenu direct intent "Clinical Procedure". Ticket `P-001` is issued. Treatment bay nurse claims ticket, performs dressing change, records procedural notes, and completes visit. | High |
| **S4** | **Administrative Fit-to-Work Clearance with Scheduled Follow-up** | F6, F7, F8, F9, F11, F12, F13, F18, F19, F20 | Employee patient requests medical fit-to-work clearance. Staff issues administrative ticket `A-001`. Patient also requires a 2-week follow-up visit. Staff clicks "Schedule visit" directly from patient card, checks doctor's dynamic shift slots, confirms visit, and triggers patient SMS notification from the 4-button post-appointment dialog. | High |
| **S5** | **Emergency Critical Walk-in with ER Diversion** | F10, F12, F13, F18, F19, F20 | Walk-in patient presents with severe chest pain and diaphoresis. Priority escalated to Emergency. Ticket `Q-002` flagged with critical indicator. Staff triggers "Divert to ER" in Emergency cluster, capturing transport ambulance, hospital destination, escort paramedic, and clinical handover notes. Ticket status transitions to `Diverted`. | High |

---

## Coverage Thresholds and Quality Gates

1. **Feature Coverage**: 100% of the 20 features (F1 to F20) verified in Tier 1.
2. **Boundary Resilience**: Zero regressions on empty lists, 59 vs 60 age boundaries, missing contact information, and off-duty doctor slot requests.
3. **Zero Jargon Compliance**: All labels, dialog titles, buttons, and helper texts verified against plain everyday clinic copy (no statutory RA codes, no database terminology).
4. **Design Token Adherence**: Verified compliance with `@clinicez/design-tokens` (teal `#0D6963`, semantic variants, typography scales).
