import { v1SyncClient } from '@/lib/v1SyncApi';
import type {
  PatientIdentityDirectoryResponseDto,
  PatientIdentityFilter,
  ReconcilePatientIdentityPayload,
  ReconcilePatientIdentityResponseDto,
} from '@/services/admin.service';

export type SyncTrack = 'TRACK1_CLINIC' | 'TRACK2_PATIENT' | 'TRACK3_STORAGE';
export type SyncCohortMode = 'SCOPED' | 'GLOBAL';
export type ConflictResolution = 'KEEP_V2' | 'FORCE_V1' | 'IGNORE';
export type StorageProviderFilter = 'ALL' | 'AZURE_BLOB_1' | 'VERCEL_BLOB';
export type StorageTargetPlaneFilter = 'BOTH' | 'CLINIC_ONLY' | 'PATIENT_ONLY';
export type StorageTargetPlane =
  | 'CLINIC_ATTACHMENT'
  | 'PATIENT_FILE'
  | 'CLINIC_PATIENT_AVATAR'
  | 'PATIENT_AVATAR';
export type StorageSourceProvider =
  | 'AZURE_BLOB_1'
  | 'AZURE_BLOB_2'
  | 'VERCEL_BLOB'
  | 'GOOGLE_DRIVE'
  | 'OTHER';
export type StorageObjectStatus =
  | 'PENDING'
  | 'MIGRATED'
  | 'VERIFIED'
  | 'SKIPPED_DEAD_LINK'
  | 'SKIPPED_EMPTY_BLOB'
  | 'SKIPPED_AUTH_REQUIRED'
  | 'SKIPPED_LEGACY_UNSUPPORTED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_PERMANENT';

export interface RunSyncOptions {
  asyncMode?: boolean;
  batchSize?: number;
  providerFilter?: StorageProviderFilter;
  targetPlaneFilter?: StorageTargetPlaneFilter;
  maxConcurrency?: number;
  retryFailedOnly?: boolean;
}

export const STRICT_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string | null | undefined): boolean {
  if (!value) return false;
  return STRICT_UUID_REGEX.test(value.trim());
}

export interface V2ClinicOptionDto {
  id: string;
  name: string;
  tenantId?: string | null;
  tenantSlug?: string | null;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number | null;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export function normalizePaginatedResult<T>(
  data: T[] | { items?: T[]; total?: number; limit?: number; offset?: number } | null | undefined,
  limit: number,
  offset: number
): PaginatedResult<T> {
  if (Array.isArray(data)) {
    return {
      items: data,
      total: null,
      limit,
      offset,
      hasMore: limit > 0 && data.length >= limit,
    };
  }
  const items = Array.isArray(data?.items) ? data.items : [];
  const total = typeof data?.total === 'number' ? data.total : null;
  const resolvedLimit = typeof data?.limit === 'number' ? data.limit : limit;
  const resolvedOffset = typeof data?.offset === 'number' ? data.offset : offset;
  const hasMore =
    total !== null
      ? resolvedOffset + items.length < total
      : resolvedLimit > 0 && items.length >= resolvedLimit;
  return {
    items,
    total,
    limit: resolvedLimit,
    offset: resolvedOffset,
    hasMore,
  };
}

export function normalizeV2ClinicOptions(raw: unknown): V2ClinicOptionDto[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown[] }).items)
      ? (raw as { items: unknown[] }).items
      : [];

  const seen = new Set<string>();
  const normalized: V2ClinicOptionDto[] = [];

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    const rawId = obj.id ?? obj.clinicId ?? obj.v2ClinicId;
    if (typeof rawId !== 'string' || !rawId.trim()) continue;
    const id = rawId.trim();
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const rawName = obj.name ?? obj.clinicName ?? obj.tenantSlug ?? id;
    const rawTenantId = obj.tenantId;
    const rawTenantSlug = obj.tenantSlug ?? obj.v2TenantId;

    normalized.push({
      id,
      name: typeof rawName === 'string' && rawName.trim() ? rawName.trim() : id,
      tenantId: typeof rawTenantId === 'string' ? rawTenantId : null,
      tenantSlug: typeof rawTenantSlug === 'string' ? rawTenantSlug : null,
    });
  }

  return normalized;
}

export interface SyncSystemStatusDto {
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
  clinicR2Connected?: boolean;
  patientR2Connected?: boolean;
  clinicEncryptionConfigured?: boolean;
  patientEncryptionConfigured?: boolean;
  azureBlob1Configured?: boolean;
  clinicPendingStorageCount?: number;
  patientPendingStorageCount?: number;
  clinicTotalStorageCount?: number;
  patientTotalStorageCount?: number;
  clinicSkippedStorageCount?: number;
  patientSkippedStorageCount?: number;
}

export interface V1TenantCatalogItemDto {
  id: number;
  tenantUid: string | null;
  name: string;
  clinicCount: number;
  organizationCount: number;
}

export interface V1ClinicCatalogItemDto {
  id: number;
  clinicUid: string | null;
  name: string;
  clinicPatientCount: number;
  appointmentCount: number;
  consultationCount: number;
  tenantId?: number | null;
}

export interface V1OrgCatalogItemDto {
  id: number;
  orgUid: string | null;
  name: string;
  memberCount: number;
  studentCount: number;
  employeeCount: number;
  tenantId?: number | null;
}

export interface CustomFieldExpansionPreviewDto {
  fieldKey: string;
  label: string;
  dataType: string;
  category: string;
  sourceOrigin: string;
  populatedV1Count: number;
}

export interface V1CatalogResponseDto {
  tenants?: V1TenantCatalogItemDto[];
  clinics: V1ClinicCatalogItemDto[];
  organizations: V1OrgCatalogItemDto[];
  totalActiveV1Users: number;
  clerkV1Users: number;
  legacyAuth0V1Users: number;
  totalV1Files: number;
  privateV1Files: number;
  dynamicCustomFieldsPreview: CustomFieldExpansionPreviewDto[];
}

export interface SyncBindingDto {
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
  hasSyncHistory?: boolean;
  batchSize?: number;
  hasCompletedPreview?: boolean;
  hasCompletedMigration?: boolean;
}

export interface SyncRuntimeSettingsDto {
  environmentLabel: string;
  maxPoolSize: number;
  activeMaxPoolSize: number;
  poolSizeRestartRequired: boolean;
  defaultBatchSize: number;
  enableBackgroundWorker: boolean;
  defaultPollIntervalSeconds: number;
  overnightPollIntervalSeconds: number;
  overnightBackoffStartHourPh: number;
  overnightBackoffEndHourPh: number;
  storageEnabled: boolean;
  storageMaxConcurrency: number;
  storageMaxFileSizeBytes: number;
  storageVerificationSampleRate: number;
  azureBlob1Enabled: boolean;
  clinicStorageConfigured: boolean;
  patientStorageConfigured: boolean;
  clinicEncryptionConfigured: boolean;
  patientEncryptionConfigured: boolean;
  updatedBy: string | null;
  updatedAt: string;
}

export interface UpdateSyncRuntimeSettingsPayload {
  environmentLabel?: string;
  maxPoolSize?: number;
  defaultBatchSize?: number;
  enableBackgroundWorker?: boolean;
  defaultPollIntervalSeconds?: number;
  overnightPollIntervalSeconds?: number;
  overnightBackoffStartHourPh?: number;
  overnightBackoffEndHourPh?: number;
  storageEnabled?: boolean;
  storageMaxConcurrency?: number;
  storageMaxFileSizeBytes?: number;
  storageVerificationSampleRate?: number;
  azureBlob1Enabled?: boolean;
}

export interface MappingGuideColumnRuleDto {
  v1Column: string;
  v2Column: string;
  transform?: string | null;
}

export interface MappingGuideEntityItemDto {
  key: string;
  displayName: string;
  category: string;
  v1SourceTables: string;
  v2TargetTable: string;
  summary: string;
  rules: string[];
  columns: MappingGuideColumnRuleDto[];
  conflictPolicy?: string | null;
}

export interface MappingGuideTrackSectionDto {
  track: SyncTrack;
  title: string;
  targetDatabase: string;
  overview: string;
  globalRules: string[];
  entities: MappingGuideEntityItemDto[];
}

export interface MappingGuideResponseDto {
  version: string;
  coreProtections: string[];
  tracks: MappingGuideTrackSectionDto[];
}

export interface EntitySyncCounterDto {
  created: number;
  updated: number;
  unchanged: number;
  skippedV2Wins: number;
  shieldedDeletes: number;
  adoptedExisting: number;
  errors: number;
}

export interface SyncRunSummaryDto {
  track?: string;
  mode?: string;
  sampleLimit?: number | null;
  batchSize?: number;
  durationMs?: number;
  cohortPatientCount?: number;
  startChangelogSeq?: number;
  endChangelogSeq?: number;
  currentStage?: string | null;
  stageIndex?: number;
  totalStages?: number;
  processedItems?: number;
  totalItems?: number;
  percentComplete?: number;
  lastProgressAtUtc?: string | null;
  customFieldsProvisioned?: string[];
  entities?: Record<string, EntitySyncCounterDto>;
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
}

export interface SyncRunRecordDto {
  id: string;
  bindingId: string;
  mode: 'DRY_RUN' | 'BACKFILL' | 'INCREMENTAL' | 'FINAL_SWEEP';
  sampleLimit: number | null;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
  summary: SyncRunSummaryDto;
  errorMessage: string | null;
}

export interface SyncChangeDiffDto {
  id: number;
  runId: string;
  bindingId: string;
  entityType: string;
  v1Id: string;
  v2Id: string | null;
  action: string;
  changedFields: string[];
  createdAt: string;
}

export interface SyncConflictDto {
  id: string;
  bindingId: string;
  runId: string | null;
  entityType: string;
  v1Id: string;
  v2Id: string;
  conflictType: string;
  changedFields: string[];
  status: 'OPEN' | 'RESOLVED_KEEP_V2' | 'RESOLVED_FORCE_V1' | 'RESOLVED_IGNORE' | 'IGNORED';
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ResolveConflictResponseDto {
  conflict: SyncConflictDto;
  syncResult?: unknown;
  run?: SyncRunRecordDto | null;
  message?: string | null;
}

export type FieldDiffClassification =
  | 'V2_FILLED_EMPTY'
  | 'V2_CLEARED_VALUE'
  | 'FORMAT_ONLY'
  | 'MODIFIED'
  | 'UNCHANGED';

export type FieldSensitivity =
  | 'SAFE_ENUM_OR_BOOL'
  | 'PII_MASKED'
  | 'CLINICAL_MEASUREMENT'
  | 'CLINICAL_NOTE'
  | 'STRUCTURED_JSON';

export type ConflictRecordStatus =
  | 'ACTIVE'
  | 'SOFT_DELETED'
  | 'MISSING'
  | 'MISSING_OR_OUT_OF_SCOPE'
  | 'UNAVAILABLE';

export type ConflictInspectorMode = 'FIELD_DIFF' | 'METADATA_ONLY';

export interface ConflictSubFieldDiffDto {
  key: string;
  classification: FieldDiffClassification;
  isChanged: boolean;
  v1Preview: string | null;
  v2Preview: string | null;
  v1Value?: string | null;
  v2Value?: string | null;
}

export interface ConflictFieldDiffDto {
  fieldName: string;
  label: string;
  classification: FieldDiffClassification;
  isChanged: boolean;
  sensitivity: FieldSensitivity;
  v1Preview: string | null;
  v2Preview: string | null;
  v1Value?: string | null;
  v2Value?: string | null;
  subFieldDiffs?: ConflictSubFieldDiffDto[] | null;
}

export interface ConflictDetailDto {
  conflict: SyncConflictDto;
  bindingName: string;
  track: SyncTrack;
  inspectorMode: ConflictInspectorMode;
  v1RecordStatus: ConflictRecordStatus;
  v2RecordStatus: ConflictRecordStatus;
  v1UpdatedAtUtc: string | null;
  v2UpdatedAtUtc: string | null;
  isStale: boolean;
  hasV1HashDrift: boolean;
  hasV2HashDrift: boolean;
  recordedV1Hash: string | null;
  currentV1Hash: string | null;
  recordedV2Hash: string | null;
  currentV2Hash: string | null;
  staleReasons: string[];
  valuesRevealed: boolean;
  clinicalNotesRedactedByPolicy: boolean;
  note: string | null;
  fields: ConflictFieldDiffDto[];
}

export interface ConflictReportFieldSummaryDto {
  fieldName: string;
  classification: FieldDiffClassification;
}

export interface ConflictReviewReportItemDto {
  conflictId: string;
  entityType: string;
  v1Id: string;
  v2Id: string;
  conflictType: string;
  status: string;
  inspectorMode: ConflictInspectorMode;
  v1RecordStatus: ConflictRecordStatus;
  v2RecordStatus: ConflictRecordStatus;
  isStale: boolean;
  v1UpdatedAtUtc: string | null;
  v2UpdatedAtUtc: string | null;
  changedFields: string[];
  fieldClassifications: ConflictReportFieldSummaryDto[];
  resolvedBy: string | null;
  resolvedAtUtc: string | null;
  createdAtUtc: string;
}

export interface ConflictReviewReportDto {
  bindingId: string;
  bindingName: string;
  track: SyncTrack;
  statusFilter: string;
  totalConflicts: number;
  truncated: boolean;
  generatedAtUtc: string;
  items: ConflictReviewReportItemDto[];
}

export interface ExportConflictsReportResult {
  blob: Blob;
  fileName: string;
  contentType: string;
}

export interface ParityEntityCheckDto {
  entityType: string;
  v1ExpectedCount: number;
  v2ActualCount: number;
  mappedLedgerCount: number;
  isMatched: boolean;
  notes?: string | null;
}

export interface ParityReportDto {
  bindingId: string;
  track: SyncTrack;
  bindingName: string;
  isFrozen: boolean;
  changelogMaxSeq: number;
  lastCursorSeq: number;
  changelogLag: number;
  openConflictsCount: number;
  readyToFreeze: boolean;
  checks: ParityEntityCheckDto[];
  generatedAtUtc: string;
}

export interface StorageObjectItemDto {
  targetPlane: StorageTargetPlane;
  targetEntityId: string;
  ownerId: string;
  tenantId: string | null;
  sourceProvider: StorageSourceProvider;
  status: StorageObjectStatus;
  sourceSizeBytes: number;
  encryptedSizeBytes: number;
  attemptCount: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  migratedAt: string | null;
  verifiedAt: string | null;
  updatedAt: string;
}

export interface StorageObjectsPageDto {
  bindingId: string;
  totalCount: number;
  items: StorageObjectItemDto[];
  failedRetryableCount?: number;
}

export interface CreateBindingPayload {
  track: SyncTrack;
  name: string;
  v1ClinicId: number | null;
  v1OrgId: number | null;
  v2TenantId: string | null;
  v2ClinicId: string | null;
  patientCohortMode?: SyncCohortMode;
  autoSyncEnabled?: boolean;
  pollIntervalSeconds?: number;
  batchSize?: number;
}

export interface UpdateBindingPayload {
  name?: string;
  patientCohortMode?: SyncCohortMode;
  autoSyncEnabled?: boolean;
  pollIntervalSeconds?: number;
  batchSize?: number;
  updateMapping?: boolean;
  v1ClinicId?: number | null;
  v1OrgId?: number | null;
  v2TenantId?: string | null;
  v2ClinicId?: string | null;
  forceMappingChange?: boolean;
}

export interface DeleteBindingResponseDto {
  deletedId: string;
  name: string;
  hadSyncHistory: boolean;
}

export interface TrackingSqlScriptItemDto {
  fileName: string;
  title: string;
  description: string;
  sql: string;
}

export interface TrackingSqlScriptsResponseDto {
  install: TrackingSqlScriptItemDto;
  uninstall: TrackingSqlScriptItemDto;
}

export const v1SyncService = {
  async getStatus(): Promise<SyncSystemStatusDto> {
    const { data } = await v1SyncClient.get<SyncSystemStatusDto>('/status');
    return data;
  },

  async getSettings(): Promise<SyncRuntimeSettingsDto> {
    const { data } = await v1SyncClient.get<SyncRuntimeSettingsDto>('/settings');
    return data;
  },

  async updateSettings(
    payload: UpdateSyncRuntimeSettingsPayload
  ): Promise<SyncRuntimeSettingsDto> {
    const { data } = await v1SyncClient.patch<SyncRuntimeSettingsDto>('/settings', payload);
    return data;
  },

  async getTrackingScripts(): Promise<TrackingSqlScriptsResponseDto> {
    const { data } = await v1SyncClient.get<TrackingSqlScriptsResponseDto>('/tracking-scripts');
    return data;
  },

  async getCatalog(): Promise<V1CatalogResponseDto> {
    const { data } = await v1SyncClient.get<V1CatalogResponseDto>('/v1-catalog');
    return data;
  },

  async listBindings(): Promise<SyncBindingDto[]> {
    const { data } = await v1SyncClient.get<SyncBindingDto[]>('/bindings');
    return data;
  },

  async createBinding(payload: CreateBindingPayload): Promise<SyncBindingDto> {
    const { data } = await v1SyncClient.post<SyncBindingDto>('/bindings', payload);
    return data;
  },

  async updateBinding(id: string, payload: UpdateBindingPayload): Promise<SyncBindingDto> {
    const { data } = await v1SyncClient.patch<SyncBindingDto>(`/bindings/${id}`, payload);
    return data;
  },

  async deleteBinding(id: string, force = false): Promise<DeleteBindingResponseDto> {
    const { data } = await v1SyncClient.delete<DeleteBindingResponseDto>(`/bindings/${id}`, {
      params: force ? { force: true } : undefined,
    });
    return data;
  },

  async runDryRun(
    id: string,
    sampleLimit?: number | null,
    opts?: RunSyncOptions
  ): Promise<SyncRunRecordDto> {
    const { data } = await v1SyncClient.post<SyncRunRecordDto>(
      `/bindings/${id}/dry-run`,
      {
        sampleLimit: sampleLimit ?? null,
        ...(opts?.batchSize ? { batchSize: opts.batchSize } : {}),
        ...(opts?.providerFilter ? { providerFilter: opts.providerFilter } : {}),
        ...(opts?.targetPlaneFilter ? { targetPlaneFilter: opts.targetPlaneFilter } : {}),
        ...(opts?.maxConcurrency !== undefined ? { maxConcurrency: opts.maxConcurrency } : {}),
        ...(opts?.retryFailedOnly !== undefined ? { retryFailedOnly: opts.retryFailedOnly } : {}),
      },
      opts?.asyncMode ? { params: { asyncMode: true } } : undefined
    );
    return data;
  },

  async runBackfill(
    id: string,
    sampleLimit?: number | null,
    opts?: RunSyncOptions
  ): Promise<SyncRunRecordDto> {
    const { data } = await v1SyncClient.post<SyncRunRecordDto>(
      `/bindings/${id}/backfill`,
      {
        sampleLimit: sampleLimit ?? null,
        ...(opts?.batchSize ? { batchSize: opts.batchSize } : {}),
        ...(opts?.providerFilter ? { providerFilter: opts.providerFilter } : {}),
        ...(opts?.targetPlaneFilter ? { targetPlaneFilter: opts.targetPlaneFilter } : {}),
        ...(opts?.maxConcurrency !== undefined ? { maxConcurrency: opts.maxConcurrency } : {}),
        ...(opts?.retryFailedOnly !== undefined ? { retryFailedOnly: opts.retryFailedOnly } : {}),
      },
      opts?.asyncMode ? { params: { asyncMode: true } } : undefined
    );
    return data;
  },

  async pullNow(id: string, opts?: RunSyncOptions): Promise<SyncRunRecordDto> {
    const body = {
      ...(opts?.batchSize ? { batchSize: opts.batchSize } : {}),
      ...(opts?.providerFilter ? { providerFilter: opts.providerFilter } : {}),
      ...(opts?.targetPlaneFilter ? { targetPlaneFilter: opts.targetPlaneFilter } : {}),
      ...(opts?.maxConcurrency !== undefined ? { maxConcurrency: opts.maxConcurrency } : {}),
      ...(opts?.retryFailedOnly !== undefined ? { retryFailedOnly: opts.retryFailedOnly } : {}),
    };
    const { data } = await v1SyncClient.post<SyncRunRecordDto>(
      `/bindings/${id}/pull-now`,
      body,
      opts?.asyncMode ? { params: { asyncMode: true } } : undefined
    );
    return data;
  },

  async runFinalSweep(
    id: string,
    opts?: RunSyncOptions
  ): Promise<{ run: SyncRunRecordDto; parity?: ParityReportDto }> {
    const body = {
      ...(opts?.batchSize ? { batchSize: opts.batchSize } : {}),
      ...(opts?.providerFilter ? { providerFilter: opts.providerFilter } : {}),
      ...(opts?.targetPlaneFilter ? { targetPlaneFilter: opts.targetPlaneFilter } : {}),
      ...(opts?.maxConcurrency !== undefined ? { maxConcurrency: opts.maxConcurrency } : {}),
      ...(opts?.retryFailedOnly !== undefined ? { retryFailedOnly: opts.retryFailedOnly } : {}),
    };
    const { data } = await v1SyncClient.post<{ run: SyncRunRecordDto; parity?: ParityReportDto }>(
      `/bindings/${id}/final-sweep`,
      body,
      opts?.asyncMode ? { params: { asyncMode: true } } : undefined
    );
    return data;
  },

  async getStorageObjects(
    id: string,
    params?: {
      status?: string;
      provider?: string;
      plane?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<StorageObjectsPageDto> {
    const { data } = await v1SyncClient.get<StorageObjectsPageDto>(
      `/bindings/${id}/storage-objects`,
      {
        params: {
          ...(params?.status ? { status: params.status } : {}),
          ...(params?.provider ? { provider: params.provider } : {}),
          ...(params?.plane ? { plane: params.plane } : {}),
          ...(params?.limit !== undefined ? { limit: params.limit } : {}),
          ...(params?.offset !== undefined ? { offset: params.offset } : {}),
        },
      }
    );
    return data;
  },

  async retryFailedStorage(
    id: string,
    opts?: { asyncMode?: boolean; includeAuthSkipped?: boolean }
  ): Promise<SyncRunRecordDto> {
    const { data } = await v1SyncClient.post<SyncRunRecordDto>(
      `/bindings/${id}/retry-failed`,
      {},
      {
        params: {
          asyncMode: opts?.asyncMode ?? true,
          ...(opts?.includeAuthSkipped ? { includeAuthSkipped: true } : {}),
        },
      }
    );
    return data;
  },

  async getParityReport(id: string): Promise<ParityReportDto> {
    const { data } = await v1SyncClient.get<ParityReportDto>(`/bindings/${id}/parity`);
    return data;
  },

  async freezeBinding(id: string, confirmationToken: string, reason?: string): Promise<{ binding: SyncBindingDto; uninstallSqlHint: string }> {
    const { data } = await v1SyncClient.post<{ binding: SyncBindingDto; uninstallSqlHint: string }>(
      `/bindings/${id}/freeze`,
      { confirmationToken, reason }
    );
    return data;
  },

  async unfreezeBinding(id: string): Promise<SyncBindingDto> {
    const { data } = await v1SyncClient.post<SyncBindingDto>(`/bindings/${id}/unfreeze`, {});
    return data;
  },

  async listV2Clinics(): Promise<V2ClinicOptionDto[]> {
    for (const endpoint of ['/clinics', '/tenants']) {
      try {
        const { data } = await v1SyncClient.get<unknown>(endpoint);
        const options = normalizeV2ClinicOptions(data);
        if (options.length > 0) return options;
      } catch {
        // Endpoint may not be exposed on older builds; continue fallback chain
      }
    }
    return [];
  },

  async listRuns(id: string, limit = 20, mode?: string): Promise<SyncRunRecordDto[]> {
    const { data } = await v1SyncClient.get<SyncRunRecordDto[]>(`/bindings/${id}/runs`, {
      params: {
        limit,
        ...(mode ? { mode } : {}),
      },
    });
    return data;
  },

  async listRunDiffs(
    runId: string,
    limit = 50,
    offset = 0
  ): Promise<PaginatedResult<SyncChangeDiffDto>> {
    const { data } = await v1SyncClient.get<
      SyncChangeDiffDto[] | { items?: SyncChangeDiffDto[]; total?: number; limit?: number; offset?: number }
    >(`/runs/${runId}/diffs`, {
      params: { limit, offset },
    });
    return normalizePaginatedResult(data, limit, offset);
  },

  async listBindingDiffs(
    bindingId: string,
    limit = 50,
    offset = 0
  ): Promise<PaginatedResult<SyncChangeDiffDto>> {
    const { data } = await v1SyncClient.get<
      SyncChangeDiffDto[] | { items?: SyncChangeDiffDto[]; total?: number; limit?: number; offset?: number }
    >(`/bindings/${bindingId}/diffs`, {
      params: { limit, offset },
    });
    return normalizePaginatedResult(data, limit, offset);
  },

  async listConflicts(
    id: string,
    options?: string | { status?: string; limit?: number; offset?: number }
  ): Promise<PaginatedResult<SyncConflictDto>> {
    const opts = typeof options === 'string' ? { status: options } : options ?? {};
    const limit = opts.limit ?? 25;
    const offset = opts.offset ?? 0;
    const { data } = await v1SyncClient.get<
      SyncConflictDto[] | { items?: SyncConflictDto[]; total?: number; limit?: number; offset?: number }
    >(`/bindings/${id}/conflicts`, {
      params: {
        ...(opts.status ? { status: opts.status } : {}),
        limit,
        offset,
      },
    });
    return normalizePaginatedResult(data, limit, offset);
  },

  async resolveConflict(
    conflictId: string,
    resolution: ConflictResolution,
    resolvedBy?: string
  ): Promise<ResolveConflictResponseDto> {
    const payload: { resolution: ConflictResolution; resolvedBy?: string } = { resolution };
    if (resolvedBy) {
      payload.resolvedBy = resolvedBy;
    }
    const { data } = await v1SyncClient.post<
      | SyncConflictDto
      | {
          conflict: SyncConflictDto;
          syncResult?: unknown;
          run?: SyncRunRecordDto | null;
          message?: string | null;
        }
    >(`/conflicts/${conflictId}/resolve`, payload);

    if (data && typeof data === 'object' && 'conflict' in data && data.conflict) {
      return {
        conflict: data.conflict,
        syncResult: data.syncResult ?? data.run ?? undefined,
        run: data.run ?? null,
        message: data.message ?? null,
      };
    }

    return { conflict: data as SyncConflictDto };
  },

  async getConflictDetail(
    conflictId: string,
    opts?: { revealValues?: boolean; reason?: string }
  ): Promise<ConflictDetailDto> {
    const revealValues = Boolean(opts?.revealValues);
    const { data } = await v1SyncClient.get<ConflictDetailDto>(`/conflicts/${conflictId}/detail`, {
      params: {
        revealValues,
        ...(revealValues && opts?.reason?.trim() ? { reason: opts.reason.trim() } : {}),
      },
      headers: {
        'Cache-Control': 'no-store',
      },
    });
    return data;
  },

  async exportConflictsReport(
    bindingId: string,
    opts?: { status?: string; format?: 'csv' | 'json' }
  ): Promise<ExportConflictsReportResult> {
    const format = opts?.format ?? 'csv';
    const status = opts?.status?.trim() ? opts.status.trim() : 'ALL';
    const response = await v1SyncClient.get<Blob>(`/bindings/${bindingId}/conflicts/report`, {
      params: {
        status,
        format,
      },
      responseType: 'blob',
      headers: {
        'Cache-Control': 'no-store',
      },
    });

    const contentDisposition = String(
      (response.headers as Record<string, unknown>)?.['content-disposition'] ?? ''
    );
    const filenameMatch = /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(contentDisposition);
    const fallbackName = `v1-sync-conflicts-${bindingId.slice(0, 8)}.${format}`;
    const fileName = filenameMatch?.[1]?.trim() || fallbackName;
    const contentType =
      String((response.headers as Record<string, unknown>)?.['content-type'] ?? '') ||
      (format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8');
    const blob =
      response.data instanceof Blob
        ? response.data
        : new Blob(
            [typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2)],
            { type: contentType }
          );

    return { blob, fileName, contentType };
  },

  async listPatientIdentities(params?: {
    search?: string;
    status?: PatientIdentityFilter;
    limit?: number;
    offset?: number;
  }): Promise<PatientIdentityDirectoryResponseDto> {
    const { data } = await v1SyncClient.get<PatientIdentityDirectoryResponseDto>('/patient-identities', {
      params: {
        ...(params?.search?.trim() ? { search: params.search.trim() } : {}),
        ...(params?.status && params.status !== 'ALL' ? { status: params.status } : {}),
        limit: params?.limit ?? 25,
        offset: params?.offset ?? 0,
      },
    });
    return data;
  },

  async bindClerkIdentity(
    patientId: string,
    payload: ReconcilePatientIdentityPayload
  ): Promise<ReconcilePatientIdentityResponseDto> {
    const { data } = await v1SyncClient.post<ReconcilePatientIdentityResponseDto>(
      `/patient-identities/${patientId}/bind-clerk`,
      payload
    );
    return data;
  },

  async getMappingGuide(): Promise<MappingGuideResponseDto> {
    const { data } = await v1SyncClient.get<MappingGuideResponseDto>('/mapping-guide');
    return data;
  },
};
