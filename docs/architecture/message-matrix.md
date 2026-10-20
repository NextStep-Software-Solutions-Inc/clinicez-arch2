# Message matrix

Every envelope type in [`InteropTypes`](../../packages/shared-dotnet/Interop/InteropTypes.cs), who sends it, who handles it, and how it is addressed. Built by reading the code (publishers: `Enqueue(...)` / `InteropEnvelope.Create(...)`; receivers: `.Handle<TPayload, THandler>(InteropTypes.X)` in each service's `DependencyInjection.cs`). The table is mirrored by an executable one: [`MessageCoverageTests`](../../tests/ClinicEz.Interop.E2E/MessageCoverageTests.cs) lists the same route for every `InteropTypes` constant and asserts that each hosted service's real handler registry equals the rows that name it as receiver, so this document and the code cannot drift silently. Every envelope is also signed, see [Envelope signing](#envelope-signing). The prose catalog of what each message means lives in [`platform-contract.md`](platform-contract.md); routing and delivery rules are in [`interop-hub.md`](interop-hub.md).

Conventions:

- Services are mailbox names: `clinic`, `laboratory`, `pharmacy`, `organization`, `patient`, `portal`, `billing`. "Facility" means the clinic, laboratory, pharmacy or organization service. philhealth is the platform mailbox of the PhilHealth proxy (cloud cell only).
- **Correlation** is the `CorrelationId` the sender puts on the envelope. A reply uses the correlation of the message it answers; the hub opens a conversation on the first message (and on a claim) and only lets the other side answer on it (see the cross-tenant rules in [`interop-hub.md`](interop-hub.md)).
- **Cross-tenant scope**: when sender and receiver belong to different workspaces the hub needs an Active link whose scope covers the type, or a reply on an open conversation. The scope is derived from the type string in [`HubContracts.cs`](../../services/interop-hub/ClinicEz.Interop.Application/HubContracts.cs): `lab.order.*` = `LabOrder`, `rx.*` = `Prescription`, `*referral*` = `Referral`, `lab.result.*` = `Result`; every other type has no scope, so it can only cross tenants as a reply. Control-plane (`portal`) and patient-plane (`patient`) senders are not subject to links.
- **Handler status** `OK` means every intended receiver registers a handler. Anything else is called out, because the hub redelivers an unhandled message and finally dead-letters it.

## Provisioning and control plane

| Type | Sender | Receiver | Payload | Addressing and correlation | Handler status |
|---|---|---|---|---|---|
| `facility.license.issued` | portal (`FacilityProvisioningPublisher`) | clinic, laboratory, pharmacy, organization (the new facility) and the facility's billing service | `FacilityCreatedEvent` | To the facility's mailbox and, with the same payload and correlation, to the same facility party with `service: billing`. Correlation = facility id (`ResourceId`). | Portal side done. billing-api registers its handler in the billing round. |
| `facility.provisioned` | clinic, laboratory, pharmacy, organization (their license-issued handler, same transaction) | portal (`FacilityProvisionedHandler`) | `FacilityProvisionedEvent` | To `Party.Portal`. Correlation = that of the license message (facility id). | OK |
| `facility.directory.updated` | portal (`FacilityProvisioningPublisher`) | patient (`FacilityDirectoryUpdatedInteropHandler`) | `FacilityCreatedEvent` with `LicenseToken` and `Limits` removed | To the control-plane `patient` mailbox. Correlation = facility id. | OK |
| `workspace.profile.updated` | portal (`WorkspaceProfilePublisher`, on every profile change; also once when a facility is created) | clinic, laboratory, pharmacy, organization (shared `WorkspaceProfileUpdatedHandler`, registered with `HandleWorkspaceProfileUpdated()`) | `WorkspaceProfileUpdatedEvent` carrying the full `WorkspaceProfile` (brand, regional defaults, DPO contact; no secrets, no PHI) | One message per routable facility of the workspace. Correlation = tenant id. | OK. The handler accepts it only from the portal, only when addressed to a facility of the same tenant, and stores it in the service's own database when `Version` is newer than the held one (redelivery and reordering are harmless). No service calls the portal for the profile any more. |
| `entitlements.changed` | portal (`EntitlementsPublisher`) | every routable facility (clinic, laboratory, pharmacy, organization) via `AddFacilityEntitlements`, and each facility's billing service | `EntitlementsChangedEvent` (re-minted license token and limits) | One message per facility, plus an identical copy to the same facility party with `service: billing`. Correlation = facility id. | Portal side done. billing-api registers its handler in the billing round. |
| `facility.heartbeat` | clinic, laboratory, pharmacy, organization (`FacilityHeartbeatService`, `Messaging:HeartbeatMinutes`, default 15) | portal (`FacilityHeartbeatHandler`) | `FacilityHeartbeatPayload` | To `Party.Portal`, one per hosted facility. Correlation = a new GUID per beat. | OK. Only accepted from the facility it describes. |
| `notification.email.requested` | portal only today (`NotificationService`, addressed to itself) | portal (`NotificationEmailRequestedHandler`) | `NotificationEmailRequestedPayload` | `Party.Portal` to `Party.Portal`. Correlation chosen by the caller. | OK. The contract says any service may send it; no other service does yet. |

## Hub directory feed

Portal to hub. Handled inside the hub (`DirectoryService`), never stored in a mailbox. Only control-plane clients may send them, and a Local-mode hub refuses them (it syncs a directory snapshot from the cloud hub).

| Type | Sender | Receiver | Payload | Addressing and correlation | Handler status |
|---|---|---|---|---|---|
| `directory.cell.upserted` | portal (`DirectoryFeedWriter`) | hub | `DirectoryCellUpsertedPayload` | Correlation = a new GUID. | OK |
| `directory.facility.upserted` | portal (`DirectoryFeedWriter`) | hub | `DirectoryFacilityUpsertedPayload` | Correlation = facility id. | OK |
| `directory.link.upserted` | portal (`DirectoryFeedWriter`) | hub | `DirectoryLinkUpsertedPayload` | Correlation = link id. | OK |

## Patient and clinic

| Type | Sender | Receiver | Payload | Addressing and correlation | Handler status |
|---|---|---|---|---|---|
| `patient.appointment.booked` | patient (`SubmitBookingDraftCommand`) | clinic (`AppointmentBookedHandler`) | `AppointmentBookedEvent` | `Party.ForPatient` to the clinic. Correlation = booking draft id. | OK |
| `clinic.appointment.updated` | clinic (`AppointmentBookedHandler` confirms; `PatientAppointmentPublisher` for later changes) | patient (`ClinicAppointmentUpdatedInteropHandler`) | `ClinicAppointmentUpdatedEvent` | To the patient's mailbox; skipped when the clinic patient has no patient-app account. Correlation = draft id for the confirmation, otherwise the caller's id. | OK |
| `clinic.record.verified` | clinic (`ClinicRecordEventPublisher`) | patient (`ClinicRecordVerifiedInteropHandler`) | `ClinicRecordVerifiedEvent` | To the patient's mailbox; skipped without an account. Correlation = attachment id. | OK |
| `patient.record.shared` | patient (`SubmitBookingDraftCommand`, one per attached file) | clinic (`PatientRecordSharedHandler`) | `PatientRecordSharedPayload` (presigned download link, no file bytes) | Patient to the clinic. Correlation = booking draft id. | OK |
| `patient.share.redeem` | clinic (`PatientRecordGateway`) | patient (`PatientShareRedeemInteropHandler`) | `PatientShareRedeemPayload` | From the clinic to the control-plane `patient` mailbox. Correlation = request id; the reply copies it. | OK |
| `patient.share.snapshot` | patient (reply from `PatientShareRedeemInteropHandler`) | clinic (`PatientShareSnapshotHandler`) | `PatientShareSnapshotPayload` | To the redeeming facility. Correlation = the request's. | OK |
| `patient.document.issued` | clinic (`PatientDocumentPublisher`), laboratory (`DiagnosticReportPublisher`, results), pharmacy (`PrescriptionDispensedPublisher`, dispense receipts) | patient (`PatientDocumentIssuedInteropHandler`) | `PatientDocumentIssuedPayload` (`Kind`, issuer, `Body`) | To the patient's mailbox, only when the patient has a patient-app account. Correlation = document id (clinic), requisition id (laboratory), order correlation id (pharmacy). | OK. Medical certificates travel as the `Body` of this message (`MedicalCertificateIssuedPayload`). |
| `patient.join.requested` | portal (`PublicJoinEndpoints`) | clinic (`PatientJoinRequestedHandler`) | `PatientJoinRequestedPayload` | `Party.Portal` to the clinic facility mailbox. Correlation = tracking id. | OK |
| `patient.appointment.alert` | clinic (`AppointmentNotificationDispatcher`, `SendAppointmentReminderCommand`, background worker) | patient (`PatientAppointmentAlertInteropHandler`) | `PatientAppointmentAlertPayload` (`AppointmentId`, `ClinicId`, `ClinicName`, `AlertKind`, `Message`, `ScheduledAtUtc`, etc.) | From clinic to `Party.ForPatient`. Correlation = appointment id. Dispatches push notifications to patient active device sessions and records in-app notification. | OK |

## Laboratory

| Type | Sender | Receiver | Payload | Addressing and correlation | Handler status |
|---|---|---|---|---|---|
| `lab.order.issued` | clinic (`LabRequisitionPublisher`, direct; `ClaimSlipService`, through a claim slip addressed by facility type only) | laboratory (`LabOrderIssuedHandler`) | `LabRequisitionIssuedEvent` | Direct: to the chosen laboratory (same tenant, linked tenant with `LabOrder` scope, or the clinic's own). Claim: whichever laboratory redeems the slip. Correlation = requisition id. | OK |
| `lab.order.status.changed` | laboratory (`LabOrderLifecycle`) | clinic (`LabOrderStatusChangedHandler`) and patient (`LabOrderStatusChangedInteropHandler`, only if the patient has an account) | `LabOrderStatusChangedPayload` | One message to the ordering clinic and one to the patient. Correlation = the clinic's requisition id. Carries the stage, quote, `PaymentRequired` and reason. | OK |
| `lab.result.finalized` | laboratory (`DiagnosticReportPublisher`) | clinic (`DiagnosticReportFinalizedHandler`) | `DiagnosticReportFinalizedEvent` | To the ordering clinic. Correlation = requisition id. Cross-tenant: a reply on the order's conversation, or a link with `Result` scope. | OK |
| `lab.result.panic` | laboratory (`PanicAlertPublisher`) | clinic (`LabPanicResultAlertHandler`) | `LabPanicResultAlertEvent` | To the ordering clinic. Correlation = requisition id. | OK |
| `lab.result.external.submitted` | patient (`UploadLabResultCommand`), portal (`LabUploadRelay`, public upload page) | clinic (`LabResultExternalSubmittedHandler`) | `ExternalLabResultUploadedEvent` | To the ordering clinic. Correlation = requisition id from the patient, a new upload id from the portal. | OK |
| `lab.result.reviewed` | clinic (`LabResultReviewedPublisher`) | patient (`LabResultReviewedInteropHandler`) and the laboratory the order went to | `LabResultReviewedPayload` | One message to the patient (if they have an account) and one to the laboratory. Correlation = order id. | laboratory-api `LabResultReviewedHandler` records the doctor verdict on the requisition (only from the ordering clinic; idempotent). |

## Pharmacy

| Type | Sender | Receiver | Payload | Addressing and correlation | Handler status |
|---|---|---|---|---|---|
| `rx.issued` | clinic (`PrescriptionPublisher`, direct; `ClaimSlipService`, through a claim slip) | pharmacy (`PrescriptionIssuedHandler`) | `PrescriptionIssuedEvent` | Direct: to the chosen pharmacy. Claim: whichever pharmacy redeems the slip. Correlation = prescription id. | OK |
| `rx.status.changed` | pharmacy (`RxStatusPublisher`) | clinic (`RxStatusChangedHandler`) and patient (`RxStatusChangedInteropHandler`, only with an account) | `RxStatusChangedPayload` | One message to the ordering clinic and one to the patient. Correlation = the order's correlation id. | OK |
| `rx.dispensed` | pharmacy (`PrescriptionDispensedPublisher`) | clinic (`PrescriptionDispensedHandler`) | `PrescriptionDispensedEvent` | To the ordering clinic. Correlation = the order's correlation id, else its external prescription id. | OK |
| `rx.external.dispensed` | patient (`MarkPrescriptionExternallyDispensedCommand`) | clinic (`ExternalPrescriptionDispensedHandler`) | `ExternalPrescriptionDispensedEvent` | Patient to the ordering clinic. Correlation = prescription id. | OK |

## Billing

All billing messages stay inside one cell. The facility asks its own `billing` mailbox, which is why none of them need a cross-tenant link.

| Type | Sender | Receiver | Payload | Addressing and correlation | Handler status |
|---|---|---|---|---|---|
| `billing.invoice.requested` | clinic (`BillingRequestPublisher`), laboratory (`LabOrderBilling`), pharmacy (`PharmacyBillingPublisher`) | billing (`InvoiceRequestedHandler`) | `BillingInvoiceRequestedPayload` | To the same facility's `billing` mailbox. Correlation = `InvoiceRequestId` (lab requisition id, pharmacy order id, clinic request id). | OK |
| `billing.payment.confirmed` | billing (`BillingMessages.PaymentConfirmed`, on every payment, partial ones included) | clinic, laboratory, pharmacy (`BillingPaymentConfirmedHandler`; accepted only from their own `billing` mailbox) | `BillingPaymentConfirmedPayload` | To the requesting facility, for invoices that came from a request. Correlation = `InvoiceRequestId`. | OK |
| `billing.invoice.paid` | billing (`BillingMessages.InvoicePaid`, when an invoice becomes fully paid; skipped for a zero total) | portal (`BillingInvoicePaidHandler`) | `BillingInvoicePaidPayload` (no patient data) | To `Party.Portal`. Correlation = invoice id. | OK |
| `billing.invoice.voided` | billing (`BillingMessages`, void of an unpaid invoice or refund of a paid one) | the requesting clinic, laboratory or pharmacy (`BillingInvoiceVoidedHandler`), and portal | `BillingInvoiceVoidedPayload` | To the facility for invoices that came from a request (correlation = `InvoiceRequestId`), and to `Party.Portal` for a refunded paid invoice (correlation = invoice id). | OK |

## Platform services (request/reply)

Request/reply replaces direct service-to-service HTTP: a request is an ordinary envelope, the answer is another envelope with the same `CorrelationId`, sent back to the requester's `From`. The SDK pieces are `IInteropRequestClient` (send and await, typed `InteropRequestTimeoutException`), `.HandleReply(type)` on the requester and `IInteropResponder<TRequest, TResponse>` registered with `.Respond<...>(requestType, replyType)` on the responder (see [`platform-contract.md`](platform-contract.md#request-reply)). Nothing here needs a cross-tenant link: GAMOT stays inside one workspace and the proxy and portal are trusted platform parties. The hub enforces who may send what to the `philhealth` platform service (`PlatformMessageRules`, see [`interop-hub.md`](interop-hub.md#platform-services)).

| Type | Sender | Receiver | Payload | Addressing and correlation | Handler status |
|---|---|---|---|---|---|
| `gamot.lookup.requested` | clinic (`PharmacyGamotGateway`) | pharmacy (responder, answers only senders of its own tenant) | `GamotLookupRequestedPayload` (`Method`, `Path`, `Query`, `Body`: the HTTP call it replaces) | From the clinic facility to the tenant's pharmacy facility. Correlation = new GUID per call. | Responder in pharmacy-api, requester in clinic-api (W1 round) |
| `gamot.lookup.responded` | pharmacy (reply) | clinic (`HandleReply`) | `GamotLookupRespondedPayload` (`StatusCode`, `ContentType`, `Body`) | To the requesting clinic. Correlation = the request's. | as above |
| `philhealth.request` | clinic (`PhilHealthProxyClient`) | philhealth proxy (platform service, `{cloud}:philhealth`) | `PhilHealthRequestPayload` (`Operation` from `PhilHealthOperations`, `Argument`, `Body`) | From a facility to `Party.PhilHealth`. The proxy takes tenant and facility from the verified `From`, never from the payload. Correlation = new GUID per call. | Responder in philhealth-proxy, requester in clinic-api |
| `philhealth.response` | philhealth proxy (reply) | the requesting facility (`HandleReply`) | `PhilHealthResponsePayload` (`StatusCode`, `Body` = the endpoint's JSON) | To the requesting facility (an edge facility receives it through its cell-inbox). Correlation = the request's. | as above |
| `philhealth.config.requested` | philhealth proxy | portal (responder, accepts only the proxy) | `PhilHealthConfigRequestedPayload` (`TenantId`, `BranchId`) | `Party.PhilHealth` to `Party.Portal`. | Responder in portal-api, requester in the proxy |
| `philhealth.config.responded` | portal (reply) | philhealth proxy (`HandleReply`) | `PhilHealthConfigRespondedPayload` (`Found`, `Config` with the credentials) | `Party.Portal` to `Party.PhilHealth`. The only message that carries PhilHealth secrets; the hub lets only the portal send it, only to the proxy. | as above |
| `philhealth.config.upsert.requested` | philhealth proxy (on `tenant.configure`) | portal (responder, accepts only the proxy) | `PhilHealthConfigPayload` | `Party.PhilHealth` to `Party.Portal`. | as above |
| `philhealth.config.upsert.responded` | portal (reply) | philhealth proxy (`HandleReply`) | `PhilHealthConfigUpsertRespondedPayload` (`Succeeded`, `Message`) | `Party.Portal` to `Party.PhilHealth`. | as above |
## Envelope signing

Every envelope any service sends is signed with that client's ECDSA P-256 key (`Messaging:SigningKey`); the hub and the receiving service both verify. Design and key handling: [`interop-hub.md`](interop-hub.md#envelope-signing).

| Question | Answer |
|---|---|
| What is signed | Format `clinicez-envelope-v1`: a length-prefixed canonical text of message id, correlation id, type, schema version, `From`, `To` (or `SignedTo` when the hub rewrote a claim's recipient), sent and expiry timestamps, `SignerKeyId`, the SHA-256 of the canonical payload JSON (properties sorted, minimal whitespace) and the SHA-256 of `SealedPayload`. The signature field itself is excluded. |
| Who signs | The SDK relay of the sending service, before the envelope leaves its outbox. `SignerKeyId` is the sender's hub client id. An edge hub re-signs forwarded envelopes as its own upstream client. |
| Who verifies | (1) The hub, on `POST /v1/messages` and `POST /v1/claims`: `SignerKeyId` must equal the authenticated client and the signature must match the key registered for it. (2) The receiving service's SDK poller, with the sender's public key from `GET /v1/keys/{clientId}` (cached 5 minutes): an envelope that fails is nacked and never reaches a handler (`Messaging:VerifyInbound`, default on outside Development). |
| `signature_required` | The envelope carries no signature, or the client has no registered key, while `Hub:Signing:Required` is on (default outside Development). A rejected message is final; a claim answers `403` with this reason. |
| `invalid_signature` | A signature is present but does not verify (altered envelope, wrong key, `SignerKeyId` of another client). The hub rejects it (final, never queued); a receiver nacks it (`invalid_signature: ...`), so it is redelivered and finally dead-lettered but never dispatched to a handler. |
| Not covered | The hub vouches for which public key belongs to which client (a compromised hub could publish another key), and `SealedPayload` (end-to-end sealing) is reserved and unused. Directory feed messages (`directory.*`) are signed by the portal like any other envelope. |

## Payload records

All payloads live in [`packages/shared-dotnet`](../../packages/shared-dotnet).

| Payload | File |
|---|---|
| `FacilityCreatedEvent`, `FacilityProvisionedEvent`, `WorkspaceProfileUpdatedEvent`, `AppointmentBookedEvent`, `ClinicRecordVerifiedEvent` | [`Common/`](../../packages/shared-dotnet/Common) |
| `WorkspaceProfile` (the `Profile` inside `WorkspaceProfileUpdatedEvent`) | [`Workspace/WorkspaceProfileProvider.cs`](../../packages/shared-dotnet/Workspace/WorkspaceProfileProvider.cs) |
| `EntitlementsChangedEvent`, `FacilityHeartbeatPayload` | [`Interoperability/EntitlementContracts.cs`](../../packages/shared-dotnet/Interoperability/EntitlementContracts.cs) |
| `PatientShareRedeemPayload`, `PatientShareSnapshotPayload`, `PatientDocumentIssuedPayload`, `LabOrderStatusChangedPayload`, `LabResultReviewedPayload`, `RxStatusChangedPayload`, `MedicalCertificateIssuedPayload`, `BillingInvoiceRequestedPayload`, `BillingPaymentConfirmedPayload`, `BillingInvoicePaidPayload` | [`Interoperability/ClinicalWorkflowContracts.cs`](../../packages/shared-dotnet/Interoperability/ClinicalWorkflowContracts.cs) |
| `BillingInvoiceVoidedPayload` | [`Interoperability/BillingVoidContracts.cs`](../../packages/shared-dotnet/Interoperability/BillingVoidContracts.cs) |
| `NotificationEmailRequestedPayload` | [`Interoperability/NotificationContracts.cs`](../../packages/shared-dotnet/Interoperability/NotificationContracts.cs) |
| `GamotLookupRequestedPayload`, `GamotLookupRespondedPayload`, `PhilHealthRequestPayload`, `PhilHealthResponsePayload`, `PhilHealthConfigPayload`, `PhilHealthConfigRequestedPayload`, `PhilHealthConfigRespondedPayload`, `PhilHealthConfigUpsertRespondedPayload`, `PhilHealthOperations` | [`Interoperability/PlatformServiceContracts.cs`](../../packages/shared-dotnet/Interoperability/PlatformServiceContracts.cs) |
| `ClinicAppointmentUpdatedEvent`, `PatientRecordSharedPayload`, `LabRequisitionIssuedEvent`, `DiagnosticReportFinalizedEvent`, `LabPanicResultAlertEvent`, `ExternalLabResultUploadedEvent`, `PrescriptionIssuedEvent`, `PrescriptionDispensedEvent`, `ExternalPrescriptionDispensedEvent` | one file per record in [`Interoperability/`](../../packages/shared-dotnet/Interoperability) |
| `DirectoryCellUpsertedPayload`, `DirectoryFacilityUpsertedPayload`, `DirectoryLinkUpsertedPayload` | [`Interop/Contracts/DirectoryContracts.cs`](../../packages/shared-dotnet/Interop/Contracts/DirectoryContracts.cs) |
| `PatientJoinRequestedPayload` | [`Interop/Contracts/PatientJoinContracts.cs`](../../packages/shared-dotnet/Interop/Contracts/PatientJoinContracts.cs) |

## Gaps found

1. **`notification.email.requested` has one producer.** Only portal-api requests mail (to itself). Facility services have no way to send an email request yet.
2. **billing-api does not handle provisioning messages yet.** The portal already sends `facility.license.issued` and `entitlements.changed` to each facility's `billing` service, but billing-api registers neither handler nor the heartbeat, so a cell's billing service is not yet license-gated and does not report liveness.
3. **Request/reply replies are matched in memory.** The service that asked must read its mailbox from a single instance, or a reply is dropped by the instance that did not ask and the caller times out. Run one replica per service mailbox (true of every compose file in `deploy/`).
