# Project: Connect Google Stitch Patient Home Screens (PR #128)

## Architecture Overview
This project completely replaces the patient-app home screens using the Google Stitch designs across all 4 visual states (First Login, No Appointment, Multiple Appointments, Search Results), wired to live patient-api endpoints with zero mock data.

- **Backend Services**:
  - `services/patient-api/`: .NET 10 ASP.NET Core Clean Architecture (`ClinicEz.Patient.Domain`, `.Application`, `.Infrastructure`, `.Api`).
    - MediatR CQRS, EF Core PostgreSQL (`snake_case`), Minimal APIs (`IEndpoint` under `/api/v1`).
    - Object-level ownership security via `PatientOwnershipMiddleware`.
    - Endpoints for Vitals (`/api/v1/patients/{id}/vitals`), Medications & Adherence (`/api/v1/patients/{id}/medications/today`, `/log`), Appointments (`/api/v1/patients/{id}/appointments`), and Unified Search (`/api/v1/discovery/search`).
- **Frontend Applications**:
  - `apps/patient-app/`: React Native 0.85, Expo SDK 56, TypeScript (`strict: true`), `@clinicez/design-tokens`.
    - Modular architecture under `components/home/`.
    - Cross-platform parity across mobile (`Home.screen.tsx`) and web (`Home.screen.web.tsx`).
    - Interpolated scroll-driven header animation hiding title at scroll y=0 and animating into view past 48px threshold.
    - Zero mock data: live API client services, SWR hooks, and SQLite offline caching.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Vitals Backend Schema & Endpoints | Add BloodGlucoseMgDl, SleepHours, nullable ClinicId to VitalSigns, EF Core migration, GET/POST vitals endpoints | M1 | Explorer 2 |
| F2 | Medication Adherence Backend Endpoints | PatientMedicationAdherence entity, GET /medications/today, POST /medications/{id}/log | M1 | Explorer 2 |
| F3 | Unified Discovery Search Backend Endpoint | GET /api/v1/discovery/search?q={query} returning doctors, clinics, and services | M1 | Explorer 2 |
| F4 | Frontend API Client & SWR Hooks | vitalsApi, medicationsApi, searchApi, and SWR hooks with zero mock data | M2 | Explorer 1 & 2 |
| F5 | Offline SQLite Sync & Persistence | Local caching in SQLite for vitals, medications, and appointments | M2 | Explorer 1 |
| F6 | Header Scroll Animation Component | Animated.Value title/subtitle fade-in & slide-up on scroll y > 48px | M3 | Explorer 1 |
| F7 | Stitch 4-State UI Components | Bento vitals grid, meds schedule with "Log Now", appointments carousel, onboarding card, digital health pass | M3 | Explorer 1 |
| F8 | Stitch Screen 4 Search Results Component | Filter chips (All, Doctors, Clinics, Services, Available Today) & categorized result cards | M3 | Explorer 1 |
| F9 | Home Screen Assembly (Mobile & Web) | Home.screen.tsx & Home.screen.web.tsx full replacement with 4-state machine & zero mock data | M4 | Explorer 1 |
| F10 | Dynamic Contract Test Suite | Update stitchPatientHomeScreens.test.ts to test live dynamic data contracts | M4 | Explorer 3 |
| F11 | E2E Testing Suite (Tiers 1-4) | Comprehensive opaque-box test suite for all Stitch features and boundaries | E2E Track | Explorer 3 |
| F12 | Adversarial Hardening (Tier 5) | White-box stress tests, offline sync recovery, concurrency, edge cases | M5 | Explorer 3 |
| F13 | Git Push & PR #128 Update | Clean lint:tokens, typecheck:patient, bun test, dotnet test, commit and push | M5 | Explorer 3 |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Services & Endpoints | F1, F2, F3 | none | DONE |
| M2 | Frontend API Client & SWR Layer | F4, F5 | M1 | DONE |
| M3 | Google Stitch UI Components & Scroll Header | F6, F7, F8 | none | DONE |
| M4 | Screen Assembly & Dynamic Contract Tests | F9, F10 | M2, M3 | IN_PROGRESS |
| M5 | Final E2E Verification & Git Push (PR #128) | F12, F13 | M4, E2E Track | PLANNED |
| E2E | E2E Testing Track | F11 (Tiers 1-4) | none | DONE |

---

## Interface Contracts

### 1. Vitals Endpoints (`patient-api` <-> `patient-app`)
- `GET /api/v1/patients/{patientId}/vitals/latest`:
  Returns:
  ```json
  {
    "succeeded": true,
    "data": {
      "heartRateBpm": 72,
      "heartRateTrend": "+2 bpm",
      "systolicBp": 118,
      "diastolicBp": 76,
      "bpCategory": "Optimal",
      "bloodGlucoseMgDl": 94,
      "glucoseCategory": "Fasting",
      "sleepHours": 7.75,
      "sleepFormatted": "7h 45m",
      "sleepDeepFormatted": "2h 10m",
      "recordedAt": "2026-11-03T00:00:00Z"
    }
  }
  ```
- `POST /api/v1/patients/{patientId}/vitals`:
  Request:
  ```json
  {
    "heartRateBpm": 72,
    "systolicBp": 118,
    "diastolicBp": 76,
    "bloodGlucoseMgDl": 94,
    "sleepHours": 7.75,
    "recordedAt": "2026-11-03T00:00:00Z"
  }
  ```
  Returns: `201 Created` with `ApiResponse<VitalSignsDto>`.

### 2. Medications & Adherence Endpoints (`patient-api` <-> `patient-app`)
- `GET /api/v1/patients/{patientId}/medications/today`:
  Returns:
  ```json
  {
    "succeeded": true,
    "data": [
      {
        "id": "guid",
        "medicationName": "Lisinopril",
        "dosage": "10mg",
        "instructions": "1 tablet with breakfast",
        "scheduledTime": "8:00 AM",
        "isTaken": true,
        "takenAt": "2026-11-03T08:15:00Z"
      },
      {
        "id": "guid",
        "medicationName": "Omega-3 DHA",
        "dosage": "1000mg",
        "instructions": "1 softgel after dinner",
        "scheduledTime": "7:00 PM",
        "isTaken": false,
        "takenAt": null
      }
    ]
  }
  ```
- `POST /api/v1/patients/{patientId}/medications/{medicationId}/log`:
  Request: `{ "takenAt": "2026-11-03T08:15:00Z" }`
  Returns: `200 OK` with `ApiResponse<bool>`.

### 3. Unified Discovery Search Endpoint (`patient-api` <-> `patient-app`)
- `GET /api/v1/discovery/search?q={query}`:
  Returns:
  ```json
  {
    "succeeded": true,
    "data": {
      "doctors": [
        {
          "id": "guid",
          "fullName": "Dr. Evelyn Reed, MD",
          "specialty": "Cardiology Specialist",
          "clinicName": "Metro Cardiology Center",
          "distance": "1.2 km away",
          "rating": 4.9,
          "reviewsCount": 128,
          "nextAvailableSlot": "Tomorrow, 10:30 AM",
          "tags": ["Accepts Insurance", "In-Person & Telehealth"]
        }
      ],
      "clinics": [
        {
          "id": "guid",
          "name": "Metro Cardiology Center",
          "address": "402 Medical Blvd, Suite 402",
          "distance": "1.2 km away",
          "isOpenNow": true,
          "openText": "Open Today • Closes 6:00 PM",
          "rating": 4.8,
          "reviewsCount": 94,
          "tags": ["Echo & Diagnostic Lab", "Walk-ins Welcome"]
        }
      ],
      "services": [
        {
          "id": "guid",
          "name": "Comprehensive Cardiac Screening",
          "description": "Includes 12-lead ECG, Lipid Profile & Consult",
          "durationMinutes": 45,
          "isCovered": true,
          "tags": ["Fully Covered by Insurance", "Prep Guide Included"]
        }
      ]
    }
  }
  ```

---

## Code Layout
```
services/patient-api/
  ClinicEz.Patient.Domain/
    Entities/VitalSigns.cs
    Entities/PatientMedicationAdherence.cs
  ClinicEz.Patient.Application/
    Patients/Commands/RecordVitals/
    Patients/Queries/GetVitals/
    Patients/Commands/LogMedicationAdherence/
    Patients/Queries/GetTodayMedications/
    Discovery/Queries/UnifiedSearch/
  ClinicEz.Patient.Infrastructure/
    Persistence/ApplicationDbContext.cs
    Persistence/Migrations/
  ClinicEz.Patient.Api/
    Endpoints/Patients/PatientVitalsEndpoints.cs
    Endpoints/Patients/PatientMedicationAdherenceEndpoints.cs
    Endpoints/Discovery/UnifiedSearchEndpoint.cs

apps/patient-app/
  services/api/
    vitalsApi.ts
    medicationsApi.ts
    searchApi.ts
  hooks/
    useVitals.ts
    useTodayMedications.ts
    useAppointments.ts
    useLiveSearch.ts
  components/home/
    HeaderScrollTitle.tsx
    HealthPassCard.tsx
    HealthPassQrModal.tsx
    WelcomeOnboardingCard.tsx
    AppointmentsSection.tsx
    VitalsBentoGrid.tsx
    MedicationsSchedule.tsx
    SearchResultsView.tsx
    DailyMindfulMoment.tsx
  navigation/screens/
    Home.screen.tsx
    Home.screen.web.tsx
  tests/
    stitchPatientHomeScreens.test.ts
    e2e/
      stitchPatientHomeE2E.test.ts
```
