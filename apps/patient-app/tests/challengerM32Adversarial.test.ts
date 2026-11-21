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
import { enqueueOfflineRecordUpload, drainUploadQueue } from '../services/sync/uploadQueueService';

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

const fakeToken = async () => 'challenger-test-token';

describe('Challenger M3-2 Adversarial Stress Suite', () => {
  let db: ReturnType<typeof createTestDb>['db'];

  beforeEach(async () => {
    db = createTestDb().db;
    await blobStorage.clearCache();
  });

  // -------------------------------------------------------------------------
  // 1. Pre-Caching Skipping & Idempotency
  // -------------------------------------------------------------------------
  test('CHALLENGE 1: Pre-caching skips already cached items (isCached === 1) and never re-downloads on subsequent sync passes', async () => {
    const patientId = 'patient-challenge-1';
    const now = new Date();

    // 3 uncached lab results
    for (let i = 1; i <= 3; i++) {
      db.insert(inboxLabResults).values({
        id: `lab-uncached-${i}`,
        patientId,
        title: `Lab Test ${i}`,
        laboratoryName: 'Clinic Diagnostics',
        source: 'ClinicLab',
        verification: 'Verified',
        resultedAt: now,
        fileUrl: `/api/v1/patients/${patientId}/documents/lab-results/lab-uncached-${i}/stream`,
        localPath: null,
        isCached: false,
        updatedAt: now,
      }).run();
    }

    // 2 already cached lab results (isCached = true, localPath set)
    for (let i = 1; i <= 2; i++) {
      db.insert(inboxLabResults).values({
        id: `lab-cached-${i}`,
        patientId,
        title: `Cached Lab ${i}`,
        laboratoryName: 'Clinic Diagnostics',
        source: 'ClinicLab',
        verification: 'Verified',
        resultedAt: now,
        fileUrl: `/api/v1/patients/${patientId}/documents/lab-results/lab-cached-${i}/stream`,
        localPath: `/sandbox/existing-lab-${i}.pdf`,
        isCached: true,
        updatedAt: now,
      }).run();
    }

    // 2 uncached synced health records
    for (let i = 1; i <= 2; i++) {
      db.insert(localHealthRecords).values({
        id: `rec-uncached-${i}`,
        patientId,
        category: 'other',
        documentTypeId: 'dt-1',
        title: `Uncached Record ${i}`,
        fileName: `record_${i}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 50000,
        serverId: `srv-rec-${i}`,
        localBlobPath: null,
        isCached: false,
        syncStatus: 'synced',
        createdAt: now,
        updatedAt: now,
      }).run();
    }

    // 2 already cached health records
    for (let i = 1; i <= 2; i++) {
      db.insert(localHealthRecords).values({
        id: `rec-cached-${i}`,
        patientId,
        category: 'other',
        documentTypeId: 'dt-1',
        title: `Cached Record ${i}`,
        fileName: `cached_${i}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 50000,
        serverId: `srv-cached-${i}`,
        localBlobPath: `/sandbox/existing-rec-${i}.pdf`,
        isCached: true,
        syncStatus: 'synced',
        createdAt: now,
        updatedAt: now,
      }).run();
    }

    // 1 unsynced record (serverId is null) - should be skipped
    db.insert(localHealthRecords).values({
      id: 'rec-unsynced',
      patientId,
      category: 'other',
      documentTypeId: 'dt-1',
      title: 'Draft Unsynced',
      fileName: 'draft.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1000,
      serverId: null,
      localBlobPath: null,
      isCached: false,
      syncStatus: 'queued',
      createdAt: now,
      updatedAt: now,
    }).run();

    // 1 soft-deleted record - should be skipped
    db.insert(localHealthRecords).values({
      id: 'rec-deleted',
      patientId,
      category: 'other',
      documentTypeId: 'dt-1',
      title: 'Deleted Record',
      fileName: 'deleted.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1000,
      serverId: 'srv-deleted',
      localBlobPath: null,
      isCached: false,
      syncStatus: 'synced',
      deletedAt: now,
      createdAt: now,
      updatedAt: now,
    }).run();

    // Verify initial targets detection: exactly 3 uncached labs + 2 uncached records = 5
    const initialTargets = await getUncachedDocumentTargets(patientId, db);
    expect(initialTargets.length).toBe(5);

    let downloadCount = 0;
    const downloadedIds = new Set<string>();

    const trackingDownload = async (target: PreCacheTarget) => {
      downloadCount++;
      downloadedIds.add(target.id);
      return `/sandbox/blobs/${target.id}.pdf`;
    };

    // First Pass
    const pass1 = await preCacheUncachedDocuments(patientId, fakeToken, {
      isOnline: async () => true,
      downloadFn: trackingDownload,
      db,
    });

    expect(pass1.cached).toBe(5);
    expect(pass1.failed).toBe(0);
    expect(downloadCount).toBe(5);
    expect(downloadedIds.has('lab-cached-1')).toBe(false);
    expect(downloadedIds.has('lab-cached-2')).toBe(false);
    expect(downloadedIds.has('rec-cached-1')).toBe(false);
    expect(downloadedIds.has('rec-cached-2')).toBe(false);
    expect(downloadedIds.has('rec-unsynced')).toBe(false);
    expect(downloadedIds.has('rec-deleted')).toBe(false);

    // Second Pass (Immediate subsequent sync pass)
    downloadCount = 0;
    downloadedIds.clear();

    const pass2Targets = await getUncachedDocumentTargets(patientId, db);
    expect(pass2Targets.length).toBe(0);

    const pass2 = await preCacheUncachedDocuments(patientId, fakeToken, {
      isOnline: async () => true,
      downloadFn: trackingDownload,
      db,
    });

    expect(pass2.cached).toBe(0);
    expect(pass2.failed).toBe(0);
    expect(downloadCount).toBe(0); // Zero re-downloads occurred
  });

  // -------------------------------------------------------------------------
  // 2. Concurrency Limit Stress Test (Max 2 Connections)
  // -------------------------------------------------------------------------
  test('CHALLENGE 2: Enforces strict concurrency ceiling of max 2 connections under heavy load with jitter', async () => {
    const patientId = 'patient-challenge-concurrency';
    const totalItems = 20;
    const now = new Date();

    for (let i = 1; i <= totalItems; i++) {
      db.insert(localHealthRecords).values({
        id: `rec-heavy-${i}`,
        patientId,
        category: 'imaging',
        documentTypeId: 'dt-1',
        title: `Heavy Scan ${i}`,
        fileName: `heavy_${i}.png`,
        mimeType: 'image/png',
        sizeBytes: 250000,
        serverId: `srv-heavy-${i}`,
        localBlobPath: null,
        isCached: false,
        syncStatus: 'synced',
        createdAt: now,
        updatedAt: now,
      }).run();
    }

    let activeDownloads = 0;
    let peakConcurrency = 0;
    const concurrencySnapshots: number[] = [];

    const simulatedNetworkDownload = async (target: PreCacheTarget) => {
      activeDownloads++;
      concurrencySnapshots.push(activeDownloads);
      peakConcurrency = Math.max(peakConcurrency, activeDownloads);

      // Random jitter between 5ms and 25ms to induce worker interleaving
      const delayMs = 5 + Math.floor(Math.random() * 20);
      await new Promise((r) => setTimeout(r, delayMs));

      activeDownloads--;
      concurrencySnapshots.push(activeDownloads);
      return `/sandbox/blobs/${target.id}.png`;
    };

    const result = await preCacheUncachedDocuments(patientId, fakeToken, {
      isOnline: async () => true,
      downloadFn: simulatedNetworkDownload,
      db,
    });

    expect(result.cached).toBe(totalItems);
    expect(result.failed).toBe(0);
    expect(peakConcurrency).toBe(2);
    expect(Math.max(...concurrencySnapshots)).toBeLessThanOrEqual(2);
    expect(concurrencySnapshots.every((c) => c >= 0 && c <= 2)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 3. Partial Failure & Retry Isolation
  // -------------------------------------------------------------------------
  test('CHALLENGE 3: Handles intermittent network failures gracefully without corrupting state, retrying only failed items', async () => {
    const patientId = 'patient-challenge-failover';
    const now = new Date();

    // 6 records
    for (let i = 1; i <= 6; i++) {
      db.insert(localHealthRecords).values({
        id: `rec-failover-${i}`,
        patientId,
        category: 'other',
        documentTypeId: 'dt-1',
        title: `Doc ${i}`,
        fileName: `doc_${i}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 10000,
        serverId: `srv-failover-${i}`,
        localBlobPath: null,
        isCached: false,
        syncStatus: 'synced',
        createdAt: now,
        updatedAt: now,
      }).run();
    }

    // Even items fail (items 2, 4, 6), Odd items succeed (items 1, 3, 5)
    let shouldFailEvens = true;
    const downloadAttempts = new Map<string, number>();

    const flakeyDownload = async (target: PreCacheTarget) => {
      const attempts = (downloadAttempts.get(target.id) ?? 0) + 1;
      downloadAttempts.set(target.id, attempts);

      const itemNum = parseInt(target.id.split('-').pop() ?? '0', 10);
      if (shouldFailEvens && itemNum % 2 === 0) {
        throw new Error(`Simulated socket timeout for ${target.id}`);
      }
      return `/sandbox/blobs/${target.id}.pdf`;
    };

    // First attempt: 3 succeed, 3 fail
    const pass1 = await preCacheUncachedDocuments(patientId, fakeToken, {
      isOnline: async () => true,
      downloadFn: flakeyDownload,
      db,
    });

    expect(pass1.cached).toBe(3);
    expect(pass1.failed).toBe(3);

    // Verify DB state: Odd items are cached, Even items remain uncached
    const rowsPass1 = db.select().from(localHealthRecords).where(eq(localHealthRecords.patientId, patientId)).all();
    for (const row of rowsPass1) {
      const num = parseInt(row.id.split('-').pop() ?? '0', 10);
      if (num % 2 === 1) {
        expect(row.isCached).toBe(true);
        expect(row.localBlobPath).toBe(`/sandbox/blobs/${row.id}.pdf`);
      } else {
        expect(row.isCached).toBe(false);
        expect(row.localBlobPath).toBeNull();
      }
    }

    // Now network recovers: Evens no longer fail
    shouldFailEvens = false;

    // Subsequent target query should only pick up the 3 remaining uncached items (2, 4, 6)
    const pass2Targets = await getUncachedDocumentTargets(patientId, db);
    expect(pass2Targets.length).toBe(3);
    const targetIds = pass2Targets.map((t) => t.id).sort();
    expect(targetIds).toEqual(['rec-failover-2', 'rec-failover-4', 'rec-failover-6']);

    const pass2 = await preCacheUncachedDocuments(patientId, fakeToken, {
      isOnline: async () => true,
      downloadFn: flakeyDownload,
      db,
    });

    expect(pass2.cached).toBe(3);
    expect(pass2.failed).toBe(0);

    // All 6 items must now be successfully cached
    const rowsPass2 = db.select().from(localHealthRecords).where(eq(localHealthRecords.patientId, patientId)).all();
    expect(rowsPass2.every((r) => r.isCached === true)).toBe(true);
    expect(rowsPass2.every((r) => r.localBlobPath !== null)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 4. Record Deletion Isolation & Blob Purging
  // -------------------------------------------------------------------------
  test('CHALLENGE 4: Record deletion purges the exact blob without corrupting or deleting sibling records or cross-patient files', async () => {
    const patientA = 'patient-alpha';
    const patientB = 'patient-beta';
    const now = new Date();

    const recordA1Key = `${patientA}/records/rec-A1.pdf`;
    const recordA2Key = `${patientA}/records/rec-A2.pdf`;
    const recordB1Key = `${patientB}/records/rec-B1.pdf`;

    const blobA1Bytes = new TextEncoder().encode('Content for Patient A File 1');
    const blobA2Bytes = new TextEncoder().encode('Content for Patient A File 2 (Target for deletion)');
    const blobB1Bytes = new TextEncoder().encode('Content for Patient B File 1');

    await blobStorage.saveBlob(recordA1Key, blobA1Bytes, 'application/pdf');
    await blobStorage.saveBlob(recordA2Key, blobA2Bytes, 'application/pdf');
    await blobStorage.saveBlob(recordB1Key, blobB1Bytes, 'application/pdf');

    expect(await blobStorage.hasBlob(recordA1Key)).toBe(true);
    expect(await blobStorage.hasBlob(recordA2Key)).toBe(true);
    expect(await blobStorage.hasBlob(recordB1Key)).toBe(true);

    // Insert SQLite records
    db.insert(localHealthRecords).values([
      {
        id: 'rec-A1',
        patientId: patientA,
        category: 'other',
        documentTypeId: 'dt-1',
        title: 'File A1',
        fileName: 'rec-A1.pdf',
        mimeType: 'application/pdf',
        sizeBytes: blobA1Bytes.byteLength,
        localBlobPath: recordA1Key,
        isCached: true,
        serverId: 'srv-A1',
        syncStatus: 'synced',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'rec-A2',
        patientId: patientA,
        category: 'other',
        documentTypeId: 'dt-1',
        title: 'File A2',
        fileName: 'rec-A2.pdf',
        mimeType: 'application/pdf',
        sizeBytes: blobA2Bytes.byteLength,
        localBlobPath: recordA2Key,
        isCached: true,
        serverId: 'srv-A2',
        syncStatus: 'synced',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'rec-B1',
        patientId: patientB,
        category: 'other',
        documentTypeId: 'dt-1',
        title: 'File B1',
        fileName: 'rec-B1.pdf',
        mimeType: 'application/pdf',
        sizeBytes: blobB1Bytes.byteLength,
        localBlobPath: recordB1Key,
        isCached: true,
        serverId: 'srv-B1',
        syncStatus: 'synced',
        createdAt: now,
        updatedAt: now,
      },
    ]).run();

    // Execute deletion of rec-A2 only
    let remoteDeletedServerId: string | null = null;
    await deleteHealthRecord({
      patientId: patientA,
      fileId: 'rec-A2',
      getToken: fakeToken,
      isOnline: async () => true,
      deleteRemoteFn: async (_pid, sid) => {
        remoteDeletedServerId = sid;
      },
      db,
    });

    // Verification 1: rec-A2 blob is purged
    expect(await blobStorage.hasBlob(recordA2Key)).toBe(false);

    // Verification 2: rec-A1 and rec-B1 blobs are intact
    expect(await blobStorage.hasBlob(recordA1Key)).toBe(true);
    expect(await blobStorage.hasBlob(recordB1Key)).toBe(true);

    const a1BytesRetrieved = await blobStorage.getBlobBytes(recordA1Key);
    expect(a1BytesRetrieved).not.toBeNull();
    expect(new TextDecoder().decode(a1BytesRetrieved!)).toBe('Content for Patient A File 1');

    // Verification 3: SQLite table state
    const remainingA = db.select().from(localHealthRecords).where(eq(localHealthRecords.patientId, patientA)).all();
    expect(remainingA.length).toBe(1);
    expect(remainingA[0].id).toBe('rec-A1');

    const remainingB = db.select().from(localHealthRecords).where(eq(localHealthRecords.patientId, patientB)).all();
    expect(remainingB.length).toBe(1);
    expect(remainingB[0].id).toBe('rec-B1');

    // Verification 4: Remote delete was called for srv-A2
    expect(remoteDeletedServerId).toBe('srv-A2');
  });

  // -------------------------------------------------------------------------
  // 5. Network Boundary: Online vs Offline vs Server Failure
  // -------------------------------------------------------------------------
  test('CHALLENGE 5A: Online deletion triggers remote DELETE and leaves syncQueue clean', async () => {
    const patientId = 'patient-net-online';
    const now = new Date();

    db.insert(localHealthRecords).values({
      id: 'rec-online-clean',
      patientId,
      category: 'other',
      documentTypeId: 'dt-1',
      title: 'Online Record',
      fileName: 'doc.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1000,
      serverId: 'srv-online-clean',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now,
    }).run();

    let remoteCalled = false;
    await deleteHealthRecord({
      patientId,
      fileId: 'rec-online-clean',
      getToken: fakeToken,
      isOnline: async () => true,
      deleteRemoteFn: async () => {
        remoteCalled = true;
      },
      db,
    });

    expect(remoteCalled).toBe(true);
    const queueRows = db.select().from(syncQueue).all();
    expect(queueRows.length).toBe(0);
  });

  test('CHALLENGE 5B: Offline deletion enqueues deferred delete in syncQueue with correct JSON payload', async () => {
    const patientId = 'patient-net-offline';
    const now = new Date();

    db.insert(localHealthRecords).values({
      id: 'rec-offline-deferred',
      patientId,
      category: 'other',
      documentTypeId: 'dt-1',
      title: 'Offline Record',
      fileName: 'doc.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1000,
      serverId: 'srv-offline-777',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now,
    }).run();

    await deleteHealthRecord({
      patientId,
      fileId: 'rec-offline-deferred',
      getToken: fakeToken,
      isOnline: async () => false,
      db,
    });

    const queueRows = db.select().from(syncQueue).all();
    expect(queueRows.length).toBe(1);
    expect(queueRows[0].entityType).toBe('file');
    expect(queueRows[0].entityId).toBe('srv-offline-777');
    expect(queueRows[0].operation).toBe('delete');

    const parsed = JSON.parse(queueRows[0].payloadJson);
    expect(parsed.id).toBe('srv-offline-777');
    expect(parsed.patientId).toBe(patientId);
  });

  test('CHALLENGE 5C: Online server error (HTTP 500 / network drop) falls back to syncQueue so deletion is not lost', async () => {
    const patientId = 'patient-net-failover';
    const now = new Date();

    db.insert(localHealthRecords).values({
      id: 'rec-server-err',
      patientId,
      category: 'other',
      documentTypeId: 'dt-1',
      title: 'Server Error Record',
      fileName: 'doc.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1000,
      serverId: 'srv-error-999',
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now,
    }).run();

    // Online, but remote server responds with 500 Internal Server Error
    await deleteHealthRecord({
      patientId,
      fileId: 'rec-server-err',
      getToken: fakeToken,
      isOnline: async () => true,
      deleteRemoteFn: async () => {
        throw new Error('HTTP 500: Server unavailable');
      },
      db,
    });

    // Local record must still be deleted
    const local = db.select().from(localHealthRecords).where(eq(localHealthRecords.id, 'rec-server-err')).all();
    expect(local.length).toBe(0);

    // Fallback syncQueue entry MUST be created
    const queueRows = db.select().from(syncQueue).all();
    expect(queueRows.length).toBe(1);
    expect(queueRows[0].entityId).toBe('srv-error-999');
    expect(queueRows[0].operation).toBe('delete');
  });

  test('CHALLENGE 5D: Local-only unsynced draft deletion purges locally with zero remote calls and zero syncQueue entries', async () => {
    const patientId = 'patient-local-draft';
    const now = new Date();

    db.insert(localHealthRecords).values({
      id: 'rec-local-draft',
      patientId,
      category: 'other',
      documentTypeId: 'dt-1',
      title: 'Local Draft',
      fileName: 'draft.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1000,
      serverId: null, // Never synced
      syncStatus: 'queued',
      createdAt: now,
      updatedAt: now,
    }).run();

    let remoteCalled = false;
    await deleteHealthRecord({
      patientId,
      fileId: 'rec-local-draft',
      getToken: fakeToken,
      isOnline: async () => true,
      deleteRemoteFn: async () => {
        remoteCalled = true;
      },
      db,
    });

    expect(remoteCalled).toBe(false);
    expect(db.select().from(syncQueue).all().length).toBe(0);
    expect(db.select().from(localHealthRecords).where(eq(localHealthRecords.id, 'rec-local-draft')).all().length).toBe(0);
  });

  test('CHALLENGE 6: Verifies offline enqueue followed by deleteHealthRecord does not cause upload collisions', async () => {
    const patientId = 'patient-offline-queue-del';
    const fileBytes = new TextEncoder().encode('Dummy record for offline enqueue then delete');

    // 1. Enqueue offline record upload
    const recordId = await enqueueOfflineRecordUpload(
      {
        patientId,
        documentTypeId: 'dt-1',
        title: 'Offline Upload Pending Deletion',
        fileName: 'offline_del.pdf',
        mimeType: 'application/pdf',
        sizeBytes: fileBytes.byteLength,
        fileBlob: fileBytes,
      },
      fakeToken,
      { isOnline: async () => false, db }
    );

    // Verify row in localHealthRecords, filesMetadata, and uploadQueue
    expect(db.select().from(localHealthRecords).where(eq(localHealthRecords.id, recordId)).all().length).toBe(1);
    const queueRowsBefore = db.select().from(uploadQueue).where(eq(uploadQueue.recordId, recordId)).all();
    expect(queueRowsBefore.length).toBe(1);

    // 2. User deletes the record locally while still offline
    await deleteHealthRecord({
      patientId,
      fileId: recordId,
      getToken: fakeToken,
      isOnline: async () => false,
      db,
    });

    // 3. Verify localHealthRecords and filesMetadata row are deleted
    expect(db.select().from(localHealthRecords).where(eq(localHealthRecords.id, recordId)).all().length).toBe(0);
    expect(db.select().from(filesMetadata).where(eq(filesMetadata.id, recordId)).all().length).toBe(0);

    // 4. Verify blob is purged
    const blobKey = `${patientId}/records/${recordId}.pdf`;
    expect(await blobStorage.hasBlob(blobKey)).toBe(false);

    // 5. Check uploadQueue state
    const queueRowsAfter = db.select().from(uploadQueue).where(eq(uploadQueue.recordId, recordId)).all();
    expect(queueRowsAfter.length).toBe(0); // Queue row purged, zero orphan

    // 6. Demonstrate consequence: drainUploadQueue skips deleted record
    let uploadedJobRecordId: string | null = null;
    const drainRes = await drainUploadQueue(patientId, fakeToken, {
      isOnline: async () => true,
      uploadFn: async (item) => {
        uploadedJobRecordId = item.recordId;
        return { id: 'srv-ghost', storageKey: 'patients/.../ghost.cez' };
      },
      db,
    });

    expect(uploadedJobRecordId).toBeNull();
    expect(drainRes.drained).toBe(0);
  });
});

