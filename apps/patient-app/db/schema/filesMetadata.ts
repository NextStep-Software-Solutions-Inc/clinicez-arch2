import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { clinics } from './clinics';
import { fileFolders } from './fileFolders';
import { documentTypes } from './documentTypes';
import { patients } from './patients';

// Files Metadata - attached clinical documents and patient-owned uploads.
export const filesMetadata = sqliteTable('files_metadata', {
  id: text('id').primaryKey(),
  patientId: text('patient_id').references(() => patients.id, { onDelete: 'cascade' }),
  clinicId: text('clinic_id').references(() => clinics.id),
  folderId: text('folder_id').references(() => fileFolders.id),
  documentTypeId: text('document_type_id').references(() => documentTypes.id).notNull(),
  name: text('name').notNull(),
  type: text('type'),
  mimeType: text('mime_type'),
  extension: text('extension'),
  sizeBytes: integer('size_bytes'),
  encryptedSizeBytes: integer('encrypted_size_bytes'),
  serverUrl: text('server_url'),
  localPath: text('local_path'),
  localEncryptedPath: text('local_encrypted_path'),
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
  encryptionAlgorithm: text('encryption_algorithm').notNull().default('AES-256-GCM'),
  encryptionKeyId: text('encryption_key_id'),
  encryptionIvBase64: text('encryption_iv_base64'),
  encryptionTagBase64: text('encryption_tag_base64'),
  encryptedHash: text('encrypted_hash'),
  serverWrappedKeyJson: text('server_wrapped_key_json'),
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
