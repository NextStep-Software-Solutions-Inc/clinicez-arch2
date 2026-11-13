## 2026-11-12T23:12:21Z

Finalize the teleconsultation feature across the clinic facility backend (services/clinic-api), communications SDK (packages/comms-sdk), and workstation frontend (apps/clinic-app) according to the approved architecture and strict repository guardrails.

Working directory: /Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/finalize_teleconsultation_api
Integrity mode: development

Reference: /Users/macuser/.gemini/antigravity/brain/9542d721-8b8b-46ea-9635-c34ef9a2bc0a/implementation_plan.md


## 2026-11-13T09:23:39Z

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
