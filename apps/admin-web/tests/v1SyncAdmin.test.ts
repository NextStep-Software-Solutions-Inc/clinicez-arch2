import { afterEach, describe, expect, mock, test } from 'bun:test';
import {
  ADMIN_PERMISSIONS,
  ALL_ADMIN_PERMISSIONS,
  canManageMigrations,
} from '../src/constants/permissions';
import { ensureV1SyncPrefix, resolveV1SyncBaseUrl, v1SyncClient } from '../src/lib/v1SyncApi';
import { SIDEBAR_GROUPS } from '../src/routes/_auth';
import {
  isValidUuid,
  normalizePaginatedResult,
  normalizeV2ClinicOptions,
  v1SyncService,
  type SyncBindingDto,
  type SyncConflictDto,
} from '../src/services/v1Sync.service';
import {
  filterV2ClinicsForTenant,
  formatBytes,
  formatConflictStatus,
  formatConflictType,
  formatDiffAction,
  formatDurationMs,
  formatParityEntityLabel,
  formatStorageErrorSummary,
  formatStorageObjectStatus,
  formatStoragePlane,
  formatStorageProvider,
  formatSyncRunMode,
  formatTransferRate,
  mergeV2ClinicOptions,
  resolveV1SyncPermissionState,
  sanitizeStorageDisplayText,
} from '../src/routes/v1-sync';

describe('v1 Migration & Sync Admin Integration', () => {
  const originalPost = v1SyncClient.post;
  const originalGet = v1SyncClient.get;

  afterEach(() => {
    v1SyncClient.post = originalPost;
    v1SyncClient.get = originalGet;
  });

  test('ADMIN_PERMISSIONS defines manage:migrations matching backend Permissions.ManageMigrations', () => {
    expect(ADMIN_PERMISSIONS.MANAGE_MIGRATIONS).toBe('manage:migrations');
    expect(ALL_ADMIN_PERMISSIONS).toContain('manage:migrations');
    expect(canManageMigrations({ permissions: ['manage:migrations'] })).toBe(true);
    expect(canManageMigrations({ permissions: ['view:tenants'] })).toBe(false);
    expect(canManageMigrations({ permissions: [], isSuperAdmin: true })).toBe(true);
  });

  test('SIDEBAR_GROUPS exposes /v1-sync under Administration & Security', () => {
    const items = SIDEBAR_GROUPS.flatMap((g) => g.items);
    const v1SyncItem = items.find((i) => i.to === '/v1-sync');
    expect(v1SyncItem).toBeDefined();
    expect(v1SyncItem?.label).toBe('v1 Migration & Sync');
  });

  test('ensureV1SyncPrefix normalizes base URL cleanly without duplicating /api/v1/v1-sync', () => {
    expect(ensureV1SyncPrefix('')).toBe('/api/v1/v1-sync');
    expect(ensureV1SyncPrefix('http://localhost:5099')).toBe('http://localhost:5099/api/v1/v1-sync');
    expect(ensureV1SyncPrefix('http://localhost:5099/')).toBe('http://localhost:5099/api/v1/v1-sync');
    expect(ensureV1SyncPrefix('http://localhost:5099/api/v1/v1-sync')).toBe('http://localhost:5099/api/v1/v1-sync');
  });

  test('resolveV1SyncBaseUrl strictly uses VITE_V1_SYNC_API_URL without manipulating VITE_PORTAL_API_URL', () => {
    expect(
      resolveV1SyncBaseUrl({
        VITE_V1_SYNC_API_URL: 'http://localhost:5099',
        VITE_PORTAL_API_URL: 'https://portal.api.example.com/api/v1',
      })
    ).toBe('http://localhost:5099/api/v1/v1-sync');

    expect(
      resolveV1SyncBaseUrl({
        VITE_V1_SYNC_API_URL: 'https://v1-sync.api.example.com',
      })
    ).toBe('https://v1-sync.api.example.com/api/v1/v1-sync');

    expect(
      resolveV1SyncBaseUrl({
        VITE_V1_SYNC_API_URL: 'https://v1-sync.api.example.com/api/v1/v1-sync',
      })
    ).toBe('https://v1-sync.api.example.com/api/v1/v1-sync');

    expect(
      resolveV1SyncBaseUrl({
        VITE_PORTAL_API_URL: 'https://portal.api.example.com/api/v1',
      })
    ).toBe('/api/v1/v1-sync');

    expect(resolveV1SyncBaseUrl({})).toBe('/api/v1/v1-sync');
  });

  test('resolveV1SyncPermissionState never defaults to true while permissions are loading or missing', () => {
    // Loading state MUST deny permission even before profile resolves
    expect(resolveV1SyncPermissionState(null, true)).toEqual({
      loading: true,
      hasPermission: false,
    });
    expect(
      resolveV1SyncPermissionState(
        {
          isAdmin: true,
          fullName: 'Admin',
          email: 'admin@example.com',
          roleName: 'Super Admin',
          permissions: ['manage:migrations'],
        },
        true
      )
    ).toEqual({
      loading: true,
      hasPermission: false,
    });

    // Loaded with null / unprivileged profile -> false
    expect(resolveV1SyncPermissionState(null, false)).toEqual({
      loading: false,
      hasPermission: false,
    });
    expect(
      resolveV1SyncPermissionState(
        {
          isAdmin: true,
          fullName: 'Viewer',
          email: 'viewer@example.com',
          roleName: 'Support',
          permissions: ['view:tenants'],
        },
        false
      )
    ).toEqual({
      loading: false,
      hasPermission: false,
    });

    // Loaded with manage:migrations -> true
    expect(
      resolveV1SyncPermissionState(
        {
          isAdmin: true,
          fullName: 'Migrator',
          email: 'migrator@example.com',
          roleName: 'Super Admin',
          permissions: ['manage:migrations'],
        },
        false
      )
    ).toEqual({
      loading: false,
      hasPermission: true,
    });
  });

  test('isValidUuid enforces strict 8-4-4-4-12 UUID format for manual v2ClinicId', () => {
    expect(isValidUuid('cb09fe02-6979-4b7a-8e50-d3b8a1419762')).toBe(true);
    expect(isValidUuid(' 44444444-4444-4444-4444-444444444444 ')).toBe(true);
    expect(isValidUuid('')).toBe(false);
    expect(isValidUuid(null)).toBe(false);
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid('cb09fe02-6979-4b7a-8e50-d3b8a141976')).toBe(false);
    expect(isValidUuid('gggggggg-6979-4b7a-8e50-d3b8a1419762')).toBe(false);
    expect(isValidUuid('cb09fe0269794b7a8e50d3b8a1419762')).toBe(false);
  });

  test('normalizeV2ClinicOptions and mergeV2ClinicOptions build deduplicated clinic dropdown choices', () => {
    const fetched = normalizeV2ClinicOptions({
      items: [
        { id: '11111111-1111-1111-1111-111111111111', clinicName: 'Primary Clinic', v2TenantId: 'clinic-a' },
        { clinicId: '22222222-2222-2222-2222-222222222222', name: 'North Branch', tenantSlug: 'clinic-b' },
        { id: '', name: 'Invalid Blank' },
      ],
    });
    expect(fetched).toEqual([
      { id: '11111111-1111-1111-1111-111111111111', name: 'Primary Clinic', tenantId: null, tenantSlug: 'clinic-a' },
      { id: '22222222-2222-2222-2222-222222222222', name: 'North Branch', tenantId: null, tenantSlug: 'clinic-b' },
    ]);

    const bindings: SyncBindingDto[] = [
      {
        id: 'b1',
        track: 'TRACK1_CLINIC',
        name: 'Duplicate Lowercase',
        v1ClinicId: 1,
        v1OrgId: 1,
        v2TenantId: 'clinic-a',
        v2ClinicId: '11111111-1111-1111-1111-111111111111',
        patientCohortMode: 'SCOPED',
        autoSyncEnabled: false,
        pollIntervalSeconds: 30,
        isFrozen: false,
        frozenAt: null,
        frozenBy: null,
        freezeReason: null,
        createdAt: '2026-11-25T00:00:00Z',
        updatedAt: '2026-11-25T00:00:00Z',
        lastChangelogSeq: 0,
        lastPolledAt: null,
        openConflictCount: 0,
      },
      {
        id: 'b2',
        track: 'TRACK1_CLINIC',
        name: 'Existing Binding Clinic',
        v1ClinicId: 3,
        v1OrgId: 1,
        v2TenantId: 'ustp-cdo',
        v2ClinicId: '33333333-3333-3333-3333-333333333333',
        patientCohortMode: 'SCOPED',
        autoSyncEnabled: false,
        pollIntervalSeconds: 30,
        isFrozen: false,
        frozenAt: null,
        frozenBy: null,
        freezeReason: null,
        createdAt: '2026-11-25T00:00:00Z',
        updatedAt: '2026-11-25T00:00:00Z',
        lastChangelogSeq: 0,
        lastPolledAt: null,
        openConflictCount: 0,
      },
    ];

    const merged = mergeV2ClinicOptions(fetched, bindings);
    expect(merged).toHaveLength(3);
    expect(merged[2]).toEqual({
      id: '33333333-3333-3333-3333-333333333333',
      name: 'Existing Binding Clinic',
      tenantSlug: 'ustp-cdo',
    });
  });

  test('v1SyncService.listV2Clinics falls back from /clinics to /tenants cleanly', async () => {
    const calls: string[] = [];
    v1SyncClient.get = mock(async (url: string) => {
      calls.push(url);
      if (url === '/clinics') {
        throw new Error('404 Not Found');
      }
      return {
        data: [{ id: '44444444-4444-4444-4444-444444444444', name: 'Tenant Clinic', tenantSlug: 'demo' }],
      } as any;
    }) as any;

    const clinics = await v1SyncService.listV2Clinics();
    expect(calls).toEqual(['/clinics', '/tenants']);
    expect(clinics).toHaveLength(1);
    expect(clinics[0].id).toBe('44444444-4444-4444-4444-444444444444');
  });

  test('v1SyncService.resolveConflict sends FORCE_V1/KEEP_V2/IGNORE and handles both wrapper and legacy shapes', async () => {
    const sampleConflict: SyncConflictDto = {
      id: 'c1',
      bindingId: 'b1',
      runId: 'r1',
      entityType: 'Patient',
      v1Id: '101',
      v2Id: '22222222-2222-2222-2222-222222222222',
      conflictType: 'V2_MODIFIED',
      changedFields: ['FirstName'],
      status: 'RESOLVED_FORCE_V1',
      resolvedBy: 'ops@example.com',
      resolvedAt: '2026-11-25T10:00:00Z',
      createdAt: '2026-11-25T09:00:00Z',
    };

    const postCalls: Array<{ url: string; body: unknown }> = [];
    v1SyncClient.post = mock(async (url: string, body: unknown) => {
      postCalls.push({ url, body });
      if (url.includes('c1')) {
        return {
          data: {
            conflict: sampleConflict,
            message: 'Immediate forced re-sync completed.',
            syncResult: { updated: 1 },
          },
        } as any;
      }
      return {
        data: { ...sampleConflict, id: 'c2', status: 'RESOLVED_KEEP_V2' },
      } as any;
    }) as any;

    const forceRes = await v1SyncService.resolveConflict('c1', 'FORCE_V1', 'ops@example.com');
    expect(postCalls[0]).toEqual({
      url: '/conflicts/c1/resolve',
      body: { resolution: 'FORCE_V1', resolvedBy: 'ops@example.com' },
    });
    expect(forceRes.conflict.status).toBe('RESOLVED_FORCE_V1');
    expect(forceRes.message).toBe('Immediate forced re-sync completed.');
    expect(forceRes.syncResult).toEqual({ updated: 1 });

    const keepRes = await v1SyncService.resolveConflict('c2', 'KEEP_V2');
    expect(postCalls[1]).toEqual({
      url: '/conflicts/c2/resolve',
      body: { resolution: 'KEEP_V2' },
    });
    expect(keepRes.conflict.status).toBe('RESOLVED_KEEP_V2');

    await v1SyncService.resolveConflict('c3', 'IGNORE', 'ops@example.com');
    expect(postCalls[2]).toEqual({
      url: '/conflicts/c3/resolve',
      body: { resolution: 'IGNORE', resolvedBy: 'ops@example.com' },
    });
  });

  test('normalizePaginatedResult and listRunDiffs/listBindingDiffs/listConflicts pass limit and offset', async () => {
    expect(normalizePaginatedResult([1, 2, 3], 3, 0)).toEqual({
      items: [1, 2, 3],
      total: null,
      limit: 3,
      offset: 0,
      hasMore: true,
    });
    expect(normalizePaginatedResult({ items: [1, 2], total: 10 }, 2, 8)).toEqual({
      items: [1, 2],
      total: 10,
      limit: 2,
      offset: 8,
      hasMore: false,
    });
    expect(normalizePaginatedResult([], 0, 0)).toEqual({
      items: [],
      total: null,
      limit: 0,
      offset: 0,
      hasMore: false,
    });
    expect(normalizePaginatedResult({ items: [] }, 0, 0)).toEqual({
      items: [],
      total: null,
      limit: 0,
      offset: 0,
      hasMore: false,
    });

    const getCalls: Array<{ url: string; params: unknown }> = [];
    v1SyncClient.get = mock(async (url: string, config?: { params?: unknown }) => {
      getCalls.push({ url, params: config?.params });
      return {
        data: { items: [], total: 75, limit: 50, offset: 50 },
      } as any;
    }) as any;

    const diffsPage = await v1SyncService.listRunDiffs('run-1', 50, 50);
    expect(getCalls[0]).toEqual({ url: '/runs/run-1/diffs', params: { limit: 50, offset: 50 } });
    expect(diffsPage.total).toBe(75);
    expect(diffsPage.hasMore).toBe(true);

    await v1SyncService.listBindingDiffs('bind-1', 50, 0);
    expect(getCalls[1]).toEqual({ url: '/bindings/bind-1/diffs', params: { limit: 50, offset: 0 } });

    await v1SyncService.listConflicts('bind-1', { status: 'OPEN', limit: 25, offset: 25 });
    expect(getCalls[2]).toEqual({
      url: '/bindings/bind-1/conflicts',
      params: { status: 'OPEN', limit: 25, offset: 25 },
    });
  });

  test('filterV2ClinicsForTenant scopes clinics strictly inside the selected tenant', () => {
    const clinics = [
      { id: 'c1', name: 'USTP Main Clinic', tenantId: 't-ustp', tenantSlug: 'ustp-cdo' },
      { id: 'c2', name: 'Cebu North', tenantId: 't-cebu', tenantSlug: 'cebu-doc' },
      { id: 'c3', name: 'Cebu South', tenantId: 't-cebu', tenantSlug: 'cebu-doc' },
    ];
    const tenants = [
      { id: 't-ustp', tenantSlug: 'ustp-cdo' } as any,
      { id: 't-cebu', tenantSlug: 'cebu-doc' } as any,
    ];

    expect(filterV2ClinicsForTenant(clinics, 'ustp-cdo', tenants).map((c) => c.id)).toEqual(['c1']);
    expect(filterV2ClinicsForTenant(clinics, 'cebu-doc', tenants).map((c) => c.id)).toEqual([
      'c2',
      'c3',
    ]);
    expect(filterV2ClinicsForTenant(clinics, 't-cebu', tenants).map((c) => c.id)).toEqual([
      'c2',
      'c3',
    ]);
    expect(filterV2ClinicsForTenant(clinics, 'unknown-slug', tenants)).toEqual([]);
    expect(filterV2ClinicsForTenant(clinics, '', tenants)).toHaveLength(3);
  });

  test('plain-English formatters map technical sync enums cleanly', () => {
    expect(formatSyncRunMode('DRY_RUN')).toBe('Preview');
    expect(formatSyncRunMode('BACKFILL')).toBe('Full Migration');
    expect(formatSyncRunMode('BACKFILL', 25)).toBe('Sample Migration');
    expect(formatSyncRunMode('INCREMENTAL')).toBe('Live Sync');
    expect(formatSyncRunMode('FINAL_SWEEP')).toBe('Final Sweep');

    expect(formatConflictType('V2_MODIFIED')).toBe('Edited in Clinic EZ v2');
    expect(formatConflictType('V1_SOFT_DELETED_SHIELDED')).toBe('Protected Deletion');

    expect(formatConflictStatus('OPEN')).toBe('Needs Review');
    expect(formatConflictStatus('RESOLVED_KEEP_V2')).toBe('Kept v2');
    expect(formatConflictStatus('RESOLVED_FORCE_V1')).toBe('Replaced with v1');
    expect(formatConflictStatus('RESOLVED_IGNORE')).toBe('Dismissed');

    expect(formatDiffAction('CREATE')).toBe('Added');
    expect(formatDiffAction('UPDATE')).toBe('Updated');
    expect(formatDiffAction('SKIP_V2_WINS')).toBe('Kept v2');
    expect(formatDiffAction('SHIELD_DELETE')).toBe('Protected');

    expect(formatDurationMs(420)).toBe('420 ms');
    expect(formatDurationMs(4250)).toBe('4.3s');
    expect(formatDurationMs(125_000)).toBe('2m 5s');
  });

  test('Track 3 storage service methods forward filters, pagination, and retry-failed payloads cleanly', async () => {
    const getCalls: Array<{ url: string; params: unknown }> = [];
    const postCalls: Array<{ url: string; body: unknown; params: unknown }> = [];

    v1SyncClient.get = mock(async (url: string, config?: { params?: unknown }) => {
      getCalls.push({ url, params: config?.params });
      return {
        data: { bindingId: 'b3', totalCount: 1, items: [] },
      } as any;
    }) as any;

    v1SyncClient.post = mock(async (url: string, body: unknown, config?: { params?: unknown }) => {
      postCalls.push({ url, body, params: config?.params });
      return {
        data: { id: 'run-1', bindingId: 'b3', mode: 'BACKFILL', status: 'RUNNING', summary: {} },
      } as any;
    }) as any;

    const page = await v1SyncService.getStorageObjects('b3', {
      status: 'ATTENTION',
      plane: 'CLINIC_ATTACHMENT',
      limit: 50,
      offset: 50,
    });
    expect(page.totalCount).toBe(1);
    expect(getCalls[0]).toEqual({
      url: '/bindings/b3/storage-objects',
      params: {
        status: 'ATTENTION',
        plane: 'CLINIC_ATTACHMENT',
        limit: 50,
        offset: 50,
      },
    });

    await v1SyncService.retryFailedStorage('b3', { asyncMode: true, includeAuthSkipped: true });
    expect(postCalls[0]).toEqual({
      url: '/bindings/b3/retry-failed',
      body: {},
      params: { asyncMode: true, includeAuthSkipped: true },
    });

    await v1SyncService.runDryRun('b3', 25, {
      asyncMode: true,
      batchSize: 100,
      providerFilter: 'AZURE_BLOB_1',
      targetPlaneFilter: 'CLINIC_ONLY',
      maxConcurrency: 4,
    });
    expect(postCalls[1]).toEqual({
      url: '/bindings/b3/dry-run',
      body: {
        sampleLimit: 25,
        batchSize: 100,
        providerFilter: 'AZURE_BLOB_1',
        targetPlaneFilter: 'CLINIC_ONLY',
        maxConcurrency: 4,
      },
      params: { asyncMode: true },
    });

    // pullNow(id) with no options preserves {} body
    await v1SyncService.pullNow('b3');
    expect(postCalls[2]).toEqual({
      url: '/bindings/b3/pull-now',
      body: {},
      params: undefined,
    });

    await v1SyncService.runBackfill('b3', null, {
      asyncMode: true,
      providerFilter: 'ALL',
      targetPlaneFilter: 'PATIENT_ONLY',
      retryFailedOnly: true,
    });
    expect(postCalls[3]).toEqual({
      url: '/bindings/b3/backfill',
      body: {
        sampleLimit: null,
        providerFilter: 'ALL',
        targetPlaneFilter: 'PATIENT_ONLY',
        retryFailedOnly: true,
      },
      params: { asyncMode: true },
    });
  });

  test('Track 3 zero-jargon formatters map statuses, providers, planes, bytes, rates, and parity labels cleanly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.00 GB');

    expect(formatTransferRate(null)).toBe('—');
    expect(formatTransferRate(0)).toBe('—');
    expect(formatTransferRate(0.05)).toBe('< 0.1 MB/s');
    expect(formatTransferRate(0.2)).toBe('< 0.1 MB/s');
    expect(formatTransferRate(0.39)).toBe('< 0.1 MB/s');
    expect(formatTransferRate(80)).toBe('10.0 MB/s');
    expect(formatTransferRate(18.4)).toBe('2.3 MB/s');
    expect(formatTransferRate(12.34)).toBe('1.5 MB/s');

    expect(formatStorageObjectStatus('MIGRATED')).toEqual({
      label: 'Encrypted & Saved',
      tone: 'success',
    });
    expect(formatStorageObjectStatus('VERIFIED')).toEqual({ label: 'Verified', tone: 'success' });
    expect(formatStorageObjectStatus('SKIPPED_LEGACY_UNSUPPORTED')).toEqual({
      label: 'External Link (Kept As-Is)',
      tone: 'neutral',
    });
    expect(formatStorageObjectStatus('SKIPPED_DEAD_LINK')).toEqual({
      label: 'Unavailable (Kept As-Is)',
      tone: 'warning',
    });
    expect(formatStorageObjectStatus('SKIPPED_EMPTY_BLOB')).toEqual({
      label: 'Unavailable (Kept As-Is)',
      tone: 'warning',
    });
    expect(formatStorageObjectStatus('SKIPPED_AUTH_REQUIRED')).toEqual({
      label: 'Needs Access (Kept As-Is)',
      tone: 'warning',
    });
    expect(formatStorageObjectStatus('FAILED_RETRYABLE')).toEqual({
      label: 'Transfer Failed',
      tone: 'danger',
    });
    expect(formatStorageObjectStatus('FAILED_PERMANENT')).toEqual({
      label: 'Transfer Failed',
      tone: 'danger',
    });
    expect(formatStorageObjectStatus('PENDING')).toEqual({ label: 'Pending', tone: 'neutral' });

    expect(formatStoragePlane('CLINIC_ATTACHMENT')).toBe('Clinic Files');
    expect(formatStoragePlane('PATIENT_FILE')).toBe('Patient Files');

    expect(formatStorageProvider('AZURE_BLOB_1')).toBe('Primary Storage');
    expect(formatStorageProvider('AZURE_BLOB_2')).toBe('Legacy Storage');
    expect(formatStorageProvider('GOOGLE_DRIVE')).toBe('Google Drive');
    expect(formatStorageProvider('OTHER')).toBe('Other Source');

    expect(formatStorageErrorSummary('SKIPPED_DEAD_LINK', 'NXDOMAIN')).not.toContain('NXDOMAIN');
    expect(formatStorageErrorSummary('SKIPPED_AUTH_REQUIRED', '403')).not.toContain('403');

    expect(formatParityEntityLabel('ClinicAttachments')).toBe('Clinic Files');
    expect(formatParityEntityLabel('PatientFiles')).toBe('Patient Files');
    expect(formatParityEntityLabel('SkippedLinks')).toBe(
      'External & Unavailable Links (Kept As-Is)'
    );
    expect(formatParityEntityLabel('RecordAttachments')).toBe('Clinic Files');
    expect(formatParityEntityLabel('record_attachments')).toBe('Clinic Files');
    expect(formatParityEntityLabel('file_records')).toBe('Patient Files');
    expect(formatParityEntityLabel('FileRecords')).toBe('Patient Files');
    expect(formatParityEntityLabel('PatientObstetricProfiles')).toBe('PatientObstetricProfiles');
    expect(formatParityEntityLabel('sync_storage_objects')).toBe('File Storage');
    expect(formatParityEntityLabel('Azure Blob #1')).toBe('Primary Storage');
    expect(formatParityEntityLabel('AzureBlob #1')).toBe('Primary Storage');
    expect(formatParityEntityLabel('AzureBlob')).toBe('Primary Storage');
  });

  test('sanitizeStorageDisplayText strips all backend jargon and translates Track 3 terms cleanly', () => {
    expect(sanitizeStorageDisplayText(null)).toBe('');
    expect(sanitizeStorageDisplayText(undefined)).toBe('');

    const raw = [
      'Migrate Azure Blob #1 and Azure Blob #2 and Google Drive to Track3Storage:ClinicR2 / Track3Storage:PatientR2 (ClinicR2, PatientR2, R2).',
      'Tables: RecordAttachments, file_records, FileRecords, sync_storage_objects.',
      'Statuses: SKIPPED_LEGACY_UNSUPPORTED, SKIPPED_DEAD_LINK, SKIPPED_EMPTY_BLOB, SKIPPED_AUTH_REQUIRED, FAILED_RETRYABLE, FAILED_PERMANENT.',
      'Crypto: CMK, PMK, DEK, record.cez, .cez, AES-256-GCM.',
      'Errors: NXDOMAIN, HTML Interstitial, ClinicEZ.',
      'Counts: Dead=2, Empty=1, Auth=3, Legacy=4; Retryable=5, Permanent=1.',
    ].join(' ');

    const clean = sanitizeStorageDisplayText(raw);
    expect(clean).toContain('Primary Storage');
    expect(clean).toContain('Legacy Storage');
    expect(clean).toContain('External Link');
    expect(clean).toContain('Cloud Storage');
    expect(clean).toContain('Clinic Files');
    expect(clean).toContain('Patient Files');
    expect(clean).toContain('File Storage');
    expect(clean).toContain('External Link (Kept As-Is)');
    expect(clean).toContain('Unavailable (Kept As-Is)');
    expect(clean).toContain('Needs Access (Kept As-Is)');
    expect(clean).toContain('Transfer Failed');
    expect(clean).toContain('encryption key');
    expect(clean).toContain('encrypted file');
    expect(clean).toContain('encrypted');
    expect(clean).toContain('unreachable address');
    expect(clean).toContain('sign-in page');
    expect(clean).toContain('Clinic EZ');
    expect(clean).toContain('Unavailable: 2 dead, 1 empty · Needs Access: 3 · External Link: 4');
    expect(clean).toContain('Temporary failures: 5 · Permanent failures: 1');

    const forbidden = [
      'CMK',
      'PMK',
      'DEK',
      '.cez',
      'SKIPPED_',
      'FAILED_',
      'NXDOMAIN',
      'RecordAttachments',
      'file_records',
      'FileRecords',
      'sync_storage_objects',
      'HTML Interstitial',
      'ClinicEZ',
      'Azure Blob',
    ];
    for (const term of forbidden) {
      expect(clean).not.toContain(term);
    }
    expect(/\bR2\b/.test(clean)).toBe(false);
  });

  test('sanitizeStorageDisplayText catches underscore-delimited, plural, lowercase r2, and mixed-case ClinicEz leaks', () => {
    const edgeRaw = [
      'CMK_MISSING: failed to unwrap DEKs with PMKs in cmk-v1/pmk-v2 (PMK_ERR, DEK_KEY).',
      'R2_UPLOAD_FAILED: lowercase r2 bucket error in r2-client.',
      'ERR_NXDOMAIN and DNS_NXDOMAIN on AzureBlob #1 / record_attachments.',
      'ClinicEz.V1Sync.Api threw ClinicEZ_R2_Objects error.',
    ].join(' ');

    const clean = sanitizeStorageDisplayText(edgeRaw);
    expect(clean).toContain('encryption key');
    expect(clean).toContain('Cloud Storage');
    expect(clean).toContain('unreachable address');
    expect(clean).toContain('Primary Storage');
    expect(clean).toContain('Clinic Files');
    expect(clean).toContain('Clinic EZ.V1Sync.Api');
    expect(clean).not.toMatch(/cmk|pmk|dek|nxdomain|record_attachments|azureblob/i);
    expect(clean).not.toMatch(/(?<![a-z0-9])r2(?![a-z0-9])/i);
    expect(clean).not.toMatch(/Clinic[Ee][Zz]/);
    // Ensure legitimate words containing 'r2' inside alphanumeric tokens are preserved
    expect(sanitizeStorageDisplayText('error2 v2 R2D2')).toBe('error2 v2 R2D2');
  });

  test('sanitizeStorageDisplayText redacts raw URLs/SAS tokens and normalizes Cloudflare R2 / R2_BUCKET / cmk_v1 cleanly', () => {
    const urlRaw =
      'Failed fetching https://clinicezstorage.blob.core.windows.net/prod/patient_999.pdf?sv=2022-11-02&sig=SECRET123 and ?sv=2024&sig=SECRET456';
    const urlClean = sanitizeStorageDisplayText(urlRaw);
    expect(urlClean).not.toContain('https://');
    expect(urlClean).not.toContain('clinicezstorage.blob.core.windows.net');
    expect(urlClean).not.toContain('patient_999.pdf');
    expect(urlClean).not.toContain('SECRET123');
    expect(urlClean).not.toContain('SECRET456');
    expect(urlClean).toContain('[redacted-link]');

    expect(sanitizeStorageDisplayText('Cloudflare R2 upload failed')).toBe(
      'Cloud Storage upload failed'
    );
    expect(sanitizeStorageDisplayText('R2_BUCKET missing')).toBe('Cloud Storage missing');
    expect(sanitizeStorageDisplayText('cmk_v1 key mismatch with pmk-v1')).toBe(
      'encryption key key mismatch with encryption key'
    );
  });
});
