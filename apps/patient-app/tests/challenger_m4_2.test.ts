import { beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';
import {
  UPLOAD_ALLOWED_MIME_TYPES,
  UPLOAD_MAX_BYTES,
  formatBytes,
  validateUploadFile,
  uploadFailureMessage,
} from '../services/documents/uploadRules';
import {
  sanitizeTitleFromFileName,
  matchesCategoryFilter,
  filterAndSearchRecords,
} from '../services/records/categories';
import {
  drainUploadQueue,
  enqueueOfflineRecordUpload,
  getPendingUploadCount,
  resetAndRetryFailedUploads,
} from '../services/sync/uploadQueueService';
import { uploadQueue, type UploadQueueItem } from '../db/schema/uploadQueue';
import { localHealthRecords } from '../db/schema/localHealthRecords';
import { filesMetadata } from '../db/schema/filesMetadata';

// Test DB Generator
function createTestDb() {
  const sqlite = new Database(':memory:');

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

const fakeToken = async () => 'bearer-adversarial-token';

/* ===================================================================== */
/* 1. ADVERSARIAL FILE SIZE & 25 MB BOUNDARY CONDITION SUITE              */
/* ===================================================================== */

describe('CHALLENGER 1: File Size Boundary Conditions & Edge Cases', () => {
  const EXACT_25MB = 25 * 1024 * 1024; // 26,214,400 bytes

  test('Oracle check: exact byte count of 25 MB is 26,214,400 bytes', () => {
    expect(UPLOAD_MAX_BYTES).toBe(26214400);
  });

  test('Boundary: EXACT 25 MB (26,214,400 bytes) MUST PASS', () => {
    const result = validateUploadFile({
      mimeType: 'application/pdf',
      size: 26214400,
    });
    expect(result).toBeNull();
  });

  test('Boundary: 25 MB - 1 byte (26,214,399 bytes) MUST PASS', () => {
    const result = validateUploadFile({
      mimeType: 'image/jpeg',
      size: 26214400 - 1,
    });
    expect(result).toBeNull();
  });

  test('Boundary: 25 MB + 1 byte (26,214,401 bytes) MUST BE REJECTED', () => {
    const result = validateUploadFile({
      mimeType: 'image/png',
      size: 26214400 + 1,
    });
    expect(result).not.toBeNull();
    expect(result).toContain('25.0 MB');
    expect(result).toContain('The limit is 25.0 MB');
  });

  test('Boundary: 0 bytes MUST PASS (empty file allowed during pre-validation)', () => {
    const result = validateUploadFile({
      mimeType: 'application/pdf',
      size: 0,
    });
    expect(result).toBeNull();
  });

  test('Boundary: 1 byte MUST PASS', () => {
    const result = validateUploadFile({
      mimeType: 'image/webp',
      size: 1,
    });
    expect(result).toBeNull();
  });

  test('Boundary: 1 KB (1,024 bytes) MUST PASS', () => {
    const result = validateUploadFile({
      mimeType: 'image/heic',
      size: 1024,
    });
    expect(result).toBeNull();
  });

  test('Boundary: 10 MB (10,485,760 bytes) MUST PASS', () => {
    const result = validateUploadFile({
      mimeType: 'image/heif',
      size: 10 * 1024 * 1024,
    });
    expect(result).toBeNull();
  });

  test('Boundary: 50 MB (52,428,800 bytes) MUST BE REJECTED', () => {
    const result = validateUploadFile({
      mimeType: 'application/pdf',
      size: 50 * 1024 * 1024,
    });
    expect(result).not.toBeNull();
    expect(result).toContain('50.0 MB');
    expect(result).toContain('The limit is 25.0 MB');
  });

  test('Boundary: 100 MB and 1 GB MUST BE REJECTED', () => {
    const res100M = validateUploadFile({
      mimeType: 'image/jpeg',
      size: 100 * 1024 * 1024,
    });
    expect(res100M).not.toBeNull();
    expect(res100M).toContain('100.0 MB');

    const res1G = validateUploadFile({
      mimeType: 'image/jpeg',
      size: 1024 * 1024 * 1024,
    });
    expect(res1G).not.toBeNull();
    expect(res1G).toContain('1024.0 MB');
  });

  test('Adversarial float size: 26,214,400.5 bytes MUST BE REJECTED', () => {
    const result = validateUploadFile({
      mimeType: 'application/pdf',
      size: 26214400.5,
    });
    expect(result).not.toBeNull();
    expect(result).toContain('25.0 MB');
  });

  test('Adversarial size: Number.MAX_SAFE_INTEGER does not crash', () => {
    const result = validateUploadFile({
      mimeType: 'application/pdf',
      size: Number.MAX_SAFE_INTEGER,
    });
    expect(result).not.toBeNull();
    expect(result).toContain('The limit is 25.0 MB');
  });

  test('Adversarial size: Infinity is rejected', () => {
    const result = validateUploadFile({
      mimeType: 'application/pdf',
      size: Infinity,
    });
    expect(result).not.toBeNull();
  });

  test('Format bytes precision verification', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(EXACT_25MB)).toBe('25.0 MB');
    expect(formatBytes(EXACT_25MB + 1)).toBe('25.0 MB');
    expect(formatBytes(50 * 1024 * 1024)).toBe('50.0 MB');
  });
});

/* ===================================================================== */
/* 2. ADVERSARIAL MIME TYPE WHITELIST & GATING SUITE                      */
/* ===================================================================== */

describe('CHALLENGER 2: MIME Type Whitelist & Rejection Gating', () => {
  const APPROVED_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ];

  test('All 6 canonical clinical formats pass validation', () => {
    for (const mime of APPROVED_TYPES) {
      expect(validateUploadFile({ mimeType: mime, size: 5000 })).toBeNull();
    }
  });

  test('Case-insensitivity: UPPERCASE and mixed-case MIME types pass', () => {
    expect(validateUploadFile({ mimeType: 'APPLICATION/PDF', size: 100 })).toBeNull();
    expect(validateUploadFile({ mimeType: 'Image/Jpeg', size: 100 })).toBeNull();
    expect(validateUploadFile({ mimeType: 'IMAGE/PNG', size: 100 })).toBeNull();
    expect(validateUploadFile({ mimeType: 'image/WEBP', size: 100 })).toBeNull();
    expect(validateUploadFile({ mimeType: 'Image/Heic', size: 100 })).toBeNull();
    expect(validateUploadFile({ mimeType: 'IMAGE/HEIF', size: 100 })).toBeNull();
    expect(validateUploadFile({ mimeType: 'aPpLiCaTiOn/PdF', size: 100 })).toBeNull();
  });

  test('Prohibited archive formats MUST BE REJECTED', () => {
    const archives = [
      'application/zip',
      'application/x-zip-compressed',
      'application/x-tar',
      'application/gzip',
      'application/x-7z-compressed',
      'application/x-rar-compressed',
    ];
    for (const mime of archives) {
      const err = validateUploadFile({ mimeType: mime, size: 100 });
      expect(err).not.toBeNull();
      expect(err).toContain('Unsupported file type');
    }
  });

  test('Prohibited executable & script formats MUST BE REJECTED', () => {
    const executables = [
      'application/x-msdownload',
      'application/x-executable',
      'application/javascript',
      'text/javascript',
      'application/x-sh',
      'application/x-bat',
      'application/octet-stream',
    ];
    for (const mime of executables) {
      const err = validateUploadFile({ mimeType: mime, size: 100 });
      expect(err).not.toBeNull();
      expect(err).toContain('Unsupported file type');
    }
  });

  test('Prohibited markup & document formats MUST BE REJECTED', () => {
    const docs = [
      'text/plain',
      'text/html',
      'text/xml',
      'application/json',
      'application/xml',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
    ];
    for (const mime of docs) {
      const err = validateUploadFile({ mimeType: mime, size: 100 });
      expect(err).not.toBeNull();
      expect(err).toContain('Unsupported file type');
    }
  });

  test('Prohibited media formats (audio/video/unsupported images) MUST BE REJECTED', () => {
    const media = [
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      'audio/mpeg',
      'audio/wav',
      'image/gif',
      'image/bmp',
      'image/svg+xml',
      'image/tiff',
    ];
    for (const mime of media) {
      const err = validateUploadFile({ mimeType: mime, size: 100 });
      expect(err).not.toBeNull();
      expect(err).toContain('Unsupported file type');
    }
  });

  test('Null, undefined, empty, and whitespace MIME types MUST BE REJECTED', () => {
    expect(validateUploadFile({ mimeType: null, size: 100 })).toContain('Unsupported file type');
    expect(validateUploadFile({ mimeType: undefined, size: 100 })).toContain('Unsupported file type');
    expect(validateUploadFile({ mimeType: '', size: 100 })).toContain('Unsupported file type');
    expect(validateUploadFile({ mimeType: '   ', size: 100 })).toContain('Unsupported file type');
  });

  test('MIME types with trailing parameters or spaces are defensively rejected', () => {
    expect(validateUploadFile({ mimeType: 'application/pdf; charset=utf-8', size: 100 })).toContain(
      'Unsupported file type'
    );
    expect(validateUploadFile({ mimeType: ' application/pdf ', size: 100 })).toContain(
      'Unsupported file type'
    );
  });
});

/* ===================================================================== */
/* 3. ADVERSARIAL TITLE SANITIZATION & METADATA SUITE                     */
/* ===================================================================== */

describe('CHALLENGER 3: Title Sanitization & Path Traversal Neutralization', () => {
  test('Path separator and special characters in filenames for title generation', () => {
    // Note: sanitizeTitleFromFileName humanizes filename into a record title;
    // actual storage keys use UUIDs (recordId), so slash injection into filesystem paths does not occur.
    expect(sanitizeTitleFromFileName('../../etc/shadow.pdf')).toBe('/ /etc/shadow');
    expect(sanitizeTitleFromFileName('..\\..\\windows\\cmd.exe.png')).toBe('\\ \\windows\\cmd exe');
    expect(sanitizeTitleFromFileName('../../../secret_record.jpeg')).toBe('/ / /secret record');
    expect(sanitizeTitleFromFileName('blood_test_report.pdf')).toBe('blood test report');
  });

  test('Dots, underscores, and dashes are converted to spaces without collapse failure', () => {
    expect(sanitizeTitleFromFileName('CBC__Report---2026.10.21..pdf')).toBe('CBC Report 2026 10 21');
  });

  test('Extension-only or empty strings fallback to default "Medical Record"', () => {
    expect(sanitizeTitleFromFileName('.pdf')).toBe('Medical Record');
    expect(sanitizeTitleFromFileName('.jpeg')).toBe('Medical Record');
    expect(sanitizeTitleFromFileName('   ')).toBe('Medical Record');
    expect(sanitizeTitleFromFileName('')).toBe('Medical Record');
  });

  test('Extreme length filenames are truncated to 200 characters max', () => {
    const longName = 'clinical_study_observation_'.repeat(20) + '.pdf';
    const sanitized = sanitizeTitleFromFileName(longName);
    expect(sanitized.length).toBeLessThanOrEqual(200);
  });
});

/* ===================================================================== */
/* 4. OPTIMISTIC OFFLINE ENQUEUE & IMMEDIATE PREVIEW INTEGRITY SUITE      */
/* ===================================================================== */

describe('CHALLENGER 4: Optimistic Offline Enqueue, 0ms Preview & Lifecycle Drain', () => {
  let db: ReturnType<typeof createTestDb>['db'];

  beforeEach(() => {
    db = createTestDb().db;
  });

  test('0ms offline enqueue immediately writes all records with queued syncStatus', async () => {
    const startTime = performance.now();

    const recordId = await enqueueOfflineRecordUpload(
      {
        patientId: 'patient-challenger-1',
        documentTypeId: 'imaging',
        category: 'imaging',
        title: 'Lumbar Spine X-Ray',
        fileName: 'lumbar_xray.png',
        mimeType: 'image/png',
        sizeBytes: 4500000,
        documentDate: '2026-10-22',
        facilityName: 'National Kidney and Transplant Institute',
        notes: 'Mild L4-L5 disc space narrowing',
        localUri: '/sandbox/records/patient-challenger-1/lumbar_xray.png',
      },
      fakeToken,
      { isOnline: async () => false, db }
    );

    const elapsed = performance.now() - startTime;
    // Must be fast (< 100ms in in-memory SQLite)
    expect(elapsed).toBeLessThan(150);

    // 1. Verify localHealthRecords
    const [record] = db
      .select()
      .from(localHealthRecords)
      .where(eq(localHealthRecords.id, recordId))
      .all();

    expect(record).toBeDefined();
    expect(record.id).toBe(recordId);
    expect(record.patientId).toBe('patient-challenger-1');
    expect(record.category).toBe('imaging');
    expect(record.title).toBe('Lumbar Spine X-Ray');
    expect(record.fileName).toBe('lumbar_xray.png');
    expect(record.mimeType).toBe('image/png');
    expect(record.sizeBytes).toBe(4500000);
    expect(record.documentDate).toBe('2026-10-22');
    expect(record.facilityName).toBe('National Kidney and Transplant Institute');
    expect(record.notes).toBe('Mild L4-L5 disc space narrowing');
    expect(record.syncStatus).toBe('queued');
    expect(record.isCached).toBe(true);
    expect(record.localBlobPath).toBe('/sandbox/records/patient-challenger-1/lumbar_xray.png');
    expect(record.serverId).toBeNull();
    expect(record.storageKey).toBeNull();

    // 2. Verify filesMetadata synchronization
    const [fileMeta] = db
      .select()
      .from(filesMetadata)
      .where(eq(filesMetadata.id, recordId))
      .all();

    expect(fileMeta).toBeDefined();
    expect(fileMeta.id).toBe(recordId);
    expect(fileMeta.title).toBe('Lumbar Spine X-Ray');
    expect(fileMeta.name).toBe('lumbar_xray.png');
    expect(fileMeta.syncStatus).toBe('queued');
    expect(fileMeta.isCached).toBe(true);
    expect(fileMeta.localPath).toBe('/sandbox/records/patient-challenger-1/lumbar_xray.png');

    // 3. Verify uploadQueue job
    const [queueItem] = db
      .select()
      .from(uploadQueue)
      .where(eq(uploadQueue.recordId, recordId))
      .all();

    expect(queueItem).toBeDefined();
    expect(queueItem.patientId).toBe('patient-challenger-1');
    expect(queueItem.recordId).toBe(recordId);
    expect(queueItem.status).toBe('queued');
    expect(queueItem.attempts).toBe(0);
    expect(queueItem.fatalError).toBe(0);
    expect(queueItem.errorMessage).toBeNull();
  });

  test('Immediate preview query returns newly queued record with zero network delay', async () => {
    await enqueueOfflineRecordUpload(
      {
        patientId: 'patient-challenger-2',
        documentTypeId: 'prescription',
        category: 'prescription',
        title: 'Metformin 500mg Tablet',
        fileName: 'metformin_rx.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 95000,
        localUri: '/sandbox/records/patient-challenger-2/metformin_rx.jpg',
      },
      undefined,
      { isOnline: async () => false, db }
    );

    // Instant local query
    const patientRecords = db
      .select()
      .from(localHealthRecords)
      .where(eq(localHealthRecords.patientId, 'patient-challenger-2'))
      .all();

    expect(patientRecords.length).toBe(1);
    expect(patientRecords[0].title).toBe('Metformin 500mg Tablet');
    expect(patientRecords[0].syncStatus).toBe('queued');
    expect(patientRecords[0].localBlobPath).toBe(
      '/sandbox/records/patient-challenger-2/metformin_rx.jpg'
    );
  });

  test('Background drain passes queued items to synced without wiping local cache', async () => {
    const recordId = await enqueueOfflineRecordUpload(
      {
        patientId: 'patient-challenger-3',
        documentTypeId: 'certificate',
        category: 'certificate',
        title: 'Fit to Work Certificate',
        fileName: 'fit_to_work.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 124000,
        localUri: '/sandbox/records/patient-challenger-3/fit_to_work.pdf',
      },
      undefined,
      { isOnline: async () => false, db }
    );

    expect(await getPendingUploadCount('patient-challenger-3', db)).toBe(1);

    const mockUpload = async (job: UploadQueueItem) => ({
      id: `cloud-record-${job.recordId}`,
      storageKey: `patients/${job.patientId}/records/${job.recordId}.cez`,
    });

    const drainResult = await drainUploadQueue('patient-challenger-3', fakeToken, {
      isOnline: async () => true,
      uploadFn: mockUpload,
      db,
    });

    expect(drainResult.drained).toBe(1);
    expect(drainResult.failed).toBe(0);
    expect(drainResult.pending).toBe(0);

    // Verify localHealthRecords transitioned to synced
    const [syncedRec] = db
      .select()
      .from(localHealthRecords)
      .where(eq(localHealthRecords.id, recordId))
      .all();

    expect(syncedRec.syncStatus).toBe('synced');
    expect(syncedRec.serverId).toBe(`cloud-record-${recordId}`);
    expect(syncedRec.storageKey).toBe(
      `patients/patient-challenger-3/records/${recordId}.cez`
    );
    expect(syncedRec.localBlobPath).toBe(
      '/sandbox/records/patient-challenger-3/fit_to_work.pdf'
    );
    expect(syncedRec.isCached).toBe(true); // Must remain cached for offline viewing!

    // Verify filesMetadata transitioned to synced
    const [syncedFile] = db
      .select()
      .from(filesMetadata)
      .where(eq(filesMetadata.id, recordId))
      .all();

    expect(syncedFile.syncStatus).toBe('synced');
    expect(syncedFile.cloudObjectKey).toBe(
      `patients/patient-challenger-3/records/${recordId}.cez`
    );
  });

  test('Burst consecutive offline enqueues preserve order and drain cleanly', async () => {
    const count = 5;
    const recordIds: string[] = [];

    for (let i = 0; i < count; i++) {
      const id = await enqueueOfflineRecordUpload(
        {
          patientId: 'patient-burst-1',
          documentTypeId: 'lab_result',
          category: 'lab_result',
          title: `Lab Test #${i + 1}`,
          fileName: `lab_${i + 1}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 20000 + i,
          localUri: `/sandbox/records/patient-burst-1/lab_${i + 1}.pdf`,
        },
        undefined,
        { isOnline: async () => false, db }
      );
      recordIds.push(id);
    }

    expect(await getPendingUploadCount('patient-burst-1', db)).toBe(5);

    const uploadedIds: string[] = [];
    const mockUpload = async (job: UploadQueueItem) => {
      uploadedIds.push(job.recordId);
      return {
        id: `cloud-${job.recordId}`,
        storageKey: `patients/${job.patientId}/records/${job.recordId}.cez`,
      };
    };

    const drainResult = await drainUploadQueue('patient-burst-1', fakeToken, {
      isOnline: async () => true,
      uploadFn: mockUpload,
      db,
    });

    expect(drainResult.drained).toBe(5);
    expect(drainResult.failed).toBe(0);
    expect(drainResult.pending).toBe(0);
    expect(uploadedIds.length).toBe(5);

    // Check all are synced
    const allRecords = db
      .select()
      .from(localHealthRecords)
      .where(eq(localHealthRecords.patientId, 'patient-burst-1'))
      .all();

    for (const rec of allRecords) {
      expect(rec.syncStatus).toBe('synced');
      expect(rec.serverId).toBe(`cloud-${rec.id}`);
      expect(rec.isCached).toBe(true);
    }
  });

  test('Deleted records in localHealthRecords are cleanly dropped from uploadQueue during drain', async () => {
    const recordId = await enqueueOfflineRecordUpload(
      {
        patientId: 'patient-del-1',
        documentTypeId: 'other',
        category: 'other',
        title: 'Accidental Upload Document',
        fileName: 'accidental.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 50000,
        localUri: '/sandbox/records/patient-del-1/accidental.pdf',
      },
      undefined,
      { isOnline: async () => false, db }
    );

    // User deletes record locally before reconnecting
    db.update(localHealthRecords)
      .set({ deletedAt: new Date() })
      .where(eq(localHealthRecords.id, recordId))
      .run();

    let uploaded = false;
    const mockUpload = async () => {
      uploaded = true;
      return { id: 'should-not-reach', storageKey: 'should-not-reach' };
    };

    const drainResult = await drainUploadQueue('patient-del-1', fakeToken, {
      isOnline: async () => true,
      uploadFn: mockUpload,
      db,
    });

    expect(uploaded).toBe(false); // Deleted item was NOT sent to server
    expect(drainResult.drained).toBe(0);

    // Queue item was pruned
    const queueRows = db
      .select()
      .from(uploadQueue)
      .where(eq(uploadQueue.recordId, recordId))
      .all();
    expect(queueRows.length).toBe(0);
  });
});
