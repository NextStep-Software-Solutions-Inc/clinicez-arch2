# Platform contract for facility-type services

This is what a new facility-type service (imaging, dental, ...) has to implement to join the ClinicEZ platform. It is written from the code as it stands today. Where the code and the target architecture ([hub README](../../services/interop-hub/README.md), architecture plan) differ, the difference is called out as **Gap**.

Related docs: [interop-hub.md](interop-hub.md) · [data-ownership.md](data-ownership.md) · [billing.md](billing.md)

A facility service is one deployable that is the **system of record for its own operational data** and keeps working without the cloud. It has five obligations:

| # | Obligation | One line |
|---|---|---|
| 1 | [Provisioning from license](#1-provisioning-from-license) | Activate on `facility.license.issued`, verify the signed license, honour its limits and features. |
| 2 | [Local auth](#2-local-auth) | Facility-local JWT with `tenant_id` + a facility claim; no identity provider, no internet. |
| 3 | [Envelope handlers](#3-envelope-handlers-and-the-outboxinbox) | `IInteropHandler<T>`, transactional outbox/inbox through `AddInterop<TDbContext>`, idempotent. |
| 4 | [Directory registration](#4-directory-registration) | The portal registers the facility; the service does nothing but be routable. |
| 5 | [Entitlement keys](#5-entitlement-keys) | Limits and features come from the signed license. |

```mermaid
flowchart LR
  PORTAL["portal-api<br/>(control plane)"] -- "facility.license.issued" --> HUB["interop hub"]
  PORTAL -- "directory.facility.upserted" --> HUB
  HUB -- "{cell}:{service} mailbox" --> SVC["new facility service"]
  SVC -- "facility.provisioned" --> HUB
  HUB --> PORTAL
  SVC <-- "lab.order.* / rx.* / ..." --> HUB
```

---

## 1. Provisioning from license

**Flow.** The portal creates the facility, signs a license (ECDSA, bound to `FacilityId` + `TenantId`) and stages `facility.license.issued` in its outbox in the same `SaveChanges` as the facility row ([FacilityProvisioningPublisher](../../services/portal-api/ClinicEz.Portal.Application/Features/Admin/Services/FacilityProvisioningPublisher.cs)). The message is addressed to `Party.ForFacility(tenantId, facilityId, facilityType)` and carries a [`FacilityCreatedEvent`](../../packages/shared-dotnet/Common/FacilityCreatedEvent.cs) (license token, limits, plan tier, expiry, console URL). A second, license-free copy goes to patient-api as `facility.directory.updated`.

**What the service handler must do** (reference: clinic [FacilityCreatedHandler](../../services/clinic-api/ClinicEz.Clinic.Infrastructure/Messaging/Handlers/FacilityCreatedHandler.cs), lab [FacilityLicenseIssuedHandler](../../services/laboratory-api/ClinicEz.Laboratory.Application/Interop/FacilityLicenseIssuedHandler.cs)):

1. Ignore the message unless `message.FacilityType` is your type (the same handler type is registered by clinic, lab, pharmacy and organization, so each filters).
2. Accept it only from the control plane: `context.From.Kind == PartyKind.ControlPlane`.
3. Accept it only when addressed to *this* facility: `To.Kind == Facility`, `To.FacilityId == message.ResourceId`, `To.TenantId == message.TenantId`.
4. Upsert the local settings row (license token, plan tier, limits, expiry, names). Provisioning is an upsert, so redelivery changes nothing.
5. Enqueue `facility.provisioned` (`FacilityProvisionedEvent`, `To = Party.Portal`, `CorrelationId = context.CorrelationId`) **before** the `SaveChanges` that persists the settings. The portal marks the facility provisioned when it arrives.

**License verification.** Register `IFacilityLicenseValidator` as a singleton ([FacilityLicenseValidator](../../packages/shared-dotnet/Licensing/FacilityLicenseValidator.cs)). `Validate(token, expectedFacilityId, expectedTenantId)` checks, in order: format `payload.signature` (Base64Url), ECDSA-P256/SHA-256 signature against the authority public key (`FacilityLicense:PublicKeyPem` config, else `FACILITY_LICENSE_PUBLIC_KEY`; PEM or base64 of PEM; **there is no compiled-in key**, a missing key fails the host at startup outside Development; `FacilityLicense:PreviousPublicKeyPem` / `FACILITY_LICENSE_PUBLIC_KEY_PREVIOUS` is accepted next to it while the authority key is rotated), facility binding, tenant binding (id or slug), expiry. Results: `Success`, `Expired` (payload still returned; the validator message says "Grace Read-Only mode"), `Tampered`, `Missing`.

| Item | Today |
|---|---|
| License payload | [`FacilityLicensePayload`](../../packages/shared-dotnet/Licensing/FacilityLicensePayload.cs): `LicenseId`, `FacilityId`, `TenantId`, `TenantSlug`, `FacilityName`, `FacilityType` (string), `OwnerEmail/Name`, `PlanTier`, `Limits`, `EnabledFeatures`, `IssuedAtUtc`, `ExpiresAtUtc`, `Issuer`. |
| Offline | Verification needs only the public key. A service must not call the cloud to validate. |
| Expiry | Staff creation/activation is refused when expired (clinic [CreateStaffMemberCommand](../../services/clinic-api/ClinicEz.Clinic.Application/Features/Staff/Commands/CreateStaffMemberCommand.cs)); reported as `Expired` by the license endpoints. **Gap:** the planned workspace-status field, entitlement version, renewal heartbeat and N-day read-only grace are not in the payload or the code. |
| Revocation | There is no revocation list. A suspended facility is removed from the hub directory (it stops receiving messages) but its already-issued license keeps validating offline until it expires. |

---

## 2. Local auth

Shared library: [`AddFacilityLocalAuth(configuration, audience)`](../../packages/shared-dotnet/LocalAuth/FacilityLocalAuthExtensions.cs).

- HMAC-SHA256 JWT bearer validated locally (issuer/audience/lifetime/signing key), no identity provider. Pick a **distinct `audience` per service** so a token from one service is rejected by another.
- A second scheme (`Internal`, service key) for trusted service-to-service calls, and a **fallback policy that requires an authenticated user**: only `[AllowAnonymous]` endpoints are public.
- Token claims, as the existing services define them (`*ClaimTypes.cs`):

| Claim | clinic | laboratory | pharmacy |
|---|---|---|---|
| tenant | `tenant_id` | `tenant_id` | `tenant_id` |
| facility | `clinic_id` | `laboratory_id` | `pharmacy_id` |
| other | `sub`, `branch_id`, `permission`, `ver`, `role_id`, `staff_role`, `name` | `sub`, `permission`, `ver`, `staff_role`, `name` | `sub`, `permission`, `ver`, `staff_role`, `name` |

  **Gap:** the plan standardises on `tenant_id` + `facility_id` and `X-Facility-Id`/`X-Tenant-Id` everywhere. Today the tenant claim is uniform but the facility claim is per service (`clinic_id`, `laboratory_id`, `pharmacy_id`). A new service should follow the existing pattern (`tenant_id` + `<type>_id`) until the claim is unified.
- **Headers are hints, never authority.** For an authenticated staff token, tenant and facility come only from the claims. `X-Facility-Id`, if sent, must equal the token's facility or the request gets `403` ([LabScopeMiddleware](../../services/laboratory-api/ClinicEz.Laboratory.Infrastructure/Auth/LabScopeMiddleware.cs)). `X-Tenant-Id` is honoured only for the `Internal` scheme and for anonymous workspace resolution ([LabContext](../../services/laboratory-api/ClinicEz.Laboratory.Infrastructure/Context/LabContext.cs)).
- **No HTTP context = system scope** (interop handlers, Hangfire). Handlers therefore have to scope by the envelope explicitly (see below); EF query filters do not protect them.
- License-derived: the facility id, tenant and limits the service trusts are the ones in the validated license, not what a caller sends. Bootstrap of the first administrator can use the signed `OwnerEmail`/`OwnerName`.

---

## 3. Envelope handlers and the outbox/inbox

All cross-service and cross-facility traffic is an [`InteropEnvelope`](../../packages/shared-dotnet/Interop/InteropEnvelope.cs) relayed by the hub. There is no broker and no direct HTTP between services (see [interop-hub.md](interop-hub.md)).

### Wire up

```csharp
// Infrastructure/DependencyInjection.cs
services.AddInterop<ApplicationDbContext>(configuration, handlers => handlers
    .Handle<FacilityCreatedEvent, FacilityLicenseIssuedHandler>(InteropTypes.FacilityLicenseIssued)
    .Handle<LabRequisitionIssuedEvent, LabOrderIssuedHandler>(InteropTypes.LabOrderIssued));

// Persistence/ApplicationDbContext.cs
public class ApplicationDbContext : DbContext, IInteropDbContext
{
    public DbSet<InteropOutboxMessage> InteropOutbox => Set<InteropOutboxMessage>();
    public DbSet<InteropInboxMessage>  InteropInbox  => Set<InteropInboxMessage>();
    protected override void OnModelCreating(ModelBuilder b) { /* ... */ b.ApplyInteropModel(); }
}
```

`AddInterop` ([source](../../packages/shared-dotnet/Interop/InteropServiceCollectionExtensions.cs)) binds and validates the `Messaging` section at host start, registers the handler registry, `IInteropPublisher`, `InteropDispatcher`, the hub client, and two hosted services: the **relay** (outbox to hub) and the **inbox poller** (hub mailbox to handlers). Add an EF migration for the `interop_outbox` and `interop_inbox` tables.

### `Messaging` configuration

Bound from section `Messaging` ([InteropOptions](../../packages/shared-dotnet/Interop/InteropOptions.cs)). There are **no default credentials**; start-up fails if a required value is missing.

| Key | Env var form | Default | Notes |
|---|---|---|---|
| `Messaging:Transport` | `Messaging__Transport` | `Hub` | `Hub` or `InProcess` (tests only). |
| `Messaging:HubUrl` | `Messaging__HubUrl` | none | The cell's hub: the cloud hub, or the edge cell's local hub. |
| `Messaging:ClientId` | `Messaging__ClientId` | none | Hub client of this service. |
| `Messaging:ClientSecret` | `Messaging__ClientSecret` | none | Shown once at creation; rotate through the portal. |
| `Messaging:SigningKey` | `Messaging__SigningKey` | none | The client's ECDSA P-256 **private** key (PEM or base64 of PEM) used to sign every outgoing envelope. **Required for `Hub` transport outside Development** (startup fails without it); the hub admin API returns it once with the secret, or generate one with `scripts/generate-signing-key.(sh\|ps1)` and register the public half. See [Envelope signing](interop-hub.md#envelope-signing). |
| `Messaging:VerifyInbound` | `Messaging__VerifyInbound` | on outside Development | Verify the signature of every pulled envelope against the sender's public key from the hub; failures are nacked. Never applies to `InProcess`. |
| `Messaging:Service` | `Messaging__Service` | none | Mailbox this service reads (`clinic`, `laboratory`, ...). Must equal the hub client's service. |
| `Messaging:Enabled` | `Messaging__Enabled` | `true` | `false` registers the SDK without relay/poller (tests, migrations). |
| `RelayIntervalMs`, `PollWaitSeconds`, `BatchSize` | `Messaging__...` | 1000, 20, 50 | Relay idle delay, long-poll wait, batch. |
| `OutboxRetentionDays`, `InboxRetentionDays` | `Messaging__...` | 7, 14 | Shipped outbox rows / processed inbox rows are purged after this. |

Deploy compose files map `HUB_URL`, `<SERVICE>_HUB_CLIENT_ID`, `<SERVICE>_HUB_CLIENT_SECRET` and `<SVC>_HUB_SIGNING_KEY` to these (see [deploy/clinic-api/docker-compose.yml](../../deploy/clinic-api/docker-compose.yml)); `Messaging__Transport=Hub` and `Messaging__Service=<service>` are fixed in the compose file.

### Rules every handler and publisher follows

1. **Publish before `SaveChanges`.** `IInteropPublisher.Enqueue(...)` only adds an `interop_outbox` row to the `DbContext`; it is committed by the *same* `SaveChanges` as the business change, so the message exists if and only if the change committed. Never enqueue after saving and never fire-and-forget ([InteropPublisher](../../packages/shared-dotnet/Interop/InteropPublisher.cs)). `Enqueue` also fails fast (inside your transaction) if the target service cannot be resolved.
2. **Handlers are idempotent.** Delivery is at-least-once. The dispatcher skips message ids already in `interop_inbox`, but the inbox row is written *after* the handler runs, so a crash in between causes exactly one more run. A handler's own `SaveChanges` is its commit point ([InteropDispatcher](../../packages/shared-dotnet/Interop/Handling/InteropDispatcher.cs)).
3. **Authorize the envelope.** The hub guarantees `From` belongs to the sending client, but each handler must still check that the sender may send *this* type (e.g. only `PartyKind.ControlPlane` for provisioning) and that `To` is the facility it is running as. Never trust ids inside the payload over `From`/`To`.
4. **Scope by the envelope.** There is no HTTP context in a handler, so tenant/facility query filters are bypassed. Resolve tenant and facility from `context.To` and filter explicitly. Match on globally unique ids (`RequisitionId`, `PrescriptionId`), never per-clinic counters.
5. **Return semantics.** Returning normally acks. Throwing nacks: the hub redelivers (delay `NackDelaySeconds` x attempt, max 5 min) and dead-letters after `MaxDeliveryAttempts` (10). Drop (log and return) anything that can never succeed. A type with **no registered handler** is also not acked: it will be redelivered and eventually dead-lettered, so do not receive types you do not handle.
6. **Replies reuse the correlation id** (`context.CorrelationId`) so the hub's reply rule and per-workflow ordering apply. The relay ships outbox rows oldest-first and retries forever with exponential backoff (cap 5 min); only a hub `rejected` verdict dead-letters a row locally.
7. **Addressing.** `Party.ForFacility(tenantId, facilityId, type, service?)` for facilities, `Party.ForPatient(id)` for patients, `Party.Portal` for the control plane. `To.Service` selects another service mailbox in the target's cell (for example `billing`); otherwise the facility type's default mailbox is used.

Tests use `Messaging:Transport=InProcess` with the in-process hub ([InProcessHub](../../packages/shared-dotnet/Interop/Transport/InProcessHub.cs)); see the pharmacy [PharmacyInteropHandlerTests](../../services/pharmacy-api/ClinicEz.Pharmacy.Application.Tests/PharmacyInteropHandlerTests.cs) for the pattern.

---

## 4. Directory registration

A facility service does **not** register itself. The portal is the directory authority:

1. Any `SaveChanges` that creates, renames, activates, suspends, deletes or moves a facility, or changes its visibility or hosting, makes [FacilityDirectoryInterceptor](../../services/portal-api/ClinicEz.Portal.Infrastructure/Persistence/Interceptors/FacilityDirectoryInterceptor.cs) stage `directory.cell.upserted` (when the cell is new/changed), `directory.facility.upserted` and, for same-branch facilities, `directory.link.upserted`, in the same transaction. They are stamped to ship before the facility's own `facility.license.issued`, so the facility is routable when its license arrives ([DirectoryFeedWriter](../../services/portal-api/ClinicEz.Portal.Infrastructure/Hub/DirectoryFeedWriter.cs)). `POST /api/v1/admin/hub/resync` re-sends everything.
2. The directory row is [`DirectoryFacilityUpsertedPayload`](../../packages/shared-dotnet/Interop/Contracts/DirectoryContracts.cs): `TenantId`, `FacilityId`, `FacilityType`, `CellId`, `DisplayName`, `BranchId`, `City`, `Visibility`, `AcceptsExternalRequests`, `Active`. `Active` is true while the facility is `Provisioning` or `Active` and not deleted (a provisioning facility must already be routable).
3. **Visibility** (`Private` default, `Network`, `Public`) decides who can see it in `GET /v1/directory/facilities` and whether a cross-tenant link may target it. **Gap:** the portal has no endpoint that sets `Visibility`/`AcceptsExternalRequests` today (they default to `Private`/`false`), and the only links the portal creates are automatic same-tenant same-branch links; cross-tenant link request/approval is not implemented in the portal (the hub already enforces links when they exist).
4. **How a new service appears to the platform:**
   - The directory entry is found by `(TenantId, FacilityId)`; the **mailbox** is `{cellId}:{service}` where `service` is `To.Service` or the default for the facility type (`InteropServices.ForFacilityType`). In an edge cell the cloud routes to `{cell}:cell-inbox` and the local hub fans out by service.
   - A **hub client** must exist for the service in its cell, with `Service` = the mailbox name. For on-prem, the portal creates the `EdgeCell` client when the facility is created and returns `HubEdgeCredentials` (hub URL, client id, secret, shown once) ([HubOnboardingService](../../services/portal-api/ClinicEz.Portal.Application/Features/Hub/HubOnboardingService.cs)). For the shared cloud cell, **operations provision the client** (bootstrap config or the hub admin API) and put the credentials in the service's `Messaging:*`.

---

## 5. Entitlement keys

What exists today is carried **inside the signed license** and enforced offline by the facility:

- **Limits** ([`FacilityLimits`](../../packages/shared-dotnet/Licensing/FacilityLimits.cs)): `maxStaff`, `maxBeds`, `maxAnalyzers`, `maxMonthlyConsultations`, `maxStorageMb`, `concurrentTerminals`.
- **Features** (`EnabledFeatures`, keys in [`FacilityFeatureKeys`](../../packages/shared-dotnet/Licensing/FacilityFeatureKeys.cs)): `Teleconsultation`, `ElectronicPrescriptions`, `LisIntegration`, `InventoryManagement`, `PhilHealthKonsulta`, `MultiTerminalSync`, `AdvancedAnalytics`, `CustomLetterhead`.
- Tier defaults (`Community`, `Standard`, `Enterprise`) in [`PlanTierDefaults`](../../packages/shared-dotnet/Licensing/PlanTierDefaults.cs).

A new type adds its own limit property and feature key constants there and checks them from the validated license payload (never from the request).

**Gap:** the plan's dotted keys (`limit.facilities.*`, `limit.branches`, `feature.cross_tenant_interop`, ...), the per-workspace entitlement snapshot, and the `entitlements.changed` re-mint flow are **not implemented**: the type exists in `InteropTypes` but has no payload record, producer or handler. Portal-side enforcement today is the clinic-count check in [TenantFeatureGuard](../../services/portal-api/ClinicEz.Portal.Infrastructure/Services/TenantFeatureGuard.cs).

---

## Making `FacilityType` extensible

[`FacilityType`](../../packages/shared-dotnet/Common/FacilityType.cs) is a closed enum (`Clinic`, `Organization`, `Laboratory`, `Pharmacy`) serialised as a **strict string** on the wire (`StrictJsonStringEnumConverter`: names only, numbers and unknown names are rejected) and stored as a string in the portal (`HasConversion<string>()`) and in the hub (all hub enum columns are strings, `varchar(64)`). Adding a value is a source change, a coordinated deploy, and a handful of switches. Precisely:

| # | What must change | Where | Why / failure if skipped |
|---|---|---|---|
| 1 | Add the enum value (append at the end; keep the name <= 64 characters) | [FacilityType.cs](../../packages/shared-dotnet/Common/FacilityType.cs) | Hub enum columns are `varchar(64)`. |
| 2 | Add a service-name constant and a `ForFacilityType` case | [Party.cs](../../packages/shared-dotnet/Interop/Party.cs) (`InteropServices`) | `ForFacilityType` has a throwing default arm: `Party.ForFacility(...)`/`InteropServices.For` throw `ArgumentOutOfRangeException`. `IInteropPublisher.Enqueue` calls it, so portal's `EnqueueLicenseIssued` (and therefore facility creation) fails; `HubOnboardingService` fails the same way. The hub itself no longer throws: `RoutingPolicy.ServiceFor` routes by `To.Service` or rejects with `unknown_facility_type`. |
| 3 | Make sure the service name passes `MailboxNames.IsValidService`: starts with `a-z`, then `a-z`, `0-9`, `-`; 1 to 32 characters; not `cell-inbox`, not `hub` | [HubContracts.cs](../../services/interop-hub/ClinicEz.Interop.Application/HubContracts.cs) | Hub refuses to create a client or route to an invalid service name. `billing`, `patient`, `portal` are additional well-known services, not facility types. |
| 4 | Deploy the **hub first**, then portal, then services | hub, portal | Hub, portal and services share the enum via `ClinicEz.Shared`. An older hub answers `400` to (and cannot deserialise) any envelope or directory feed carrying a `FacilityType` name it does not know. |
| 5 | Portal: type-specific switches (default subdomain in `GetFacilitiesQuery`, `ProcessTenantWorkspaceWebhookCommand`, any plan/limit rule in `TenantFeatureGuard`) and the portal-web facility type lists/labels | `services/portal-api/**`, `apps/portal-web/**` | `grep -rn "FacilityType\." services apps` finds the rest. |
| 6 | License: `FacilityLicensePayload.FacilityType` is a free string; extend `FacilityLimits`/`FacilityFeatureKeys`/`PlanTierDefaults` if the type needs its own limits or features | [Licensing](../../packages/shared-dotnet/Licensing) | See [section 5](#5-entitlement-keys). |
| 7 | Directory: no schema change; the type is just a string column and a query filter (`?type=`) | hub | Directory search and claims (`To.FacilityType`) work for any value. |
| 8 | Link scopes: add a `LinkScopes` flag and a `MessageScopes.For(type)` prefix rule if the new type has its own cross-tenant message kinds | [DirectoryContracts.cs](../../packages/shared-dotnet/Interop/Contracts/DirectoryContracts.cs), [HubContracts.cs](../../services/interop-hub/ClinicEz.Interop.Application/HubContracts.cs) | Without a scope mapping the new message types cross tenants only as replies. |
| 9 | Tests | hub `CrossTenantTests` (`IsValidService` theory), a handler test with `InProcess` transport, a portal test that creating the facility stages `facility.license.issued` and the directory upsert | |

`FacilityType` could later become an open string (registry-driven) to avoid steps 1, 2 and 4; that is a larger change touching every switch and is not planned in code today.

---

## Security configuration every service must provide

The SDK refuses to start (a hosted `InteropStartupCheck` runs first and names the missing setting) outside Development when a key it depends on is absent. There are **no compiled-in keys or secrets**.

| Setting | Env var | Needed by | Notes |
|---|---|---|---|
| `Messaging:SigningKey` | `Messaging__SigningKey` | every service using the `Hub` transport | Hub client signing key, see above. |
| `FacilityLicense:PublicKeyPem` (+ optional `PreviousPublicKeyPem`) | `FACILITY_LICENSE_PUBLIC_KEY` (`_PREVIOUS`) | services that validate licenses (clinic, laboratory, pharmacy, organization, portal) | The authority **public** key. The private key (`FACILITY_LICENSE_PRIVATE_KEY`) exists only in portal-api. |
| `Documents:SigningKey` | `DOCUMENT_SIGNING_KEY` | services that register `AddClinicEzDocumentEngine()` (clinic, laboratory) | Keys the document digest/verification HMAC; no default outside Development. |

In Development a per-machine license authority key is generated once under `%LOCALAPPDATA%/ClinicEz/dev-license-authority-key.pem` (override the folder with `CLINICEZ_DEV_KEY_DIR`) and a document key is derived from it, so locally running services and tests agree without configuration. `CLINICEZ_DEV_KEYS=true` enables the same behaviour for processes without a Development host environment; the repository sets it for test projects through the root `tests.runsettings` (applied by the root `Directory.Build.targets`). Never set it in a deployed environment.

All shared enums (`FacilityType`, `PartyKind`, `LinkStatus`, `LinkScopes`, ...) serialise as **PascalCase member-name strings only** (`"Laboratory"`, never `2`): `StrictJsonStringEnumConverter` rejects numbers and unknown names with a `400` at deserialization and refuses to write an undefined value. A service registers `services.AddStrictStringEnums()` (HTTP JSON, MVC JSON and the MVC string-enum model binder) and stores its own enum columns as strings; `StringEnumModel.FindNonStringEnumProperties(dbContext.Model)` is the guard for a unit test.

### Workspace profile (branding and regional defaults)

The workspace profile (name, logo, accent colour, time zone, locale, date format, currency, DPO contact) is **pushed by the portal** in `workspace.profile.updated` (full [`WorkspaceProfile`](../../packages/shared-dotnet/Workspace/WorkspaceProfileProvider.cs) in `Profile`, to every routable facility, and once when a facility is created). A service never calls the portal for it. To take part:

1. `ApplicationDbContext` implements `IWorkspaceProfileDbContext` (`DbSet<WorkspaceProfileRecord> WorkspaceProfiles`) and calls `modelBuilder.ApplyWorkspaceProfileModel()`; add a migration for the `workspace_profiles` table (the profile is one JSON column, so new fields need no migration).
2. `services.AddWorkspaceProfile<ApplicationDbContext>()` and `.HandleWorkspaceProfileUpdated()` inside `AddInterop`.
3. Read it through `IWorkspaceProfileProvider` (`GetAsync`, or `TryGetCached` for synchronous code such as PDF rendering). It returns null until the first message has arrived, so every caller needs a built-in fallback.

The shared handler accepts the message only from the portal and only when addressed to a facility of the profile's tenant, and applies it only when `Version` is newer than the stored one, which makes redelivery and reordering harmless. `WorkspaceProfile:CacheSeconds` (default 60) is only the in-memory cache lifetime.

### Request-reply

A service never calls another service over HTTP. When it needs an answer (GAMOT lookups clinic -> pharmacy, PhilHealth operations clinic -> proxy, PhilHealth credentials proxy -> portal) it sends a request envelope and awaits the reply envelope that carries the same `CorrelationId`. Both halves are normal outbox/hub messages, so signing, routing rules, at-least-once delivery and the edge store-and-forward path apply unchanged.

Requester (the type pair is declared in [`InteropTypes`](../../packages/shared-dotnet/Interop/InteropTypes.cs), payloads in [`PlatformServiceContracts.cs`](../../packages/shared-dotnet/Interoperability/PlatformServiceContracts.cs)):

```csharp
// registration: the reply type must be accepted by this service
services.AddInterop<ApplicationDbContext>(config, h => h.HandleReply(InteropTypes.GamotLookupResponded));

// call site (IInteropRequestClient from DI)
var reply = await client.RequestAsync<GamotLookupRequestedPayload, GamotLookupRespondedPayload>(
    InteropTypes.GamotLookupRequested, InteropTypes.GamotLookupResponded,
    from: facilityParty, to: pharmacyParty, payload, timeout: TimeSpan.FromSeconds(30), ct);
```

Responder:

```csharp
public sealed class GamotResponder : IInteropResponder<GamotLookupRequestedPayload, GamotLookupRespondedPayload>
{
    public Task<GamotLookupRespondedPayload> RespondAsync(GamotLookupRequestedPayload request, InteropMessageContext context, CancellationToken ct) { /* authorise context.From, do the work, return the payload */ }
}
// registration
h.Respond<GamotLookupRequestedPayload, GamotLookupRespondedPayload, GamotResponder>(InteropTypes.GamotLookupRequested, InteropTypes.GamotLookupResponded);
```

| Aspect | Behaviour |
|---|---|
| Reply routing | The SDK enqueues the returned payload as the reply type, `From` = the request's `To` (the responder's own identity), `To` = the request's `From`, same `CorrelationId`, in the **same `SaveChanges`** as whatever the responder changed on its DbContext (leave changes tracked, do not call `SaveChanges` in the responder). A reply is a reply on an open correlation, so the hub delivers it even when a cross-tenant link was revoked meanwhile. |
| Authorisation | The SDK does **not** authorise the sender. The responder checks `context.From` (tenant, facility, platform party) before touching data and answers with a failure status in its payload (for example `StatusCode` 403). The requester checks that the reply's `From` is the party it addressed and that its type is the awaited reply type; anything else is ignored. |
| Timeouts | `RequestAsync` throws `InteropRequestTimeoutException` (`TimeoutException`; carries request type, correlation id, timeout; never payload data) when no reply arrives within `timeout` (default `Messaging:RequestTimeoutSeconds`, 30). Cancellation throws `OperationCanceledException`. A request expires on the hub shortly after its timeout (`ExpiresAtUtc`), so a peer that comes back online does not act on stale requests. A reply that arrives after the caller gave up is acknowledged and dropped. |
| Idempotency | The reply id is derived from the request id. A redelivered request finds its reply already in the outbox and is not handled twice. A responder that throws leaves the request to be redelivered (and finally dead-lettered); the caller times out meanwhile. Report business failures in the response payload instead of throwing. |
| Latency | The relay is woken as soon as a request or reply is committed and both sides long-poll their mailbox, so a healthy round trip costs four hub hops (about a few hundred milliseconds in one region). Over an edge hub the cloud leg adds the forwarder and cell-inbox pull intervals. One slow responder blocks the other messages of its own mailbox poll batch, so keep responders short. |
| Instances | The requester keeps pending calls in memory: run **one instance per service mailbox** (the compose files do). Behind several replicas a reply can be consumed by an instance that did not ask. |
| Logging | The SDK logs message type, ids and timeouts only. Do not log request or reply payloads (PHI, credentials). |

**Platform services.** A few services are not facilities: the PhilHealth proxy (`philhealth`, `Party.PhilHealth`) is a hub client of kind `PlatformService` in the cloud cell. Facilities may address it only with `philhealth.request`; the proxy answers with `philhealth.response`; its credential traffic with the portal is closed to everyone else. The proxy derives the tenant and facility from the verified `From`, never from the payload. Rules: [`interop-hub.md`](interop-hub.md#platform-services); messages: [`message-matrix.md`](message-matrix.md#platform-services-requestreply).
---
## Add a new service: checklist

1. **Scaffold** `services/<name>-api` with the Clean Architecture projects used by clinic/lab/pharmacy (`.Api`, `.Application`, `.Domain`, `.Infrastructure`, tests) and a Dockerfile.
2. **Extend `FacilityType`** and the related switches (table above), including `InteropServices.<Name>` and the `ForFacilityType` case.
3. **Persistence:** your `ApplicationDbContext : IInteropDbContext`, `ApplyInteropModel()`, and a migration with `interop_outbox` / `interop_inbox`. Per-facility settings table holding the license token, limits and expiry.
4. **Auth:** `AddFacilityLocalAuth(configuration, "<name>-api")`, claims `tenant_id` + `<name>_id`, a scope middleware that rejects a mismatching `X-Facility-Id`, a context class that takes tenant/facility only from claims, no anonymous endpoints except the public ones you explicitly mark.
5. **Provisioning handler:** `FacilityLicenseIssued` handler with the four checks and the `facility.provisioned` ack (copy the lab handler); register `IFacilityLicenseValidator`; license/status endpoints like the existing `LicenseController`s.
6. **Domain handlers/publishers** for your message types: add constants to [`InteropTypes`](../../packages/shared-dotnet/Interop/InteropTypes.cs) (the only place), payload records under `packages/shared-dotnet/Interoperability`, register with `.Handle<TPayload, THandler>(type)`; publish before `SaveChanges`.
7. **Messaging config:** `Messaging__Transport/Service/HubUrl/ClientId/ClientSecret` in `deploy/<name>-api/docker-compose.yml` and the deploy workflow secrets (`<NAME>_HUB_CLIENT_ID/SECRET` plus `<NAME>_HUB_SIGNING_KEY`; license public key and any document key if the service validates licenses or renders documents), mirroring [deploy-laboratory-api-dev.yml](../../.github/workflows/deploy-laboratory-api-dev.yml).
8. **Hub client:** cloud cell: operations create a `CloudService` client with `Service=<name>` (`PlatformService` for a platform service such as the PhilHealth proxy) in cell `cloud` (the admin API returns the signing key once; or register a public key you generated); on-prem: the portal creates the `EdgeCell` client automatically when it creates the facility (check `HubOnboardingService.CreateClientAsync` resolves your service name).
9. **Billing integration (optional):** send `billing.invoice.requested` with `To.Service = "billing"` and wait for `billing.payment.confirmed` (see [billing.md](billing.md); the billing service is still a work in progress).
10. **Tests:** handler tests on the `InProcess` transport, a cross-tenant isolation test (two tenants, same external id), license validator tests, and the portal-side test that creating the facility stages the license and directory messages.
11. **Docs and guard:** list the new types in the [message matrix](message-matrix.md); `scripts/check-no-broker.ps1` (run from `backend-ci.yml`) keeps broker or MassTransit references out of the repo.

---

## Message type catalog

Every `InteropTypes` constant, with its sender, receiver, payload record, addressing and correlation, and the gaps where a message is sent but nobody handles it, is in [`message-matrix.md`](message-matrix.md). It replaces the catalog that used to live here, which went stale as producers and handlers landed.

- `InteropTypes.IsHubInternal(type)` is true for the `directory.*` family; the hub applies those itself.
- Payload records live in two folders: `Common/` (older events, some still named `...Event`) and `Interoperability/` (newer contracts). They are plain JSON records serialised with `InteropJson` (camelCase, string enums, nulls omitted).
- Envelope `SchemaVersion` defaults to 1 and nothing branches on it yet; add a new type or bump it deliberately when a payload breaks.
