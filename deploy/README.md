# Deployment compose files

Every `docker-compose` file in the repository lives here, one folder per stack. The folder name matches the service or app it runs.

| Folder | Runs | Used by |
|---|---|---|
| [`clinic-api`](clinic-api/docker-compose.yml) | Clinic API | `deploy-clinic-api-dev.yml` |
| [`laboratory-api`](laboratory-api/docker-compose.yml) | Laboratory API | `deploy-laboratory-api-dev.yml` |
| [`pharmacy-api`](pharmacy-api/docker-compose.yml) | Pharmacy API | `deploy-pharmacy-api-dev.yml` |
| [`organization-api`](organization-api/docker-compose.yml) | Organization API | `deploy-organization-api-dev.yml` |
| [`patient-api`](patient-api/docker-compose.yml) | Patient API (+ `docker-compose.local.yml`, `docker-compose.local-build.yml` for local runs) | `deploy-patient-api-dev.yml` |
| [`portal-api`](portal-api/docker-compose.yml) | Portal API | `deploy-portal-api-dev.yml`, `deploy-portal-api-prod.yml` |
| [`philhealth-proxy`](philhealth-proxy/docker-compose.yml) | PhilHealth proxy | `deploy-philhealth-proxy-dev.yml` |
| [`interop-hub`](interop-hub/docker-compose.yml) | Interop Hub (+ `docker-compose.local-hub.yml` for Local mode, `.env.example`) | `deploy-interop-hub-dev.yml` |
| [`billing-api`](billing-api/docker-compose.yml) | Billing API (per-cell cashiering) | `deploy-billing-api-dev.yml` |
| [`clinic-web`](clinic-web/docker-compose.yml) | Clinic web app on nginx for a clinic's own LAN (+ `.env.example`) | run manually; image from `publish-images.yml` |
| [`edge`](edge/README.md) | On-premise single-tenant edge cell (PostgreSQL + backups, local hub, APIs, web apps) installed with `install.sh` / `install.ps1` | run by the installer; images from `publish-images.yml` |

## How the API stacks are deployed

Each `deploy-*` workflow writes a `.env` next to its compose file (`deploy/<stack>/.env`, git-ignored), copies both to the server's deploy directory and runs `docker compose up -d` there. A change under `deploy/<stack>/` triggers that stack's workflow, just like a change under `services/<stack>/`.

Dockerfiles stay with the code they build (`services/<service>/Dockerfile`, `apps/<app>/deploy/Dockerfile.web`).

## Messaging / interop hub configuration

There is no message broker. Every API stack talks to the [Interop Hub](interop-hub/docker-compose.yml) through the `Messaging` configuration section, which the compose files set as `Messaging__*` environment variables:

| Variable | Meaning |
|---|---|
| `Messaging__Transport` | `Hub` in deployed stacks (`InProcess` in tests) |
| `Messaging__Service` | Mailbox name of the service (`clinic`, `laboratory`, `pharmacy`, `organization`, `patient`, `portal`, `billing`) |
| `Messaging__HubUrl` | Base URL of the hub, from `HUB_URL` |
| `Messaging__ClientId` / `Messaging__ClientSecret` | Per-service hub credentials, from `<SVC>_HUB_CLIENT_ID` / `<SVC>_HUB_CLIENT_SECRET` |
| `Messaging__SigningKey` | ECDSA P-256 private key (base64 of the PEM) that signs the service's hub envelopes, from `<SVC>_HUB_SIGNING_KEY`; its public half is registered at the hub |

The compose files refuse to start when a required `<SVC>_HUB_*` value is empty. The deploy workflows fill them from GitHub configuration:

| GitHub setting | Used by |
|---|---|
| `HUB_URL` (variable, or secret as fallback) | all API deploy workflows |
| `<SVC>_HUB_CLIENT_ID`, `<SVC>_HUB_CLIENT_SECRET` (secrets; `<SVC>` = `CLINIC`, `LABORATORY`, `PHARMACY`, `ORGANIZATION`, `PATIENT`, `PORTAL`, `BILLING`) | the matching `deploy-<svc>-api-*.yml` |
| `<SVC>_HUB_SIGNING_KEY` (secrets, same `<SVC>` list; a private key, PEM or base64 of a PEM) | the matching `deploy-<svc>-api-*.yml` |
| `DATA_NETWORK`, `NPM_NETWORK` (optional variables, default `data-network` / `npm-default`) | all API deploy workflows |
| `INTEROP_HUB_DB_CONNECTION_STRING`, `INTEROP_HUB_PORTAL_CLIENT_SECRET` (secrets), `PORTAL_HUB_PUBLIC_KEY` (the public half of `PORTAL_HUB_SIGNING_KEY`), optional `INTEROP_HUB_PAYLOAD_ENCRYPTION_KEY` and variable `HUB_SIGNING_REQUIRED` (default `true`) | `deploy-interop-hub-dev.yml` |

Each service's client id and secret must match a client in the hub's bootstrap configuration (see [`services/interop-hub/README.md`](../services/interop-hub/README.md)). Service-specific settings (patient sharing key, portal SMTP and hub public URL, clinic public upload URL, billing keys) are listed in [`docs/deployment-configuration.md`](../docs/deployment-configuration.md).

## Secrets and keys

No secret or key has a default in these files: license keys, hub signing keys, document / UPSC / JWT / internal keys, the clinic master secret and the Data Protection settings are all supplied through GitHub secrets, and the compose files and workflows refuse to proceed without the required ones. The full table, the GitHub secrets checklist, rotation and migration notes are in [`docs/deployment-configuration.md`](../docs/deployment-configuration.md#secrets-keys-and-signing). Generate the values with `scripts/generate-license-keys`, `scripts/generate-signing-key` and `scripts/generate-secrets` (`.sh` and `.ps1`). The workflows share `scripts/ci/prepare-key-env.sh` to normalise and validate key values before writing `.env`. The edge bundle generates its own (see [`edge/README.md`](edge/README.md#keys-and-rotation)).

## Container images

[`publish-images.yml`](../.github/workflows/publish-images.yml) publishes multi-arch images to `ghcr.io/<owner>/<repo>/<image>` for `clinic-api`, `laboratory-api`, `pharmacy-api`, `organization-api`, `patient-api`, `portal-api`, `billing-api`, `philhealth-proxy`, `interop-hub`, `clinic-web`, `laboratory-web`, `pharmacy-web` and `cashier-web`. An image is skipped while its Dockerfile does not exist. The [`edge`](edge/README.md) bundle pulls these images.