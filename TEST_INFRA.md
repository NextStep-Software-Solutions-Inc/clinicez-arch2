# ClinicEZ Teleconsultation Finalization: E2E Test Infrastructure Specification

**Document Version**: 2.0.0  
**Target Environment**: ClinicEZ Production-Ready Worktree (`finalize_teleconsultation_api`)  
**Scope**: Full-Stack Teleconsultation Finalization (Requirements R1 through R6)  
**Author**: E2E Test Infrastructure Author (`test_writer_m1_1`)  
**Status**: Authoritative Architecture Specification  

---

## 1. Test Philosophy & Quality Principles

### 1.1 Requirement-Driven, Opaque-Box Verification
The ClinicEZ teleconsultation testing infrastructure is designed strictly around **opaque-box, requirement-driven verification**. Tests treat components and services as black boxes, exercising public API endpoints, MediatR commands, WebRTC media adapters, SignalR messages, and React component properties according to the formal contracts established in `ORIGINAL_REQUEST.md`. 

Tests never inspect or rely on private implementation details, unexported variables, or internal class fields. If an implementation changes internally while preserving its behavioral contract, tests must continue to pass without modification.

### 1.2 Multi-Layered Formal Test Design
To ensure rigorous validation across all failure modes, the test suite is structured using four complementary test design methodologies:

1. **Category-Partition Method (CPM)**: Input domains across all commands, DTOs, and component props are decomposed into mutually exclusive equivalence classes and environmental partitions (e.g., Prepaid vs Postpaid billing modes, Entitled vs Unentitled workspaces, Solo vs Multi-participant rooms).
2. **Boundary Value Analysis (BVA)**: Numerical, temporal, and structural boundaries are systematically probed at `min-1`, `exact`, and `max+1` values (e.g., exactly 0 prepaid balance, 5-minute solo warning threshold `300_000ms`, 2-minute auto-leave grace `120_000ms`, 2-hour LiveKit token TTL, 17-key icon map limit, >=44px touch targets).
3. **Pairwise Combinatorial Testing**: Multi-parameter interaction spaces (such as Workspace Plan Tier x Facility Enablement x Modality Selection x Call State) are mapped into orthogonal arrays to ensure all 2-way feature interactions are exercised without combinatorial explosion.
4. **Real-World Clinical Workload Testing**: High-fidelity, multi-step end-to-end user journeys exercise realistic operational paths involving multiple actors (SuperAdmin, Tenant Owner, Clinic Admin, Clinician, Guest Patient) encountering adverse conditions (Wi-Fi dropouts, browser tab closures, credit exhaustion) and recovering cleanly.

### 1.3 Anti-Facade & Test Integrity Rules
- **No Facade Tests**: Tests must assert genuine side-effects: database persistence, transactional outbox messages, LiveKit data channel payloads, DOM node mutations, and HTTP status codes. Tests that assert trivial truths or mock away the logic under test are strictly prohibited.
- **Independent & Isolated**: Every test must set up its own state, use unique IDs/GUIDs, execute in an isolated database or memory context, and cleanly tear down any registered event listeners.
- **Deterministic Clocks**: Temporal thresholds (timeouts, tokens, countdowns) must be verified via controllable time providers (`TimeProvider`, `TestClock`, `jest.useFakeTimers` / `bun` timer mocks) rather than non-deterministic thread sleep operations.

---

## 2. Feature Inventory: Requirements R1 through R6

The teleconsultation capability is partitioned into six core requirements (R1–R6) mapped to 29 discrete features across the backend services and frontend applications:

| # | Requirement | Feature Name | Target Services & Packages | Inputs / Triggers | Expected Outputs & Side Effects | Error Handling & Fallbacks | Tiers |
|---|---|---|---|---|---|---|:---:|
| **F01** | **R1** | Upper-Left Invite Removal | `packages/comms-sdk` (`CallStage.tsx`) | `CallStage` mount | `btn-stage-copy-invite` and `topLeftControls` absent from video canvas | Clean upper-left canvas; no floating link | T1, T2 |
| **F02** | **R1** | Participants Toolbar Toggle | `packages/comms-sdk` (`CallStage.tsx`) | Click `btn-toggle-participants` | Toggles `panel-participants-roster`; updates `badge-participants-count` | Mutually exclusive: closes In-Call Chat drawer | T1, T2, T3 |
| **F03** | **R1** | Relocated Invite Link Row | `packages/comms-sdk` (`CallStage.tsx`) | Click `btn-roster-copy-invite` | Copies `patientLink` to clipboard; displays `"Copied!"` indicator for 2000ms | Clipboard rejection falls back to manual copy text | T1, T2 |
| **F04** | **R1** | Visible & Stable 6-Digit PIN | `packages/comms-sdk`, `apps/clinic-app` | Click `btn-roster-copy-pin` | Displays `text-roster-invite-pin` ("654321"); copies PIN without re-requesting OTP | State cache in modal prevents OTP rotation on copy | T1, T2, T3 |
| **F05** | **R1** | Live Attendees List & Indicators | `packages/comms-sdk` (`CallStage.tsx`) | `participants: CallParticipant[]` | Renders cards for `(You)` and remote guests with mic, camera, screen-share badges | Initials avatar fallback on missing video | T1, T2 |
| **F06** | **R2** | Decoupled Local Media Tracks | `packages/comms-sdk` (`IMediaRoomAdapter`) | Toggle camera / screen | `getLocalCameraTrack()` and `getLocalScreenShareTrack()` return isolated publications | Throws clean error if WebRTC unsupported | T1, T2 |
| **F07** | **R2** | Picker Cancel Defense | `packages/comms-sdk` (`LiveKitMediaAdapter`) | Cancel OS/browser display picker | Detects absence of publication; suppresses `localTrackChanged('screen', true)` | Silent abort without throwing error toast | T1, T2 |
| **F08** | **R2** | Native OS Stop Synchronization | `packages/comms-sdk` (`LiveKitMediaAdapter`) | Click OS floating "Stop sharing" | Intercepts track `'ended'` event; sets `isScreenSharing = false` across UI | Unpublishes track; cleans up listeners | T1, T2, T3 |
| **F09** | **R2** | Main Stage Screen Share Promotion | `packages/comms-sdk`, `apps/clinic-app` | Remote / local screen track published | Promoted to main canvas with `objectFit="contain"`; never cropped by `'cover'` | Falls back to active camera track when stopped | T1, T2, T3 |
| **F10** | **R2** | Sharing Banner & Landscape PiP | `packages/comms-sdk` (`CallStage.tsx`) | `isScreenSharing === true` | Displays `banner-screen-sharing` with "Stop Sharing"; switches PiP to 16/9 | Dismisses banner on track end | T1, T2 |
| **F11** | **R3** | Default OFF Seeded Plans | `packages/shared-dotnet`, `services/portal-api` | Seed initial plans | Plans (`starter`, `pro`, `enterprise`) omit `feature.teleconsultation` | Workspaces start with teleconsultation disabled | T1, T2 |
| **F12** | **R3** | `WorkspaceTeleconsultBilling` Entity | `services/portal-api` | Create / update billing config | Stores `IsEnabled`, `BillingMode` (`Prepaid`/`Postpaid`), `RatePerMinutePhp` (₱5.00) | Validates non-negative rates and budgets | T1, T2, T3 |
| **F13** | **R3** | Entitlement Interop Sync | `services/portal-api`, `services/media-broker` | Save Portal billing settings | Publishes `MediaEntitlementUpdated` (`Party.Portal` -> `Party.Media`) | Rejects out-of-order versions | T1, T2, T3 |
| **F14** | **R3** | Idempotent Usage Settlement | `services/portal-api`, `services/media-broker` | Receive `MediaUsageRecorded` | Deducts prepaid balance or logs overage; stores `TeleconsultUsageRecord` (zero PHI) | Duplicate `CallId` discarded idempotently | T1, T2, T3 |
| **F15** | **R3** | Mid-Call Cutoff Protection | `services/media-broker` | Call exceeds prepaid balance | Consultation runs to completion; overrun minutes billed to overdraft/overage | Never severs ongoing call mid-stream | T1, T2, T3, T4 |
| **F16** | **R3** | Portal & Admin Web Billing UI | `apps/portal-web`, `apps/admin-web` | Tenant admin configures billing | `TeleconsultPaygCard` toggles activation; Admin overrides rates and credits | Validates tokens; zero hardcoded colors | T1, T2 |
| **F17** | **R4** | Facility Teleconsult Settings Flag | `services/clinic-api` | Provision clinic facility | `FacilitySettings.EnableTeleconsultation` defaults to `false` | Schema migration preserves existing settings | T1, T2 |
| **F18** | **R4** | Two-Tier Activation Validation | `services/clinic-api` | Send `UpdateClinicSettingsCommand` | Rejects `EnableTeleconsultation = true` if `!IsWorkspaceTeleconsultEntitled` | Throws `ForbiddenException` (HTTP 403) | T1, T2, T3, T4 |
| **F19** | **R4** | License Revocation Cascade | `services/clinic-api` | Inbound license update | License without teleconsultation sets `EnableTeleconsultation = false` across facilities | In-flight active calls complete safely | T1, T2, T3, T4 |
| **F20** | **R4** | Clinical Operation Gating | `services/clinic-api` | Schedule / join / invite commands | Commands require `IsWorkspaceTeleconsultEntitled && EnableTeleconsultation` | Rejects with `ForbiddenException` / HTTP 403 | T1, T2, T3 |
| **F21** | **R4** | Settings & Modality UI Lock | `apps/clinic-app` | Render settings / schedule visit | `TeleconsultSettingsCard` locked when unentitled; modality selector disabled | Displays guidance directing to Portal | T1, T2 |
| **F22** | **R5** | Accidental Disconnect Resilience | `services/media-broker`, `apps/clinic-app` | Network drop / browser reload | Preserves `MediaCallSession` (`RoomRejoined`); keeps 60-min invite + 6-digit PIN active | Allows seamless rejoin within 2-hr token TTL | T1, T2, T3, T4 |
| **F23** | **R5** | Explicit Physician End Call | `apps/clinic-app`, `services/clinic-api` | Click `btn-confirm-end-call` | Sends LiveKit data message `{ type: "call_ended_by_clinician" }`; enqueues interop | Requires confirmation dialog before firing | T1, T2, T3, T4 |
| **F24** | **R5** | Interop Revocation & Room Ended | `services/clinic-api`, `services/media-broker` | Process `EndTeleconsultCallCommand` | Enqueues `GuestTeleconsultInviteRevoked` and `MediaRoomEnded`; stops billing | Non-blocking LiveKit `DeleteRoom` fallback | T1, T2, T3 |
| **F25** | **R5** | Zero-PHI Preflight Status Endpoint | `services/portal-api`, `apps/portal-web` | `GET /portal/guest/teleconsult/status` | Returns HTTP 410 Gone for ended calls; guest UI displays "Consultation ended" | No DOB/PIN prompt shown on ended calls | T1, T2, T3 |
| **F26** | **R5** | Solo Warning & Auto-Leave | `packages/comms-sdk` (`CallStage.tsx`) | 0 remote participants for 5 min | Shows `banner-solo-participant-warning`; 2-min countdown auto-leaves room | Reset timer if remote joins or Stay clicked | T1, T2, T3, T4 |
| **F27** | **R5** | Abandoned Session Background Cleanup | `services/media-broker` | Background monitor tick | Closes stale `Active` sessions older than 2 hours; records capped billable minutes | Active sessions with heartbeats untouched | T1, T2 |
| **F28** | **R6** | COMMS_ICON_MAP Invariant (17 Keys) | `apps/clinic-app` | Parse icon dictionary | Verifies `COMMS_ICON_MAP` contains exactly 17 keys; uses `renderParticipantsIcon` | Fails if developer adds key to icon map | T1, T2, T3 |
| **F29** | **R6** | Architecture Invariants & Whitelists | All packages and services | Lint scripts & regex scans | Zero hex/rgba colors (`lint:tokens`), zero unapproved hosts (`lint:hosts`), port 8081 preserved | CI build fails on token/host violation | T1, T2, T3 |

---

## 3. Test Architecture & Runner Conventions

```
+----------------------------------------------------------------------------------------------------+
|                                    ClinicEZ E2E Test Runners                                       |
+-------------------------------------------------+--------------------------------------------------+
|               Backend (.NET 10)                 |                 Frontend (Bun)                   |
|   /Users/macuser/.dotnet/dotnet test            |   bun test / tsc --noEmit                        |
+-------------------------------------------------+--------------------------------------------------+
| - services/media-broker/ClinicEz.MediaBroker.Tests | - packages/comms-sdk/tests                       |
|   (Moq 4.20.72 + EF Core InMemory)              |   (Headless DOM Mock + React 19 Hook Harness)    |
| - services/portal-api/ClinicEz.Portal.Tests     | - apps/clinic-app/tests                          |
|   (Moq 4.20.72 + EF Core InMemory + Outbox)     |   (Expo RN Web Mock + Token Guard + Port 8081)   |
| - services/clinic-api/ClinicEz.Clinic.App.Tests | - apps/portal-web/tests                          |
|   (NSubstitute 5.3.0 + EF Core Sqlite/InMemory) |   (Next.js App Router Mock + Direct API Client)  |
| - services/interop-hub/ClinicEz.Interop.Tests   | - apps/admin-web/tests                           |
|   (WebApplicationFactory<Program> + ECDSA P256) |   (Vite React SPA Mock + Plan Vocabulary Assert) |
+-------------------------------------------------+--------------------------------------------------+
```

### 3.1 Backend Runner Conventions (.NET 10)

All backend service tests target `net10.0`, run via xUnit (`xunit 2.9.3`, `xunit.runner.visualstudio 3.1.4`), and utilize `FluentAssertions 8.10.0`. CLI commands must always invoke the explicit path `/Users/macuser/.dotnet/dotnet`.

#### 3.1.1 Mocking Framework Conventions (CRITICAL)
- **Media Broker (`ClinicEz.MediaBroker.Tests`)**: Uses **`Moq` (4.20.72)** with in-memory databases (`new DbContextOptionsBuilder<MediaBrokerDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options`).
- **Portal API (`ClinicEz.Portal.Tests`)**: Uses **`Moq` (4.20.72)**. Interop messages are asserted using `TestSupport.Outbox(...)` and `TestSupport.OutboxPayloads<T>(...)` against the real EF Core transactional outbox.
- **Clinic API (`ClinicEz.Clinic.Application.Tests`)**: Uses **`NSubstitute` (5.3.0)** (`Substitute.For<T>()`). **NEVER use Moq in Clinic API tests** — doing so causes compilation failures.
- **Interop Hub (`ClinicEz.Interop.Tests`)**: Uses **Zero Third-Party Mock Libraries**. Tests spin up a full in-process HTTP host using `WebApplicationFactory<Program>` (`HubApp.StartCloudAsync()`), communicating via real HTTP requests signed with ECDSA P-256 keys (`TestKeys.Sign`).

#### 3.1.2 Clock & Time Provider Conventions
- Use `TestClock : TimeProvider` or `FakeClock : TimeProvider` to advance time deterministically for token expiration and session TTL assertions without sleeping the execution thread.

### 3.2 Frontend Runner Conventions (Bun Test)

All frontend tests run using **Bun Test** (`bun test v1.4.3`) with native TypeScript execution.

#### 3.2.1 React Native & WebRTC Mocking Pattern
- Module mocking via `mock.module('react-native', () => ...)` maps React Native primitives (`View`, `Text`, `TouchableOpacity`, `Modal`, `Animated`) to DOM-like mock elements.
- `LocalPreviewMediaAdapter({ mockMode: true })` and mock `Room` instances simulate LiveKit WebRTC state transitions, track subscriptions, and data channel messages.
- React 19 hooks are tested using `packages/comms-sdk/tests/react/hook-test-harness.ts` (`createHookHarness`, `act`).

#### 3.2.2 Isolated Test Execution Guard
- **Mandatory Isolation**: `apps/clinic-app/tests/comms_issue139_resilience_and_polish.test.ts` must always be run in its own isolated `bun test` invocation because it performs cross-package file system and module inspections.
- App-level test runs should use the `--isolate` flag (`bun test --isolate`) to prevent mock pollution across apps.

#### 3.2.3 Token, Host & Port Guardrails
- **Design Token Compliance**: `bun run lint:tokens` scans modified files for raw hex (`#...`) or `rgba(...)` color literals using AST analysis. Zero violations permitted.
- **Host Whitelist**: `bun run lint:hosts` scans for unapproved external domains or unauthorized network endpoints.
- **Live Preview Preservation**: The active Expo dev server running on port `8081` must **never** be terminated or rebound.

#### 3.2.4 Known Legacy Worktree Refactoring Notes
- **Comms SDK Legacy Test Suite Note**: `packages/comms-sdk/tests/ui/call-stage.test.ts` legacy assertions for `btn-stage-copy-invite` (which assert that the top-left invite button is not null) are scheduled for refactoring to assert `null` in Milestone E2E-M3 / implementation per Requirement R1 and `TC-T1.1.1`.
- **Token Lint Scope Note**: `bun run lint:tokens` is the compliant token guard across apps (`clinic-app`, `patient-app`), passing cleanly with 0 violations. Raw hex colors in `packages/comms-sdk/src/web-ui/OverlayTooltip.tsx` (`#0F172A`, `#FFFFFF`, `#334155`) and `src/native-ui/OverlayTooltip.tsx` (`rgba(15, 23, 42, 0.38)`) will be replaced with semantic tokens from `@clinicez/design-tokens` during Milestone E2E-M3 component polishing.

### 3.3 Test Directory Layout & File Naming Conventions

```
finalize_teleconsultation_api/
├── services/
│   ├── clinic-api/ClinicEz.Clinic.Application.Tests/
│   │   └── Teleconsult_E2E/
│   │       ├── Fixtures/TeleconsultTestHarness.cs
│   │       ├── Tier1_FeatureCoverage/
│   │       │   ├── Tier1_CascadingGovernanceTests.cs
│   │       │   └── Tier1_ExplicitPhysicianEndCallTests.cs
│   │       ├── Tier2_BoundaryAndCornerCases/
│   │       │   ├── Tier2_AccidentalDisconnectPreservationTests.cs
│   │       │   ├── Tier2_CascadingLicenseRevocationTests.cs
│   │       │   └── Tier2_InvitePinReuseTests.cs
│   │       ├── Tier3_CrossFeatureInteractions/
│   │       │   └── Tier3_TeleconsultLifecycleCrossFeatureTests.cs
│   │       └── Tier4_RealWorldClinicalScenarios/
│   │           └── Tier4_ProductionTeleconsultationWorkflowTests.cs
│   ├── media-broker/ClinicEz.MediaBroker.Tests/
│   │   ├── MediaRoomEndedHandlerTests.cs
│   │   ├── AbandonedSessionCleanupTests.cs
│   │   └── PaygMeteringTests.cs
│   ├── portal-api/ClinicEz.Portal.Tests/
│   │   ├── Billing/TeleconsultPaygBillingTests.cs
│   │   ├── Messaging/MediaUsageRecordedHandlerTests.cs
│   │   └── Guest/GuestTeleconsultInviteRevokedHandlerTests.cs
│   └── interop-hub/ClinicEz.Interop.Tests/
│       └── PlatformServiceTests.cs  (MediaRoomEnded routing)
├── packages/
│   └── comms-sdk/tests/
│       ├── ui/
│       │   ├── call-stage-participants-roster.test.ts
│       │   └── call-stage-solo-warning.test.ts
│       └── core/
│           └── media-adapters-screen-share.test.ts
└── apps/
    ├── clinic-app/tests/
    │   ├── comms_issue139_resilience_and_polish.test.ts  (ISOLATED)
    │   ├── challenger_m8_adversarial_clinic.test.ts       (17-icon invariant)
    │   ├── challenger_m9_adversarial_clinic.test.ts       (PIN copy state)
    │   └── e2e/teleconsultFinalizationE2E.test.ts
    ├── portal-web/tests/
    │   ├── teleconsultPaygBilling.test.tsx
    │   └── guestTeleconsultJoin.test.tsx
    └── admin-web/tests/
        └── teleconsultSuperAdminOverrides.test.ts
```

---

## 4. 4-Tier Test Suite Specification

### 4.1 Tier 1: Feature Coverage (Core Functionality & Happy Paths)

Tier 1 contains **36 test cases** (6 per feature across R1–R6), asserting primary behavior and core contracts:

#### Requirement R1: Participants Roster, Relocated Invite Link & Visible 6-Digit PIN
- **TC-T1.1.1: Removal of Upper-Left Copy Invite Button**
  - **Component**: `packages/comms-sdk/src/web-ui/CallStage.tsx`, `native-ui/CallStage.tsx`
  - **Input**: Render `CallStage` with `hideHeader={false}`, `patientLink="https://portal.clinicez.ph/teleconsult/guest?token=xyz"`.
  - **Steps**: Mount component; query DOM for `data-testid="btn-stage-copy-invite"` and `topLeftControls`.
  - **Assertion**: Element `btn-stage-copy-invite` is `null`; container `topLeftControls` is absent from layout.
- **TC-T1.1.2: Bottom Toolbar Users Button & Live Participant Badge**
  - **Component**: `packages/comms-sdk/src/web-ui/CallStage.tsx`
  - **Input**: `participantCount={2}`, `isParticipantsOpen={false}`, `onToggleParticipants={mockFn}`.
  - **Steps**: Inspect floating bottom toolbar; locate `testID="btn-toggle-participants"`; inspect `badge-participants-count`; click button.
  - **Assertion**: Button touch target >= 44x44px; badge text is `"2"`; `mockFn` is called exactly once.
- **TC-T1.1.3: Participants Roster Drawer & Chat Mutual Exclusion**
  - **Component**: `packages/comms-sdk/src/web-ui/CallStage.tsx`
  - **Input**: `isParticipantsOpen={true}`, `isChatOpen={true}`.
  - **Steps**: Render stage with roster open; click `btn-toggle-chat`.
  - **Assertion**: `panel-participants-roster` is visible on right; clicking chat drawer closes roster (`isParticipantsOpen=false`) and opens chat.
- **TC-T1.1.4: Roster Consultation Link Row with Copy Button & Temporary Indicator**
  - **Component**: `packages/comms-sdk/src/web-ui/CallStage.tsx`
  - **Input**: `patientLink="https://portal.clinicez.ph/teleconsult/guest?token=tok-abc"`, `onSharePatientLink={mockShare}`.
  - **Steps**: Open Participants Roster; click `btn-roster-copy-invite`.
  - **Assertion**: `mockShare` is called; button displays `"Copied!"` indicator for 2000ms.
- **TC-T1.1.5: Visible 6-Digit Access PIN and Copy Action**
  - **Component**: `packages/comms-sdk/src/web-ui/CallStage.tsx`
  - **Input**: `patientPin="481920"`, `onCopyPatientPin={mockCopyPin}`.
  - **Steps**: Open Participants Roster; locate `text-roster-invite-pin` and `btn-roster-copy-pin`; click copy PIN.
  - **Assertion**: `text-roster-invite-pin` displays `"481920"`; `mockCopyPin` invoked with `"481920"`.
- **TC-T1.1.6: Active Attendees List with Media Status Indicators**
  - **Component**: `packages/comms-sdk/src/web-ui/CallStage.tsx`
  - **Input**: `participants=[{ id: 'p1', name: 'Dr. Santos', isLocal: true, isAudioEnabled: true, isVideoEnabled: true, isScreenSharing: false }, { id: 'p2', name: 'Maria Cruz', isLocal: false, isAudioEnabled: false, isVideoEnabled: true, isScreenSharing: true }]`.
  - **Steps**: Open Participants Roster; inspect participant items.
  - **Assertion**: Dr. Santos card has `(You)` label and active mic/cam; Maria Cruz card shows mic muted badge and active screen sharing badge.

#### Requirement R2: End-to-End Screen Sharing Reliability
- **TC-T1.2.1: Local Camera and Screen Share Track Decoupling**
  - **Component**: `packages/comms-sdk/src/core/media/LiveKitMediaAdapter.ts`
  - **Input**: Connected room with active camera; call `setScreenShareEnabled(true)`.
  - **Steps**: Execute `adapter.setScreenShareEnabled(true)`; inspect `getLocalCameraTrack()` vs `getLocalScreenShareTrack()`.
  - **Assertion**: `getLocalCameraTrack()` returns video track; `getLocalScreenShareTrack()` returns distinct screen track; no track overwrite occurs.
- **TC-T1.2.2: Screen Share Picker Cancellation Guard**
  - **Component**: `packages/comms-sdk/src/core/media/LiveKitMediaAdapter.ts`
  - **Input**: Browser picker dismissed by user clicking Cancel (no publication created).
  - **Steps**: Call `setScreenShareEnabled(true)` while mocking user cancel in picker.
  - **Assertion**: Adapter verifies `screen_share` publication exists; suppresses `localTrackChanged('screen', true)`; `isScreenSharing` remains `false`.
- **TC-T1.2.3: Native OS / Browser "Stop Sharing" Event Listener**
  - **Component**: `packages/comms-sdk/src/core/media/LiveKitMediaAdapter.ts`
  - **Input**: Active screen share; trigger `'ended'` event on `pub.track.mediaStreamTrack`.
  - **Steps**: Dispatch `'ended'` event directly on track.
  - **Assertion**: Attached `{ once: true }` `'ended'` listener triggers; adapter emits `localTrackChanged('screen', false)`.
- **TC-T1.2.4: Active Screen Share Promotion to Main Stage with Contain**
  - **Component**: `apps/clinic-app/components/teleconsult/TeleconsultWaitingRoomModal.tsx`, `TeleconsultGuestFlow.tsx`
  - **Input**: Remote participant publishes video track with source `'screen_share'`.
  - **Steps**: Render main stage canvas.
  - **Assertion**: Main stage renders screen share track; styling includes `objectFit: 'contain'`; never cropped by `'cover'`.
- **TC-T1.2.5: Sharing Banner & Landscape PiP Switch**
  - **Component**: `packages/comms-sdk/src/web-ui/CallStage.tsx`
  - **Input**: `isScreenSharing={true}`, `onToggleScreenShare={mockStop}`.
  - **Steps**: Mount `CallStage` with active screen sharing.
  - **Assertion**: `data-testid="banner-screen-sharing"` is rendered with "You are sharing your screen" and "Stop Sharing" button; PiP aspect ratio switches to landscape (`16/9`).
- **TC-T1.2.6: Local Screen Share Promotion when Remote Video Absent**
  - **Component**: `apps/clinic-app/components/teleconsult/TeleconsultWaitingRoomModal.tsx`
  - **Input**: Clinician sharing screen in empty room or with audio-only guest.
  - **Steps**: Inspect main stage video element.
  - **Assertion**: Main stage promotes local screen share with `objectFit="contain"`, allowing clinician to verify the presentation.

#### Requirement R3: Opt-In Pay-As-You-Go Metered Licensing & Billing
- **TC-T1.3.1: Seeded Plans Default to Teleconsultation Disabled**
  - **Component**: `packages/shared-dotnet/Licensing/PlanTierDefaults.cs`, `services/portal-api`
  - **Input**: Inspect `PlanTierDefaults.GetFeaturesForTier("standard")` and `"enterprise"`.
  - **Steps**: Query plan feature lists.
  - **Assertion**: `FacilityFeatureKeys.Teleconsultation` is NOT present; `MediaMeteringOptions.AutoProvisionDefaultEntitlement == false`.
- **TC-T1.3.2: `WorkspaceTeleconsultBilling` Entity Default Configuration**
  - **Component**: `services/portal-api/ClinicEz.Portal.Domain/Entities/WorkspaceTeleconsultBilling.cs`
  - **Input**: Provision new tenant workspace.
  - **Steps**: Query initial `WorkspaceTeleconsultBilling` record.
  - **Assertion**: `IsEnabled == false`, `BillingMode == "Postpaid"`, `RatePerMinutePhp == 5.00m`, `PrepaidBalancePhp == 0m`, `AllocatedBudgetPhp == 0m`.
- **TC-T1.3.3: `MediaEntitlementUpdated` Interop Synchronization**
  - **Component**: `services/portal-api`, `services/media-broker`
  - **Input**: Tenant activates PAYG in Portal with Prepaid balance ₱500.00.
  - **Steps**: Save settings in Portal; observe outbox message `InteropTypes.MediaEntitlementUpdated`.
  - **Assertion**: Message published to `Party.Media` with `AllowOverdraft`, `BillingMode="Prepaid"`, `RatePerMinutePhp=5.00m`, `CallMinutesMonthly=100`; broker upserts `TenantMediaEntitlement` with `IsActive=true`.
- **TC-T1.3.4: Idempotent Call Usage Recording and Balance Deduction**
  - **Component**: `services/portal-api/ClinicEz.Portal.Infrastructure/Messaging/Handlers/MediaUsageRecordedHandler.cs`
  - **Input**: Ingest `MediaUsageRecordedPayload(CallId: guid1, DurationMinutes: 10, ...)` for Prepaid tenant with ₱100.00 balance.
  - **Steps**: Process message; inspect database state.
  - **Assertion**: `PrepaidBalancePhp` reduced by ₱50.00 (to ₱50.00); `TeleconsultUsageRecord` persisted with `CallId=guid1`, `DurationMinutes=10`, `TotalCostPhp=50.00`, zero PHI.
- **TC-T1.3.5: Mid-Call Cutoff Protection**
  - **Component**: `services/media-broker/ClinicEz.MediaBroker.Application/Services/MediaMeteringService.cs`
  - **Input**: Consultation running past prepaid balance (e.g. 1 minute balance, 8-minute call).
  - **Steps**: Monitor session during call execution.
  - **Assertion**: Call is NOT terminated at minute 1; runs to completion; 7 minutes logged as overdraft/overage.
- **TC-T1.3.6: `TeleconsultPaygCard` UI Mode Selection & Pricing Projection**
  - **Component**: `apps/portal-web/src/app/[tenant]/dashboard/billing/components/TeleconsultPaygCard.tsx`
  - **Input**: Tenant billing page mount.
  - **Steps**: Toggle activation to ON; select "Prepaid Credits"; enter ₱250.00.
  - **Assertion**: UI displays projected minutes: "50 minutes at ₱5.00/min"; Save button sends valid payload.

#### Requirement R4: Hierarchical Governance: Tenant Workspace to Clinic Settings
- **TC-T1.4.1: `FacilitySettings.EnableTeleconsultation` Defaults to False**
  - **Component**: `services/clinic-api/ClinicEz.Clinic.Domain/Entities/FacilitySettings.cs`
  - **Input**: Provision new clinic facility.
  - **Steps**: Query `FacilitySettings`.
  - **Assertion**: `EnableTeleconsultation == false`.
- **TC-T1.4.2: `UpdateClinicSettingsCommand` Rejection When Workspace Unentitled**
  - **Component**: `services/clinic-api/ClinicEz.Clinic.Application/Features/Settings/Commands/UpdateClinicSettingsCommand.cs`
  - **Input**: Clinic Admin sends `UpdateClinicSettingsCommand(EnableTeleconsultation: true)` while `IsWorkspaceTeleconsultEntitled == false`.
  - **Steps**: Execute command via MediatR.
  - **Assertion**: Throws `ForbiddenException` (HTTP 403); error states teleconsultation must be enabled in Workspace Portal.
- **TC-T1.4.3: `UpdateClinicSettingsCommand` Success When Workspace Entitled**
  - **Component**: `services/clinic-api/ClinicEz.Clinic.Application/Features/Settings/Commands/UpdateClinicSettingsCommand.cs`
  - **Input**: Clinic Admin sends `UpdateClinicSettingsCommand(EnableTeleconsultation: true)` while `IsWorkspaceTeleconsultEntitled == true`.
  - **Steps**: Execute command via MediatR.
  - **Assertion**: Command succeeds; `ClinicSettingsDto.EnableTeleconsultation == true`.
- **TC-T1.4.4: Inbound License Downgrade Cascades EnableTeleconsultation to False**
  - **Component**: `services/clinic-api/ClinicEz.Clinic.Application/Features/Licensing/ClinicInboundHandler.cs`
  - **Input**: Receive `InteropTypes.EntitlementsChanged` without `FacilityFeatureKeys.Teleconsultation`.
  - **Steps**: Process inbound license update.
  - **Assertion**: `FacilitySettings.EnableTeleconsultation` automatically set to `false`.
- **TC-T1.4.5: Gating Appointment Scheduling Behind Effective Enablement**
  - **Component**: `services/clinic-api/ClinicEz.Clinic.Application/Features/Appointments/Commands/CreateAppointmentCommand.cs`
  - **Input**: `CreateAppointmentCommand` with `IsTeleconsult = true` when `EnableTeleconsultation == false`.
  - **Steps**: Send command.
  - **Assertion**: Request rejected with `ForbiddenException` ("Teleconsultation is not enabled for this clinic.").
- **TC-T1.4.6: `TeleconsultSettingsCard` UI Locked State When Unentitled**
  - **Component**: `apps/clinic-app/components/settings/cards/TeleconsultSettingsCard.tsx`
  - **Input**: `isWorkspaceTeleconsultEntitled = false`.
  - **Steps**: Mount component; locate `testID="toggle-clinic-teleconsult-enabled"`.
  - **Assertion**: Toggle is disabled; notice displayed informing user to activate PAYG in Portal.

#### Requirement R5: Clinician Session Termination, Reconnection & Solo Safeguards
- **TC-T1.5.1: Accidental Disconnect Preserves Session and Invite Token**
  - **Component**: `services/media-broker`, `apps/clinic-app`
  - **Input**: Clinician drops network or reloads browser tab without clicking "End Call".
  - **Steps**: Simulate socket disconnect; inspect `MediaCallSession` in broker.
  - **Assertion**: `EndTeleconsultCallCommand` was NOT called; session remains `Active`; clinician and patient can rejoin room seamlessly.
- **TC-T1.5.2: Explicit End Call Requires Confirmation Dialog**
  - **Component**: `apps/clinic-app/components/teleconsult/TeleconsultWaitingRoomModal.tsx`
  - **Input**: Clinician clicks "End Call" on stage or dock bar.
  - **Steps**: Click `btn-end-call`.
  - **Assertion**: `confirm-end-call-dialog` is displayed; call is NOT ended until `btn-confirm-end-call` is clicked.
- **TC-T1.5.3: Physician End Call Broadcasts Data Channel Message to Guest**
  - **Component**: `apps/clinic-app`, `apps/portal-web` (`TeleconsultGuestFlow.tsx`)
  - **Input**: Clinician clicks `btn-confirm-end-call`.
  - **Steps**: Verify LiveKit data channel message payload; inspect guest view.
  - **Assertion**: Message `{ type: "call_ended_by_clinician", endedAtUtc }` published; guest immediately transitions to `stage = "ended"` ("The attending clinician has ended this consultation.").
- **TC-T1.5.4: Physician End Call Enqueues `GuestTeleconsultInviteRevoked` & `MediaRoomEnded`**
  - **Component**: `services/clinic-api/ClinicEz.Clinic.Application/Features/Teleconsult/Commands/EndTeleconsultCallCommand.cs`
  - **Input**: Execute `EndTeleconsultCallCommand`.
  - **Steps**: Inspect enqueued interop outbox messages.
  - **Assertion**: Enqueues `GuestTeleconsultInviteRevoked` to `Party.Portal`; enqueues `MediaRoomEnded` to `Party.Media`; marks appointment `Completed`.
- **TC-T1.5.5: Preflight Zero-PHI Guest Status Check**
  - **Component**: `services/portal-api/ClinicEz.Portal.Api/Endpoints/PublicGuestTeleconsultEndpoints.cs`
  - **Input**: Guest requests `GET /portal/guest/teleconsult/status?token={token}` for ended consultation.
  - **Steps**: Send GET request.
  - **Assertion**: Returns HTTP 410 Gone with `ErrorCode: "GUEST_CONSULTATION_ENDED"`; `TeleconsultGuestFlow` shows ended screen without requesting DOB/PIN.
- **TC-T1.5.6: Solo Participant Warning Banner & Auto-Leave**
  - **Component**: `packages/comms-sdk/src/web-ui/CallStage.tsx`
  - **Input**: User in room with 0 remote participants for 300,000ms.
  - **Steps**: Advance clock 5 minutes; verify banner; advance clock 2 minutes without interaction.
  - **Assertion**: `banner-solo-participant-warning` appears at 5:00; at 7:00, invokes `onSoloLeave()` and disconnects room.

#### Requirement R6: Architecture Guardrails & Codebase Integrity
- **TC-T1.6.1: `COMMS_ICON_MAP` Invariant (Strictly 17 Keys)**
  - **Component**: `apps/clinic-app/components/teleconsult/TeleconsultWaitingRoomModal.tsx`
  - **Input**: Parse `COMMS_ICON_MAP` dictionary.
  - **Steps**: Count keys.
  - **Assertion**: `Object.keys(COMMS_ICON_MAP).length === 17`; matches invariant suite.
- **TC-T1.6.2: `renderParticipantsIcon` Prop Integration**
  - **Component**: `packages/comms-sdk/src/web-ui/CallStage.tsx`, `TeleconsultWaitingRoomModal.tsx`
  - **Input**: Pass `renderParticipantsIcon={() => <Icon name="patients" />}`.
  - **Steps**: Inspect rendered Users button.
  - **Assertion**: Renders patients icon cleanly without adding a `'participants'` entry to `COMMS_ICON_MAP`.
- **TC-T1.6.3: Design Token Strict Lint (`lint:tokens`)**
  - **Component**: `apps/clinic-app`, `apps/portal-web`
  - **Input**: Run `bun run lint:tokens`.
  - **Steps**: Execute token scanner across modified files.
  - **Assertion**: Zero violations; process exit code 0.
- **TC-T1.6.4: Zero PHI Pattern Compliance for Room & Identity IDs**
  - **Component**: `packages/comms-sdk/src/core/media/LiveKitMediaAdapter.ts`
  - **Input**: Validate room `call-e2e4a8b0-8c29-41d4-8d49-14a5ef019283` and identity `staff:usr-123`.
  - **Steps**: Test against regex `^call-[0-9a-fA-F\-]{32,36}$` and `^(staff|patient|guest|participant)(:|-)...`.
  - **Assertion**: Validation passes; no patient MRN, name, or PHI contained in signaling strings.
- **TC-T1.6.5: External Host Whitelist Verification (`lint:hosts`)**
  - **Component**: `apps/clinic-app`, `apps/portal-web`
  - **Input**: Run `bun run lint:hosts`.
  - **Steps**: Execute host scanner.
  - **Assertion**: Zero unapproved external hosts detected; process exit code 0.
- **TC-T1.6.6: Expo Web Dev Server Port 8081 Preservation**
  - **Component**: Local Environment
  - **Input**: Send `curl -I http://localhost:8081`.
  - **Steps**: Inspect response status.
  - **Assertion**: HTTP 200 OK; process remains alive and untouched.

---

### 4.2 Tier 2: Boundary & Corner Cases

Tier 2 contains **40 test cases** exercising limits, negative values, adversarial security boundaries, and edge conditions:

#### Feature 1 Boundary Cases (Participants Roster & PIN)
- **TC-T2.1.1: Rapid Repeated Copy Actions Do Not Rotate PIN**
  - **Trigger**: User clicks `testID="btn-copy-patient-link"` 10 times in 3 seconds in `AppointmentInspectionModal.tsx`.
  - **Assertion**: `clinicService.createTeleconsultGuestInvite` called exactly ONCE; subsequent 9 clicks reuse cached `{ inviteUrl, otp }`; clipboard receives identical PIN each time.
- **TC-T2.1.2: Expired Cached Invite Forces Fresh Generation**
  - **Trigger**: Cached invite in `TeleconsultWaitingRoomModal.tsx` has `expiresAtUtc` in the past (e.g. 61 minutes old); user clicks copy link.
  - **Assertion**: Modal detects expired timestamp, discards cache, and requests a fresh invite token and PIN from backend.
- **TC-T2.1.3: Participants Roster with 25+ Attendees (DOM Virtualization & Height Limits)**
  - **Trigger**: Render `CallStage` with 25 remote participants.
  - **Assertion**: Roster panel container (`data-testid="panel-participants-roster"`) enforces `maxHeight: '100%'` (matching viewport canvas `100vh`) and scroll viewport (`data-testid="panel-participants-roster-scroll"`) has computed style `overflowY: 'auto'`; renders all 26 participant rows (`(You)` plus 25 attendees with testID pattern `participant-card-*`); scrolling does not cause layout displacement or container overflow outside the stage viewport bounds.
- **TC-T2.1.4: Special Characters and Emojis in Display Name (XSS & Entity Defense)**
  - **Trigger**: `participantName = "Dr. José María Ñuñoa 🩺 <script>alert(1)</script>"`.
  - **Assertion**: Initials generator yields `"JÑ"`; participant card element with `data-testid="text-participant-name"` renders exact sanitized string `"Dr. José María Ñuñoa 🩺 <script>alert(1)</script>"`; DOM node `textContent` strictly equals `"Dr. José María Ñuñoa 🩺 <script>alert(1)</script>"`; no `<script>` DOM elements or unescaped HTML injection nodes are inserted into the document tree.
- **TC-T2.1.5: Missing Patient PIN Prop Handling**
  - **Trigger**: `CallStage` rendered with `patientPin = undefined`, `patientLink = "https://..."`.
  - **Assertion**: Consultation link row renders normally; PIN row is omitted cleanly without rendering `"undefined"` or crashing.
- **TC-T2.1.6: Interactive Touch Target Minimum Dimensions**
  - **Trigger**: Inspect computed styles of `btn-toggle-participants`, `btn-roster-copy-invite`, `btn-roster-copy-pin`.
  - **Assertion**: `minHeight >= 44px` and `minWidth >= 44px` for all interactive buttons.
- **TC-T2.1.7: 5-Attempt Guest Lockout (HTTP 423 Locked Rate-Limit)**
  - **Trigger**: Submitting incorrect PIN or DOB 5 consecutive times for the same invite token (`POST /portal/guest/teleconsult/verify`).
  - **Assertion**: The 5th consecutive invalid verification attempt triggers rate-limit lockout in `portal-api`; endpoint responds with HTTP 423 Locked and `{ "errorCode": "GUEST_ACCOUNT_LOCKED", "retryAfterSeconds": 900 }`; subsequent verification attempts (even with valid PIN and DOB) are immediately rejected with HTTP 423 Locked without database lookup until the 15-minute lockout window expires.

#### Feature 2 Boundary Cases (Screen Sharing)
- **TC-T2.2.1: Browser Screen Share Permission Denied (`NotAllowedError`)**
  - **Trigger**: `navigator.mediaDevices.getDisplayMedia` throws `DOMException: NotAllowedError (Permission denied by system)`.
  - **Assertion**: Adapter catches error; `notify.error(...)` displays "Screen sharing permission was denied."; UI remains stable.
- **TC-T2.2.2: User Cancels Screen Selection Dialog**
  - **Trigger**: Browser picker dismissed by user clicking Cancel (aborted promise).
  - **Assertion**: `isScreenSharing` remains `false`; no track published; no error toast shown (cancellation is expected user action).
- **TC-T2.2.3: Screen Share with Extreme Aspect Ratio (32:9 Ultra-Wide)**
  - **Trigger**: Remote participant streams 5120x1440 video track.
  - **Assertion**: Canvas renders with `objectFit="contain"`; full horizontal canvas visible with letterboxing; no clinical UI cropped.
- **TC-T2.2.4: Simultaneous Remote and Local Screen Share Request**
  - **Trigger**: Remote participant is sharing screen; clinician also initiates local screen share.
  - **Assertion**: Main stage renders remote presenter track; clinician's local PiP indicates local sharing with banner.
- **TC-T2.2.5: Rapid Toggling of Screen Share (Spam Click & In-Flight Guard)**
  - **Trigger**: User clicks toggle screen share (`btn-toggle-screen-share`) 5 times within 1000ms.
  - **Assertion**: In-flight promise guard sets `isInFlightScreenSharePromise = true` on the initial click; underlying browser `navigator.mediaDevices.getDisplayMedia` and `adapter.setScreenShareEnabled(true)` are invoked exactly ONCE (call count == 1); the subsequent 4 rapid clicks are ignored/debounced while the initial acquisition promise remains pending; room screen publication count remains strictly 1 with zero duplicate tracks.
- **TC-T2.2.6: Unpublish Event on OS Window Close**
  - **Trigger**: User closes the specific application window being shared.
  - **Assertion**: Underlying track `'ended'` handler dispatches immediately; local screen publication cleanly removed from LiveKit room.

#### Feature 3 Boundary Cases (PAYG Metering & Billing)
- **TC-T2.3.1: Zero Prepaid Balance at Admission**
  - **Trigger**: Tenant has `Prepaid` mode with `PrepaidBalancePhp = 0.00m`.
  - **Assertion**: `EvaluateCallAdmissionAsync` returns `Allowed = false`, `Reason = "Prepaid balance exhausted"`. Admission blocked before room requested.
- **TC-T2.3.2: Zero `CallMinutesMonthly` on Postpaid with `AllowOverdraft = true`**
  - **Trigger**: Tenant has `IsActive = true`, `CallMinutesMonthly = 0`, `AllowOverdraft = true`.
  - **Assertion**: `EvaluateCallAdmissionAsync` returns `Allowed = true`, `IsOverdraft = true`. Pure PAYG calls permitted.
- **TC-T2.3.3: Fractional Minute Rounding Policy on Call End**
  - **Trigger**: Call duration 65 seconds (1 minute 5 seconds).
  - **Assertion**: Billable duration rounds up to 2 whole minutes per commercial billing policy (`Math.Ceiling(seconds / 60.0)`).
- **TC-T2.3.4: Sub-Second Call (0 Seconds Billable)**
  - **Trigger**: Call connects and disconnects within 500ms (0 seconds billable).
  - **Assertion**: `DurationMinutes = 0`; `TotalCostPhp = 0.00m`; zero balance deducted.
- **TC-T2.3.5: Duplicate `MediaUsageRecorded` Delivery by `CallId`**
  - **Trigger**: Receive identical `MediaUsageRecordedPayload` twice for same `CallId`.
  - **Assertion**: Second message detected via unique index on `TeleconsultUsageRecord.CallId`; transaction commits idempotently without double deduction.
- **TC-T2.3.6: Budget Exhaustion in Postpaid with `AllowOverageBeyondAllocation = false`**
  - **Trigger**: Tenant in Postpaid mode reaches `AllocatedBudgetPhp`.
  - **Assertion**: `EntitlementService` revokes teleconsultation for future calls; ongoing in-flight call completes safely.
- **TC-T2.3.7: PAYG Rate and Budget Negative Input Validation**
  - **Trigger**: Admin sends `UpdateTeleconsultBillingCommand` with `RatePerMinutePhp <= 0m` (e.g., `-5.00m` or `0.00m`) or `AllocatedBudgetPhp < 0m` (e.g., `-100.00m`).
  - **Assertion**: Command validator in `portal-api` rejects payload immediately with FluentValidation `ValidationException` (HTTP 400 Bad Request); validation errors explicitly state "Rate per minute must be greater than zero" and "Allocated budget cannot be negative"; database state remains unaltered with no partial updates committed.

#### Feature 4 Boundary Cases (Hierarchical Governance)
- **TC-T2.4.1: Missing LicenseToken on FacilitySettings**
  - **Trigger**: `FacilitySettings.LicenseToken == null`; user tries to enable teleconsultation.
  - **Assertion**: Throws `ForbiddenException`; safely handles null token without `NullReferenceException`.
- **TC-T2.4.2: License Token with Expired Timestamp**
  - **Trigger**: Signed license token has expired `exp` claim.
  - **Assertion**: License verification fails; `IsWorkspaceTeleconsultEntitled` evaluated as `false`; activation rejected.
- **TC-T2.4.3: Teleconsult Appointment Booking When Facility Flag False**
  - **Trigger**: `CreateAppointmentCommand` with `IsTeleconsult = true` when `EnableTeleconsultation == false`.
  - **Assertion**: Command rejected with `ForbiddenException` / `BadRequestException`.
- **TC-T2.4.4: In-Flight Consultation During License Downgrade**
  - **Trigger**: Active consultation ongoing while workspace license downgrade arrives.
  - **Assertion**: New appointments and admissions blocked; currently active consultation allowed to complete and record usage normally.
- **TC-T2.4.5: Multi-Facility Workspace Downgrade Consistency**
  - **Trigger**: Workspace has 5 clinics; license without teleconsultation arrives.
  - **Assertion**: All 5 clinics cascade `EnableTeleconsultation = false` atomically in one transaction.
- **TC-T2.4.6: Modality Dropdown Rendering When Effective Enablement False**
  - **Trigger**: `isEffectiveTeleconsultEnabled = false` in `ScheduleVisitModal.tsx`.
  - **Assertion**: Modality dropdown excludes "Virtual Teleconsultation" or renders it disabled with lock tooltip.

#### Feature 5 Boundary Cases (Session Lifecycle & Safeguards)
- **TC-T2.5.1: Reconnection at 1 Hour 45 Minutes (Under 2-Hour TTL)**
  - **Trigger**: Clinician disconnects and rejoins at 105 minutes using original LiveKit token.
  - **Assertion**: LiveKit room accepts token; user successfully rejoins active consultation.
- **TC-T2.5.2: Reconnection Attempt at 125 Minutes (Token Expired)**
  - **Trigger**: Clinician attempts to reconnect after 2-hour LiveKit token TTL.
  - **Assertion**: Connection rejected with token expired error; app prompts clinician to re-authenticate or re-admit.
- **TC-T2.5.3: Guest Verification Attempt on Revoked Invite**
  - **Trigger**: Guest submits valid DOB + OTP for an invite that was marked revoked (`GUEST_CONSULTATION_ENDED`).
  - **Assertion**: Returns HTTP 410 Gone with `ErrorCode: "GUEST_CONSULTATION_ENDED"`; token is NOT minted.
- **TC-T2.5.4: Solo Warning "Stay in Call" Clicked at 1m58s of Grace Period**
  - **Trigger**: Warning banner active for 118 seconds (2 seconds before auto-leave); user clicks `btn-solo-stay`.
  - **Assertion**: Auto-leave timer cancelled; banner dismissed; 5-minute solo timer restarts from 0.
- **TC-T2.5.5: Solo Warning "Leave Room" Action**
  - **Trigger**: User clicks `btn-solo-leave` on warning banner.
  - **Assertion**: Disconnects cleanly from LiveKit; appointment remains `Scheduled` / `InWaitingRoom`; does not complete or cancel appointment.
- **TC-T2.5.6: Stale Session Cleanup for Sessions Older Than 2 Hours**
  - **Trigger**: Stale session in `Active` state with `StartedAtUtc` 3 hours ago.
  - **Assertion**: `CleanupAbandonedSessionsAsync` marks session `Ended`; bills duration up to room TTL; audits cleanup.
- **TC-T2.5.7: Expired Invite vs Revoked Invite Status Differentiation & Credential Bypass**
  - **Trigger**: Guest requests preflight status (`GET /portal/guest/teleconsult/status?token={token}`) for (a) an invite where `DateTime.UtcNow > ExpiresAtUtc` (60-minute natural expiry), vs (b) an invite revoked by physician End Call (`RevokedAtUtc != null`).
  - **Assertion**: Case (a) responds with HTTP 410 Gone and `{ "errorCode": "GUEST_INVITE_EXPIRED" }`; Case (b) responds with HTTP 410 Gone and `{ "errorCode": "GUEST_CONSULTATION_ENDED" }`. In both cases, frontend `TeleconsultGuestFlow` immediately renders terminal guidance ("This invite link has expired" vs "The attending clinician has ended this consultation") and completely bypasses credential prompts (DOB / PIN inputs are never rendered).
- **TC-T2.5.8: Background Tab Wall-Clock Time Delta Calculation for Solo Warning**
  - **Trigger**: Clinician is alone in call stage and switches browser tab (or minimizes app), causing background tab throttling where `setInterval` is throttled to >=1000ms.
  - **Assertion**: Solo warning timer does not rely on accumulating 1000ms timer ticks; instead, on every tick it calculates elapsed wall-clock time via `Date.now() - sessionStartTime`; when `elapsedMs >= 300_000`, `banner-solo-participant-warning` displays immediately upon tab refocus, preventing timer drift where a 5-minute countdown could otherwise stretch to 30+ minutes in backgrounded tabs.

#### Feature 6 Boundary Cases (Architecture Guardrails)
- **TC-T2.6.1: Exactly 17 Keys Asserted Against `COMMS_ICON_MAP`**
  - **Trigger**: Check union count of `CommsCallIconName` and keys of `COMMS_ICON_MAP`.
  - **Assertion**: Exactly 17 keys: `mic`, `micOff`, `video`, `videoOff`, `cameraOff`, `screenShare`, `screenShareOff`, `switchCamera`, `chat`, `recordDot`, `phoneOff`, `shieldCheck`, `lock`, `dock`, `pip`, `rotate`, `share`.
- **TC-T2.6.2: Missing Theme Colors Fallback Gracefully**
  - **Trigger**: `resolveWebTheme(undefined, undefined)`.
  - **Assertion**: Returns full default theme object without throwing undefined property exceptions.
- **TC-T2.6.3: Malformed LiveKit Room Name Rejected**
  - **Trigger**: `connect({ roomName: "patient-john-doe-room", ... })`.
  - **Assertion**: Throws error indicating room name violates zero-PHI pattern `^call-[0-9a-fA-F\-]{32,36}$`.
- **TC-T2.6.4: Malformed Participant Identity Pattern Rejected**
  - **Trigger**: `connect({ participantIdentity: "doctor@clinic.com", ... })`.
  - **Assertion**: Throws error indicating identity violates zero-PHI pattern `^(staff|patient|guest|participant)(:|-)...`.
- **TC-T2.6.5: Plain Language Copy Validation**
  - **Trigger**: Inspect rendered strings in waiting room and call stage.
  - **Assertion**: Contains "Virtual Waiting Room", "Preview Only"; does NOT contain "Teleconsultation Staging Room" or "Local Preview".
- **TC-T2.6.6: Isolated Test Runner Execution for Issue #139**
  - **Trigger**: Execute `apps/clinic-app/tests/comms_issue139_resilience_and_polish.test.ts`.
  - **Assertion**: Executes in dedicated isolated runner process without interference from shared globals.

---

### 4.3 Tier 3: Cross-Feature Combinations (Pairwise & Integration Flows)

Tier 3 exercises asynchronous, multi-service interactions between feature pairs:

- **TC-T3.1: Commercial Enablement Cascade & End-to-End Consultation (R3 + R4 + R1 + R5)**
  - **Preconditions**: Fresh workspace on Standard plan; teleconsultation disabled by default.
  - **Execution Flow**:
    1. Tenant Owner logs into `portal-web`, opens `TeleconsultPaygCard`, enables PAYG, selects `Prepaid`, tops up ₱500.00 (100 mins at ₱5.00/min).
    2. `portal-api` stages `MediaEntitlementUpdated` (`Party.Portal` -> `Party.Media`) and re-mints facility license with `FacilityFeatureKeys.Teleconsultation`.
    3. Clinic Administrator opens `TeleconsultSettingsCard`, verifies toggle is unlocked, enables teleconsultation (`EnableTeleconsultation = true`).
    4. Staff schedules a Virtual Teleconsultation in `Appointments.screen.tsx`.
    5. Clinician admits patient, enters call stage; clicks Users button (`btn-toggle-participants`) to open Participants Roster.
    6. Clinician copies visible 6-digit access PIN and consultation link without PIN rotating.
    7. Guest patient opens link in browser, verifies DOB + PIN, joins call.
    8. Clinician clicks "End Call", confirms in dialog.
  - **Verification**:
    - Portal billing reflects active balance; clinic settings enabled teleconsultation.
    - Guest successfully connected using un-rotated 6-digit PIN.
    - Guest view transitions immediately to "The attending clinician has ended this consultation."
    - `portal-api` marks guest invite as revoked (`GUEST_CONSULTATION_ENDED`).
    - `media-broker` records call duration and deducts prepaid balance cleanly.

- **TC-T3.2: Screen Sharing with Roster Navigation & Native OS Disconnect (R2 + R1 + R6)**
  - **Preconditions**: Active two-party teleconsultation in Clinic Workstation.
  - **Execution Flow**:
    1. Clinician clicks "Share Screen" in floating media toolbar; selects browser window.
    2. `banner-screen-sharing` appears and local PiP switches to landscape (`16/9`).
    3. Clinician clicks `btn-toggle-participants` to open Participants Roster.
    4. Main stage continues rendering active presentation with `objectFit="contain"`.
    5. Clinician clicks native browser/OS floating "Stop sharing" pill.
  - **Verification**:
    - Opening roster does not disrupt ongoing screen share stream.
    - Native OS stop event intercepted via `'ended'` listener; `isScreenSharing` immediately flips to `false`.
    - Main stage reverts cleanly to camera view.
    - Zero design token violations throughout transitions.

- **TC-T3.3: Solo Presence Countdown Reset upon Remote Participant Join (R5 + R1)**
  - **Preconditions**: Clinician joins call 10 minutes prior to scheduled start.
  - **Execution Flow**:
    1. Clinician enters empty room with 0 remote attendees; badge displays `1` (`(You)`).
    2. At 5:00, `banner-solo-participant-warning` appears with 2-minute countdown.
    3. At 1 minute into grace period (countdown displaying ~01:00 remaining), patient enters the room.
  - **Verification**:
    - Remote participant join triggers immediate dismissal of `banner-solo-participant-warning`.
    - Auto-leave timer cancelled; participant count badge updates to `2`.
    - When patient leaves later, solo 5-minute timer starts fresh from 0.

- **TC-T3.4: Prepaid Balance Depletion During Consultation with Cutoff Protection (R3 + R5)**
  - **Preconditions**: Tenant has Prepaid balance of ₱25.00 (exactly 5 minutes at ₱5.00/min).
  - **Execution Flow**:
    1. Clinician admits patient; call commences.
    2. Consultation runs for 12 continuous minutes (7 minutes beyond prepaid balance).
    3. Clinician and patient conduct examination without interruption.
    4. Clinician explicitly ends call at minute 12.
  - **Verification**:
    - Call is NOT interrupted or severed when balance reaches 0 at minute 5.
    - `media-broker` records 12 billable minutes upon call completion.
    - `MediaUsageRecorded` handler deducts ₱25.00 from prepaid balance (balance becomes ₱0.00).
    - Remaining 7 minutes (₱35.00) are recorded in `CurrentPeriodOveragePhp`.
    - `portal-api` re-stages `MediaEntitlementUpdated` with `IsActive = false`, preventing new calls until top-up.

- **TC-T3.5: License Revocation Cascade Mid-Operation (R4 + R3 + R1)**
  - **Preconditions**: Clinic has teleconsultation active with scheduled appointments.
  - **Execution Flow**:
    1. Tenant workspace subscription downgrades or owner deactivates PAYG in Portal.
    2. New license minted without `FacilityFeatureKeys.Teleconsultation`.
    3. `ClinicInboundHandler` processes update and sets `EnableTeleconsultation = false`.
    4. Clinician attempts to admit patient from waiting room.
  - **Verification**:
    - `TeleconsultSettingsCard` shows locked state with workspace warning notice.
    - Modality selector in scheduling modal disables teleconsultation.
    - Attempting to admit patient or create guest invite returns HTTP 403 `ForbiddenException`.
    - Historical consultation records and past notes remain intact.

- **TC-T3.6: Draggable Ultra-Thin Dock Mode with Active Screen Share & PiP (R1 + R2 + R5)**
  - **Preconditions**: Active call in Clinic Workstation.
  - **Execution Flow**:
    1. Clinician clicks dock button (`btn-dock-call`).
    2. Workstation transitions to ultra-thin draggable dock bar (`~36-38px` height).
    3. Remote participant shares screen; clinician opens Picture-in-Picture (`btn-toggle-pip`).
    4. Clinician clicks docked end call button (`btn-docked-end-call`).
  - **Verification**:
    - Dock bar displays drag handle, patient label, audio indicator, and controls with zero inline video box.
    - Persistent hidden video element keeps native PiP active across dock transitions.
    - Clicking `btn-docked-end-call` opens `confirm-end-call-dialog` with `zIndex: 2000001` floating above all windows.
    - Call cannot be ended without confirming in dialog.

---

### 4.4 Tier 4: Real-World Workloads (End-to-End Multi-Step Journeys)

Tier 4 exercises complete production workflows across clinical and administrative personas:

#### Workload 1: Patient & Clinician Consultation Lifecycle with Intermittent Disconnect
- **Actors**: Dr. Santos (Clinician on Workstation), Juan Dela Cruz (Patient on Guest Browser Portal)
- **Journey**:
  1. **Scheduling**: Dr. Santos schedules virtual teleconsultation for Juan at 10:00 AM.
  2. **Invite Dispatch**: Dr. Santos inspects appointment in `AppointmentInspectionModal`, clicks `btn-copy-patient-link`. Cached invite generates secure token, 6-digit PIN (`384912`), and DOB hint.
  3. **Waiting Room Intake**: Dr. Santos admits Juan into virtual waiting room; Dr. Santos joins active call stage.
  4. **Guest Portal Join**: Juan receives link, opens in Chrome on mobile; enters DOB and PIN `384912`. `portal-api` verifies credentials and issues LiveKit JWT token.
  5. **In-Call Collaboration**: Juan connects to room; Dr. Santos sees attendee in Participants Roster (`2` on badge). Dr. Santos toggles screen sharing to present lab blood test results (`objectFit="contain"`).
  6. **Intermittent Disconnect**: At minute 14, Dr. Santos experiences a Wi-Fi dropout for 30 seconds.
     - LiveKit adapter enters reconnecting state (`banner-network-quality`).
     - Juan sees "Attending Clinician connection interrupted — reconnecting...".
     - Token and session remain completely active; no termination command is sent.
  7. **Reconnection & Resumption**: Wi-Fi reconnects; video stream recovers automatically. Dr. Santos stops screen sharing via banner button.
  8. **Consultation Conclusion**: Dr. Santos clicks "End Call", confirms in dialog.
     - Data message `{ type: "call_ended_by_clinician" }` instantly moves Juan's portal to "Consultation Concluded".
     - Guest invite revoked; media room ended; billing recorded.
- **Verification Assertions**: Zero data loss; un-rotated PIN allowed frictionless join; drop did not trigger premature billing cutoff; clean conclusion.

#### Workload 2: Administrative Governance, Prepaid Depletion & Billing Overage Journey
- **Actors**: Platform SuperAdmin, Tenant Admin (St. Jude Medical Group), Clinic Admin (Makati Branch)
- **Journey**:
  1. **Platform Baseline Setup**: SuperAdmin in `admin-web` configures global teleconsult rate at `₱5.00/min`.
  2. **Tenant Funding**: Tenant Admin opens Portal Billing, enables PAYG, selects `Prepaid`, purchases ₱250.00 credits (50 mins).
  3. **Clinic Enablement**: Makati Clinic Admin opens Clinic Settings, verifies entitlement unlocked, enables teleconsultation for the branch.
  4. **Extended Consultation**: Clinician holds a 60-minute psychiatric teleconsultation (10 minutes beyond prepaid balance).
  5. **Cutoff Protection & Settlement**: Mid-call cutoff protection keeps call live past minute 50; consultation completes at minute 60.
  6. **Usage Accounting**: `media-broker` posts 60 minutes. `MediaUsageRecordedHandler` deducts ₱250.00 (depleting balance to ₱0.00) and accrues ₱50.00 in `CurrentPeriodOveragePhp`.
  7. **Lockout & Top-Up**: Portal disables teleconsultation for subsequent new calls. Tenant Admin tops up ₱500.00; service instantly restored.
- **Verification Assertions**: Strict financial governance; patient care never compromised mid-stream; billing ledger 100% accurate.

#### Workload 3: Unauthorized Activation & Downgrade Cascade Journey
- **Actors**: Clinic Administrator, Malicious / Misconfigured Client, Workspace Owner
- **Journey**:
  1. **Unauthorized Attempt**: Clinic Admin attempts to send `UpdateClinicSettingsCommand` setting `EnableTeleconsultation = true` while workspace is on standard Community tier without PAYG.
  2. **Immediate Rejection**: Server rejects command with `ForbiddenException`; UI keeps toggle disabled with guidance banner.
  3. **Legitimate Upgrade**: Workspace Owner activates PAYG in Portal; license minted with `FacilityFeatureKeys.Teleconsultation`.
  4. **Successful Activation**: Clinic Admin toggles teleconsultation ON; multiple appointments scheduled.
  5. **Workspace Revocation**: Workspace Owner cancels teleconsultation add-on in Portal.
  6. **Automated Cascade**: Inbound license update removes feature; `FacilitySettings.EnableTeleconsultation` immediately reset to `false`.
  7. **Workstation Enforcement**: Scheduling teleconsultations is blocked; virtual waiting room admission rejected.
- **Verification Assertions**: Impossible to bypass tier-1 workspace license; downgrade cleanly cascades to facility settings.

#### Workload 4: Solo Waiting Room Timeout & Resource Protection Journey
- **Actors**: Clinician Dr. Cruz, Automated Resource Sentinel
- **Journey**:
  1. **Early Admission**: Dr. Cruz joins teleconsultation room 15 minutes before patient appointment.
  2. **Solo Presence**: Dr. Cruz sits in room alone for 5 continuous minutes (0 remote participants).
  3. **Warning Trigger**: At 5:00, `banner-solo-participant-warning` appears: *"You are the only participant in this consultation — leaving in 02:00 to preserve resources"*.
  4. **Active Extension**: Dr. Cruz clicks "Stay in Call" (`btn-solo-stay`); warning disappears; 5-minute timer resets.
  5. **Subsequent Inaction**: Dr. Cruz is called away from workstation; room remains solo for another 5 minutes.
  6. **Auto-Leave Grace Countdown**: At 10:00 total, warning reappears with 2-minute countdown.
  7. **Automated Termination**: Countdown reaches 0:00 without response. `CallStage` disconnects LiveKit session cleanly; clinician returned to waiting room; media broker records duration.
- **Verification Assertions**: Cloud SFU compute and metered billing minutes protected against forgotten browser tabs; appointment remains schedulable.

---

## 5. Coverage Thresholds & Execution CLI Commands

### 5.1 Coverage Thresholds & Quality Gates

| Metric | Target Gate | Verification Tool | Invalidation Criteria |
|---|:---:|---|---|
| **Tier 1 Feature Coverage** | 100% Pass (36/36) | xUnit / Bun Test | Any failing test |
| **Tier 2 Boundary Cases** | 100% Pass (40/40) | xUnit / Bun Test | Any failing test |
| **Tier 3 Cross-Feature Flows** | 100% Pass (6/6) | xUnit / Bun Test | Any failing test |
| **Tier 4 Real-World Journeys** | 100% Pass (4/4) | xUnit / Bun Test | Any failing test |
| **`COMMS_ICON_MAP` Keys** | Exactly 17 Keys | `challenger_m8` | `keys.length !== 17` |
| **Design Token Violations** | 0 Violations | `lint:tokens` | Any raw `#...` or `rgba(...)` in new code |
| **External Hosts** | 0 Violations | `lint:hosts` | Any unwhitelisted external domain |
| **Expo Dev Server (8081)** | HTTP 200 OK | `curl -I localhost:8081` | Connection refused / process terminated |

> **Operational Notes on Legacy Assertions and Token Lint Scope**:
> - **Comms SDK Legacy Test Suite Note**: `packages/comms-sdk/tests/ui/call-stage.test.ts` legacy assertions for `btn-stage-copy-invite` (expecting the top-left invite button to be non-null) are scheduled for refactoring to assert `null` in Milestone E2E-M3 / implementation per Requirement R1 / TC-T1.1.1.
> - **Token Lint Scope Note**: `bun run lint:tokens` is the compliant token guard across apps (`clinic-app`, `patient-app`), passing cleanly with 0 violations. Raw hex colors in `packages/comms-sdk/src/web-ui/OverlayTooltip.tsx` (`#0F172A`, `#FFFFFF`, `#334155`) and `src/native-ui/OverlayTooltip.tsx` (`rgba(15, 23, 42, 0.38)`) will be replaced with semantic tokens from `@clinicez/design-tokens` in Milestone E2E-M3.

### 5.2 Complete Execution CLI Commands

#### 5.2.1 Individual Backend .NET Test Suites

```bash
# 1. Media Broker Tests
/Users/macuser/.dotnet/dotnet test services/media-broker/ClinicEz.MediaBroker.Tests/ClinicEz.MediaBroker.Tests.csproj

# 2. Portal API Tests
/Users/macuser/.dotnet/dotnet test services/portal-api/ClinicEz.Portal.Tests/ClinicEz.Portal.Tests.csproj

# 3. Clinic API Teleconsultation & Governance Tests
/Users/macuser/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~Teleconsult|FullyQualifiedName~License|FullyQualifiedName~Entitlements"

# 4. Interop Hub Platform Routing Tests
/Users/macuser/.dotnet/dotnet test services/interop-hub/ClinicEz.Interop.Tests/ClinicEz.Interop.Tests.csproj

# 5. Patient API Teleconsult Event Tests
/Users/macuser/.dotnet/dotnet test services/patient-api/ClinicEz.Patient.Application.Tests/ClinicEz.Patient.Application.Tests.csproj --filter "FullyQualifiedName~CallStateChanged"
```

#### 5.2.2 Consolidated Backend Verification Command

```bash
/Users/macuser/.dotnet/dotnet test services/media-broker/ClinicEz.MediaBroker.Tests/ClinicEz.MediaBroker.Tests.csproj && \
/Users/macuser/.dotnet/dotnet test services/portal-api/ClinicEz.Portal.Tests/ClinicEz.Portal.Tests.csproj && \
/Users/macuser/.dotnet/dotnet test services/interop-hub/ClinicEz.Interop.Tests/ClinicEz.Interop.Tests.csproj && \
/Users/macuser/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~Teleconsult|FullyQualifiedName~License|FullyQualifiedName~Entitlements"
```

#### 5.2.3 Individual Frontend Bun Test Suites

```bash
# 1. Comms SDK UI & Media Adapter Suites
# Note: call-stage.test.ts legacy assertions for btn-stage-copy-invite are scheduled for refactoring to assert null in Milestone E2E-M3 per Requirement R1 / TC-T1.1.1
cd packages/comms-sdk && bun test tests && bun run typecheck

# 2. Clinic App Core Teleconsultation & Invariant Suites
cd apps/clinic-app && bun test tests/commsBrandTheming.test.ts \
  tests/challenger_m6_adversarial_clinic.test.ts \
  tests/challenger_m8_adversarial_clinic.test.ts \
  tests/challenger_m9_adversarial_clinic.test.ts \
  tests/teleconsultWorkflow.test.ts

# 3. Clinic App Isolated Issue #139 Suite (MUST RUN IN ISOLATED INVOCATION)
cd apps/clinic-app && bun test tests/comms_issue139_resilience_and_polish.test.ts

# 4. Portal Web Teleconsultation & Billing Suites
cd apps/portal-web && bun test tests/guestTeleconsultJoin.test.tsx \
  tests/guestTeleconsultAdversarial.test.tsx \
  tests/planAndAllocationMetrics.test.ts \
  tests/tenantBillingAndReceipts.test.ts

# 5. Admin Web Plan & Entitlement Governance Suites
cd apps/admin-web && bun test tests/adminPlansAndEntitlements.test.ts \
  tests/challenger_m3_plan_entitlements.test.ts
```

#### 5.2.4 Static Linting & Typecheck Verification

```bash
# Frontend Typecheck Across Packages
bun run typecheck:comms
bun run typecheck:clinic
bun run typecheck:portal
bun run typecheck:admin

# Token & External Host Audits
# Note: bun run lint:tokens passes across apps (0 violations); lint:comms raw hex literals in OverlayTooltip.tsx are scheduled for replacement with @clinicez/design-tokens in Milestone E2E-M3
bun run lint:tokens
bun run lint:clinic
bun run lint:comms
```

#### 5.2.5 Full-Stack Teleconsultation Verification One-Liner

```bash
/Users/macuser/.dotnet/dotnet test services/media-broker/ClinicEz.MediaBroker.Tests/ClinicEz.MediaBroker.Tests.csproj && \
/Users/macuser/.dotnet/dotnet test services/portal-api/ClinicEz.Portal.Tests/ClinicEz.Portal.Tests.csproj && \
/Users/macuser/.dotnet/dotnet test services/interop-hub/ClinicEz.Interop.Tests/ClinicEz.Interop.Tests.csproj && \
/Users/macuser/.dotnet/dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~Teleconsult|FullyQualifiedName~License|FullyQualifiedName~Entitlements" && \
cd packages/comms-sdk && bun test tests && bun run typecheck && \
cd ../../apps/clinic-app && bun test tests/commsBrandTheming.test.ts tests/challenger_m6_adversarial_clinic.test.ts tests/challenger_m8_adversarial_clinic.test.ts tests/challenger_m9_adversarial_clinic.test.ts tests/teleconsultWorkflow.test.ts && bun test tests/comms_issue139_resilience_and_polish.test.ts && bun run typecheck && bun run lint:tokens && bun run lint:hosts && \
cd ../portal-web && bun test tests/guestTeleconsultJoin.test.tsx tests/planAndAllocationMetrics.test.ts tests/tenantBillingAndReceipts.test.ts && bunx tsc --noEmit && \
cd ../admin-web && bun test tests/adminPlansAndEntitlements.test.ts tests/challenger_m3_plan_entitlements.test.ts && bunx tsc --noEmit
```
