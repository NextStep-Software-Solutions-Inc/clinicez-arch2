import type { E2EConfig } from "./config.ts";
import { loadConfig } from "./config.ts";
import { assertNonProductionTargetUrl, assertZeroPhi } from "./guardrails.ts";

export type SyncTrack = "TRACK1_CLINIC" | "TRACK2_PATIENT" | "TRACK3_STORAGE";
export type SyncCohortMode = "SCOPED" | "GLOBAL";
export type SyncRunMode = "DRY_RUN" | "BACKFILL" | "INCREMENTAL" | "FINAL_SWEEP";
export type SyncRunStatus = "RUNNING" | "COMPLETED" | "FAILED";
export type Track3ProviderFilter = "ALL" | "AZURE_BLOB_1" | "AZURE_BLOB";
export type Track3TargetPlaneFilter = "BOTH" | "CLINIC_ONLY" | "PATIENT_ONLY";
export type StorageObjectStatus =
  | "PENDING"
  | "MIGRATED"
  | "VERIFIED"
  | "SKIPPED_DEAD_LINK"
  | "SKIPPED_EMPTY_BLOB"
  | "SKIPPED_AUTH_REQUIRED"
  | "SKIPPED_LEGACY_UNSUPPORTED"
  | "FAILED_RETRYABLE"
  | "FAILED_PERMANENT";

export interface SyncSystemStatusResponse {
  environmentLabel: string;
  v1SourceConnected: boolean;
  clinicDbConnected: boolean;
  patientDbConnected: boolean;
  syncLedgerConnected: boolean;
  v1SyncTriggersInstalled: boolean;
  v1SyncTriggerTableCount: number;
  v1ChangelogMaxSeq: number;
  backgroundWorkerEnabled: boolean;
  workerLastHeartbeatUtc: string | null;
  activeBindingsCount: number;
  openConflictsCount: number;
  clinicR2Connected: boolean;
  patientR2Connected: boolean;
  clinicEncryptionConfigured: boolean;
  patientEncryptionConfigured: boolean;
  azureBlob1Configured: boolean;
  clinicPendingStorageCount: number;
  patientPendingStorageCount: number;
  clinicTotalStorageCount: number;
  patientTotalStorageCount: number;
}

export interface SyncBinding {
  id: string;
  track: SyncTrack;
  name: string;
  v1ClinicId: number | null;
  v1OrgId: number | null;
  v2TenantId: string | null;
  v2ClinicId: string | null;
  patientCohortMode: SyncCohortMode;
  autoSyncEnabled: boolean;
  pollIntervalSeconds: number;
  isFrozen: boolean;
  frozenAt: string | null;
  frozenBy: string | null;
  freezeReason: string | null;
  createdAt: string;
  updatedAt: string;
  lastChangelogSeq: number;
  lastPolledAt: string | null;
  openConflictCount: number;
  hasSyncHistory: boolean;
  batchSize: number;
}

export interface CreateBindingRequest {
  track: SyncTrack | string;
  name: string;
  v1ClinicId?: number | null;
  v1OrgId?: number | null;
  v2TenantId?: string | null;
  v2ClinicId?: string | null;
  patientCohortMode?: SyncCohortMode | string | null;
  autoSyncEnabled?: boolean;
  pollIntervalSeconds?: number;
  batchSize?: number;
}

export interface UpdateBindingRequest {
  name?: string | null;
  patientCohortMode?: string | null;
  autoSyncEnabled?: boolean | null;
  pollIntervalSeconds?: number | null;
  updateMapping?: boolean;
  v1ClinicId?: number | null;
  v1OrgId?: number | null;
  v2TenantId?: string | null;
  v2ClinicId?: string | null;
  forceMappingChange?: boolean;
  batchSize?: number | null;
}

export interface RunSyncRequest {
  sampleLimit?: number | null;
  forceV1OnConflict?: boolean;
  batchSize?: number | null;
  providerFilter?: Track3ProviderFilter | string | null;
  targetPlaneFilter?: Track3TargetPlaneFilter | string | null;
  maxConcurrency?: number | null;
  retryFailedOnly?: boolean;
}

export interface SyncRunSummary {
  track: string;
  mode: string;
  sampleLimit?: number | null;
  batchSize: number;
  durationMs: number;
  processedItems: number;
  totalItems: number;
  percentComplete: number;
  notes?: string[];
  verboseLogs?: string[];
  bytesDownloaded?: number;
  bytesUploaded?: number;
  transferRateMbps?: number;
  clinicCopiesMigrated?: number;
  patientCopiesMigrated?: number;
  skippedCount?: number;
  failedCount?: number;
  overlapSavedDownloads?: number;
  [key: string]: unknown;
}

export interface SyncRunRecord {
  id: string;
  bindingId: string;
  mode: SyncRunMode;
  sampleLimit: number | null;
  status: SyncRunStatus;
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
  summary: SyncRunSummary;
  errorMessage: string | null;
}

export interface StorageObjectItem {
  targetPlane: "CLINIC_ATTACHMENT" | "PATIENT_FILE";
  targetEntityId: string;
  ownerId: string;
  tenantId: string | null;
  sourceProvider: "AZURE_BLOB_1" | "AZURE_BLOB_2" | "GOOGLE_DRIVE" | "OTHER";
  status: StorageObjectStatus;
  sourceSizeBytes: number;
  encryptedSizeBytes: number | null;
  attemptCount: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  migratedAt: string | null;
  verifiedAt: string | null;
  updatedAt: string;
}

export interface StorageObjectsResponse {
  bindingId: string;
  totalCount: number;
  items: StorageObjectItem[];
}

export interface ParityEntityCheck {
  entityType: string;
  v1ExpectedCount: number;
  v2ActualCount: number;
  mappedLedgerCount: number;
  isMatched: boolean;
  notes?: string | null;
}

export interface ParityReportResponse {
  bindingId: string;
  track: string;
  bindingName: string;
  isFrozen: boolean;
  changelogMaxSeq: number;
  lastCursorSeq: number;
  changelogLag: number;
  openConflictsCount: number;
  readyToFreeze: boolean;
  checks: ParityEntityCheck[];
  generatedAtUtc: string;
}

export interface FinalSweepSyncResponse {
  run: SyncRunRecord;
  parity?: ParityReportResponse;
}

export interface FreezeBindingResponse {
  binding: SyncBinding;
  uninstallSqlHint: string;
}

export interface DeleteBindingResponse {
  deletedId: string;
  name: string;
  hadSyncHistory: boolean;
}

export interface SyncConflictRecord {
  id: string;
  bindingId: string;
  runId: string | null;
  entityType: string;
  v1Id: string;
  v2Id: string;
  conflictType: string;
  changedFields: string[];
  status: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiResult<T = unknown> {
  status: number;
  ok: boolean;
  headers: Headers;
  data: T;
  rawText: string;
}

export class V1SyncApiClient {
  private readonly baseUrl: string;
  private readonly adminKey: string;
  private readonly bearerToken: string;

  constructor(config: E2EConfig = loadConfig()) {
    assertNonProductionTargetUrl(config.v1SyncUrl, "V1_SYNC_URL");
    this.baseUrl = config.v1SyncUrl;
    this.adminKey = config.v1SyncAdminKey;
    this.bearerToken = config.v1SyncBearerToken;
  }

  private buildHeaders(extra?: Record<string, string>): HeadersInit {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...extra,
    };
    if (this.adminKey) {
      headers["X-V1-Sync-Admin-Key"] = this.adminKey;
    } else if (this.bearerToken) {
      headers["Authorization"] = `Bearer ${this.bearerToken}`;
    }
    return headers;
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<ApiResult<T>> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const hasBody = body !== undefined;
    const response = await fetch(url, {
      method,
      headers: this.buildHeaders({
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...extraHeaders,
      }),
      body: hasBody ? JSON.stringify(body) : undefined,
    });

    const rawText = await response.text();
    assertZeroPhi(rawText, `${method} ${path}`);

    let data: T;
    if (!rawText) {
      data = null as T;
    } else {
      try {
        data = JSON.parse(rawText) as T;
      } catch {
        data = rawText as unknown as T;
      }
    }

    return {
      status: response.status,
      ok: response.ok,
      headers: response.headers,
      data,
      rawText,
    };
  }

  health(): Promise<ApiResult<{ service: string; status: string; utc: string }>> {
    return this.request("GET", "/health");
  }

  getStatus(): Promise<ApiResult<SyncSystemStatusResponse>> {
    return this.request("GET", "/api/v1/v1-sync/status");
  }

  listBindings(): Promise<ApiResult<SyncBinding[]>> {
    return this.request("GET", "/api/v1/v1-sync/bindings");
  }

  createBinding(req: CreateBindingRequest): Promise<ApiResult<SyncBinding>> {
    return this.request("POST", "/api/v1/v1-sync/bindings", req);
  }

  patchBinding(id: string, req: UpdateBindingRequest): Promise<ApiResult<SyncBinding>> {
    return this.request("PATCH", `/api/v1/v1-sync/bindings/${id}`, req);
  }

  deleteBinding(id: string, force = false): Promise<ApiResult<DeleteBindingResponse>> {
    return this.request("DELETE", `/api/v1/v1-sync/bindings/${id}?force=${force ? "true" : "false"}`);
  }

  dryRun(id: string, req: RunSyncRequest = {}, asyncMode = false): Promise<ApiResult<SyncRunRecord>> {
    return this.request(
      "POST",
      `/api/v1/v1-sync/bindings/${id}/dry-run?asyncMode=${asyncMode ? "true" : "false"}`,
      req,
    );
  }

  backfill(id: string, req: RunSyncRequest = {}, asyncMode = false): Promise<ApiResult<SyncRunRecord>> {
    return this.request(
      "POST",
      `/api/v1/v1-sync/bindings/${id}/backfill?asyncMode=${asyncMode ? "true" : "false"}`,
      req,
    );
  }

  pullNow(id: string, req: RunSyncRequest = {}): Promise<ApiResult<SyncRunRecord>> {
    return this.request("POST", `/api/v1/v1-sync/bindings/${id}/pull-now`, req);
  }

  finalSweep(
    id: string,
    req: RunSyncRequest = {},
    asyncMode = false,
  ): Promise<ApiResult<FinalSweepSyncResponse>> {
    return this.request(
      "POST",
      `/api/v1/v1-sync/bindings/${id}/final-sweep?asyncMode=${asyncMode ? "true" : "false"}`,
      req,
    );
  }

  listRuns(id: string, limit = 25, offset = 0): Promise<ApiResult<SyncRunRecord[]>> {
    return this.request("GET", `/api/v1/v1-sync/bindings/${id}/runs?limit=${limit}&offset=${offset}`);
  }

  async waitForRun(
    bindingId: string,
    runId: string,
    timeoutMs = 30_000,
    pollIntervalMs = 250,
  ): Promise<SyncRunRecord> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await this.listRuns(bindingId, 50, 0);
      if (res.ok && Array.isArray(res.data)) {
        const match = res.data.find((r) => r.id === runId);
        if (match && match.status !== "RUNNING") {
          return match;
        }
      }
      await Bun.sleep(pollIntervalMs);
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for run ${runId} on binding ${bindingId}.`);
  }

  getStorageObjects(
    id: string,
    params: {
      status?: string;
      provider?: string;
      plane?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<ApiResult<StorageObjectsResponse>> {
    const qs = new URLSearchParams();
    if (params.status !== undefined) qs.set("status", params.status);
    if (params.provider !== undefined) qs.set("provider", params.provider);
    if (params.plane !== undefined) qs.set("plane", params.plane);
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    if (params.offset !== undefined) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return this.request(
      "GET",
      `/api/v1/v1-sync/bindings/${id}/storage-objects${query ? `?${query}` : ""}`,
    );
  }

  retryFailed(
    id: string,
    options: { asyncMode?: boolean; includeAuthSkipped?: boolean } = {},
  ): Promise<ApiResult<SyncRunRecord>> {
    const qs = new URLSearchParams();
    if (options.asyncMode !== undefined) qs.set("asyncMode", String(options.asyncMode));
    if (options.includeAuthSkipped !== undefined) {
      qs.set("includeAuthSkipped", String(options.includeAuthSkipped));
    }
    const query = qs.toString();
    return this.request(
      "POST",
      `/api/v1/v1-sync/bindings/${id}/retry-failed${query ? `?${query}` : ""}`,
      {},
    );
  }

  getParity(id: string): Promise<ApiResult<ParityReportResponse>> {
    return this.request("GET", `/api/v1/v1-sync/bindings/${id}/parity`);
  }

  freeze(id: string, confirmationToken: string, reason?: string): Promise<ApiResult<FreezeBindingResponse>> {
    return this.request("POST", `/api/v1/v1-sync/bindings/${id}/freeze`, {
      confirmationToken,
      reason: reason ?? "e2e synthetic freeze test",
    });
  }

  unfreeze(id: string): Promise<ApiResult<SyncBinding>> {
    return this.request("POST", `/api/v1/v1-sync/bindings/${id}/unfreeze`, {});
  }

  listConflicts(
    id: string,
    status?: string,
    limit = 50,
    offset = 0,
  ): Promise<ApiResult<PaginatedResponse<SyncConflictRecord>>> {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    qs.set("limit", String(limit));
    qs.set("offset", String(offset));
    return this.request("GET", `/api/v1/v1-sync/bindings/${id}/conflicts?${qs.toString()}`);
  }
}
