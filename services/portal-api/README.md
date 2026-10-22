# Clinic EZ Portal API (`portal-api`)

The Portal API is the centralized .NET 10 control-plane backend service for the Clinic EZ ecosystem. It manages cross-tenant data, handles clinic onboarding, coordinates centralized administration and licensing, handles billing via Xendit, and powers the `@clinicez/portal-web` application.

## Architecture

This service is built using **Clean Architecture** principles and utilizes ASP.NET Core **Minimal APIs**.

### Key Technologies
- **.NET 10**: High-performance cross-platform runtime.
- **Minimal APIs**: Lightweight endpoint routing via `IEndpoint` abstractions.
- **Scalar**: Modern OpenAPI reference UI (`Scalar.AspNetCore`).
- **Entity Framework Core 10**: ORM for PostgreSQL database access.
- **Clerk Integration**: Secure authentication and JWT verification.
- **Xendit Integration**: Subscription and invoicing payment lifecycle.
- **Interop SDK (`ClinicEz.Shared.Interop`)**: Transactional outbox/inbox messaging with the other services through the cloud interoperability hub.
- **Shared Package**: References `ClinicEz.Shared` (`packages/shared-dotnet`).

## Project Structure

- `ClinicEz.Portal.Api`: The entry point. Contains Minimal API endpoints, middleware, Scalar setup, and DI registration.
- `ClinicEz.Portal.Application`: Core application logic, CQRS commands/queries, validation behaviors, and interfaces.
- `ClinicEz.Portal.Domain`: Domain models, entities, enums, and repository abstractions.
- `ClinicEz.Portal.Infrastructure`: Data access implementations, PostgreSQL EF Core `ApplicationDbContext`, migrations, seeders, and external client integrations.
- `ClinicEz.Portal.Tests`: Unit and integration tests.

## Getting Started

### Prerequisites
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- Running PostgreSQL database instance

### Running Locally

1. Navigate to the API directory:
   ```bash
   cd services/portal-api/ClinicEz.Portal.Api
   ```

2. Restore dependencies and run:
   ```bash
   dotnet run
   ```

3. The API will start on configured local ports. Navigate to `/scalar/v1` in your browser to view interactive API documentation.

## Docker Deployment

A multi-stage `Dockerfile` is provided at the service root:

```bash
docker build -t portal-api:dev -f services/portal-api/Dockerfile .
```

## Messaging, directory and email

portal-api is the control plane of the interoperability hub. All messages go through the SDK outbox, written in the same
transaction as the business change, and are relayed to the hub.

| Setting | Purpose |
| --- | --- |
| `Messaging:Transport` / `HubUrl` / `ClientId` / `ClientSecret` / `Service=portal` | Hub connection and the credentials of portal-api's ControlPlane client. Also used to call the hub admin API. There are no built-in defaults; start-up fails when they are missing. Use `Messaging:Transport=InProcess` and `Messaging:Enabled=false` in tests/tooling. |
| `Hub:CloudCellId` | Cell that hosts every shared-cloud facility (default `cloud`). On-premise tenants get the cell `edge-{tenantId}`. |
| `Hub:PublicUrl` | Hub address handed to on-premise sites together with their one-time credentials. |
| `Smtp:Mode` | `Smtp` (send) or `Log` (write the email to the log; Development only). |
| `Smtp:User` / `Password` | Mail server credentials. Provide the user and password/apikey through secrets or environment (`Smtp__Password`, `Smtp__User`). Non-secret parameters (`Host`, `Port`, `Security`, `FromEmail`, `FromName`, `ReplyTo`, `ContactInbox`) are managed via Platform Settings in the database (`/admin/settings`). |
| `FrontendBaseUrl` | Portal website address used for links in emails (staff invitations). Falls back to the request's `Origin`/`Referer`. |

- Facility and branch changes are fed to the hub directory (`directory.cell.upserted`, `directory.facility.upserted`,
  `directory.link.upserted`) automatically on save. `POST /api/v1/admin/hub/resync` (platform admin, `manage:tenants`)
  re-sends the whole directory; it is idempotent.
- Creating an on-premise facility returns its hub credentials once (`hubCredentials`); the owner or an admin can issue new ones with
  `POST /api/v1/facilities/{id}/hub-credentials/rotate?tenantSlug=...`.
- Services request emails by sending `notification.email.requested` (registered templates only); portal-api renders and sends them,
  and a failed delivery is retried.

## Workspaces, plans and entitlements

- A **workspace** (tenant) has one `Subscription` (billing is workspace level), `WorkspaceMember`s (Owner/Admin/Billing/Member) and
  facilities. `StaffMember` is only the per-facility profile of a workspace member. A user owns at most one active workspace
  (`Workspace:MaxOwnedPerUser`, unique index `UX_Tenants_OwnerId_Active`); ownership moves through a two-step transfer
  (`POST/GET/DELETE /tenants/{slug}/settings/ownership-transfer`, `POST .../accept`, `POST .../decline`). Owner and memberships are
  mirrored to Clerk public metadata (`ownedTenantId`, `memberships`).
- **Plans** (`Plan`, `PlanFeature`, `PlanEntitlement`) are seeded create-if-missing at start-up from the `Billing` section; a trial of
  `Billing:TrialDays` on `Billing:DefaultPlanSlug` starts lazily. Per-workspace `EntitlementOverride`s win over the plan.
  `GET /tenants/{slug}/entitlements` returns the effective features and limits (`limit.*`, `feature.*`; `-1` = unlimited).
- Guards answer with a coded error: `402 subscription_inactive`, `403 feature_unavailable`, `409 limit_reached` or
  `409 allocation_exceeds_pool`. Branches allow one facility per type (`409 branch_facility_type_taken`).
- Pool limits (staff, terminals, storage) are split across facilities with `PUT /tenants/{slug}/facilities/{facilityId}/allocation`.
  The signed facility license (`GET /facilities/{id}/license-key`, activation, reconciliation and the renewal job) is always derived
  from entitlements and allocations by `ILicenseIssuer`; every change publishes `entitlements.changed`.
- A change to the workspace profile (general, branding, compliance) bumps `ProfileVersion` and publishes `workspace.profile.updated`
  to every routable facility of the workspace (clinic, laboratory, pharmacy, organization) and to the workspace webhooks. The message carries the complete profile (`Profile.Version` = event `Version`), so facilities never call the portal for it; a new facility gets the same message right after its license (default settings are created if absent). `GET /tenants/{slug}/workspace-profile` remains for the web apps.
- Cross-tenant links: `GET/POST /tenants/{slug}/links`, `POST .../links/{linkId}/approve|reject`, `DELETE .../links/{linkId}`;
  facility visibility `PUT /tenants/{slug}/facilities/{facilityId}/visibility` (Private/Network/Public); directory search
  `GET /tenants/{slug}/directory/facilities?type&q&city` (answers 502 when the hub is unreachable).
- Finance: facilities publish daily summaries and `billing.invoice.paid/voided` records (no patient data); the portal rolls them up at
  `GET /tenants/{slug}/finance/summary`.
- Public lab-result relay: `POST /public/lab-uploads/{token}` validates size/type (`413`/`415`/`400`, independent of the token) and
  answers `202` otherwise; files are relayed as `lab.result.external.submitted` and never stored by portal-api.

| Setting | Purpose |
| --- | --- |
| `Workspace:MaxOwnedPerUser` | Workspaces one user may own (default 1). |
| `LabUploads:MaxFileBytes` / `AllowedContentTypes` / `RateLimitPermits` / `RateLimitWindowMinutes` | Public lab upload relay limits. |
| `Licensing:TtlDays` / `GraceDays` / `RenewBeforeDays` | Facility license lifetime, grace period and renewal lead time. |
| `Billing:DefaultPlanSlug` / `TrialDays` / `Plans` | Plan catalog (limits, features, prices) and trial. |

### Hub credentials and background jobs

- The first on-premise facility of a workspace receives the full credential set once:
  `{ hubUrl, upstream, services: { <service>: { clientId, clientSecret, signingKey } } }` (`upstream` has the same three fields);
  later facilities of the workspace receive none. `signingKey` is the client's envelope signing private key (ECDSA P-256, base64 of a PEM) for
  `Messaging:SigningKey` of that service; the hub keeps only the public key, so like the secret it is shown once.
  `POST /facilities/{id}/hub-credentials/rotate?service=` returns `{ hubUrl, service, clientId, clientSecret, signingKey }` for one service
  (new secret and new signing key; the old ones stop working).
- Hub clients are revoked when a facility is updated or deleted, the workspace is archived, a deployment changes from on-premise to
  cloud, and by the daily `lapsed-hub-client-revocation` job. A hub `404` on revoke counts as already revoked; other failures are
  logged and retried later.
- Recurring jobs: `facility-license-renewal` (re-issues licenses before expiry) and `lapsed-hub-client-revocation` (`30 3 * * *`).

### Migration `Phase1TenancyEntitlements`

Existing staff rows become workspace members (same id; Owner/Admin roles map to `Admin`, others to `Member`, and the tenant
`OwnerId` becomes `Owner`); a missing owner member is created. Provider subscription ids are not migrated: the old
`SubscriptionPlans` tables are dropped, plans are re-seeded and trials start lazily. Tenants that share an `OwnerId` must be cleaned up
before applying, otherwise the unique owner index fails.

## Enums and security configuration

- **Enums are strings.** Every enum is stored as its member name (`ConfigureConventions`: `Properties<Enum>().HaveConversion<string>()`, max length 64) and
  is written and read by name on the wire (`AddStrictStringEnums()`); numbers are rejected with 400. `StringEnumTests` fails when a
  new enum property is mapped as a number. Migration `EnumsAsStrings` converts `WebhookDeliveries.Status` and `FacilityLinks.Scopes`
  (flags are stored as `LabOrder, Prescription`, or `All`).
- **No built-in secrets.** Outside Development the host refuses to start when one of these is missing (the message names the
  environment variable):

| Setting (env) | Purpose |
| --- | --- |
| `ConnectionStrings:DefaultConnection` | Database. |
| `Clerk:SecretKey`, `Clerk:Authority`, `Clerk:AuthorizedParties` | Clerk backend API and JWT validation. |
| `Xendit:SecretKey`, `Xendit:CallbackToken` | Xendit API and the callback token of `POST /billing/webhook` (compared in constant time; there is no default). |
| `Cors:AllowedOrigins` (`Cors__AllowedOrigins`, comma separated); at least one of it, `Facility:BaseDomain`, `Cors:AllowedDomains` is required, and `Cors:AllowAnyOrigin=true` stops the start-up | Portal web origin(s) allowed to call the API with credentials. Outside Development only these, subdomains of `Facility:BaseDomain` and of `Cors:AllowedDomains` are allowed: no localhost, `*.lvh.me` or `*.vercel.app` (list a Vercel preview origin explicitly if needed). There is no allow-any-origin switch; Development allows every origin. |
| `Messaging:SigningKey` (`Messaging__SigningKey`) | Private key portal-api signs its hub messages with (the hub client's ECDSA P-256 key, PEM or base64 of one). The hub is bootstrapped with the matching public key through `INTEROP_HUB_PORTAL_PUBLIC_KEY`. |
| `DataProtection:CertificateBase64` / `CertificatePassword` | Optional PKCS#12 (.pfx, base64) that encrypts the key ring at rest. |
