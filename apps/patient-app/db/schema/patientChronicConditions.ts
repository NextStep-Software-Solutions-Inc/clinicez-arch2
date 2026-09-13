import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// A7 — Chronic Conditions (list)
export const patientChronicConditions = sqliteTable('patient_chronic_conditions', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  diagnosis: text('diagnosis').notNull(),
  controlStatus: text('control_status'),
  monitoringFrequency: text('monitoring_frequency'),
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export type PatientChronicCondition = typeof patientChronicConditions.$inferSelect;
export type NewPatientChronicCondition = typeof patientChronicConditions.$inferInsert;
