import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

export const fileFolders = sqliteTable('file_folders', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  parentId: text('parent_id'),
  name: text('name').notNull(),
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
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  serverUpdatedAt: integer('server_updated_at', { mode: 'timestamp_ms' }),
});

export type FileFolder = typeof fileFolders.$inferSelect;
export type NewFileFolder = typeof fileFolders.$inferInsert;
