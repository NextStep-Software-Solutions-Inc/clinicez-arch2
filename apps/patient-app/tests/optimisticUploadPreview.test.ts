import { beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';
import {
  drainUploadQueue,
  enqueueOfflineRecordUpload,
  getPendingUploadCount,
  resetAndRetryFailedUploads,
} from '../services/sync/uploadQueueService';
import { uploadQueue, type UploadQueueItem } from '../db/schema/uploadQueue';
import { localHealthRecords } from '../db/schema/localHealthRecords';
import { filesMetadata } from '../db/schema/filesMetadata';

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

const fakeToken = async () => 'test-bearer-token';

describe('Optimistic Upload Preview & Offline Lifecycle', () => {
  let db: ReturnType<typeof createTestDb>['db'];

  beforeEach(() => {
    db = createTestDb().db;
  });

  test('0ms offline enqueue immediately inserts record with queued sync status', async () => {
    const recordId = await enqueueOfflineRecordUpload(
      {
        patientId: 'patient-test-1',
        documentTypeId: 'lab_result',
        category: 'lab_result',
        title: 'Complete Blood Count (CBC)',
        fileName: 'cbc_report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 15420,
        documentDate: '2026-10-21',
        facilityName: "St. Luke's Medical Center",
        notes: 'Routine executive checkup',
        localUri: '/sandbox/records/patient-test-1/cbc_report.pdf',
      },
      fakeToken,
      { isOnline: async () => false, db }
    );

    expect(recordId).toBeDefined();

    // 1. Verify optimistic presence in localHealthRecords
    const [healthRecord] = db
      .select()
      .from(localHealthRecords)
      .where(eq(localHealthRecords.id, recordId))
      .all();

    expect(healthRecord).toBeDefined();
    expect(healthRecord.title).toBe('Complete Blood Count (CBC)');
    expect(healthRecord.category).toBe('lab_result');
    expect(healthRecord.documentDate).toBe('2026-10-21');
    expect(healthRecord.facilityName).toBe("St. Luke's Medical Center");
    expect(healthRecord.notes).toBe('Routine executive checkup');
    expect(healthRecord.syncStatus).toBe('queued');
    expect(healthRecord.isCached).toBe(true);
    expect(healthRecord.localBlobPath).toBe('/sandbox/records/patient-test-1/cbc_report.pdf');

    // 2. Verify optimistic presence in filesMetadata
    const [fileMeta] = db
      .select()
      .from(filesMetadata)
      .where(eq(filesMetadata.id, recordId))
      .all();

    expect(fileMeta).toBeDefined();
    expect(fileMeta.title).toBe('Complete Blood Count (CBC)');
    expect(fileMeta.syncStatus).toBe('queued');
    expect(fileMeta.isCached).toBe(true);

    // 3. Verify queued job in uploadQueue
    const [queueItem] = db
      .select()
      .from(uploadQueue)
      .where(eq(uploadQueue.recordId, recordId))
      .all();

    expect(queueItem).toBeDefined();
    expect(queueItem.status).toBe('queued');
    expect(queueItem.attempts).toBe(0);
  });

  test('transitions queued record to synced when connectivity resumes', async () => {
    const recordId = await enqueueOfflineRecordUpload(
      {
        patientId: 'patient-test-2',
        documentTypeId: 'prescription',
        category: 'prescription',
        title: 'Amoxicillin 500mg Capsule',
        fileName: 'amox_rx.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 84000,
        documentDate: '2026-10-20',
        facilityName: 'Community Clinic',
        localUri: '/sandbox/records/patient-test-2/amox_rx.jpg',
      },
      undefined,
      { isOnline: async () => false, db }
    );

    expect(await getPendingUploadCount('patient-test-2', db)).toBe(1);

    // Mock upload API call returning server ID and cloud storage key
    const mockUpload = async (job: UploadQueueItem) => {
      return {
        id: `server-id-${job.recordId}`,
        storageKey: `patients/${job.patientId}/records/${job.recordId}.cez`,
      };
    };

    // Simulate network reconnect and drain pass
    const drainResult = await drainUploadQueue('patient-test-2', fakeToken, {
      isOnline: async () => true,
      uploadFn: mockUpload,
      db,
    });

    expect(drainResult.drained).toBe(1);
    expect(drainResult.failed).toBe(0);
    expect(drainResult.pending).toBe(0);

    // Verify record transitioned to synced
    const [updatedRecord] = db
      .select()
      .from(localHealthRecords)
      .where(eq(localHealthRecords.id, recordId))
      .all();

    expect(updatedRecord.syncStatus).toBe('synced');
    expect(updatedRecord.serverId).toBe(`server-id-${recordId}`);
    expect(updatedRecord.storageKey).toBe(`patients/patient-test-2/records/${recordId}.cez`);
    expect(updatedRecord.isCached).toBe(true);
    expect(updatedRecord.syncedAt).toBeDefined();

    // Verify uploadQueue job transitioned to completed
    const [completedJob] = db
      .select()
      .from(uploadQueue)
      .where(eq(uploadQueue.recordId, recordId))
      .all();

    expect(completedJob.status).toBe('completed');
  });

  test('transitions to failed and records error message on transmission failure, then recovers with retry', async () => {
    const recordId = await enqueueOfflineRecordUpload(
      {
        patientId: 'patient-test-3',
        documentTypeId: 'imaging',
        category: 'imaging',
        title: 'Chest Radiograph',
        fileName: 'chest_film.png',
        mimeType: 'image/png',
        sizeBytes: 120000,
        localUri: '/sandbox/records/patient-test-3/chest_film.png',
      },
      undefined,
      { isOnline: async () => false, db }
    );

    // Drain pass 1: fails
    const failingUpload = async () => {
      throw new Error('Connection reset by peer');
    };

    const firstDrain = await drainUploadQueue('patient-test-3', fakeToken, {
      isOnline: async () => true,
      uploadFn: failingUpload,
      db,
    });

    expect(firstDrain.failed).toBe(1);

    const [failedRecord] = db
      .select()
      .from(localHealthRecords)
      .where(eq(localHealthRecords.id, recordId))
      .all();

    expect(failedRecord.syncStatus).toBe('failed');
    expect(failedRecord.lastSyncError).toBe('Connection reset by peer');
    expect(failedRecord.retryCount).toBe(1);

    // Drain pass 2: user taps "Retry Now" via resetAndRetryFailedUploads
    const successUpload = async (job: UploadQueueItem) => ({
      id: `recovered-srv-${job.recordId}`,
      storageKey: `recovered-key-${job.recordId}`,
    });

    const retryResult = await resetAndRetryFailedUploads('patient-test-3', fakeToken, {
      isOnline: async () => true,
      uploadFn: successUpload,
      db,
    });

    expect(retryResult.drained).toBe(1);

    const [recoveredRecord] = db
      .select()
      .from(localHealthRecords)
      .where(eq(localHealthRecords.id, recordId))
      .all();

    expect(recoveredRecord.syncStatus).toBe('synced');
    expect(recoveredRecord.serverId).toBe(`recovered-srv-${recordId}`);
    expect(recoveredRecord.lastSyncError).toBeNull();
  });
});
