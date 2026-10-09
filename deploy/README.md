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
| [`clinic-web`](clinic-web/docker-compose.yml) | Clinic web app on nginx for a clinic's own LAN (+ `.env.example`) | run manually; image from `publish-images.yml` (also `publish-clinic-web-image.yml`) |
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
| `Messaging__HubUrl` | Base URL of the hub, from `MESSAGING_HUB_URL` |
| `Messaging__ClientId` / `Messaging__ClientSecret` | Per-service hub credentials, from `MESSAGING_CLIENT_ID` / `MESSAGING_CLIENT_SECRET` |

The compose files refuse to start when a `MESSAGING_*` value is empty. The deploy workflows fill them from GitHub configuration:

| GitHub setting | Used by |
|---|---|
| `MESSAGING_HUB_URL` (variable, or secret as fallback) | all API deploy workflows |
| `<SVC>_MESSAGING_CLIENT_ID`, `<SVC>_MESSAGING_CLIENT_SECRET` (secrets; `<SVC>` = `CLINIC`, `LABORATORY`, `PHARMACY`, `ORGANIZATION`, `PATIENT`, `PORTAL`) | the matching `deploy-<svc>-api-*.yml` |
| `DATA_NETWORK`, `NPM_NETWORK` (optional variables, default `data-network` / `npm-default`) | all API deploy workflows |
| `INTEROP_HUB_DB_CONNECTION_STRING`, `INTEROP_HUB_PORTAL_CLIENT_SECRET` (secrets), optional `INTEROP_HUB_PAYLOAD_ENCRYPTION_KEY` | `deploy-interop-hub-dev.yml` |

Each service's client id and secret must match a client in the hub's bootstrap configuration (see [`services/interop-hub/README.md`](../services/interop-hub/README.md)).

## Container images

[`publish-images.yml`](../.github/workflows/publish-images.yml) publishes multi-arch images to `ghcr.io/<owner>/<repo>/<image>` for `clinic-api`, `laboratory-api`, `pharmacy-api`, `organization-api`, `patient-api`, `portal-api`, `billing-api`, `philhealth-proxy`, `interop-hub`, `clinic-web`, `laboratory-web`, `pharmacy-web` and `cashier-web`. An image is skipped while its Dockerfile does not exist. The [`edge`](edge/README.md) bundle pulls these images.