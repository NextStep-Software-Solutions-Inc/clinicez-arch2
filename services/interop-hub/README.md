# Clinic EZ Interop Hub

The hub is the only way anything crosses a service or cell boundary in Clinic EZ. It replaces the former message broker: services exchange **`InteropEnvelope`** messages (see `packages/shared-dotnet/Interop`) through HTTPS mailboxes. It is outbound-only for everybody who calls it, so an on-premise site needs no inbound port.

One binary, two modes (`Hub:Mode`):

| Mode | Where | Job |
|---|---|---|
| `Cloud` | ClinicEZ cloud | The authority: client auth, directory, routing policy, cross-tenant links, claims, mailboxes for the cloud cell and one `cell-inbox` per edge cell. |
| `Local` | One per on-prem site (edge cell) | Same wire API on the LAN. Same-cell traffic stays on the LAN; everything else is queued and forwarded to the cloud hub. Pulls the site's cell inbox from the cloud and fans it out to local mailboxes. Keeps a read-only copy of the directory so it works offline. |

```
facility services ──► local hub ──(outbound queue, HTTPS)──► cloud hub ──► cloud services / portal / patient-api
        ▲                  ▲                                     │
        └── LAN mailboxes ◄┴──(cell-inbox long poll + ack)───────┘
```

## Projects

| Project | Role |
|---|---|
| `ClinicEz.Interop.Domain` | Entities: cell, client, facility, link, message, conversation, outbound message, claim. |
| `ClinicEz.Interop.Application` | Ownership checks, routing policy, message/inbox/directory/admin/claim services, bootstrap, local-mode jobs (`OutboundForwarder`, `CellInboxPuller`, `DirectorySyncer`). |
| `ClinicEz.Interop.Infrastructure` | EF Core (PostgreSQL) stores and migrations, optional envelope encryption, upstream HTTP client, hosted services. |
| `ClinicEz.Interop.Api` | Minimal API host, `X-Hub-Client` / `X-Hub-Secret` authentication. |
| `ClinicEz.Interop.Tests` | xUnit tests, including end-to-end runs through the SDK's real `HubHttpClient` and a two-hub federation harness. |

## Authentication

Every endpoint except `/health*` needs `X-Hub-Client: <clientId>` and `X-Hub-Secret: <secret>` (what `HubHttpClient` sends). A wrong or missing credential is `401`. The cell and service of a client come from its stored record, never from the request.

| Client kind | May send as | May read |
|---|---|---|
| `CloudService` | Facilities registered in its own cell | Its own service mailbox (`GET /v1/inbox?service=<its service>`) |
| `EdgeCell` | Facilities of its own (edge) cell. The local hub's upstream client has service `cell`. | Its own service mailbox; `/v1/cell-inbox` |
| `ControlPlane` (portal-api) | The portal or the hub; may address the hub itself (`directory.*`) and call the admin API | Its service mailbox |
| `PatientPlane` (patient-api) | Patients, or `ControlPlane` with service `patient` (it relays on their behalf) | Its service mailbox; sees only Public facilities in the directory |

Secrets are stored as salted PBKDF2-SHA256 hashes. A client secret is shown once, at creation or rotation.

### Envelope signing

Each client also has an ECDSA P-256 key pair. The hub stores the **public** key (`Clients.PublicKeyPem`), the service keeps the private key (`Messaging:SigningKey`) and signs every envelope it sends. On `POST /v1/messages` and `POST /v1/claims` the hub checks that `SignerKeyId` is the authenticated client and that the signature matches the registered key; a bad signature is `invalid_signature`, and an unsigned envelope (or a client without a key) is `signature_required` while `Hub:Signing:Required` is on (default: on outside Development). Receivers verify again with the key from `GET /v1/keys/{clientId}`. The admin API generates the pair when it creates or rotates a client and returns the private half once as `signingKey` (or accepts a `publicKey` you generated; a private key is refused). Design, trust model and federation: [docs/architecture/interop-hub.md](../../docs/architecture/interop-hub.md#envelope-signing).

## Endpoints

Bodies are the raw SDK DTOs (`HubHttpClient.SendRequest`, `SendResponse`, `PullResponse`, `AckRequest`, `NackRequest`), JSON per `InteropJson` (camelCase, string enums), not wrapped in `ApiResponse<T>`.

| Method and path | Mode | Purpose |
|---|---|---|
| `POST /v1/messages` | both | Send a batch (max `Hub:MaxSendBatch`). One verdict per envelope: `accepted`, `duplicate` (same `MessageId`, also after ack) or `rejected` with a reason. |
| `GET /v1/inbox?service=&max=&waitSeconds=` | both | Pull (long poll up to `Hub:MaxLongPollSeconds`). At-least-once: a pulled message is invisible for the visibility timeout. |
| `POST /v1/inbox/ack` / `POST /v1/inbox/nack` | both | `204`. Ack purges the envelope immediately and keeps an id-only tombstone for dedupe until the TTL. A client can only settle deliveries of its own mailbox. |
| `GET /v1/directory/facilities?type=&q=&city=` | both | Facilities the caller may see: its own workspace, Public ones, Network ones it has an Active link to. A bare JSON array of `DirectoryFacilityDto`. The workspace comes from the client's cell; a cell that hosts several tenants (the cloud cell) needs `X-Hub-Tenant: <tenant>` (or `tenantId=`), which must belong to that cell. |
| `GET /v1/directory/snapshot?sinceVersion=` | Cloud | `EdgeCell` only. The authoritative directory slice for the cell; `unchanged: true` when `sinceVersion` is current. |
| `GET /v1/cell-inbox`, `POST /v1/cell-inbox/ack`, `POST /v1/cell-inbox/nack` | Cloud | `EdgeCell` only. Messages for any facility of the cell. |
| `PUT /v1/admin/cells/{cellId}`, `POST /v1/admin/cells/{cellId}/clients`, `POST /v1/admin/clients/{clientId}/rotate`, `DELETE /v1/admin/clients/{clientId}` | Cloud | `ControlPlane` only (`IHubAdminClient`). Create returns `201` with the credentials (`clientSecret` and `signingKey`, shown once; rotate issues new ones). |
| `POST /v1/claims`, `POST /v1/claims/{token}/redeem` | both | Patient-carried claims. In `Local` mode they are proxied to the cloud hub (they need the internet). |
| `GET /v1/keys/{clientId}` | both | Any authenticated client. The public signing key of a client (`HubSignerKey`: client id, cell, service, kind, `publicKey`, `revoked`); `404` unknown. A local hub answers for its own clients and asks the cloud hub for the rest. |
| `GET /health`, `GET /health/ready` | both | Liveness; readiness (database reachable). |

### Directory feed

The control plane keeps the directory current by sending envelopes addressed to `Party.Hub` (`directory.cell.upserted`, `directory.facility.upserted`, `directory.link.upserted`) with the normal `POST /v1/messages`. They are applied by the hub, never stored in a mailbox, and only a `ControlPlane` client may send them. Every change bumps a directory version that the snapshot endpoint exposes. A local hub rejects them (it syncs the snapshot instead).

### Routing and cross-tenant policy

- Facility target: facility, cell, mailbox `{cell}:{service}`; the service is `To.Service`, otherwise the default of the facility type (`clinic`, `laboratory`, `pharmacy`, `organization`). A facility whose type has no default service (a type this hub does not know yet) is routed by `To.Service` when present, otherwise rejected with a reason starting `unknown_facility_type` (never an error). Patient target: `{cloud}:patient`. A facility in an edge cell: `{cell}:cell-inbox`.
- Control-plane target (`Party{ControlPlane, Service}`): `portal` (the default) and `patient` may be addressed by every client (a facility asking the patient plane to redeem a share; the portal feeding patient-api) and land in `{cloud}:portal` / `{cloud}:patient`. `clinic`, `laboratory`, `pharmacy`, `organization` and `billing` (cloud-cell services) may be addressed only by `ControlPlane` and `PatientPlane` clients; facility clients are rejected. Any other service is rejected. `hub` is the directory feed (control plane only).
- Same tenant: always allowed.
- Cross-tenant: allowed as a reply on a correlation the target started (even if the link was revoked since), or when an `Active` link from the sender to the target covers the message kind and the target is not `Private`. Scopes: `lab.order.*` LabOrder, `rx.*` Prescription, `*referral*` Referral, `lab.result.*` Result (a result also flows back along the link the requester holds). Other types cross tenants only as a reply.
- `ControlPlane` and `PatientPlane` senders are trusted relays and are not link-checked.
- Limits: `Hub:MaxEnvelopeBytes` per envelope, expired envelopes rejected, delivery TTL `Hub:MessageTtlDays`.

### Claims

An issuing facility parks an order with `POST /v1/claims` (`CreateClaimRequest`: an envelope addressed by facility type only, plus optional `ttlHours`) and gets a one-time token (`CreateClaimResponse`). Any facility of that type redeems it once with `POST /v1/claims/{token}/redeem` (`RedeemClaimRequest`: its tenant and facility id). Redeeming delivers the order to the redeemer without a partner link and lets it reply to the issuer on the same correlation. Only the SHA-256 of the token is stored. Errors: `404` unknown, `409` already redeemed, `410` expired, `403` redeemer is not an active facility of the caller's cell, `422` wrong facility type.

## Configuration

Standard ASP.NET Core configuration: `appsettings*.json`, environment variables (`Hub__Mode`), user secrets.

| Key | Default | Meaning |
|---|---|---|
| `ConnectionStrings:DefaultConnection` | none | PostgreSQL (database `CLINICEZ_INTEROP_HUB_DB` in the shared stack). Required. |
| `DbSchema` | `interop_hub` | Schema for all tables and the migrations history. |
| `Hub:Mode` | `Cloud` | `Cloud` or `Local`. |
| `Hub:CloudCellId` | `cloud` | Id of the cloud cell. |
| `Hub:LocalCellId` | empty | Local mode: the edge cell this hub serves. Required in Local mode. |
| `Hub:MaxEnvelopeBytes` | 1048576 | Largest accepted envelope. |
| `Hub:MaxSendBatch` | 100 | Envelopes per `POST /v1/messages`. |
| `Hub:MessageTtlDays` | 7 | How long an undelivered message lives. |
| `Hub:MaxDeliveryAttempts` | 10 | Deliveries before a message is dead-lettered. |
| `Hub:VisibilityTimeoutSeconds` | 60 | How long a pulled message stays invisible. |
| `Hub:NackDelaySeconds` | 5 | Redelivery delay after a nack (multiplied by the attempt). |
| `Hub:DeadLetterRetentionDays` | 14 | How long dead letters are kept. |
| `Hub:ConversationRetentionDays` | 30 | How long a correlation allows replies. |
| `Hub:MaxPullBatch`, `Hub:MaxLongPollSeconds`, `Hub:LongPollIntervalMs` | 100, 25, 1000 | Pull limits. |
| `Hub:PayloadEncryptionKey` | empty | Base64 of 32 bytes; enables AES-256-GCM encryption of stored envelopes. |
| `Hub:Auth:Pbkdf2Iterations`, `CacheSeconds`, `MinBootstrapSecretLength` | 100000, 30, 24 | Secret hashing, credential cache, minimum length of bootstrap secrets outside Development. |
| `Hub:Claims:DefaultTtlHours`, `MaxTtlHours` | 168, 720 | Claim lifetime. |
| `Hub:Database:AutoMigrate` | `false` | Apply migrations at startup (always on in Development). Safe with several instances starting together. |
| `Hub:Background:Enabled`, `MaintenanceIntervalSeconds` | `true`, 30 | Background jobs (maintenance, and in Local mode forwarder, puller, directory sync). |
| `Hub:Upstream:Enabled` | `true` | Local mode: `false` runs the hub air-gapped (single site, no internet). Nothing is forwarded, pulled or synced; messages addressed beyond the edge cell are rejected with a reason starting `upstream_disabled`, and claims answer `503`. Url and credentials are then not required. |
| `Hub:Signing:Required` | `true` outside Development, `false` in Development | Reject envelopes without a valid signature (`signature_required` / `invalid_signature`). A signature that is present must always verify. Set `false` only while migrating clients that have no key yet. |
| `Hub:Upstream:SigningKey` | empty | Local mode: the private key issued with the edge-hub client; the local hub re-signs every envelope it forwards to the cloud with it (PEM or base64 of PEM). Required in Local mode outside Development while signing is required and the upstream is enabled. |
| `Hub:Upstream:Url`, `ClientId`, `ClientSecret` | empty | Local mode: the cloud hub and this site's `EdgeCell` credentials (one client, service `cell`). Required in Local mode while `Hub:Upstream:Enabled` is `true`; the hub refuses to start without them. |
| `Hub:Upstream:PollWaitSeconds`, `BatchSize`, `ForwardIntervalMs`, `MaxBackoffSeconds`, `DirectorySyncSeconds` | 20, 50, 1000, 300, 60 | Local mode tuning. |
| `Hub:Bootstrap:Cells`, `Clients`, `Facilities` | empty | Declarative seed, see below. |

## Bootstrap

`Hub:Bootstrap` is applied at every start (idempotent, declarative): missing cells, clients and facilities are created; a changed secret is re-hashed; a client that was revoked through the admin API stays revoked. Outside Development secrets must be at least `Hub:Auth:MinBootstrapSecretLength` characters.

- **Development** (`appsettings.Development.json`): the cloud cell and clients `dev-clinic`, `dev-laboratory`, `dev-pharmacy`, `dev-organization`, `dev-billing`, `dev-patient`, `dev-portal` with secret `<clientId>-secret`. Never deploy with `ASPNETCORE_ENVIRONMENT=Development`.
- **Production, the first ControlPlane client**: there is no admin client yet to create one, so declare it in configuration (the deploy compose does this from secrets):

  ```
  Hub__Bootstrap__Cells__0__CellId=cloud
  Hub__Bootstrap__Cells__0__Name=ClinicEZ Cloud
  Hub__Bootstrap__Cells__0__Kind=Cloud
  Hub__Bootstrap__Clients__0__ClientId=portal-api
  Hub__Bootstrap__Clients__0__Secret=<at least 24 random characters>
  Hub__Bootstrap__Clients__0__CellId=cloud
  Hub__Bootstrap__Clients__0__Service=portal
  Hub__Bootstrap__Clients__0__Kind=ControlPlane
  Hub__Bootstrap__Clients__0__PublicKey=<base64 of the portal client's PEM public key, see scripts/generate-signing-key>
  ```

  The `PublicKey` setting is required for every bootstrap client outside Development while `Hub:Signing:Required` is on (the matching private key is the service's `Messaging__SigningKey`; changing it re-registers the key). A Cloud hub outside Development refuses to start when no active `ControlPlane` client exists. portal-api then creates every other cell and client through the admin API and distributes their credentials. To rotate the bootstrap secret, change the value and redeploy (or call the rotate endpoint).

## Edge sites (Local mode)

1. In the portal, create the edge cell (`CellKind.Edge`, with the owning tenant) and an `EdgeCell` client with service `cell` for the local hub's upstream connection. Register the site's facilities in the directory (cell = the edge cell).
2. On the site server run the same image with `Hub__Mode=Local` (see `deploy/interop-hub/docker-compose.local-hub.yml`): `Hub__LocalCellId`, `Hub__Upstream__Url/ClientId/ClientSecret/SigningKey` (the credentials from step 1; the signing key is returned with the client secret), its own PostgreSQL database, and a `Hub:Bootstrap` block with the cell, one `EdgeCell` client per facility service (`clinic`, `laboratory`, ..., each with its `PublicKey`) and the site's facilities so it can route before its first sync.
3. Point the facility services at the local hub (`Messaging:HubUrl` = the LAN address, with `Messaging:ClientId` / `Messaging:ClientSecret` / `Messaging:SigningKey` of their local client). They keep working when the internet is down.

Client model: the local hub holds exactly one upstream client (the portal-issued `EdgeCell` client, service `cell`); the facility services never see it. They use local clients declared in `Hub:Bootstrap` (generated per site), so cloud credentials stay on the hub. A single-facility site without a local hub instead connects its services straight to the cloud hub, each with its portal-issued per-service `EdgeCell` client.

What the local hub does:

- **Same-cell messages** are delivered on the LAN and never touch the cloud.
- **Everything else** (other cells, the portal, patients) goes to an outbound queue and is forwarded to the cloud hub in the background: store-and-forward with exponential backoff (2, 4, 8 ... up to `MaxBackoffSeconds`), oldest-first per correlation id, deduplicated by `MessageId` at the cloud. The cloud's policy decides: a `rejected` verdict dead-letters the row locally, a transport failure only delays it.
- **Inbound** traffic is pulled from `GET /v1/cell-inbox` (long poll) and fanned out to the local service mailbox of the addressed facility; the cloud copy is acked only after the local copy is stored.
- **Directory**: `GET /v1/directory/snapshot` is polled every `DirectorySyncSeconds` and replaces the local copy when the version changed.
- **Claims** are proxied to the cloud and fail with `502` while it is unreachable.
- **Air-gapped** (`Hub:Upstream:Enabled=false`): only same-cell traffic works. Anything else is rejected immediately with `upstream_disabled` (final: the SDK dead-letters it, nothing is queued), the background forwarder, puller and directory sync do not run (the directory is whatever `Hub:Bootstrap:Facilities` seeded), and claims answer `503`. Enable the upstream later by setting the flag and the credentials and restarting.

## Operations and high availability

- The hub is stateless; all state is in PostgreSQL. Run any number of Cloud instances behind a load balancer.
- Claiming a message is a per-row compare-and-set (`UPDATE ... WHERE Seq = ? AND AttemptCount = ?`), so several instances can serve the same mailbox without double delivery and without row locks. Redeeming a claim and handing out directory versions are compare-and-set as well. Long polls wake up on the instance that received the message and otherwise re-check every `Hub:LongPollIntervalMs`.
- Background maintenance runs on every instance and is idempotent: it dead-letters messages whose attempts are exhausted, purges expired messages, dead letters, conversations and claims. A consumer that crashes on its last attempt is dead-lettered once its visibility timeout lapses.
- Migrations: `Hub:Database:AutoMigrate=true` applies them at startup; to run them out of band use `dotnet ef database update --project services/interop-hub/ClinicEz.Interop.Infrastructure --startup-project services/interop-hub/ClinicEz.Interop.Api` with `ConnectionStrings__DefaultConnection` set.
- Monitor: `/health/ready`, the count of dead letters (`Messages` with `DeadLetteredAtUtc` set) and, on an edge site, the size of the `Outbound` table (messages waiting for the cloud).
- Backups: the database holds undelivered messages for at most `Hub:MessageTtlDays`; acked envelopes are purged immediately. Set `Hub:PayloadEncryptionKey` to keep payloads encrypted at rest and keep the key out of the database backups.
- Rotating a client secret (`POST /v1/admin/clients/{id}/rotate`) takes effect within `Hub:Auth:CacheSeconds` on every instance.

## Run locally

```
dotnet run --project services/interop-hub/ClinicEz.Interop.Api
```

Needs a PostgreSQL connection string (`ConnectionStrings__DefaultConnection`, or user secrets). In Development it migrates the database, seeds the dev clients, and serves OpenAPI/Scalar on `http://localhost:5290`.

```
dotnet test services/interop-hub/ClinicEz.Interop.Tests
```

The tests run the real host in memory against a throw-away SQLite database and need no external services.

## Deploy

`deploy/interop-hub` holds the compose files and `.env.example`; `.github/workflows/deploy-interop-hub-dev.yml` builds the image from `services/interop-hub/Dockerfile` and deploys it to the dev server. Required GitHub secrets: `INTEROP_HUB_DB_CONNECTION_STRING`, `INTEROP_HUB_PORTAL_CLIENT_SECRET`, optionally `INTEROP_HUB_PAYLOAD_ENCRYPTION_KEY`.
