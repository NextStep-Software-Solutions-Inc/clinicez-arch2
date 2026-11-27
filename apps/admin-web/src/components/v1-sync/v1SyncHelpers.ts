import type { AdminMeDto, AdminTenantDto } from '@/services/admin.service';
import { canManageMigrations } from '@/constants/permissions';
import type { SelectFieldOption } from '@/components/ui';
import type {
  StorageObjectStatus,
  StorageSourceProvider,
  StorageTargetPlane,
  SyncBindingDto,
  SyncChangeDiffDto,
  SyncConflictDto,
  SyncRunRecordDto,
  SyncSystemStatusDto,
  V1CatalogResponseDto,
  V1ClinicCatalogItemDto,
  V1OrgCatalogItemDto,
  V2ClinicOptionDto,
} from '@/services/v1Sync.service';

export const CONFLICTS_PAGE_SIZE = 25;
export const DIFFS_PAGE_SIZE = 50;
export const STORAGE_PAGE_SIZE = 50;

export interface SyncDiffsState {
  scope: 'run' | 'binding';
  targetId: string;
  diffs: SyncChangeDiffDto[];
  total: number | null;
  offset: number;
  hasMore: boolean;
}

export interface UnifiedSyncConnection {
  /** Stable identifier for the unified connection (prefers Track 1 binding ID when present). */
  id: string;
  name: string;
  v1ClinicId: number | null;
  v1OrgId: number | null;
  v2TenantId: string | null;
  v2ClinicId: string | null;
  clinicBinding: SyncBindingDto | null;
  patientBinding: SyncBindingDto | null;
  storageBinding: SyncBindingDto | null;
  totalOpenConflicts: number;
  pollIntervalSeconds: number;
  batchSize: number;
  hasSyncHistory: boolean;
}

export const BATCH_SIZE_PRESETS = [25, 50, 100, 200, 500, 1000] as const;

export const BATCH_SIZE_OPTIONS: readonly SelectFieldOption[] = [
  { value: '25', label: '25 / batch', description: 'Fine-grained progress updates, minimal memory' },
  { value: '50', label: '50 / batch', description: 'Frequent progress ticks for smaller migrations' },
  { value: '100', label: '100 / batch', description: 'Balanced chunking for medium clinics' },
  { value: '200', label: '200 / batch', description: 'Default — recommended throughput & memory balance' },
  { value: '500', label: '500 / batch', description: 'Faster throughput for large datasets' },
  { value: '1000', label: '1,000 / batch', description: 'Maximum batch size per SQL query' },
];

export const BATCH_SIZE_MODAL_OPTIONS: readonly SelectFieldOption[] = [
  ...BATCH_SIZE_OPTIONS,
  { value: '__custom__', label: 'Custom batch size...', description: 'Specify 10 to 1,000 items per batch' },
];

export const POLL_INTERVAL_PRESET_SECONDS = [15, 30, 60, 300, 900] as const;

export const POLL_INTERVAL_OPTIONS: readonly SelectFieldOption[] = [
  { value: '15', label: 'Every 15 seconds', description: 'Near real-time sync polling' },
  { value: '30', label: 'Every 30 seconds', description: 'Recommended balanced cadence', badge: 'Default' },
  { value: '60', label: 'Every 1 minute', description: 'Standard background cadence' },
  { value: '300', label: 'Every 5 minutes', description: 'Lower database polling load' },
  { value: '900', label: 'Every 15 minutes', description: 'Periodic low-frequency sync' },
  { value: '__custom__', label: 'Custom interval...', description: 'Specify 10 to 3,600 seconds' },
];

function findExactMatchingBinding(
  candidates: readonly SyncBindingDto[],
  claimedIds: ReadonlySet<string>,
  anchor: SyncBindingDto
): SyncBindingDto | null {
  return (
    candidates.find(
      (c) =>
        !claimedIds.has(c.id) &&
        c.v1ClinicId === anchor.v1ClinicId &&
        c.v1OrgId === anchor.v1OrgId &&
        c.v2TenantId !== null &&
        anchor.v2TenantId !== null &&
        c.v2TenantId.toLowerCase() === anchor.v2TenantId.toLowerCase() &&
        (c.v2ClinicId?.toLowerCase() ?? null) === (anchor.v2ClinicId?.toLowerCase() ?? null)
    ) ?? null
  );
}

function findFallbackMatchingBinding(
  candidates: readonly SyncBindingDto[],
  claimedIds: ReadonlySet<string>,
  anchor: SyncBindingDto
): SyncBindingDto | null {
  return (
    candidates.find(
      (c) =>
        !claimedIds.has(c.id) &&
        c.v1ClinicId === anchor.v1ClinicId &&
        c.v1OrgId === anchor.v1OrgId &&
        (c.v2TenantId === null ||
          anchor.v2TenantId === null ||
          c.v2TenantId.toLowerCase() === anchor.v2TenantId.toLowerCase()) &&
        (!c.v2ClinicId ||
          !anchor.v2ClinicId ||
          c.v2ClinicId.toLowerCase() === anchor.v2ClinicId.toLowerCase())
    ) ?? null
  );
}

/**
 * Pairs Track 1 (Clinic Sync), Track 2 (Patient Accounts), and Track 3 (File Storage) bindings
 * that share the same Classic (v1) source (and compatible destination when specified) into a single
 * unified connection. Uses a two-pass algorithm (exact v2 coordinates first, then nullable
 * fallback) so a v2ClinicId=null binding never steals an exact-match binding from another clinic.
 */
export function groupUnifiedConnections(
  bindings: readonly SyncBindingDto[]
): UnifiedSyncConnection[] {
  const clinicBindings = bindings.filter((b) => b.track === 'TRACK1_CLINIC');
  const patientBindings = bindings.filter((b) => b.track === 'TRACK2_PATIENT');
  const storageBindings = bindings.filter((b) => b.track === 'TRACK3_STORAGE');
  const claimedPatientIds = new Set<string>();
  const claimedStorageIds = new Set<string>();

  const clinicPairs = clinicBindings.map((clinic) => ({
    clinic,
    patientMatch: null as SyncBindingDto | null,
    storageMatch: null as SyncBindingDto | null,
  }));

  // Pass 1: Claim all exact (v1ClinicId, v1OrgId, v2TenantId, v2ClinicId) pairs first
  for (const pair of clinicPairs) {
    const exactPatient = findExactMatchingBinding(patientBindings, claimedPatientIds, pair.clinic);
    if (exactPatient) {
      claimedPatientIds.add(exactPatient.id);
      pair.patientMatch = exactPatient;
    }

    const exactStorage = findExactMatchingBinding(storageBindings, claimedStorageIds, pair.clinic);
    if (exactStorage) {
      claimedStorageIds.add(exactStorage.id);
      pair.storageMatch = exactStorage;
    }
  }

  // Pass 2: Fallback pairing for remaining unclaimed bindings
  for (const pair of clinicPairs) {
    if (!pair.patientMatch) {
      const fallbackPatient = findFallbackMatchingBinding(
        patientBindings,
        claimedPatientIds,
        pair.clinic
      );
      if (fallbackPatient) {
        claimedPatientIds.add(fallbackPatient.id);
        pair.patientMatch = fallbackPatient;
      }
    }

    if (!pair.storageMatch) {
      const fallbackStorage = findFallbackMatchingBinding(
        storageBindings,
        claimedStorageIds,
        pair.clinic
      );
      if (fallbackStorage) {
        claimedStorageIds.add(fallbackStorage.id);
        pair.storageMatch = fallbackStorage;
      }
    }
  }

  const unified: UnifiedSyncConnection[] = clinicPairs.map(
    ({ clinic, patientMatch, storageMatch }) => ({
      id: clinic.id,
      name: clinic.name,
      v1ClinicId: clinic.v1ClinicId,
      v1OrgId: clinic.v1OrgId,
      v2TenantId: clinic.v2TenantId,
      v2ClinicId: clinic.v2ClinicId,
      clinicBinding: clinic,
      patientBinding: patientMatch,
      storageBinding: storageMatch,
      totalOpenConflicts:
        clinic.openConflictCount +
        (patientMatch?.openConflictCount ?? 0) +
        (storageMatch?.openConflictCount ?? 0),
      pollIntervalSeconds: clinic.pollIntervalSeconds,
      batchSize: clinic.batchSize ?? patientMatch?.batchSize ?? storageMatch?.batchSize ?? 200,
      hasSyncHistory: Boolean(
        clinic.hasSyncHistory ||
          clinic.lastChangelogSeq > 0 ||
          patientMatch?.hasSyncHistory ||
          (patientMatch?.lastChangelogSeq ?? 0) > 0 ||
          storageMatch?.hasSyncHistory ||
          (storageMatch?.lastChangelogSeq ?? 0) > 0
      ),
    })
  );

  const remainingPatients = patientBindings.filter((p) => !claimedPatientIds.has(p.id));
  const patientPairs = remainingPatients.map((patient) => ({
    patient,
    storageMatch: null as SyncBindingDto | null,
  }));

  // Two-pass pairing for remaining Patient + Storage connections without a Clinic anchor
  for (const pair of patientPairs) {
    const exactStorage = findExactMatchingBinding(storageBindings, claimedStorageIds, pair.patient);
    if (exactStorage) {
      claimedStorageIds.add(exactStorage.id);
      pair.storageMatch = exactStorage;
    }
  }
  for (const pair of patientPairs) {
    if (!pair.storageMatch) {
      const fallbackStorage = findFallbackMatchingBinding(
        storageBindings,
        claimedStorageIds,
        pair.patient
      );
      if (fallbackStorage) {
        claimedStorageIds.add(fallbackStorage.id);
        pair.storageMatch = fallbackStorage;
      }
    }
  }

  for (const { patient, storageMatch } of patientPairs) {
    unified.push({
      id: patient.id,
      name: patient.name,
      v1ClinicId: patient.v1ClinicId,
      v1OrgId: patient.v1OrgId,
      v2TenantId: patient.v2TenantId,
      v2ClinicId: patient.v2ClinicId,
      clinicBinding: null,
      patientBinding: patient,
      storageBinding: storageMatch,
      totalOpenConflicts: patient.openConflictCount + (storageMatch?.openConflictCount ?? 0),
      pollIntervalSeconds: patient.pollIntervalSeconds,
      batchSize: patient.batchSize ?? storageMatch?.batchSize ?? 200,
      hasSyncHistory: Boolean(
        patient.hasSyncHistory ||
          patient.lastChangelogSeq > 0 ||
          storageMatch?.hasSyncHistory ||
          (storageMatch?.lastChangelogSeq ?? 0) > 0
      ),
    });
  }

  for (const storage of storageBindings) {
    if (claimedStorageIds.has(storage.id)) continue;
    unified.push({
      id: storage.id,
      name: storage.name,
      v1ClinicId: storage.v1ClinicId,
      v1OrgId: storage.v1OrgId,
      v2TenantId: storage.v2TenantId,
      v2ClinicId: storage.v2ClinicId,
      clinicBinding: null,
      patientBinding: null,
      storageBinding: storage,
      totalOpenConflicts: storage.openConflictCount,
      pollIntervalSeconds: storage.pollIntervalSeconds,
      batchSize: storage.batchSize ?? 200,
      hasSyncHistory: Boolean(storage.hasSyncHistory || storage.lastChangelogSeq > 0),
    });
  }

  return unified;
}

export const STORAGE_TARGET_PLANE_OPTIONS: readonly SelectFieldOption[] = [
  {
    value: 'BOTH',
    label: 'Both Copies',
    description: 'Encrypt and save both clinic and patient copies',
  },
  {
    value: 'CLINIC_ONLY',
    label: 'Clinic Files Only',
    description: 'Migrate clinic record attachments only',
  },
  {
    value: 'PATIENT_ONLY',
    label: 'Patient Files Only',
    description: 'Migrate patient portal files only',
  },
];

export const STORAGE_SOURCE_FILTER_OPTIONS: readonly SelectFieldOption[] = [
  {
    value: 'ALL',
    label: 'All Sources',
    description: 'Scan all legacy file links (keep external links as-is)',
  },
  {
    value: 'AZURE_BLOB_1',
    label: 'Primary Storage Only',
    description: 'Migrate files hosted in primary cloud storage only',
  },
];

export const STORAGE_ATTENTION_STATUS_OPTIONS: readonly SelectFieldOption[] = [
  { value: 'ATTENTION', label: 'All Skipped & Failed' },
  { value: 'MIGRATED,VERIFIED', label: 'Encrypted & Saved' },
  { value: 'FAILED_RETRYABLE,FAILED_PERMANENT', label: 'Transfer Failed' },
  { value: 'SKIPPED_DEAD_LINK,SKIPPED_EMPTY_BLOB', label: 'Unavailable (Kept As-Is)' },
  { value: 'SKIPPED_AUTH_REQUIRED', label: 'Needs Access (Kept As-Is)' },
  { value: 'SKIPPED_LEGACY_UNSUPPORTED', label: 'External Link (Kept As-Is)' },
  { value: '', label: 'All Files' },
];

export const STORAGE_PLANE_FILTER_OPTIONS: readonly SelectFieldOption[] = [
  { value: '', label: 'All Copies' },
  { value: 'CLINIC_ATTACHMENT', label: 'Clinic Files' },
  { value: 'PATIENT_FILE', label: 'Patient Files' },
];

export const STORAGE_LOG_SOURCE_FILTER_OPTIONS: readonly SelectFieldOption[] = [
  { value: '', label: 'All Sources' },
  { value: 'AZURE_BLOB_1', label: 'Primary Storage' },
  { value: 'GOOGLE_DRIVE', label: 'Google Drive' },
  { value: 'AZURE_BLOB_2', label: 'Legacy Storage' },
  { value: 'OTHER', label: 'Other Source' },
];

export const CONFLICT_STATUS_OPTIONS: readonly SelectFieldOption[] = [
  { value: '', label: 'All statuses' },
  { value: 'OPEN', label: 'Needs review' },
  { value: 'RESOLVED_FORCE_V1', label: 'Replaced with v1' },
  { value: 'RESOLVED_KEEP_V2', label: 'Kept v2' },
  { value: 'RESOLVED_IGNORE', label: 'Dismissed' },
];

export const RUN_MODE_FILTER_OPTIONS: readonly SelectFieldOption[] = [
  { value: '', label: 'All Activity' },
  { value: 'BACKFILL,FINAL_SWEEP', label: 'Migrations & Sweeps' },
  { value: 'INCREMENTAL', label: 'Live Sync' },
  { value: 'DRY_RUN', label: 'Previews' },
];

export function resolveV1SyncPermissionState(
  adminProfile: AdminMeDto | null | undefined,
  permissionsLoading: boolean
): { loading: boolean; hasPermission: boolean } {
  if (permissionsLoading) {
    return { loading: true, hasPermission: false };
  }
  return {
    loading: false,
    hasPermission: canManageMigrations(adminProfile),
  };
}

export interface V2TenantOption {
  slug: string;
  name: string;
  id?: string | null;
  badge?: string;
}

/**
 * Merges registered Clinic EZ v2 tenants with any additional tenant slugs discovered
 * from v2 clinic options or existing sync bindings, so Target Tenant is always a clean dropdown.
 */
export function mergeV2TenantOptions(
  tenants: readonly AdminTenantDto[],
  clinics: readonly V2ClinicOptionDto[],
  bindings: readonly SyncBindingDto[]
): V2TenantOption[] {
  const seen = new Set<string>();
  const merged: V2TenantOption[] = [];

  for (const t of tenants) {
    const slug = t.tenantSlug?.trim();
    if (!slug) continue;
    const key = slug.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      slug,
      name: t.clinicName || t.name || slug,
      id: t.id,
      badge: t.subscriptionStatus,
    });
  }

  for (const c of clinics) {
    const slug = c.tenantSlug?.trim();
    if (!slug) continue;
    const key = slug.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      slug,
      name: slug,
      id: c.tenantId ?? null,
      badge: 'Discovered',
    });
  }

  for (const b of bindings) {
    const slug = b.v2TenantId?.trim();
    if (!slug) continue;
    const key = slug.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      slug,
      name: slug,
      badge: 'Existing',
    });
  }

  return merged;
}

export function resolveV1TenantIdForSource(
  catalog: V1CatalogResponseDto | null,
  v1ClinicId: number | null,
  v1OrgId: number | null
): number | '' {
  if (!catalog) return '';
  if (v1ClinicId !== null) {
    const clinic = catalog.clinics.find((c) => c.id === v1ClinicId);
    if (clinic?.tenantId != null) return clinic.tenantId;
  }
  if (v1OrgId !== null) {
    const org = catalog.organizations.find((o) => o.id === v1OrgId);
    if (org?.tenantId != null) return org.tenantId;
  }
  return '';
}

export function filterV1OrgsForTenant(
  catalog: V1CatalogResponseDto | null,
  selectedTenantId: number | ''
): V1OrgCatalogItemDto[] {
  const orgs = catalog?.organizations ?? [];
  const hasTenants = (catalog?.tenants?.length ?? 0) > 0;
  if (!hasTenants) return [...orgs];
  if (selectedTenantId === '') return [];
  return orgs.filter((o) => o.tenantId === selectedTenantId);
}

export function filterV1ClinicsForTenant(
  catalog: V1CatalogResponseDto | null,
  selectedTenantId: number | ''
): V1ClinicCatalogItemDto[] {
  const clinics = catalog?.clinics ?? [];
  const hasTenants = (catalog?.tenants?.length ?? 0) > 0;
  if (!hasTenants) return [...clinics];
  if (selectedTenantId === '') return [];
  return clinics.filter((c) => c.tenantId === selectedTenantId);
}

export function mergeV2ClinicOptions(
  fetchedClinics: V2ClinicOptionDto[],
  bindings: SyncBindingDto[]
): V2ClinicOptionDto[] {
  const seen = new Set<string>();
  const merged: V2ClinicOptionDto[] = [];

  for (const clinic of fetchedClinics) {
    const key = clinic.id.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(clinic);
  }

  for (const b of bindings) {
    if (!b.v2ClinicId) continue;
    const key = b.v2ClinicId.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push({
      id: b.v2ClinicId,
      name: b.name,
      tenantSlug: b.v2TenantId ?? null,
    });
  }

  return merged;
}

export function filterV2ClinicsForTenant(
  clinics: readonly V2ClinicOptionDto[],
  selectedTenantKey: string,
  tenants: readonly AdminTenantDto[] = []
): V2ClinicOptionDto[] {
  const normalized = selectedTenantKey.trim().toLowerCase();
  if (!normalized) return [...clinics];

  const matchedTenant = tenants.find(
    (t) =>
      t.tenantSlug.trim().toLowerCase() === normalized ||
      t.id.trim().toLowerCase() === normalized
  );
  const matchedTenantId = matchedTenant?.id.trim().toLowerCase() ?? null;
  const matchedTenantSlug = matchedTenant?.tenantSlug.trim().toLowerCase() ?? null;

  return clinics.filter((c) => {
    const cSlug = c.tenantSlug?.trim().toLowerCase() ?? null;
    const cTenantId = c.tenantId?.trim().toLowerCase() ?? null;
    if (cSlug && (cSlug === normalized || (matchedTenantSlug && cSlug === matchedTenantSlug))) {
      return true;
    }
    if (
      cTenantId &&
      (cTenantId === normalized || (matchedTenantId && cTenantId === matchedTenantId))
    ) {
      return true;
    }
    return false;
  });
}

export function hasCompletedSamplePreview(
  binding: SyncBindingDto | null | undefined,
  runs: readonly SyncRunRecordDto[] = []
): boolean {
  if (!binding) return false;
  if (binding.hasCompletedPreview || binding.hasSyncHistory || binding.lastChangelogSeq > 0) {
    return true;
  }
  return runs.some(
    (r) =>
      r.status === 'COMPLETED' &&
      (r.mode === 'DRY_RUN' ||
        r.mode === 'BACKFILL' ||
        r.mode === 'FINAL_SWEEP' ||
        r.mode === 'INCREMENTAL')
  );
}

export function hasCompletedSampleMigration(
  binding: SyncBindingDto | null | undefined,
  runs: readonly SyncRunRecordDto[] = []
): boolean {
  if (!binding) return false;
  if (binding.hasCompletedMigration || binding.hasSyncHistory || binding.lastChangelogSeq > 0) {
    return true;
  }
  return runs.some(
    (r) =>
      r.status === 'COMPLETED' &&
      (r.mode === 'BACKFILL' || r.mode === 'FINAL_SWEEP' || r.mode === 'INCREMENTAL')
  );
}

export function formatSyncRunMode(
  mode: SyncRunRecordDto['mode'] | string,
  sampleLimit?: number | null
): string {
  switch (mode) {
    case 'DRY_RUN':
      return 'Preview';
    case 'BACKFILL':
      return sampleLimit ? 'Sample Migration' : 'Full Migration';
    case 'INCREMENTAL':
      return 'Live Sync';
    case 'FINAL_SWEEP':
      return 'Final Sweep';
    default:
      return mode;
  }
}

export function formatRunStatus(status: SyncRunRecordDto['status'] | string): string {
  switch (status) {
    case 'COMPLETED':
      return 'Completed';
    case 'RUNNING':
      return 'Running';
    case 'FAILED':
      return 'Failed';
    default:
      return status;
  }
}

export function formatConflictType(conflictType: string): string {
  switch (conflictType) {
    case 'V2_MODIFIED':
      return 'Edited in Clinic EZ v2';
    case 'V1_SOFT_DELETED_SHIELDED':
    case 'V1_HARD_DELETED_SHIELDED':
      return 'Protected Deletion';
    default:
      return conflictType
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export function formatConflictStatus(status: SyncConflictDto['status'] | string): string {
  switch (status) {
    case 'OPEN':
      return 'Needs Review';
    case 'RESOLVED_KEEP_V2':
      return 'Kept v2';
    case 'RESOLVED_FORCE_V1':
      return 'Replaced with v1';
    case 'RESOLVED_IGNORE':
    case 'IGNORED':
      return 'Dismissed';
    default:
      return status;
  }
}

export function formatDiffAction(action: string): string {
  switch (action) {
    case 'CREATE':
      return 'Added';
    case 'UPDATE':
      return 'Updated';
    case 'SKIP_V2_WINS':
      return 'Kept v2';
    case 'SHIELD_DELETE':
      return 'Protected';
    case 'ADOPT':
      return 'Matched Existing';
    default:
      return action
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export function formatDurationMs(durationMs: number | null | undefined): string {
  const ms = durationMs ?? 0;
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

export function formatRunTimestamp(
  iso: string | null | undefined
): { short: string; full: string } | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const short = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);

  const full = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);

  return { short, full };
}

export function shortUuid(id: string | null | undefined): string {
  if (!id) return '—';
  return id.length > 13 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

export function formatBytes(bytes: number | null | undefined): string {
  const n = bytes ?? 0;
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n < 1024 ** 4) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  return `${(n / 1024 ** 4).toFixed(2)} TB`;
}

export function formatTransferRate(mbps: number | null | undefined): string {
  if (mbps == null || !Number.isFinite(mbps) || mbps <= 0) return '—';
  const mbPerSec = mbps / 8;
  if (mbPerSec < 0.05 || mbPerSec.toFixed(1) === '0.0') {
    return '< 0.1 MB/s';
  }
  return `${mbPerSec.toFixed(1)} MB/s`;
}

const UNSPACED_BRAND_REGEX = new RegExp(['Clinic', '[Ee][Zz]'].join(''), 'g');

export function sanitizeStorageDisplayText(text: string | null | undefined): string {
  if (!text) return '';

  return text
    .replace(/https?:\/\/[^\s"'<>)\]]+/gi, '[redacted-link]')
    .replace(/([?&](?:sig|sv|se|sp|sr|st|skoid|sktid|skt|ske|sks|skv)=)[^&\s"']+/gi, '$1[redacted]')
    .replace(
      /Dead=(\d+),\s*Empty=(\d+),\s*Auth=(\d+),\s*Legacy=(\d+)/gi,
      'Unavailable: $1 dead, $2 empty · Needs Access: $3 · External Link: $4'
    )
    .replace(
      /Retryable=(\d+),\s*Permanent=(\d+)/gi,
      'Temporary failures: $1 · Permanent failures: $2'
    )
    .replace(/Track3Storage:(?:ClinicR2|PatientR2)/gi, 'Cloud Storage')
    .replace(/(?:ClinicEncryption|PatientEncryption):MasterSecret/gi, 'encryption key')
    .replace(/Cloudflare\s+R2/gi, 'Cloud Storage')
    .replace(/(?<![a-z0-9])(?:Clinic|Patient)\s*R2(?![a-z0-9])/gi, 'Cloud Storage')
    .replace(/(?<![a-z0-9])R2(?:[-_]v\d+|_[A-Z0-9]+)+(?![a-z0-9])/g, 'Cloud Storage')
    .replace(/(?<![a-z0-9])r2(?:[-_]v\d+)?(?![a-z0-9])/gi, 'Cloud Storage')
    .replace(/(?<![a-z0-9])SKIPPED_LEGACY_UNSUPPORTED(?![a-z0-9])/gi, 'External Link (Kept As-Is)')
    .replace(
      /(?<![a-z0-9])(?:SKIPPED_DEAD_LINK|SKIPPED_EMPTY_BLOB)(?![a-z0-9])/gi,
      'Unavailable (Kept As-Is)'
    )
    .replace(/(?<![a-z0-9])SKIPPED_AUTH_REQUIRED(?![a-z0-9])/gi, 'Needs Access (Kept As-Is)')
    .replace(/(?<![a-z0-9])(?:FAILED_RETRYABLE|FAILED_PERMANENT)(?![a-z0-9])/gi, 'Transfer Failed')
    .replace(/(?<![a-z0-9])SKIPPED_[A-Z0-9_]+(?![a-z0-9])/gi, 'Kept As-Is')
    .replace(/(?<![a-z0-9])FAILED_[A-Z0-9_]+(?![a-z0-9])/gi, 'Transfer Failed')
    .replace(/Azure\s*Blob\s*#?1(?![a-z0-9])/gi, 'Primary Storage')
    .replace(/(?<![a-z0-9])AZURE_BLOB_1(?![a-z0-9])/gi, 'Primary Storage')
    .replace(/Azure\s*Blob\s*#?2(?![a-z0-9])/gi, 'Legacy Storage')
    .replace(/(?<![a-z0-9])AZURE_BLOB_2(?![a-z0-9])/gi, 'Legacy Storage')
    .replace(/Azure\s*Blob(?![a-z0-9])/gi, 'Primary Storage')
    .replace(/Google\s*Drive(?![a-z0-9])/gi, 'External Link')
    .replace(/(?<![a-z0-9])GOOGLE_DRIVE(?![a-z0-9])/gi, 'External Link')
    .replace(/RecordAttachments|record_attachments/gi, 'Clinic Files')
    .replace(/file_records|FileRecords/gi, 'Patient Files')
    .replace(/sync_storage_objects/gi, 'File Storage')
    .replace(/(?<![a-z0-9])(?:CMK|PMK|DEK)(?:[-_]v\d+|_[A-Z0-9]+)*s?(?![a-z0-9])/gi, 'encryption key')
    .replace(/\.cez(?![a-z0-9])/gi, (_match, offset, full) =>
      offset > 0 && /\w/.test(full[offset - 1]) ? ' encrypted file' : 'encrypted file'
    )
    .replace(/EncryptionAlgorithm\s*=\s*'NONE'/gi, 'unencrypted files')
    .replace(/AES-256-GCM/gi, 'encrypted')
    .replace(/(?<![a-z0-9])(?:(?:ERR|DNS)_)?NXDOMAIN(?![a-z0-9])/gi, 'unreachable address')
    .replace(/HTML[\s_]+Interstitial/gi, 'sign-in page')
    .replace(UNSPACED_BRAND_REGEX, 'Clinic EZ');
}

export function formatStorageObjectStatus(
  status: StorageObjectStatus | string
): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  switch (status) {
    case 'MIGRATED':
      return { label: 'Encrypted & Saved', tone: 'success' };
    case 'VERIFIED':
      return { label: 'Verified', tone: 'success' };
    case 'SKIPPED_LEGACY_UNSUPPORTED':
      return { label: 'External Link (Kept As-Is)', tone: 'neutral' };
    case 'SKIPPED_DEAD_LINK':
    case 'SKIPPED_EMPTY_BLOB':
      return { label: 'Unavailable (Kept As-Is)', tone: 'warning' };
    case 'SKIPPED_AUTH_REQUIRED':
      return { label: 'Needs Access (Kept As-Is)', tone: 'warning' };
    case 'FAILED_RETRYABLE':
    case 'FAILED_PERMANENT':
      return { label: 'Transfer Failed', tone: 'danger' };
    case 'PENDING':
    default:
      return { label: 'Pending', tone: 'neutral' };
  }
}

export function formatStoragePlane(plane: StorageTargetPlane | string): string {
  switch (plane) {
    case 'CLINIC_ATTACHMENT':
      return 'Clinic Files';
    case 'PATIENT_FILE':
      return 'Patient Files';
    default:
      return 'File Copy';
  }
}

export function formatStorageProvider(provider: StorageSourceProvider | string): string {
  switch (provider) {
    case 'AZURE_BLOB_1':
      return 'Primary Storage';
    case 'AZURE_BLOB_2':
      return 'Legacy Storage';
    case 'GOOGLE_DRIVE':
      return 'Google Drive';
    case 'OTHER':
    default:
      return 'Other Source';
  }
}

export function formatStorageLocationPreview(item: {
  sourceProvider: StorageSourceProvider | string;
  targetPlane: StorageTargetPlane | string;
  targetEntityId: string;
  tenantId?: string | null;
  status: StorageObjectStatus | string;
}): { before: string; after: string } {
  const idToken = shortUuid(item.targetEntityId);
  const providerLabel = formatStorageProvider(item.sourceProvider);
  const before = `${providerLabel} / …/${idToken}`;

  if (item.status === 'MIGRATED' || item.status === 'VERIFIED') {
    if (item.targetPlane === 'CLINIC_ATTACHMENT') {
      const tenantPart = item.tenantId ? `${item.tenantId} / ` : '';
      return {
        before,
        after: `Clinic Cloud Vault / ${tenantPart}…/${idToken} (Encrypted)`,
      };
    }
    return {
      before,
      after: `Patient Cloud Vault / …/${idToken} (Encrypted)`,
    };
  }

  if (item.status.startsWith('SKIPPED_')) {
    return {
      before,
      after: 'Unchanged (Kept at original link)',
    };
  }

  return {
    before,
    after: 'Not transferred yet',
  };
}

export function formatStorageErrorSummary(
  status: StorageObjectStatus | string,
  _lastErrorCode?: string | null
): string {
  switch (status) {
    case 'MIGRATED':
      return 'Encrypted and saved to cloud storage.';
    case 'VERIFIED':
      return 'Encrypted copy verified in cloud storage.';
    case 'SKIPPED_LEGACY_UNSUPPORTED':
      return 'External or retired link kept as-is in Classic Clinic EZ.';
    case 'SKIPPED_DEAD_LINK':
      return 'Source file was unavailable at its original link; kept as-is.';
    case 'SKIPPED_EMPTY_BLOB':
      return 'Source file had no content (0 bytes); kept as-is.';
    case 'SKIPPED_AUTH_REQUIRED':
      return 'Source link requires access permission; kept as-is.';
    case 'FAILED_RETRYABLE':
      return 'Temporary transfer error — ready to retry.';
    case 'FAILED_PERMANENT':
      return 'Transfer failed after repeated attempts.';
    case 'PENDING':
    default:
      return 'Queued for encrypted cloud transfer.';
  }
}

export function formatParityEntityLabel(entityType: string): string {
  const norm = entityType.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (
    norm.includes('recordattachment') ||
    (norm.includes('clinic') && !norm.includes('profile') && (norm.includes('file') || norm.includes('attach')))
  ) {
    return 'Clinic Files';
  }
  if (
    norm.includes('filerecord') ||
    (norm.includes('patient') && !norm.includes('profile') && norm.includes('file'))
  ) {
    return 'Patient Files';
  }
  if (norm.includes('syncstorageobject')) {
    return 'File Storage';
  }
  if (norm.includes('skip') || norm.includes('external') || norm.includes('keptasis')) {
    return 'External & Unavailable Links (Kept As-Is)';
  }
  if (norm.includes('fail')) {
    return 'Transfer Failures';
  }
  return sanitizeStorageDisplayText(entityType);
}

const SYNC_ENTITY_LABELS: Readonly<Record<string, string>> = {
  CustomFieldDefinition: 'Custom Fields',
  Patient: 'Patients',
  PatientAccount: 'Patient Accounts',
  PatientAddress: 'Addresses',
  PatientGuardian: 'Guardians',
  EmergencyContact: 'Emergency Contacts',
  PatientAllergy: 'Allergies',
  PatientAlert: 'Clinical Alerts',
  PatientMedicalHistory: 'Medical History',
  PatientFamilyHistory: 'Family History',
  PatientSocialHistory: 'Social History',
  PatientSurgicalHistory: 'Surgical History',
  PatientObstetricHistory: 'Obstetric History',
  PatientObstetricProfile: 'Obstetric Profiles',
  PatientImmunization: 'Immunizations',
  PatientImmunizationSelf: 'Immunizations',
  PatientDisability: 'Disabilities',
  PatientChronicCondition: 'Chronic Conditions',
  PatientPastIllness: 'Past Illnesses',
  PatientMedication: 'Medications',
  PatientHomeMedication: 'Home Medications',
  PatientGovernmentId: 'Government IDs',
  PatientNcdAssessment: 'NCD Assessments',
  PatientNcdQuestionnaire: 'NCD Assessments',
  PatientInsight: 'Clinical Insights',
  Appointment: 'Appointments',
  PatientAppointment: 'Appointments',
  QueueItem: 'Queue Items',
  Consultation: 'Consultations',
  PatientConsultation: 'Consultations',
  PatientVitals: 'Vitals',
  PatientVitalSign: 'Vitals',
  Prescription: 'Prescriptions',
  PrescriptionItem: 'Prescription Items',
  PatientPrescription: 'Prescriptions',
  PatientPrescriptionDocument: 'Rx Documents',
  DispensingRecord: 'Dispensing',
  MedicationDispense: 'Dispensing',
  LabOrder: 'Lab Orders',
  LabOrderItem: 'Lab Order Items',
  PatientLabRequestSlip: 'Lab Slips',
  ImagingOrder: 'Imaging Orders',
  ImagingOrderItem: 'Imaging Items',
  CardiologyOrder: 'Cardiology Orders',
  CardiologyOrderItem: 'Cardiology Items',
  MedicalCertificate: 'Medical Certificates',
  PatientMedicalCertificate: 'Medical Certificates',
  PhysicalExamination: 'Physical Exams',
  RecordAttachment: 'Clinic Attachments',
  FileRecord: 'File Records',
  FileFolder: 'File Folders',
  FileClinicShare: 'Clinic Shares',
  PatientClinicShare: 'Clinic Shares',
};

export function formatSyncEntityLabel(entityType: string): string {
  const mapped = SYNC_ENTITY_LABELS[entityType];
  if (mapped) return mapped;
  return sanitizeStorageDisplayText(entityType)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\bId\b/g, 'ID')
    .replace(/\bIds\b/g, 'IDs')
    .replace(/\bNcd\b/g, 'NCD')
    .trim();
}

export function buildSyncStatusFingerprint(status: SyncSystemStatusDto | null): string {
  if (!status) return '';
  return [
    status.v1SourceConnected ? 1 : 0,
    status.clinicDbConnected ? 1 : 0,
    status.patientDbConnected ? 1 : 0,
    status.syncLedgerConnected ? 1 : 0,
    status.v1SyncTriggersInstalled ? 1 : 0,
    status.v1SyncTriggerTableCount ?? 0,
    status.v1ChangelogMaxSeq ?? 0,
    status.backgroundWorkerEnabled ? 1 : 0,
    status.activeBindingsCount ?? 0,
    status.openConflictsCount ?? 0,
    status.clinicR2Connected ? 1 : 0,
    status.patientR2Connected ? 1 : 0,
    status.clinicEncryptionConfigured ? 1 : 0,
    status.patientEncryptionConfigured ? 1 : 0,
    status.azureBlob1Configured ? 1 : 0,
    status.clinicPendingStorageCount ?? 0,
    status.patientPendingStorageCount ?? 0,
    status.clinicTotalStorageCount ?? 0,
    status.patientTotalStorageCount ?? 0,
    status.clinicSkippedStorageCount ?? 0,
    status.patientSkippedStorageCount ?? 0,
  ].join('|');
}

export function buildBindingStateFingerprint(binding: SyncBindingDto | null): string {
  if (!binding) return '';
  return [
    binding.id,
    binding.name,
    binding.autoSyncEnabled ? 1 : 0,
    binding.isFrozen ? 1 : 0,
    binding.patientCohortMode,
    binding.batchSize,
    binding.pollIntervalSeconds,
    binding.lastChangelogSeq ?? 0,
    binding.lastSyncedAt ?? '',
    binding.openConflictCount ?? 0,
    binding.hasSyncHistory ? 1 : 0,
    binding.hasCompletedPreview ? 1 : 0,
    binding.hasCompletedMigration ? 1 : 0,
  ].join('|');
}

export function buildRunsHeadFingerprint(runs: readonly SyncRunRecordDto[]): string {
  if (!runs.length) return '0';
  const runningCount = runs.filter((r) => r.status === 'RUNNING').length;
  const head = runs
    .slice(0, 3)
    .map((r) => `${r.id}:${r.status}:${r.completedAt ?? ''}:${r.errorMessage ?? ''}`)
    .join(',');
  return `${runs.length}|${runningCount}|${head}`;
}
