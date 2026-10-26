# ClinicEZ Comms Platform Architecture

## 1. Executive Summary & Master Architecture

The ClinicEZ Communications Platform is an enterprise-grade, workspace-wide communication subsystem engineered for healthcare facilities (ambulatory clinics, pharmacies, diagnostic laboratories, and health systems). It unifies three mission-critical clinical communication modalities:
1. **Internal Staff Workstation Chat**: Secure, role-based, multi-tiered group channels and 1-on-1 direct messaging, with context threads linked directly to electronic medical records (EMR encounters, prescriptions, lab requisitions, and billing invoices).
2. **Private E2EE Teleconsultations**: WebRTC and LiveKit powered teleconsultations featuring virtual waiting rooms, payment gate enforcement, dual-consent recording, and encrypted recording vaults.
3. **Server-Enforced Triaged Patient-to-Facility Messaging**: Highly restricted, structured clinical intake protecting providers from un-triaged inbound communications, governed by live eligibility grants, emergency screening gates, mandatory disposition workflows, and automatic EMR chart transcript archival.

The platform executes identically in both **Cloud Multi-Tenant Shared Cells** and **On-Premise Edge Cells** (e.g., remote island clinics, hospital LANs) using identical Docker containers, schemas, and APIs.

```
+----------------------------------------------------------------------------------------------------+
|                                    CLINICEZ COMMS PLATFORM                                         |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|   +-----------------------+     +-----------------------+     +-------------------------------+    |
|   |   Clinic Workstation  |     |  Pharmacy / Lab Apps  |     |   Patient App & Web Portal    |    |
|   |    (clinic-app)       |     | (pharmacy / lab-app)  |     |  (patient-app / portal-web)   |    |
|   +-----------+-----------+     +-----------+-----------+     +---------------+---------------+    |
|               |                             |                                 |                    |
|               |  5-min Staff Ticket         |  5-min Staff Ticket             |  Patient JWT       |
|               v                             v                                 v                    |
|   +-------------------------------------------------------------------------------------------+    |
|   |                       comms-api (SignalR Hub & REST Engine)                               |    |
|   |         [/hubs/comms, /api/v1/conversations, /api/v1/triage, /api/v1/attachments]         |    |
|   +---------------------------------------------+---------------------------------------------+    |
|                                                 |                                                  |
|                   Zero-Broker Interop Envelopes (ECDSA P-256 Signed Outbox)                        |
|                                                 v                                                  |
|   +-------------------------------------------------------------------------------------------+    |
|   |                           ClinicEZ Interop Hub (Transactional Outbox)                     |    |
|   +-------+--------------------+---------------------+--------------------+-------------------+    |
|           |                    |                     |                    |                        |
|           v                    v                     v                    v                        |
|   +---------------+    +---------------+     +---------------+    +---------------+                |
|   |  clinic-api   |    |  lab-api      |     | pharmacy-api  |    |  patient-api  |                |
|   | (Vault/EMR)   |    | (Orders/Sync) |     | (Rx Context)  |    | (Replica Box) |                |
|   +---------------+    +---------------+     +---------------+    +---------------+                |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Zero-Broker Interop Routing Architecture

A core architectural tenet of ClinicEZ is **Zero External Message Brokers**. The platform strictly prohibits third-party messaging middleware such as Apache Kafka, RabbitMQ, Redis Pub/Sub, AWS SQS, or Azure Service Bus.

### 2.1 The Interop Hub Outbox Pattern
All inter-service events and asynchronous transactions travel exclusively through the **ClinicEZ Interop Hub** using an immutable, transactional outbox pattern:
- **Transactional Consistency**: Changes to local database entities and outbound messages are committed within the same relational database transaction.
- **ECDSA P-256 Cryptographic Envelope Signing**: Every envelope is signed using the issuing service's private key (`PEM P-256`). The receiving service or Hub validates the signature against public keys published by the Hub directory (`GET /v1/keys/{clientId}`).
- **At-Least-Once Delivery & Idempotent Ingestion**: Inboxes pull envelopes via secure HTTP long-polling (`POST /v1/messages/pull`) and acknowledge receipt (`POST /v1/messages/ack`). Deduplication is strictly enforced using `MessageId` and `CorrelationId`.
- **Zero Direct Cross-Service HTTP**: Services never make direct REST calls to one another. `comms-api` never calls `clinic-api` or `patient-api` directly; communication occurs purely through signed interop envelopes.

### 2.2 Standard Message Types
| Message Type | Sender | Recipient | Description |
|---|---|---|---|
| `comms.eligibility.granted` | Facility Services | `comms-api` | Emitted when an appointment, encounter, order, or prescription creates messaging eligibility. |
| `comms.eligibility.revoked` | Facility Services | `comms-api` | Emitted when an appointment is canceled or an order voided, immediately revoking messaging access. |
| `comms.request.submit` | `patient-api` | `comms-api` | Inbound patient triage inquiry submission. |
| `comms.message.submit` | Facility / Patient | `comms-api` | Submission of a conversational message. |
| `comms.message.replicate` | `comms-api` | `patient-api` | Replicates public messages into the patient's multi-tenant inbox replica. |
| `comms.message.received` | `patient-api` / Facility | `comms-api` | Recipient persistence ACK triggering truthful delivery status transition to `Received`. |
| `comms.message.acknowledged` | Facility / Patient | `comms-api` | Explicit user click of the "Understood" / read receipt acknowledgment. |
| `comms.thread.state.changed` | `comms-api` | Facility / Patient | Dispositions (Routed, Answered, NeedsVisit, Declined, Closed). |
| `comms.conversation.archived` | `comms-api` | `clinic-api` | Dispatched on inquiry resolution with full public transcript to be filed into patient chart. |
| `media.room.requested` | Facility Services | `media-broker` | Facility requests an ephemeral WebRTC teleconsultation room. |
| `media.room.responded` | `media-broker` | Facility Services | Returns LiveKit connection tokens for staff, patient, and guest participants. |
| `media.usage.recorded` | `media-broker` | `portal-api` | Reports call duration minutes consumed against workspace monthly pool. |

---

## 3. Multi-Tenant Isolation & Scoping Model

The comms platform enforces defense-in-depth isolation across workspaces, facilities, branches, and staff.

### 3.1 Six Conversation Scopes
Every conversation created in `comms-api` belongs strictly to one of six scopes:
1. **Workspace Scope (`ConversationScope.Workspace`)**: Workspace-wide announcements and team coordination accessible to all authenticated staff belonging to the tenant.
2. **Facility Scope (`ConversationScope.Facility`)**: Restricted strictly to staff assigned to a specific facility ID (e.g., Downtown Clinic, St. Jude Pharmacy).
3. **Branch Scope (`ConversationScope.Branch`)**: Scoped to staff across multiple collocated facilities within a single physical branch facility.
4. **Direct Message Scope (`ConversationScope.Direct`)**: Confidential 1-on-1 dialogue between two specific staff members within the same tenant.
5. **Staff Context Scope (`ConversationScope.StaffContext`)**: Embedded discussion attached directly to an operational entity (`ContextType`: `Encounter`, `Prescription`, `LabOrder`, `Invoice`). Visibility follows access permissions to the underlying entity.
6. **Patient-Facility Scope (`ConversationScope.PatientFacility`)**: Triaged dialogue between a patient and the facility front desk/clinical team. Patients cannot initiate un-triaged open chats.

### 3.2 Single-Writer Principle
Every conversation is homed in exactly one cell (the cell where the tenant's primary comms database resides). That home cell is the **Single Writer** for that conversation:
- All new messages and state transitions are processed, validated, sequenced, and written by the home cell.
- Secondary consumers (such as `patient-api` storing personal patient inbox copies) receive read replicas via `comms.message.replicate`.
- There are **zero distributed write-write conflicts**.

### 3.3 Strict Cross-Tenant Staff Chatter Prohibition
Under no circumstances may staff from different tenants exchange messages or participate in common channels. Even if two tenants have established Interop Hub directory links (`LinkScopes.All`, `LinkScopes.Referral`), the Hub routing policy strictly rejects any `comms.*` envelope whose sender tenant and recipient tenant differ (HTTP 403 / SendResult.Rejected).

### 3.4 Site-Local Offline LAN Channels
For edge deployments with intermittent internet access (e.g., maritime clinics, remote rural health units), channels flagged with `IsSiteLocal = true` operate 100% offline. Messages posted in site-local channels are never queued to the outbound Interop Hub outbox, ensuring local clinic communications continue during WAN outages and data remains on premises.

---

## 4. Feature Flag Architecture & Off-by-Default Discipline

In alignment with ClinicEZ security baselines, all communications capabilities are **strictly off by default**. No communication endpoints or background workers will activate unless explicitly enabled via configuration or tenant licensing:

```json
{
  "Comms": {
    "Enabled": false,
    "PatientMessagingEnabled": false,
    "TeleconsultEnabled": false,
    "RecordingEnabled": false,
    "DefaultRetentionDays": 90,
    "MaxAttachmentSizeBytes": 5242880,
    "MaxAttachmentsPerMessage": 3
  }
}
```

- When `Comms:Enabled` is `false`, `CommsHub` rejects incoming connections with `HubException("Communications service is disabled for this cell.")`.
- When `Comms:PatientMessagingEnabled` is `false`, patient apps hide messaging entry points, and `POST /api/v1/triage/submit` returns `403 Forbidden`.
- When `Comms:TeleconsultEnabled` is `false`, calls cannot be initiated, and room token requests return `403 Forbidden`.

---

## 5. Truthful Delivery State Machine

Unlike consumer messaging applications that display deceptive "double checkmarks" before a recipient has actually received a message, ClinicEZ implements **Truthful Delivery**:

```
 [Client Compose]
         |
         v
     +-------+
     |Sending|  (Optimistic client state; message queued locally or in-flight)
     +---+---+
         | Server accepts write to local DB
         v
     +-------+
     |Waiting|  (Persisted in home cell; NOT yet acknowledged by recipient device/box)
     +---+---+
         |                                           |
         | Recipient confirms persistence            | Retention deadline expires
         | (comms.message.received ACK)              | (Default 7 days / Sweeper)
         v                                           v
    +--------+                                 +-----------+
    |Received|                                 |NotReceived|
    +--------+                                 +-----+-----+
         ^                                           |
         | Late confirmation ACK arrives             | Single-tap resend (idempotent)
         +-------------------------------------------+
```

### 5.1 Delivery States
1. **`Sending`**: The message has been dispatched by the client SDK and is in-flight or in the client's local SQLite offline queue.
2. **`Waiting`**: The home `comms-api` service has validated, stored, and assigned a monotonic sequence number (`Seq`) to the message. It is queued for delivery, but recipient storage is unconfirmed.
3. **`Received`**: The recipient's application or home inbox replica has written the message to persistent storage and transmitted an authentic `comms.message.received` confirmation.
4. **`NotReceived`**: The message retention deadline passed without receiving a storage confirmation.

### 5.2 Resend & Late ACK Resolution
- When a message transitions to `NotReceived`, the sender's client displays an alert banner.
- Senders can trigger a **single-tap resend**. The SDK resends the message using the **exact same `ClientMessageId`**, guaranteeing deduplication and preventing duplicate messages.
- If a late confirmation arrives from a previously offline device after the message was marked `NotReceived`, the state truthfully flips to `Received` with the real timestamp recorded.

---

## 6. Real-Time SignalR Hub Protocol

The primary real-time transport between client applications and `comms-api` is ASP.NET Core SignalR at endpoint `/hubs/comms`.

### 6.1 Authentication Handshake
- **Staff Authentication**: Staff connect using a 5-minute ECDSA P-256 signed ticket obtained from their facility service (`POST /api/v1/comms/ticket`). The ticket is passed in the query string `?access_token=...` during WebSocket handshake. `comms-api` verifies the signature using the Hub's published public key for that facility.
- **Patient Authentication**: Patients connect using their standard OpenID Connect / OAuth2 JWT access token issued by `patient-api` or `portal-api`.

### 6.2 Client-to-Server Methods
```csharp
Task JoinConversation(Guid conversationId);
Task LeaveConversation(Guid conversationId);
Task SendMessage(SendMessageDto request);
Task AcknowledgeMessage(Guid messageId);
Task ConfirmDelivery(Guid messageId);
Task SendTyping(Guid conversationId, bool isTyping);
Task SendReaction(Guid messageId, string reactionEmoji);
```

### 6.3 Server-to-Client Events
```csharp
Task OnMessageReceived(MessageDto message);
Task OnMessageStateChanged(Guid messageId, DeliveryState newState, DateTime timestampUtc);
Task OnUserTyping(Guid conversationId, string userId, string displayName, bool isTyping);
Task OnReactionUpdated(Guid messageId, string emoji, int count, IReadOnlyList<string> userNames);
Task OnThreadStateChanged(Guid conversationId, RequestStatus newStatus, TriageDisposition? disposition);
Task OnCallInvited(Guid callId, string roomName, string callerDisplayName);
Task OnCallStateChanged(Guid callId, CallState newState);
```

---

## 7. Domain Data Models & Schema Architecture

All entities reside in the `ClinicEz.Comms.Domain` project and follow Domain-Driven Design (DDD) principles:

```
+--------------------------------------------------------------------------+
|                              CONVERSATION                                |
+--------------------------------------------------------------------------+
| Id: Guid (PK)                                                            |
| TenantId: string                                                         |
| FacilityId: string                                                       |
| BranchId: string?                                                        |
| Scope: ConversationScope (Workspace, Facility, Branch, Direct, Context)  |
| Kind: ConversationKind (General, RecordLinked, Direct, PatientTriage)    |
| Title: string?                                                           |
| ContextType: string? (Encounter, Prescription, LabOrder, Invoice)        |
| ContextId: string?                                                       |
| IsSiteLocal: bool                                                        |
| RetentionDays: int                                                       |
| CreatedAtUtc: DateTime                                                   |
+------------------------------------+-------------------------------------+
                                     | 1..*
                                     v
+------------------------------------+-------------------------------------+
|                                MESSAGE                                   |
+--------------------------------------------------------------------------+
| Id: Guid (PK)                                                            |
| ConversationId: Guid (FK)                                                |
| ClientMessageId: Guid (Unique per client for dedup)                      |
| Seq: long (Monotonic per conversation)                                   |
| SenderType: string ("Staff" | "Patient" | "System")                      |
| SenderId: Guid?                                                          |
| SenderDisplayName: string                                                |
| ContentText: string                                                      |
| Visibility: MessageVisibility (Public | Internal)                        |
| State: DeliveryState (Sending -> Waiting -> Received -> NotReceived)     |
| RequiresAcknowledgement: bool                                            |
| RetentionDeadlineUtc: DateTime                                           |
| SentAtUtc: DateTime                                                      |
+-------------------+--------------------------------+---------------------+
                    | 1..*                           | 1..*
                    v                                v
+-------------------+--------------+   +-------------+---------------------+
|            ATTACHMENT            |   |           MESSAGE REACTION        |
+----------------------------------+   +-----------------------------------+
| Id: Guid (PK)                    |   | Id: Guid (PK)                     |
| MessageId: Guid (FK)             |   | MessageId: Guid (FK)              |
| FileKey: string                  |   | StaffId: Guid                     |
| FileName: string                 |   | ReactionEmoji: string (6 allowed) |
| ContentType: string              |   | ReactedAtUtc: DateTime            |
| SizeBytes: long                  |   +-----------------------------------+
| HashSha256: string               |
| ScanStatus: AttachmentScanStatus |
| StoragePath: string              |
+----------------------------------+
```

### 7.1 Patient Triage Domain Model
```
+--------------------------------------------------------------------------+
|                             TRIAGE REQUEST                               |
+--------------------------------------------------------------------------+
| Id: Guid (PK)                                                            |
| ConversationId: Guid (FK)                                                |
| PatientId: Guid                                                          |
| SubmittingAccountId: Guid? (Guardian account if proxy message)           |
| Relationship: string? ("Child", "Spouse", "Parent")                      |
| Category: MessageCategory                                                |
| Status: RequestStatus (Submitted, WithTriage, Routed, Answered, Closed)   |
| Disposition: TriageDisposition? (Answered, NeedsVisit, Declined, Routed) |
| Priority: TriagePriority (Routine | Urgent)                              |
| AssignedStaffId: Guid?                                                   |
| DeclineReasonCode: string?                                               |
| ReopenCount: int (Max 1)                                                 |
| SlaTargetMinutes: int                                                    |
| TriageDueAtUtc: DateTime                                                 |
| SubmittedAtUtc: DateTime                                                 |
| ClosedAtUtc: DateTime?                                                   |
+------------------------------------+-------------------------------------+
                                     | 1..*
                                     v
+------------------------------------+-------------------------------------+
|                              TRIAGE NOTE                                 |
+--------------------------------------------------------------------------+
| Id: Guid (PK)                                                            |
| TriageRequestId: Guid (FK)                                               |
| AuthorStaffId: Guid                                                      |
| AuthorDisplayName: string                                                |
| NoteText: string (Internal note - strictly invisible to patient)         |
| CreatedAtUtc: DateTime                                                   |
+--------------------------------------------------------------------------+
```
