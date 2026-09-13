import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';
import { clinics } from './clinics';

// B2 — Clinical Consultations (HCW-entered, read-only for patient)
export const consultations = sqliteTable('consultations', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  clinicId: text('clinic_id').references(() => clinics.id),
  visitDate: text('visit_date').notNull(), // YYYY-MM-DD
  visitType: text('visit_type', {
    enum: ['WalkIn', 'Scheduled', 'Telehealth', 'ER', 'FollowUp'],
  }),
  clinicName: text('clinic_name'),
  doctorName: text('doctor_name'),
  doctorSpecialty: text('doctor_specialty'),
  chiefComplaint: text('chief_complaint'),
  primaryDiagnosis: text('primary_diagnosis'),
  icd10Code: text('icd10_code'),
  secondaryDiagnoses: text('secondary_diagnoses'),
  soapNotes: text('soap_notes'),
  treatmentPlan: text('treatment_plan'),
  followUpInstructions: text('follow_up_instructions'),
  followUpDate: text('follow_up_date'), // YYYY-MM-DD
  referralIssued: text('referral_issued'),
  // Read-only sync metadata
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  serverCreatedAt: integer('server_created_at', { mode: 'timestamp_ms' }),
});

export type Consultation = typeof consultations.$inferSelect;
export type NewConsultation = typeof consultations.$inferInsert;
