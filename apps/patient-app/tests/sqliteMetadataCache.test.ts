import { describe, expect, test, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { localHealthRecords, type LocalHealthRecord } from '../db/schema/localHealthRecords';
import { localDocuments } from '../db/schema/localDocuments';
import { uploadQueue } from '../db/schema/uploadQueue';

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
    CREATE TABLE local_documents (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      document_number TEXT,
      ordering_facility_id TEXT,
      ordering_facility_name TEXT,
      issuer_name TEXT,
      issuer_prc_license TEXT,
      issued_at INTEGER NOT NULL,
      provenance TEXT NOT NULL DEFAULT 'clinicez_verified',
      urgency TEXT NOT NULL DEFAULT 'routine',
      stage TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      file_url TEXT,
      file_name TEXT,
      mime_type TEXT,
      size_bytes INTEGER,
      local_blob_path TEXT,
      is_cached INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
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

describe('sqliteMetadataCache (Dual-Tier Schema & Metadata Engine)', () => {
  let db: ReturnType<typeof createTestDb>['db'];

  beforeEach(() => {
    db = createTestDb().db;
  });

  test('inserts and retrieves patient health record with full dual-tier metadata', () => {
    const now = new Date();
    db.insert(localHealthRecords).values({
      id: 'record-1',
      patientId: 'patient-42',
      category: 'imaging',
      documentTypeId: 'doc-type-xray',
      title: 'Chest Radiograph AP View',
      fileName: 'chest_xray.png',
      mimeType: 'image/png',
      sizeBytes: 2048500,
      documentDate: '2026-10-20',
      facilityName: 'Metro General Hospital',
      notes: 'No signs of acute cardiopulmonary disease.',
      provenance: 'patient_uploaded',
      urgency: 'routine',
      localBlobPath: '/sandbox/patient-42/records/record-1.png',
      isCached: true,
      syncStatus: 'queued',
      retryCount: 0,
      lastSyncError: null,
      serverId: null,
      storageKey: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncedAt: null,
    }).run();

    const [retrieved] = db.select().from(localHealthRecords).where(eq(localHealthRecords.id, 'record-1')).all();

    expect(retrieved).toBeDefined();
    expect(retrieved.id).toBe('record-1');
    expect(retrieved.patientId).toBe('patient-42');
    expect(retrieved.category).toBe('imaging');
    expect(retrieved.title).toBe('Chest Radiograph AP View');
    expect(retrieved.isCached).toBe(true);
    expect(retrieved.localBlobPath).toBe('/sandbox/patient-42/records/record-1.png');
    expect(retrieved.syncStatus).toBe('queued');
  });

  test('inserts issued clinic document into localDocuments cache table', () => {
    const now = new Date();
    db.insert(localDocuments).values({
      id: 'doc-lab-1',
      patientId: 'patient-42',
      category: 'lab_result',
      title: 'Complete Blood Count (CBC) with Platelets',
      documentNumber: 'LAB-2026-001',
      orderingFacilityId: 'fac-1',
      orderingFacilityName: 'ClinicEZ Diagnostics',
      issuerName: 'Dr. Santos',
      issuerPrcLicense: 'PRC-12345',
      issuedAt: now,
      provenance: 'clinicez_verified',
      urgency: 'routine',
      stage: 'Verified',
      payloadJson: '{"hgb": 14.2}',
      fileUrl: '/patients/patient-42/documents/lab-results/doc-lab-1/stream',
      fileName: 'cbc_report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 154000,
      localBlobPath: null,
      isCached: false,
      updatedAt: now,
    }).run();

    const [doc] = db.select().from(localDocuments).where(eq(localDocuments.id, 'doc-lab-1')).all();
    expect(doc).toBeDefined();
    expect(doc.category).toBe('lab_result');
    expect(doc.documentNumber).toBe('LAB-2026-001');
    expect(doc.isCached).toBe(false);
    expect(doc.localBlobPath).toBeNull();
  });

  test('filters health records by domain category', () => {
    const now = new Date();
    const categories: Array<LocalHealthRecord['category']> = [
      'imaging',
      'lab_results',
      'prescriptions',
      'vaccination',
      'other',
    ];

    categories.forEach((cat, idx) => {
      db.insert(localHealthRecords).values({
        id: `rec-${idx}`,
        patientId: 'patient-42',
        category: cat,
        documentTypeId: `dt-${idx}`,
        title: `Document ${cat}`,
        fileName: `${cat}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1000 + idx,
        provenance: 'patient_uploaded',
        urgency: 'routine',
        isCached: true,
        syncStatus: 'synced',
        createdAt: now,
        updatedAt: now,
      }).run();
    });

    const imagingRecords = db
      .select()
      .from(localHealthRecords)
      .where(and(eq(localHealthRecords.patientId, 'patient-42'), eq(localHealthRecords.category, 'imaging')))
      .all();
    expect(imagingRecords.length).toBe(1);
    expect(imagingRecords[0].title).toBe('Document imaging');

    const labRecords = db
      .select()
      .from(localHealthRecords)
      .where(and(eq(localHealthRecords.patientId, 'patient-42'), eq(localHealthRecords.category, 'lab_results')))
      .all();
    expect(labRecords.length).toBe(1);
    expect(labRecords[0].title).toBe('Document lab_results');
  });

  test('transitions syncStatus from queued to uploading to synced', () => {
    const now = new Date();
    db.insert(localHealthRecords).values({
      id: 'rec-sync-flow',
      patientId: 'patient-42',
      category: 'other',
      documentTypeId: 'dt-1',
      title: 'Discharge Summary',
      fileName: 'discharge.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 50000,
      syncStatus: 'queued',
      createdAt: now,
      updatedAt: now,
    }).run();

    // 1. Mark uploading
    db.update(localHealthRecords)
      .set({ syncStatus: 'uploading', updatedAt: new Date() })
      .where(eq(localHealthRecords.id, 'rec-sync-flow'))
      .run();

    let [record] = db.select().from(localHealthRecords).where(eq(localHealthRecords.id, 'rec-sync-flow')).all();
    expect(record.syncStatus).toBe('uploading');

    // 2. Mark synced with serverId and storageKey
    const syncedTime = new Date();
    db.update(localHealthRecords)
      .set({
        syncStatus: 'synced',
        serverId: 'srv-remote-record-77',
        storageKey: 'patients/patient-42/records/srv-remote-record-77.pdf',
        syncedAt: syncedTime,
        updatedAt: syncedTime,
      })
      .where(eq(localHealthRecords.id, 'rec-sync-flow'))
      .run();

    [record] = db.select().from(localHealthRecords).where(eq(localHealthRecords.id, 'rec-sync-flow')).all();
    expect(record.syncStatus).toBe('synced');
    expect(record.serverId).toBe('srv-remote-record-77');
    expect(record.storageKey).toBe('patients/patient-42/records/srv-remote-record-77.pdf');
    expect(record.syncedAt).toBeDefined();
  });

  test('transitions to failed with retryCount increment and lastSyncError on error', () => {
    const now = new Date();
    db.insert(localHealthRecords).values({
      id: 'rec-failed-flow',
      patientId: 'patient-42',
      category: 'prescriptions',
      documentTypeId: 'dt-rx',
      title: 'Prescription slip',
      fileName: 'rx.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 30000,
      syncStatus: 'uploading',
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    }).run();

    const failureTime = new Date();
    db.update(localHealthRecords)
      .set({
        syncStatus: 'failed',
        retryCount: 1,
        lastSyncError: 'HTTP 503 Service Unavailable',
        updatedAt: failureTime,
      })
      .where(eq(localHealthRecords.id, 'rec-failed-flow'))
      .run();

    const [record] = db.select().from(localHealthRecords).where(eq(localHealthRecords.id, 'rec-failed-flow')).all();
    expect(record.syncStatus).toBe('failed');
    expect(record.retryCount).toBe(1);
    expect(record.lastSyncError).toBe('HTTP 503 Service Unavailable');
  });

  test('marks document as cached when binary blob is downloaded into offline storage', () => {
    const now = new Date();
    db.insert(localHealthRecords).values({
      id: 'rec-precache',
      patientId: 'patient-42',
      category: 'imaging',
      documentTypeId: 'dt-mri',
      title: 'Knee MRI Scan',
      fileName: 'knee.dcm',
      mimeType: 'application/dicom',
      sizeBytes: 15000000,
      isCached: false,
      localBlobPath: null,
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now,
    }).run();

    // Verify initially uncached
    let [record] = db.select().from(localHealthRecords).where(eq(localHealthRecords.id, 'rec-precache')).all();
    expect(record.isCached).toBe(false);
    expect(record.localBlobPath).toBeNull();

    // Update with downloaded offline path
    const cachedPath = '/sandbox/patient-42/records/rec-precache.dcm';
    db.update(localHealthRecords)
      .set({ isCached: true, localBlobPath: cachedPath, updatedAt: new Date() })
      .where(eq(localHealthRecords.id, 'rec-precache'))
      .run();

    [record] = db.select().from(localHealthRecords).where(eq(localHealthRecords.id, 'rec-precache')).all();
    expect(record.isCached).toBe(true);
    expect(record.localBlobPath).toBe(cachedPath);
  });

  test('soft delete excludes record from active list while preserving row for audit trail', () => {
    const now = new Date();
    db.insert(localHealthRecords).values({
      id: 'rec-to-delete',
      patientId: 'patient-42',
      category: 'other',
      documentTypeId: 'dt-misc',
      title: 'Old receipt',
      fileName: 'receipt.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12000,
      syncStatus: 'synced',
      createdAt: now,
      updatedAt: now,
    }).run();

    // Soft delete
    const deleteTime = new Date();
    db.update(localHealthRecords)
      .set({ deletedAt: deleteTime, updatedAt: deleteTime })
      .where(eq(localHealthRecords.id, 'rec-to-delete'))
      .run();

    // Active queries exclude soft-deleted records
    const active = db
      .select()
      .from(localHealthRecords)
      .where(and(eq(localHealthRecords.patientId, 'patient-42'), isNull(localHealthRecords.deletedAt)))
      .all();
    expect(active.length).toBe(0);

    // Audit queries find soft-deleted records
    const deleted = db
      .select()
      .from(localHealthRecords)
      .where(and(eq(localHealthRecords.patientId, 'patient-42'), isNotNull(localHealthRecords.deletedAt)))
      .all();
    expect(deleted.length).toBe(1);
    expect(deleted[0].id).toBe('rec-to-delete');
    expect(deleted[0].deletedAt).toBeDefined();
  });
});
