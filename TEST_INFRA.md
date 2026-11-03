# E2E Test Infra: Google Stitch Patient Home Screens (PR #128)

## Test Philosophy
- **Opaque-Box & Requirement-Driven**: Tests are derived strictly from `ORIGINAL_REQUEST.md`, `PROJECT.md`, and Google Stitch design specifications (assets `first_login_home`, `no_appointment_home`, `multiple_appointment_home`, `search_results`). Tests validate observable UI contracts, state transitions, animated header transformations, live telemetry displays, and user interactions without coupling to internal private state.
- **4-Tier Testing Methodology**:
  - **Tier 1 (Feature Coverage)**: Isolated behavioral verification of all core features: 4 visual states (First Login / Zero Data, No Appointment, Multiple Appointments, Search Results); hidden animated header interpolating on scroll y > 48; live vitals display; medication adherence "Log Now"; appointments 0/1/N; and unified search filtering.
  - **Tier 2 (Boundary & Corner Cases)**: Empty data handling, offline SQLite cache fallback, 0 vs 1 vs multiple appointments, search with zero results, special characters in queries, rapid and negative scroll offsets, and abnormal vital sign values.
  - **Tier 3 (Cross-Feature Combinations)**: Multi-step interactions connecting search filtering back to home, medication adherence logging reflected in schedule counts, appointments carousel scrolling, and modal transitions (QR health pass).
  - **Tier 4 (Real-World Application Scenarios)**: Realistic end-to-end patient journeys (e.g., Sarah Jenkins starting as a new patient with zero data, onboarding, booking a clinic consultation, syncing vitals, logging medication, and searching specialized care packages).

---

## Feature Inventory & Test Mapping

| # | Feature | Requirement Source | Tier 1 | Tier 2 | Tier 3 | Primary Test Target |
|---|---------|---------------------|:------:|:------:|:------:|---------------------|
| **F1** | Vitals Backend Schema & Endpoints | ORIGINAL_REQUEST R3, PROJECT.md F1 | ✓ | ✓ | ✓ | `patient-api` Vitals Endpoints & `vitalSigns` schema |
| **F2** | Medication Adherence Backend Endpoints | ORIGINAL_REQUEST R3, PROJECT.md F2 | ✓ | ✓ | ✓ | `patient-api` Medications Endpoints & `logPatientMedication` |
| **F3** | Unified Discovery Search Endpoint | ORIGINAL_REQUEST R3, PROJECT.md F3 | ✓ | ✓ | ✓ | `patient-api` Search & `listClinics` client |
| **F4** | Frontend API Client & SWR Hooks | ORIGINAL_REQUEST R3, PROJECT.md F4 | ✓ | ✓ | ✓ | `patientApi.ts`, `appointmentsService.ts` |
| **F5** | Offline SQLite Sync & Persistence | PROJECT.md F5 | ✓ | ✓ | ✓ | SQLite schema (`vitalSigns`, `appointments`, `patientMedications`) |
| **F6** | Header Scroll Animation Component | ORIGINAL_REQUEST R2, PROJECT.md F6 | ✓ | ✓ | ✓ | `HeaderScrollTitle.tsx` (opacity/translateY interpolation) |
| **F7** | Stitch 4-State UI Components | ORIGINAL_REQUEST R1, PROJECT.md F7 | ✓ | ✓ | ✓ | `VitalsBentoGrid`, `MedicationsSchedule`, `AppointmentsSection`, `WelcomeOnboardingCard`, `HealthPassCard` |
| **F8** | Stitch Screen 4 Search Results Component | ORIGINAL_REQUEST R1/R3, PROJECT.md F8 | ✓ | ✓ | ✓ | `SearchResultsView.tsx` (Chips: All, Doctors, Clinics, Services, Available Today) |
| **F9** | Home Screen Assembly (Mobile & Web) | ORIGINAL_REQUEST R1/R4, PROJECT.md F9 | ✓ | ✓ | ✓ | `Home.screen.tsx`, `Home.screen.web.tsx` |
| **F10**| Dynamic Contract Test Suite | PROJECT.md F10 | ✓ | ✓ | ✓ | `stitchPatientHomeScreens.test.ts` |
| **F11**| E2E Testing Suite (Tiers 1-4) | ORIGINAL_REQUEST R5, PROJECT.md F11 | ✓ | ✓ | ✓ | `stitchPatientHomeE2E.test.ts` |

---

## Test Architecture

- **Test Runner**: Bun test runner (`bun test`) executing headless React Native and TypeScript test suites.
- **Preload Harness**: `apps/patient-app/tests/setup-preload.ts` providing pre-stubs for React Native Flow entries, `expo-sqlite`, `expo-constants`, `@react-native-community/netinfo`, `expo-crypto`, and `expo-secure-store`.
- **Database Engine**: In-memory SQLite (`bun:sqlite` with `drizzle-orm/bun-sqlite`) simulating local offline caching and data persistence without native module overhead.
- **Primary Suite Location**:
  `apps/patient-app/tests/e2e/stitchPatientHomeE2E.test.ts`
- **Execution Commands**:
  ```bash
  # Run dedicated E2E test suite from patient-app:
  cd apps/patient-app && bun test --preload ./tests/setup-preload.ts tests/e2e/stitchPatientHomeE2E.test.ts

  # Or from workspace root:
  bun test --preload ./apps/patient-app/tests/setup-preload.ts apps/patient-app/tests/e2e/stitchPatientHomeE2E.test.ts
  ```

---

## Real-World Application Scenarios (Tier 4)

| # | Scenario | Features Exercised | Patient Journey Summary |
|---|----------|--------------------|-------------------------|
| **S1** | **First-Time Patient Onboarding & Consultation Booking** | F6, F7, F9, F11 | Sarah Jenkins registers with zero prior records. Home screen renders State 1 (Digital Health Pass `PC-8942-01`, Step 1 of 3 Welcome Card, "Book Your First Consultation", empty dashes for vitals `-- bpm`, and "No active medications scheduled"). Sarah browses clinics, books her first appointment, and the home screen transitions from State 1 to an active patient dashboard. |
| **S2** | **Active Outpatient Telemetry Sync & Medication Adherence** | F1, F2, F5, F7, F9, F11 | Active patient with hypertension logs in. Home screen loads 2x2 Bento telemetry grid showing live vitals (Heart rate 72 bpm, BP 118/76 mmHg Optimal, Blood Glucose 94 mg/dL Fasting, Oxygen 98%). Patient checks today's schedule with Lisinopril (already taken) and Omega-3 DHA (pending). Patient taps "Log Now", which optimistically updates the badge to "Taken" and dispatches the adherence event. |
| **S3** | **Multi-Appointment Schedule & Same-Day Clinic Check-In** | F4, F7, F9, F11 | Patient has two upcoming consultations (Metro Cardiology Center tomorrow at 10:30 AM with Dr. Evelyn Reed, and Oakwood Primary Care on Friday with Dr. David Chen). Home screen displays State 3 Appointments Carousel with "2 Scheduled" badge. The first card displays "Tomorrow" badge and active "Check in" CTA, while the second displays "Confirmed" with "Manage Visit". Patient checks directions and manages appointment. |
| **S4** | **Care Discovery & Procedure Scheduling (State 4 Search)** | F3, F7, F8, F9, F11 | Patient enters symptoms/care query "cardiac" into the top search bar. The home screen transitions seamlessly to State 4 Search Results View. Patient toggles filter chips between "All (8)", "Doctors (3)", "Clinics (2)", and "Services (3)". Patient views Dr. Evelyn Reed (Cardiology Specialist, 4.9 ★, Accepts Insurance), Metro Cardiology Center (Open Today), and "Comprehensive Cardiac Screening" package (45 Mins, Covered by Insurance). Patient taps "Schedule" to book the screening package. |
| **S5** | **Offline Interruption & Cache Recovery Resilience** | F1, F4, F5, F7, F11 | Patient opens app in subway station without network connectivity. Network request fails gracefully. The app reads cached vitals, medications, and appointment records from local SQLite database, preventing blank screens or unhandled exceptions. As soon as connection is restored, background sync pulls updated clinical records. |

---

## Coverage Thresholds and Quality Gates

1. **Stitch State Parity**: 100% verification across all 4 visual states (First Login / Zero Data, No Appointment, Multiple Appointments, Search Results).
2. **Scroll Animation Accuracy**: Verification that header title and subtitle are hidden (opacity 0, translateY 6) at offset 0, and transition smoothly to visible (opacity 1, translateY 0) when scroll offset reaches or exceeds 48px.
3. **Zero Mock Invariant**: Zero hardcoded mock records rendered when live API or SQLite data is present; fallback to empty states rather than static placeholder arrays.
4. **Token Guard Strictness**: 0 forbidden hex literals, 0 raw numeric font sizes, 0 raw numeric border radii in all `.tsx` components (`bun run lint:tokens`).
5. **Type Safety**: 0 TypeScript compilation errors under `strict: true` (`bun run typecheck:patient`).
