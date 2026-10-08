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
| [`rabbitmq`](rabbitmq/docker-compose.yml) | RabbitMQ (+ `deploy-rabbitmq.ps1`) | run manually |
| [`clinic-web`](clinic-web/docker-compose.yml) | Clinic web app on nginx for a clinic's own LAN (+ `.env.example`) | run manually; image from `publish-clinic-web-image.yml` |

## How the API stacks are deployed

Each `deploy-*` workflow writes a `.env` next to its compose file (`deploy/<stack>/.env`, git-ignored), copies both to the server's deploy directory and runs `docker compose up -d` there. A change under `deploy/<stack>/` triggers that stack's workflow, just like a change under `services/<stack>/`.

Dockerfiles stay with the code they build (`services/<service>/Dockerfile`, `apps/clinic-app/deploy/Dockerfile.web`).