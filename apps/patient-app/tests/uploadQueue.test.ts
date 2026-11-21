import { describe, expect, test, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';
import {
  calculateBackoffMs,
  drainUploadQueue,
  enqueueOfflineRecordUpload,
  getPendingUploadCount,
  resetAndRetryFailedUploads,
  MAX_CONCURRENT_UPLOADS,
  MAX_RETRY_ATTEMPTS,
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

describe('uploadQueueService (Offline-First Queue & Sync Engine)', () => {
  let db: ReturnType<typeof createTestDb>['db'];

  beforeEach(() => {
    db = createTestDb().db;
  });

  describe('exponential backoff calculations', () => {
    test('calculates correct backoff progression: 2s, 4s, 8s, 16s, 32s, 60s cap', () => {
      expect(calculateBackoffMs(0)).toBe(2000);   // 2s * 2^0 = 2000
      expect(calculateBackoffMs(1)).toBe(4000);   // 2s * 2^1 = 4000
      expect(calculateBackoffMs(2)).toBe(8000);   // 2s * 2^2 = 8000
      expect(calculateBackoffMs(3)).toBe(16000);  // 2s * 2^3 = 16000
      expect(calculateBackoffMs(4)).toBe(32000);  // 2s * 2^4 = 32000
      expect(calculateBackoffMs(5)).toBe(60000);  // min(60000, 64000) = 60000
      expect(calculateBackoffMs(6)).toBe(60000);  // min(60000, 128000) = 60000
    });
  });

  describe('offline enqueue & network gating', () => {
    test('enqueues record offline for immediate preview with queued status', async () => {
      const recordId = await enqueueOfflineRecordUpload(
        {
          patientId: 'patient-1',
          documentTypeId: 'dt-blood',
          title: 'Routine Blood Panel',
          fileName: 'blood.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 10240,
          localUri: '/mock/local/blood.pdf',
        },
        fakeToken,
        { isOnline: async () => false, db }
      );

      expect(recordId).toBeDefined();

      const [record] = db.select().from(localHealthRecords).where(eq(localHealthRecords.id, recordId)).all();
      expect(record).toBeDefined();
      expect(record.syncStatus).toBe('queued');
      expect(record.isCached).toBe(true);

      const [queueItem] = db.select().from(uploadQueue).where(eq(uploadQueue.recordId, recordId)).all();
      expect(queueItem).toBeDefined();
      expect(queueItem.status).toBe('queued');
      expect(queueItem.attempts).toBe(0);
    });

    test('skips draining queue and reports isOffline when network is disconnected', async () => {
      await enqueueOfflineRecordUpload(
        {
          patientId: 'patient-1',
          documentTypeId: 'dt-rx',
          title: 'Prescription Note',
          fileName: 'rx.png',
          mimeType: 'image/png',
          sizeBytes: 5000,
          localUri: '/mock/local/rx.png',
        },
        fakeToken,
        { isOnline: async () => false, db }
      );

      const result = await drainUploadQueue('patient-1', fakeToken, {
        isOnline: async () => false,
        db,
      });

      expect(result.isOffline).toBe(true);
      expect(result.drained).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.pending).toBe(1);
    });
  });

  describe('concurrency limit 2', () => {
    test('enforces max concurrent upload limit of 2 across parallel jobs', async () => {
      // Enqueue 4 items
      for (let i = 1; i <= 4; i++) {
        await enqueueOfflineRecordUpload(
          {
            patientId: 'patient-1',
            documentTypeId: `dt-${i}`,
            title: `Batch File ${i}`,
            fileName: `file${i}.pdf`,
            mimeType: 'application/pdf',
            sizeBytes: 1000 * i,
            localUri: `/mock/local/file${i}.pdf`,
          },
          undefined, // Do not auto-drain on enqueue
          { isOnline: async () => false, db }
        );
      }

      let activeInFlight = 0;
      let peakConcurrency = 0;

      const mockUpload = async (job: UploadQueueItem) => {
        activeInFlight++;
        peakConcurrency = Math.max(peakConcurrency, activeInFlight);
        // Simulate asynchronous network transmission
        await new Promise((r) => setTimeout(r, 25));
        activeInFlight--;
        return {
          id: `srv-${job.recordId}`,
          storageKey: `patients/patient-1/records/${job.fileName}`,
        };
      };

      const result = await drainUploadQueue('patient-1', fakeToken, {
        isOnline: async () => true,
        uploadFn: mockUpload,
        db,
      });

      expect(result.drained).toBe(4);
      expect(result.failed).toBe(0);
      expect(result.pending).toBe(0);
      expect(peakConcurrency).toBeLessThanOrEqual(MAX_CONCURRENT_UPLOADS);
      expect(peakConcurrency).toBe(2);

      // Verify all items are completed
      const remainingQueued = await getPendingUploadCount('patient-1', db);
      expect(remainingQueued).toBe(0);
    });
  });

  describe('exponential backoff skip & force retry', () => {
    test('skips item if time elapsed since last attempt is less than backoff window', async () => {
      await enqueueOfflineRecordUpload(
        {
          patientId: 'patient-1',
          documentTypeId: 'dt-1',
          title: 'Lab Report',
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 15000,
          localUri: '/mock/local/report.pdf',
        },
        undefined,
        { isOnline: async () => false, db }
      );

      // Attempt 1: fails with transient network error
      const failingUpload = async () => {
        throw new Error('500 Internal Server Error');
      };

      const firstDrain = await drainUploadQueue('patient-1', fakeToken, {
        isOnline: async () => true,
        uploadFn: failingUpload,
        db,
      });

      expect(firstDrain.failed).toBe(1);

      const [failedItem] = db.select().from(uploadQueue).all();
      expect(failedItem.status).toBe('failed');
      expect(failedItem.attempts).toBe(1);

      // Attempt 2 immediately after: should be SKIPPED due to 4s backoff window
      let callCount = 0;
      const secondDrain = await drainUploadQueue('patient-1', fakeToken, {
        isOnline: async () => true,
        uploadFn: async () => {
          callCount++;
          return { id: 'srv-1', storageKey: 'key-1' };
        },
        db,
      });

      // Skipped: uploadFn should never have been invoked
      expect(callCount).toBe(0);
      expect(secondDrain.drained).toBe(0);
      expect(secondDrain.failed).toBe(0);
      expect(secondDrain.pending).toBe(1);

      // Attempt 3 with forceRetry: true bypasses the backoff window
      const forcedDrain = await drainUploadQueue('patient-1', fakeToken, {
        isOnline: async () => true,
        forceRetry: true,
        uploadFn: async () => {
          callCount++;
          return { id: 'srv-1', storageKey: 'key-1' };
        },
        db,
      });

      expect(callCount).toBe(1);
      expect(forcedDrain.drained).toBe(1);
    });
  });

  describe('retry limits & fatal error classification', () => {
    test('abandons item once MAX_RETRY_ATTEMPTS (5) is reached', async () => {
      const now = new Date();
      db.insert(uploadQueue).values({
        id: 'job-max-retries',
        patientId: 'patient-1',
        recordId: 'rec-abandon',
        fileUri: '/mock/file.pdf',
        fileName: 'abandon.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        title: 'Abandoned Upload',
        documentTypeId: 'dt-1',
        status: 'failed',
        attempts: 5,
        lastAttemptAt: new Date(Date.now() - 120000), // 2 minutes ago
        errorMessage: 'Persistent failure',
        createdAt: now,
        updatedAt: now,
      }).run();

      let uploadCalled = false;
      const drain = await drainUploadQueue('patient-1', fakeToken, {
        isOnline: async () => true,
        uploadFn: async () => {
          uploadCalled = true;
          return { id: 'srv-1', storageKey: 'key-1' };
        },
        db,
      });

      expect(uploadCalled).toBe(false);
      expect(drain.drained).toBe(0);

      // resetAndRetryFailedUploads resets attempts and retries
      const resetDrain = await resetAndRetryFailedUploads('patient-1', fakeToken, {
        isOnline: async () => true,
        uploadFn: async () => ({ id: 'srv-reset', storageKey: 'key-reset' }),
        db,
      });

      expect(resetDrain.drained).toBe(1);
      const [item] = db.select().from(uploadQueue).where(eq(uploadQueue.id, 'job-max-retries')).all();
      expect(item.status).toBe('completed');
    });

    test('classifies HTTP 413 and 415 as fatal errors and immediately caps retries at 5', async () => {
      await enqueueOfflineRecordUpload(
        {
          patientId: 'patient-1',
          documentTypeId: 'dt-large',
          title: 'Gigantic Scan',
          fileName: 'large.zip',
          mimeType: 'application/zip',
          sizeBytes: 999999999,
          localUri: '/mock/local/large.zip',
        },
        undefined,
        { isOnline: async () => false, db }
      );

      const fatalUpload = async () => {
        const error: any = new Error('Payload Too Large');
        error.status = 413;
        throw error;
      };

      const result = await drainUploadQueue('patient-1', fakeToken, {
        isOnline: async () => true,
        uploadFn: fatalUpload,
        db,
      });

      expect(result.failed).toBe(1);

      const [item] = db.select().from(uploadQueue).all();
      expect(item.status).toBe('failed');
      expect(item.attempts).toBe(MAX_RETRY_ATTEMPTS); // Capped directly at 5
      expect(item.errorMessage).toBe('Payload Too Large');
    });
  });
});
