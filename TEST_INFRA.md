# E2E Test Architecture & Verification Infrastructure: ClinicEZ Workspace Communications Platform

## 1. Test Philosophy & 4-Tier Testing Methodology

The ClinicEZ Workspace Communications Platform delivers staff chat, end-to-end encrypted video teleconsultations, and heavily triaged patient-to-facility (P2C) messaging across cloud shared cells and on-premise edge cells. Testing this platform requires strict adherence to requirement-derived, opaque-box testing: verifying observable contracts, cryptographic validity, state machine transitions, and cross-cell message delivery through the Interop Hub without probing internal private implementations.

### Systematic 4-Tier Classification:

1. **Tier 1: Feature Coverage (Category-Partition)**
   - Every feature has a minimum of 5 distinct test cases covering primary happy paths, authorized workflows, contract validity, state transitions, and expected outputs.
   - Verified via unit and integration tests across backend services (`comms-api`, `media-broker`, facility services, `patient-api`, `portal-api`) and frontend workstations.

2. **Tier 2: Boundary Value Analysis (BVA), Corner Cases & Adversarial Probes**
   - Every feature has a minimum of 5 boundary/corner edge cases:
     - 1ms before/after expiration boundaries, exact deadline timestamps.
     - Tampered cryptographic signatures, malformed Base64Url tokens, wrong key identifiers, revoked client certificates.
     - Hard maximum payload limits (500/1,000 chars text, 3/5 files, 5 MB/10 MB file sizes, 2/3 open requests, 10/20 daily messages).
     - Concurrent race conditions: duplicate message submissions, simultaneous triage dispositions, concurrent ticket renewals.
     - Format integrity: HEIC/WebP transcoding failures, zero-byte uploads, executable/script detection in PDF attachments.

3. **Tier 3: Cross-Feature Combinations & Multi-Service Chains**
   - Combinatorial lifecycle flows spanning multiple microservices via the Interop Hub:
     - `EligibilityGrant -> PatientRequest -> TriageDisposition -> RoutedThread -> FileToChart -> TranscriptArchive`.
     - `AppointmentScheduled -> CommsTicketIssued -> TeleconsultAdmit -> PaymentCleared -> LiveKitRoomMinted -> RecordingSegmentVaulted -> MedicoLegalHold`.
     - Cross-cell message replication (`HomeCell -> Hub -> ReplicaCell -> DeliveryAck -> TruthfulStateUpdated`).

4. **Tier 4: Real-World Clinical Workloads & Multi-Tenant Scenarios**
   - Multi-tenant isolation stress: two distinct clinics with identical staff names and order numbers operating concurrently without cross-visibility.
   - On-premise offline resilience: edge cell continuing local staff chat during WAN failure, buffering outbox messages, and resuming sync upon reconnection.
   - Cloud-to-on-premise tenant migration: live export/import preserving message UUIDs, cryptographic hashes, and zero message duplication.

---

## 2. Feature Inventory & E2E Test Mapping (All 33 Platform Features)

| # | Feature Name | Tier | Milestone | Target Test Suite / Class | PR |
|---|--------------|:----:|:---------:|---------------------------|:--:|
| 1 | Multi-Tier Scoped Conversations | Tier 1/2 | M2 | `CommsConversationScopingTests.cs` | PR A |
| 2 | Facility Comms Ticket Issuance | Tier 1/2 | M3 | `FacilityCommsTicketEndpointTests.cs` | PR A |
| 3 | Hub Signer Key Verification | Tier 1/2 | M1 | `CommsStaffTicketVerificationTests.cs` | PR A |
| 4 | Eligibility Grant Management | Tier 1/3 | M3 | `CommsEligibilityGrantEngineTests.cs` | PR A |
| 5 | Mandatory Emergency Gate | Tier 1/2 | M3 | `CommsEmergencyGateTriageTests.cs` | PR A |
| 6 | Triage Queue & Routing Desk | Tier 1/3 | M3 | `CommsTriageQueueEngineTests.cs` | PR A |
| 7 | Mandatory Disposition Gate | Tier 1/2 | M3 | `CommsTriageDispositionGateTests.cs` | PR A |
| 8 | Reopen Lifecycle Guard (Max 1) | Tier 1/2 | M3 | `CommsThreadReopenLifecycleTests.cs` | PR A |
| 9 | Off-Hours Silent Queueing & SLA | Tier 1/2 | M3 | `CommsOffHoursSlaAlertingTests.cs` | PR A |
| 10 | Truthful Delivery States | Tier 1/3 | M2/M5 | `CommsTruthfulDeliveryStatesTests.cs` | PR A/B |
| 11 | Retention Deadline & Resend Sweep | Tier 1/2 | M2/M5 | `CommsRetentionSweepAndResendTests.cs` | PR A/B |
| 12 | HEIC/WebP to JPEG Conversion | Tier 1/2 | M5 | `CommsAttachmentTranscodingTests.cs` | PR B |
| 13 | EXIF Privacy Stripping & Security Scan | Tier 1/2 | M2 | `CommsAttachmentScanAndPrivacyTests.cs` | PR A |
| 14 | Chart Attachment Filing | Tier 1/3 | M3 | `CommsChartAttachmentFilingTests.cs` | PR A |
| 15 | Teleconsult Payment Gate | Tier 1/2 | M4 | `CommsTeleconsultPaymentGateTests.cs` | PR B |
| 16 | YAKAP Auto-Exempt Teleconsults | Tier 1/2 | M4 | `CommsYakapPaymentExemptionTests.cs` | PR B |
| 17 | Call Minute Metering Pool | Tier 1/2 | M4 | `MediaBrokerCallMinuteMeteringTests.cs` | PR B |
| 18 | E2EE & Unencrypted Fallback Guard | Tier 1/2 | M4 | `CommsE2eeSecurityGuardTests.cs` | PR B |
| 19 | Guest Teleconsult Portal Join | Tier 1/2 | M5 | `PortalGuestTeleconsultJoinTests.cs` | PR B |
| 20 | Recording Policy & Consent Engine | Tier 1/2 | M4 | `CommsRecordingConsentAuditTests.cs` | PR B |
| 21 | Encrypted Segment Vault | Tier 1/3 | M4 | `ClinicRecordingSegmentVaultTests.cs` | PR B |
| 22 | Medico-Legal Hold & In-App Player | Tier 1/2 | M4 | `ClinicRecordingLegalHoldTests.cs` | PR B |
| 23 | Multi-Tenant Unified Inbox | Tier 1/4 | M5 | `PatientMultiTenantInboxTests.cs` | PR B |
| 24 | "Hide My Copy" Local Privacy | Tier 1/2 | M5 | `PatientHideMyCopyPrivacyTests.cs` | PR B |
| 25 | Zero-PHI Push Notification Delivery | Tier 1/2 | M5 | `PatientZeroPhiPushNotificationTests.cs` | PR B |
| 26 | Managed Dependent Proxy Messaging | Tier 1/3 | M5 | `PatientManagedDependentMessagingTests.cs` | PR B |
| 27 | Staff Reactions & Channels | Tier 1/2 | M2 | `CommsStaffReactionsAndChannelsTests.cs` | PR A |
| 28 | Cloud <-> On-Prem Tenant Migration | Tier 3/4 | M8 | `CommsTenantMigrationE2ETests.cs` | PR C |
| 29 | Site-Local LAN Channels | Tier 1/2 | M2 | `CommsSiteLocalLanIsolationTests.cs` | PR A |
| 30 | Transcript Archival to Chart | Tier 1/3 | M3 | `CommsTranscriptArchivalToChartTests.cs` | PR A |
| 31 | Shared SDK Package (`comms-sdk`) | Tier 1/2 | M6 | `commsSdkHeadlessClient.test.ts` | PR C |
| 32 | Workstation UI Across All Apps | Tier 1/4 | M7 | `apps/*/tests/commsWorkstationUi.test.ts` | PR C |
| 33 | E2E Verification & Adversarial Battery | Tier 1-4 | M9 | `ClinicEz.Interop.E2E (Comms Full Suite)` | PR C |

---

## 3. Milestone M1 E2E Test Suite Specification

Milestone M1 establishes the core interoperability backbone:
1. Cross-Tenant Staff Isolation & Patient-to-Facility Inviolability (`CommsCrossTenantIsolationTests.cs`)
2. Media Broker Platform Message Rules (`CommsMediaBrokerPlatformRulesTests.cs`)
3. Staff Identity Comms Ticket Cryptographic Verification (`CommsStaffTicketVerificationTests.cs`)
4. Edge Cell Bootstrap & Directory Upsert with `BranchId` (`CommsEdgeDirectoryBootstrapTests.cs`)

### 3.1 Suite 1: `CommsCrossTenantIsolationTests`
- **Goal**: Prove that staff messages cannot cross tenant boundaries under any circumstances, while patient-to-facility messages route seamlessly across tenants.
- **Authoritative Source**: `ORIGINAL_REQUEST.md` lines 3039, 3092, 3121, 3139.
- **Scenarios Covered**:
  1. `StaffMessage_AcrossDifferentTenants_IsRejectedByHub`: Facility A in Tenant 1 attempts to send `comms.message.submit` to Facility B in Tenant 2; Hub returns `SendResult.Rejected` with `LinkScopes.None` error.
  2. `StaffChannelCreation_AcrossTenants_IsDenied`: Hub denies any cross-tenant envelope targeting facility staff channels.
  3. `PatientMessage_AcrossTenants_IsPermittedAndDelivered`: Patient registered under Patient Plane sends `comms.request.submit` to a facility of any tenant; Hub accepts and routes to facility's mailbox without link check.
  4. `PatientReplicaSubmission_AcrossTenants_PreservesCorrelation`: `comms.message.submit` sent from patient plane to target facility preserves `CorrelationId` and `SubjectPatientId`.
  5. `DirectoryLinkUpsert_DoesNotBypassStaffCommsIsolation`: Even if an explicit `DirectoryLink` with `LinkScopes.All` exists between two clinics in different tenants, staff chat `comms.*` is still rejected because comms is strictly tenant-isolated.

### 3.2 Suite 2: `CommsMediaBrokerPlatformRulesTests`
- **Goal**: Prove that the Media Broker platform service rejects unauthorized message types, unauthorized callers, and enforces strict control plane rules.
- **Authoritative Source**: `ORIGINAL_REQUEST.md` lines 3071, 3082, 3125, 3170; `PROJECT.md` § Interface Contracts.
- **Scenarios Covered**:
  1. `FacilityClient_MayRequestRoom_AndOnlyMediaBrokerReceivesIt`: Facility sends `media.room.requested` to `Party.Media`; Hub accepts and routes to `cloud:media`.
  2. `PortalClient_MayUpdateEntitlement_AndOnlyMediaBrokerReceivesIt`: Portal sends `media.entitlement.updated` to `Party.Media`; Hub accepts.
  3. `MediaBroker_MayRespondToFacility_WithRoomTokens`: `Party.Media` emits `media.room.responded` to requesting facility; Hub accepts and routes to facility's mailbox.
  4. `MediaBroker_MayReportUsage_ToPortalOnly`: `Party.Media` emits `media.usage.recorded` to `Party.Portal`; Hub accepts and routes to `cloud:portal`.
  5. `UnauthorizedSender_AttemptingMediaRoomRequest_IsRejected`: Patient plane or non-facility party sending `media.room.requested` is rejected.
  6. `UnauthorizedRecipient_ForMediaUsage_IsRejected`: Media broker attempting to send `media.usage.recorded` to a facility is rejected.
  7. `ForeignMessageType_SentToMediaBroker_IsRejected`: Envelope with type `lab.order.issued` or `philhealth.request` sent to `Party.Media` is rejected.

### 3.3 Suite 3: `CommsStaffTicketVerificationTests`
- **Goal**: Prove that staff identity comms tickets (`POST /api/v1/comms/ticket`) cannot be forged, tampered, expired, or issued by unauthorized/revoked clients.
- **Authoritative Source**: `ORIGINAL_REQUEST.md` lines 3041, 3121, 3138; `PROJECT.md` § Interface Contracts.
- **Scenarios Covered**:
  1. `ValidTicket_SignedByFacilityKey_PassesVerification`: Ticket signed with facility's registered ECDSA P-256 key verifies successfully against Hub `GET /v1/keys/{clientId}`.
  2. `TamperedTicketPayload_FailsVerification`: Modifying claims (e.g. escalating permissions from `messaging:read` to `messaging:triage`) invalidates cryptographic signature.
  3. `ExpiredTicket_IsRejected`: Ticket with `exp` in the past (e.g., 5 minutes + 1 second) is rejected.
  4. `TicketSignedByWrongKey_IsRejected`: Ticket signed with an arbitrary ECDSA key not registered in Hub directory is rejected.
  5. `TicketFromRevokedClient_IsRejected`: When Hub client is marked `Revoked: true`, ticket verification fails immediately.
  6. `TicketForDifferentFacility_IsRejected`: Ticket issued for Facility X cannot authenticate requests targeting Facility Y.
  7. `TicketClockSkewTolerance_StrictlyBounded`: Ticket valid within 30-second leeway, rejected when beyond clock skew bounds.

### 3.4 Suite 4: `CommsEdgeDirectoryBootstrapTests`
- **Goal**: Prove that directory updates carry `BranchId`, edge cells receive directory syncs, and site-local channels remain isolated from outbound WAN routing.
- **Authoritative Source**: `ORIGINAL_REQUEST.md` lines 3042, 3087, 3125, 3173.
- **Scenarios Covered**:
  1. `DirectoryFacilityUpsert_PropagatesBranchId`: Portal upserts facility directory record with non-null `BranchId`; Hub stores and exposes `BranchId`.
  2. `SiteLocalStaffChannel_ProducesNoOutboundHubMessage`: Messages marked `IsSiteLocal = true` are delivered locally on LAN and never enqueue to Interop Hub outbox.
  3. `GeneralStaffChannel_WithRetention_CalculatesCorrectDeadline`: General channels calculate 90-day retention deadline, while order-linked threads have no auto-purge deadline.

---

## 4. Test Execution & Verification Runbook

### 4.1 Running .NET E2E Test Suites
```powershell
# From the worktree directory:
cd .agents/teamwork/worktree-teleconsult-comms

# Run full Interop E2E test suite
dotnet test tests/ClinicEz.Interop.E2E/ClinicEz.Interop.E2E.csproj --logger "console;verbosity=normal"

# Run specific Comms M1 test fixtures
dotnet test tests/ClinicEz.Interop.E2E/ClinicEz.Interop.E2E.csproj --filter "FullyQualifiedName~Comms"
```

### 4.2 Quality Gate & Integrity Checklist
- [x] Zero message brokers (enforced by `pwsh scripts/check-no-broker.ps1`).
- [x] All cross-service communication uses signed `InteropEnvelope` with ECDSA P-256 keys.
- [x] Strict tenant isolation: cross-tenant staff chat rejected by default (`LinkScopes.None`).
- [x] Single writer rule: `comms-api` in home cell owns conversations; replicas forward via Hub.
- [x] Truthful delivery states: `Received` requires explicit recipient storage ACK.
