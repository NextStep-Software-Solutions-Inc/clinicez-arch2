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


## Approved Task Prompt — 2026-11-14T11:41:21Z

Finalize Clinic EZ's Teleconsultation capability across commercial pay-as-you-go metered licensing, hierarchical governance from tenant workspace to clinic administrator settings, in-call participants roster with relocated invite link and visible 6-digit access PIN, explicit clinician session termination vs accidental disconnect handling, solo/empty room safeguards, and reliable end-to-end screen sharing as specified in the approved implementation plan.

Working directory: /Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/finalize_teleconsultation_api
Integrity mode: development

Reference: /Users/macuser/.gemini/antigravity/brain/9542d721-8b8b-46ea-9635-c34ef9a2bc0a/implementation_plan.md

## Requirements

### R1. CallStage Participants Roster, Relocated Copy Invite Link & Visible 6-Digit Guest PIN
Remove the upper-left copy invite icon (`btn-stage-copy-invite` / `topLeftControls`) from `CallStage.tsx` in both `packages/comms-sdk/src/native-ui/CallStage.tsx` and `packages/comms-sdk/src/web-ui/CallStage.tsx` (and keep the redundant center waiting room Message button absent). Add a Users icon button (`btn-toggle-participants`, >=44x44px touch target) with a live participant count badge (`badge-participants-count`) in the bottom floating media toolbar that toggles a docked right-hand Participants Roster panel (`panel-participants-roster`), mutually exclusive with the In-Call Chat drawer. Inside the roster, render the Consultation Invite Link with copy button (`btn-roster-copy-invite`) and `"Copied!"` confirmation, the visible 6-Digit Access PIN (`text-roster-invite-pin`, `btn-roster-copy-pin`) via optional `patientPin` and `onCopyPatientPin` props on `CallWaitingRoom` and `CallStage`, plus live participant list (`(You)` and remote attendees, `"In call"` vs `"Waiting to join"`, with mic, camera, and screen-share status indicators). In `TeleconsultWaitingRoomModal.tsx` and `AppointmentInspectionModal.tsx`, store `{ inviteUrl, otp, expiresAtUtc }` in state to reuse the active invite across copy actions without regenerating PINs, preserving `challenger_m9_adversarial_clinic.test.ts` assertions on `btn-copy-patient-link`.

### R2. End-to-End Screen Sharing Reliability
Decouple local screen-share and camera tracks across `IMediaRoomAdapter.ts`, `LiveKitMediaAdapter.ts`, `LocalPreviewMediaAdapter.ts`, `CallStage.tsx` (`native-ui` and `web-ui`), `TeleconsultWaitingRoomModal.tsx`, and `TeleconsultGuestFlow.tsx`. In `LiveKitMediaAdapter`, verify `screen_share` publication exists after `setScreenShareEnabled(true)` before emitting state changes to prevent cancelled browser pickers from falsely emitting active sharing, subscribe to `RoomEvent.LocalTrackPublished` and attach `{ once: true }` `'ended'` listener on `pub.track.mediaStreamTrack` so clicking native OS/browser "Stop sharing" immediately updates `isScreenSharing` to `false`, and prioritize active `screen_share` tracks across all remote participants in `getRemoteVideoTrack()`. Promote active screen shares to the main stage with `contain` aspect ratio (including local screen share when no remote video is active), switch local PiP to landscape aspect ratio + render `banner-screen-sharing` ("You are sharing your screen" + "Stop Sharing" button) when `isScreenSharing` is `true`, and surface `notify.error(...)` on non-cancelled `getDisplayMedia` permission failures.

### R3. Opt-In Pay-As-You-Go Metered Licensing, Cost Allocation & Separate Overage Billing
Remove `FacilityFeatureKeys.Teleconsultation` / `"feature.teleconsultation"` from default seeded plans (`pro` and `enterprise` in `services/portal-api/ClinicEz.Portal.Api/appsettings.json` and `PlanTierDefaults.cs`), keeping `MediaMeteringOptions.AutoProvisionDefaultEntitlement = false`. Update existing plan/entitlement tests that assumed seeded teleconsultation by default so all seeded workspaces start with teleconsultation strictly disabled until explicitly enabled in Portal Billing. Implement `WorkspaceTeleconsultBilling` (default `IsEnabled = false`, `BillingMode`: `"Prepaid"` | `"Postpaid"`, `RatePerMinutePhp` default `5.00m` configurable via SystemSettings & SuperAdmin overrides, `AllocatedBudgetPhp`, `PrepaidBalancePhp`, `AllowOverageBeyondAllocation`, monthly usage/billed/overage counters) and `TeleconsultUsageRecord` (idempotent by `CallId`, zero PHI) with EF Core migrations in `services/portal-api`. Synchronize media entitlement updates (`InteropTypes.MediaEntitlementUpdated`, `Party.Portal` -> `Party.Media`) between `portal-api` and `media-broker`. Handle `InteropTypes.MediaUsageRecorded` in `portal-api` to deduct Prepaid balances or accrue separate Postpaid/overage charges. In `media-broker`, persist `AllowOverdraft` and allow pure pay-as-you-go postpaid calls (`IsActive && AllowOverdraft` even when base `CallMinutesMonthly == 0`), ensuring active clinical consultations are never severed mid-call if balances or budgets deplete. Expose billing management endpoints and UI in `portal-web` and `admin-web`.

### R4. Hierarchical Governance: Tenant Workspace to Clinic Administrator Settings
Add `public bool EnableTeleconsultation { get; set; } = false;` to `FacilitySettings` with EF Core migration in `services/clinic-api`, exposing `EnableTeleconsultation` + computed `IsWorkspaceTeleconsultEntitled` on `ClinicSettingsDto`. Enforce two-tier governance: reject `UpdateClinicSettingsCommand` when `EnableTeleconsultation == true` if `!IsWorkspaceTeleconsultEntitled` (`ForbiddenException`). Cascade `EnableTeleconsultation = false` whenever an updated facility license removes teleconsultation entitlement. Gate teleconsultation appointment scheduling, virtual waiting room admission, `JoinTeleconsultCallCommand`, and `CreateTeleconsultGuestInviteCommand` behind effective enablement (`IsWorkspaceTeleconsultEntitled && EnableTeleconsultation`) on licensed facilities. Add master `toggle-clinic-teleconsult-enabled` in `TeleconsultSettingsCard.tsx` (locked with workspace portal notice when not entitled, toggleable when entitled) and gate the Virtual Teleconsultation modality in `Appointments.screen.tsx` and `ScheduleVisitModal.tsx`.

### R5. Clinician Session Termination, Reconnection, Solo Warning & Empty Session Safeguards
Accidental / intermittent disconnects (Wi-Fi drop, browser reload, tab close without clicking End Call) must never invoke `EndTeleconsultCallCommand`, preserving `MediaCallSession` (`RoomRejoined`, 2-hour LiveKit token TTL) and keeping the 60-minute guest invite link + 6-digit PIN active for seamless reconnection. Explicit physician "End Teleconsultation" (`EndTeleconsultCallCommand.cs` and `handleEndCall`) must broadcast `{ type: "call_ended_by_clinician", endedAtUtc }` over the LiveKit data channel to immediately transition connected guests in `TeleconsultGuestFlow.tsx` to `stage = "ended"` ("The attending clinician has ended this consultation."), enqueue `InteropTypes.GuestTeleconsultInviteRevoked` (`Party.ForFacility` -> `Party.Portal`) handled in `portal-api` to immediately mark matching guest invites as revoked (`GUEST_CONSULTATION_ENDED`, HTTP 410 Gone) checked via zero-PHI `GET /portal/guest/teleconsult/status` on mount by `TeleconsultGuestFlow.tsx`, permit and enqueue `InteropTypes.MediaRoomEnded` (`Party.ForFacility` -> `Party.Media`) to record call end in `media-broker` (stopping metered billing immediately and emitting `MediaUsageRecorded`), and invoke LiveKit RoomService `DeleteRoom` with non-blocking fallback. In `CallStage` and waiting room modals, continuous solo occupancy with 0 remote participants for 5 minutes (`soloWarningThresholdMs = 300_000`) displays `banner-solo-participant-warning` with Stay in Call (`btn-solo-stay`) and Leave Room (`btn-solo-leave`) actions, auto-leaving after a 2-minute countdown (`soloAutoLeaveGraceMs = 120_000`). In `services/media-broker`, implement abandoned session cleanup (`CleanupAbandonedSessionsAsync` / background monitor) for stale Active sessions outliving token/room TTL.

### R6. Architecture Guardrails & Codebase Integrity
Preserve existing icon map limits: do NOT add keys to `CommsCallIconName` or `COMMS_ICON_MAP` in `apps/clinic-app` (`challenger_m8_adversarial_clinic.test.ts` strictly asserts 17 keys; use optional `renderParticipantsIcon` prop on `CallStage` + `Icon name="patients"` in `TeleconsultWaitingRoomModal.tsx`). Introduce zero hardcoded hex (`#...`) or `rgba(...)` color literals in `apps/clinic-app` or `apps/portal-web` (enforced by `lint:tokens` and adversarial tests). Use `bun` / `bunx` (never `npx`), run `apps/clinic-app/tests/comms_issue139_resilience_and_polish.test.ts` in its own isolated `bun test` invocation, keep the live Expo Web dev server on `http://localhost:8081` running untouched, and do NOT `git commit` or `git push`.

## Verification Resources

- Implementation Plan: `/Users/macuser/.gemini/antigravity/brain/9542d721-8b8b-46ea-9635-c34ef9a2bc0a/implementation_plan.md`
- Backend .NET Suites:
  * `dotnet test services/media-broker/ClinicEz.MediaBroker.Tests`
  * `dotnet test services/portal-api/ClinicEz.Portal.Tests`
  * `dotnet test services/interop-hub/ClinicEz.Interop.Tests`
  * `dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests --filter "FullyQualifiedName~Teleconsult|FullyQualifiedName~License|FullyQualifiedName~Entitlements"`
- Comms SDK UI & Media Adapter Suites:
  * `cd packages/comms-sdk && bun test tests && bun run typecheck`
- Clinic App Suites, Token Lint & Typecheck:
  * `cd apps/clinic-app && bun test tests/commsBrandTheming.test.ts tests/challenger_m6_adversarial_clinic.test.ts tests/challenger_m8_adversarial_clinic.test.ts tests/challenger_m9_adversarial_clinic.test.ts tests/teleconsultWorkflow.test.ts && bun run typecheck && bun run lint:tokens && bun run lint:hosts`
  * `cd apps/clinic-app && bun test tests/comms_issue139_resilience_and_polish.test.ts`
- Portal Web & Admin Web Suites + Typecheck:
  * `cd apps/portal-web && bun test tests/guestTeleconsultJoin.test.tsx tests/planAndAllocationMetrics.test.ts tests/tenantBillingAndReceipts.test.ts && bunx tsc --noEmit`
  * `cd apps/admin-web && bun test tests/adminPlansAndEntitlements.test.ts tests/challenger_m3_plan_entitlements.test.ts && bunx tsc --noEmit`
- Additional Tests:
  * Unit, integration, and adversarial tests covering: stable 6-digit PIN display and copy without rotation on copy, explicit clinician End Call terminating guest UI + revoking guest link + calling `MediaRoomEnded` while accidental drops preserve reconnection, 5-min solo warning + 2-min auto-leave countdown, abandoned session cleanup in `media-broker`, PAYG rate calculation (₱5.00/min default), Prepaid/Postpaid cutoff protection (no mid-call severance), Workspace -> Clinic Settings cascade and permission rejection, Participants Roster toggle and copy link confirmation, and screen share track isolation / picker cancel / native stop event handling.

## Acceptance Criteria

### Participants Roster, Invite Link & 6-Digit PIN
- [ ] Upper-left copy icon (`btn-stage-copy-invite`) is removed from `CallStage.tsx` in both `native-ui` and `web-ui`
- [ ] Bottom media toolbar contains a Users button (`btn-toggle-participants`, >=44x44px touch target) with live participant count badge (`badge-participants-count`)
- [ ] Clicking Users button toggles docked right-hand Participants Roster panel (`panel-participants-roster`) and is mutually exclusive with In-Call Chat drawer
- [ ] Participants Roster displays Consultation Invite Link row with copy button (`btn-roster-copy-invite`) and temporary `"Copied!"` confirmation
- [ ] Participants Roster displays visible 6-Digit Access PIN (`text-roster-invite-pin`, `btn-roster-copy-pin`) via `patientPin` and `onCopyPatientPin` props
- [ ] Copying patient link in `AppointmentInspectionModal.tsx` and `TeleconsultWaitingRoomModal.tsx` reuses active invite state without rotating PINs on every click, preserving `challenger_m9_adversarial_clinic.test.ts` assertions
- [ ] Participants Roster lists all attendees (`(You)` and remote participants) with call status (`"In call"` vs `"Waiting to join"`) and live mic/camera/screen-share indicators

### Screen Sharing Reliability
- [ ] Local camera and screen share tracks are decoupled via separate getter methods and do not collide
- [ ] Cancelling browser screen share picker does not emit false positive active screen sharing state
- [ ] Clicking native browser/OS "Stop sharing" bar immediately resets screen sharing state to false across UI
- [ ] Active screen share is promoted to the main stage with `objectFit="contain"` (including local screen share when remote video is absent)
- [ ] Remote screen share tracks render with `objectFit="contain"` and are never cropped by `'cover'`
- [ ] Local PiP switches to landscape aspect ratio and `banner-screen-sharing` ("You are sharing your screen" + "Stop Sharing" button) displays while sharing
- [ ] Non-cancelled `getDisplayMedia` permission denials surface clear `notify.error(...)` toast

### Pay-As-You-Go Metered Licensing & Billing
- [ ] Teleconsultation feature is removed from default seeded `pro` and `enterprise` plans; existing dev/seeded workspaces start with teleconsultation disabled
- [ ] `WorkspaceTeleconsultBilling` entity and migrations exist with default `IsEnabled = false`, `BillingMode` (`"Prepaid"` | `"Postpaid"`), and `RatePerMinutePhp` default `5.00m`
- [ ] Idempotent `TeleconsultUsageRecord` entities store call durations and billing breakdown with zero patient PHI
- [ ] `MediaUsageRecordedHandler` deducts prepaid balances or accrues postpaid/overage charges correctly
- [ ] `MediaMeteringService` and `TenantMediaEntitlement` ensure active calls are never terminated mid-flight when balances deplete
- [ ] Portal Web displays `TeleconsultPaygCard.tsx` with activation toggle, mode selection, cost allocation input, and live usage metrics
- [ ] Admin Web displays SuperAdmin controls for rate configuration, credit top-up, and teleconsultation enablement overrides

### Hierarchical Governance: Workspace to Clinic
- [ ] `FacilitySettings.EnableTeleconsultation` defaults to `false` with EF Core migration
- [ ] `UpdateClinicSettingsCommand` rejects enabling teleconsultation with `ForbiddenException` when workspace lacks entitlement
- [ ] Incoming license updates without teleconsultation automatically cascade `EnableTeleconsultation = false` across facilities
- [ ] Teleconsultation appointment scheduling, virtual waiting room admission, call joining, and guest invite generation are blocked when not effectively enabled
- [ ] `TeleconsultSettingsCard.tsx` displays locked notice when workspace entitlement is absent and enables toggle when entitled
- [ ] Modality selector in `Appointments.screen.tsx` and `ScheduleVisitModal.tsx` gates teleconsultation behind effective enablement

### Clinician Session Termination, Reconnection & Room Safeguards
- [ ] Accidental / intermittent disconnects (network drop, browser reload, tab close) do not invoke `EndTeleconsultCallCommand`, preserving `MediaCallSession` and 60-minute guest invite link for seamless reconnection
- [ ] Explicit physician End Call broadcasts data message to guest (`stage = "ended"`), revokes guest invite (`GuestTeleconsultInviteRevoked`), enqueues `MediaRoomEnded` to stop metered billing, and disconnects LiveKit room server-side
- [ ] Preflight zero-PHI guest status check on mount in `TeleconsultGuestFlow.tsx` displays "This teleconsultation has ended" for revoked/ended consultations without prompting for credentials
- [ ] Continuous 5-minute solo presence triggers `banner-solo-participant-warning` with Stay in Call and Leave Room actions; unanswered 2-minute countdown auto-disconnects from LiveKit
- [ ] Idle/abandoned sessions outliving token/room TTL are cleaned up by `media-broker` background cleanup

### Quality, Regressions & Architecture Guardrails
- [ ] All automated test suites in Verification Resources pass cleanly
- [ ] Key count in `COMMS_ICON_MAP` remains exactly 17
- [ ] Zero hardcoded hex or rgba color literals in `apps/clinic-app` and `apps/portal-web` (`lint:tokens` passes)
- [ ] `lint:hosts` passes
- [ ] Live Expo dev server on port 8081 remains running untouched
- [ ] No git commit or push performed


## Follow-up — 2026-11-14T13:33:00Z

## URGENT LIVE USER FEEDBACK & COURSE CORRECTION — R7 UI/UX Remediation (Must Complete Before Closing Run)

While you were finishing M13/M14, the user tested the live Clinic App (port 8081) and Portal Web Guest Join flow and shared **5 screenshots** showing concrete broken layout, stubs, YAKAP clutter, and emoji/fallback defects.

Do **NOT** declare the Teamwork run complete until all **R7.1–R7.4** fixes below are implemented, peer-reviewed, adversarial-tested, and verified alongside M14 and M16. Assign clean non-overlapping ownership across your active workers (`call-stage-media`, `control-plane`, `clinic-cascade`, `portal-ui`).

---

### R7.1 — Fix Completely Broken `portal-web` Layout (`CallWaitingRoom` & `CallStage`)
**Root Cause Observed in Screenshots 1, 2, 3, 5**:
`apps/portal-web/src/app/globals.css` uses Tailwind CSS v4 (`@import "tailwindcss";`) **without** a `@source` directive pointing to `packages/comms-sdk/src`. Because `@clinicez/comms-sdk` exports raw TypeScript/JSX from `packages/comms-sdk/src/web-ui/*`, Tailwind v4 in `apps/portal-web` never scanned `packages/comms-sdk/src/web-ui/*.tsx`. As a result, `bottom-4`, `bottom-3`, `-translate-x-1/2`, `aspect-[3/4]`, `w-44`, `sm:w-56`, `bg-slate-950`, `bg-slate-900/90`, etc. were omitted from compiled CSS — causing the `CallWaitingRoom` video box to collapse vertically and the `CallStage` floating toolbar & PiP to render vertically centered right across the middle of the clinician's face!

**Required Changes**:
1. In `apps/portal-web/src/app/globals.css`, add right after `@import "tw-animate-css";`:
   ```css
   @source "../../../../packages/comms-sdk/src";
   ```
   (Verify compiled CSS includes `bottom-4`, `-translate-x-1/2`, `aspect-\[3\/4\]`, etc.)
2. In `apps/portal-web/src/components/teleconsult/TeleconsultGuestFlow.tsx`:
   - Wire a real browser `getUserMedia` camera + microphone self-preview during `stage === "waiting_room"` (passing `renderVideoPreview`, `isCameraEnabled`, `isMicEnabled`, `onToggleCamera`, `onToggleMic`, and live `micLevel`), cleanly releasing the staging stream on unmount or transition to `in_call` before LiveKit acquires tracks.

---

### R7.2 — Zero Emojis & Zero Uppercase Text Fallbacks — Lucide Icons Everywhere
**User Mandate**: *"do not use emoji - replace it with lucide icons"*

**Defects Observed**:
- Clinic App Participants Roster (Screenshot 4) uses Unicode emojis `🎤`, `🔇`, `📹`, `🚫`, `🖥️` and text `✕` in `packages/comms-sdk/src/native-ui/CallStage.tsx` (lines 738, 804–889) and `packages/comms-sdk/src/web-ui/CallStage.tsx` (lines 721, 807–854).
- Portal Web screenshots (1, 2, 3, 5) show uppercase text ovals `MIC`, `CAM`, `SHARE`, `PIP`, `ROTATE`, `CHAT`, `END`, `OK`, `LOCK` (plus missing `USERS` icon in `CallStage`) because `TeleconsultGuestFlow.tsx` omitted `renderIcon`, `renderParticipantsIcon`, and `renderPrivacyIcon`, and `web-ui` used text fallback strings (`MIC`, `CAM`, `OK`, `LOCK`, `LOCKED`, `MD`, `E2EE`, `✕`).

**Required Changes**:
1. **`packages/comms-sdk/src/native-ui/CallStage.tsx`**:
   - Remove ALL emojis (`🎤`, `🔇`, `📹`, `🚫`, `🖥️`, `✕`).
   - Render IN ROOM mic/cam/screenshare status indicators using `renderIcon?.(active ? 'mic' : 'micOff', { size: 14, color })`, `renderIcon?.(active ? 'video' : 'videoOff', { size: 14, color })`, and `renderIcon?.('screenShare', { size: 14, color })` (reusing existing keys in `COMMS_ICON_MAP` so `apps/clinic-app/components/teleconsult/TeleconsultWaitingRoomModal.tsx` keeps its **strict 17-key `COMMS_ICON_MAP` invariant**!) with clean RN geometric View fallbacks if `renderIcon` is omitted.
   - Replace `✕` on `btn-close-participants` with a crisp geometric two-line `X` (`View` cross bars) — zero emoji/dingbat text.
2. **`packages/comms-sdk/src/web-ui/CallStage.tsx`, `CallWaitingRoom.tsx`, `GuestJoinPage.tsx`, `MessageThread.tsx`**:
   - Remove ALL Unicode emojis (`🎤`, `🔇`, `📹`, `🚫`, `🖥️`, `✕`, etc.).
   - Replace ALL raw uppercase text icon fallbacks (`MIC`, `MUTE`, `CAM`, `OFF`, `SHARE`, `STOP`, `PIP`, `ROTATE`, `PORTRAIT`, `LANDSCAPE`, `CHAT`, `USERS`, `REC`, `DOCK`, `END`, `OK`, `LOCK`, `LOCKED`, `MD`, `E2EE`, `COPY`, `!`, `...`) with crisp inline Lucide-style SVG icons (`viewBox="0 0 24 24"`, `stroke="currentColor"`, `strokeWidth="2"`, `strokeLinecap="round"`, `strokeLinejoin="round"`) when `renderIcon` is omitted. Keep `aria-label` and `title` accurate for accessibility and tests!
   - Also in `packages/comms-sdk/src/web-ui/MessageThread.tsx` line 196, fix `isMe` from `msg.senderType === 'Staff' && msg.senderId === currentUserId` to `Boolean(msg.senderId && msg.senderId === currentUserId)` so patient/guest messages align properly as `"isMe"`.
3. **`apps/portal-web/src/components/teleconsult/TeleconsultGuestFlow.tsx`**:
   - Pass full `lucide-react` mappers for `renderIcon` (all 17 `CommsCallIconName` keys: `Mic`, `MicOff`, `Video`, `VideoOff`, `CameraOff`, `MonitorUp`, `MonitorOff`, `SwitchCamera`, `MessageSquare`, `CircleDot`, `PhoneOff`, `ShieldCheck`, `Lock`, `PanelRight`, `PictureInPicture2`, `RotateCw`, `Share2`), `renderParticipantsIcon` (`Users`), and `MessageThread`'s `renderPrivacyIcon` (`EyeOff` / `Eye`).
4. Run a repo emoji scan on `packages/comms-sdk/src`, `apps/clinic-app/components/teleconsult`, and `apps/portal-web/src/components/teleconsult` (`U+1F300–U+1FAFF`, `U+2600–U+27BF`) — must return **0 matches** in teleconsultation UI files (note: `packages/comms-sdk/src/core/reactions.ts` is general chat reactions).

---

### R7.3 — Remove PhilHealth YAKAP Completely from Teleconsultation
**User Mandate**: *"yakap has nothing to do with teleconsult -remove it."*

**Required Changes**:
1. Remove the PhilHealth YAKAP informational card (`PHILHEALTH YAKAP`, `YAKAP Auto-Exempt`, `Active Konsulta Enlistment Verified`), YAKAP badges, and YAKAP prepayment bypass logic from:
   - `packages/comms-sdk/src/web-ui/CallWaitingRoom.tsx`
   - `packages/comms-sdk/src/native-ui/CallWaitingRoom.tsx`
   - `packages/comms-sdk/src/react/hooks/useCallSession.ts` (default `isYakapExempt` to `false` or remove YAKAP exemption from `canAdmit` / `admitPatient` gating; verify which tests touch `useCallSession`)
   - `apps/portal-web/src/components/teleconsult/TeleconsultGuestFlow.tsx` (remove `isYakapExempt = true` default and YAKAP prop forwarding)
   - `apps/clinic-app/components/teleconsult/TeleconsultWaitingRoomModal.tsx` & `apps/clinic-app/components/calendar/AppointmentInspectionModal.tsx`
   - In `CallWaitingRoom.tsx`, when `userRole === 'Patient'` / Guest (waiting room in `portal-web`), do NOT show the clinician-only `Call Recording` initiation toggle (patients respond via the in-call consent request banner when the clinician initiates recording, rather than turning recording on in the waiting room).
2. Update teleconsultation tests that previously asserted YAKAP banners/exemptions inside waiting rooms (`packages/comms-sdk/tests/ui/call-waiting-room.test.ts`, `packages/comms-sdk/tests/adversarial/staff-workstations.adversarial.test.ts`, `packages/comms-sdk/tests/challenger_m4_adversarial_empirical.test.ts`, `packages/comms-sdk/tests/challenger_m6_adversarial_comms.test.ts`, `packages/comms-sdk/tests/react/useCallSession-upgraded.test.ts`, `apps/portal-web/tests/guestTeleconsultJoin.test.tsx`, `apps/portal-web/tests/challenger_m10_portal_adversarial.test.tsx`) to verify PhilHealth YAKAP is **never** rendered in teleconsultation waiting rooms. (**Do NOT touch unrelated PhilHealth YAKAP domain tests like `yakapZeroPhiConsole.test.ts`, `challenger_m4b_adversarial_security.test.ts`, or `workspaceSearchDialog.test.tsx`.**)

---

### R7.4 — Real Clinic, Clinician, Patient & Appointment Details + Roster Deduplication
**Defects Observed**:
- **Screenshot 1 & 2 (`portal-web`)**: Hardcoded stubs `"ClinicEZ Healthcare"`, `"Guest Patient"`, `"ClinicEZ Healthcare Attending Clinician"`, `"Today (Immediate Intake)"`, and raw UUID `• ID: b5f2e0af-...` in header.
- **Screenshot 4 (`clinic-app` Participants Roster)**: Header badge says `Participants 2`, but `IN ROOM` shows **3** rows: `Wave Ambray (You)`, `Wave Ambray`, and `Participant`!
- **Screenshot 5 (`portal-web`)**: Duplicate top header `In-Call Chat` + `Leave` buttons duplicating the `CallStage` toolbar.

**Required Changes (Strict Zero-PHI Invariants Preserved)**:
1. **Interop & Backend Metadata Hydration**:
   - **CRITICAL TEST INVARIANT**: `TeleconsultContractsTests.GuestTeleconsultInviteIssuedPayload_Enforces_Zero_Phi_Contract_Boundary` explicitly forbids properties named `DateOfBirth`, `Otp`, `InviteToken`, `PatientName`, or `Mrn` on `GuestTeleconsultInviteIssuedPayload`! And `ChallengerM7AdversarialTests.ZeroPhi_StoredGuestInvite_ContainsOnlyHashes_NoPlaintextCredentials` checks `stored.ToString()` contains no plaintext patient credentials, while `AdversarialGuestVerificationTests.VerifyGuest_Success_ProducesValidLiveKitJwtToken_WithZeroPhiClaims` asserts the LiveKit guest JWT has NO `"name"`, `"dob"`, `"birthdate"`, or `"patient_id"` claims!
   - **Design that satisfies BOTH real UI display AND 100% Zero-PHI interop/storage/JWT**:
     - Extend `GuestTeleconsultInviteIssuedPayload` (`packages/shared-dotnet/Interop/Contracts/GuestTeleconsultContracts.cs`) with backwards-compatible optional trailing parameters:
       `string? ClinicName = null, string? ClinicSupportPhone = null, string? ClinicianName = null, DateTime? ScheduledAtUtc = null, string? EncryptedGuestContext = null`
       (Note: clinic name, clinic phone, clinician name, and scheduled time are facility/clinician metadata, NOT forbidden patient PHI properties, and `EncryptedGuestContext` is opaque AES-256-GCM ciphertext!).
     - In `CreateTeleconsultGuestInviteCommand.cs` (`services/clinic-api`):
       - Populate `ClinicName` (`settings?.ClinicName`), `ClinicSupportPhone` (`settings?.LetterheadContact`), `ClinicianName` (`appointment.DoctorName` / staff name / `_clinicContext.StaffName`), and `ScheduledAtUtc` (`appointment.ScheduledAt`).
       - Encrypt `{ "patientDisplayName": patientFullName }` into `EncryptedGuestContext` using AES-256-GCM with 256-bit key `SHA256.HashData(UTF8.GetBytes($"{appointment.Id:N}:{dobString}:{otp}"))`. Without both DOB + 6-digit OTP, Portal cannot decrypt `patientDisplayName`, and `StoredGuestInvite` holds ZERO plaintext patient name at rest!
     - In `portal-api` (`GuestTeleconsultInviteIssuedHandler.cs`, `GuestVerificationService.cs`, `PublicGuestTeleconsultEndpoints.cs`):
       - Store `ClinicName`, `ClinicSupportPhone`, `ClinicianName`, `ScheduledAtUtc`, and `EncryptedGuestContext` on `StoredGuestInvite`.
       - On `GET /portal/guest/teleconsult/status`: return `clinicName`, `clinicSupportPhone`, `clinicianName`, and `scheduledAtUtc` (even before login so `GuestJoinPage` displays the real clinic name + schedule immediately instead of `"ClinicEZ Healthcare"`, with fallback facility lookup if null).
       - On `POST /portal/guest/teleconsult/verify` (after DOB + OTP verify): decrypt `EncryptedGuestContext` ephemerally in memory and return `guestDisplayName`, `clinicName`, `clinicSupportPhone`, `clinicianName`, and `scheduledAtUtc` in `GuestTeleconsultVerifyResponse` while keeping `MintLiveKitGuestToken` JWT claims 100% Zero-PHI!
2. **Portal Web (`TeleconsultGuestFlow.tsx`, `GuestJoinPage.tsx`, `join/page.tsx`, `join/[token]/page.tsx`)**:
   - Hydrate `clinicName`, `clinicSupportPhone`, `clinicianName`, `guestDisplayName`, and formatted `scheduledAtUtc` from `/portal/guest/teleconsult/status` + `/portal/guest/teleconsult/verify` (plus LiveKit DataChannel `participant_profile` fallback when clinician connects). Never hardcode `"Guest Patient"`, `"ClinicEZ Healthcare Attending Clinician"`, or `"Today (Immediate Intake)"` when session data exists; remove raw UUID strings (`• ID: ...`) from patient-facing waiting-room subtitles.
   - Eliminate duplicate top header `In-Call Chat` + `Leave` controls during `in_call` in `TeleconsultGuestFlow.tsx` — let `CallStage`'s unified bottom toolbar handle `Chat`, `Participants`, and `End Call`, keeping only a clean top consultation status bar (clinic name, clinician name / status, Privacy indicator) or letting `CallStage` own the full stage cleanly. (Update `guestTeleconsultJoin.test.tsx` / `challenger_m10_portal_adversarial.test.tsx` consistently.)
3. **Participants Roster Deduplication & Real Names (`useCallSession.ts`, `CallStage.tsx` native & web, `TeleconsultWaitingRoomModal.tsx`)**:
   - In `packages/comms-sdk/src/react/hooks/useCallSession.ts`:
     - Set `isLocal: true` on `localSelf` (`lines 91–101` & `218–226`).
     - Sync both `isMicActive` / `isCameraActive` AND `isMicEnabled` / `isCameraEnabled` on mapped participants (`rp.isAudioEnabled`, `rp.isVideoEnabled`), and filter out any remote entry whose identity matches local `participantIdentity`!
     - Never show generic `"Participant"` when `participantName` (real patient name on Clinic side, or real clinician name on Guest side) is known: pass `remoteParticipantDisplayName` / fallback cleanly so `guest:otp-*` maps to the patient's real name in `CallStage` (`TeleconsultWaitingRoomModal.tsx` knows `resolvedPatientName`, and `CallStage` knows `participantName`).
   - In `packages/comms-sdk/src/native-ui/CallStage.tsx` and `packages/comms-sdk/src/web-ui/CallStage.tsx`:
     - Deduplicate remote participants explicitly: exclude any item where `p.isLocal || p.identity === selfIdentity || (selfName && p.name.trim().toLowerCase() === selfName.trim().toLowerCase())` and deduplicate by `identity`.
     - Replace blank or generic `"Participant"` remote names with `participantName` (so Clinic App sees the patient's real name and Guest Portal sees the clinician's real name).
     - Ensure `totalParticipantsCount` equals `1 + deduplicatedRemotes.length` (or `hasRemote ? 2 : 1` when `deduplicatedRemotes.length === 0`) so the `Participants` badge count ALWAYS matches the exact number of rows shown under `IN ROOM`!

---

Please confirm receipt and coordinate these R7.1–R7.4 fixes + M14/M16 verification before completing the Teamwork run. Maintain strict token lint (`lint:tokens`), 17-key `COMMS_ICON_MAP` invariant, host lint (`lint:hosts`), and leave port 8081 Expo untouched without any `git commit`.
