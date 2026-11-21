import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const HEALTH_RECORD_CATEGORIES = [
  'lab_result',
  'imaging',
  'prescription',
  'vaccine_card',
  'certificate',
  'other',
] as const;
export type HealthRecordCategory = (typeof HEALTH_RECORD_CATEGORIES)[number];

export const RECORD_PROVENANCES = [
  'patient_uploaded',
  'external_lab',
  'clinicez_verified',
] as const;
export type RecordProvenance = (typeof RECORD_PROVENANCES)[number];

export const CLINICAL_URGENCIES = ['routine', 'urgent', 'stat'] as const;
export type ClinicalUrgency = (typeof CLINICAL_URGENCIES)[number];

export const SYNC_STATUSES = [
  'queued',
  'syncing',
  'synced',
  'failed',
  'deleted',
] as const;
export type RecordSyncStatus = (typeof SYNC_STATUSES)[number];

export const localHealthRecords = sqliteTable(
  'local_health_records',
  {
    id: text('id').primaryKey(), // Client UUID or Server UUID
    patientId: text('patient_id').notNull(),
    category: text('category', { enum: HEALTH_RECORD_CATEGORIES }).notNull().default('other'),
    documentTypeId: text('document_type_id'),
    title: text('title').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    documentDate: text('document_date'), // YYYY-MM-DD
    facilityName: text('facility_name'),
    notes: text('notes'),
    provenance: text('provenance', { enum: RECORD_PROVENANCES }).notNull().default('patient_uploaded'),
    urgency: text('urgency', { enum: CLINICAL_URGENCIES }).notNull().default('routine'),
    localBlobPath: text('local_blob_path'), // Local sandbox URI or IndexedDB blob key
    isCached: integer('is_cached', { mode: 'boolean' }).notNull().default(false),
    syncStatus: text('sync_status', { enum: SYNC_STATUSES }).notNull().default('queued'),
    retryCount: integer('retry_count').notNull().default(0),
    lastSyncError: text('last_sync_error'),
    serverId: text('server_id'),
    storageKey: text('storage_key'), // patients/{patientId}/records/{id}.cez
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  },
  (t) => ({
    patientDateIdx: index('idx_local_health_records_patient_date').on(t.patientId, t.documentDate, t.createdAt),
    patientStatusIdx: index('idx_local_health_records_patient_status').on(t.patientId, t.syncStatus),
    patientCategoryIdx: index('idx_local_health_records_patient_category').on(t.patientId, t.category),
  })
);

export type LocalHealthRecord = typeof localHealthRecords.$inferSelect;
export type NewLocalHealthRecord = typeof localHealthRecords.$inferInsert;
