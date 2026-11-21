import { describe, expect, test, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq, and } from 'drizzle-orm';
import {
  getUncachedDocumentTargets,
  preCacheUncachedDocuments,
  type PreCacheTarget,
} from '../services/sync/preCachingService';
import { deleteHealthRecord } from '../services/files/recordDeletionService';
import { localHealthRecords } from '../db/schema/localHealthRecords';
import { inboxLabResults } from '../db/schema/inboxLabResults';
import { filesMetadata } from '../db/schema/filesMetadata';
import { syncQueue } from '../db/schema/syncQueue';
import { uploadQueue } from '../db/schema/uploadQueue';
import { blobStorage } from '../services/storage';
import {
  enqueueOfflineRecordUpload,
  drainUploadQueue,
  recoverStuckUploads,
  resetAndRetryFailedUploads,
} from '../services/sync/uploadQueueService';

function createTestDb() {
  const sqlite = new Database(':memory:');

  sqlite.run(`
    CREATE TABLE inbox_lab_results (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      requisition_id TEXT,
      laboratory_name TEXT NOT NULL DEFAULT 'ClinicEZ Diagnostics',
      title TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'ClinicLab',
      verification TEXT NOT NULL DEFAULT 'Verified',
      reviewed_by_name TEXT,
      reviewed_at INTEGER,
      remarks TEXT,
      impression TEXT,
      is_critical INTEGER NOT NULL DEFAULT 0,
      resulted_at INTEGER NOT NULL,
      file_url TEXT,
      local_path TEXT,
      is_cached INTEGER NOT NULL DEFAULT 0,
      observations_json TEXT NOT NULL DEFAULT '[]',
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

  sqlite.run(`
    CREATE TABLE sync_queue (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
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

  return { sqlite, db: drizzle(sqlite) };
}

const fakeToken = async () => 'deep-stress-test-token';

describe('EMPIRICAL CHALLENGER: Deep Adversarial Stress Suite', () => {
  let db: ReturnType<typeof createTestDb>['db'];

  beforeEach(async () => {
    db = createTestDb().db;
    await blobStorage.clearCache();
  });

  // -------------------------------------------------------------------------
  // 1. Zombie Upload Elimination under Multi-Stage Failure & Crashes
  // -------------------------------------------------------------------------
  test('ADVERSARIAL STRESS 1: Multi-stage crash, failure, and retry states do not leak zombie uploads on deletion', async () => {
    const patientId = 'patient-zombie-deep';
    const uploadedRecordIds: string[] = [];

    const mockUpload = async (item: any) => {
      uploadedRecordIds.push(item.recordId);
      return { id: `srv-${item.recordId}`, storageKey: `storage-${item.recordId}.cez` };
    };

    // Item 1: Plain queued item
    const rec1Id = await enqueueOfflineRecordUpload(
      {
        patientId,
        documentTypeId: 'dt-1',
        title: 'Rec 1',
        fileName: 'r1.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        fileBlob: new Uint8Array([1, 2, 3]),
      },
      fakeToken,
      { isOnline: async () => false, db }
    );

    // Item 2: Item that failed max retries (status = 'failed', fatalError = 1)
    const rec2Id = await enqueueOfflineRecordUpload(
      {
        patientId,
        documentTypeId: 'dt-1',
        title: 'Rec 2',
        fileName: 'r2.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        fileBlob: new Uint8Array([4, 5, 6]),
      },
      fakeToken,
      { isOnline: async () => false, db }
    );
    await db
      .update(uploadQueue)
      .set({ status: 'failed', attempts: 5, fatalError: 1 })
      .where(eq(uploadQueue.recordId, rec2Id));

    // Item 3: Item stuck in 'uploading' (simulated process crash)
    const rec3Id = await enqueueOfflineRecordUpload(
      {
        patientId,
        documentTypeId: 'dt-1',
        title: 'Rec 3',
        fileName: 'r3.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        fileBlob: new Uint8Array([7, 8, 9]),
      },
      fakeToken,
      { isOnline: async () => false, db }
    );
    await db
      .update(uploadQueue)
      .set({ status: 'uploading', attempts: 1 })
      .where(eq(uploadQueue.recordId, rec3Id));

    // Item 4: Normal item that SHOULD be uploaded
    const rec4Id = await enqueueOfflineRecordUpload(
      {
        patientId,
        documentTypeId: 'dt-1',
        title: 'Rec 4 (Survivor)',
        fileName: 'r4.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        fileBlob: new Uint8Array([10, 11, 12]),
      },
      fakeToken,
      { isOnline: async () => false, db }
    );

    // Now delete items 1, 2, 3 before network is restored
    await deleteHealthRecord({ patientId, fileId: rec1Id, getToken: fakeToken, isOnline: async () => false, db });
    await deleteHealthRecord({ patientId, fileId: rec2Id, getToken: fakeToken, isOnline: async () => false, db });
    await deleteHealthRecord({ patientId, fileId: rec3Id, getToken: fakeToken, isOnline: async () => false, db });

    // Verify all 3 rows purged from uploadQueue
    const remainingQueue = db.select().from(uploadQueue).where(eq(uploadQueue.patientId, patientId)).all();
    expect(remainingQueue.length).toBe(1);
    expect(remainingQueue[0].recordId).toBe(rec4Id);

    // Call crash recovery explicitly: should not resurrect items 1, 2, 3
    const recovered = await recoverStuckUploads(patientId, { db, force: true });
    expect(recovered).toBe(0);

    // Call resetAndRetryFailedUploads explicitly: should not resurrect items 1, 2, 3
    await resetAndRetryFailedUploads(patientId, fakeToken, {
      isOnline: async () => true,
      uploadFn: mockUpload,
      db,
    });

    // Drain upload queue
    await drainUploadQueue(patientId, fakeToken, {
      isOnline: async () => true,
      uploadFn: mockUpload,
      db,
    });

    // Only rec4Id must have been uploaded!
    expect(uploadedRecordIds).toEqual([rec4Id]);
  });

  // -------------------------------------------------------------------------
  // 2. High-Concurrency Deletion Storm
  // -------------------------------------------------------------------------
  test('ADVERSARIAL STRESS 2: Parallel burst deletions correctly isolate local-only vs synced records without race conditions', async () => {
    const patientId = 'patient-burst-del';
    const totalRecords = 20; // 10 synced, 10 local-only drafts
    const now = new Date();

    const recordIds: string[] = [];

    for (let i = 1; i <= totalRecords; i++) {
      const isSynced = i % 2 === 0;
      const recId = `burst-rec-${i}`;
      recordIds.push(recId);

      const blobKey = `${patientId}/records/${recId}.pdf`;
      await blobStorage.saveBlob(blobKey, new Uint8Array([i]), 'application/pdf');

      db.insert(localHealthRecords).values({
        id: recId,
        patientId,
        category: 'other',
        documentTypeId: 'dt-1',
        title: `Burst Rec ${i}`,
        fileName: `${recId}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 100,
        localBlobPath: blobKey,
        isCached: true,
        serverId: isSynced ? `srv-${recId}` : null,
        syncStatus: isSynced ? 'synced' : 'queued',
        createdAt: now,
        updatedAt: now,
      }).run();

      db.insert(uploadQueue).values({
        id: `queue-${recId}`,
        patientId,
        recordId: recId,
        fileUri: blobKey,
        fileName: `${recId}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 100,
        title: `Burst Rec ${i}`,
        documentTypeId: 'dt-1',
        status: isSynced ? 'completed' : 'queued',
        createdAt: now,
        updatedAt: now,
      }).run();
    }

    // Execute ALL 20 deletions simultaneously in parallel while offline
    await Promise.all(
      recordIds.map((fileId) =>
        deleteHealthRecord({
          patientId,
          fileId,
          getToken: fakeToken,
          isOnline: async () => false,
          db,
        })
      )
    );

    // 1. All 20 localHealthRecords must be gone
    const remainingRecords = db.select().from(localHealthRecords).where(eq(localHealthRecords.patientId, patientId)).all();
    expect(remainingRecords.length).toBe(0);

    // 2. All 20 uploadQueue rows must be gone
    const remainingQueue = db.select().from(uploadQueue).where(eq(uploadQueue.patientId, patientId)).all();
    expect(remainingQueue.length).toBe(0);

    // 3. All 20 blobs must be purged from storage
    for (const recId of recordIds) {
      expect(await blobStorage.hasBlob(`${patientId}/records/${recId}.pdf`)).toBe(false);
    }

    // 4. Exactly 10 synced records must be queued in syncQueue with operation = 'delete'
    const syncQueueRows = db.select().from(syncQueue).all();
    expect(syncQueueRows.length).toBe(10);
    expect(syncQueueRows.every((r) => r.operation === 'delete')).toBe(true);
    expect(syncQueueRows.every((r) => r.entityType === 'file')).toBe(true);

    const queuedServerIds = syncQueueRows.map((r) => r.entityId).sort();
    const expectedServerIds = recordIds
      .filter((_, idx) => (idx + 1) % 2 === 0)
      .map((id) => `srv-${id}`)
      .sort();
    expect(queuedServerIds).toEqual(expectedServerIds);
  });

  // -------------------------------------------------------------------------
  // 3. Pre-Caching High Concurrency with Mixed Success, Failures & Aborts
  // -------------------------------------------------------------------------
  test('ADVERSARIAL STRESS 3: Heavy pre-caching under 30 items with 33% failure rate enforces <=2 concurrency and zero state corruption', async () => {
    const patientId = 'patient-precache-stress';
    const totalDocs = 30;
    const now = new Date();

    for (let i = 1; i <= totalDocs; i++) {
      db.insert(localHealthRecords).values({
        id: `pre-doc-${i}`,
        patientId,
        category: 'imaging',
        documentTypeId: 'dt-1',
        title: `Pre Doc ${i}`,
        fileName: `doc_${i}.png`,
        mimeType: 'image/png',
        sizeBytes: 150000,
        serverId: `srv-pre-${i}`,
        localBlobPath: null,
        isCached: false,
        syncStatus: 'synced',
        createdAt: now,
        updatedAt: now,
      }).run();
    }

    let activeDownloads = 0;
    let peakConcurrency = 0;
    const concurrencyHistory: number[] = [];

    // Every 3rd item fails
    const downloadHandler = async (target: PreCacheTarget) => {
      activeDownloads++;
      concurrencyHistory.push(activeDownloads);
      peakConcurrency = Math.max(peakConcurrency, activeDownloads);

      // Add small jitter
      await new Promise((r) => setTimeout(r, 10 + Math.floor(Math.random() * 15)));

      activeDownloads--;
      concurrencyHistory.push(activeDownloads);

      const num = parseInt(target.id.split('-').pop() ?? '0', 10);
      if (num % 3 === 0) {
        throw new Error(`Intentional download failure for ${target.id}`);
      }

      return `/sandbox/records/${target.id}.png`;
    };

    // First pre-cache pass
    const pass1 = await preCacheUncachedDocuments(patientId, fakeToken, {
      isOnline: async () => true,
      downloadFn: downloadHandler,
      db,
    });

    // First pre-cache pass: targets up to 20 items per batch due to .limit(20)
    expect(peakConcurrency).toBe(2);
    expect(Math.max(...concurrencyHistory)).toBe(2);
    expect(pass1.cached).toBe(14); // 20 targets fetched, 6 failed (every 3rd), 14 succeeded
    expect(pass1.failed).toBe(6);  // 6 failed

    // Verify DB state for the first 20 records
    const allRecords = db.select().from(localHealthRecords).where(eq(localHealthRecords.patientId, patientId)).all();
    for (const rec of allRecords) {
      const num = parseInt(rec.id.split('-').pop() ?? '0', 10);
      if (num <= 20) {
        if (num % 3 === 0) {
          expect(rec.isCached).toBe(false);
          expect(rec.localBlobPath).toBeNull();
        } else {
          expect(rec.isCached).toBe(true);
          expect(rec.localBlobPath).toBe(`/sandbox/records/${rec.id}.png`);
        }
      } else {
        // Items 21..30 were beyond the first batch limit(20)
        expect(rec.isCached).toBe(false);
      }
    }

    // Verify subsequent pass targets the 6 failed items + the 10 un-fetched items = 16
    const uncachedRemaining = await getUncachedDocumentTargets(patientId, db);
    expect(uncachedRemaining.length).toBe(16);
  });
});
