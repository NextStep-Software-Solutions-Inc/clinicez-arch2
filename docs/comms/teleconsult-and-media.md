# Teleconsultation, Video & Media Architecture Guide

## 1. Overview & Vision

ClinicEZ provides secure, private, clinical-grade teleconsultations powered by WebRTC and LiveKit media servers. Engineered specifically for ambulatory healthcare, the teleconsultation engine balances zero-latency audio/video communication with stringent healthcare compliance:
- **Private E2EE Video Calls**: Peer-to-peer or selective forwarding unit (SFU) media streams encrypted end-to-end where browser capability permits, with audited transport encryption fallback.
- **Strict Prepayment Gate**: Guarantees payment collection prior to consultation admission while maintaining audited emergency overrides and statutory PhilHealth Konsulta exemptions.
- **Dual-Consent Recording Vault**: Zero third-party cloud recording storage. Video/audio is encrypted locally into ~10-second AES-256-GCM segments and uploaded directly into the clinic's private vault in `clinic-api`.
- **Medico-Legal Hold**: Regulatory retention scheduling with legal hold immunity protecting critical forensic records from automatic purge sweeps.

---

## 2. Media Broker & LiveKit Control Plane

To maintain tenant isolation and keep third-party API credentials out of on-premise edge installations, media orchestration is separated into a dedicated cloud platform service: `services/media-broker`.

```
+----------------------------------------------------------------------------------------------------+
|                                    MEDIA BROKER ORCHESTRATION                                      |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|    +--------------------+                     +--------------------+                               |
|    |    clinic-api      |                     |    portal-api      |                               |
|    | (Facility Service) |                     |  (Control Plane)   |                               |
|    +---------+----------+                     +---------+----------+                               |
|              |                                          |                                          |
|              | media.room.requested                     | media.entitlement.updated                |
|              v                                          v                                          |
|    +---------------------------------------------------------------+                               |
|    |                         INTEROP HUB                           |                               |
|    +-------------------------------+-------------------------------+                               |
|                                    |                                                               |
|                                    v                                                               |
|    +---------------------------------------------------------------+                               |
|    |                         media-broker                          |                               |
|    |  * Minute Pool Metering        * Ephemeral Token Minting      |                               |
|    |  * LiveKit API Isolation       * Zero Media Storage/Relay     |                               |
|    +-------------------------------+-------------------------------+                               |
|                                    |                                                               |
|                                    | Mint Room Token (JWT)                                         |
|                                    v                                                               |
|    +---------------------------------------------------------------+                               |
|    |                   LiveKit Cloud / Self-Hosted SFU             |                               |
|    |                     (Real-Time WebRTC Media)                  |                               |
|    +-------------------------------+-------------------------------+                               |
|                                    |                                                               |
|              +---------------------+---------------------+                                         |
|              | WebRTC Media Stream                       | WebRTC Media Stream                     |
|              v                                           v                                         |
|    +--------------------+                     +--------------------+                               |
|    | Clinician Browser  |                     |  Patient Mobile    |                               |
|    |   (clinic-app)     |                     |   (patient-app)    |                               |
|    +--------------------+                     +--------------------+                               |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```

### 2.1 Provider-Neutral Media Relay
- **Zero Third-Party Media Storage**: LiveKit acts exclusively as an ephemeral packet relay (SFU). Neither video frames, audio samples, nor chat transcripts are stored on LiveKit infrastructure.
- **Credential Isolation**: LiveKit API keys and secrets (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) exist strictly inside `media-broker`. No facility service (`clinic-api`, `pharmacy-api`) or client device ever receives master LiveKit credentials.
- **On-Premise LAN Compatibility**: Edge cells communicate with `media-broker` exclusively over Interop Hub outbox envelopes (`media.room.requested`). Edge clinicians and patients stream media outbound to the relay without requiring inbound open firewall ports.

### 2.2 Ephemeral Room Token Minting
Facilities request a teleconsultation room by sending an Interop Hub envelope:
```csharp
public sealed record MediaRoomRequestedPayload(
    string TenantId,
    Guid CallId,
    string RoomName,
    IReadOnlyList<string> ParticipantIdentities);
```
`media-broker` handles the request, verifies tenant minute pool entitlements, generates short-lived LiveKit access tokens (5-minute TTL), and responds via `media.room.responded`:
```csharp
public sealed record MediaRoomRespondedPayload(
    Guid CallId,
    string RoomName,
    string RelayUrl,
    IReadOnlyDictionary<string, string> ParticipantTokens,
    bool Success,
    string? ErrorMessage);
```

### 2.3 Strict Deterministic Room Naming & Participant Identity
To eliminate session hijacking and cross-call room collisions:
- **Room Name**: Formatted strictly as `room-{callId:N}` (e.g., `room-4e8c1b3f9b2d41a7836109e84d4361c7`).
- **Participant Identities**:
  - Staff: `staff:{staffId}:{facilityId}`
  - Patient: `patient:{patientId}`
  - Guest: `guest:{guestSessionId}`

---

## 3. Teleconsultation Payment Gate

In clinical practice, unattended appointments and unpaid teleconsultations represent substantial revenue leakage. ClinicEZ enforces server-side payment validation before admitting patients to clinical teleconsultations.

### 3.1 Payment Policies (`TeleconsultPaymentPolicy`)
1. **`Prepaid`**: Admission is strictly blocked until an associated invoice is marked `Paid`, unless an emergency override is recorded.
2. **`Postpaid`**: Patient is admitted immediately; invoice is generated upon consultation completion.
3. **`Exempt`**: Courtesy consultations, VIPs, or non-billable follow-ups.

### 3.2 PhilHealth Konsulta YAKAP Auto-Exemption
Under Philippine Universal Health Care (UHC) Law, primary care consultations under the PhilHealth Konsulta (YAKAP) program are statutory entitlements free at the point of service.
- If an encounter is flagged with `IsYakapEncounter = true`, the payment gate automatically applies `PaymentStatus = Exempt`.
- The clinician is immediately allowed to admit the patient without collecting prepayment.

### 3.3 Emergency Clinical Override
In acute or life-threatening scenarios where a patient requires immediate attention:
- The clinician can bypass the prepayment gate by providing an emergency override reason code (`EMERG-01` to `EMERG-99`) accompanied by clinical notes.
- The override bypasses the `HTTP 409 Payment Required` gate.
- A WORM (Write-Once-Read-Many) audit event is dispatched to `interop_hub."AuditLogs"` to prevent administrative abuse.

---

## 4. Call Minute Metering Pool

Workspace subscriptions include a monthly quota of teleconsultation minutes (e.g., 1,000 minutes/month for Pro tier):
1. **Non-Disruptive Call Continuity**: Running teleconsultations are **never terminated mid-call** if the minute quota expires during a consultation. The call proceeds to completion without disruption.
2. **Quota Exhaustion Gate**: Once the monthly pool is depleted (and no top-up packages are active), new room requests (`media.room.requested`) are rejected with `Success = false` and `ErrorMessage = "Workspace call minute pool exhausted"`.
3. **Zero PHI in Billing Reports**: Minute consumption reports dispatched from `media-broker` to `portal-api` via `media.usage.recorded` contain only `TenantId`, `CallId`, `DurationSeconds`, and timestamp. Zero patient identifiers, diagnoses, or notes are included.

---

## 5. Dual-Consent Recording Engine

Recording clinical teleconsultations creates significant medico-legal liability. ClinicEZ implements strict dual-party consent:

```
 Clinician Terminal                                             Patient Device
+------------------+                                         +------------------+
| Clicks "Record"  |                                         |                  |
+--------+---------+                                         |                  |
         |                                                   |                  |
         | 1. POST /api/v1/recordings/request-consent        |                  |
         v                                                   |                  |
+------------------------------------------------------------+                  |
| comms-api / clinic-api verifies clinician permissions      |                  |
| Dispatches SignalR Consent Prompt to Patient               |                  |
+------------------------------------------------------------+                  |
                                     |                                          |
                                     | 2. OnRecordingConsentPrompt              |
                                     v                                          v
                                                             +------------------+
                                                             | Displays Modal:  |
                                                             | Accept / Decline |
                                                             +--------+---------+
                                                                      |
                                     +--------------------------------+
                                     | 3. Submits "Accept"
                                     v
+------------------------------------------------------------+
| Both Parties Consented:                                    |
| - Emits comms.recording.consent.logged to Hub Outbox       |
| - Broadcasts OnRecordingStarted to both screens            |
| - Persistent Red "REC" Banner displayed on all clients     |
+------------------------------------------------------------+
```

### 5.1 Rules of Consent
- **Dual Affirmation Required**: Recording will NOT initiate unless both the clinician and the patient have affirmatively accepted the prompt.
- **Persistent Visual Indicator**: While recording is active, a persistent, un-dismissible recording badge appears on all participant screens.
- **Single-Party Revocation**: Either the patient or the clinician can click "Stop Recording" at any moment to immediately terminate recording capture.

---

## 6. Encrypted Segment Vault & Memory Management

Unlike legacy systems that buffer entire 60-minute video files in application memory before saving, ClinicEZ employs a **Streaming Chunked Vault Architecture**:

```
[Browser / App MediaRecorder]
             |
             | Encrypts in WebCrypto (~10s WebM / MP4 chunk)
             | Algorithm: AES-256-GCM, fresh 96-bit IV per chunk
             v
[HTTP PUT /api/v1/vault/recordings/{id}/chunks/{chunkIndex}]
             |
             | Validates chunk SHA-256 and segment sequence
             v
[clinic-api Recording Vault Storage]
             |
             | Appends encrypted blob to disk / object storage
             | Updates RecordingManifest metadata in PostgreSQL
             v
[Memory Freed Immediately (< 32 MB heap footprint)]
```

### 6.1 Cryptographic Guarantees
- Each 10-second video segment is encrypted using **AES-256-GCM** with a dedicated per-recording session key.
- The initialization vector (IV) and authentication tag are prepended to the segment payload.
- File integrity is validated via SHA-256 before storage.
- Chunks cannot be reordered or spliced; each chunk includes its sequence index in the authenticated additional data (AAD).

---

## 7. Medico-Legal Hold & In-App Playback

### 7.1 Retention Policy & Automatic Purge
Clinic policies configure recording retention based on clinical classification:
- **Default Policy**: 30 days, 90 days, or 365 days.
- **Background Sweeper (`RecordingRetentionSweeper`)**: Runs nightly to identify recordings whose `RetentionDeadlineUtc` has elapsed.

### 7.2 Legal Hold Immunity (`IsLegalHold`)
When litigation, malpractice inquiry, or regulatory investigation occurs:
- Authorized risk officers can toggle `IsLegalHold = true` on the recording record.
- The retention sweeper unconditionally skips any recording where `IsLegalHold == true`, regardless of age.
- A legal hold record cannot be purged until the hold is explicitly lifted and audit-logged.

### 7.3 In-App Decryption & Playback
- **Zero Local Disk Decryption**: Recordings are never saved unencrypted on the client disk.
- **Temporary Playback Ticket**: When an authorized clinician reviews a recording, the client requests `POST /api/v1/recordings/{id}/playback-ticket`.
- **In-Memory Streaming**: The server streams decrypted media segments over an authenticated TLS connection directly into the client's HTML5 `<video>` player buffer.
- **Audit Logging**: Every playback session logs `StaffId`, `PatientId`, `RecordingId`, and `TimestampUtc`. Raw video file download is restricted exclusively to System Administrators.
