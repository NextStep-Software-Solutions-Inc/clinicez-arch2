import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// A9 — Family History (list)
export const patientFamilyHistory = sqliteTable('patient_family_history', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  condition: text('condition').notNull(),
  affectedRelative: text('affected_relative'),
  side: text('side', { enum: ['Paternal', 'Maternal', 'Both', 'Unknown'] }),
  ageOfOnset: integer('age_of_onset'),
  isDeceased: integer('is_deceased', { mode: 'boolean' }).default(false),
  ageAtDeath: integer('age_at_death'),
  causeOfDeath: text('cause_of_death'),
  notes: text('notes'),
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export type PatientFamilyHistoryRecord = typeof patientFamilyHistory.$inferSelect;
export type NewPatientFamilyHistoryRecord = typeof patientFamilyHistory.$inferInsert;
