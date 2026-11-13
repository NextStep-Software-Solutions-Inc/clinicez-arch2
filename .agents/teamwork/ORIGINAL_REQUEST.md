# Original User Request

## Initial Request — 2026-11-12T23:12:21Z

Finalize the teleconsultation feature across the clinic facility backend (services/clinic-api), communications SDK (packages/comms-sdk), and workstation frontend (apps/clinic-app) according to the approved architecture and strict repository guardrails.

Working directory: /Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/finalize_teleconsultation_api
Integrity mode: development

Reference: /Users/macuser/.gemini/antigravity/brain/9542d721-8b8b-46ea-9635-c34ef9a2bc0a/implementation_plan.md

## Requirements

### R1. Shared Interop Contracts & Facility Teleconsult Settings
- In `packages/shared-dotnet/Common/AppointmentBookedEvent.cs`, add optional `public string? AppointmentType { get; init; }`.
- In `services/clinic-api`, expose and validate `TeleconsultRecordingPolicy` (`Disabled` | `WorkspaceVaultOnly` | `Both`), `TeleconsultRecordingRetentionDays` (`>= 0`, `0` = indefinite), `TeleconsultRecordingConsentRequired` (`bool`), `TeleconsultPaymentPolicy` (`Prepaid` | `Postpaid` | `Exempt`), and `TeleconsultDefaultFee` (`decimal? >= 0`) across `ClinicSettingsDto.cs`, `GetClinicSettingsQuery.cs`, and `UpdateClinicSettingsCommand.cs`.

### R2. Appointment & Payment Policy Management
- In `services/clinic-api` (`CreateAppointmentCommand.cs`, `GetAppointmentsQuery.cs`, `AppointmentBookedHandler.cs`):
  - Accept optional `AppointmentType` and `PaymentPolicy` (inferring `Teleconsult` if `ServiceType` is `"Teleconsult"` or `"Teleconsultation"`).
  - For teleconsult appointments: assign `CallId = Guid.NewGuid()`, resolve `PaymentPolicy` from request or facility settings, set `PaymentStatus = PaymentPolicy == Exempt ? Exempt : Pending`, and for `Prepaid` appointments create a linked `Invoice` with `AppointmentId = appointment.Id` and enqueue `InteropTypes.BillingInvoiceRequested` if cashier mode is `CashierCounter`.
  - Extend `AppointmentDto` with `AppointmentType`, `IsTeleconsult`, `PaymentPolicy`, `PaymentStatus`, `InvoiceId`, `PaidAmount`, `CallId`, `AdmittedAtUtc`, `IsEmergencyOverride`, and `EmergencyOverrideReasonCode`.
- In `services/clinic-api/RecordPaymentCommand.cs`: when linked invoice is marked `Paid`, update teleconsult `Appointment.PaymentStatus = Paid`, set payment receipt metadata, and enqueue `InteropTypes.CommsCallPaymentCleared`.
- In `GetTeleconsultStatusQuery.cs` and `AdmitTeleconsultPatientCommand.cs`:
  - Surface `HasActiveYakapEnlistment` as an informational badge without automatic policy mutation.
  - Relax unpaid `Prepaid` admission override: allow staff with `ConsultationsWrite` or `ConsultationsSign` to bypass with a plain reason note (`ReasonNote >= 5` characters), defaulting `ReasonCode` to `"STAFF-OVERRIDE"`, write WORM `AuditEntry`, and emit `CommsCallPaymentCleared`.
- Add `UpdateTeleconsultPaymentPolicyCommand.cs` (`PUT /api/v1/teleconsult/appointments/{appointmentId:guid}/payment-policy`) to let clinic staff switch payment policy (`Prepaid`, `Postpaid`, `Exempt`) anytime.

### R3. Media Signaling & Vault Recording Encryption
- Add `JoinTeleconsultCallCommand.cs` (`POST /api/v1/teleconsult/appointments/{appointmentId:guid}/join`) requesting zero-PHI tokens (`call-{callId:N}` and `staff:{id}` / `patient:{id}`) from `Party.Media` via Interop Hub with 10s timeout and graceful fallback, enqueue `InteropTypes.CommsCallStateChanged`, and return `TeleconsultCallJoinDto`.
- Add `EndTeleconsultCallCommand.cs` (`POST /api/v1/teleconsult/appointments/{appointmentId:guid}/end`) enqueuing `CommsCallStateChanged` (`Status: "Ended"`), writing WORM audit log, and auto-finalizing active recording sessions.
- In `TeleconsultRecordingsController.cs` and recording handlers: enforce CMK AES-256-GCM encryption at rest on segment uploads with `{storageKey}.key` wrapped DEK sidecars, ticketed on-the-fly decryption streaming with 15-minute HMAC tickets, sidecar cleanup in `RecordingRetentionSweeper`, and consultation linkage.
- Register interop handlers (`InteropTypes.MediaRoomResponded`, `InteropTypes.CommsRecordingConsentLogged`) in `DependencyInjection.cs`.

### R4. Workspace Communications & Media SDK
- In `packages/comms-sdk/package.json`, add `"livekit-client": "^2.24.0"`.
- Implement `IMediaRoomAdapter.ts`, `LiveKitMediaAdapter.ts`, `LocalPreviewMediaAdapter.ts`, `SegmentRecorder.ts`, and export them from SDK core.
- Upgrade `useCallSession.ts` to support backend and media callbacks and SignalR `CommsContext` event subscriptions while preserving zero-arg in-memory fallback for existing tests.
- Update `CallWaitingRoom.tsx` (`native-ui` and `web-ui`) to include staff payment policy selector, informational YAKAP badge, and plain-note override.
- Implement shared `CallStage.tsx` (`native-ui` and `web-ui`) with video surfaces, media controls (mic, camera, screen share, chat), persistent recording indicator with single-party stop, `renderWorkstationAction` slot, and end call control.

### R5. Clinic Workstation App Integration
- Extend `apps/clinic-app/src/services/clinicService.ts` with teleconsult DTOs and API methods (admission, policy switch, call join/end, recording consent/upload/finalize, playback ticket, medico-legal hold).
- Update `ClinicCommsContext.tsx` and `TeleconsultWaitingRoomModal.tsx` to integrate with `@clinicez/comms-sdk` (`useCallSession`, `CallWaitingRoom`, `CallStage`) and provide workstation consultation chart docking.
- Update `ScheduleVisitModal.tsx` (In-Person vs Teleconsult toggle, payment policy selector) and `AppointmentInspectionModal.tsx` (teleconsult badges, inline policy switch, waiting room launcher).
- Add `TeleconsultSettingsCard.tsx` under `GeneralSettingsTab.tsx`.
- Add `ClinicRecordingPlayerModal.tsx` under `EncountersTimelineTab.tsx` with 15-minute ticketed playback and admin medico-legal hold toggle.

### R6. Architectural & Repository Guardrails
- Zero PostgreSQL schema migrations.
- Zero external message brokers: all cross-service communication must strictly use ClinicEZ Interop Hub (`IInteropPublisher` / `IInteropRequestClient`). Zero direct cross-service HTTP.
- Zero-PHI LiveKit room and participant identifiers (`^call-[0-9a-fA-F\-]{32,36}$` and `^(staff|patient|guest|participant)(:|-)[0-9a-zA-Z\-_]{1,64}$`).
- Strict design token enforcement (`bun scripts/check-tokens.mjs`): zero hex/rgb color literals, zero numeric font sizes or border radii, zero emojis, minimum 44px touch targets.
- Strict host guard enforcement (`bun scripts/check-no-external-hosts.mjs`): zero hardcoded URLs, localhost, or IP addresses in source code.

## Verification Resources
- `services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj`
- `packages/comms-sdk/` test suite and type checking
- `apps/clinic-app/` test suite, type checking, token linter, and host linter

## Acceptance Criteria

### Backend Verification
- [ ] `dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj` executes and passes with zero test failures.
- [ ] Automated tests cover teleconsult payment gating, policy updates, plain-note admission override, zero-PHI naming validation, and AES-256-GCM recording encryption with `.key` sidecar management.

### Communications SDK Verification
- [ ] `cd packages/comms-sdk && bun run typecheck` completes with zero TypeScript diagnostic errors.
- [ ] `cd packages/comms-sdk && bun test` executes and passes all test suites.

### Clinic Workstation App Verification
- [ ] `cd apps/clinic-app && bun run typecheck` completes with zero TypeScript diagnostic errors.
- [ ] `cd apps/clinic-app && bun run lint:tokens` completes with zero design token violations.
- [ ] `cd apps/clinic-app && bun run lint:hosts` completes with zero external host violations.
- [ ] `cd apps/clinic-app && bun test` executes and passes all test suites, including teleconsultation workflow tests.
