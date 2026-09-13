import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// A14 — Dental & Vision (singleton per patient)
export const patientDentalVision = sqliteTable('patient_dental_vision', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .unique()
    .references(() => patients.id, { onDelete: 'cascade' }),
  // Dental
  dentistName: text('dentist_name'),
  dentistClinic: text('dentist_clinic'),
  orthodonticDevice: text('orthodontic_device'),
  // Vision
  eyeDoctorName: text('eye_doctor_name'),
  correctiveLenses: text('corrective_lenses', {
    enum: ['None', 'Glasses', 'Contacts', 'Both'],
  }),
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
});

export type PatientDentalVision = typeof patientDentalVision.$inferSelect;
export type NewPatientDentalVision = typeof patientDentalVision.$inferInsert;
