# Track 3 Object Storage Migration (`TRACK3_STORAGE`) — Opaque-Box E2E Suite

Zero-dependency Bun/TypeScript opaque-box E2E verification suite for Track 3 Object Storage Migration (`services/v1-sync-api/e2e-track3/`).

## Runner Modes

- **Offline Smoke (`--smoke`, default)**: Validates TypeScript types, non-production Neon/VPS guardrails, zero-PHI scanner, exact CMK/PMK HKDF-SHA256 + AES-256-GCM cryptographic parity, mock-origin HTTP fault injection, and Tier 1–4 suite structure without requiring Docker/MinIO/API.
  ```bash
  bun run services/v1-sync-api/e2e-track3/run.ts --smoke
  ```

- **Live Stack (`--live`)**: Executes Tiers 1–4 (`>=104` opaque-box test cases) against the local Docker PG17 + MinIO + `clinicez-v1-sync-api` + `admin-web` stack using strictly synthetic `e2e_t3_<runId>` fixtures cleaned up automatically in `finally`/`afterAll`.
  ```bash
  bun run services/v1-sync-api/e2e-track3/run.ts --live
  ```

## Environment Variables (with Local Defaults)

| Variable | Default | Purpose |
|---|---|---|
| `V1_SYNC_URL` | `http://127.0.0.1:5099` | Local `v1-sync-api` base URL |
| `V1_SYNC_ADMIN_KEY` | `""` | Sent as `X-V1-Sync-Admin-Key` when configured |
| `V1_SYNC_BEARER_TOKEN` | `""` | Optional `Authorization: Bearer` token |
| `ADMIN_WEB_URL` | `http://localhost:3001` | Local `apps/admin-web` Vite dev server |
| `MINIO_ENDPOINT` | `http://127.0.0.1:9000` | Local Docker Desktop MinIO endpoint |
| `MINIO_ACCESS_KEY` | `clinicez_minio_admin` | MinIO access key |
| `MINIO_SECRET_KEY` | `clinicez_minio_dev_password_123` | MinIO secret key |
| `CLINIC_R2_BUCKET` | `clinicez-clinic-local` | Isolated Clinic encrypted `.cez` bucket |
| `PATIENT_R2_BUCKET` | `clinicez-patient-local` | Isolated Patient encrypted `.cez` bucket |
| `PG_HOST` / `PG_PORT` | `127.0.0.1` / `5439` | Local PG17 host & port |
| `PG_USER` / `PG_PASSWORD` | `clinicez_local` / `clinicez_local_dev_password` | Local PG17 credentials |
| `CLINIC_MASTER_SECRET` | `dev-only-clinic-encryption-secret-never-use-in-production` | Clinic CMK master secret |
| `PATIENT_MASTER_SECRET` | `dev-patient-encryption-master-secret-32chars-min-ok!` | Patient PMK master secret |
| `E2E_MOCK_ORIGIN_PORT` | `5199` | Host port for deterministic mock Azure Blob #1 origin |
| `E2E_MOCK_ORIGIN_CONTAINER_URL` | `http://host.docker.internal:5199` | Container callback URL |
| `E2E_USE_LIVE_AZURE_SAMPLE` | `false` | Optional flag for live Azure Blob #1 sample runs |

## M3 Live Stack Coordination Notes

1. **Local Admin Auth**: Start `clinicez-v1-sync-api` in `Development` with either `V1Sync__LocalAdminKey` matching `V1_SYNC_ADMIN_KEY`, or `V1Sync__AllowUnauthenticatedLocalDev=true` so automated E2E requests authenticate cleanly without interactive Clerk browser login.
2. **Development-Only Mock Origin Override**: Configure `Track3Storage__AzureBlob1OriginOverride=http://host.docker.internal:5199` in local `Development` so canonical `https://clinicezstorage.blob.core.windows.net/prod/e2e-synthetic/...` URLs route deterministically to `lib/mock-origin.ts` without weakening SSRF protection.
3. **Deterministic Auto-Sync Worker Polling**: Configure `V1Sync__DefaultPollIntervalSeconds=10`, `V1Sync__OvernightBackoffStartHourPh=25`, and `V1Sync__OvernightBackoffEndHourPh=0` in the `Development` E2E container env for deterministic 10s Auto-Sync polling regardless of PH overnight hours.
