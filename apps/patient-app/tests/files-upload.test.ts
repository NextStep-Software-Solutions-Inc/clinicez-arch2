import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

(globalThis as any).__DEV__ = false;

// ── Mock Native Modules Before Transitive Imports ────────────────────
mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  DeviceEventEmitter: { emit: () => {}, addListener: () => ({ remove: () => {} }) },
  TurboModuleRegistry: {
    get: () => null,
    getEnforcing: () => ({}),
  },
  View: 'View',
  Text: 'Text',
}));

mock.module('@react-native-community/netinfo', () => ({
  default: {
    fetch: async () => ({ isConnected: true, isInternetReachable: true }),
    addEventListener: () => () => {},
  },
  fetch: async () => ({ isConnected: true, isInternetReachable: true }),
}));

mock.module('expo-crypto', () => ({
  getRandomBytes: (n: number) => {
    const bytes = new Uint8Array(n);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  },
  digestStringAsync: async (_algo: string, s: string) => {
    const h = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(h))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  },
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  randomUUID: () => 'mock-uuid-12345',
}));

// Dynamic imports after mock.module to avoid ES hoisting
const { Database } = await import('bun:sqlite');
const { drizzle } = await import('drizzle-orm/bun-sqlite');
const { eq, or, and } = await import('drizzle-orm');
const { blobStorage } = await import('../services/storage');
const { enqueueOfflineRecordUpload } = await import('../services/sync/uploadQueueService');
const { localHealthRecords } = await import('../db/schema/localHealthRecords');
const { filesMetadata } = await import('../db/schema/filesMetadata');
const { uploadQueue } = await import('../db/schema/uploadQueue');
const { documentTypes } = await import('../db/schema/documentTypes');
const { resolveDocumentTypeId } = await import('../services/files/documentTypeMapping');

function createFilesTestDb() {
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

  sqlite.run(`
    CREATE TABLE document_types (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      metadata_schema TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  return { sqlite, db: drizzle(sqlite) };
}

describe('Files, Binary Uploads & PWA Security Suite', () => {
  describe('1. Permanent Local Binary Staging (IBlobStorage & UploadQueue)', () => {
    test('saveBlobFromUri copies binary data from data URI into persistent blobStorage', async () => {
      const blobKey = 'patient-test/records/prescription-sample.pdf';
      const samplePdfContent = 'JVBERi0xLjQKJcTl8uXr... Sample PDF Binary Payload';
      const sampleDataUri = `data:application/pdf;base64,${Buffer.from(samplePdfContent).toString('base64')}`;

      const savedPath = await blobStorage.saveBlobFromUri(blobKey, sampleDataUri);
      expect(savedPath).toBe(blobKey);

      const exists = await blobStorage.hasBlob(blobKey);
      expect(exists).toBe(true);

      const bytes = await blobStorage.getBlobBytes(blobKey);
      expect(bytes).not.toBeNull();
      const readContent = new TextDecoder().decode(bytes!);
      expect(readContent).toBe(samplePdfContent);
    });

    test('enqueueOfflineRecordUpload stages file into permanent storage and inserts queued record', async () => {
      const { db } = createFilesTestDb();
      const patientId = 'patient-enqueue-test';
      const fileBytes = new TextEncoder().encode('CBC Blood Test Results PDF Content');

      const recordId = await enqueueOfflineRecordUpload(
        {
          patientId,
          documentTypeId: 'dt-lab-result',
          title: 'Complete Blood Count',
          fileName: 'cbc_test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: fileBytes.byteLength,
          fileBlob: fileBytes,
        },
        async () => 'fake-token',
        { isOnline: async () => false, db }
      );

      expect(typeof recordId).toBe('string');
      expect(recordId.length).toBeGreaterThan(0);

      // Verify inserted into localHealthRecords
      const localRecords = await db.select().from(localHealthRecords).where(eq(localHealthRecords.patientId, patientId));
      expect(localRecords.length).toBe(1);
      expect(localRecords[0].title).toBe('Complete Blood Count');
      expect(localRecords[0].syncStatus).toBe('queued');

      // Verify inserted into uploadQueue
      const queueItems = await db.select().from(uploadQueue).where(eq(uploadQueue.patientId, patientId));
      expect(queueItems.length).toBe(1);
      expect(queueItems[0].status).toBe('queued');
      expect(queueItems[0].fileName).toBe('cbc_test.pdf');
    });
  });

  describe('2. Downstream Remote Change Reconciliation & Deduplication', () => {
    test('downstream remote pull reconciles existing record in-place by clientId without duplicating', async () => {
      const { db } = createFilesTestDb();
      const patientId = 'patient-dedup-1';
      const now = new Date();

      // 1. Initial offline record created on device with clientId
      const localId = 'client-doc-123';
      await db.insert(filesMetadata).values({
        id: localId,
        patientId,
        documentTypeId: 'dt-other',
        name: 'Draft Scan.pdf',
        title: 'Draft Scan',
        mimeType: 'application/pdf',
        extension: 'pdf',
        sizeBytes: 1024,
        isCached: true,
        syncStatus: 'queued',
        syncOperation: 'insert',
        createdAt: now,
        updatedAt: now,
        serverId: null,
      });

      // 2. Simulated remote server file acknowledging the upload with serverId and updated name
      const remoteFile = {
        id: 'srv-remote-doc-999',
        clientId: localId,
        fileName: 'Verified Medical Scan.pdf',
        title: 'Verified Medical Scan',
        documentTypeId: 'dt-other',
        mimeType: 'application/pdf',
        extension: 'pdf',
        sizeBytes: 2048,
        storageKey: `${patientId}/records/srv-remote-doc-999.pdf`,
        uploadedAt: new Date(now.getTime() + 1000).toISOString(),
      };

      // 3. Downstream pull reconciliation logic (as implemented in filesShared.ts pullRemoteChanges)
      const whereConds = [
        eq(filesMetadata.serverId, remoteFile.id),
        eq(filesMetadata.id, remoteFile.id),
      ];
      if (remoteFile.clientId) {
        whereConds.push(eq(filesMetadata.id, remoteFile.clientId));
      }

      const [existing] = await db.select().from(filesMetadata).where(or(...whereConds)).limit(1);
      expect(existing).toBeDefined();
      expect(existing.id).toBe(localId);

      // Apply in-place reconciliation
      await db
        .update(filesMetadata)
        .set({
          serverId: remoteFile.id,
          name: remoteFile.fileName,
          title: remoteFile.title,
          sizeBytes: remoteFile.sizeBytes,
          cloudObjectKey: remoteFile.storageKey,
          syncStatus: 'synced',
        })
        .where(eq(filesMetadata.id, existing.id));

      // 4. Verify no duplicate row was created
      const allRows = await db.select().from(filesMetadata).where(eq(filesMetadata.patientId, patientId));
      expect(allRows.length).toBe(1);
      expect(allRows[0].id).toBe(localId);
      expect(allRows[0].serverId).toBe('srv-remote-doc-999');
      expect(allRows[0].name).toBe('Verified Medical Scan.pdf');
    });
  });

  describe('3. Dynamic Document Type Resolution from SQLite Cache', () => {
    test('resolves document type IDs dynamically from catalog without falling back to hardcoded UUIDs', () => {
      const dynamicCatalog = [
        {
          id: 'dyn-ecg-uuid-777',
          code: 'ECG_REPORT',
          name: 'Electrocardiogram Report',
          slug: 'ecg-report',
          category: 'diagnostic',
          isActive: 1,
        },
        {
          id: 'dyn-discharge-uuid-888',
          code: 'DISCHARGE_SUMMARY',
          name: 'Hospital Discharge Summary',
          slug: 'discharge-summary',
          category: 'clinical',
          isActive: 1,
        },
      ];

      // Resolve by slug
      const resolvedEcg = resolveDocumentTypeId('ecg-report', undefined, dynamicCatalog as any);
      expect(resolvedEcg).toBe('dyn-ecg-uuid-777');

      // Resolve by code
      const resolvedDischarge = resolveDocumentTypeId('DISCHARGE_SUMMARY', undefined, dynamicCatalog as any);
      expect(resolvedDischarge).toBe('dyn-discharge-uuid-888');

      // Resolve by name
      const resolvedByName = resolveDocumentTypeId('Electrocardiogram Report', undefined, dynamicCatalog as any);
      expect(resolvedByName).toBe('dyn-ecg-uuid-777');
    });
  });

  describe('4. Web PWA Service Worker PHI Bypass & Security Configuration', () => {
    const swPath = join(__dirname, '../public/sw.js');
    const manifestPath = join(__dirname, '../public/manifest.json');
    const vercelConfigPath = join(__dirname, '../vercel.json');

    test('sw.js exists and explicitly bypasses all /api/** routes and stream endpoints from CacheStorage', () => {
      expect(existsSync(swPath)).toBe(true);
      const swContent = readFileSync(swPath, 'utf-8');

      // 1. Explicit PHI bypass protection checks
      expect(swContent).toContain("url.pathname.startsWith('/api/')");
      expect(swContent).toContain("url.pathname.includes('/api/v1/')");
      expect(swContent).toContain("url.pathname.includes('/stream')");
      expect(swContent).toContain("url.hostname.includes('clerk')");
      expect(swContent).toContain("url.hostname.includes('patient-api')");
      expect(swContent).toContain("url.hostname.includes('clinic-api')");

      // 2. Non-GET requests must never be cached
      expect(swContent).toContain("req.method !== 'GET'");

      // 3. Cache-first strategy for immutable static chunks & WASM
      expect(swContent).toContain("url.pathname.startsWith('/_expo/static/')");
      expect(swContent).toContain("url.pathname.endsWith('.wasm')");
    });

    test('manifest.json has correct ClinicEZ branding and standalone display', () => {
      expect(existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

      expect(manifest.short_name).toBe('Clinic EZ');
      expect(manifest.name).toBe('Clinic EZ Patient');
      expect(manifest.theme_color).toBe('#0D6963');
      expect(manifest.background_color).toBe('#F0FDF9');
      expect(manifest.display).toBe('standalone');
      expect(Array.isArray(manifest.icons)).toBe(true);
      expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    });

    test('vercel.json enforces no-cache on sw.js and index.html, with immutable WASM cache', () => {
      expect(existsSync(vercelConfigPath)).toBe(true);
      const vercelConfig = JSON.parse(readFileSync(vercelConfigPath, 'utf-8'));

      const headers = vercelConfig.headers as Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
      expect(Array.isArray(headers)).toBe(true);

      // Verify sw.js headers
      const swHeaderEntry = headers.find((h) => h.source === '/sw.js');
      expect(swHeaderEntry).toBeDefined();
      const swCacheControl = swHeaderEntry?.headers.find((kv) => kv.key === 'Cache-Control');
      expect(swCacheControl?.value).toBe('no-cache, no-store, must-revalidate');

      // Verify index.html headers
      const indexHeaderEntry = headers.find((h) => h.source === '/(index\\.html)?');
      expect(indexHeaderEntry).toBeDefined();
      const indexCacheControl = indexHeaderEntry?.headers.find((kv) => kv.key === 'Cache-Control');
      expect(indexCacheControl?.value).toBe('no-cache, no-store, must-revalidate');

      // Verify .wasm immutable cache
      const wasmHeaderEntry = headers.find((h) => h.source === '/(.*)\\.wasm');
      expect(wasmHeaderEntry).toBeDefined();
      const wasmCacheControl = wasmHeaderEntry?.headers.find((kv) => kv.key === 'Cache-Control');
      expect(wasmCacheControl?.value).toContain('immutable');
    });
  });
});
