import { integer, sqliteTable, text, real } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';
import { clinics } from './clinics';

// B3 — Prescriptions (doctor-entered, read-only for patient)
export const prescriptions = sqliteTable('prescriptions', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  clinicId: text('clinic_id').references(() => clinics.id),
  drugName: text('drug_name').notNull(),
  genericName: text('generic_name'),
  dosage: text('dosage'),
  dosageForm: text('dosage_form'),
  frequency: text('frequency'),
  route: text('route'),
  duration: text('duration'),
  indication: text('indication'),
  startDate: text('start_date'),   // YYYY-MM-DD
  endDate: text('end_date'),       // YYYY-MM-DD
  prescribingPhysician: text('prescribing_physician'),
  refillsAllowed: integer('refills_allowed'),
  specialInstructions: text('special_instructions'),
  // PhilHealth GAMOT benefit fields
  isPhilHealthGamot: integer('is_philhealth_gamot', { mode: 'boolean' }).default(false),
  philHealthDrugCode: text('philhealth_drug_code'),
  uniquePrescriptionSecurityCode: text('unique_prescription_security_code'),
  gamotCoverageAmount: real('gamot_coverage_amount'),
  // Read-only sync metadata
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  serverCreatedAt: integer('server_created_at', { mode: 'timestamp_ms' }),
});

export type Prescription = typeof prescriptions.$inferSelect;
export type NewPrescription = typeof prescriptions.$inferInsert;
