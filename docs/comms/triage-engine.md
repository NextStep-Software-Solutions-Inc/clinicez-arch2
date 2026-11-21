# Patient-to-Facility Triage Engine Architecture Guide

## 1. Executive Summary & Philosophy

In typical messaging systems, patient-to-provider chat creates severe clinical burnout, unmanaged liability, and unsafe clinical communication. ClinicEZ solves this with a **Server-Enforced Clinical Triage Engine**:
- **Patients Cannot Freely Chat with Clinicians**: Patients cannot initiate open, unmoderated conversations with doctors or facility personnel.
- **Triage First**: Inbound inquiries land in a dedicated triage routing queue seen strictly by administrative or triage personnel with `messaging:triage` permissions. Clinicians cannot be directly messaged and see nothing until a request is vetted and routed.
- **Mandatory Dispositions**: Inquiries cannot be dismissed without structured outcomes (`Answered`, `NeedsVisit`, `Declined`, or `Routed`).
- **Complete Auditability & EMR Chart Archival**: Every message, triage note, status transition, and disposition is permanently recorded and filed into the patient's longitudinal EMR record upon thread closure.

---

## 2. The Patient Intake Lifecycle

```
[Patient Device (patient-app / portal-web)]
                 |
                 | 1. Evaluates Eligibility Grant (Active appointment, order, or prescription)
                 |    If no active grant -> Entry point is hidden; API returns 403 Forbidden
                 v
+-----------------------------------------------------------------------------------------+
|                               MANDATORY EMERGENCY GATE                                  |
|   "Is this an urgent medical emergency?"                                                |
|   - If YES -> Submission blocked. Emergency guidance & 911 hotline shown.              |
|   - If NO  -> Structured intake form unlocked.                                          |
+-----------------------------------------------------------------------------------------+
                 |
                 | 2. POST /api/v1/triage/submit (Category + Subject + Message + Attachments)
                 v
+-----------------------------------------------------------------------------------------+
|                                    comms-api                                            |
|   - Validates active EligibilityGrant for (TenantId, FacilityId, PatientId)             |
|   - Enforces rate limits (1 active inquiry per category, max 5 submissions/day)         |
|   - Creates Conversation (Scope = PatientFacility, Kind = PatientTriage)                |
|   - Creates TriageRequest (Status = WithTriage)                                         |
+-----------------------------------------------------------------------------------------+
                 |
                 v
+-----------------------------------------------------------------------------------------+
|                                  TRIAGE QUEUE DESK                                      |
|   - Visible ONLY to staff with 'messaging:triage' permission                            |
|   - Clinical staff see ZERO notifications and ZERO messages                             |
|   - Dynamic SLA Countdown Timer active (Urgent: 60m, Routine: 4h)                       |
+------------------------------------+----------------------------------------------------+
                                     |
                                     | Staff reviews inquiry and selects Disposition
                                     v
                 +-------------------+-------------------+
                 |                   |                   |
                 v                   v                   v
           +-----------+       +-----------+       +-----------+
           | Answered  |       |NeedsVisit |       | Declined  |
           |  (Public  |       | (Requires |       | (Requires |
           |  Reply)   |       |  Booking) |       |  Reason)  |
           +-----+-----+       +-----+-----+       +-----+-----+
                 |                   |                   |
                 +-------------------+-------------------+
                 |
                 | Or: Routed to Clinical Care Team
                 v
+-----------------------------------------------------------------------------------------+
|                               CLINICAL ROUTING WORKSPACE                                |
|   - Assigned to specific Clinician or Care Team Pool                                    |
|   - Priority assigned: Routine or Urgent                                                |
|   - Thread unlocked for clinical messaging                                              |
+------------------------------------+----------------------------------------------------+
                                     |
                                     | Clinical interaction resolves inquiry
                                     v
+-----------------------------------------------------------------------------------------+
|                               THREAD RESOLUTION & ARCHIVE                               |
|   - Inquiry status -> Resolved -> Closed                                                |
|   - Reopen Guard: Patient can reopen thread exactly ONCE (returns to triage queue)      |
|   - Upon Closure: Automatic chart transcript compiled and archived to clinic-api        |
+-----------------------------------------------------------------------------------------+
```

---

## 3. Eligibility Grant Management

Patients cannot message a facility unless they have an active **Eligibility Grant** issued by that facility.

### 3.1 Grant Triggers
Facility services automatically publish `comms.eligibility.granted` envelopes to the Interop Hub upon standard clinical events:
- **`clinic-api`**: Appointment booked, encounter active, or post-discharge follow-up window (e.g., valid from booking time until 72 hours post-encounter).
- **`pharmacy-api`**: Prescription dispensed with active refill inquiries permitted for 30 days.
- **`laboratory-api`**: Lab requisition ordered, valid until 14 days after result verification.

### 3.2 Interop Contract
```csharp
public sealed record CommsEligibilityGrantedPayload(
    Guid GrantId,
    string TenantId,
    string FacilityId,
    string FacilityType,
    Guid PatientId,
    string ContextType,
    string ContextId,
    DateTime WindowStartUtc,
    DateTime WindowEndUtc,
    int Version);
```

### 3.3 Server Enforcement
When `POST /api/v1/triage/submit` is received:
1. `comms-api` queries its local database for an active `EligibilityGrant` matching `(TenantId, FacilityId, PatientId)`.
2. Validates that `DateTime.UtcNow` falls between `WindowStartUtc` and `WindowEndUtc`.
3. If no active grant exists or the window has expired, the submission is rejected with `HTTP 403 Forbidden` (`ErrorCode: "eligibility_grant_required"`).

---

## 4. Facility Ticket Endpoints (`POST /api/v1/comms/ticket`)

Staff members cannot authenticate to `comms-api` using arbitrary tokens. Facility services act as the authoritative identity providers for their staff members by hosting an identical comms ticket endpoint:
- **`clinic-api`**: `POST /api/v1/comms/ticket`
- **`pharmacy-api`**: `POST /api/v1/comms/ticket`
- **`laboratory-api`**: `POST /api/v1/comms/ticket`
- **`billing-api`**: `POST /api/v1/comms/ticket`
- **`organization-api`**: `POST /api/v1/comms/ticket`

### 4.1 Ticket Structure & Claims
When staff log in to their workstation application, the workstation calls their home facility endpoint. The facility service signs an ECDSA P-256 JWT valid for **5 minutes**:
```json
{
  "sub": "04c27a2e-8367-4bb9-913a-a19280f5d7be",
  "name": "Dr. Eleanor Vance",
  "tenant_id": "tenant-prime",
  "facility_id": "fac-downtown-clinic",
  "branch_id": "branch-central",
  "permissions": [
    "messaging:read",
    "messaging:write",
    "messaging:triage",
    "teleconsult:call",
    "teleconsult:record"
  ],
  "iss": "e2e-clinic",
  "exp": 1793081100,
  "nbf": 1793080800
}
```

### 4.2 Hub Key Verification
`comms-api` never shares a secret database with facility services. When validating tickets:
- `comms-api` extracts the `iss` (Client ID) claim.
- Retrieves the published ECDSA P-256 public key from Interop Hub (`GET /v1/keys/{clientId}`).
- Validates the cryptographic signature, expiration, and facility scoping.

---

## 5. Mandatory Emergency Screening Gate

Before a patient can submit any inquiry, they must complete the **Emergency Screening Gate**:
- The patient is presented with an unambiguous prompt: *"Is this inquiry regarding a life-threatening or medical emergency?"*
- **If the patient answers "Yes"**:
  - The application immediately blocks submission.
  - Zero messages or network requests are dispatched to the facility.
  - An emergency dialog displays national and local emergency contact numbers:
    - National Emergency Hotline: `911`
    - Philippine Red Cross: `143`
    - Nearest Facility Emergency Room contact numbers.
- **Zero AI Clinical Chatbots**: ClinicEZ strictly rejects artificial intelligence bots for clinical triage. Emergency gate screening is deterministic and patient-declared.

---

## 6. Mandatory Triage Dispositions

Triage staff assigned to the triage desk cannot dismiss an inquiry without recording a formal disposition.

| Disposition | Requirements | Clinical Outcome |
|---|---|---|
| **`Answered`** | Mandatory non-empty public response text. | Front desk provides administrative clarification (e.g., clinic hours, parking instructions, pricing). Thread marked `Answered`. |
| **`NeedsVisit`** | Mandatory clinical visit recommendation. | Staff advises the patient that their condition requires physical examination. Link to appointment booking is attached. |
| **`Declined`** | Mandatory structured reason code (`DECLINE-01` OutOfScope, `DECLINE-02` Ineligible, `DECLINE-03` Spam) + clinical note. | Inquiry is politely declined. Patient is provided with reason and alternatives. |
| **`Routed`** | Destination staff/team ID + Priority (`Routine` / `Urgent`). | Escalated to clinical staff. The thread appears in the doctor's workstation queue. |

---

## 7. Reopen Lifecycle Guard

To prevent indefinite zombie threads while accommodating legitimate patient follow-ups:
- When a thread is marked `Answered`, `NeedsVisit`, or `Resolved`, the patient can submit a follow-up inquiry.
- **Reopen Guard Limit**: A closed thread can be reopened **exactly once** (`ReopenCount <= 1`).
- Upon reopening, the thread returns to the **Triage Queue** (`Status = WithTriage`) for renewed administrative review.
- If a patient attempts to message a thread that has already been reopened and closed a second time, the submission is rejected. The patient is required to initiate a new structured triage request.

---

## 8. SLA Countdown Engine & Off-Hours Silent Queueing

### 8.1 Active Dynamic SLA Countdown
Every triage item calculates its target response deadline based on category and priority:
- **Urgent Priority**: 60-minute target resolution.
- **Routine Priority**: 240-minute (4-hour) target resolution.
- Workstation queues dynamically recompute remaining time every 15 seconds:
  - `⏳ Target: 2h 15m remaining`
  - `⏳ Target: 14m remaining`
  - `⏳ Target: < 1m remaining`
  - `⚠️ SLA Breached` (Highlighted in warning tokens)

### 8.2 Off-Hours Silent Queueing
When patient inquiries arrive outside configured facility operating hours (e.g., 8:00 PM on a Sunday):
- The inquiry is queued silently in the database.
- **Zero Clinical Staff Paging**: On-call doctors are never alerted or paged for non-emergency inquiries.
- An automated response is dispatched to the patient indicating facility operating hours and the expected response window on the next business day.
- Missed SLA targets generate escalation alerts strictly to the Triage Supervisor, never to clinical providers.

---

## 9. Managed Dependent Proxy Messaging

Parents, legal guardians, and adult children frequently manage healthcare communications for dependents.
1. **Link Verification**: Inbound inquiries include `SubmittingAccountId` and `Relationship` ("Mother", "Father", "Legal Guardian").
2. **Dual-Constraint Rate Limiting**:
   - Eligibility is verified against the **dependent's** medical record (`PatientId`).
   - Daily message volume caps evaluate both the **dependent** and the **submitting account**, preventing proxy spam.
3. **Unlinking Safeguard**: If a guardian's proxy authorization is revoked, their access to the thread is terminated immediately, but the dependent's official medical record retains the complete audit trail.

---

## 10. Automatic Chart Transcript Archival

When a patient-to-facility thread reaches terminal status (`Closed`), `comms-api` executes the archival pipeline:
1. **Sanitization**: Internal staff notes (`MessageVisibility.Internal`) are preserved for the legal medical record but tagged appropriately.
2. **Serialization**: A standardized, immutable transcript is compiled containing patient details, triage disposition, timestamps, messages, and attachment references.
3. **Interop Archival Event**: Emits `comms.conversation.archived` to the Interop Hub:
   ```csharp
   public sealed record CommsConversationArchivedPayload(
       Guid ConversationId,
       string TenantId,
       string FacilityId,
       Guid PatientId,
       string TranscriptContent,
       IReadOnlyList<CommsAttachmentReference> Attachments,
       DateTime ArchivedAtUtc);
   ```
4. **EMR Filing**: `clinic-api` ingests the envelope and embeds the transcript directly into the patient's longitudinal EMR chart.
