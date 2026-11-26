export interface E2EConfig {
  v1SyncUrl: string;
  v1SyncAdminKey: string;
  v1SyncBearerToken: string;
  adminWebUrl: string;
  minioEndpoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  clinicR2Bucket: string;
  patientR2Bucket: string;
  pgHost: string;
  pgPort: number;
  pgUser: string;
  pgPassword: string;
  clinicMasterSecret: string;
  patientMasterSecret: string;
  mockOriginPort: number;
  mockOriginContainerUrl: string;
  useLiveAzureSample: boolean;
  localV1SourceEnabled: boolean;
  maxFileSizeBytes: number;
}

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === "") return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function parseIntOrDefault(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value.trim() === "") return defaultValue;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): E2EConfig {
  return {
    v1SyncUrl: (env.V1_SYNC_URL ?? "http://127.0.0.1:5099").replace(/\/+$/, ""),
    v1SyncAdminKey: env.V1_SYNC_ADMIN_KEY ?? "",
    v1SyncBearerToken: env.V1_SYNC_BEARER_TOKEN ?? "",
    adminWebUrl: (env.ADMIN_WEB_URL ?? "http://localhost:3001").replace(/\/+$/, ""),
    minioEndpoint: (env.MINIO_ENDPOINT ?? "http://127.0.0.1:9000").replace(/\/+$/, ""),
    minioAccessKey: env.MINIO_ACCESS_KEY ?? "clinicez_minio_admin",
    minioSecretKey: env.MINIO_SECRET_KEY ?? "clinicez_minio_dev_password_123",
    clinicR2Bucket: env.CLINIC_R2_BUCKET ?? "clinicez-clinic-local",
    patientR2Bucket: env.PATIENT_R2_BUCKET ?? "clinicez-patient-local",
    pgHost: env.PG_HOST ?? "127.0.0.1",
    pgPort: parseIntOrDefault(env.PG_PORT, 5439),
    pgUser: env.PG_USER ?? "clinicez_local",
    pgPassword: env.PG_PASSWORD ?? "clinicez_local_dev_password",
    clinicMasterSecret:
      env.CLINIC_MASTER_SECRET ?? "dev-only-clinic-encryption-secret-never-use-in-production",
    patientMasterSecret:
      env.PATIENT_MASTER_SECRET ?? "dev-patient-encryption-master-secret-32chars-min-ok!",
    mockOriginPort: parseIntOrDefault(env.E2E_MOCK_ORIGIN_PORT, 5199),
    mockOriginContainerUrl: (
      env.E2E_MOCK_ORIGIN_CONTAINER_URL ?? "http://host.docker.internal:5199"
    ).replace(/\/+$/, ""),
    useLiveAzureSample: parseBool(env.E2E_USE_LIVE_AZURE_SAMPLE, false),
    localV1SourceEnabled: parseBool(env.E2E_LOCAL_V1_SOURCE_ENABLED, false),
    maxFileSizeBytes: parseIntOrDefault(env.E2E_MAX_FILE_SIZE_BYTES, 50 * 1024 * 1024),
  };
}
