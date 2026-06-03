import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// A7 — Self-Reported Immunizations (list)
export const patientImmunizationsSelf = sqliteTable('patient_immunizations_self', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  vaccineName: text('vaccine_name').notNull(),
  doseNumber: text('dose_number'),
  lotNumber: text('lot_number'),
  date: text('date'), // YYYY-MM-DD
  administeredBy: text('administered_by'),
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export type PatientImmunizationSelf = typeof patientImmunizationsSelf.$inferSelect;
export type NewPatientImmunizationSelf = typeof patientImmunizationsSelf.$inferInsert;
