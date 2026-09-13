import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// A10 — Occupation (singleton per patient)
export const patientOccupation = sqliteTable('patient_occupation', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .unique()
    .references(() => patients.id, { onDelete: 'cascade' }),
  occupation: text('occupation'),
  employer: text('employer'),
  industry: text('industry'),
  workEnvironment: text('work_environment', {
    enum: ['Office', 'Field', 'Factory', 'Healthcare', 'Agriculture', 'Other'],
  }),
  yearsInOccupation: integer('years_in_occupation'),
  hazardExposure: text('hazard_exposure'),
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
});

export type PatientOccupation = typeof patientOccupation.$inferSelect;
export type NewPatientOccupation = typeof patientOccupation.$inferInsert;
