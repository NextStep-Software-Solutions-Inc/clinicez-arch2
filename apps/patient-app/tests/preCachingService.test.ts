import { describe, expect, test, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';
import {
  getUncachedDocumentTargets,
  preCacheUncachedDocuments,
  type PreCacheTarget,
} from '../services/sync/preCachingService';
import { localHealthRecords } from '../db/schema/localHealthRecords';
import { inboxLabResults } from '../db/schema/inboxLabResults';
import { filesMetadata } from '../db/schema/filesMetadata';

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

  return { sqlite, db: drizzle(sqlite) };
}

const fakeToken = async () => 'test-bearer-token';

describe('preCachingService (Auto Pre-Caching of Issued Documents)', () => {
  let db: ReturnType<typeof createTestDb>['db'];

  beforeEach(() => {
    db = createTestDb().db;
  });

  describe('getUncachedDocumentTargets detection', () => {
    test('identifies uncached lab results and records while skipping already-cached and deleted items', async () => {
      const now = new Date();

      // 1. Uncached lab result (needs download)
      db.insert(inboxLabResults).values({
        id: 'lab-res-1',
        patientId: 'patient-1',
        title: 'Lipid Profile',
        laboratoryName: 'ClinicEZ Diagnostics',
        source: 'ClinicLab',
        verification: 'Verified',
        resultedAt: now,
        fileUrl: '/api/v1/patients/patient-1/documents/lab-results/lab-res-1/stream',
        localPath: null,
        isCached: false,
        updatedAt: now,
      }).run();

      // 2. Already cached lab result (should be skipped)
      db.insert(inboxLabResults).values({
        id: 'lab-res-cached',
        patientId: 'patient-1',
        title: 'Urinalysis',
        laboratoryName: 'ClinicEZ Diagnostics',
        source: 'ClinicLab',
        verification: 'Verified',
        resultedAt: now,
        fileUrl: '/api/v1/patients/patient-1/documents/lab-results/lab-res-cached/stream',
        localPath: '/sandbox/cached/urinalysis.pdf',
        isCached: true,
        updatedAt: now,
      }).run();

      // 3. Uncached synced health record (needs download)
      db.insert(localHealthRecords).values({
        id: 'rec-uncached',
        patientId: 'patient-1',
        category: 'imaging',
        documentTypeId: 'dt-xray',
        title: 'Chest X-Ray',
        fileName: 'chest.png',
        mimeType: 'image/png',
        sizeBytes: 400000,
        serverId: 'srv-rec-55',
        localBlobPath: null,
        isCached: false,
        syncStatus: 'synced',
        createdAt: now,
        updatedAt: now,
      }).run();

      // 4. Soft-deleted record (should be skipped)
      db.insert(localHealthRecords).values({
        id: 'rec-deleted',
        patientId: 'patient-1',
        category: 'other',
        documentTypeId: 'dt-1',
        title: 'Old Document',
        fileName: 'doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        serverId: 'srv-rec-99',
        localBlobPath: null,
        isCached: false,
        syncStatus: 'synced',
        deletedAt: new Date(),
        createdAt: now,
        updatedAt: now,
      }).run();

      const targets = await getUncachedDocumentTargets('patient-1', db);

      expect(targets.length).toBe(2);

      const labTarget = targets.find((t) => t.id === 'lab-res-1');
      expect(labTarget).toBeDefined();
      expect(labTarget!.kind).toBe('lab_result');
      expect(labTarget!.streamUrl).toContain('lab-res-1/stream');

      const recTarget = targets.find((t) => t.id === 'rec-uncached');
      expect(recTarget).toBeDefined();
      expect(recTarget!.kind).toBe('health_record');
      expect(recTarget!.serverId).toBe('srv-rec-55');
      expect(recTarget!.streamUrl).toContain('srv-rec-55/stream');
    });
  });

  describe('streaming download & local blob persistence', () => {
    test('streams binary from backend and updates local SQLite metadata to cached', async () => {
      const now = new Date();
      db.insert(inboxLabResults).values({
        id: 'lab-res-stream',
        patientId: 'patient-1',
        title: 'Electrolytes Panel',
        laboratoryName: 'ClinicEZ Diagnostics',
        source: 'ClinicLab',
        verification: 'Verified',
        resultedAt: now,
        fileUrl: '/documents/lab-results/lab-res-stream/stream',
        localPath: null,
        isCached: false,
        updatedAt: now,
      }).run();

      const downloadedBlobs = new Map<string, string>();

      const mockDownload = async (target: PreCacheTarget, token: string | null) => {
        expect(token).toBe('test-bearer-token');
        const localPath = `/sandbox/blobs/${target.patientId}/${target.id}.pdf`;
        downloadedBlobs.set(target.id, localPath);
        return localPath;
      };

      const result = await preCacheUncachedDocuments('patient-1', fakeToken, {
        isOnline: async () => true,
        downloadFn: mockDownload,
        db,
      });

      expect(result.cached).toBe(1);
      expect(result.failed).toBe(0);

      // Verify row in SQLite is marked isCached = true with localPath
      const [updatedLab] = db.select().from(inboxLabResults).where(eq(inboxLabResults.id, 'lab-res-stream')).all();
      expect(updatedLab.isCached).toBe(true);
      expect(updatedLab.localPath).toBe('/sandbox/blobs/patient-1/lab-res-stream.pdf');

      // Subsequent call finds 0 uncached targets
      const remainingTargets = await getUncachedDocumentTargets('patient-1', db);
      expect(remainingTargets.length).toBe(0);
    });
  });

  describe('concurrency limit 2 during pre-caching', () => {
    test('enforces max concurrent stream downloads of 2 across batch pre-caching', async () => {
      const now = new Date();

      for (let i = 1; i <= 4; i++) {
        db.insert(localHealthRecords).values({
          id: `rec-batch-${i}`,
          patientId: 'patient-1',
          category: 'imaging',
          documentTypeId: 'dt-1',
          title: `Scan ${i}`,
          fileName: `scan_${i}.png`,
          mimeType: 'image/png',
          sizeBytes: 100000,
          serverId: `srv-${i}`,
          localBlobPath: null,
          isCached: false,
          syncStatus: 'synced',
          createdAt: now,
          updatedAt: now,
        }).run();
      }

      let activeDownloads = 0;
      let peakConcurrency = 0;

      const mockDownload = async (target: PreCacheTarget) => {
        activeDownloads++;
        peakConcurrency = Math.max(peakConcurrency, activeDownloads);
        await new Promise((r) => setTimeout(r, 20));
        activeDownloads--;
        return `/sandbox/records/${target.id}.png`;
      };

      const result = await preCacheUncachedDocuments('patient-1', fakeToken, {
        isOnline: async () => true,
        downloadFn: mockDownload,
        db,
      });

      expect(result.cached).toBe(4);
      expect(peakConcurrency).toBeLessThanOrEqual(2);
      expect(peakConcurrency).toBe(2);
    });
  });

  describe('offline safety', () => {
    test('gracefully skips pre-caching when device is offline without errors', async () => {
      const now = new Date();
      db.insert(inboxLabResults).values({
        id: 'lab-offline',
        patientId: 'patient-1',
        title: 'CBC',
        laboratoryName: 'ClinicEZ Diagnostics',
        source: 'ClinicLab',
        verification: 'Verified',
        resultedAt: now,
        fileUrl: '/stream',
        localPath: null,
        isCached: false,
        updatedAt: now,
      }).run();

      const result = await preCacheUncachedDocuments('patient-1', fakeToken, {
        isOnline: async () => false,
        db,
      });

      expect(result.skippedOffline).toBe(true);
      expect(result.cached).toBe(0);
      expect(result.failed).toBe(0);

      // Verify document remains uncached for next online opportunity
      const [lab] = db.select().from(inboxLabResults).where(eq(inboxLabResults.id, 'lab-offline')).all();
      expect(lab.isCached).toBe(false);
    });
  });
});
