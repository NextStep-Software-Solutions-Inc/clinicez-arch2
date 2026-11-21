import { describe, expect, test, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';
import { deleteHealthRecord } from '../services/files/recordDeletionService';
import { localHealthRecords } from '../db/schema/localHealthRecords';
import { filesMetadata } from '../db/schema/filesMetadata';
import { syncQueue } from '../db/schema/syncQueue';
import { blobStorage } from '../services/storage';

function createTestDb() {
  const sqlite = new Database(':memory:');

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

  return { sqlite, db: drizzle(sqlite) };
}

const fakeToken = async () => 'bearer-delete-token';

describe('documentDeletion (Local Binary Purge, SQLite Delete & Remote Dispatch)', () => {
  let db: ReturnType<typeof createTestDb>['db'];

  beforeEach(() => {
    db = createTestDb().db;
  });

  test('removes binary blob from IBlobStorage and deletes metadata row from local SQLite', async () => {
    const patientId = 'patient-del-1';
    const fileId = 'rec-to-purge';
    const blobKey = `${patientId}/records/${fileId}.pdf`;

    // 1. Create binary blob in storage
    const testBytes = new TextEncoder().encode('Dummy PDF content for deletion test');
    await blobStorage.saveBlob(blobKey, testBytes, 'application/pdf');
    expect(await blobStorage.hasBlob(blobKey)).toBe(true);

    // 2. Insert metadata into SQLite
    const now = new Date();
    db.insert(localHealthRecords).values({
      id: fileId,
      patientId,
      category: 'other',
      documentTypeId: 'dt-1',
      title: 'Temporary File',
      fileName: `${fileId}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: testBytes.byteLength,
      localBlobPath: blobKey,
      isCached: true,
      syncStatus: 'queued',
      createdAt: now,
      updatedAt: now,
    }).run();

    db.insert(filesMetadata).values({
      id: fileId,
      patientId,
      documentTypeId: 'dt-1',
      name: `${fileId}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: testBytes.byteLength,
      localPath: blobKey,
      isCached: true,
      createdAt: now,
      updatedAt: now,
    }).run();

    // 3. Delete record
    await deleteHealthRecord({
      patientId,
      fileId,
      getToken: fakeToken,
      isOnline: async () => true,
      db,
    });

    // 4. Verify blob is purged from storage
    expect(await blobStorage.hasBlob(blobKey)).toBe(false);

    // 5. Verify row is deleted from localHealthRecords and filesMetadata
    const localRows = db.select().from(localHealthRecords).where(eq(localHealthRecords.id, fileId)).all();
    expect(localRows.length).toBe(0);

    const metaRows = db.select().from(filesMetadata).where(eq(filesMetadata.id, fileId)).all();
    expect(metaRows.length).toBe(0);
  });

  test('dispatches online remote DELETE /patients/{patientId}/records/{id} when synced item is online', async () => {
    const patientId = 'patient-del-online';
    const fileId = 'rec-online-del';
    const serverId = 'srv-remote-doc-88';
    const now = new Date();

    db.insert(localHealthRecords).values({
      id: fileId,
      patientId,
      category: 'imaging',
      documentTypeId: 'dt-xray',
      title: 'Online Chest Scan',
      fileName: 'chest.png',
      mimeType: 'image/png',
      sizeBytes: 150000,
      serverId,
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now,
    }).run();

    let remoteDeleted = false;
    let deletedParams: { patientId: string; serverId: string; token: string | null } | null = null;

    const mockDeleteRemote = async (pid: string, sid: string, token: string | null) => {
      remoteDeleted = true;
      deletedParams = { patientId: pid, serverId: sid, token };
    };

    await deleteHealthRecord({
      patientId,
      fileId,
      getToken: fakeToken,
      isOnline: async () => true,
      deleteRemoteFn: mockDeleteRemote,
      db,
    });

    expect(remoteDeleted).toBe(true);
    expect(deletedParams).toEqual({
      patientId,
      serverId,
      token: 'bearer-delete-token',
    });

    // Remote DELETE was synchronous, so no deferred delete was enqueued
    const queueRows = db.select().from(syncQueue).all();
    expect(queueRows.length).toBe(0);
  });

  test('enqueues deferred delete in syncQueue when remote item is deleted while offline', async () => {
    const patientId = 'patient-del-offline';
    const fileId = 'rec-offline-del';
    const serverId = 'srv-offline-remote-44';
    const now = new Date();

    db.insert(localHealthRecords).values({
      id: fileId,
      patientId,
      category: 'prescriptions',
      documentTypeId: 'dt-rx',
      title: 'Offline Rx Deletion',
      fileName: 'rx.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 50000,
      serverId,
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now,
    }).run();

    let remoteAttempted = false;

    await deleteHealthRecord({
      patientId,
      fileId,
      getToken: fakeToken,
      isOnline: async () => false, // OFFLINE
      deleteRemoteFn: async () => {
        remoteAttempted = true;
      },
      db,
    });

    expect(remoteAttempted).toBe(false);

    // Verify deferred delete is recorded in syncQueue
    const queueRows = db.select().from(syncQueue).all();
    expect(queueRows.length).toBe(1);

    const queuedItem = queueRows[0];
    expect(queuedItem.entityType).toBe('file');
    expect(queuedItem.entityId).toBe(serverId);
    expect(queuedItem.operation).toBe('delete');

    const payload = JSON.parse(queuedItem.payloadJson);
    expect(payload.id).toBe(serverId);
    expect(payload.patientId).toBe(patientId);
  });

  test('deletes local-only record without triggering or enqueuing remote delete', async () => {
    const patientId = 'patient-local-only';
    const fileId = 'rec-local-only';
    const now = new Date();

    // serverId is null because file was never uploaded/synced
    db.insert(localHealthRecords).values({
      id: fileId,
      patientId,
      category: 'other',
      documentTypeId: 'dt-1',
      title: 'Local Draft',
      fileName: 'draft.txt',
      mimeType: 'text/plain',
      sizeBytes: 250,
      serverId: null,
      syncStatus: 'queued',
      createdAt: now,
      updatedAt: now,
    }).run();

    let remoteCalled = false;

    await deleteHealthRecord({
      patientId,
      fileId,
      getToken: fakeToken,
      isOnline: async () => true,
      deleteRemoteFn: async () => {
        remoteCalled = true;
      },
      db,
    });

    expect(remoteCalled).toBe(false);

    const localRows = db.select().from(localHealthRecords).where(eq(localHealthRecords.id, fileId)).all();
    expect(localRows.length).toBe(0);

    const queueRows = db.select().from(syncQueue).all();
    expect(queueRows.length).toBe(0);
  });
});
