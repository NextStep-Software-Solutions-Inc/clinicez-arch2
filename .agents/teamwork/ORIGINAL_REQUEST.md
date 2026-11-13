# Original User Request

## Initial Request — 2026-11-13T09:21:57Z

Bring the entire ClinicEZ teleconsultation workflow to production readiness end-to-end across the Clinic Workstation (apps/clinic-app), Patient App (apps/patient-app), Browser Guest Portal (apps/portal-web), Comms SDK (packages/comms-sdk), and backend services (clinic-api, media-broker, interop-hub, patient-api, portal-api) connected to LiveKit Cloud.

Working directory: /Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/finalize_teleconsultation_api
Integrity mode: development

## Requirements

### R1. Deployment Infrastructure and Media Broker Provisioning
Deploy and register `media-broker` on the ClinicEZ Interop Hub, configure deployment manifests and CI/CD workflows, and verify entitlement metering.
- Register bootstrap client `#8: Media Broker` (`Kind=PlatformService`, `Service=media`, `ClientId=${MEDIA_HUB_CLIENT_ID:-media-broker}`) in `deploy/interop-hub/docker-compose.yml`, `.github/workflows/deploy-interop-hub-dev.yml`, and `.github/workflows/deploy-interop-hub-prod.yml`.
- Add `deploy/media-broker/docker-compose.yml` and `.github/workflows/deploy-media-broker-dev.yml` configuring `DbSchema=media`, `MediaBroker__AutoMigrate=true`, `MediaBroker__AutoProvisionDefaultEntitlement=true`, `Messaging__Transport=Hub`, `Messaging__Service=media`, and LiveKit credentials (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`).
- Add `media-broker` to `.github/workflows/publish-images.yml`.
- Pass `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` to `portal-api` deployments, and `LIVEKIT_URL` to `patient-api` deployments.
- Verify `AutoProvisionDefaultEntitlement` in `CallMinuteMeteringTests.cs` (default `false` in `MediaMeteringOptions.cs`).

### R2. Backend Two-Party Token Routing and Guest Invite Flow
Implement two-party teleconsultation event routing and guest invite generation across backend services via Interop Hub.
- Extend `CommsCallStateChangedPayload` with optional `string? RelayUrl = null` and define `GuestTeleconsultInviteIssued` payload with salted SHA-256 hashes in `packages/shared-dotnet`.
- In `clinic-api`, publish `CommsCallStateChangedPayload` (including `RelayUrl` and `patientToken`) to `Party.ForPatient(...)` when starting or ending calls.
- Add `POST /api/v1/teleconsult/appointments/{appointmentId}/guest-invite` in `clinic-api` to generate a secure invite token, 6-digit OTP, and DOB hint, publishing `GuestTeleconsultInviteIssued` to `Party.Portal`.
- In `portal-api`, implement `GuestTeleconsultInviteIssuedHandler` and update `GuestVerificationService` to verify guest invites and mint LiveKit tokens for `call-{callId}`.
- In `patient-api`, include `relayUrl` in SignalR `CallStateChanged` broadcasts and provide `GET /api/v1/patient/teleconsult/calls/{callId}` returning call status, room name, relay URL, and join token.

### R3. Comms SDK Adaptations and Plain Copy
Adapt Comms SDK components for portrait-first framing, centered controls, PiP, docking, and plain language terminology.
- Add optional props to `CallWaitingRoomProps` and `CallStageProps` for video orientation, orientation toggle, share patient link, dock call, and picture-in-picture.
- Support portrait-first camera preview (`3 / 4`) and in-call framing with rotation toggle and patient link sharing.
- Center floating bottom `mediaToolbar` horizontally with dock button (`btn-dock-call`) and PiP button (`btn-toggle-pip`) alongside existing media controls.
- Replace technical/clinical jargon with user-friendly plain copy across waiting room and call stage components.

### R4. Clinic Workstation Call Stage, Ultra-Thin Draggable Dock, Native PiP, and Confirmation Dialog
Enhance Clinic Workstation teleconsultation UI with headerless full-screen display, ultra-thin draggable docked mode, native PiP, and call exit confirmation.
- Render active call stage in 100% full screen edge-to-edge without header bar when in call.
- Support native browser/OS Picture-in-Picture (`requestPictureInPicture`) and MediaSession integration on Web, maintaining a hidden persistent video element during docked transitions.
- Provide an ultra-thin single-row horizontal draggable dock bar (`~36-38px` total height) with drag handle, patient name label, recording indicator, mic, cam, PiP, maximize, and end call controls with zero inline video box.
- Enforce a confirmation dialog (`confirm-end-call-dialog`) when ending a call from full-screen or docked mode.
- Integrate `createTeleconsultGuestInvite` for patient link copying, hydrate teleconsult status, resolve real clinician names, and replace jargon with plain copy.

### R5. Patient App and Guest Portal Video Integration
Wire live video conferencing and plain copy into the Patient App and Browser Guest Portal.
- In `patient-app`, poll teleconsult call status, admit patient when ready, and render active call via `CallStage`.
- In `portal-web`, wire `useCallSession` and `CallStage` for guests in call, attach video/audio tracks, support native PiP if supported, and remove jargon copy.

### R6. Architectural Integrity and Workspace Guardrails
- Build directly on existing uncommitted changes in the worktree without reverting them.
- Do not terminate port 8081 (active Expo web preview).
- Prohibit PostgreSQL schema migrations, external message brokers (use ClinicEZ Interop Hub only), direct cross-service HTTP calls, and PHI in LiveKit room/identity identifiers.
- Comply with `check-tokens.mjs` and `check-no-external-hosts.mjs`.
- Execute dotnet CLI commands via `/Users/macuser/.dotnet/dotnet`.

## Acceptance Criteria

### Deployment and Backend Services
- [ ] Media Broker is registered as client `#8` in Interop Hub docker-compose and deployment workflows.
- [ ] `deploy/media-broker/docker-compose.yml` and `.github/workflows/deploy-media-broker-dev.yml` exist and follow platform deployment conventions.
- [ ] `CallMinuteMeteringTests.cs` passes and verifies `AutoProvisionDefaultEntitlement` behavior with `false` as default in `MediaMeteringOptions.cs`.
- [ ] `POST /api/v1/teleconsult/appointments/{appointmentId}/guest-invite` issues cryptographic invite token, OTP, and DOB hint, and publishes `GuestTeleconsultInviteIssued`.
- [ ] `portal-api` verifies guest invites via `GuestVerificationService` and mints LiveKit JWT tokens for guests.
- [ ] `patient-api` returns call status, room name, relay URL, and join token via `GET /api/v1/patient/teleconsult/calls/{callId}`.

### Comms SDK and Plain Copy
- [ ] `CallWaitingRoom` supports portrait-first preview (`3 / 4`), rotation toggle, and plain language labels without jargon.
- [ ] `CallStage` centers bottom toolbar with `btn-dock-call` and `btn-toggle-pip` controls.
- [ ] `useCallSession` uses provided participant name or generic fallback instead of hardcoded clinician names.

### Clinic Workstation UI/UX
- [ ] Active call stage displays 100% full screen edge-to-edge with no header bar or close button.
- [ ] Docked call stage renders as an ultra-thin single-row bar (`~36-38px` height) with drag handle, patient label, and compact controls without inline video.
- [ ] Ending a call prompts a confirmation dialog (`confirm-end-call-dialog`) before disconnecting.
- [ ] Native Web Picture-in-Picture stays active across full-screen and docked mode transitions via persistent hidden video track.
- [ ] Copy across clinic teleconsult components uses plain terms without technical or clinical jargon.

### Patient App and Guest Portal
- [ ] `patient-app` polls call status, admits patient when ready, and renders active call via `CallStage`.
- [ ] `portal-web` connects guest to LiveKit room via `useCallSession` and renders active call stage.

### Verification Suites
- [ ] `/Users/macuser/.dotnet/dotnet test services/media-broker/ClinicEz.MediaBroker.Tests/ClinicEz.MediaBroker.Tests.csproj` passes.
- [ ] `/Users/macuser/.dotnet/dotnet test services/interop-hub/ClinicEz.Interop.Tests/ClinicEz.Interop.Tests.csproj` passes.
- [ ] `/Users/macuser/.dotnet/dotnet test services/portal-api/ClinicEz.Portal.Tests/ClinicEz.Portal.Tests.csproj` passes.
- [ ] `/Users/macuser/.dotnet/dotnet test services/patient-api/ClinicEz.Patient.Application.Tests/ClinicEz.Patient.Application.Tests.csproj --filter "FullyQualifiedName~CallStateChanged"` passes.
- [ ] `/Users/macuser/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~Teleconsult"` passes.
- [ ] `bun run typecheck:comms && bun run lint:comms && bun run test:comms` passes.
- [ ] `bun run typecheck:clinic && bun run lint:clinic` passes.
- [ ] `bun test apps/clinic-app/tests/teleconsultWorkflow.test.ts apps/clinic-app/tests/challenger_m5_teleconsult_stress.test.ts apps/clinic-app/tests/challenger_m5_2_adversarial.test.ts apps/clinic-app/tests/challenger_m6_adversarial_clinic.test.ts` passes.
- [ ] In `apps/patient-app`, `bun run typecheck` and `bun test tests/clinical-safety-records.test.ts` pass.
- [ ] In `apps/portal-web`, `bun run typecheck` and `bun test tests/guestTeleconsultJoin.test.tsx tests/guestTeleconsultAdversarial.test.tsx` pass.
