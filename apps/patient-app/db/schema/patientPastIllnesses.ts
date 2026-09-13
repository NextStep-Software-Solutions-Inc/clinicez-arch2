import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// A7 — Past Illnesses (list)
export const patientPastIllnesses = sqliteTable('patient_past_illnesses', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  diagnosis: text('diagnosis').notNull(),
  duration: text('duration'),
  complications: text('complications'),
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export type PatientPastIllness = typeof patientPastIllnesses.$inferSelect;
export type NewPatientPastIllness = typeof patientPastIllnesses.$inferInsert;
