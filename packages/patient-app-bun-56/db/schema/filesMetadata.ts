import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { clinics } from './clinics';

// Files Metadata — attached documents (lab PDFs, images, etc.)
export const filesMetadata = sqliteTable('files_metadata', {
  id: text('id').primaryKey(),
  clinicId: text('clinic_id')
    .notNull()
    .references(() => clinics.id),
  name: text('name').notNull(),
  type: text('type'),
  sizeBytes: integer('size_bytes'),
  serverUrl: text('server_url'),
  localPath: text('local_path'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  serverCreatedAt: integer('server_created_at', { mode: 'timestamp_ms' }),
});

export type FileMetadata = typeof filesMetadata.$inferSelect;
export type NewFileMetadata = typeof filesMetadata.$inferInsert;
