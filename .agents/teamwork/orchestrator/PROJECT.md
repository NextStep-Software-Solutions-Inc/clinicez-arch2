# Project: Clinic EZ Comprehensive Clinic Features Architecture & Implementation Plan

## Architecture Overview
Clinic EZ is a multi-tenant clinic management system and PhilHealth Konsulta accredited EMR.
The core architecture consists of:
- **Backend Services**:
  - `services/clinic-api/`: .NET 9 ASP.NET Core Clean Architecture (`ClinicEz.Clinic.Domain`, `.Application`, `.Infrastructure`, `.Api`). Multi-tenant schema isolation, MediatR CQRS, EF Core with PostgreSQL.
  - `services/philhealth-proxy/`: Manages PhilHealth accreditation, cipher encryption, XML generation (`KonsultaData_v1.14.dtd`), and transmittal submissions.
  - `services/patient-api/`: Patient identity and immunization records (`VaccinationAdministered`).
  - `services/interop-hub/`: Messaging hub using transactional outbox and HTTP-based bus envelopes.
- **Frontend Applications**:
  - `apps/clinic-app/`: React Native 0.85.3, Expo SDK 56, React Navigation v8 static navigation, responsive workstation/mobile layouts, Lucide icons, `react-native-svg`.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1.1 | Doctor Working Hours & Shift Templates | Weekly recurring templates (Mon-Sun), effective dates, active status | M1 (R1) | Explorer 1 & 2 |
| F1.2 | Doctor Shifts & Break Times | Granular shifts, custom break intervals, slot intervals (15/20/30/60m) | M1 (R1) | Explorer 1 & 2 |
| F1.3 | Doctor Leaves & Blackout Dates | Planned leave, emergency blackout dates, sick leave blocking | M1 (R1) | Explorer 1 & 2 |
| F1.4 | Slot Availability Query Engine | Real-time generation of bookable slots minus appointments and breaks | M1 (R1) | Explorer 1 & 2 |
| F1.5 | Double-Booking Prevention | Concurrency handling, DB exclusion constraints, 409 Conflict logic | M1 (R1) | Explorer 1 & 2 |
| F1.6 | Frontend Rostering & Slot Picker UI | Roster calendar modal, shift editor, interactive slot picker in Appointments | M1 (R1) | Explorer 3 |
| F2.1 | PhilHealth Statutory Immunization Libraries | 1:1 mapping with `lib_immchild`, `lib_immyoungw`, `lib_immpregw`, `lib_immelderly`, `OtherImm` | M2 (R2) | Explorer 1 |
| F2.2 | Statutory Fallback 999 Compliance | Mandatory "999" ("None / Not Given") fallback guaranteeing valid `<IMMUNIZATION+>` XML | M2 (R2) | Explorer 1 |
| F2.3 | Relational Immunization Domain Model | `PatientImmunization` entity with lot, batch, expiry, dose number, injection site, AEFI remarks | M2 (R2) | Explorer 1 & 2 |
| F2.4 | Point-of-Care Immunization Administration UI | Mobile/workstation modal, 2D barcode scanning, injection site picker, AEFI capture | M2 (R2) | Explorer 3 |
| F2.5 | Cross-Service Interop Hub Sync | `clinical.immunization.administered` event envelope syncing to `patient-api` | M2 (R2) | Explorer 1 |
| F3.1 | Structured Patient Problem List | `PatientProblem` entity, ICD-10 coding (`lib_icd`), active/resolved/chronic, onset/resolved dates | M3 (R3) | Explorer 2 |
| F3.2 | Structured Allergies & Severity Classification | `PatientAllergy` entity (drug, food, env), mild/moderate/severe, anaphylaxis flag | M3 (R3) | Explorer 2 |
| F3.3 | Clinical Decision Support (CDS) Integration | Refactor CDS evaluator to check structured `PatientAllergy` records against prescribed drugs | M3 (R3) | Explorer 2 |
| F3.4 | Longitudinal NCD Biomarkers & PhilPEN 24 | Relational `NcdRiskAssessment`, PhilPEN Q1-Q24, BP/HbA1c/glucose tracking, WHO/ISH risk | M3 (R3) | Explorer 1 & 2 |
| F3.5 | Frontend Problem List & NCD Trends UI | `ProblemListManager`, `AllergyManagerModal`, SVG-based `NcdTrendChart` | M3 (R3) | Explorer 3 |
| F4.1 | Clinical SOAP Templating Engine | Specialty SOAP templates (General, Pedia, OB-GYN, Cardio), clinical macros ("dot-phrases") | M4 (R4) | Explorer 2 |
| F4.2 | Structured Physical Exam Checklists | 1-click "All Essentially Normal" mapping 1:1 to PhilHealth organ tags (`<PE_GENSURVEY>`, etc.) | M4 (R4) | Explorer 1 & 2 |
| F4.3 | WHO Pediatric Growth Calculator Engine | LMS Box-Cox formulas and `lib_zscore.json` statutory lookup tables (0-59 months) | M4 (R4) | Explorer 1 & 2 |
| F4.4 | Frontend SOAP Templates & Growth Chart UI | `SoapTemplateSelector`, `PhysicalExamChecklist`, interactive `WhoGrowthChartVisualizer` with curves | M4 (R4) | Explorer 3 |
| F4.5 | Bi-directional Yakap XML Mapper Alignment | 100% loss-free mapping of vitals, anthropometrics, SOAP, diagnoses to `<PROFILE>` and `<SOAP>` | M4 (R4) | Explorer 1 |
| F5.1 | Master Specification Document Compilation | Full compilation into `docs/plans/comprehensive-clinic-features-plan.md` | M5 (R5) | Orchestrator |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Doctor Rostering & Slot Availability Engine (R1) | F1.1 - F1.6 | none | DONE |
| M2 | PhilHealth-Case1 Immunization Management (R2) | F2.1 - F2.5 | none | DONE |
| M3 | Structured Problem List, Allergies & NCD Care (R3) | F3.1 - F3.5 | none | DONE |
| M4 | Clinical SOAP Templates & Pediatric Growth Charts (R4) | F4.1 - F4.5 | M3 | DONE |
| M5 | Master Specification Document Compilation (R5) | F5.1 (All M1-M4) | M1, M2, M3, M4 | DONE |

---

## Code Layout
```
services/clinic-api/
  ClinicEz.Clinic.Domain/Entities/
    DoctorScheduleTemplate.cs
    DoctorShift.cs
    DoctorBreakTime.cs
    DoctorLeave.cs
    PatientImmunization.cs
    PatientProblem.cs
    PatientAllergy.cs
    NcdRiskAssessment.cs
    ClinicalSoapTemplate.cs
    PediatricGrowthMeasurement.cs
  ClinicEz.Clinic.Infrastructure/
    Persistence/ApplicationDbContext.cs
    Persistence/Configurations/
    PhilHealth/Catalog/Seed/lib_zscore.json
  ClinicEz.Clinic.Application/
    Features/Scheduling/
    Features/Immunizations/
    Features/ClinicalRecords/
    Features/Yakap/Services/YakapClinicalMapper.cs
apps/clinic-app/
  navigation/screens/
    Appointments.screen.tsx
    Consultations.screen.tsx
    Patients.screen.tsx
  components/scheduling/
    DoctorRosterCalendarModal.tsx
    SlotPicker.tsx
  components/clinical/
    VaccineAdminModal.tsx
    ProblemListManager.tsx
    AllergyManagerModal.tsx
    NcdTrendChart.tsx
    SoapTemplateSelector.tsx
    PhysicalExamChecklist.tsx
    WhoGrowthChartVisualizer.tsx
docs/plans/
  comprehensive-clinic-features-plan.md
```
