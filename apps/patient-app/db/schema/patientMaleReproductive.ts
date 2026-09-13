import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// A13 — Male Reproductive (singleton, male only)
export const patientMaleReproductive = sqliteTable('patient_male_reproductive', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .unique()
    .references(() => patients.id, { onDelete: 'cascade' }),
  hasVasectomy: integer('has_vasectomy', { mode: 'boolean' }).default(false),
  vasectomyDate: text('vasectomy_date'), // YYYY-MM-DD
  conditions: text('conditions'),
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
});

export type PatientMaleReproductive = typeof patientMaleReproductive.$inferSelect;
export type NewPatientMaleReproductive = typeof patientMaleReproductive.$inferInsert;
