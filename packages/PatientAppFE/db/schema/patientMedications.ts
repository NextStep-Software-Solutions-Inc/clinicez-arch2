import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// A7 — Current Medications (list)
export const patientMedications = sqliteTable('patient_medications', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  drugName: text('drug_name').notNull(),
  dosage: text('dosage'),
  dosageForm: text('dosage_form'),
  frequency: text('frequency'),
  prescribingPhysician: text('prescribing_physician'),
  startDate: text('start_date'), // YYYY-MM-DD
  indication: text('indication'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export type PatientMedication = typeof patientMedications.$inferSelect;
export type NewPatientMedication = typeof patientMedications.$inferInsert;
