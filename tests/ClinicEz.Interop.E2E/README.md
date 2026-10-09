# ClinicEz.Interop.E2E

Cross-service contract tests. Every message travels through the **real interop hub** (its endpoints, validation, link and
visibility rules, mailboxes and claims); every service is hosted **in-process from its real composition root** (its own DI
extensions, handler registry, relay and poller, EF model on the EF in-memory provider; the hub runs on a throw-away SQLite
file). The tests drive a user-level
action in one service and assert the business effect in the databases of the others.

## What is hosted

| Service | Hosted | Notes |
|---|---|---|
| hub | yes (`HubFixture`) | real hub app on an in-memory server; services reach it over HTTP via the SDK client |
| clinic-api | yes (`ClinicHost`) | multi-clinic per server, resolved from the envelope `To` |
| laboratory-api | yes (`LabHost`) | |
| pharmacy-api | yes (`PharmacyHost`) | |
| billing-api | yes (`BillingServiceHost`) | cashier flows (`OpenShiftAsync`, `PayAsync`, `VoidAsync`, `RefundAsync`) |
| patient-api | yes, partially (`PatientHost`) | `AddPatientInterop` + repositories; its real infrastructure (Redis, Postgres, Clerk) cannot run in-process |
| portal-api | **no** | its messages are sent through the hub client (`TestCell.ProvisionAsync`, directory upserts) |
| organization | **no** | |

## How a test runs

`TestCell` owns the hub and one host of each service. The relay and the inbox poller are never started as hosted services;
`TestCell.PumpAsync()` calls `RunOnceAsync` on every service's relay and poller until a full round moves nothing, so a whole
multi-hop exchange is deterministic and finishes inside one `await`. It throws if the cell never settles (a ping-pong).
`ProvisionAsync(Fac)` does what portal-api does for a new facility: registers it in the hub directory and issues its license.
`ServiceHostBase.AssertNothingStuckAsync()` checks that nothing a service queued was left undelivered or dead-lettered.

Test data is created through each service's own commands/services wherever possible; `*Seed` helpers only create reference data
(clinic patients and doctors, lab prices, pharmacy stock, patient accounts).

## Flows covered

| | Flow | File |
|---|---|---|
| A | Lab order: clinic -> lab -> cashier -> work -> result, same tenant and cross-tenant, with patient mirror | `LabOrderFlowTests` |
| B | Lab claim of an order by another lab | `LabClaimFlowTests` |
| C | Prescription: clinic -> pharmacy -> quote -> cashier -> dispense -> clinic and patient | `PrescriptionFlowTests` |
| D | Cross-tenant denial (private facility, no link, wrong scope) and a positive control | `CrossTenantDenialTests` |
| E | Patient share / record share / snapshot redeem | `PatientShareFlowTests` |
| F | Billing corrections: void and refund propagate to the lab and clinic, and to the pharmacy | `BillingCorrectionFlowTests`, `PharmacyBillingCorrectionFlowTests` |
| - | Envelope signing: a tampered, re-addressed, unsigned or wrongly signed envelope is refused by the hub; a message changed in the mailbox is rejected by the receiver | `EnvelopeSigningTests` |
| G | Idempotency: redelivered and replayed messages change nothing twice | `IdempotencyTests` |
| H | Two tenants with identical order and accession numbers never cross | `TenantIsolationTests` |
| - | Message matrix vs. real handler registries | `MessageCoverageTests` |
| - | Provisioning smoke | `ProvisioningSmokeTests` |

The message matrix is documented in `docs/architecture/message-matrix.md`; `MessageCoverageTests` keeps it honest.

## Not covered

* patient-api's real infrastructure and HTTP controllers (Clerk auth, Redis, Postgres); only its interop handlers run.
* No service's HTTP controller/auth pipeline is exercised; the tests call application commands and services.
* portal-api and organization handlers (`facility.provisioned`, heartbeats, `billing.invoice.paid`, notification mail).
* Real PostgreSQL behaviour (the tests use an in-memory/relational test provider).

## Run

```powershell
dotnet test tests/ClinicEz.Interop.E2E
```
