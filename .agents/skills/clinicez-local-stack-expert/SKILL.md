---
name: clinicez-local-stack-expert
description: >-
  Repository-wide operational runbook and helper tooling for spinning up, restoring,
  rebuilding, seeding, and troubleshooting the full local Clinic EZ Docker + web stack
  (PostgreSQL 17, Interop Hub, Portal API, Clinic API, Patient API, MinIO, Mailpit,
  Portal Web, Admin Web, Clinic App, and Patient App). Use whenever the user asks to
  spin up or restore the local environment, replicate bugs locally, test Interop Hub
  or Hangfire/SMTP email flows, rebuild local API containers after code changes, or
  verify end-to-end UI workflows in the built-in browser.
---

# Clinic EZ Local Stack Expert

Use this skill to spin up, restore, rebuild, and debug the full **local Clinic EZ** architecture on Docker Desktop + Bun without touching production or the remote dev VPS.

---

## 1. Local Service Topology & Port Map

All Docker backend containers run on the shared bridge network `v1-sync-api_default` and bind strictly to `127.0.0.1`.

| Layer | Service | Container / Process | Host Endpoint | Database / Notes |
|---|---|---|---|---|
| **Data** | PostgreSQL 17 (`pgvector`) | `clinicez-local-pg17` | `127.0.0.1:5439` | User `clinicez_local` · DBs: `CLINICEZ-PORTAL_DB`, `CLINICEZ-CLINIC_DB`, `CLINICEZ-PATIENT_DB`, `CLINICEZ-INTEROP_DB`, `CLINICEZ-V1_SYNC_DB` |
| **Storage** | MinIO (S3/R2 local) | `clinicez-local-minio` | `http://127.0.0.1:9000` (API), `:9001` (Console) | Persistent Docker volume `v1-sync-api_clinicez_local_minio_data` |
| **Email** | Mailpit (SMTP sink) | `clinicez-local-mailpit` | `http://127.0.0.1:8025` (UI/API), `2525` (SMTP) | Captures all Portal & Clinic outbound emails locally |
| **Mesh** | Interop Hub | `clinicez-local-interop-hub` | `http://127.0.0.1:5290` | `CLINICEZ-INTEROP_DB` · `Hub__Signing__Required=false` locally |
| **API** | Portal API | `clinicez-local-portal-api` | `http://127.0.0.1:5000` | `CLINICEZ-PORTAL_DB` · Hangfire at `/hangfire` |
| **API** | Patient API | `clinicez-local-patient-api` | `http://127.0.0.1:5100` | `CLINICEZ-PATIENT_DB` |
| **API** | Clinic API | `clinicez-local-clinic-api` | `http://127.0.0.1:5245` | `CLINICEZ-CLINIC_DB` · Local file fallback enabled |
| **Web** | Portal Web (Next.js 16) | `bun run dev` | `http://localhost:3000` | Public routes (`/verify/practitioner`, `/join`, `/claim`) & tenant portal |
| **Web** | Admin Web (Vite) | `bun run dev` | `http://localhost:3001` | Platform governance (`/verifications`, `/tenants`, `/settings`) |
| **Web** | Clinic App (Expo Web) | `bunx expo start --web` | `http://localhost:8081` | Workspace query param: `?facilitySlug=<slug>` |
| **Web** | Patient App (Expo Web) | `bunx expo start --web` | `http://localhost:8082` | Patient booking & public directory search |

---

## 2. Security & Secret Hygiene Contract

1. **Never commit secrets or edit tracked `.env` files.**
2. Read development keys dynamically from the gitignored root `configuration.txt` (or sibling worktree `.env.local` if running in a worktree).
3. Write generated runtime Docker `.env` files **only** outside git (default: `/tmp/clinicez-local-stack/`, mode `0600`) via [local-stack.sh](./scripts/local-stack.sh).
4. **Never echo raw secret values** (Clerk secret keys, private PEM keys, JWT signing keys, SMTP passwords) in terminal output, artifacts, or chat replies.

---

## 3. Standard Operations (Use `local-stack.sh`)

Run the bundled helper script from anywhere inside the repository:

```bash
STACK=".agents/skills/clinicez-local-stack-expert/scripts/local-stack.sh"
```

### 3.1. Check or Restore an Existing Local Session
Always check what is already running before recreating containers or wiping data—PostgreSQL and MinIO data persist in Docker volumes across conversations:

```bash
"$STACK" status
"$STACK" health
```

- If containers exist and are stopped, `"$STACK" up` restarts/recreates them while **preserving** the PostgreSQL (`v1-sync-api_clinicez_local_pg17_data`) and MinIO (`v1-sync-api_clinicez_local_minio_data`) volumes.
- Always check whether a stale frontend server from another git worktree is bound to ports `3000`, `3001`, `8081`, or `8082` (`lsof -iTCP:3000,3001,8081,8082 -sTCP:LISTEN`) before testing UI edits from your active workspace.

### 3.2. Spin Up the Full Local Backend Stack
```bash
"$STACK" up
```
This idempotently:
1. Creates the `v1-sync-api_default` network.
2. Starts `clinicez-local-pg17` (running `deploy/v1-sync-api/init-local-dbs.sql` on first boot), `clinicez-local-minio`, and `clinicez-local-mailpit` (`MP_SMTP_BIND_ADDR=0.0.0.0:2525`).
3. Builds any missing Docker images (`interop-hub`, `portal-api`, `clinic-api`, `patient-api`).
4. Generates secret-safe runtime `.env` files in `/tmp/clinicez-local-stack/` from `configuration.txt`.
5. Starts `interop-hub`, `portal-api`, `clinic-api`, and `patient-api`, points `CLINICEZ-PORTAL_DB` mailer settings to `clinicez-local-mailpit:2525` (`Auto`), and waits for HTTP 200 on every `/health` endpoint.

### 3.3. Rapid Code-Fix & Rebuild Loop
After editing backend C# code, rebuild only the changed service(s) and recreate their container(s):

```bash
"$STACK" rebuild portal-api clinic-api
# or rebuild a single service / all backend services:
"$STACK" rebuild patient-api
"$STACK" rebuild all
```

### 3.4. Start Local Frontend Servers
Launch each frontend in its own background daemon (or terminal tab) from the **active workspace**:

```bash
# Portal Web (http://localhost:3000)
"$STACK" start-frontend portal-web

# Admin Web (http://localhost:3001)
"$STACK" start-frontend admin-web

# Clinic App Web (http://localhost:8081)
"$STACK" start-frontend clinic-app

# Patient App Web (http://localhost:8082)
"$STACK" start-frontend patient-app
```

> **Note for Expo Web (`clinic-app` / `patient-app`):** If Metro returns HTTP 500 with `UnableToResolveError` (e.g. missing `@expo-google-fonts/*`), run `bun install --frozen-lockfile` at the repo root and restart with `EXPO_CLEAR=1 "$STACK" start-frontend patient-app`.

### 3.5. Inspect Captured Emails (Mailpit) & Logs
```bash
"$STACK" mailpit                 # List captured email subjects & recipients
"$STACK" logs portal-api         # Tail last 80 lines of a container
```
- Open `http://localhost:8025` in the browser to inspect HTML/text bodies, confirmation links, and 6-digit OTP codes.
- To test **live Resend** instead of Mailpit, see [references/seeding-and-troubleshooting.md](./references/seeding-and-troubleshooting.md#4-mailpit-vs-live-resend-smtp).

### 3.6. Stop or Reset the Stack
```bash
"$STACK" down                    # Stops & removes containers (KEEPS DB & MinIO volumes)
"$STACK" reset-data --yes        # Destructive: wipes local Postgres & MinIO volumes
```

---

## 4. Verification & Troubleshooting Playbooks

When seeding workspaces/clinicians, signing local facility licenses, debugging Interop Hub delivery, or running page-by-page browser walkthroughs, read [references/seeding-and-troubleshooting.md](./references/seeding-and-troubleshooting.md).

### Quick Validation Checklist After Any Fix
1. `"$STACK" health` returns `200` for `interop-hub`, `portal-api`, `clinic-api`, `patient-api`, `mailpit`, and active frontends.
2. Backend unit tests pass (`dotnet test` on touched projects) and frontend typechecks/tests pass (`bun run typecheck:admin`, `bun run test:admin`, `bun run typecheck:clinic`, `bun run test:clinic`, `bun run test:portal`).
3. Verify affected UI pages and click paths in the built-in browser (`browser` subagent with `Model: "flash"`) — pause and ask the user to sign in with Clerk Google Auth if a fresh session requires authentication.
