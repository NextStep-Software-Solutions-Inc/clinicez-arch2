import { afterEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { api } from '../services/api/apiClient';
import { getPatientRecordStreamUrl } from '../services/api/filesApi';
import { appendFilePart } from '../services/api/multipart';
import {
  DOCUMENT_TYPE_IDS,
  inferCategoryFromDocumentType,
  inferDocumentTypeFromFileName,
  resolveDocumentTypeId,
} from '../services/files/documentTypeMapping';
import {
  getActiveDocumentTypes,
  getCachedDocumentTypes,
  refreshDocumentTypes,
} from '../services/files/filesShared';
import { cleanupPreviewCache, revokePreviewUri } from '../services/files/filesService.web';
import type { DocumentTypeResponse } from '../services/files/types';
import { blobStorage } from '../services/storage';
import { webBlobStorage } from '../services/storage/blobStorage.web';
import { resetAndRetryFailedUploads } from '../services/sync/uploadQueueService';
import { filesMetadata } from '../db/schema/filesMetadata';
import { localHealthRecords } from '../db/schema/localHealthRecords';
import { uploadQueue } from '../db/schema/uploadQueue';

function createFullSyncTestDb() {
  const sqlite = new Database(':memory:');

  sqlite.run(`
    CREATE TABLE document_types (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      supported_extensions_json TEXT NOT NULL DEFAULT '[]',
      supported_mime_types_json TEXT NOT NULL DEFAULT '[]',
      native_preview_kind TEXT NOT NULL DEFAULT 'external',
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      fetched_at INTEGER NOT NULL,
      server_updated_at INTEGER
    );
  `);

  sqlite.run(`
    CREATE TABLE upload_queue (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      record_id TEXT NOT NULL,
      file_uri TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      title TEXT NOT NULL,
      document_type_id TEXT NOT NULL,
      document_date TEXT,
      facility_name TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_attempt_at INTEGER,
      error_message TEXT,
      fatal_error INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  sqlite.run(`
    CREATE TABLE local_health_records (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      category TEXT NOT NULL,
      document_type_id TEXT NOT NULL,
      title TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      document_date TEXT,
      facility_name TEXT,
      notes TEXT,
      provenance TEXT NOT NULL DEFAULT 'patient_uploaded',
      urgency TEXT NOT NULL DEFAULT 'routine',
      local_blob_path TEXT,
      is_cached INTEGER NOT NULL DEFAULT 0,
      sync_status TEXT NOT NULL DEFAULT 'queued',
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_sync_error TEXT,
      server_id TEXT,
      storage_key TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      synced_at INTEGER
    );
  `);

  sqlite.run(`
    CREATE TABLE files_metadata (
      id TEXT PRIMARY KEY,
      patient_id TEXT,
      clinic_id TEXT,
      document_type_id TEXT NOT NULL,
      name TEXT NOT NULL,
      title TEXT,
      type TEXT,
      mime_type TEXT,
      extension TEXT,
      size_bytes INTEGER,
      document_date TEXT,
      facility_name TEXT,
      notes TEXT,
      server_url TEXT,
      local_path TEXT,
      is_cached INTEGER NOT NULL DEFAULT 0,
      cloud_object_key TEXT,
      sync_status TEXT NOT NULL DEFAULT 'local',
      sync_operation TEXT NOT NULL DEFAULT 'insert',
      sync_error TEXT,
      last_sync_error TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      synced_at INTEGER,
      server_id TEXT,
      server_created_at INTEGER,
      server_updated_at INTEGER
    );
  `);

  return { sqlite, db: drizzle(sqlite) };
}

const fakeToken = async () => 'test-jwt-token';

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalFetch = globalThis.fetch;
const originalPostForm = api.postForm;
const originalEnvApiUrl = process.env.EXPO_PUBLIC_API_URL;

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  globalThis.fetch = originalFetch;
  api.postForm = originalPostForm;
  if (originalEnvApiUrl === undefined) {
    delete process.env.EXPO_PUBLIC_API_URL;
  } else {
    process.env.EXPO_PUBLIC_API_URL = originalEnvApiUrl;
  }
});

describe('File Sync, Backend Document Types Reconciliation, and Reopen Preview Regressions', () => {
  test('downloads backend document types into local SQLite and reconciles backend edits, deactivations, additions, and deletions', async () => {
    const { db } = createFullSyncTestDb();

    const initialBackendCatalog: DocumentTypeResponse[] = [
      {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        code: 'lab-result',
        label: 'Lab Result',
        description: 'Blood chemistry and urinalysis reports',
        supportedExtensions: ['pdf', 'jpg'],
        supportedMimeTypes: ['application/pdf', 'image/jpeg'],
        nativePreviewKind: 'pdf',
        isActive: true,
        sortOrder: 10,
        serverUpdatedAt: '2026-10-20T08:00:00Z',
      },
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        code: 'medical-certificate',
        label: 'Medical Certificate',
        description: 'Fit-to-work and clearance certificates',
        supportedExtensions: ['pdf', 'png'],
        supportedMimeTypes: ['application/pdf', 'image/png'],
        nativePreviewKind: 'pdf',
        isActive: true,
        sortOrder: 20,
        serverUpdatedAt: '2026-10-20T08:00:00Z',
      },
      {
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        code: 'temporary-form',
        label: 'Temporary Intake Form',
        supportedExtensions: ['pdf'],
        supportedMimeTypes: ['application/pdf'],
        nativePreviewKind: 'pdf',
        isActive: true,
        sortOrder: 30,
        serverUpdatedAt: '2026-10-20T08:00:00Z',
      },
      {
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        code: 'other',
        label: 'Other Health Document',
        supportedExtensions: ['pdf', 'jpg', 'png'],
        supportedMimeTypes: ['*/*'],
        nativePreviewKind: 'external',
        isActive: true,
        sortOrder: 100,
        serverUpdatedAt: '2026-10-20T08:00:00Z',
      },
    ];

    // 1. Initial sync from backend into local SQLite
    const initialSynced = await refreshDocumentTypes('patient-1', fakeToken, {
      db,
      fetchFn: async () => initialBackendCatalog,
    });

    expect(initialSynced.map((t) => t.id)).toEqual([
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'dddddddd-dddd-dddd-dddd-dddddddddddd',
    ]);

    // 2. Backend changes:
    //    - lab-result renamed + extensions expanded
    //    - medical-certificate deactivated (isActive: false)
    //    - ultrasound added as a brand-new type
    //    - temporary-form deleted on backend (omitted)
    const updatedBackendCatalog: DocumentTypeResponse[] = [
      {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        code: 'lab-result',
        label: 'Clinical Laboratory Report',
        description: 'Updated description from backend',
        supportedExtensions: ['pdf', 'jpg', 'png', 'webp'],
        supportedMimeTypes: ['application/pdf', 'image/*'],
        nativePreviewKind: 'pdf',
        isActive: true,
        sortOrder: 5,
        serverUpdatedAt: '2026-10-24T09:30:00Z',
      },
      {
        id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        code: 'ultrasound',
        label: 'Ultrasound Scan',
        description: 'Diagnostic ultrasound imaging',
        supportedExtensions: ['jpg', 'png', 'pdf'],
        supportedMimeTypes: ['image/*', 'application/pdf'],
        nativePreviewKind: 'image',
        isActive: true,
        sortOrder: 15,
        serverUpdatedAt: '2026-10-24T09:30:00Z',
      },
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        code: 'medical-certificate',
        label: 'Medical Certificate (Archived)',
        supportedExtensions: ['pdf'],
        supportedMimeTypes: ['application/pdf'],
        nativePreviewKind: 'pdf',
        isActive: false,
        sortOrder: 25,
        serverUpdatedAt: '2026-10-24T09:30:00Z',
      },
      {
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        code: 'other',
        label: 'Other Health Document',
        supportedExtensions: ['pdf', 'jpg', 'png'],
        supportedMimeTypes: ['*/*'],
        nativePreviewKind: 'external',
        isActive: true,
        sortOrder: 100,
        serverUpdatedAt: '2026-10-24T09:30:00Z',
      },
    ];

    await refreshDocumentTypes('patient-1', fakeToken, {
      db,
      fetchFn: async () => updatedBackendCatalog,
    });

    const allCached = await getCachedDocumentTypes(db);
    // Deleted 'temporary-form' row is pruned from SQLite
    expect(allCached.some((t) => t.id === 'cccccccc-cccc-cccc-cccc-cccccccccccc')).toBe(false);
    // Renamed label and expanded extensions are persisted
    const updatedLab = allCached.find((t) => t.id === 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(updatedLab?.label).toBe('Clinical Laboratory Report');
    expect(JSON.parse(updatedLab?.supportedExtensionsJson ?? '[]')).toEqual(['pdf', 'jpg', 'png', 'webp']);

    // Active-only selector excludes deactivated 'medical-certificate' and includes new 'ultrasound'
    const activeOnly = await getActiveDocumentTypes(db);
    expect(activeOnly.map((t) => t.code)).toEqual(['lab-result', 'ultrasound', 'other']);

    // Filename & category inference works seamlessly with newly added backend types
    const inferredUltrasound = inferDocumentTypeFromFileName('pelvic-ultrasound-2026.jpg', activeOnly);
    expect(inferCategoryFromDocumentType(activeOnly[1])).toBe('imaging');
    expect(inferredUltrasound).toBeNull(); // 'xray' code absent in activeOnly, so no false positive

    // 3. Offline fallback: if backend is unreachable, local SQLite preserves synced backend types
    const offlineCached = await refreshDocumentTypes('patient-1', fakeToken, {
      db,
      fetchFn: async () => {
        throw new Error('Offline network error');
      },
    });
    expect(offlineCached.map((t) => t.id)).toEqual([
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'dddddddd-dddd-dddd-dddd-dddddddddddd',
    ]);
  });

  test('preview object URL lifecycle creates a fresh unrevoked blob URL on 2nd and 3rd opens without page refresh', async () => {
    let urlCounter = 0;
    const createdUrls = new Map<string, Blob>();
    const revokedUrls = new Set<string>();

    URL.createObjectURL = ((blob: Blob) => {
      const nextUrl = `blob:https://my.dev.clinicez.net/mock-preview-${++urlCounter}`;
      createdUrls.set(nextUrl, blob);
      return nextUrl;
    }) as typeof URL.createObjectURL;

    URL.revokeObjectURL = ((url: string) => {
      revokedUrls.add(url);
    }) as typeof URL.revokeObjectURL;

    const blobKey = 'patient-preview-test/records/rec-img-1.jpg';
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    await webBlobStorage.saveBlob(blobKey, jpegBytes, 'image/jpeg');

    // 1st open -> valid unrevoked blob URL with image/jpeg MIME
    const uri1 = await webBlobStorage.getBlobUri(blobKey, 'image/jpeg');
    expect(uri1).toBe('blob:https://my.dev.clinicez.net/mock-preview-1');
    expect(revokedUrls.has(uri1!)).toBe(false);
    expect(createdUrls.get(uri1!)?.type).toContain('image/jpeg');

    // Close / unmount 1st preview
    revokePreviewUri('rec-img-1', uri1!);
    expect(revokedUrls.has(uri1!)).toBe(true);

    // 2nd open -> MUST mint a fresh unrevoked blob URL instead of returning revoked uri1
    const uri2 = await webBlobStorage.getBlobUri(blobKey, 'image/jpeg');
    expect(uri2).toBe('blob:https://my.dev.clinicez.net/mock-preview-2');
    expect(uri2).not.toBe(uri1);
    expect(revokedUrls.has(uri2!)).toBe(false);

    // Cleanup preview cache & open 3rd time
    webBlobStorage.revokeBlobUri?.(uri2!);
    await cleanupPreviewCache('patient-preview-test', 'rec-img-1');
    expect(revokedUrls.has(uri2!)).toBe(true);

    const uri3 = await webBlobStorage.getBlobUri(blobKey, 'image/jpeg');
    expect(uri3).toBe('blob:https://my.dev.clinicez.net/mock-preview-3');
    expect(revokedUrls.has(uri3!)).toBe(false);

    await webBlobStorage.deleteBlob(blobKey);
    expect(revokedUrls.has(uri3!)).toBe(true);
  });

  test('appendFilePart reads web IndexedDB blobStorage keys directly instead of fetching SPA index.html', async () => {
    const blobKey = 'patient-web-upload/records/rec-scan-99.jpg';
    const expectedBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x11, 0x22, 0x33, 0x44]);
    await blobStorage.saveBlob(blobKey, expectedBytes, 'image/jpeg');

    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error('fetch() must NOT be called for relative IndexedDB blobStorage keys');
    }) as unknown as typeof fetch;

    const form = new FormData();
    await appendFilePart(form, 'file', {
      uri: blobKey,
      name: 'medical-cert-scan.jpg',
      mimeType: 'image/jpeg',
    });

    expect(fetchCalled).toBe(false);
    const attached = form.get('file') as File;
    expect(attached).toBeTruthy();
    expect(attached.name).toBe('medical-cert-scan.jpg');
    expect(attached.type).toContain('image/jpeg');
    expect(new Uint8Array(await attached.arrayBuffer())).toEqual(expectedBytes);

    await blobStorage.deleteBlob(blobKey);
  });

  test('Retry Now heals legacy failed uploads with non-UUID category slugs using synced backend document_types', async () => {
    const { db } = createFullSyncTestDb();
    const patientId = 'patient-heal-1';
    const recordId = 'aaaaaaaa-1111-2222-3333-444444444444';
    const queueId = 'bbbbbbbb-1111-2222-3333-444444444444';
    const blobKey = `${patientId}/records/${recordId}.jpg`;
    const imageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

    await blobStorage.saveBlob(blobKey, imageBytes, 'image/jpeg');

    // Sync backend document types where medical-certificate has a backend-assigned UUID
    const backendCertTypeId = '99999999-8888-7777-6666-555555555555';
    await refreshDocumentTypes(patientId, fakeToken, {
      db,
      fetchFn: async () => [
        {
          id: backendCertTypeId,
          code: 'medical-certificate',
          label: 'Medical Certificate',
          supportedExtensions: ['pdf', 'jpg'],
          supportedMimeTypes: ['application/pdf', 'image/jpeg'],
          nativePreviewKind: 'image',
          isActive: true,
          sortOrder: 10,
        },
        {
          id: DOCUMENT_TYPE_IDS.other,
          code: 'other',
          label: 'Other Medical File',
          supportedExtensions: ['pdf', 'jpg'],
          supportedMimeTypes: ['*/*'],
          nativePreviewKind: 'external',
          isActive: true,
          sortOrder: 100,
        },
      ],
    });

    const createdAt = new Date(Date.now() - 60_000);

    // Seed a previously failed upload that had legacy slug 'certificate' and fatalError/500 error
    await db.insert(localHealthRecords).values({
      id: recordId,
      patientId,
      category: 'certificate',
      documentTypeId: 'certificate',
      title: 'Fit to Work Certificate',
      fileName: 'fit-to-work.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: imageBytes.byteLength,
      provenance: 'patient_uploaded',
      urgency: 'routine',
      localBlobPath: blobKey,
      isCached: true,
      syncStatus: 'failed',
      retryCount: 3,
      lastSyncError: 'An unexpected server error occurred. Support Reference: 00-abc',
      createdAt,
      updatedAt: createdAt,
    });

    await db.insert(filesMetadata).values({
      id: recordId,
      patientId,
      documentTypeId: 'certificate',
      name: 'fit-to-work.jpg',
      title: 'Fit to Work Certificate',
      type: 'certificate',
      mimeType: 'image/jpeg',
      extension: 'jpg',
      sizeBytes: imageBytes.byteLength,
      localPath: blobKey,
      isCached: true,
      syncStatus: 'failed',
      syncOperation: 'insert',
      syncError: 'An unexpected server error occurred.',
      lastSyncError: 'An unexpected server error occurred.',
      retryCount: 3,
      createdAt,
      updatedAt: createdAt,
    });

    await db.insert(uploadQueue).values({
      id: queueId,
      patientId,
      recordId,
      fileUri: blobKey,
      fileName: 'fit-to-work.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: imageBytes.byteLength,
      title: 'Fit to Work Certificate',
      documentTypeId: 'certificate',
      status: 'failed',
      attempts: 3,
      lastAttemptAt: createdAt,
      errorMessage: 'An unexpected server error occurred.',
      fatalError: 0,
      createdAt,
      updatedAt: createdAt,
    });

    let postedPath = '';
    let postedDocTypeId = '';
    let postedClientFileId = '';
    let postedFileBytes: Uint8Array | null = null;

    api.postForm = (async (_getToken: unknown, path: string, form: FormData) => {
      postedPath = path;
      postedDocTypeId = String(form.get('documentTypeId') ?? '');
      postedClientFileId = String(form.get('clientFileId') ?? '');
      const filePart = form.get('file') as File;
      postedFileBytes = new Uint8Array(await filePart.arrayBuffer());
      return {
        id: recordId,
        storageKey: `patients/${patientId}/records/${recordId}.cez`,
      } as any;
    }) as typeof api.postForm;

    const drainRes = await resetAndRetryFailedUploads(patientId, fakeToken, {
      db,
      isOnline: async () => true,
    });

    expect(drainRes.drained).toBe(1);
    expect(drainRes.failed).toBe(0);
    expect(postedPath).toBe(`/patients/${patientId}/records`);
    expect(postedDocTypeId).toBe(backendCertTypeId);
    expect(postedClientFileId).toBe(recordId);
    expect(postedFileBytes).toEqual(imageBytes);

    const [updatedRecord] = await db
      .select()
      .from(localHealthRecords)
      .where(eq(localHealthRecords.id, recordId));
    expect(updatedRecord.syncStatus).toBe('synced');
    expect(updatedRecord.documentTypeId).toBe(backendCertTypeId);
    expect(updatedRecord.lastSyncError).toBeNull();

    const [updatedMeta] = await db
      .select()
      .from(filesMetadata)
      .where(eq(filesMetadata.id, recordId));
    expect(updatedMeta.syncStatus).toBe('synced');
    expect(updatedMeta.documentTypeId).toBe(backendCertTypeId);

    await blobStorage.deleteBlob(blobKey);
  });

  test('resolveDocumentTypeId and getPatientRecordStreamUrl normalize slugs and base URLs cleanly', () => {
    expect(resolveDocumentTypeId('certificate')).toBe(DOCUMENT_TYPE_IDS.medicalCertificate);
    expect(resolveDocumentTypeId('lab_result')).toBe(DOCUMENT_TYPE_IDS.labResult);
    expect(resolveDocumentTypeId('imaging')).toBe(DOCUMENT_TYPE_IDS.xray);
    expect(resolveDocumentTypeId('prescription')).toBe(DOCUMENT_TYPE_IDS.prescription);
    expect(resolveDocumentTypeId('vaccine_card')).toBe(DOCUMENT_TYPE_IDS.other);

    for (const base of [
      'https://patient-api.dev.clinicez.net',
      'https://patient-api.dev.clinicez.net/api/v1',
      'https://patient-api.dev.clinicez.net/api/v1/',
    ]) {
      process.env.EXPO_PUBLIC_API_URL = base;
      expect(getPatientRecordStreamUrl('pat-1', 'file-2')).toBe(
        'https://patient-api.dev.clinicez.net/api/v1/patients/pat-1/records/file-2/stream'
      );
    }
  });
});
