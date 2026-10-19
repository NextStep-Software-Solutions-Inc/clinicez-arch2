import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Incremental pull cursor per patient for `GET /patients/{id}/sync/changes?since=`
export const syncCursors = sqliteTable('sync_cursors', {
  patientId: text('patient_id').primaryKey(),
  cursor: text('cursor').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export type SyncCursor = typeof syncCursors.$inferSelect;
