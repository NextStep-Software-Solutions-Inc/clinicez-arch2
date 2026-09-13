import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// A7 — Surgical History (list)
export const patientSurgicalHistory = sqliteTable('patient_surgical_history', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  procedure: text('procedure').notNull(),
  surgeon: text('surgeon'),
  facility: text('facility'),
  date: text('date'), // YYYY-MM-DD
  anesthesiaType: text('anesthesia_type'),
  complications: text('complications'),
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export type PatientSurgicalHistoryRecord = typeof patientSurgicalHistory.$inferSelect;
export type NewPatientSurgicalHistoryRecord = typeof patientSurgicalHistory.$inferInsert;
