import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// A12 — Contraceptive History (list)
export const patientContraceptiveHistory = sqliteTable('patient_contraceptive_history', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  method: text('method').notNull(),
  isCurrent: integer('is_current', { mode: 'boolean' }).notNull().default(false),
  dateStarted: text('date_started'), // YYYY-MM-DD
  reasonForStopping: text('reason_for_stopping'),
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export type PatientContraceptiveRecord = typeof patientContraceptiveHistory.$inferSelect;
export type NewPatientContraceptiveRecord = typeof patientContraceptiveHistory.$inferInsert;
