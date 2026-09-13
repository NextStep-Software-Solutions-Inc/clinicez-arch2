import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// A6 — Healthcare Providers (list)
export const patientHealthcareProviders = sqliteTable('patient_healthcare_providers', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  providerType: text('provider_type', {
    enum: ['primary_care', 'specialist_1', 'specialist_2'],
  }).notNull(),
  name: text('name'),
  specialty: text('specialty'),
  clinicHospital: text('clinic_hospital'),
  phone: text('phone'),
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export type PatientHealthcareProvider = typeof patientHealthcareProviders.$inferSelect;
export type NewPatientHealthcareProvider = typeof patientHealthcareProviders.$inferInsert;
