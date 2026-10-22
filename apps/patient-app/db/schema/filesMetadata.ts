import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { clinics } from './clinics';
import { documentTypes } from './documentTypes';
import { patients } from './patients';

// Files Metadata - attached clinical documents and patient-owned uploads.
export const filesMetadata = sqliteTable('files_metadata', {
  id: text('id').primaryKey(),
  patientId: text('patient_id').references(() => patients.id, { onDelete: 'cascade' }),
  clinicId: text('clinic_id').references(() => clinics.id),
  documentTypeId: text('document_type_id').references(() => documentTypes.id).notNull(),
  name: text('name').notNull(),
  title: text('title'),
  type: text('type'),
  mimeType: text('mime_type'),
  extension: text('extension'),
  sizeBytes: integer('size_bytes'),
  documentDate: text('document_date'),
  facilityName: text('facility_name'),
  notes: text('notes'),
  serverUrl: text('server_url'),
  localPath: text('local_path'),
  isCached: integer('is_cached', { mode: 'boolean' }).notNull().default(false),
  cloudObjectKey: text('cloud_object_key'),
  syncStatus: text('sync_status', {
    enum: ['local', 'queued', 'syncing', 'synced', 'failed', 'deleted'],
  })
    .notNull()
    .default('local'),
  syncOperation: text('sync_operation', {
    enum: ['insert', 'update', 'delete'],
  })
    .notNull()
    .default('insert'),
  syncError: text('sync_error'),
  lastSyncError: text('last_sync_error'),
  retryCount: integer('retry_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  serverCreatedAt: integer('server_created_at', { mode: 'timestamp_ms' }),
  serverUpdatedAt: integer('server_updated_at', { mode: 'timestamp_ms' }),
});

export type FileMetadata = typeof filesMetadata.$inferSelect;
export type NewFileMetadata = typeof filesMetadata.$inferInsert;
