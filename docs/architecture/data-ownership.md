# Data ownership and retention

Who is the system of record for what, what crosses the hub and in what form, how long things live, and what happens when links, facilities or licenses end. This is an engineering description of the current design and code. It is **not legal advice**; have counsel review the Data Privacy Act section before relying on it.

Related: [interop-hub.md](interop-hub.md) · [platform-contract.md](platform-contract.md) · [billing.md](billing.md)

## Principles

1. **Each facility owns its operational data** and can run without the cloud. Nobody reads another service's database; the shared-database shortcuts of the old design are being removed.
2. **The control plane knows who and what they may do, never clinical data.**
3. **The hub holds no data of record.** It stores transient mailboxes only, purged on ack or TTL.
4. **The patient is the consent broker** for patient-owned data.
5. Anything that crosses a boundary is an [`InteropEnvelope`](../../packages/shared-dotnet/Interop/InteropEnvelope.cs) between two parties. The receiver keeps **its own copy**, which it owns from then on.

## System of record

| Data class | System of record | Notes |
|---|---|---|
| Clinical record: encounters, consultations, vitals, diagnoses, orders issued, prescriptions issued, attachments | **clinic-api** of the issuing facility (its own database; on-prem or cloud) | Documents the clinic issues are the clinic's record even if copies exist elsewhere. |
| Laboratory requisitions, specimens, analyzer data, results, reports | **laboratory-api** of the performing lab | The ordering clinic's copy of a result (`lab.result.finalized`) is a received document, imported into the clinic record. |
| Prescription orders received, dispense records, inventory | **pharmacy-api** of the dispensing pharmacy | The clinic's copy of a dispense (`rx.dispensed`) is a received notification. |
| Patient account and patient-owned data (profile, self-reported history, government ids, files) | **patient-api** (cloud) | Plus a **copy of documents the patient received** (patient's right of access): lab slips, prescriptions, lab results, medical certificates. See below. |
| Workspace (tenant), memberships, subscription and SaaS billing, plan, entitlements, facility registry, directory authority, licenses (signing) | **portal-api** (cloud) | Directory authority: the hub's directory is a read model fed from here. |
| Facility invoices, payments, receipts, cashier shifts (per cell) | **billing-api of that cell** (domain and application layers implemented; API and persistence layers still being built, see [billing.md](billing.md)) | Never leaves the cell that took the money; the workspace sees only summaries. |
| Workspace finance rollup (amounts and counts, no PHI) | **portal-api** read model (planned) | Reporting only, not a book of record. |
| Mailboxes, outbound queue, conversations, claims, directory read model, client credentials (hashes) | **interop hub** | Transient routing state. Directory rows are a copy of the portal's. |
| Per-service outbox/inbox | The service's own database | Outbox rows are purged `OutboxRetentionDays` (7) after shipping; inbox ids after `InboxRetentionDays` (14). |
| Staff accounts and permissions of a facility | The facility service (facility-local auth) | The portal tracks workspace membership, not facility staff. |

### Patient copy of documents (current state)

patient-api's database now declares `LabRequestSlip`, `PrescriptionDocument`, `LabResultReport`, `MedicalCertificate`, `PatientAccessGrant`, `PatientAccessLog` and `ShareTokenUse`, which is the planned home of the patient's copy of issued documents and of consent grants. At the time of writing these are being built on this branch: pharmacy-api now **produces** `patient.document.issued` (a dispense receipt, only when the order has a patient-app account) but patient-api has **no handler** for it (nor for `lab.order.status.changed` / `rx.status.changed`), so today patient-api actually consumes only the facility catalogue, appointment updates and record-verified notices. Treat the document copy as planned, not working.

## What crosses the hub, and in what form

All payloads are JSON records serialised by `InteropJson`, wrapped in an envelope (`MessageId`, `CorrelationId`, `Type`, `SchemaVersion`, `From`, `To`, `SentAtUtc`, `ExpiresAtUtc`, `Payload`). The envelope is capped at `Hub:MaxEnvelopeBytes` (1 MiB). In v1 payloads are readable by the hub (TLS in transit, optional AES-256-GCM at rest); sealed payloads are reserved but not implemented. See the [message catalog](platform-contract.md#message-type-catalog).

| Flow | Direction | Personal data in the payload |
|---|---|---|
| `facility.license.issued` | portal to facility | Signed license: facility and tenant ids, owner email and name, limits and features. Delivered only to the facility's own mailbox. |
| `facility.provisioned`, `workspace.profile.updated`, `directory.*` | facility/portal | No patient data. Facility names, city, visibility. |
| `patient.appointment.booked` | patient-api to clinic | Name, mobile, PhilHealth fields (always); date of birth, sex, email only when the patient's share fields include them; reason, notes, attachment references. Scope filtering is partial today (see [Consent](#patient-consent-and-sharing)). |
| `clinic.appointment.updated`, `clinic.record.verified` | clinic to patient | Appointment details and clinical summaries the clinic chose to push; attachment metadata. |
| `lab.order.issued` | clinic to lab | Requisition: patient and ordering details needed to run the test. |
| `lab.result.finalized`, `lab.result.panic` | lab to ordering clinic | Observations, impression, signatories, optional signed PDF (base64, so large reports may hit the size cap); panic alert carries patient name and critical findings. |
| `rx.issued` | clinic to pharmacy | Patient full name, date of birth, age, sex, contact, PhilHealth PIN, national id, allergies, diagnosis, items, prescriber PRC/PTR/S2. This is the most PHI-dense message. |
| `rx.dispensed` | pharmacy to ordering clinic | Dispensed items, batches, amounts, pharmacist PRC. |
| `patient.share.*`, `medcert.issued` | planned (no producer) | Scoped snapshot, issued documents (including medical certificate diagnosis and rest days). |
| `patient.document.issued` | producer in pharmacy-api (dispense receipt); no consumer yet | Document title, issuer, status and the dispensed-prescription body (patient name, medicines, quantities). |
| `billing.invoice.requested`, `billing.payment.confirmed` | lab and pharmacy produce requests, billing-api produces confirmations; within a cell | Patient name (and id when a ClinicEZ patient) and invoice lines; payment amounts and receipt numbers. |
| `billing.invoice.paid`, `billing.invoice.voided` (portal copy) | billing-api produces; no portal handler yet | **No patient data**: tenant, facility, branch, invoice id, source type, total, currency, time (void adds kind and amount reversed). |
| `notification.email.requested` | planned | Recipient email, subject, template values (HTML-encoded by the portal). |

Minimisation rule: put in a payload only what the receiver needs for its purpose. The hub never needs to interpret clinical content; it routes on `To`, `Type` and `CorrelationId`.

## Retention

### Hub (defaults from the [hub README](../../services/interop-hub/README.md), all configurable)

| Item | Default | Behaviour |
|---|---|---|
| Undelivered message | `Hub:MessageTtlDays` = 7 | `ExpiresAtUtc` is the earlier of the envelope's expiry and now + TTL; deleted by maintenance after that (silently, not dead-lettered). |
| Acked message | immediate | Envelope body blanked at ack; an **id-only tombstone** (for duplicate detection) is kept until the TTL. |
| Dead letter | `Hub:DeadLetterRetentionDays` = 14 | After `Hub:MaxDeliveryAttempts` = 10; body is retained for the 14 days (unless blanked by an ack), then purged. No replay endpoint. |
| Conversation (who may reply to whom on a correlation) | `Hub:ConversationRetentionDays` = 30 | Holds ids only (correlation and two facility keys). |
| Claim | `Hub:Claims:DefaultTtlHours` = 168, max 720 | Stored order is protected, purged on redeem or expiry; claim row (hash only) removed at expiry. |
| Outbound queue (Local mode) | until the cloud accepts | Rejected rows dead-lettered, then purged after the dead-letter retention. |
| Directory | until changed | Facility rows with `Active=false` stay as inactive rows. |

Backups of the hub database therefore contain at most 7 days of undelivered envelopes plus 14 days of dead letters. Set `Hub:PayloadEncryptionKey` and keep the key out of those backups.

### Services

- Outbox shipped rows: 7 days; inbox ids: 14 days (`Messaging:OutboxRetentionDays`, `InboxRetentionDays`). Dead-lettered outbox rows (hub rejected) are kept for diagnosis; there is no automatic purge of them in the SDK today.
- Clinical, laboratory and pharmacy records: retained by each facility according to its own legal retention duty; no automated purge exists in code.
- patient-api: soft-delete on account removal (Clerk webhook sets `IsDeleted`); no hard-delete job in the code reviewed.

## What happens when things end

| Event | Hub and directory | Data already delivered | Gaps |
|---|---|---|---|
| **Link revoked** (`directory.link.upserted` with `Status=Revoked`) | New cross-tenant sends of the link's scopes are rejected. **Replies on an existing correlation are still accepted** until the conversation expires (30 days) so in-flight orders finish. Messages already in a mailbox stay until acked or TTL. | The receiver keeps what it received; nothing is recalled. The receiver is the system of record for its copy. | The portal currently creates only automatic same-branch links, so revocation is exercised through branch moves. |
| **Facility suspended or deleted** (portal sets `Active=false` in the directory) | Hub rejects sends **to** it (`Unknown or inactive target facility`) and **from** it (`Sender ... is inactive`). Its queued inbound mail waits until the 7-day TTL, then is deleted. | Its own data stays in its own database; no automatic deletion or export. Other parties keep their copies. | The portal does not revoke the facility's hub client when it deactivates it (the admin API supports revoke, nothing calls it); the credentials stay valid but are useless because the sender check fails. |
| **License expired** | Directory unchanged: the facility is still routable. | The service enforces expiry locally (staff creation refused; license endpoints report `Expired`). | The planned read-only grace period and renewal heartbeat are not implemented. |
| **License revoked** | There is no revocation mechanism for an issued license; suspending the facility cuts it off at the hub, but offline validation passes until expiry. | n/a | Short expiry plus renewal is the planned mitigation (not built). |
| **Edge site offline** | Cloud keeps its mail in `{edgeCell}:cell-inbox` for up to 7 days, then deletes it. | Outbound mail waits in the service outbox (the SDK relay retries forever) and in the local hub's outbound queue, which is also capped by the 7-day message TTL (an expired row is dead-lettered locally). | A very long outage loses mail older than the TTL in both directions. |
| **Claim token expired or redeemed** | Claim row removed at expiry; second redeem returns `409`/`410`. | The redeeming facility keeps the order delivered to it. | |

## Patient consent and sharing

Target design (plan section 4.8). Mark each item by what exists:

1. **Patient is the consent broker.** The patient picks scopes (`SharingScopes`: demographics, allergies, medications, conditions, immunizations, lab results, prescriptions, vitals) and shares by QR token or a booking. The contract records exist ([`PatientShareRedeemPayload`, `PatientShareSnapshotPayload`](../../packages/shared-dotnet/Interoperability/ClinicalWorkflowContracts.cs)); `patient.share.redeem`/`snapshot` have no producer or handler yet, and the patient-api grant, access-log and share-token-use entities are being added on this branch.
2. **Grants have a purpose, scopes, expiry and revocation, and every read is logged.** Planned (`PatientAccessGrant`, `PatientAccessLog`).
3. **Booking shares only the chosen fields.** Partly done: [`SubmitBookingDraftCommand`](../../services/patient-api/ClinicEz.Patient.Application/Features/BookingDrafts/Commands/SubmitBookingDraft/SubmitBookingDraftCommand.cs) now gates date of birth, sex and email by the draft's share fields and no longer presumes consent (membership starts `Pending`), but name, mobile and PhilHealth fields are still always included in `patient.appointment.booked`.
4. **Revoke ends future access, not the imported chart.** When a patient revokes a grant the facility keeps the chart it already imported: it is that facility's clinical record under its retention duty (plan open question Q9, to be confirmed). Patient-api stops serving the data.
5. **Patient copy of documents** (right of access): see the section above; planned.

## Philippine Data Privacy Act (RA 10173) engineering notes

These map platform behaviours to the Act's principles and obligations. **Not legal advice**: confirm with your data protection officer and counsel, and with the implementing rules and NPC issuances in force. Health information is sensitive personal information.

| Topic | Platform stance today | To do / watch |
|---|---|---|
| **Transparency, legitimate purpose, proportionality** | Messages are addressed to a specific facility for a specific workflow; payloads are typed records, not free dumps. | Keep each payload to the receiver's need (the `rx.issued` and booking payloads are broad; review fields). Show the patient what a share contains. |
| **PHI minimisation** | Hub routes on `To`/`Type`/`CorrelationId`; billing rollup to the portal carries **no PHI by design**; the license and directory carry none. | Enforce "no PHI" on `billing.invoice.paid` with a contract test; consider sealed payloads so the hub cannot read PHI. |
| **Purpose limitation** | Grants carry a `Purpose` (planned); a claim is single-use and limited to one order; replies are limited to a correlation. | Do not reuse shared data for another purpose; log access (planned). |
| **Retention** | Hub keeps nothing beyond 7 days (undelivered) and 14 days (dead letters). Facilities keep records per their legal duties. | Define and automate retention per data class in each service (none exists in code); define backup retention. |
| **Security measures** | TLS (deployment), per-client credentials, sender-ownership and link checks, optional AES-256-GCM at rest, facility-local auth, license-bound tenancy, tenant/facility scoping in handlers. | No hub rate limiting; sealed payloads and per-message signatures unused; there is no unified audit log of cross-facility access yet. |
| **Data subject rights** (access, correction, erasure/blocking, portability, objection) | Patient-api holds the patient's account and (planned) a copy of issued documents for access; export is planned with grants. | Define how an erasure request propagates to facility-held copies; facilities may refuse deletion of records they must retain. Provide an export. |
| **Breach management** | Hub dead letters and logs can show misdirected mail; credentials can be rotated or revoked centrally. | Write the breach runbook (notification to the NPC and affected patients within the legal timeline), including hub credential rotation and mailbox purge. |
| **Third-party and cross-border** | The cloud cell, hub and patient-api run wherever the cloud is deployed. Edge sites keep intra-hospital traffic on the LAN. | Choose the cloud region deliberately (ideally in the Philippines or a jurisdiction your counsel accepts) and keep a record of where PHI and backups reside; document sub-processors (hosting, SMTP provider, storage) and data sharing agreements. |
| **Accountability** | Per-facility ownership of data is explicit above. | Appoint a DPO, keep a register of processing, run a privacy impact assessment before turning on cross-tenant sharing and patient share tokens. |
