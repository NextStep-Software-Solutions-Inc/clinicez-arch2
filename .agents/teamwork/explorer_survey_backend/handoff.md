# Handoff Report: Teleconsultation Backend Scope Survey

**Workspace**: `/Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/finalize_teleconsultation_api`  
**State Folder**: `/Users/macuser/.gemini/antigravity/worktrees/clinicez-arch2/finalize_teleconsultation_api/.agents/teamwork/explorer_survey_backend`  
**Target Projects**: `services/clinic-api` and `packages/shared-dotnet`  
**Date**: 2026-11-12T23:26:00Z  

---

## 1. Observation

### 1.1 Baseline Test Suite Status
Executed command:
```bash
dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj
```
Result:
- **Total Tests**: 5,287
- **Passed**: 5,287
- **Failed**: 0
- **Skipped**: 0
- **Duration**: 26.0s
Baseline test suite is 100% green and clean.

Specific teleconsultation test baseline:
```bash
dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~Teleconsult"
# Result: Passed! Total: 19, Passed: 19, Failed: 0, Duration: 1s

dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~RecordPayment|FullyQualifiedName~ClinicSettings"
# Result: Passed! Total: 9, Passed: 9, Failed: 0, Duration: 1s
```

---

### 1.2 Existing Files & Implemented Components

1. **Database Schema & Migrations (`Zero PostgreSQL Schema Migrations` Constraint)**:
   - File: `services/clinic-api/ClinicEz.Clinic.Infrastructure/Migrations/ApplicationDbContextModelSnapshot.cs`
   - `Appointments` table already includes columns: `CallId` (line 49), `InvoiceId` (line 98), `PaymentPolicy` (line 136), `PaymentStatus` (line 144).
   - `Settings` table already includes: `TeleconsultAutoExemptYakap` (line 2369), `TeleconsultDefaultFee` (line 2372), `TeleconsultPaymentPolicy` (line 2375), `TeleconsultRecordingConsentRequired` (line 2379), `TeleconsultRecordingPolicy` (line 2382), `TeleconsultRecordingRetentionDays` (line 2386).
   - Tables `TeleconsultRecordingSessions` (line 9093) and `TeleconsultRecordingSegments` (line 8907) are already fully defined.
   - **Conclusion**: Zero schema migrations are needed. Database schema already possesses all required tables and columns.

2. **Domain Entities**:
   - `services/clinic-api/ClinicEz.Clinic.Domain/Entities/FacilitySettings.cs` (lines 235–242):
     ```csharp
     public string TeleconsultRecordingPolicy { get; set; } = "Disabled";
     public int TeleconsultRecordingRetentionDays { get; set; } = 90;
     public bool TeleconsultRecordingConsentRequired { get; set; } = true;
     public string TeleconsultPaymentPolicy { get; set; } = "Prepaid";
     public decimal TeleconsultDefaultFee { get; set; } = 400.00m;
     public bool TeleconsultAutoExemptYakap { get; set; } = true;
     ```
   - `services/clinic-api/ClinicEz.Clinic.Domain/Entities/Appointment.cs` (lines 58–102):
     Has `AppointmentType`, `IsTeleconsult`, `PaymentPolicy`, `PaymentStatus`, `InvoiceId`, `InvoiceRequestId`, `PaidAmount`, `PaidAt`, `PaymentReceiptNumber`, `PaymentMethod`, `IsEmergencyOverride`, `EmergencyOverrideReasonCode`, `EmergencyOverrideReasonNote`, `EmergencyOverrideDoctorId`, `EmergencyOverrideDoctorName`, `EmergencyOverrideAtUtc`, `CallId`, `AdmittedAtUtc`, `AdmittedByDoctorId`.
   - `services/clinic-api/ClinicEz.Clinic.Domain/Entities/TeleconsultRecordingSession.cs`:
     Complete entity with `CallId`, `AppointmentId`, `ConsultationId`, `PatientId`, `DoctorId`, `ConsentStatus`, `RecordingState`, `StoragePolicy`, `RetentionPolicyDays`, `ExpiresAtUtc`, `IsLegalHold`, `ManifestStorageKey`, etc.
   - `services/clinic-api/ClinicEz.Clinic.Domain/Entities/TeleconsultRecordingSegment.cs`:
     Entity with `SessionId`, `SegmentIndex`, `DurationMs`, `StorageKey`, `SizeBytes`, `Sha256Checksum`, `IvBase64`, `TagBase64`.

3. **Encryption & Storage Service**:
   - `services/clinic-api/ClinicEz.Clinic.Application/Common/Interfaces/IClinicEncryptionService.cs`
   - `services/clinic-api/ClinicEz.Clinic.Infrastructure/Services/Storage/ClinicEncryptionService.cs`:
     Implements CMK AES-256-GCM envelope encryption. Returns `ClinicEncryptedPayload` (`Ciphertext`, `IvBase64`, `TagBase64`, `EncryptedHash`, `EncryptedSizeBytes`, `WrappedKeyJson`). Supports `DecryptToStreamAsync`.
   - `services/clinic-api/ClinicEz.Clinic.Application/Common/Interfaces/IClinicStorageService.cs`:
     Supports `SaveEncryptedFileAsync`, `SaveEncryptedStreamAsync`, `OpenReadEncryptedStreamAsync`, `DeleteEncryptedFileAsync`, `FileExistsAsync`.
   - `services/clinic-api/ClinicEz.Clinic.Infrastructure/DependencyInjection.cs` (line 231):
     `services.AddSingleton<IClinicEncryptionService, ClinicEncryptionService>();` is registered.

4. **Shared Interoperability Contracts**:
   - `packages/shared-dotnet/Interop/Contracts/MediaContracts.cs`:
     Contains `MediaRoomRequestedPayload` and `MediaRoomRespondedPayload`.
   - `packages/shared-dotnet/Interop/Contracts/CommsContracts.cs`:
     Contains `CommsCallStateChangedPayload`, `CommsCallPaymentClearedPayload`, `CommsRecordingConsentLoggedPayload`, `TeleconsultPaymentPolicy` (`Prepaid`, `Postpaid`, `Exempt`).
   - `packages/shared-dotnet/Interop/Party.cs` (line 88):
     `Party.Media` is defined (`Kind = PartyKind.ControlPlane, Service = InteropServices.Media`).
   - `packages/shared-dotnet/Interop/InteropTypes.cs`:
     Defines `InteropTypes.MediaRoomRequested`, `InteropTypes.MediaRoomResponded`, `InteropTypes.CommsCallStateChanged`, `InteropTypes.CommsCallPaymentCleared`, `InteropTypes.CommsRecordingConsentLogged`.

5. **Counter Payment Clearance Already Implemented**:
   - `services/clinic-api/ClinicEz.Clinic.Infrastructure/Messaging/Handlers/BillingPaymentConfirmedHandler.cs` (lines 121–158):
     Already updates `Appointment.PaymentStatus = TeleconsultPaymentStatus.Paid`, sets `PaidAmount`, `PaidAt`, `PaymentReceiptNumber`, and enqueues `InteropTypes.CommsCallPaymentCleared` when settled via shared billing counter.

---

### 1.3 Missing or Deficient Components Requiring Modification

1. **`packages/shared-dotnet/Common/AppointmentBookedEvent.cs`**:
   - **Current state**: Lines 14–17 only have `PreferredDate`, `PreferredTime`, `Reason`. Missing `public string? AppointmentType { get; init; }`.

2. **Facility Settings DTO & Commands (`services/clinic-api`)**:
   - `ClinicSettingsDto.cs`: Does not expose the 5 teleconsult settings properties (`TeleconsultRecordingPolicy`, `TeleconsultRecordingRetentionDays`, `TeleconsultRecordingConsentRequired`, `TeleconsultPaymentPolicy`, `TeleconsultDefaultFee`).
   - `GetClinicSettingsQuery.cs`: Does not map teleconsult properties from `FacilitySettings` to `ClinicSettingsDto`.
   - `UpdateClinicSettingsCommand.cs`: Does not accept, validate, or persist the 5 teleconsult settings.

3. **Appointment Creation & Queries (`services/clinic-api`)**:
   - `CreateAppointmentCommand.cs`:
     - Does not accept `AppointmentType? AppointmentType = null` or `TeleconsultPaymentPolicy? PaymentPolicy = null`.
     - Does not infer `AppointmentType.Teleconsult` if `ServiceType` is `"Teleconsult"` or `"Teleconsultation"`.
     - When `AppointmentType == Teleconsult`: does not assign deterministic `CallId = Guid.NewGuid()`, does not resolve `PaymentPolicy` from request or facility settings, does not initialize `PaymentStatus = PaymentPolicy == Exempt ? Exempt : Pending`, and for `Prepaid` does not create a linked `Invoice` (`Amount = settings?.TeleconsultDefaultFee ?? 400m`, `AppointmentId = appointment.Id`) or enqueue `InteropTypes.BillingInvoiceRequested` if cashier mode is `CashierCounter`.
   - `GetAppointmentsQuery.cs` (`AppointmentDto` & `AppointmentDto.From(Appointment a)`):
     - Does not expose `AppointmentType`, `IsTeleconsult`, `PaymentPolicy`, `PaymentStatus`, `InvoiceId`, `PaidAmount`, `CallId`, `AdmittedAtUtc`, `IsEmergencyOverride`, `EmergencyOverrideReasonCode`.
   - `AppointmentBookedHandler.cs` (lines 326–346):
     - When ingesting patient booking, does not inspect `message.AppointmentType`. When `Teleconsult`, does not assign `CallId`, resolve `PaymentPolicy` from facility settings, set `PaymentStatus`, or generate a linked `Invoice` when `Prepaid`.

4. **Local Cashiering (`RecordPaymentCommand.cs`)**:
   - `services/clinic-api/ClinicEz.Clinic.Application/Features/Billing/Commands/RecordPaymentCommand.cs`:
     - Does not inject `IRepository<Appointment>`.
     - When `invoice.Status == InvoiceStatus.Paid`, does not check for a linked `Appointment`. If linked appointment is a teleconsultation, does not update `PaymentStatus = Paid`, `PaidAmount`, `PaidAt`, `PaymentReceiptNumber`, `PaymentMethod`, or enqueue `InteropTypes.CommsCallPaymentCleared`.

5. **Teleconsultation Status & Admission (`GetTeleconsultStatusQuery.cs` & `AdmitTeleconsultPatientCommand.cs`)**:
   - `GetTeleconsultStatusQuery.cs`:
     - Lines 55–60 currently allow active YAKAP enlistment to automatically set `canAdmit = true`.
     - Lacks `InvoiceId`, `RecordingPolicy`, `RecordingConsentRequired`, `ActiveRecordingSessionId`, and informational `HasActiveYakapEnlistment`.
   - `AdmitTeleconsultPatientCommand.cs`:
     - Lines 76–94 silently rewrite `appointment.PaymentPolicy = Exempt` and `PaymentStatus = Exempt` when `patient.GetActiveYakapEnlistment(...) != null`. Must be removed.
     - Lines 106–124 require `ConsultationsSign` strictly, and reject any code not in `EmergencyOverrideReasonCodes.Descriptions`.
     - Needs relaxation: Allow staff with `ConsultationsWrite` OR `ConsultationsSign`. Make `EmergencyOverrideDto.ReasonCode` optional (defaulting to `"STAFF-OVERRIDE"`), remove `Descriptions.ContainsKey` check, require `ReasonNote >= 5` characters. Write WORM `AuditEntry` and emit `CommsCallPaymentCleared`.

6. **Missing Teleconsultation Commands & Interop Handlers**:
   - `UpdateTeleconsultPaymentPolicyCommand.cs`: MISSING. Needed at `Features/Teleconsult/Commands/UpdateTeleconsultPaymentPolicyCommand.cs` and endpoint `PUT /api/v1/teleconsult/appointments/{appointmentId:guid}/payment-policy`.
   - `JoinTeleconsultCallCommand.cs`: MISSING. Needed at `Features/Teleconsult/Commands/JoinTeleconsultCallCommand.cs` and endpoint `POST /api/v1/teleconsult/appointments/{appointmentId:guid}/join`.
   - `EndTeleconsultCallCommand.cs`: MISSING. Needed at `Features/Teleconsult/Commands/EndTeleconsultCallCommand.cs` and endpoint `POST /api/v1/teleconsult/appointments/{appointmentId:guid}/end`.
   - `CommsRecordingConsentLoggedHandler.cs`: MISSING. Needed at `Infrastructure/Messaging/Handlers/CommsRecordingConsentLoggedHandler.cs`.
   - `DependencyInjection.cs`: Missing `.HandleReply(InteropTypes.MediaRoomResponded)` and `.Handle<CommsRecordingConsentLoggedPayload, CommsRecordingConsentLoggedHandler>(InteropTypes.CommsRecordingConsentLogged)`.

7. **Recording Vault CMK Encryption & Linkage (`TeleconsultRecordingsController.cs`)**:
   - `UploadSegment`: Currently expects client-side encrypted headers (`X-Encryption-Iv`, `X-Encryption-Tag`) and does not encrypt with server CMK or write `{storageKey}.key` wrapped DEK sidecars.
   - `StreamRecording`: Verifies ticket but does not decrypt via `IClinicEncryptionService.DecryptToStreamAsync` when `{storageKey}.key` sidecar is present.
   - Missing endpoints:
     - `GET /api/v1/teleconsult/recordings/appointments/{appointmentId:guid}`
     - `GET /api/v1/teleconsult/recordings/sessions/{id:guid}`
   - `RecordingRetentionSweeper.cs`: Currently only deletes segment file and manifest file; does not clean up `{storageKey}.key` sidecars.
   - `CreateConsultationCommandHandler.cs`: Does not backfill `ConsultationId` on `TeleconsultRecordingSession` when `encounter.AppointmentId` is set.
   - `GetConsultationRecordingQueryHandler.cs`: Only queries by `ConsultationId`, doesn't fall back to `AppointmentId`.

8. **Existing Test Suites Requiring Alignment**:
   - `TeleconsultPaymentGateTests.cs`:
     - `AdmitPatient_WhenPatientHasActiveYakapEnlistment_AutoExemptsAndAdmits` asserts that active YAKAP auto-exempts and admits unpaid prepaid appointments. Under R2, having active YAKAP must NOT auto-exempt (it throws `TeleconsultPaymentRequiredException` unless staff updates policy).
     - `AdmitPatient_WhenEmergencyOverrideReasonCodeIsUnrecognized_ThrowsBadRequestException` asserts that unrecognized code throws `BadRequestException`. Under R2, plain notes with any code or omitted code are accepted.
   - `ChallengerCommsVaultAndPaymentGateTests.cs`:
     - `Attack2A_ActiveYakapEnlistment_AutoExemptsAndAdmits` asserts old auto-exemption behavior. Must be updated to assert that active YAKAP does not mutate policy and throws `TeleconsultPaymentRequiredException` if unpaid prepaid.

---

## 2. Logic Chain

```
Observation:
1. `FacilitySettings`, `Appointment`, and `TeleconsultRecording*` already exist in PostgreSQL snapshot with required columns.
2. `AppointmentBookedEvent` lacks `AppointmentType`.
3. `ClinicSettingsDto` and settings commands do not expose teleconsult settings.
4. `CreateAppointmentCommand` & `AppointmentBookedHandler` do not branch for teleconsult appointments or generate prepaid invoices.
5. `RecordPaymentCommand` does not clear linked teleconsult appointments on local payment.
6. `AdmitTeleconsultPatientCommand` has automatic YAKAP policy mutation and rigid `EMERG-*` validation.
7. Teleconsult commands (`UpdatePolicy`, `JoinCall`, `EndCall`) and endpoints do not exist.
8. `TeleconsultRecordingsController` does not apply server CMK AES-256-GCM encryption with `.key` sidecars.

Logic:
-> Zero database schema migrations required (100% compliant with Guardrail 1).
-> Adding optional `AppointmentType` on `AppointmentBookedEvent` maintains backward compatibility for existing patient app bookings.
-> Exposing teleconsult settings on `ClinicSettingsDto` / `UpdateClinicSettingsCommand` allows workstation settings configuration.
-> Enhancing `CreateAppointmentCommand` and `AppointmentBookedHandler` ensures teleconsult appointments receive a deterministic `CallId`, initial payment policy, and prepaid invoice with cashier outbox notification.
-> Injecting `IRepository<Appointment>` into `RecordPaymentCommand` closes the loop for local `ClinicDesk` cashiering, mirroring `BillingPaymentConfirmedHandler`.
-> Removing silent YAKAP mutation in `AdmitTeleconsultPatientCommand` and `GetTeleconsultStatusQuery` enforces 100% staff-driven billing, while plain-note override ensures life-safety access without rigid statutory codes.
-> Creating `UpdateTeleconsultPaymentPolicyCommand` provides the required staff flexibility to switch policies at any stage.
-> Implementing `JoinTeleconsultCallCommand` with `IInteropRequestClient` zero-PHI token requests to `Party.Media` enables secure WebRTC signaling with offline LAN fallback.
-> Upgrading `TeleconsultRecordingsController` to use `IClinicEncryptionService` satisfies CMK AES-256-GCM encryption at rest with `.key` sidecars and authorized on-the-fly streaming decryption.
-> Updating `RecordingRetentionSweeper` ensures DEK sidecars are purged along with ciphertext during retention sweeps.
```

---

## 3. Caveats

1. **Existing Test Assertions on Auto-Exemption**:
   Two existing tests in the test suite (`TeleconsultPaymentGateTests.AdmitPatient_WhenPatientHasActiveYakapEnlistment_AutoExemptsAndAdmits` and `ChallengerCommsVaultAndPaymentGateTests.Attack2A_ActiveYakapEnlistment_AutoExemptsAndAdmits`) explicitly assert that `AdmitTeleconsultPatientCommand` auto-exempts a patient when active YAKAP exists. Once the auto-exemption block is removed per R2, these two tests will fail unless updated to assert that unpaid prepaid appointments remain blocked until staff explicitly switches policy or applies an override.
2. **Backward Compatibility on Segment Upload Headers**:
   Existing tests in `TeleconsultRecordingVaultAdversarialTests.cs` invoke `UploadRecordingSegmentCommandHandler` directly passing pre-generated `IvBase64` and `TagBase64`. The controller `UploadSegment` endpoint must continue to support these headers if supplied by legacy test harnesses while defaulting to server CMK encryption when streaming raw chunks.
3. **Zero-PHI Token Regexes**:
   The validation regexes must be strictly enforced:
   - Room Name: `^call-[0-9a-fA-F\-]{32,36}$`
   - Participant Identities: `^(staff|patient|guest|participant)(:|-)[0-9a-zA-Z\-_]{1,64}$`
   Zero patient names, birth dates, or contact info must ever be passed to LiveKit room tokens.

---

## 4. Conclusion & Required Specifications

### 4.1 Required Data Contracts & DTOs

#### In `packages/shared-dotnet/Common/AppointmentBookedEvent.cs`:
```csharp
public record AppointmentBookedEvent
{
    // ...
    public string? PreferredTime { get; init; }
    public string? AppointmentType { get; init; } // "InPerson" | "Teleconsult"
    public string? Reason { get; init; }
    // ...
}
```

#### In `services/clinic-api/ClinicEz.Clinic.Application/Features/Settings/DTOs/ClinicSettingsDto.cs`:
Appended constructor arguments (with backward-compatible defaults):
```csharp
string TeleconsultRecordingPolicy = "Disabled",
int TeleconsultRecordingRetentionDays = 90,
bool TeleconsultRecordingConsentRequired = true,
TeleconsultPaymentPolicy TeleconsultPaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
decimal? TeleconsultDefaultFee = null
```

#### In `services/clinic-api/ClinicEz.Clinic.Application/Features/Appointments/GetAppointmentsQuery.cs` (`AppointmentDto`):
Appended constructor arguments:
```csharp
AppointmentType AppointmentType = AppointmentType.InPerson,
bool IsTeleconsult = false,
TeleconsultPaymentPolicy PaymentPolicy = TeleconsultPaymentPolicy.Prepaid,
TeleconsultPaymentStatus PaymentStatus = TeleconsultPaymentStatus.Pending,
Guid? InvoiceId = null,
decimal? PaidAmount = null,
Guid? CallId = null,
DateTime? AdmittedAtUtc = null,
bool IsEmergencyOverride = false,
string? EmergencyOverrideReasonCode = null
```

#### In `services/clinic-api/ClinicEz.Clinic.Application/Features/Teleconsult/Queries/GetTeleconsultStatusQuery.cs` (`TeleconsultStatusDto`):
```csharp
public sealed record TeleconsultStatusDto(
    Guid AppointmentId,
    Guid PatientId,
    string PatientName,
    DateTime ScheduledAt,
    AppointmentType AppointmentType,
    TeleconsultPaymentPolicy PaymentPolicy,
    TeleconsultPaymentStatus PaymentStatus,
    bool CanAdmit,
    bool HasActiveYakapEnlistment,
    Guid? CallId,
    bool IsEmergencyOverride,
    string? EmergencyOverrideReasonCode,
    Guid? InvoiceId = null,
    string RecordingPolicy = "Disabled",
    bool RecordingConsentRequired = true,
    Guid? ActiveRecordingSessionId = null);
```

#### In `services/clinic-api/ClinicEz.Clinic.Application/Features/Teleconsult/Commands/JoinTeleconsultCallCommand.cs` (`TeleconsultCallJoinDto`):
```csharp
public sealed record TeleconsultCallJoinDto(
    Guid CallId,
    string RoomName,
    string? RelayUrl,
    string? ClinicianToken,
    string ParticipantIdentity,
    bool MediaAvailable,
    string? MediaStatusMessage,
    string RecordingPolicy,
    bool RecordingConsentRequired);
```

---

### 4.2 Required Command & Query Implementations

1. **`UpdateTeleconsultPaymentPolicyCommand.cs`**:
   - Location: `services/clinic-api/ClinicEz.Clinic.Application/Features/Teleconsult/Commands/UpdateTeleconsultPaymentPolicyCommand.cs`
   - Permissions: `AppointmentsWrite` or `ConsultationsWrite`
   - Logic:
     - Fetches appointment; validates `IsTeleconsult == true`.
     - When switching to `Exempt`: sets `PaymentStatus = Exempt`, and if `CallId` exists, enqueues `InteropTypes.CommsCallPaymentCleared`.
     - When switching to `Postpaid`: if `PaymentStatus != Paid`, sets `PaymentStatus = Pending`.
     - When switching to `Prepaid`: if `PaymentStatus != Paid`, sets `PaymentStatus = Pending`. If `InvoiceId == null`, creates draft `Invoice` (`Amount = settings?.TeleconsultDefaultFee ?? 400m`) and sets `appointment.InvoiceId = invoice.Id`.
     - Writes WORM `AuditEntry` (`teleconsult.payment_policy.updated`).
     - Returns updated `TeleconsultStatusDto`.

2. **`JoinTeleconsultCallCommand.cs`**:
   - Location: `services/clinic-api/ClinicEz.Clinic.Application/Features/Teleconsult/Commands/JoinTeleconsultCallCommand.cs`
   - Permissions: `ConsultationsWrite` or `ConsultationsSign`
   - Logic:
     - Verifies appointment exists, `IsTeleconsult == true`, and `AdmittedAtUtc != null`.
     - Resolves facility settings for `TeleconsultRecordingPolicy` and `TeleconsultRecordingConsentRequired`.
     - Builds zero-PHI room and participant IDs:
       - `roomName = $"call-{callId:N}"`
       - `staffIdentity = $"staff:{_clinicContext.StaffId!.Value:N}"`
       - `patientIdentity = $"patient:{appointment.PatientId:N}"`
     - Calls `IInteropRequestClient.RequestAsync<MediaRoomRequestedPayload, MediaRoomRespondedPayload>`:
       - Type: `InteropTypes.MediaRoomRequested`
       - ReplyType: `InteropTypes.MediaRoomResponded`
       - From: `ClinicParties.Clinic(clinic.TenantId, clinic.ClinicId.ToString())`
       - To: `Party.Media`
       - Timeout: 10 seconds.
       - If timeout occurs (`InteropRequestTimeoutException`): logs warning and falls back to `MediaAvailable = false`, `MediaStatusMessage = "Media broker unavailable. Call state maintained in offline signaling mode."`.
     - Enqueues `InteropTypes.CommsCallStateChanged` (`Status: "Admitted"`, `RoomName: roomName`, `JoinToken: patientToken`) to `InteropServices.Comms`.
     - Writes WORM `AuditEntry` (`teleconsult.call.joined`).
     - Returns `TeleconsultCallJoinDto`.

3. **`EndTeleconsultCallCommand.cs`**:
   - Location: `services/clinic-api/ClinicEz.Clinic.Application/Features/Teleconsult/Commands/EndTeleconsultCallCommand.cs`
   - Permissions: `ConsultationsWrite` or `ConsultationsSign`
   - Logic:
     - Verifies appointment is teleconsult.
     - Enqueues `InteropTypes.CommsCallStateChanged` (`Status: "Ended"`) to `InteropServices.Comms`.
     - If active `TeleconsultRecordingSession` exists for `CallId` with segments and state `Recording`: invokes `FinalizeRecordingSessionCommand`.
     - Writes WORM `AuditEntry` (`teleconsult.call.ended`).

4. **`CommsRecordingConsentLoggedHandler.cs`**:
   - Location: `services/clinic-api/ClinicEz.Clinic.Infrastructure/Messaging/Handlers/CommsRecordingConsentLoggedHandler.cs`
   - Implements `IInteropHandler<CommsRecordingConsentLoggedPayload>`.
   - Locates `TeleconsultRecordingSession` by `CallId`.
   - Updates `session.ConsentStatus = message.Decision`.
   - If `"Consented"`, sets `session.PatientConsentAtUtc = message.LoggedAtUtc`, `session.RecordingState = "ReadyToRecord"`.
   - If `"Declined"` or `"Rejected"`, sets `session.RecordingState = "Blocked"`.
   - Writes WORM `AuditEntry`.

5. **`TeleconsultAdmissionController.cs` Enhancements**:
   - Add `PUT /api/v1/teleconsult/appointments/{appointmentId:guid}/payment-policy` -> `UpdateTeleconsultPaymentPolicyCommand`
   - Add `POST /api/v1/teleconsult/appointments/{appointmentId:guid}/join` -> `JoinTeleconsultCallCommand`
   - Add `POST /api/v1/teleconsult/appointments/{appointmentId:guid}/end` -> `EndTeleconsultCallCommand`

6. **`TeleconsultRecordingsController.cs` CMK Encryption & Linkage**:
   - Inject `IClinicEncryptionService`.
   - In `UploadSegment`:
     - If `X-Encryption-Iv` and `X-Encryption-Tag` headers are missing, encrypt `Request.Body` with `_encryptionService.EncryptAsync(Request.Body, tenantId, clinicId, ct)`.
     - Save ciphertext to `{storageKey}` and save `{storageKey}.key` containing `encrypted.WrappedKeyJson`.
     - Use IV, Tag, Hash, and Size from `encrypted`.
   - In `StreamRecording`:
     - Check if `await _storage.FileExistsAsync(segment.StorageKey + ".key", ct)`.
     - If present, read wrapped key JSON, read encrypted stream, call `_encryptionService.DecryptToStreamAsync`, and stream decrypted stream with `enableRangeProcessing: true`.
     - If not present, fall back to `_storage.OpenReadEncryptedStreamAsync` (legacy compatibility).
   - Add lookup endpoints:
     - `GET /api/v1/teleconsult/recordings/appointments/{appointmentId:guid}`
     - `GET /api/v1/teleconsult/recordings/sessions/{id:guid}`

7. **`RecordingRetentionSweeper.cs`**:
   - In segment purge loop: if `segment.StorageKey + ".key"` exists, delete it.
   - In manifest purge: if `session.ManifestStorageKey + ".key"` exists, delete it.

8. **`CreateConsultationCommandHandler.cs` Linkage**:
   - When `encounter.AppointmentId` has a value, query `_db.TeleconsultRecordingSessions.Where(s => s.AppointmentId == encounter.AppointmentId && s.ConsultationId == null)` and update `session.ConsultationId = encounter.Id`.

9. **`DependencyInjection.cs`**:
   - Register `.HandleReply(InteropTypes.MediaRoomResponded)`
   - Register `.Handle<CommsRecordingConsentLoggedPayload, CommsRecordingConsentLoggedHandler>(InteropTypes.CommsRecordingConsentLogged)`

---

## 5. Verification Method

To independently verify the implementation:

1. **Full Backend Test Suite Execution**:
   ```bash
   dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj
   ```
   **Expected**: 5,287+ tests pass with 0 failures.

2. **Teleconsultation Focused Suite**:
   ```bash
   dotnet test services/clinic-api/ClinicEz.Clinic.Application.Tests/ClinicEz.Clinic.Application.Tests.csproj --filter "FullyQualifiedName~Teleconsult|FullyQualifiedName~RecordPayment|FullyQualifiedName~ClinicSettings"
   ```
   **Expected**: All teleconsult payment gating, policy update, join/end media signaling, AES-256-GCM sidecar encryption, and WORM audit tests pass.

3. **Check Build Integrity**:
   ```bash
   dotnet build services/clinic-api/ClinicEz.Clinic.Api/ClinicEz.Clinic.Api.csproj
   ```
   **Expected**: Build succeeds with 0 errors.

4. **Invalidation Conditions**:
   - Any PostgreSQL migration file created (violates zero-migration rule).
   - Any patient name or non-masked PHI present in LiveKit room tokens (violates zero-PHI rule).
   - Direct cross-service HTTP client created for media-broker or comms (violates zero external broker / Interop Hub rule).
   - Segment files stored without corresponding `.key` DEK sidecars when server encryption is enabled.
