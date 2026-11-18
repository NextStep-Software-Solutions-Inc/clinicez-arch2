# Project: ClinicEZ Teleconsultation Feature

## Architecture
The teleconsultation system enables secure, sovereign clinical video visits, payment policy governance, encrypted vault recording, two-party event routing, and multi-client participation across the ClinicEZ ecosystem:
- **`packages/shared-dotnet`**: Shared interop contracts (`AppointmentBookedEvent`, `MediaContracts`, `CommsContracts`, `GuestTeleconsultInviteIssuedPayload`, `Party.Media`, `Party.Portal`, `Party.ForPatient`).
- **`deploy/` & `.github/workflows/`**: Deployment configurations and CI/CD for Interop Hub (client #8 Media Broker), Media Broker service, GHCR image publishing, and LiveKit Cloud credential distribution.
- **`services/media-broker`**: WebRTC media signaling, token minting, room management, and call minute entitlement metering with configurable auto-provisioning.
- **`services/clinic-api`**: Facility backend handling teleconsult appointment lifecycle, payment policy enforcement, cashiering clearance, zero-PHI WebRTC media signaling to patient and facility parties, guest invite generation, and CMK AES-256-GCM encrypted vault recordings.
- **`services/portal-api`**: Public and authenticated portal backend ingesting guest teleconsult invite hashes and verifying tokens/OTP/DOB to mint guest LiveKit room tokens.
- **`services/patient-api`**: Patient backend consuming `CommsCallStateChanged` events over Interop Hub, broadcasting via SignalR with `relayUrl`, and exposing call status query endpoints.
- **`packages/comms-sdk`**: Unified cross-platform communications SDK providing pluggable WebRTC media adapters (`LiveKitMediaAdapter`, `LocalPreviewMediaAdapter`), segment recording, session management (`useCallSession`), portrait-first framing, centered toolbars with dock/PiP buttons, and plain copy UI (`CallWaitingRoom`, `CallStage`).
- **`apps/clinic-app`**: Clinic workstation application featuring full-screen edge-to-edge call stage, ultra-thin draggable docked mini-bar (`~36-38px`), native browser PiP with persistent video element, call exit confirmation dialog, guest invite link generation, and consultation chart docking.
- **`apps/patient-app`**: Mobile patient application polling call status, admitting patient upon clinician start, and rendering live teleconsultation via `CallStage`.
- **`apps/portal-web`**: Web guest portal verifying guest invites, connecting to LiveKit room via `useCallSession`, and rendering active call stage with native PiP and plain copy.

## Code Layout
- `deploy/interop-hub/`: Docker Compose and bootstrap registration for client #8 Media Broker.
- `deploy/media-broker/`: Docker Compose deployment manifest for media broker.
- `.github/workflows/`: CI/CD deployment and image publishing workflows.
- `packages/shared-dotnet/Interop/Contracts/`: Interop contracts (`CommsCallStateChangedPayload`, `GuestTeleconsultInviteIssuedPayload`).
- `services/media-broker/ClinicEz.MediaBroker.Application/Common/Options/`: `MediaMeteringOptions.cs`.
- `services/media-broker/ClinicEz.MediaBroker.Tests/`: `CallMinuteMeteringTests.cs`.
- `services/clinic-api/ClinicEz.Clinic.Application/Features/Teleconsult/`: Join/End call commands with patient routing, `CreateTeleconsultGuestInviteCommand`.
- `services/clinic-api/ClinicEz.Clinic.Api/Controllers/`: `TeleconsultAdmissionController.cs`.
- `services/portal-api/ClinicEz.Portal.Application/Features/Guest/`: `GuestVerificationService.cs`.
- `services/portal-api/ClinicEz.Portal.Infrastructure/Messaging/Handlers/`: `GuestTeleconsultInviteIssuedHandler.cs`.
- `services/patient-api/ClinicEz.Patient.Infrastructure/Messaging/Handlers/`: `CommsCallStateChangedInteropHandler.cs`.
- `services/patient-api/ClinicEz.Patient.Api/Endpoints/`: Patient teleconsult endpoints.
- `packages/comms-sdk/src/native-ui/` & `src/web-ui/`: `CallWaitingRoom.tsx`, `CallStage.tsx`, `types.ts`.
- `packages/comms-sdk/src/react/hooks/`: `useCallSession.ts`.
- `apps/clinic-app/components/teleconsult/`: `TeleconsultWaitingRoomModal.tsx`.
- `apps/clinic-app/services/`: `clinicService.ts`.
- `apps/patient-app/navigation/screens/teleconsult/`: `TeleconsultWaitingRoom.screen.tsx`, `TeleconsultCall.screen.tsx`.
- `apps/portal-web/src/components/teleconsult/`: `TeleconsultGuestFlow.tsx`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | `AppointmentBookedEvent.AppointmentType` | Optional appointment modality on shared booking event | M1 | ORIGINAL_REQUEST §R1 (Foundation) |
| 2 | Facility Teleconsult Settings | Expose/validate 5 teleconsult settings on ClinicSettingsDto and commands | M1 | ORIGINAL_REQUEST §R1 (Foundation) |
| 3 | Teleconsult Appointment Creation | Infer modality, assign CallId, resolve policy, set status, create prepaid invoice | M2 | ORIGINAL_REQUEST §R2 (Foundation) |
| 4 | AppointmentDto Teleconsult Metadata | Extend AppointmentDto with teleconsult fields | M2 | ORIGINAL_REQUEST §R2 (Foundation) |
| 5 | Cashier Payment Clearance | Update teleconsult appointment on invoice paid & enqueue CommsCallPaymentCleared | M2 | ORIGINAL_REQUEST §R2 (Foundation) |
| 6 | Non-Mutating YAKAP Status | Surface HasActiveYakapEnlistment as informational badge without auto-exemption | M2 | ORIGINAL_REQUEST §R2 (Foundation) |
| 7 | Plain-Note Admission Override | Staff override with ReasonNote >= 5 chars, WORM audit, CommsCallPaymentCleared | M2 | ORIGINAL_REQUEST §R2 (Foundation) |
| 8 | Update Teleconsult Payment Policy | PUT endpoint to let staff switch policy anytime | M2 | ORIGINAL_REQUEST §R2 (Foundation) |
| 9 | Media Signaling (Join/End Call) | Join/End endpoints requesting zero-PHI tokens via Interop Hub with 10s fallback | M3 | ORIGINAL_REQUEST §R3 (Foundation) |
| 10 | CMK AES-256-GCM Vault Encryption | Encrypt segment uploads with {storageKey}.key sidecars, ticketed streaming decryption | M3 | ORIGINAL_REQUEST §R3 (Foundation) |
| 11 | Recording Sweeper Sidecar Cleanup | Clean up .key sidecars alongside segment and manifest purges | M3 | ORIGINAL_REQUEST §R3 (Foundation) |
| 12 | Consultation Encounter Linkage | Backfill ConsultationId on recording sessions when encounter is created | M3 | ORIGINAL_REQUEST §R3 (Foundation) |
| 13 | Interop Handlers & Registration | Register MediaRoomResponded and CommsRecordingConsentLogged handlers | M3 | ORIGINAL_REQUEST §R3 (Foundation) |
| 14 | `livekit-client` SDK Dependency | Add livekit-client ^2.24.0 to packages/comms-sdk/package.json | M4 | ORIGINAL_REQUEST §R4 (Foundation) |
| 15 | Comms Media Adapters | Implement IMediaRoomAdapter, LiveKitMediaAdapter, LocalPreviewMediaAdapter, SegmentRecorder | M4 | ORIGINAL_REQUEST §R4 (Foundation) |
| 16 | `useCallSession` Upgrade | Upgrade hook with callbacks & CommsContext while keeping zero-arg test fallback | M4 | ORIGINAL_REQUEST §R4 (Foundation) |
| 17 | `CallWaitingRoom` Realignment | Add staff policy selector, informational YAKAP badge, plain-note override | M4 | ORIGINAL_REQUEST §R4 (Foundation) |
| 18 | `CallStage` Implementation | Shared native-ui and web-ui call stage with REC banner, controls, dock action | M4 | ORIGINAL_REQUEST §R4 (Foundation) |
| 19 | Workstation Clinic Service Teleconsult APIs | Add teleconsult DTOs and all 16 API methods to clinicService.ts | M5 | ORIGINAL_REQUEST §R5 (Foundation) |
| 20 | Workstation ClinicCommsContext Docking | Add chart docking state and onOpenConsultationChart bridge | M5 | ORIGINAL_REQUEST §R5 (Foundation) |
| 21 | Workstation Waiting Room & Stage Modal | Integrate comms-sdk CallWaitingRoom, CallStage, and docked mini-bar | M5 | ORIGINAL_REQUEST §R5 (Foundation) |
| 22 | Workstation Scheduling & Inspection | Modality selector, policy pills, waiting room launcher in Schedule/Inspect modals | M5 | ORIGINAL_REQUEST §R5 (Foundation) |
| 23 | Facility Teleconsult Settings Card | TeleconsultSettingsCard mounted in GeneralSettingsTab | M5 | ORIGINAL_REQUEST §R5 (Foundation) |
| 24 | Timeline Recording Player Modal | ClinicRecordingPlayerModal with 15-min HMAC playback and medico-legal hold | M5 | ORIGINAL_REQUEST §R5 (Foundation) |
| 25 | Client #8 Media Broker Registration | Register Media Broker in Interop Hub docker-compose and dev/prod workflows | M7 | ORIGINAL_REQUEST §R1 |
| 26 | Media Broker Deployment Manifests | Create deploy/media-broker/docker-compose.yml and CI workflow | M7 | ORIGINAL_REQUEST §R1 |
| 27 | GHCR Publishing for Media Broker | Add media-broker to .github/workflows/publish-images.yml | M7 | ORIGINAL_REQUEST §R1 |
| 28 | LiveKit Deployment Credentials | Pass LiveKit env to portal-api and patient-api deployments | M7 | ORIGINAL_REQUEST §R1 |
| 29 | Entitlement Metering Verification | Verify AutoProvisionDefaultEntitlement in CallMinuteMeteringTests.cs | M7 | ORIGINAL_REQUEST §R1 |
| 30 | Shared RelayUrl & Guest Invite Contracts | Extend CommsCallStateChangedPayload with RelayUrl, add GuestTeleconsultInviteIssuedPayload | M7 | ORIGINAL_REQUEST §R2 |
| 31 | Clinic API Two-Party Token Routing | Publish CommsCallStateChangedPayload to Party.ForPatient on join/end call | M7 | ORIGINAL_REQUEST §R2 |
| 32 | Clinic API Guest Invite Endpoint | POST guest-invite endpoint issuing token, OTP, DOB hint, publishing to Party.Portal | M7 | ORIGINAL_REQUEST §R2 |
| 33 | Portal API Guest Invite Verification | GuestTeleconsultInviteIssuedHandler and GuestVerificationService hash verification | M7 | ORIGINAL_REQUEST §R2 |
| 34 | Patient API Teleconsult Endpoint & SignalR | RelayUrl in SignalR CallStateChanged and GET /api/v1/patient/teleconsult/calls/{callId} | M7 | ORIGINAL_REQUEST §R2 |
| 35 | Comms SDK Orientation & Link Props | Add orientation, orientation toggle, share patient link, dock, and PiP props | M8 | ORIGINAL_REQUEST §R3 |
| 36 | Portrait-First Preview & Framing | 3/4 portrait preview default with rotation toggle and link sharing | M8 | ORIGINAL_REQUEST §R3 |
| 37 | Centered Media Toolbar with Dock & PiP | Horizontally centered floating toolbar with btn-dock-call and btn-toggle-pip | M8 | ORIGINAL_REQUEST §R3 |
| 38 | Comms SDK Plain Copy | Replace clinical/technical jargon with user-friendly plain copy across UI | M8 | ORIGINAL_REQUEST §R3 |
| 39 | Participant Name Resolution | Fallback to provided name or generic fallback in useCallSession | M8 | ORIGINAL_REQUEST §R3 |
| 40 | Workstation Headerless Full-Screen Stage | 100% full screen edge-to-edge active call stage without header bar | M9 | ORIGINAL_REQUEST §R4 |
| 41 | Workstation Ultra-Thin Draggable Dock Bar | Single-row horizontal bar (~36-38px) with drag handle, labels, controls, zero inline video | M9 | ORIGINAL_REQUEST §R4 |
| 42 | Call Exit Confirmation Dialog | confirm-end-call-dialog confirmation before disconnecting from full-screen or dock | M9 | ORIGINAL_REQUEST §R4 |
| 43 | Workstation Native PiP & MediaSession | Native browser PiP with hidden persistent video element during docked transitions | M9 | ORIGINAL_REQUEST §R4 |
| 44 | Workstation Guest Invite & Status Hydration | createTeleconsultGuestInvite integration, patient link copy, and real clinician names | M9 | ORIGINAL_REQUEST §R4 |
| 45 | Patient App Teleconsult Polling & Admission | Poll call status, admit patient when ready, and wire CallStage | M10 | ORIGINAL_REQUEST §R5 |
| 46 | Portal Web Guest Call Session & Stage | Wire useCallSession, CallStage, video/audio tracks, native PiP, fix T3.2 YAKAP test | M10 | ORIGINAL_REQUEST §R5 |
| 47 | End-to-End Test Suite & Forensic Audit | Pass all 10 verification test suites and forensic integrity audit | M11 | ORIGINAL_REQUEST Acceptance |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Shared Interop & Facility Settings | `packages/shared-dotnet` event & `services/clinic-api` settings DTO/query/command | none | DONE (gate PASS) |
| 2 | Appointment & Payment Policy Management | `services/clinic-api` appointment creation, queries, cashiering, policy update, plain-note override | M1 | DONE (gate PASS) |
| 3 | Media Signaling & Vault Recording Encryption | `services/clinic-api` join/end call, zero-PHI tokens, CMK AES-256-GCM encryption with .key sidecars, HMAC tickets, retention sweeper, DI | M2 | DONE (gate PASS) |
| 4 | Workspace Communications & Media SDK | `packages/comms-sdk` livekit-client, adapters, useCallSession, CallWaitingRoom, CallStage native/web | none | DONE (gate PASS) |
| 5 | Clinic Workstation App Integration | `apps/clinic-app` clinicService, ClinicCommsContext, TeleconsultWaitingRoomModal, ScheduleVisitModal, AppointmentInspectionModal, TeleconsultSettingsCard, ClinicRecordingPlayerModal | M3, M4 | DONE (gate PASS) |
| 6 | Initial Final Verification & Hardening | Initial 6-milestone verification | M5 | DONE (gate PASS) |
| 7 | Backend Services & Deployment Infrastructure | `deploy/`, `.github/workflows/`, `services/media-broker`, `packages/shared-dotnet`, `services/clinic-api`, `services/portal-api`, `services/patient-api` | none | DONE (a9c32e48: 3,227 backend tests pass, auditor CLEAN, gate PASS) |
| 8 | Communications SDK Adaptations & Plain Copy | `packages/comms-sdk`: portrait preview, centered toolbar, dock/PiP buttons, plain copy, participant naming | none | DONE (fe4c8bb2: 473 tests pass, 0 typecheck/lint/token errors, gate PASS) |
| 9 | Clinic Workstation UI/UX & Native PiP | `apps/clinic-app`: full-screen stage, ultra-thin draggable dock (~36-38px), confirm-end-call-dialog, native PiP with persistent video, guest invite | M7, M8 | DONE (e5ea12eb: 226 tests pass, 0 typecheck/lint/token errors, gate PASS) |
| 10 | Patient App & Browser Guest Portal Video | `apps/patient-app`: call polling & admission; `apps/portal-web`: wire useCallSession & CallStage, fix T3.2 YAKAP test, native PiP | M7, M8 | DONE (cade03de: all tests pass, 0 token errors, auditor CLEAN, gate PASS) |
| 11 | Final End-to-End Verification & Audit | All 10 acceptance verification suites, adversarial checks, forensic integrity audit | M9, M10 | DONE (caf09ff8: 10/10 suites pass, 3,092 tests pass, auditor CLEAN, gate PASS) |

## Interface Contracts
### `packages/shared-dotnet` <-> Backend Services
- `CommsCallStateChangedPayload`: `Guid CallId`, `Guid? ConversationId`, `string TenantId`, `string FacilityId`, `CallKind Kind`, `string Status`, `string? RoomName`, `string? JoinToken`, `int StateVersion`, `DateTime ChangedAtUtc`, `string? RelayUrl = null`.
- `GuestTeleconsultInviteIssuedPayload`: `Guid AppointmentId`, `Guid CallId`, `string TenantId`, `string FacilityId`, `string InviteTokenHash`, `string ExpectedDobHash`, `string OtpHash`, `DateTime ExpiresAtUtc`, `DateTime IssuedAtUtc`.
- `InteropTypes`: `GuestTeleconsultInviteIssued = "portal.teleconsult.guest_invite_issued"`.

### `services/clinic-api` <-> `services/patient-api` & `services/portal-api`
- Clinic API publishes `CommsCallStateChangedPayload` to `Party.ForPatient(appointment.PatientId.ToString())` with `RelayUrl` and `JoinToken` (patient token).
- Clinic API publishes `GuestTeleconsultInviteIssuedPayload` to `Party.Portal`.
- Portal API consumes `GuestTeleconsultInviteIssued` via `GuestTeleconsultInviteIssuedHandler` to register pre-hashed guest credentials.
- Patient API consumes `CommsCallStateChanged` via `CommsCallStateChangedInteropHandler` and relays via SignalR with `relayUrl`.
- Patient API exposes `GET /api/v1/patient/teleconsult/calls/{callId}` returning `{ callId, status, roomName, relayUrl, joinToken }`.

### `services/clinic-api` <-> `apps/clinic-app`
- `POST /api/v1/teleconsult/appointments/{appointmentId}/guest-invite` -> returns `{ inviteToken, inviteUrl, otp, expiresAtUtc }`.

### `packages/comms-sdk` <-> Applications
- `CallWaitingRoomProps`: `videoOrientation?: 'portrait' | 'landscape'`, `onToggleOrientation?: () => void`, `patientLink?: string`, `onSharePatientLink?: () => void | Promise<void>`, `isCameraEnabled`, `isMicEnabled`, `onToggleCamera`, `onToggleMic`, `micLevel`.
- `CallStageProps`: `videoOrientation?: 'portrait' | 'landscape'`, `onToggleOrientation?: () => void`, `patientLink?: string`, `onSharePatientLink?: () => void | Promise<void>`, `onDockCall?: () => void | Promise<void>`, `onTogglePip?: () => void | Promise<void>`, `isPipSupported?: boolean`, `isPipActive?: boolean`, `hideHeader?: boolean`, `renderIcon?: (icon: CommsCallIconName) => React.ReactNode`.
