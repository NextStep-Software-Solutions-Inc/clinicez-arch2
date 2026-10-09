# ClinicEZ Edge Cell (on-premise bundle)

One Docker Compose stack that runs a **single tenant's site** on the customer's own server: the facility APIs, the web apps, a
PostgreSQL database with backups and the cell's own **interop hub** (Local mode). Architecture and rationale:
[docs/architecture/edge-cell.md](../../docs/architecture/edge-cell.md).

```
LAN  ->  clinic-web :8080  (nginx, proxies /api)  ->  clinic-api  --+
         laboratory-web :8081 -> laboratory-api  (profile laboratory)   |   Messaging__HubUrl = http://interop-hub:8080
         pharmacy-web   :8082 -> pharmacy-api    (profile pharmacy)     +-> interop-hub (Local) --outbound HTTPS--> cloud hub
         cashier-web    :8083 -> billing-api     (profile cashier)      |        |
                                 organization-api (profile organization)         +-> postgres (+ backup sidecar)
```

No inbound port is ever opened to the internet: the only external traffic is **outbound HTTPS** from the hub (and the portal
profile fetch) to the ClinicEZ cloud.

## Contents of this folder

| File | Purpose |
|---|---|
| `docker-compose.yml` | The stack (postgres, backup, hub, APIs, web apps; compose profiles). |
| `.env.example` | Every variable, documented, with generation commands. `install.*` writes the real `.env`. |
| `install.sh` / `install.ps1` | Installer: preflight, secrets, `.env`, pull, start, health wait, license activation, upgrade, backup, restore. |
| `initdb/10-create-databases.sql` | Creates one database per service on the first start. |
| `backup/backup.sh` | Loop run by the `backup` service (`pg_dump` + records/keys archive, retention). |
| `hub-bootstrap.env` | **Generated** by the installer: the local hub's cell, clients and facilities (secret, git-ignored). |

## Prerequisites

- A server (Linux recommended; Windows with Docker Desktop works) with **Docker Engine 24+ and Docker Compose v2** (`docker compose`).
- 2 CPU cores, 4 GB RAM, **10 GB free disk** minimum (images, database, backups; more for scanned records).
- `curl` (Linux/macOS installer). Windows: PowerShell 5.1+.
- Outbound HTTPS to the cloud hub, the portal API and `ghcr.io` (images). Nothing inbound. Air-gapped: see below.
- The LAN ports `8080` (clinic web), `8081` laboratory, `8082` pharmacy, `8083` cashier, `8090` hub (loopback). All configurable in `.env`.
- From the portal (see next section): tenant id, edge cell id, facility id(s), hub credentials, and a **license** per facility.

## What the portal hands out

When an on-premise facility is created (or its credentials are rotated) the portal returns **`HubEdgeCredentials`**
(`services/portal-api/.../Features/Hub/HubOnboardingService.cs`): `HubUrl`, `ClientId`, `ClientSecret`. The secret is shown **once**; the
hub stores only a hash, so a lost secret can only be rotated. Together with the identifiers and the license they map to `.env` like this:

| From the portal | `.env` variable | Notes |
|---|---|---|
| Tenant id | `TENANT_ID` | Single tenant per cell. |
| Edge cell id | `EDGE_CELL_ID` | The cell registered at the cloud hub. |
| Facility id(s) | `CLINIC_FACILITY_ID`, `LABORATORY_FACILITY_ID`, `PHARMACY_FACILITY_ID`, `ORGANIZATION_FACILITY_ID` | Same id as inside each license. |
| Portal API base URL | `PORTAL_API_URL` | Workspace profile (branding), cached on disk for offline use. May stay empty when air-gapped. |
| License token or license file | `activate` step (not stored in `.env`) | One per facility; stored in each service's database. |

### Credentials the portal hands out (and the ones it does not)

There are two client models; the installer asks for exactly the credentials of the mode you pick and generates the rest.

**With the local hub (default).** The services use **local clients** `site-<service>` on the LAN; only the hub holds a cloud client.

| Credential | Variables in `.env` | Who creates it |
|---|---|---|
| ONE upstream EdgeCell client (Service `cell`) of this cell: `HubEdgeCredentials.HubUrl` / `ClientId` / `ClientSecret` | `UPSTREAM_HUB_URL` / `UPSTREAM_CLIENT_ID` / `UPSTREAM_CLIENT_SECRET` (prompted; `--cloud-hub-url`, `--edge-client-id`, `--edge-client-secret`) | **The portal.** Held by the local hub only. Not asked with `--air-gapped`. |
| Local clients `site-clinic`, `site-billing`, `site-laboratory`, `site-pharmacy`, `site-organization` | `<SERVICE>_HUB_CLIENT_ID` / `<SERVICE>_HUB_CLIENT_SECRET` | **The installer**: generated once (40 chars), written to `.env` (the service's `Messaging__ClientSecret`) **and** to `hub-bootstrap.env` (`Hub__Bootstrap__Clients__N__*`, which declares the cell, these local clients and the facilities; the upstream client is not in it). They only exist on the LAN. |
| The hub's address for the services | `MESSAGING_HUB_URL=http://interop-hub:8080` | Default; leave as is. |

**Without a local hub** (`--no-local-hub`, single facility). There is no hub on the site, so the services use the **portal-issued per-service clients** against the cloud hub.

| Credential | Variables in `.env` | Who creates it |
|---|---|---|
| Cloud hub URL (`HubEdgeCredentials.HubUrl`) | `MESSAGING_HUB_URL` (prompted; `--cloud-hub-url`) | The portal. |
| Clinic client | `CLINIC_HUB_CLIENT_ID` / `CLINIC_HUB_CLIENT_SECRET` (`--clinic-hub-client-id/-secret`) | **The portal.** The id is whatever the portal returns (not `site-...`); never generated or defaulted. |
| Billing client | `BILLING_HUB_CLIENT_ID` / `BILLING_HUB_CLIENT_SECRET` (`--billing-hub-client-id/-secret`) | **The portal**, same rules. |
| `UPSTREAM_*`, other services' clients | (empty) | Not used. `hub-bootstrap.env` is still written but comment-only. |

The `.env` of either mode is the same set of variables, so `.env.example` documents both. Prefer the prompt for secrets: it keeps them out of shell history.

## Install

Linux / macOS:

```bash
cd deploy/edge
./install.sh                       # asks for the portal values; add --with laboratory,pharmacy for more facilities
# non-interactive:
./install.sh --yes --tenant-id <id> --cell-id <cell> --facility-id <guid> \
  --cloud-hub-url https://<hub> --edge-client-id <id> --edge-client-secret '<secret>' \
  --portal-api-url https://<portal-api> --license-token '<token>'
```

Windows (PowerShell; run the script with a process-scoped bypass if scripts are blocked):

```powershell
cd deploy\edge
powershell -ExecutionPolicy Bypass -File .\install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Yes -TenantId <id> -CellId <cell> -FacilityId <guid> `
  -CloudHubUrl https://<hub> -EdgeClientId <id> -EdgeClientSecret '<secret>' -PortalApiUrl https://<portal-api> -LicenseToken '<token>'
```

The other two modes (see "Credentials the portal hands out"):

```bash
# air-gapped: no upstream settings, UPSTREAM_ENABLED=false, same-cell traffic only
./install.sh --yes --air-gapped --tenant-id <id> --cell-id <cell> --facility-id <guid> --license-file /media/usb/clinic.license
# single facility without a local hub: the portal's clinic and billing clients, the cloud hub URL
./install.sh --yes --no-local-hub --tenant-id <id> --cell-id <cell> --facility-id <guid> --cloud-hub-url https://<hub> \
  --clinic-hub-client-id <id> --clinic-hub-client-secret '<secret>' --billing-hub-client-id <id> --billing-hub-client-secret '<secret>' \
  --portal-api-url https://<portal-api>
```
```powershell
.\install.ps1 -Yes -AirGapped -TenantId <id> -CellId <cell> -FacilityId <guid>
.\install.ps1 -Yes -NoLocalHub -TenantId <id> -CellId <cell> -FacilityId <guid> -CloudHubUrl https://<hub> `
  -ClinicHubClientId <id> -ClinicHubClientSecret '<secret>' -BillingHubClientId <id> -BillingHubClientSecret '<secret>' -PortalApiUrl https://<portal-api>
```

The installer: checks docker, compose v2, disk and ports; writes `.env` (**never overwrites an existing one** without `--force`/`-Force`,
and then keeps the secrets already generated, saving the old file as `.env.bak.<time>`); renders `hub-bootstrap.env`; logs in to
`ghcr.io` if `GHCR_USER` / `GHCR_TOKEN` are set; `docker compose pull`; `up -d`; waits until every container is healthy; **activates the
license(s)**; prints the URLs. Re-running it is safe: existing `.env` and secrets are reused.

Images come from `ghcr.io/<GHCR_OWNER_REPO>/<name>:<IMAGE_TAG>` where `<name>` is one of `clinic-api`, `laboratory-api`, `pharmacy-api`,
`organization-api`, `billing-api`, `interop-hub`, `clinic-web`, `laboratory-web`, `pharmacy-web`, `cashier-web`. If the packages are private,
export `GHCR_USER` and `GHCR_TOKEN` (a `read:packages` token) before running. `cashier-web` is published once `apps/cashier-app` lands:
do not enable the `cashier` profile before that.

### Compose profiles

`COMPOSE_PROFILES` in `.env` decides what runs (the installer writes it; plain `docker compose ...` honours it).

| Profile | Services | Default |
|---|---|---|
| (always) | `postgres`, `backup`, `billing-api`, `clinic-api`, `clinic-web` | on |
| `local-hub` | `interop-hub` (Local mode) | **on** |
| `laboratory` | `laboratory-api`, `laboratory-web` | off (`--with laboratory`) |
| `pharmacy` | `pharmacy-api`, `pharmacy-web` | off |
| `organization` | `organization-api` | off |
| `cashier` | `cashier-web` | off |

To add one later: edit `COMPOSE_PROFILES`, set the facility id (`LABORATORY_FACILITY_ID`, ...) in `.env`, then `./install.sh apply`
(re-renders `hub-bootstrap.env`, pulls, starts, and `./install.sh activate --lab-license-file ...` activates it). All databases already exist.

### Single-facility vs multi-facility cells

- **Several facilities** (hospital: clinic + lab + pharmacy + cashier): keep `local-hub` on. Every facility service's `Messaging__HubUrl` is
  `http://interop-hub:8080` (set once through `MESSAGING_HUB_URL`). Clinic -> lab -> pharmacy -> billing traffic stays on the LAN and works
  with the internet down. When a site runs **several facility stacks** (separate compose projects/hosts), they share this one hub: point the
  other stacks' `MESSAGING_HUB_URL` at `http://<this-server>:<HUB_LAN_PORT>` and set `HUB_BIND=0.0.0.0` (the hub port is loopback-only by default).
  Add each stack's service clients to the hub the same way (profiles on this host).
- **One facility, no local peers** (advanced): `--no-local-hub` / `-NoLocalHub`. There is no hub on the site: `MESSAGING_HUB_URL` is the **cloud hub** and
  `clinic-api` / `billing-api` sign in with the **portal-issued per-service clients** (`CLINIC_HUB_CLIENT_ID/SECRET`, `BILLING_HUB_CLIENT_ID/SECRET`; the
  ids are whatever the portal returns, not `site-...`). No `UPSTREAM_*` is asked or used; the clinic outbox buffers during outages. Only the clinic and
  billing services exist in this mode (`--with laboratory|pharmacy|organization` is refused), and it cannot be air-gapped. Switching on a second
  facility later = `./install.sh --force` without `--no-local-hub` (the old clients are replaced by generated local ones), or edit
  `COMPOSE_PROFILES=local-hub,...` after setting the `UPSTREAM_*` values, then `./install.sh apply`.

## First-run activation (license token or license file)

Each facility needs its license once. The installer calls the local API (through the web container, the only published port) at
`POST /api/v1/license/apply` with `{"licenseToken":"..."}`; `GET /api/v1/license` reports `Active`, `ActivationRequired`, `Expired` or `Tampered`.

```bash
./install.sh activate --license-token '<token>'
./install.sh activate --license-file /media/usb/clinic.license          # air-gapped / USB import
./install.sh activate --lab-license-file lab.license --pharmacy-license-file pharmacy.license
```
```powershell
.\install.ps1 activate -LicenseFile D:\clinic.license
```

A license file contains the token (`<payload>.<signature>`, whitespace ignored) or a JSON object with a `licenseToken` property. The signature
is verified locally with the embedded authority public key, so **no internet is needed**. After activation the heartbeat (when online) keeps
`LastSeenAt`/`AppVersion` current in the portal; renewing a license is a repeat of the same command with the new token/file.

## Upgrade

```bash
./install.sh upgrade --tag v1.4.0        # = --upgrade: backup now, pull, up -d, wait for health
./install.sh upgrade                     # same tag (e.g. latest): pulls newer images
```
`upgrade` takes a backup first (skip with `--no-backup`), changes `IMAGE_TAG` in `.env`, pulls and recreates changed containers. The services
apply their database migrations at startup. Roll back by running `upgrade` with the previous tag (printed at the end); restore a database backup only
if a migration must be undone. Air-gapped: `docker load` the images on the host, then `./install.sh upgrade --tag <x> --no-pull`.

## Backup and restore

The `backup` service runs `backup/backup.sh` every `BACKUP_INTERVAL_HOURS` (default 24) and writes to `BACKUP_DIR` (default `./backups`;
**point it at a USB disk or NAS mount**):

- `<DB>.<UTC time>.dump`: `pg_dump -Fc` of each database (clinic, billing, laboratory, pharmacy, organization, local hub).
- `files.<UTC time>.tar.gz`: encrypted clinical records (`Storage/Records`) and the JWT signing keys.
- Files older than `BACKUP_RETENTION_DAYS` (default 14) are pruned after a successful run.

`.env` and `hub-bootstrap.env` are **not** in the backups (they hold the secrets): copy them to a safe place, separately. In particular keep
`HUB_PAYLOAD_ENCRYPTION_KEY` and `POSTGRES_PASSWORD`.

```bash
./install.sh backup                                                   # backup now
./install.sh restore backups/CLINICEZ_CLINIC_DB.20261009T020000Z.dump # one database
./install.sh restore backups/files.20261009T020000Z.tar.gz            # records + keys
```
```powershell
.\install.ps1 backup
.\install.ps1 restore .\backups\CLINICEZ_CLINIC_DB.20261009T020000Z.dump
```
`restore` stops the services (not postgres), restores, then starts everything again. The raw command, if you prefer to run it yourself:

```bash
docker compose stop clinic-api clinic-web billing-api interop-hub          # plus the other enabled services
docker compose exec -T postgres pg_restore -U clinicez -d CLINICEZ_CLINIC_DB --clean --if-exists --no-owner < backups/CLINICEZ_CLINIC_DB.<time>.dump
docker compose up -d
```
Disaster recovery on a new server: install the same version with the saved `.env`, `docker compose up -d postgres`, restore every dump and the files archive, then `up -d`.
**Test a restore** on a spare machine regularly.

## Connecting to the cloud (outbound HTTPS only)

- The hub dials out: it forwards its outbound queue, long-polls the cell inbox and syncs the directory snapshot from `UPSTREAM_HUB_URL`. No port forwarding, VPN or inbound firewall rule is needed.
- Allow outbound HTTPS to: the cloud hub host, the portal API host, `ghcr.io` (+ `pkg-containers.githubusercontent.com`) for upgrades. A proxy is not wired in: use a transparent proxy or allow-list.
- Nothing on the LAN depends on that link: clinic <-> lab <-> pharmacy <-> billing work offline. On an **online** site (`UPSTREAM_ENABLED=true`), cross-site messages (patient app, other tenants) wait in the hub while the link is down and are delivered in order when it returns (cloud mailboxes keep them 7 days). A site that never connects uses `--air-gapped` instead (see below): there such messages are rejected.

## Air-gapped sites

`--air-gapped` / `-AirGapped` writes `UPSTREAM_ENABLED=false` into `.env` (default `true`). The local hub then runs **without any upstream**: it needs no
`UPSTREAM_*` values (no placeholders are written; `PORTAL_API_URL` may stay empty) and never forwards, pulls or syncs anything.

- **Same-cell traffic only.** Clinic, billing, laboratory, pharmacy and organization keep talking to each other over the LAN.
- **Cross-cell, portal and patient messages are rejected, not queued.** The hub rejects a message for a non-local target with the reason
  `upstream_disabled`; nothing accumulates in an outbound queue and nothing is delivered later.
- The hub's **claims endpoints answer `503`** (they need the cloud).
- Licenses are activated and renewed by **file import** (`activate --license-file`); updates arrive as `docker save` / `docker load` archives.
- `--air-gapped` is refused together with `--no-local-hub`: without a local hub the services talk to the cloud hub directly, so there is nothing to run offline.

To connect the site later: set `UPSTREAM_ENABLED=true`, fill `UPSTREAM_HUB_URL`, `UPSTREAM_CLIENT_ID`, `UPSTREAM_CLIENT_SECRET` (the portal's
`HubEdgeCredentials`) and `PORTAL_API_URL` in `.env`, then `./install.sh apply`. Only messages sent after that are forwarded.

## Single tenant

One cell = one tenant. `TENANT_ID` and `EDGE_CELL_ID` are fixed per install, the local hub knows only this tenant's facilities, and the database holds only this tenant's data.
Another tenant means another server (or at least another directory with its own `.env` and a different compose project name).

## Troubleshooting

| Symptom | Check |
|---|---|
| `docker compose pull` fails | Network/DNS to `ghcr.io`; private packages need `GHCR_USER` / `GHCR_TOKEN`; `GHCR_OWNER_REPO` and `IMAGE_TAG` in `.env`; the image exists (billing-api / cashier-web may not be published yet). |
| Installer: "port N already in use" | Another program owns it; change `CLINIC_WEB_PORT` etc. in `.env`, or `HUB_LAN_PORT`. |
| Service not healthy | `docker compose ps`, `docker compose logs --tail 100 <service>`. APIs wait for postgres to be healthy; the first start runs migrations (can take a minute). |
| `required variable ... is missing` | `.env` incomplete (hand-edited?). Re-run `./install.sh` (it appends missing values) or compare with `.env.example`. |
| Hub cannot reach the cloud | `docker compose logs -f interop-hub` (forwarder/puller/directory sync errors, backoff up to 300 s). Test: `docker compose exec interop-hub bash -c 'exec 3<>/dev/tcp/<cloud-hub-host>/443 && echo open'`. Check the clock, DNS, proxy, and that `UPSTREAM_CLIENT_ID/SECRET` are the portal's current ones (a rotated secret returns 401: put the new one in `.env`, `./install.sh apply`). |
| Outbound queue size | `./install.sh status` prints it, or `docker compose exec -T postgres psql -U clinicez -d CLINICEZ_INTEROP_HUB_LOCAL_DB -c 'SELECT count(*) FROM interop_hub."Outbound"'`. A queue that only grows means the cloud link is down or the cloud rejects the messages (dead letters appear in `Messages`). |
| Services cannot sign in to the hub (401) | The local client secret in `.env` does not match `hub-bootstrap.env`. Run `./install.sh render` then `docker compose up -d interop-hub`. |
| License expired / `ActivationRequired` / `Tampered` | `GET http://<server>:8080/api/v1/license`. Expired: read-only grace, renew online (heartbeat) or `activate --license-file`. `Tampered`: wrong or modified token; request a new one. A license issued for another facility id is rejected. |
| Activation: `License facility mismatch` | The token belongs to a different facility than the one this server was registered for; use the right facility's license. |
| Web app loads but API calls fail | `docker compose logs clinic-web clinic-api`; nginx proxies `/api/` to `http://clinic-api:8080`. |
| Logs | `docker compose logs -f <service>`; each container keeps 5 x 10 MB. Hangfire dashboards at `/hangfire` (Basic Auth, password `HANGFIRE_DASHBOARD_PASSWORD`) are only reachable through the web proxy if you route them; they are otherwise internal. |

## Security notes

- `.env` and `hub-bootstrap.env` contain every secret: `chmod 600` (the installer does), keep them out of git and out of the backup folder's shared copies. `.gitignore` here already excludes them.
- Only the web ports (and, if you choose, the hub) are published. postgres, the APIs and the backup service are on the private compose network only.
- Hub client secrets are per site and per service, at least 24 characters, stored as salted hashes by the hub. Rotate by changing the value in `.env` and `./install.sh apply`.
- The hub encrypts stored envelopes with `HUB_PAYLOAD_ENCRYPTION_KEY` (AES-256-GCM); the cloud link is TLS. Traffic inside the LAN is plain HTTP between containers on the private network and between browsers and the web port: **put TLS in front of the web ports** (a reverse proxy or the customer's existing one) for any device that is not on a trusted wired LAN.
- The Hangfire dashboards are denied unless `HANGFIRE_DASHBOARD_PASSWORD` is set (the installer sets one).
- Keep the host patched, restrict who can use the docker group, encrypt the disk holding the volumes and backups, and store backups off the server.
- Scanned records are stored encrypted by the application; the encryption keys live in the database/key volumes, so a backup of both is needed to read them back.

## Assumptions to confirm

See the "Limits and open points" section of [docs/architecture/edge-cell.md](../../docs/architecture/edge-cell.md).
