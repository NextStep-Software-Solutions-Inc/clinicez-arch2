# Project: ClinicEZ Teleconsultation Feature

## Architecture
The teleconsultation system enables secure, sovereign clinical video visits, payment policy governance, and encrypted vault recording across the ClinicEZ ecosystem:
- **`packages/shared-dotnet`**: Shared interop contracts (`AppointmentBookedEvent`, `MediaContracts`, `CommsContracts`, `Party.Media`).
- **`services/clinic-api`**: Facility backend handling teleconsult appointment lifecycle, payment policy enforcement, cashiering clearance, zero-PHI WebRTC media signaling via Interop Hub, and CMK AES-256-GCM encrypted vault recordings with `.key` sidecars.
- **`packages/comms-sdk`**: Unified cross-platform communications SDK providing pluggable WebRTC media adapters (`LiveKitMediaAdapter`, `LocalPreviewMediaAdapter`), segment recording (`SegmentRecorder`), call session management (`useCallSession`), and presentation UI (`CallWaitingRoom`, `CallStage`).
- **`apps/clinic-app`**: Clinic workstation application integrating teleconsult scheduling, calendar inspection, waiting room modal, active call stage with consultation chart docking, facility teleconsult settings, and encounter timeline recording playback with medico-legal hold.

## Code Layout
- `packages/shared-dotnet/Common/`: Common DTOs and event records.
- `packages/shared-dotnet/Interop/Contracts/`: Interop request/response payloads.
- `services/clinic-api/ClinicEz.Clinic.Domain/Entities/`: FacilitySettings, Appointment, TeleconsultRecordingSession, TeleconsultRecordingSegment.
- `services/clinic-api/ClinicEz.Clinic.Application/Features/Settings/`: ClinicSettingsDto, GetClinicSettingsQuery, UpdateClinicSettingsCommand.
- `services/clinic-api/ClinicEz.Clinic.Application/Features/Appointments/`: CreateAppointmentCommand, GetAppointmentsQuery, AppointmentDto.
- `services/clinic-api/ClinicEz.Clinic.Application/Features/Billing/Commands/`: RecordPaymentCommand.
- `services/clinic-api/ClinicEz.Clinic.Application/Features/Teleconsult/`: Queries (GetTeleconsultStatusQuery) and Commands (AdmitTeleconsultPatientCommand, UpdateTeleconsultPaymentPolicyCommand, JoinTeleconsultCallCommand, EndTeleconsultCallCommand).
- `services/clinic-api/ClinicEz.Clinic.Api/Controllers/`: TeleconsultAdmissionController, TeleconsultRecordingsController.
- `services/clinic-api/ClinicEz.Clinic.Infrastructure/Messaging/Handlers/`: AppointmentBookedHandler, BillingPaymentConfirmedHandler, CommsRecordingConsentLoggedHandler.
- `services/clinic-api/ClinicEz.Clinic.Infrastructure/Services/Storage/`: RecordingRetentionSweeper, ClinicEncryptionService.
- `services/clinic-api/ClinicEz.Clinic.Application.Tests/`: Unit and integration test suites.
- `packages/comms-sdk/src/core/media/`: IMediaRoomAdapter, LiveKitMediaAdapter, LocalPreviewMediaAdapter, SegmentRecorder.
- `packages/comms-sdk/src/react/`: useCallSession hook, types, and callbacks.
- `packages/comms-sdk/src/native-ui/` & `src/web-ui/`: CallWaitingRoom, CallStage.
- `apps/clinic-app/src/services/clinicService.ts`: Teleconsult DTOs and API methods.
- `apps/clinic-app/src/context/ClinicCommsContext.tsx`: Teleconsult session and chart docking state.
- `apps/clinic-app/src/components/teleconsult/`: TeleconsultWaitingRoomModal, ClinicRecordingPlayerModal.
- `apps/clinic-app/src/components/patient/ScheduleVisitModal.tsx`: Visit modality selector.
- `apps/clinic-app/src/components/calendar/AppointmentInspectionModal.tsx`: Teleconsult inspection & policy switcher.
- `apps/clinic-app/src/components/settings/cards/TeleconsultSettingsCard.tsx`: Facility settings card.
- `apps/clinic-app/src/components/chart/EncountersTimelineTab.tsx`: Encounters recording badge and playback launcher.
- `apps/clinic-app/tests/teleconsultWorkflow.test.ts`: Workstation teleconsultation test suite.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | `AppointmentBookedEvent.AppointmentType` | Optional appointment modality on shared booking event | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Facility Teleconsult Settings | Expose/validate 5 teleconsult settings on ClinicSettingsDto and commands | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Teleconsult Appointment Creation | Infer modality, assign CallId, resolve policy, set status, create prepaid invoice | M2 | ORIGINAL_REQUEST §R2 |
| 4 | AppointmentDto Teleconsult Metadata | Extend AppointmentDto with teleconsult fields | M2 | ORIGINAL_REQUEST §R2 |
| 5 | Cashier Payment Clearance | Update teleconsult appointment on invoice paid & enqueue CommsCallPaymentCleared | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Non-Mutating YAKAP Status | Surface HasActiveYakapEnlistment as informational badge without auto-exemption | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Plain-Note Admission Override | Staff override with ReasonNote >= 5 chars, WORM audit, CommsCallPaymentCleared | M2 | ORIGINAL_REQUEST §R2 |
| 8 | Update Teleconsult Payment Policy | PUT endpoint to let staff switch policy anytime | M2 | ORIGINAL_REQUEST §R2 |
| 9 | Media Signaling (Join/End Call) | Join/End endpoints requesting zero-PHI tokens via Interop Hub with 10s fallback | M3 | ORIGINAL_REQUEST §R3 |
| 10 | CMK AES-256-GCM Vault Encryption | Encrypt segment uploads with {storageKey}.key sidecars, ticketed streaming decryption | M3 | ORIGINAL_REQUEST §R3 |
| 11 | Recording Sweeper Sidecar Cleanup | Clean up .key sidecars alongside segment and manifest purges | M3 | ORIGINAL_REQUEST §R3 |
| 12 | Consultation Encounter Linkage | Backfill ConsultationId on recording sessions when encounter is created | M3 | ORIGINAL_REQUEST §R3 |
| 13 | Interop Handlers & Registration | Register MediaRoomResponded and CommsRecordingConsentLogged handlers | M3 | ORIGINAL_REQUEST §R3 |
| 14 | `livekit-client` SDK Dependency | Add livekit-client ^2.24.0 to packages/comms-sdk/package.json | M4 | ORIGINAL_REQUEST §R4 |
| 15 | Comms Media Adapters | Implement IMediaRoomAdapter, LiveKitMediaAdapter, LocalPreviewMediaAdapter, SegmentRecorder | M4 | ORIGINAL_REQUEST §R4 |
| 16 | `useCallSession` Upgrade | Upgrade hook with callbacks & CommsContext while keeping zero-arg test fallback | M4 | ORIGINAL_REQUEST §R4 |
| 17 | `CallWaitingRoom` Realignment | Add staff policy selector, informational YAKAP badge, plain-note override | M4 | ORIGINAL_REQUEST §R4 |
| 18 | `CallStage` Implementation | Shared native-ui and web-ui call stage with REC banner, controls, dock action | M4 | ORIGINAL_REQUEST §R4 |
| 19 | Workstation Clinic Service Teleconsult APIs | Add teleconsult DTOs and all 16 API methods to clinicService.ts | M5 | ORIGINAL_REQUEST §R5 |
| 20 | Workstation ClinicCommsContext Docking | Add chart docking state and onOpenConsultationChart bridge | M5 | ORIGINAL_REQUEST §R5 |
| 21 | Workstation Waiting Room & Stage Modal | Integrate comms-sdk CallWaitingRoom, CallStage, and docked mini-bar | M5 | ORIGINAL_REQUEST §R5 |
| 22 | Workstation Scheduling & Inspection | Modality selector, policy pills, waiting room launcher in Schedule/Inspect modals | M5 | ORIGINAL_REQUEST §R5 |
| 23 | Facility Teleconsult Settings Card | TeleconsultSettingsCard mounted in GeneralSettingsTab | M5 | ORIGINAL_REQUEST §R5 |
| 24 | Timeline Recording Player Modal | ClinicRecordingPlayerModal with 15-min HMAC playback and medico-legal hold | M5 | ORIGINAL_REQUEST §R5 |
| 25 | End-to-End Test Suite & Verification | Pass 100% E2E tests (Tiers 1-4) and adversarial coverage hardening (Tier 5) | M6 | ORIGINAL_REQUEST Acceptance |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Shared Interop & Facility Settings | `packages/shared-dotnet` event & `services/clinic-api` settings DTO/query/command | none | DONE (7da4453a: 723 shared tests + 5,576 clinic tests passing, gate PASS) |
| 2 | Appointment & Payment Policy Management | `services/clinic-api` appointment creation, queries, cashiering, policy update, plain-note override | M1 | DONE (7c57abf8: 5,676 clinic tests pass, gate PASS) |
| 3 | Media Signaling & Vault Recording Encryption | `services/clinic-api` join/end call, zero-PHI tokens, CMK AES-256-GCM encryption with .key sidecars, HMAC tickets, retention sweeper, DI | M2 | DONE (e7d18c5f: 5,799 clinic tests pass, gate PASS) |
| 4 | Workspace Communications & Media SDK | `packages/comms-sdk` livekit-client, adapters, useCallSession, CallWaitingRoom, CallStage native/web | none | DONE (92ca51e0: 403 tests pass, 0 typecheck errors, 0 token/host violations, gate PASS) |
| 5 | Clinic Workstation App Integration | `apps/clinic-app` clinicService, ClinicCommsContext, TeleconsultWaitingRoomModal, ScheduleVisitModal, AppointmentInspectionModal, TeleconsultSettingsCard, ClinicRecordingPlayerModal | M3, M4 | DONE (cffb0720: 130 tests pass, 0 typecheck/token/host errors, gate PASS) |
| 6 | Final E2E Verification & Adversarial Hardening | Phase 1: 100% E2E tests (Tiers 1-4); Phase 2: Adversarial coverage hardening (Tier 5) | M5 | DONE (ed405502: 7,115 tests pass, 101 Tier 5 tests added, gate PASS) |

## Interface Contracts
### `packages/shared-dotnet` <-> `services/clinic-api`
- `AppointmentBookedEvent`: `string? AppointmentType` ("InPerson" | "Teleconsult").
- `MediaContracts`: `MediaRoomRequestedPayload`, `MediaRoomRespondedPayload`.
- `CommsContracts`: `CommsCallStateChangedPayload`, `CommsCallPaymentClearedPayload`, `CommsRecordingConsentLoggedPayload`.

### `services/clinic-api` <-> `apps/clinic-app`
- `GET /api/v1/clinic-settings` -> `ClinicSettingsDto` (with teleconsult properties).
- `PUT /api/v1/clinic-settings` -> `UpdateClinicSettingsCommand`.
- `POST /api/v1/appointments` -> `CreateAppointmentCommand` (`appointmentType`, `paymentPolicy`).
- `GET /api/v1/appointments` -> `AppointmentDto[]` (with teleconsult properties).
- `GET /api/v1/teleconsult/appointments/{id}/status` -> `TeleconsultStatusDto`.
- `PUT /api/v1/teleconsult/appointments/{id}/payment-policy` -> `UpdateTeleconsultPaymentPolicyCommand`.
- `POST /api/v1/teleconsult/appointments/{id}/admit` -> `AdmitTeleconsultPatientCommand` (`EmergencyOverrideDto?`).
- `POST /api/v1/teleconsult/appointments/{id}/join` -> `JoinTeleconsultCallCommand` -> `TeleconsultCallJoinDto`.
- `POST /api/v1/teleconsult/appointments/{id}/end` -> `EndTeleconsultCallCommand`.
- `POST /api/v1/teleconsult/recordings/sessions/{id}/playback-ticket` -> `TeleconsultPlaybackTicketDto`.
- `GET /api/v1/teleconsult/recordings/sessions/{id}/stream` -> Range-streamed decrypted MP4/WebM.
- `POST /api/v1/teleconsult/recordings/sessions/{id}/legal-hold` -> `PlaceRecordingLegalHoldCommand`.
- `DELETE /api/v1/teleconsult/recordings/sessions/{id}/legal-hold` -> `ReleaseRecordingLegalHoldCommand`.

### `packages/comms-sdk` <-> `apps/clinic-app`
- `useCallSession(sessionId, options)`: returns `callState`, `paymentState`, `mediaState`, `recordingState`, `admit()`, `updatePaymentPolicy()`, `joinCall()`, `endCall()`, `revokeRecordingConsent()`.
- `CallWaitingRoom`: accepts `paymentPolicy`, `paymentStatus`, `canAdmit`, `hasActiveYakapEnlistment`, `onChangePaymentPolicy`, `onEmergencyPaymentOverride`, `onAdmit`.
- `CallStage`: accepts `room`, `localVideoTrack`, `remoteVideoTrack`, `isMuted`, `isVideoOff`, `isScreenSharing`, `isRecording`, `onToggleMic`, `onToggleCam`, `onToggleScreenShare`, `onStopRecording`, `onEndCall`, `renderWorkstationAction`.
