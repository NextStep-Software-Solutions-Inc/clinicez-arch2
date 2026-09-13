import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// A15 — Mental Health Profile (singleton per patient)
export const patientMentalHealthProfile = sqliteTable('patient_mental_health_profile', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .unique()
    .references(() => patients.id, { onDelete: 'cascade' }),
  hasPriorDiagnosis: integer('has_prior_diagnosis', { mode: 'boolean' }).default(false),
  providerName: text('provider_name'),
  providerSpecialty: text('provider_specialty'),
  providerClinic: text('provider_clinic'),
  psychotherapyStatus: text('psychotherapy_status', {
    enum: ['Active', 'Inactive', 'None'],
  }),
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
});

export type PatientMentalHealthProfile = typeof patientMentalHealthProfile.$inferSelect;
export type NewPatientMentalHealthProfile = typeof patientMentalHealthProfile.$inferInsert;
