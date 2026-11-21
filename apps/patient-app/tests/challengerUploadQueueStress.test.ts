import { describe, expect, test, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq, and } from 'drizzle-orm';
import {
  calculateBackoffMs,
  drainUploadQueue,
  enqueueOfflineRecordUpload,
  getPendingUploadCount,
  recoverStuckUploads,
  resetAndRetryFailedUploads,
  MAX_CONCURRENT_UPLOADS,
  MAX_RETRY_ATTEMPTS,
} from '../services/sync/uploadQueueService';
import { deleteHealthRecord } from '../services/files/recordDeletionService';
import { uploadQueue, type UploadQueueItem } from '../db/schema/uploadQueue';
import { localHealthRecords } from '../db/schema/localHealthRecords';
import { filesMetadata } from '../db/schema/filesMetadata';
import { blobStorage } from '../services/storage';

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

const fakeToken = async () => 'bearer-stress-token';

describe('CHALLENGER EMPIRICAL VERIFICATION SUITE: uploadQueue Resilience', () => {
  let db: ReturnType<typeof createTestDb>['db'];

  beforeEach(async () => {
    db = createTestDb().db;
    await blobStorage.clearCache();
  });

  // --------------------------------------------------------------------------
  // 1. Burst Enqueue Auto-Drain with Active Mock
  // --------------------------------------------------------------------------
  test('STRESS 1: Burst enqueue with auto-drain strictly observes max concurrency <= 2 and 0 duplicates', async () => {
    let peakConcurrency = 0;
    let activeInFlight = 0;
    const uploadCounts = new Map<string, number>();

    const uploadFn = async (job: UploadQueueItem) => {
      activeInFlight++;
      peakConcurrency = Math.max(peakConcurrency, activeInFlight);
      uploadCounts.set(job.recordId, (uploadCounts.get(job.recordId) ?? 0) + 1);
      // Realistic transmission delay with jitter
      await new Promise((r) => setTimeout(r, 20 + Math.floor(Math.random() * 20)));
      activeInFlight--;
      return { id: `srv-${job.recordId}`, storageKey: `patients/burst/${job.fileName}` };
    };

    const count = 8;
    const enqueues = Array.from({ length: count }, (_, i) =>
      enqueueOfflineRecordUpload(
        {
          patientId: 'patient-burst-stress',
          documentTypeId: `dt-${i}`,
          title: `Burst Stress ${i}`,
          fileName: `burst_${i}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 1024 + i,
          localUri: `/local/burst_${i}.pdf`,
        },
        fakeToken,
        {
          isOnline: async () => true,
          uploadFn,
          db,
        } as any
      )
    );

    const recordIds = await Promise.all(enqueues);

    // Wait for promise tail coordinator to drain all enqueued items
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const pending = await getPendingUploadCount('patient-burst-stress', db);
      if (pending === 0 && uploadCounts.size === count) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(peakConcurrency).toBeGreaterThan(0);
    expect(peakConcurrency).toBeLessThanOrEqual(MAX_CONCURRENT_UPLOADS);

    // Every item uploaded exactly once
    expect(uploadCounts.size).toBe(count);
    for (const rid of recordIds) {
      expect(uploadCounts.get(rid)).toBe(1);
    }

    // All records marked completed/synced
    const queueRows = db.select().from(uploadQueue).where(eq(uploadQueue.patientId, 'patient-burst-stress')).all();
    expect(queueRows.every((r) => r.status === 'completed')).toBe(true);

    const recordRows = db.select().from(localHealthRecords).where(eq(localHealthRecords.patientId, 'patient-burst-stress')).all();
    expect(recordRows.every((r) => r.syncStatus === 'synced')).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 2. Extreme Overlapping Drains (20 Concurrent Calls)
  // --------------------------------------------------------------------------
  test('STRESS 2: 20 overlapping drainUploadQueue calls never breach ceiling 2 and cause 0 duplicate uploads', async () => {
    let peakConcurrency = 0;
    let activeInFlight = 0;
    const uploadCounts = new Map<string, number>();

    const totalItems = 10;
    const patientId = 'patient-extreme-overlap';

    // Seed 10 items in queue
    for (let i = 0; i < totalItems; i++) {
      await enqueueOfflineRecordUpload(
        {
          patientId,
          documentTypeId: `dt-${i}`,
          title: `Item ${i}`,
          fileName: `file_${i}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 5000 + i,
          localUri: `/local/file_${i}.pdf`,
        },
        undefined, // Do not auto-drain yet
        { isOnline: async () => false, db }
      );
    }

    const uploadFn = async (job: UploadQueueItem) => {
      activeInFlight++;
      peakConcurrency = Math.max(peakConcurrency, activeInFlight);
      uploadCounts.set(job.recordId, (uploadCounts.get(job.recordId) ?? 0) + 1);
      // Realistic variable latency
      await new Promise((r) => setTimeout(r, 25 + Math.floor(Math.random() * 25)));
      activeInFlight--;
      return { id: `srv-${job.recordId}`, storageKey: `records/${job.fileName}` };
    };

    // Spawn 20 overlapping drain calls staggered by 5ms
    const drainPromises: Promise<any>[] = [];
    for (let i = 0; i < 20; i++) {
      drainPromises.push(
        (async () => {
          await new Promise((r) => setTimeout(r, i * 5));
          return drainUploadQueue(patientId, fakeToken, {
            isOnline: async () => true,
            uploadFn,
            db,
          });
        })()
      );
    }

    const results = await Promise.all(drainPromises);

    expect(peakConcurrency).toBeLessThanOrEqual(MAX_CONCURRENT_UPLOADS);

    // Sum of drained across calls should equal total items
    const totalDrained = results.reduce((acc, r) => acc + r.drained, 0);
    expect(totalDrained).toBe(totalItems);

    // Zero duplicate uploads
    const duplicates = Array.from(uploadCounts.entries()).filter(([_, count]) => count > 1);
    expect(duplicates.length).toBe(0);
    expect(uploadCounts.size).toBe(totalItems);

    // Pending count must be 0
    const pending = await getPendingUploadCount(patientId, db);
    expect(pending).toBe(0);
  });

  // --------------------------------------------------------------------------
  // 3. Multi-Patient Concurrency Isolation
  // --------------------------------------------------------------------------
  test('STRESS 3: Multi-patient concurrent drains do not block each other and maintain per-patient limit of 2', async () => {
    const patientA = 'patient-multi-A';
    const patientB = 'patient-multi-B';

    let activeA = 0;
    let activeB = 0;
    let peakA = 0;
    let peakB = 0;

    for (let i = 0; i < 4; i++) {
      await enqueueOfflineRecordUpload(
        { patientId: patientA, documentTypeId: 'dt-1', title: `A-${i}`, fileName: `a_${i}.pdf`, mimeType: 'application/pdf', sizeBytes: 1000 },
        undefined,
        { isOnline: async () => false, db }
      );
      await enqueueOfflineRecordUpload(
        { patientId: patientB, documentTypeId: 'dt-1', title: `B-${i}`, fileName: `b_${i}.pdf`, mimeType: 'application/pdf', sizeBytes: 1000 },
        undefined,
        { isOnline: async () => false, db }
      );
    }

    const uploadFnA = async (job: UploadQueueItem) => {
      activeA++;
      peakA = Math.max(peakA, activeA);
      await new Promise((r) => setTimeout(r, 40));
      activeA--;
      return { id: `srv-${job.recordId}`, storageKey: `records/${job.fileName}` };
    };

    const uploadFnB = async (job: UploadQueueItem) => {
      activeB++;
      peakB = Math.max(peakB, activeB);
      await new Promise((r) => setTimeout(r, 40));
      activeB--;
      return { id: `srv-${job.recordId}`, storageKey: `records/${job.fileName}` };
    };

    const [drainResA, drainResB] = await Promise.all([
      drainUploadQueue(patientA, fakeToken, { isOnline: async () => true, uploadFn: uploadFnA, db }),
      drainUploadQueue(patientB, fakeToken, { isOnline: async () => true, uploadFn: uploadFnB, db }),
    ]);

    expect(drainResA.drained).toBe(4);
    expect(drainResB.drained).toBe(4);
    expect(peakA).toBeLessThanOrEqual(MAX_CONCURRENT_UPLOADS);
    expect(peakB).toBeLessThanOrEqual(MAX_CONCURRENT_UPLOADS);
  });

  // --------------------------------------------------------------------------
  // 4. Crash Recovery Stress: Multiple Orphaned 'uploading' Rows
  // --------------------------------------------------------------------------
  test('CRASH RECOVERY: Multiple orphaned "uploading" items from killed app are safely recovered and completed', async () => {
    const patientId = 'patient-crashed-multi';
    const now = new Date();
    const staleTimes = [
      new Date(Date.now() - 3600000), // 1 hour ago
      new Date(Date.now() - 1800000), // 30 min ago
      new Date(Date.now() - 600000),  // 10 min ago
    ];

    for (let i = 0; i < 3; i++) {
      db.insert(localHealthRecords).values({
        id: `rec-crashed-${i}`,
        patientId,
        category: 'other',
        documentTypeId: 'dt-1',
        title: `Crashed Doc ${i}`,
        fileName: `crash_${i}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        syncStatus: 'uploading' as any,
        createdAt: staleTimes[i],
        updatedAt: staleTimes[i],
      }).run();

      db.insert(uploadQueue).values({
        id: `job-crashed-${i}`,
        patientId,
        recordId: `rec-crashed-${i}`,
        fileUri: `/sandbox/crash_${i}.pdf`,
        fileName: `crash_${i}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        title: `Crashed Doc ${i}`,
        documentTypeId: 'dt-1',
        status: 'uploading',
        attempts: 1,
        lastAttemptAt: staleTimes[i],
        createdAt: staleTimes[i],
        updatedAt: staleTimes[i],
      }).run();
    }

    // Direct test of recoverStuckUploads
    const recoveredCount = await recoverStuckUploads(patientId, { db });
    expect(recoveredCount).toBe(3);

    // Verify status transitioned to 'queued' in both tables
    const queueAfterRecovery = db.select().from(uploadQueue).where(eq(uploadQueue.patientId, patientId)).all();
    expect(queueAfterRecovery.every((q) => q.status === 'queued')).toBe(true);

    const recordsAfterRecovery = db.select().from(localHealthRecords).where(eq(localHealthRecords.patientId, patientId)).all();
    expect(recordsAfterRecovery.every((r) => r.syncStatus === 'queued')).toBe(true);

    // Now execute drain
    const drainResult = await drainUploadQueue(patientId, fakeToken, {
      isOnline: async () => true,
      uploadFn: async (job) => ({ id: `srv-${job.recordId}`, storageKey: `records/${job.fileName}` }),
      db,
    });

    expect(drainResult.drained).toBe(3);
    expect(drainResult.failed).toBe(0);
    expect(drainResult.pending).toBe(0);

    const queueFinal = db.select().from(uploadQueue).where(eq(uploadQueue.patientId, patientId)).all();
    expect(queueFinal.every((q) => q.status === 'completed')).toBe(true);

    const recordsFinal = db.select().from(localHealthRecords).where(eq(localHealthRecords.patientId, patientId)).all();
    expect(recordsFinal.every((r) => r.syncStatus === 'synced')).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 5. State Synchronization Deep Check (resetAndRetryFailedUploads)
  // --------------------------------------------------------------------------
  test('STATE SYNC: resetAndRetryFailedUploads cleans failed state across both uploadQueue and localHealthRecords', async () => {
    const patientId = 'patient-reset-sync';
    const now = new Date();

    for (let i = 1; i <= 3; i++) {
      db.insert(localHealthRecords).values({
        id: `rec-fail-${i}`,
        patientId,
        category: 'other',
        documentTypeId: 'dt-1',
        title: `Failed File ${i}`,
        fileName: `fail_${i}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        syncStatus: 'failed',
        retryCount: 4,
        lastSyncError: 'Simulated 500 error',
        createdAt: now,
        updatedAt: now,
      }).run();

      db.insert(uploadQueue).values({
        id: `job-fail-${i}`,
        patientId,
        recordId: `rec-fail-${i}`,
        fileUri: `/sandbox/fail_${i}.pdf`,
        fileName: `fail_${i}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        title: `Failed File ${i}`,
        documentTypeId: 'dt-1',
        status: 'failed',
        attempts: 4,
        errorMessage: 'Simulated 500 error',
        fatalError: 0,
        createdAt: now,
        updatedAt: now,
      }).run();
    }

    const resetResult = await resetAndRetryFailedUploads(patientId, fakeToken, {
      isOnline: async () => true,
      uploadFn: async (job) => ({ id: `srv-recovered-${job.recordId}`, storageKey: `recovered/${job.fileName}` }),
      db,
    });

    expect(resetResult.drained).toBe(3);
    expect(resetResult.failed).toBe(0);

    const queueRows = db.select().from(uploadQueue).where(eq(uploadQueue.patientId, patientId)).all();
    expect(queueRows.every((q) => q.status === 'completed')).toBe(true);
    expect(queueRows.every((q) => q.errorMessage === null)).toBe(true);

    const localRows = db.select().from(localHealthRecords).where(eq(localHealthRecords.patientId, patientId)).all();
    expect(localRows.every((r) => r.syncStatus === 'synced')).toBe(true);
    expect(localRows.every((r) => r.lastSyncError === null)).toBe(true);
    expect(localRows.every((r) => r.retryCount === 0)).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 6. Exponential Backoff Formula Bound Testing
  // --------------------------------------------------------------------------
  test('ORACLE: Exponential backoff handles large attempt numbers safely without NaN/Infinity', () => {
    // 0 to 4 double correctly
    expect(calculateBackoffMs(0)).toBe(2000);
    expect(calculateBackoffMs(1)).toBe(4000);
    expect(calculateBackoffMs(2)).toBe(8000);
    expect(calculateBackoffMs(3)).toBe(16000);
    expect(calculateBackoffMs(4)).toBe(32000);

    // 5+ are capped at 60,000ms
    for (let attempts = 5; attempts <= 50; attempts += 5) {
      const ms = calculateBackoffMs(attempts);
      expect(ms).toBe(60000);
      expect(Number.isFinite(ms)).toBe(true);
      expect(ms).not.toBeNaN();
    }
  });

  // --------------------------------------------------------------------------
  // 7. Zombie Upload Avoidance on Record Deletion
  // --------------------------------------------------------------------------
  test('ZOMBIE RESILIENCE: Deleting record removes queue row and drain safely ignores it', async () => {
    const patientId = 'patient-zombie-test';
    const bytes = new TextEncoder().encode('Zombie test content');

    const recordId = await enqueueOfflineRecordUpload(
      {
        patientId,
        documentTypeId: 'dt-1',
        title: 'Pending Deletion',
        fileName: 'zombie.pdf',
        mimeType: 'application/pdf',
        sizeBytes: bytes.byteLength,
        fileBlob: bytes,
      },
      fakeToken,
      { isOnline: async () => false, db }
    );

    // Confirm it exists in queue
    expect(db.select().from(uploadQueue).where(eq(uploadQueue.recordId, recordId)).all().length).toBe(1);

    // Delete record locally
    await deleteHealthRecord({
      patientId,
      fileId: recordId,
      getToken: fakeToken,
      isOnline: async () => false,
      db,
    });

    // Queue row must be gone
    expect(db.select().from(uploadQueue).where(eq(uploadQueue.recordId, recordId)).all().length).toBe(0);

    // Drain runs without uploading phantom item
    let uploadInvoked = false;
    const drainResult = await drainUploadQueue(patientId, fakeToken, {
      isOnline: async () => true,
      uploadFn: async () => {
        uploadInvoked = true;
        return { id: 'ghost', storageKey: 'ghost' };
      },
      db,
    });

    expect(uploadInvoked).toBe(false);
    expect(drainResult.drained).toBe(0);
    expect(drainResult.pending).toBe(0);
  });
});
