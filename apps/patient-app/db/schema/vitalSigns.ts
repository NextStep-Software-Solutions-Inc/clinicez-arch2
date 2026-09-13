import { integer, sqliteTable, text, real } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';
import { clinics } from './clinics';

// B1 — Vital Signs (HCW-entered, read-only for patient)
export const vitalSigns = sqliteTable('vital_signs', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  clinicId: text('clinic_id').references(() => clinics.id),
  measuredAt: text('measured_at').notNull(), // ISO datetime string
  heightCm: real('height_cm'),
  weightKg: real('weight_kg'),
  bmi: real('bmi'),
  temperatureCelsius: real('temperature_celsius'),
  bpSystolic: integer('bp_systolic'),
  bpDiastolic: integer('bp_diastolic'),
  heartRateBpm: integer('heart_rate_bpm'),
  respiratoryRate: integer('respiratory_rate'),
  spO2Percent: real('spo2_percent'),
  fastingBloodGlucose: real('fasting_blood_glucose'),
  waistCm: real('waist_cm'),
  hipCm: real('hip_cm'),
  headCircumferenceCm: real('head_circumference_cm'),
  // PhilHealth YAKAP/eKonsulta — PEPERT additional fields
  zScore: real('z_score'),
  leftVisionAcuity: text('left_vision_acuity'),
  rightVisionAcuity: text('right_vision_acuity'),
  bodyLengthCm: real('body_length_cm'),        // lying length (infants)
  skinfoldThicknessMm: real('skinfold_thickness_mm'),
  midUpperArmCircCm: real('mid_upper_arm_circ_cm'),
  limbMeasurements: text('limb_measurements'), // JSON string of limb values
  takenBy: text('taken_by'),
  facility: text('facility'),
  // Read-only sync metadata (no updatedAt)
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  serverCreatedAt: integer('server_created_at', { mode: 'timestamp_ms' }),
});

export type VitalSign = typeof vitalSigns.$inferSelect;
export type NewVitalSign = typeof vitalSigns.$inferInsert;
