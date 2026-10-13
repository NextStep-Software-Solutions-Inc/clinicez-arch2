# Project: OPD Queue, Display, Notification & Intake Suite

## Architecture
ClinicEZ Outpatient Department (OPD) queue modernization spanning:
- `services/clinic-api`: ASP.NET Core Clean Architecture Web API hosting Queue and Patient domain logic, EF Core PostgreSQL storage, multi-tenant ambient scoping (`IClinicScopeSetter`), background services, and MediatR commands/queries.
- `apps/clinic-app`: Expo React Native clinical workstation app hosting Queue dashboard, General Settings, and Patient Intake.
- `apps/portal-web`: Next.js 16 public web portal hosting the dedicated unauthenticated Waiting Area Public TV Display Board (`/queue-display/[tenantSlug]/[facilitySlug]`).
- `packages/shared-dotnet`: Interop Hub message envelopes (`patient.queue.alert`) and routing parties (`Party.ForFacility`, `Party.ForPatient`).
- `services/patient-api`: Interop message handlers receiving queue notifications, saving records, and triggering FCM mobile push.
- `packages/design-tokens`: Single source of truth for semantic design tokens (Teal `#0D6963` palette, high-contrast dark display tokens).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1.1 | Clinic Settings EOD Properties | Add `EodReconciliationTime` and `AutoEodEnabled` to `ClinicSettings`, DTOs, and migration | M1 | Survey / R1 |
| F1.2 | Reconcile EOD Command & Endpoint | `POST /api/v1/queue/reconcile-eod` transitioning active `Waiting`, `Triaged`, `OnHold` to `NoShow` with `CompletedTime`, preserving `InConsultation` & `Completed` | M1 | Survey / R1 |
| F1.3 | EOD Audit Logging | Entity and table `EodReconciliationAudit` in `clinic_dashboard` tracking processed counts, trigger type, and affected tickets | M1 | Survey / R1 |
| F1.4 | EOD Scheduled Background Service | `EodReconciliationBackgroundService : BackgroundService` evaluating clinic local time and triggering automated EOD closure | M1 | Survey / R1 |
| F1.5 | Workstation General Settings EOD Card | Operational card in `GeneralSettingsTab.tsx` with `TimeInput`, `ToggleSwitch`, and "Force EOD / Close Clinic Day" action | M1 | Survey / R1 |
| F1.6 | Force EOD Confirmation Modal | `<ForceEodConfirmationModal />` displaying active ticket warning and count before executing day closure | M1 | Survey / R1 |
| F2.1 | Public Queue Display Endpoint | `GET /api/v1/public/queue/display` returning non-PHI serving and upcoming tickets with optional privacy masking | M2 | Survey / R2 |
| F2.2 | Dedicated Public TV Display Route | Next.js route in `apps/portal-web` (`/queue-display/[tenantSlug]/[facilitySlug]` and `/queue-tv/[facilitySlug]`) | M2 | Survey / R2 |
| F2.3 | High-Contrast 1080p/4K TV Layout | Large-format responsive layout using `@clinicez/design-tokens` dark mode tokens and CSS `clamp()` | M2 | Survey / R2 |
| F2.4 | NOW SERVING Card with Pulse Animation | Prominent display of current ticket, doctor, room/station with visual CSS pulse on changes | M2 | Survey / R2 |
| F2.5 | Audible Chime Alert with Mute Control | Client-side two-tone chime via Web Audio API with on-screen mute/unmute control | M2 | Survey / R2 |
| F2.6 | UP NEXT with Patient Privacy Masking | Masked names (e.g. "Cassandra A.") when `TvDisplayMaskPatientNames` is enabled | M2 | Survey / R2 |
| F2.7 | Display Board Real-Time Auto-Refresh | Polling synchronization (every 4s) keeping the TV monitor continuously updated without reload | M2 | Survey / R2 |
| F2.8 | 1-Click TV Display Launcher | Workstation button in `Queue.screen.tsx` and `Dashboard.screen.tsx` opening the public TV board | M2 | Survey / R2 |
| F3.1 | Interop Hub Alert Message Envelopes | Define `InteropTypes.PatientQueueAlert = "patient.queue.alert"` and `PatientQueueAlertPayload` in `packages/shared-dotnet` | M3 | Survey / R3 |
| F3.2 | Push Notification Settings Persistence | Add `EnableQueuePushNotifications` and `QueuePushNotificationThreshold` (1-5) to `ClinicSettings` | M3 | Survey / R3 |
| F3.3 | Queue Notification Dispatcher | Dispatch "called to room" and "approaching turn" alert messages via transactional outbox | M3 | Survey / R3 |
| F3.4 | Patient API Interop Handler | `PatientQueueAlertInteropHandler` creating `Notification` entity and triggering FCM push | M3 | Survey / R3 |
| F3.5 | Notification Deduplication Safeguards | `ApproachingNotificationSent` and `CalledNotificationSent` flags on `QueueItem` preventing duplicate spam | M3 | Survey / R3 |
| F3.6 | Push Notification Settings UI | General Settings controls for push alerts toggle and threshold stepper/slider (1 to 5) | M3 | Survey / R3 |
| F4.1 | Algorithmic Fuzzy Matcher | `FuzzyMatcher.cs` providing Levenshtein distance, Soundex phonetic matching, phone normalizer, and PIN normalizer | M4 | Survey / R4 |
| F4.2 | Enhanced Duplicate Check Query | `GET /api/v1/patients/check-duplicates` computing similarity scores and returning rich match reasons | M4 | Survey / R4 |
| F4.3 | Duplicate Patient Warning Modal | `<DuplicatePatientWarningModal />` in `apps/clinic-app` with matched profiles, similarity reasons, and action choices | M4 | Survey / R4 |
| F4.4 | Intake Interception & Routing | Intake form interception offering "Use Existing Profile" (navigates to existing chart) vs "Create New Profile Anyway" | M4 | Survey / R4 |
| F5.1 | End-to-End Test Suite Execution | Full execution of Tiers 1-4 tests covering all 24 features (316 tests) | M5 | Acceptance / Quality |
| F5.2 | Adversarial Hardening (Tier 5) | White-box stress testing, concurrency guards, boundary checks | M5 | Acceptance / Quality |
| F5.3 | Design Token Compliance Verification | `check-tokens.mjs --strict` passing with 0 violations | M5 | Acceptance / Quality |
| F5.4 | TypeScript Compilation Verification | `tsc --noEmit` passing with 0 errors across all apps | M5 | Acceptance / Quality |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Configurable EOD Reconciliation & Force EOD | F1.1, F1.2, F1.3, F1.4, F1.5, F1.6 | none | DONE (ReconcileEodCommand, EodReconciliationAudit, EodReconciliationBackgroundService, ForceEodConfirmationModal, EodReconciliationSettingsCard; 24 .NET tests + 21 frontend tests pass; Gate PASS) |
| 2 | M2: Waiting Area Public TV Display Board | F2.1, F2.2, F2.3, F2.4, F2.5, F2.6, F2.7, F2.8 | M1 | DONE (PublicQueueController, GetPublicQueueDisplayQuery with privacy masking, Portal-Web TV route with Web Audio chime, 1080p/4K layout, 4s polling; 293 .NET tests + 149 portal tests pass) |
| 3 | M3: Patient App Push Notifications with Configurable Threshold | F3.1, F3.2, F3.3, F3.4, F3.5, F3.6 | M1 | DONE (InteropTypes.PatientQueueAlert, QueueNotificationDispatcher with transactional outbox, PatientQueueAlertInteropHandler in patient-api, QueuePushNotificationSettingsCard; 228 .NET tests + 241 patient-api tests pass) |
| 4 | M4: Fuzzy Duplicate Patient Detection & Warning Safeguards | F4.1, F4.2, F4.3, F4.4 | none | DONE (FuzzyMatcher, CheckPatientDuplicatesQuery with similarity scoring, DuplicatePatientWarningModal with Use Existing vs Create New Anyway; 1841 .NET tests + 27 frontend tests pass) |
| 5 | M5: E2E Test Suite Pass (Tiers 1-4) & Adversarial Coverage Hardening (Tier 5) | F5.1, F5.2, F5.3, F5.4 | M1, M2, M3, M4 | DONE (317 OpdSuite E2E tests pass, 1891 full clinic tests pass, 241 patient tests pass, 36 frontend E2E tests pass; Tier 5 adversarial stress passed; Forensic Audit CLEAN; 0 token violations; 0 typecheck errors; Gate PASS) |

## Interface Contracts
### Clinic Settings Extensions (M1, M2, M3)
- `ClinicSettings` in `services/clinic-api/ClinicEz.Clinic.Domain/Entities/ClinicSettings.cs`:
  - `string EodReconciliationTime { get; set; } = "21:00";` (M1 DONE)
  - `bool AutoEodEnabled { get; set; } = true;` (M1 DONE)
  - `bool TvDisplayMaskPatientNames { get; set; } = true;` (M2)
  - `bool EnableQueuePushNotifications { get; set; } = true;` (M3)
  - `int QueuePushNotificationThreshold { get; set; } = 2;` (M3)

### Queue Reconcile EOD (M1 - DONE)
- `POST /api/v1/queue/reconcile-eod`
- Request: `{ TargetDate?: string, Reason?: string }`
- Response: `ApiResponse<ReconcileEodResultDto>`

### Public TV Display (M2)
- `GET /api/v1/public/queue/display?clinicId={id}` or `?facilitySlug={f}&tenantSlug={t}`
- Response: `ApiResponse<PublicQueueDisplayDto>`
  - `NowServing`: `IReadOnlyList<ServingTicketDto>` (`TicketNumber`, `DoctorName`, `RoomOrStation`, `CalledTime`)
  - `UpNext`: `IReadOnlyList<UpcomingTicketDto>` (`TicketNumber`, `DisplayName`)

### Interop Message (M3)
- Topic / Message Type: `patient.queue.alert`
- Sender: `Party.ForFacility(facilityId)`
- Recipient: `Party.ForPatient(syncPatientId)`
- Payload: `PatientQueueAlertPayload(Guid QueueTicketId, string TicketNumber, string AlertKind, string Message, string? DoctorName, string? RoomOrStation, int? AheadInLine, DateTime TimestampUtc)`

### Duplicate Detection (M4)
- `GET /api/v1/patients/check-duplicates?firstName=...&lastName=...&dateOfBirth=...&contactNumber=...&philHealthNumber=...`
- Response: `ApiResponse<DuplicatePatientCheckResultDto>`
  - `DuplicateMatchDto(Guid PatientId, string PatientCode, string FullName, DateOnly DateOfBirth, string? ContactNumber, string? PhilHealthNumber, string MatchReason, double? SimilarityScore, string? Confidence)`

## Code Layout
- Backend Domain: `services/clinic-api/ClinicEz.Clinic.Domain/Entities/`, `Enums/`, `Interfaces/`
- Backend Application: `services/clinic-api/ClinicEz.Clinic.Application/Features/Queue/`, `Features/Patients/`, `Features/Settings/`, `Common/Helpers/`
- Backend Infrastructure: `services/clinic-api/ClinicEz.Clinic.Infrastructure/Persistence/`, `Migrations/`, `BackgroundServices/`
- Backend Tests: `services/clinic-api/ClinicEz.Clinic.Application.Tests/`
- Shared Contracts: `packages/shared-dotnet/Interop/`, `packages/design-tokens/`
- Patient Service: `services/patient-api/ClinicEz.Patient.Infrastructure/Interop/`
- Workstation Frontend: `apps/clinic-app/components/queue/`, `components/patient/`, `components/settings/`, `navigation/screens/`, `services/clinicService.ts`
- Web Portal Frontend: `apps/portal-web/src/app/queue-display/[tenantSlug]/[facilitySlug]/`, `src/components/queue/`
