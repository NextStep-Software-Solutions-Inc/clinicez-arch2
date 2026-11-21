import { describe, expect, test, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq, and } from 'drizzle-orm';
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

describe('CHALLENGER: Adversarial Stress Tests for uploadQueueService', () => {
  let db: ReturnType<typeof createTestDb>['db'];

  beforeEach(() => {
    db = createTestDb().db;
  });

  test('STRESS: Burst enqueue with auto-drain triggers concurrent drains', async () => {
    let peakConcurrency = 0;
    let activeInFlight = 0;
    const uploadCounts = new Map<string, number>();

    const uploadFn = async (job: UploadQueueItem) => {
      activeInFlight++;
      peakConcurrency = Math.max(peakConcurrency, activeInFlight);
      uploadCounts.set(job.recordId, (uploadCounts.get(job.recordId) ?? 0) + 1);
      // Simulate realistic network delay (50ms)
      await new Promise((r) => setTimeout(r, 50));
      activeInFlight--;
      return { id: `srv-${job.recordId}`, storageKey: `records/${job.fileName}` };
    };

    // Burst enqueue 10 records simultaneously with auto-drain enabled
    const enqueues = Array.from({ length: 10 }, (_, i) =>
      enqueueOfflineRecordUpload(
        {
          patientId: 'patient-burst',
          documentTypeId: `dt-${i}`,
          title: `Burst Item ${i}`,
          fileName: `file-${i}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 1000 + i,
          localUri: `/local/file-${i}.pdf`,
        },
        fakeToken,
        {
          isOnline: async () => true,
          db,
        }
      )
    );

    await Promise.all(enqueues);

    // Give time for any background drains to complete
    await new Promise((r) => setTimeout(r, 600));

    console.log(`Peak concurrency during burst enqueue: ${peakConcurrency}`);
    console.log(`Upload counts per record:`, Array.from(uploadCounts.entries()));
  });

  test('STRESS: Overlapping drainUploadQueue calls breach concurrency ceiling of 2 and duplicate uploads', async () => {
    let peakConcurrency = 0;
    let activeInFlight = 0;
    const uploadCounts = new Map<string, number>();

    // Enqueue 6 items
    for (let i = 0; i < 6; i++) {
      await enqueueOfflineRecordUpload(
        {
          patientId: 'patient-overlap',
          documentTypeId: `dt-${i}`,
          title: `Overlap Item ${i}`,
          fileName: `file-${i}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 1000 + i,
          localUri: `/local/file-${i}.pdf`,
        },
        undefined,
        { isOnline: async () => false, db }
      );
    }

    const uploadFn = async (job: UploadQueueItem) => {
      activeInFlight++;
      peakConcurrency = Math.max(peakConcurrency, activeInFlight);
      uploadCounts.set(job.recordId, (uploadCounts.get(job.recordId) ?? 0) + 1);
      // Realistic upload duration: 80ms
      await new Promise((r) => setTimeout(r, 80));
      activeInFlight--;
      return { id: `srv-${job.recordId}`, storageKey: `records/${job.fileName}` };
    };

    // Start Drain 1
    const drain1Promise = drainUploadQueue('patient-overlap', fakeToken, {
      isOnline: async () => true,
      uploadFn,
      db,
    });

    // 20ms later, while Drain 1 is busy uploading items 0 and 1, start Drain 2
    await new Promise((r) => setTimeout(r, 20));
    const drain2Promise = drainUploadQueue('patient-overlap', fakeToken, {
      isOnline: async () => true,
      uploadFn,
      db,
    });

    await Promise.all([drain1Promise, drain2Promise]);

    console.log(`Overlapping drains peak concurrency: ${peakConcurrency}`);
    const duplicates = Array.from(uploadCounts.entries()).filter(([_, count]) => count > 1);
    console.log(`Duplicate uploads count: ${duplicates.length}`, duplicates);

    // Concurrency ceiling check
    expect(peakConcurrency).toBeLessThanOrEqual(MAX_CONCURRENT_UPLOADS);
  });

  test('ORPHAN HAZARD: Items left in status "uploading" after crash/restart are never retried or drained', async () => {
    const now = new Date();
    // Simulate an item that was in-flight when app crashed or was killed 10 minutes ago
    db.insert(uploadQueue).values({
      id: 'job-crashed-in-flight',
      patientId: 'patient-crash',
      recordId: 'rec-crashed',
      fileUri: '/sandbox/crashed.pdf',
      fileName: 'crashed.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 15000,
      title: 'Crashed In Flight Record',
      documentTypeId: 'dt-1',
      status: 'uploading',
      attempts: 1,
      lastAttemptAt: new Date(Date.now() - 600000), // 10 minutes ago
      errorMessage: null,
      createdAt: new Date(Date.now() - 600000),
      updatedAt: new Date(Date.now() - 600000),
    }).run();

    let uploaded = false;
    const drain = await drainUploadQueue('patient-crash', fakeToken, {
      isOnline: async () => true,
      uploadFn: async () => {
        uploaded = true;
        return { id: 'srv-1', storageKey: 'key-1' };
      },
      db,
    });

    console.log(`Orphaned upload test result:`, drain, `uploaded:`, uploaded);

    // If drainUploadQueue ignores 'uploading' items, uploaded will be false and pending will remain 1 forever!
    const [stuckItem] = db.select().from(uploadQueue).where(eq(uploadQueue.id, 'job-crashed-in-flight')).all();
    console.log(`Stuck item status: ${stuckItem.status}, attempts: ${stuckItem.attempts}`);

    // Expectation: resilient queue should recover stuck 'uploading' items (e.g. if lastAttemptAt is stale or on restart)
    // rather than permanently orphaning them.
    expect(uploaded).toBe(true);
    expect(drain.drained).toBe(1);
  });



  test('ORACLE: Exponential backoff math verification across 0 to 10 attempts', () => {
    const expected = [
      { attempt: 0, ms: 2000, s: 2 },
      { attempt: 1, ms: 4000, s: 4 },
      { attempt: 2, ms: 8000, s: 8 },
      { attempt: 3, ms: 16000, s: 16 },
      { attempt: 4, ms: 32000, s: 32 },
      { attempt: 5, ms: 60000, s: 60 },
      { attempt: 6, ms: 60000, s: 60 },
      { attempt: 7, ms: 60000, s: 60 },
      { attempt: 8, ms: 60000, s: 60 },
      { attempt: 9, ms: 60000, s: 60 },
      { attempt: 10, ms: 60000, s: 60 },
    ];

    for (const exp of expected) {
      const calculated = calculateBackoffMs(exp.attempt);
      expect(calculated).toBe(exp.ms);
      expect(calculated / 1000).toBe(exp.s);
    }
  });

  test('ORACLE: Fatal errors 413, 415, 400 immediately abort retries', async () => {
    for (const status of [413, 415, 400]) {
      const recordId = await enqueueOfflineRecordUpload(
        {
          patientId: `patient-fatal-${status}`,
          documentTypeId: 'dt-fatal',
          title: `Fatal Error ${status}`,
          fileName: `fatal-${status}.dat`,
          mimeType: 'application/octet-stream',
          sizeBytes: 50000000,
          localUri: `/local/fatal-${status}.dat`,
        },
        undefined,
        { isOnline: async () => false, db }
      );

      let attemptsCount = 0;
      const fatalUploadFn = async () => {
        attemptsCount++;
        const err: any = new Error(`HTTP ${status} Fatal Error`);
        err.status = status;
        throw err;
      };

      // Drain 1: should fail with fatal error
      const drain1 = await drainUploadQueue(`patient-fatal-${status}`, fakeToken, {
        isOnline: async () => true,
        uploadFn: fatalUploadFn,
        db,
      });

      expect(drain1.failed).toBe(1);
      expect(attemptsCount).toBe(1);

      // Verify attempts is capped at MAX_RETRY_ATTEMPTS (5) in database
      const [item] = db.select().from(uploadQueue).where(eq(uploadQueue.recordId, recordId)).all();
      expect(item.status).toBe('failed');
      expect(item.attempts).toBe(5);

      // Drain 2 (subsequent drain): MUST NOT retry this item
      const drain2 = await drainUploadQueue(`patient-fatal-${status}`, fakeToken, {
        isOnline: async () => true,
        uploadFn: fatalUploadFn,
        db,
      });

      // Should be 0 attempts made
      expect(attemptsCount).toBe(1);
      expect(drain2.drained).toBe(0);
      expect(drain2.failed).toBe(0);
      expect(drain2.pending).toBe(1);
    }
  });

  test('ORACLE: Non-fatal 500/503 errors retry up to 5 times and respect backoff', async () => {
    const recordId = await enqueueOfflineRecordUpload(
      {
        patientId: 'patient-nonfatal',
        documentTypeId: 'dt-server-err',
        title: 'Server Error Record',
        fileName: 'retry.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        localUri: '/local/retry.pdf',
      },
      undefined,
      { isOnline: async () => false, db }
    );

    let attemptsCount = 0;
    const transientUploadFn = async () => {
      attemptsCount++;
      const err: any = new Error('HTTP 503 Service Unavailable');
      err.status = 503;
      throw err;
    };

    // Attempt 1
    const d1 = await drainUploadQueue('patient-nonfatal', fakeToken, {
      isOnline: async () => true,
      uploadFn: transientUploadFn,
      db,
    });
    expect(d1.failed).toBe(1);
    expect(attemptsCount).toBe(1);

    let [item] = db.select().from(uploadQueue).where(eq(uploadQueue.recordId, recordId)).all();
    expect(item.attempts).toBe(1);

    // Attempt 2 immediately: skipped due to 4s backoff window
    const d2 = await drainUploadQueue('patient-nonfatal', fakeToken, {
      isOnline: async () => true,
      uploadFn: transientUploadFn,
      db,
    });
    expect(attemptsCount).toBe(1); // not called!
    expect(d2.drained).toBe(0);

    // Attempt 2 with forceRetry: proceeds
    const d3 = await drainUploadQueue('patient-nonfatal', fakeToken, {
      isOnline: async () => true,
      forceRetry: true,
      uploadFn: transientUploadFn,
      db,
    });
    expect(attemptsCount).toBe(2);
    expect(d3.failed).toBe(1);

    [item] = db.select().from(uploadQueue).where(eq(uploadQueue.recordId, recordId)).all();
    expect(item.attempts).toBe(2);

    // Force retry attempts 3, 4, 5
    for (let expectedAttempts = 3; expectedAttempts <= 5; expectedAttempts++) {
      await drainUploadQueue('patient-nonfatal', fakeToken, {
        isOnline: async () => true,
        forceRetry: true,
        uploadFn: transientUploadFn,
        db,
      });
      [item] = db.select().from(uploadQueue).where(eq(uploadQueue.recordId, recordId)).all();
      expect(item.attempts).toBe(expectedAttempts);
    }

    expect(attemptsCount).toBe(5);

    // Attempt 6 (without forceRetry): should be rejected because attempts >= 5
    const dFinal = await drainUploadQueue('patient-nonfatal', fakeToken, {
      isOnline: async () => true,
      uploadFn: transientUploadFn,
      db,
    });
    expect(attemptsCount).toBe(5); // Not incremented!
    expect(dFinal.drained).toBe(0);
    expect(dFinal.failed).toBe(0);
  });

  test('ORACLE: Network disconnection during offline, then graceful recovery on reconnect', async () => {
    // 1. Enqueue while offline
    let networkOnline = false;
    const recordId = await enqueueOfflineRecordUpload(
      {
        patientId: 'patient-reconnect',
        documentTypeId: 'dt-rec',
        title: 'Offline Enqueued Item',
        fileName: 'offline.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        localUri: '/local/offline.pdf',
      },
      fakeToken,
      { isOnline: async () => networkOnline, db }
    );

    // 2. Attempt drain while offline -> should report isOffline: true, pending: 1
    const offlineDrain = await drainUploadQueue('patient-reconnect', fakeToken, {
      isOnline: async () => networkOnline,
      db,
    });
    expect(offlineDrain.isOffline).toBe(true);
    expect(offlineDrain.drained).toBe(0);
    expect(offlineDrain.pending).toBe(1);

    // 3. Network reconnects
    networkOnline = true;
    let uploaded = false;
    const reconnectDrain = await drainUploadQueue('patient-reconnect', fakeToken, {
      isOnline: async () => networkOnline,
      uploadFn: async (job) => {
        uploaded = true;
        return { id: 'srv-reconnect', storageKey: 'keys/reconnect.pdf' };
      },
      db,
    });

    expect(uploaded).toBe(true);
    expect(reconnectDrain.drained).toBe(1);
    expect(reconnectDrain.pending).toBe(0);

    const [record] = db.select().from(localHealthRecords).where(eq(localHealthRecords.id, recordId)).all();
    expect(record.syncStatus).toBe('synced');
    expect(record.serverId).toBe('srv-reconnect');
  });
});
