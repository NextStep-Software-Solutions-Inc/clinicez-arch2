# Message matrix

Every envelope type in [`InteropTypes`](../../packages/shared-dotnet/Interop/InteropTypes.cs), who sends it, who handles it, and how it is addressed. Built by reading the code (publishers: `Enqueue(...)` / `InteropEnvelope.Create(...)`; receivers: `.Handle<TPayload, THandler>(InteropTypes.X)` in each service's `DependencyInjection.cs`). The prose catalog of what each message means lives in [`platform-contract.md`](platform-contract.md); routing and delivery rules are in [`interop-hub.md`](interop-hub.md).

Conventions:

- Services are mailbox names: `clinic`, `laboratory`, `pharmacy`, `organization`, `patient`, `portal`, `billing`. "Facility" means the clinic, laboratory, pharmacy or organization service.
- **Correlation** is the `CorrelationId` the sender puts on the envelope. A reply uses the correlation of the message it answers; the hub opens a conversation on the first message (and on a claim) and only lets the other side answer on it (see the cross-tenant rules in [`interop-hub.md`](interop-hub.md)).
- **Cross-tenant scope**: when sender and receiver belong to different workspaces the hub needs an Active link whose scope covers the type, or a reply on an open conversation. The scope is derived from the type string in [`HubContracts.cs`](../../services/interop-hub/ClinicEz.Interop.Application/HubContracts.cs): `lab.order.*` = `LabOrder`, `rx.*` = `Prescription`, `*referral*` = `Referral`, `lab.result.*` = `Result`; every other type has no scope, so it can only cross tenants as a reply. Control-plane (`portal`) and patient-plane (`patient`) senders are not subject to links.
- **Handler status** `OK` means every intended receiver registers a handler. Anything else is called out, because the hub redelivers an unhandled message and finally dead-letters it.

## Provisioning and control plane

| Type | Sender | Receiver | Payload | Addressing and correlation | Handler status |
|---|---|---|---|---|---|
| `facility.license.issued` | portal (`FacilityProvisioningPublisher`) | clinic, laboratory, pharmacy, organization (the new facility) | `FacilityCreatedEvent` | To the facility's mailbox. Correlation = facility id (`ResourceId`). | OK. billing-api registers no handler (it has no license). |
| `facility.provisioned` | clinic, laboratory, pharmacy, organization (their license-issued handler, same transaction) | portal (`FacilityProvisionedHandler`) | `FacilityProvisionedEvent` | To `Party.Portal`. Correlation = that of the license message (facility id). | OK |
| `facility.directory.updated` | portal (`FacilityProvisioningPublisher`) | patient (`FacilityDirectoryUpdatedInteropHandler`) | `FacilityCreatedEvent` with `LicenseToken` and `Limits` removed | To the control-plane `patient` mailbox. Correlation = facility id. | OK |
| `workspace.profile.updated` | portal (`WorkspaceProfilePublisher`) | clinic only (`WorkspaceProfileUpdatedHandler`) | `WorkspaceProfileUpdatedEvent` | One message per routable clinic of the workspace. Correlation = tenant id. | OK for clinics. Laboratory, pharmacy and organization are deliberately not sent it (they would have no handler) and refresh the profile by polling the portal. |
| `entitlements.changed` | portal (`EntitlementsPublisher`) | every routable facility (clinic, laboratory, pharmacy, organization) via `AddFacilityEntitlements` | `EntitlementsChangedEvent` (re-minted license token and limits) | One message per facility. Correlation = facility id. | OK. billing-api does not register it. |
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
| `patient.document.issued` | clinic (`PatientDocumentPublisher`), laboratory (`DiagnosticReportPublisher`, results), pharmacy (`PrescriptionDispensedPublisher`, dispense receipts) | patient (`PatientDocumentIssuedInteropHandler`) | `PatientDocumentIssuedPayload` (`Kind`, issuer, `Body`) | To the patient's mailbox, only when the patient has a patient-app account. Correlation = document id (clinic), requisition id (laboratory), order correlation id (pharmacy). | OK. No producer yet for `MedicalCertificate` documents (see `medcert.issued`). |

## Laboratory

| Type | Sender | Receiver | Payload | Addressing and correlation | Handler status |
|---|---|---|---|---|---|
| `lab.order.issued` | clinic (`LabRequisitionPublisher`, direct; `ClaimSlipService`, through a claim slip addressed by facility type only) | laboratory (`LabOrderIssuedHandler`) | `LabRequisitionIssuedEvent` | Direct: to the chosen laboratory (same tenant, linked tenant with `LabOrder` scope, or the clinic's own). Claim: whichever laboratory redeems the slip. Correlation = requisition id. | OK |
| `lab.order.status.changed` | laboratory (`LabOrderLifecycle`) | clinic (`LabOrderStatusChangedHandler`) and patient (`LabOrderStatusChangedInteropHandler`, only if the patient has an account) | `LabOrderStatusChangedPayload` | One message to the ordering clinic and one to the patient. Correlation = the clinic's requisition id. Carries the stage, quote, `PaymentRequired` and reason. | OK |
| `lab.result.finalized` | laboratory (`DiagnosticReportPublisher`) | clinic (`DiagnosticReportFinalizedHandler`) | `DiagnosticReportFinalizedEvent` | To the ordering clinic. Correlation = requisition id. Cross-tenant: a reply on the order's conversation, or a link with `Result` scope. | OK |
| `lab.result.panic` | laboratory (`PanicAlertPublisher`) | clinic (`LabPanicResultAlertHandler`) | `LabPanicResultAlertEvent` | To the ordering clinic. Correlation = requisition id. | OK |
| `lab.result.external.submitted` | patient (`UploadLabResultCommand`), portal (`LabUploadRelay`, public upload page) | clinic (`LabResultExternalSubmittedHandler`) | `ExternalLabResultUploadedEvent` | To the ordering clinic. Correlation = requisition id from the patient, a new upload id from the portal. | OK |
| `lab.result.reviewed` | clinic (`LabResultReviewedPublisher`) | patient (`LabResultReviewedInteropHandler`) and the laboratory the order went to | `LabResultReviewedPayload` | One message to the patient (if they have an account) and one to the laboratory. Correlation = order id. | laboratory-api `LabResultReviewedHandler` records the doctor verdict on the requisition (only from the ordering clinic; idempotent). |
| `lab.order.claimed` | (no producer) | (no handler) | none defined | Intended: the redeemer tells the issuer it took a claimed order. Correlation = requisition id. | Reserved. The hub accepts it as a reply on a claim conversation (hub tests). |
| `lab.order.accepted` | (no producer) | (no handler) | none defined | Intended reply on the order's conversation. | Reserved. The laboratory reports acceptance with `lab.order.status.changed`. |
| `lab.order.rejected` | (no producer) | (no handler) | none defined | As above. | Reserved. Rejection travels as a `lab.order.status.changed` stage. |
| `lab.order.payment.confirmed` | (no producer) | (no handler) | none defined | Intended payment gate message. | Reserved. The payment gate follows `billing.payment.confirmed`. |

## Pharmacy

| Type | Sender | Receiver | Payload | Addressing and correlation | Handler status |
|---|---|---|---|---|---|
| `rx.issued` | clinic (`PrescriptionPublisher`, direct; `ClaimSlipService`, through a claim slip) | pharmacy (`PrescriptionIssuedHandler`) | `PrescriptionIssuedEvent` | Direct: to the chosen pharmacy. Claim: whichever pharmacy redeems the slip. Correlation = prescription id. | OK |
| `rx.status.changed` | pharmacy (`RxStatusPublisher`) | clinic (`RxStatusChangedHandler`) and patient (`RxStatusChangedInteropHandler`, only with an account) | `RxStatusChangedPayload` | One message to the ordering clinic and one to the patient. Correlation = the order's correlation id. | OK |
| `rx.dispensed` | pharmacy (`PrescriptionDispensedPublisher`) | clinic (`PrescriptionDispensedHandler`) | `PrescriptionDispensedEvent` | To the ordering clinic. Correlation = the order's correlation id, else its external prescription id. | OK |
| `rx.external.dispensed` | patient (`MarkPrescriptionExternallyDispensedCommand`) | clinic (`ExternalPrescriptionDispensedHandler`) | `ExternalPrescriptionDispensedEvent` | Patient to the ordering clinic. Correlation = prescription id. | OK |

## Medical certificate

| Type | Sender | Receiver | Payload | Addressing and correlation | Handler status |
|---|---|---|---|---|---|
| `medcert.issued` | (no producer) | (no handler) | `MedicalCertificateIssuedPayload` (the record exists; certificates are meant to travel as the `Body` of `patient.document.issued`) | Intended: to the patient's mailbox. | Reserved |

## Billing

All billing messages stay inside one cell. The facility asks its own `billing` mailbox, which is why none of them need a cross-tenant link.

| Type | Sender | Receiver | Payload | Addressing and correlation | Handler status |
|---|---|---|---|---|---|
| `billing.invoice.requested` | clinic (`BillingRequestPublisher`), laboratory (`LabOrderBilling`), pharmacy (`PharmacyBillingPublisher`) | billing (`InvoiceRequestedHandler`) | `BillingInvoiceRequestedPayload` | To the same facility's `billing` mailbox. Correlation = `InvoiceRequestId` (lab requisition id, pharmacy order id, clinic request id). | OK |
| `billing.payment.confirmed` | billing (`BillingMessages.PaymentConfirmed`, on every payment, partial ones included) | clinic, laboratory, pharmacy (`BillingPaymentConfirmedHandler`; accepted only from their own `billing` mailbox) | `BillingPaymentConfirmedPayload` | To the requesting facility, for invoices that came from a request. Correlation = `InvoiceRequestId`. | OK |
| `billing.invoice.paid` | billing (`BillingMessages.InvoicePaid`, when an invoice becomes fully paid; skipped for a zero total) | portal (`BillingInvoicePaidHandler`) | `BillingInvoicePaidPayload` (no patient data) | To `Party.Portal`. Correlation = invoice id. | OK |
| `billing.invoice.voided` | billing (`BillingMessages`, void of an unpaid invoice or refund of a paid one) | the requesting clinic, laboratory or pharmacy (`BillingInvoiceVoidedHandler`), and portal | `BillingInvoiceVoidedPayload` | To the facility for invoices that came from a request (correlation = `InvoiceRequestId`), and to `Party.Portal` for a refunded paid invoice (correlation = invoice id). | OK |

## Payload records

All payloads live in [`packages/shared-dotnet`](../../packages/shared-dotnet).

| Payload | File |
|---|---|
| `FacilityCreatedEvent`, `FacilityProvisionedEvent`, `WorkspaceProfileUpdatedEvent`, `AppointmentBookedEvent`, `ClinicRecordVerifiedEvent` | [`Common/`](../../packages/shared-dotnet/Common) |
| `EntitlementsChangedEvent`, `FacilityHeartbeatPayload` | [`Interoperability/EntitlementContracts.cs`](../../packages/shared-dotnet/Interoperability/EntitlementContracts.cs) |
| `PatientShareRedeemPayload`, `PatientShareSnapshotPayload`, `PatientDocumentIssuedPayload`, `LabOrderStatusChangedPayload`, `LabResultReviewedPayload`, `RxStatusChangedPayload`, `MedicalCertificateIssuedPayload`, `BillingInvoiceRequestedPayload`, `BillingPaymentConfirmedPayload`, `BillingInvoicePaidPayload` | [`Interoperability/ClinicalWorkflowContracts.cs`](../../packages/shared-dotnet/Interoperability/ClinicalWorkflowContracts.cs) |
| `BillingInvoiceVoidedPayload` | [`Interoperability/BillingVoidContracts.cs`](../../packages/shared-dotnet/Interoperability/BillingVoidContracts.cs) |
| `NotificationEmailRequestedPayload` | [`Interoperability/NotificationContracts.cs`](../../packages/shared-dotnet/Interoperability/NotificationContracts.cs) |
| `ClinicAppointmentUpdatedEvent`, `PatientRecordSharedPayload`, `LabRequisitionIssuedEvent`, `DiagnosticReportFinalizedEvent`, `LabPanicResultAlertEvent`, `ExternalLabResultUploadedEvent`, `PrescriptionIssuedEvent`, `PrescriptionDispensedEvent`, `ExternalPrescriptionDispensedEvent` | one file per record in [`Interoperability/`](../../packages/shared-dotnet/Interoperability) |
| `DirectoryCellUpsertedPayload`, `DirectoryFacilityUpsertedPayload`, `DirectoryLinkUpsertedPayload` | [`Interop/Contracts/DirectoryContracts.cs`](../../packages/shared-dotnet/Interop/Contracts/DirectoryContracts.cs) |

## Gaps found

1. **Reserved types without producer or handler:** `lab.order.claimed`, `lab.order.accepted`, `lab.order.rejected`, `lab.order.payment.confirmed`, `medcert.issued`. The laboratory lifecycle, including acceptance and rejection, already travels as `lab.order.status.changed`. Remove the constants or implement them before a service starts sending them; until then the hub still lets them through as replies.
2. **`notification.email.requested` has one producer.** Only portal-api requests mail (to itself). Facility services have no way to send an email request yet.
3. **billing-api does not take part in provisioning messages.** It registers neither `facility.license.issued`, `entitlements.changed` nor the heartbeat, so a cell's billing service is not license-gated and does not report liveness.
4. **`workspace.profile.updated` reaches clinics only.** Laboratory, pharmacy and organization pick up profile changes by polling the portal (cached for `WorkspaceProfile:CacheSeconds`, default 300).
