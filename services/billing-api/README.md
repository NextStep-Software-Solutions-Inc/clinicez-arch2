# billing-api — per-cell cashiering service

`billing-api` is the **cashier** for one cell (decision D5): one instance runs per cell, next to that cell's local interop hub. Clinics, laboratories and pharmacies of the cell *request* invoices over the interop hub; patients pay **once, at one counter**, for everything a visit generated; billing tells every facility (and the portal) the outcome.

It never talks to the facilities directly and holds no PHI beyond what a printed receipt needs (patient name, invoice lines).

| | |
|---|---|
| Stack | .NET 10, EF Core + PostgreSQL, `ClinicEz.Shared` interop SDK (no message broker) |
| Database | `CLINICEZ_BILLING_DB`, schema `billing` (`DbSchema`) |
| Dev port | **5310** (`http://localhost:5310`, Scalar UI at `/scalar` in Development) |
| Interop service name | `billing` (`Messaging:Service`) |
| Dev hub | `http://localhost:5290`, credentials `dev-billing` / `dev-billing-secret` (Development only) |
| UI | [`apps/cashier-app`](../../apps/cashier-app) (Expo, web-first) |

Other ports in use locally: 5000, 5154, 5200, 5232, 5245, 5290.

## Layout

```
ClinicEz.Billing.Domain          Invoice aggregate, Money, payments/allocations/receipts/refunds, shifts, permissions
ClinicEz.Billing.Application     Use-case services, DTOs, the invoice-requested handler
ClinicEz.Billing.Infrastructure  EF Core model + migrations, cashier auth, DI (AddInterop)
ClinicEz.Billing.Api             Controllers, Program.cs
ClinicEz.Billing.Tests           xUnit (domain, handler, payments, isolation, reports, HTTP)
```

## Run

```powershell
dotnet run --project services/billing-api/ClinicEz.Billing.Api    # Development: migrates the database on start
dotnet test services/billing-api/ClinicEz.Billing.Tests
```

Needs a PostgreSQL connection string (`ConnectionStrings:DefaultConnection`, see `appsettings.Development.json`) and, for messaging, the cell hub. A new migration after a model change:

```powershell
$env:ConnectionStrings__DefaultConnection = "Host=localhost;Database=dummy;Username=dummy;Password=dummy"
dotnet ef migrations add <Name> --project services/billing-api/ClinicEz.Billing.Infrastructure --startup-project services/billing-api/ClinicEz.Billing.Api --output-dir Persistence/Migrations
```

Deployment: `Dockerfile`, [`deploy/billing-api`](../../deploy/billing-api) (compose + `.env.example`) and `.github/workflows/deploy-billing-api-dev.yml`. Set `Messaging__HubUrl/ClientId/ClientSecret` to the cell hub and the credentials it issued to service `billing`.

## Authentication (cell-local, works offline)

Billing has its **own staff store** (`BillingStaff`), audience `clinicez-billing` and signing key, so a clinic or laboratory token is never accepted here and no internet or identity provider is needed.

* `POST /api/v1/auth/login` `{ tenantId, facilityId, email, password }` — `facilityId` is the **counter** the cashier works at. Five bad passwords lock the account (429). The login is rate limited.
* The JWT carries `sub`, `tenant_id`, `facility_id`, `ver`. Role, name and permissions are re-read from the database (cached 60 s) on every request; deactivating a user bumps their token version and ends their sessions at once. No refresh tokens: a session lasts a shift (`Jwt:AccessTokenMinutes`, default 600).
* Roles: **Cashier** (read invoices, create walk-in invoices, statutory discounts, take payments, shifts), **Supervisor** (+ promo discounts, void, refund, reports, audit), **Admin** (+ staff management).
* `X-Facility-Id` that differs from the token's facility is a 403; `X-Tenant-Id`/permission headers are ignored for signed-in staff.
* **CORS** is closed by default. `Cors:AllowAnyOrigin=true` exists only in `appsettings.Development.json`; outside Development the service refuses to start with it, and also without `Facility:BaseDomain` (`BASE_DOMAIN`) or `Cors:AllowedOrigins` (`CORS_ALLOWED_ORIGINS`). `Messaging:SigningKey` is likewise required outside Development.
* Every non-public action declares its permission (`[HasPermission]`, enforced by a reflection test).

## Endpoints (`/api/v1`, `ApiResponse<T>`)

| | |
|---|---|
| `POST auth/login` (anonymous), `GET auth/me` | sign in / current user |
| `GET staff`, `POST staff`, `POST staff/{id}/deactivate` | `staff:manage` |
| `GET invoices`, `GET invoices/{id}`, `POST invoices` (walk-in) | `invoices:read` / `invoices:create` |
| `POST invoices/{id}/discounts` | `discounts:apply` (promo/other need a supervisor) |
| `POST invoices/{id}/void`, `POST invoices/{id}/refund` | `billing:approve` |
| `GET visit-bills?search=&visitKey=&branchId=&facilityId=` | find a visit's consolidated bill |
| `GET visit-bills/{anchorInvoiceId}`, `POST visit-bills/{anchorInvoiceId}/discounts` | one bill across the cell's facilities |
| `POST payments` (`Idempotency-Key` header), `GET payments/{id}`, `GET payments/{id}/receipt`, `GET receipts/{id}` | `payments:take` / `invoices:read` |
| `GET shifts`, `GET shifts/current`, `POST shifts/open`, `POST shifts/{id}/close` | `shifts:manage` |
| `GET reports/daily-collection`, `GET audit` | `reports:read` |
| `GET /health` | anonymous |

### Consolidated visit bill

Invoices of the same **tenant + patient + `VisitKey`** (same branch) form one *visit bill*, addressed by its oldest ("anchor") invoice. A payment is applied oldest-first, or to an explicit `allocations` list within the group. Two tenants using the same `VisitKey` never merge. Receipts and invoice numbers are numbered per (tenant, counter).

### Payments

* `Idempotency-Key` makes a retry return the original payment (`200`, `isReplay: true`); the same key with a different body is a `409`.
* Partial payments are allowed; each allocated invoice moves `Open → PartiallyPaid → Paid`.
* Cash needs an open shift for the cashier; `tendered` produces `change`. Insurance (PhilHealth/HMO) is recorded as *external*: reported apart and never counted in the drawer.
* Discounts: senior citizen / PWD are a fixed 20 % and need the ID number; promo/other need supervisor approval and a reason. Discounts only apply while no money is held on an invoice (paid, net of refunds). A visit-wide fixed discount is split in proportion to the invoice totals (`Money.Distribute`, left-over cents on the last invoice).
* Voids apply to unpaid invoices, refunds to paid ones (full refunds only). Both need a reason and are written to the append-only audit trail.
* Money is `decimal` with two places; percentages round half-up (away from zero) per invoice.
* Enums are strings everywhere: stored as their C# name (`varchar(32)`, by model convention), sent and read as names in JSON bodies and in query strings (`?status=Paid`). A number (`?status=2`, `"kind": 1`) is rejected with a 400.

## Messages (interop SDK)

All sends go through the transactional outbox in the **same save** as the business change; the inbox gives idempotency (a redelivered request changes nothing). Tenant and facility come from the verified envelope sender, never from the payload.

| Direction | Type | To | Notes |
|---|---|---|---|
| in | `billing.invoice.requested` | — | creates one invoice per `InvoiceRequestId` (replay-safe; a zero-total invoice is settled on arrival). A re-send replaces the lines of an unpaid invoice. A re-send for a **Void** or **Refunded** invoice **reopens** that same invoice (see below); one that is part-paid or **Paid** is ignored |
| out | `billing.payment.confirmed` | the requesting facility | one per allocated invoice, including partial payments (`FullyPaid=false`); not sent for walk-in invoices |
| out | `billing.invoice.paid` | `Party.Portal` | when an invoice becomes fully paid; **no PHI** (amounts, facility, method mix only) |
| out | `billing.invoice.voided` | the requesting facility (+ portal if it had been fully paid) | payload `BillingInvoiceVoidedPayload` (`Kind` = void or refund) |

Addressing: `From = Party.ForFacility(tenant, facility, type, "billing")`, `To = Party.ForFacility(tenant, facility, type)`, `CorrelationId = InvoiceRequestId`.

### Reopening a voided or refunded invoice

When the facility re-sends `billing.invoice.requested` for an `InvoiceRequestId` whose invoice (same tenant + facility, requested origin) is **Void** or **Refunded**, the same invoice is brought back to **Open**:

* Same invoice id and number; lines, details and totals are replaced by the new request, and discounts of the old charge are dropped.
* Earlier payments, allocations, receipts and refunds stay on record. The balance is the new total less the money still held (`PaidTotal − RefundedTotal`), which is zero after a full refund, so the whole new total is owed.
* Audited as `invoice.reopened` (previous status, previous total, refunded total, previous reason).
* No `billing.payment.confirmed` is sent until it is paid again (except a zero-total reopen, which settles on arrival like any free invoice). Each later payment confirms as usual, the final one with `FullyPaid=true`.
* A **Paid** or part-paid invoice is never changed by a re-send. Another tenant's or facility's request never matches the invoice.
* The portal keeps the earlier `billing.invoice.voided` and receives `billing.invoice.paid` again once the reopened invoice is fully paid, so its rollup stays consistent. No new message type is involved.

## Reports

`GET reports/daily-collection?from=&to=&utcOffsetMinutes=480&currency=PHP[&facilityId&branchId&cashierUserId]` — per local day and by method, cashier, branch and facility; external settlements and refunds are shown separately (`net = collected − refunded`). At most 366 days.

## Known limits / deferred

* No refresh tokens or self-service password change (admins reset by creating a new account; sessions end with the shift).
* One cell only: no cross-cell consolidation of a visit.
* Reports aggregate in memory over the (bounded, tenant-scoped) window.
* Full refunds only; partial refunds and per-payment reversal are not modelled.
* The cash drawer is counted per shift, not per denomination.
