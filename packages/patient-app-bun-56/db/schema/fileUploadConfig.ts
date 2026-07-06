import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

export const fileUploadConfig = sqliteTable('file_upload_config', {
  patientId: text('patient_id')
    .primaryKey()
    .references(() => patients.id, { onDelete: 'cascade' }),
  maxFileSizeBytes: integer('max_file_size_bytes').notNull(),
  quotaBytes: integer('quota_bytes').notNull(),
  usedStorageBytes: integer('used_storage_bytes').notNull().default(0),
  nativePreviewExtensionsJson: text('native_preview_extensions_json').notNull().default('[]'),
  configVersion: text('config_version').notNull().default('local-defaults'),
  encryptedMak: text('encrypted_mak'),
  fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull(),
  serverUpdatedAt: integer('server_updated_at', { mode: 'timestamp_ms' }),
});

export type FileUploadConfig = typeof fileUploadConfig.$inferSelect;
export type NewFileUploadConfig = typeof fileUploadConfig.$inferInsert;
