# Project: Clinic Patient List and Dashboard UI/UX Enhancements & Backend Queue/Filter Support

## Architecture

ClinicEZ is an outpatient clinic electronic health record and clinical workstation system. This project enhances the Clinic Patient Directory (`apps/clinic-app/navigation/screens/Patients.screen.tsx`), Patient Directory Card/Table components (`apps/clinic-app/components/patient/PatientDirectoryCard.tsx`), live Queue Dashboard (`apps/clinic-app/navigation/screens/Dashboard.screen.tsx`), and the backend CQRS query/command endpoints (`services/clinic-api`).

The system strictly adheres to:
1. **ClinicEZ Design Tokens (`@clinicez/design-tokens`)**: Teal `#0D6963` brand palette, semantic badge variants, design token scales, zero raw emojis/pictographs in JSX strings.
2. **Everyday Clinic Language (Zero Jargon)**: Plain clinic terminology without statutory numbers ("RA 9994", "RA 7277") or database/technical jargon.
3. **Clinical Domain Boundaries**: Clinic care (SOAP notes, vitals, procedures, clearances) stays in `clinic-app` / `clinic-api`; diagnostic specimen collection stays in `laboratory-app`; pharmacy claims stay in `pharmacy-app`; cashier settlement stays in `cashier-app`.
4. **No Backward Compatibility Constraints**: Clean removal of legacy or obsolete artifacts.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Workstation Frontend                            │
│                                                                        │
│  Patients.screen.tsx                                                   │
│   ├── Segmented Toolbar: ALL | MY_PATIENTS | STUDENTS | EMPLOYEES ...  │
│   ├── PatientDirectoryCard.tsx (Card & Compact Table modes)            │
│   │    ├── "Schedule visit" ──► ScheduleVisitModal.tsx                │
│   │    │                          ├── Dynamic Doctor Shift Slots       │
│   │    │                          └── 4-Button Post-Setup Dialog       │
│   │    ├── "Queue Patient"  ──► ServiceCheckInModal.tsx               │
│   │    └── ActionMenu (⋮)   ──► 4 Direct Service Intents               │
│   │                                 ├── Doctor Consultation (Q / SQ)   │
│   │                                 ├── Vitals Check Only (V / SV)     │
│   │                                 ├── Clinical Procedure (P / SP)    │
│   │                                 └── Administrative (A / SA)        │
│   │                                 └── Auto Senior/PWD Priority       │
│   └── Dashboard.screen.tsx                                             │
│        ├── Removed: TV Board & Force EOD buttons                       │
│        ├── Formatted Semantic Service Badges                           │
│        └── 4 Semantic Clusters: Care | Flow | Exceptions | Emergency   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / JSON API
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       Backend API: clinic-api                          │
│                                                                        │
│  Queries:                                                              │
│   ├── GetClinicPatientsQuery: supports filterMode == "MY_PATIENTS"     │
│   └── GetClinicPatientCountsQuery: computes MyPatients count           │
│  Commands:                                                             │
│   └── CheckInPatientCommand: supports SeriesPrefix for prefix-specific │
│       sequential queue numbers (Q-001, SQ-001, V-001, etc.)            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | 'My patients' Toolbar Tab | Add 'My patients' tab as 2nd tab in `Patients.screen.tsx` (`ALL`, `MY_PATIENTS`, `STUDENTS`, `EMPLOYEES`, `ALERTS`, `SENIOR_PWD`) | M1 | Survey |
| 2 | Doctor Patient Ownership Filter | Filter patients assigned to or seen by current doctor (`assigned_doctor_id`, `doctor_id`, or active queue item doctor) | M1 | Survey |
| 3 | Nurse Patient Ownership Filter | Filter patients whose vitals were recorded by this nurse or assigned to nurse's rooms (`assignedRoomIds`) | M1 | Survey |
| 4 | Backend Query `MY_PATIENTS` Filter | Support `filterMode == "MY_PATIENTS"` and optional `StaffId`/`DoctorId` in `GetClinicPatientsQuery.cs` | M1 | Survey |
| 5 | Reactive MyPatients Count | Update `GetClinicPatientCountsQuery.cs` and `PatientDirectoryCountsDto.cs` to return `MyPatients` count | M1 | Survey |
| 6 | Relabel "Schedule visit" Button | Relabel button from "Book appointment" to "Schedule visit" on card, compact table, and ActionMenu | M2 | Survey |
| 7 | In-Place `ScheduleVisitModal.tsx` | Implement in-place scheduling modal pre-selecting patient with identity banner, doctor picker, dates, and times | M2 | Survey |
| 8 | Dynamic Doctor Shift Slots | Dynamically load attending doctor available shift slots via `clinicService.getDoctorAvailableSlots(doctorId, date)` | M2 | Survey |
| 9 | Post-Appointment Setup Dialog | Display 4 distinct action buttons: "Notify patient (SMS / App)", "Set new", "Close", and "Open appointment screen" | M2 | Survey |
| 10 | Relabel "Queue Patient" Button | Relabel primary check-in CTA button on card and compact table from "Add to queue" to "Queue Patient" | M3 | Survey |
| 11 | ActionMenu Direct Service Intents | Add direct one-click actions under "Services & Queue" in ActionMenu: Doctor Consultation, Vitals Check, Clinical Procedure, Administrative & Clearance | M3 | Survey |
| 12 | Dedicated `ServiceCheckInModal.tsx` | Implement dedicated check-in modal with specialized views for each of the 4 clinical services | M3 | Survey |
| 13 | Prefix Ticket Series System | Generate Regular series (`Q`, `V`, `P`, `A`) vs Senior & PWD Priority series (`SQ`, `SV`, `SP`, `SA`) tickets | M3 | Survey |
| 14 | Senior/PWD Priority Auto-Selection | Automatically default ticket series to Priority (`SQ`, `SV`, `SP`, `SA`) if patient age >= 60 or has Senior/PWD ID | M3 | Survey |
| 15 | Backend `SeriesPrefix` Support | Extend `CheckInPatientCommand.cs` to accept `SeriesPrefix` and compute prefix-isolated monotonic sequences (`$"{{SeriesPrefix}}-{{nextSequence:D3}}"`) | M3 | Survey |
| 16 | Domain Boundary Enforcement | Strictly maintain clinic care vs lab analyzer draws (`laboratory-app`) and pharmacy claim redemption (`pharmacy-app`) | M3 | Survey |
| 17 | Dashboard Toolbar Cleanup | Remove "Open TV Board" and "Force EOD / Close Day" buttons from live queue toolbar in `Dashboard.screen.tsx` | M4 | Survey |
| 18 | 4 Semantic Clusters for Actions | Group queue item action buttons into 4 clusters: Care & Encounter, Flow & Completion, Exceptions, Emergency: Divert to ER | M4 | Survey |
| 19 | Formatted Service Badges | Map raw enum strings (`VitalsCheckOnly`, `StandaloneProcedure`, `AdministrativeDocument`, `Consultation`) to styled semantic badges | M4 | Survey |
| 20 | Zero Jargon Clinical UI Copy | Enforce everyday clinic language across all components, labels, and dialogs; remove all statutory and legalistic references | M1-M4 | Survey |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Requirement-driven test suite (Tiers 1-4), TEST_INFRA.md, TEST_READY.md | none | DONE |
| M1 | "My patients" Filter Tab & Server-side Filtering | R1: `Patients.screen.tsx`, `clinicService.ts`, `GetClinicPatientsQuery.cs`, `GetClinicPatientCountsQuery.cs`, `PatientDirectoryCountsDto.cs`, `PatientsController.cs` | none | DONE |
| M2 | "Schedule visit" Modal & Post-Appointment Actions | R2: `PatientDirectoryCard.tsx`, `ScheduleVisitModal.tsx`, dynamic shift slot loading, 4-button post-appointment dialog | M1 | DONE |
| M3 | Multi-Service Queueing, Ticket Series & Intents | R3: "Queue Patient" label, ActionMenu intents, `ServiceCheckInModal.tsx`, Regular/Priority series (`Q`/`SQ`, `V`/`SV`, `P`/`SP`, `A`/`SA`), `CheckInPatientCommand.cs` | M1 | DONE |
| M4 | Dashboard Cleanup, Semantic Clusters & Badges | R4: `Dashboard.screen.tsx` toolbar cleanup, 4 semantic action clusters, formatted badges | M3 | DONE |
| M5 | Final Milestone: 100% E2E Pass & Adversarial Hardening | Run full frontend & backend test suites, execute adversarial tests, forensic integrity audit | M1, M2, M3, M4, E2E | DONE |




---

## Interface Contracts

### 1. `GetClinicPatientsQuery` & `GetClinicPatientCountsQuery` ↔ `Patients.screen.tsx`
- Query parameters on `GET /api/v1/patients`:
  - `searchTerm?: string`
  - `hasAlerts?: boolean`
  - `verificationStatus?: string`
  - `filterMode?: string` (`'ALL' | 'MY_PATIENTS' | 'ALERTS' | 'SENIOR_PWD' | 'STUDENTS' | 'EMPLOYEES'`)
  - `staffId?: Guid` (ID of the logged-in staff member)
  - `doctorId?: Guid` (ID of the doctor if logged-in staff is a Doctor)
  - `pageNumber: int`
  - `pageSize: int`
- Query parameters on `GET /api/v1/patients/counts`:
  - `searchTerm?: string`
  - `staffId?: Guid`
  - `doctorId?: Guid`
- Response from `GET /api/v1/patients/counts`:
  ```json
  {
    "all": 120,
    "myPatients": 18,
    "students": 45,
    "employees": 32,
    "alerts": 12,
    "seniorPwd": 24
  }
  ```

### 2. `CheckInPatientCommand` ↔ `ServiceCheckInModal.tsx`
- Request payload for `POST /api/v1/queue/check-in`:
  ```json
  {
    "patientId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "patientName": "Juan Dela Cruz",
    "seriesPrefix": "SQ",
    "priority": "Routine",
    "visitType": "Consultation",
    "doctorId": "11111111-2222-3333-4444-555555555555",
    "doctorName": "Dr. Maria Santos",
    "roomId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "roomOrStation": "Room 101 - Consultation",
    "chiefComplaint": "Persistent cough for 3 days"
  }
  ```
- Output: `QueueItemDto` with `queueNumber: "SQ-001"`.

### 3. Dynamic Doctor Slots: `clinicService.getDoctorAvailableSlots` ↔ `ScheduleVisitModal.tsx`
- `GET /api/v1/doctors/{doctorId}/schedules/availability?date=YYYY-MM-DD`
- Response:
  ```json
  {
    "doctorId": "11111111-2222-3333-4444-555555555555",
    "doctorName": "Dr. Maria Santos",
    "date": "2026-11-01",
    "isOnDuty": true,
    "availableSlots": [
      { "time": "09:00", "available": true },
      { "time": "09:30", "available": true },
      { "time": "10:00", "available": false, "reason": "Booked" }
    ]
  }
  ```

---

## Code Layout

- Frontend:
  - `apps/clinic-app/navigation/screens/Patients.screen.tsx`: Tab toolbar, filter logic, modal mounting.
  - `apps/clinic-app/components/patient/PatientDirectoryCard.tsx`: Relabeled buttons, ActionMenu direct intents.
  - `apps/clinic-app/components/patient/ScheduleVisitModal.tsx`: [NEW] In-place modal with dynamic doctor slots & 4-button post-appointment view.
  - `apps/clinic-app/components/patient/ServiceCheckInModal.tsx`: [NEW] Multi-service modal with 4 service views & Regular/Priority series.
  - `apps/clinic-app/navigation/screens/Dashboard.screen.tsx`: Toolbar cleanup, semantic button clusters, formatted badges.
  - `apps/clinic-app/services/clinicService.ts`: Query param extensions, DTO updates.
  - `apps/clinic-app/tests/`: Automated tests.
- Backend:
  - `services/clinic-api/ClinicEz.Clinic.Application/Features/Patients/Queries/GetClinicPatientsQuery.cs`
  - `services/clinic-api/ClinicEz.Clinic.Application/Features/Patients/Queries/GetClinicPatientCountsQuery.cs`
  - `services/clinic-api/ClinicEz.Clinic.Application/Features/Patients/DTOs/PatientDirectoryCountsDto.cs`
  - `services/clinic-api/ClinicEz.Clinic.Application/Features/Queue/Commands/CheckInPatientCommand.cs`
  - `services/clinic-api/ClinicEz.Clinic.Api/Controllers/PatientsController.cs`
  - `services/clinic-api/ClinicEz.Clinic.Api/Controllers/QueueController.cs`
  - `services/clinic-api/ClinicEz.Clinic.Application.Tests/`: Automated unit & integration tests.
