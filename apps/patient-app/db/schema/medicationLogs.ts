import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';
import { patientMedications } from './patientMedications';

export const patientHomeCache = sqliteTable('patient_home_cache', {
  patientId: text('patient_id')
    .primaryKey()
    .references(() => patients.id, { onDelete: 'cascade' }),
  clinicEzId: text('clinic_ez_id'),
  welcomeVisitedStepsJson: text('welcome_visited_steps_json').notNull().default('[]'),
  checkedInAppointmentsJson: text('checked_in_appointments_json').notNull().default('{}'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export type PatientHomeCache = typeof patientHomeCache.$inferSelect;
export type NewPatientHomeCache = typeof patientHomeCache.$inferInsert;

export const patientVitalTelemetry = sqliteTable('patient_vital_telemetry', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  recordedAt: text('recorded_at').notNull(), // ISO-8601 datetime string
  heartRateBpm: integer('heart_rate_bpm'),
  bpSystolic: integer('bp_systolic'),
  bpDiastolic: integer('bp_diastolic'),
  fastingBloodGlucose: real('fasting_blood_glucose'),
  sleepDurationMinutes: integer('sleep_duration_minutes'),
  deepSleepMinutes: integer('deep_sleep_minutes'),
  source: text('source'),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
});

export type PatientVitalTelemetry = typeof patientVitalTelemetry.$inferSelect;
export type NewPatientVitalTelemetry = typeof patientVitalTelemetry.$inferInsert;

export const patientMedicationLogs = sqliteTable('patient_medication_logs', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  medicationId: text('medication_id')
    .notNull()
    .references(() => patientMedications.id, { onDelete: 'cascade' }),
  logDate: text('log_date').notNull(), // YYYY-MM-DD
  scheduledTimeLabel: text('scheduled_time_label').notNull().default('8:00 AM'),
  takenAt: text('taken_at').notNull(), // ISO-8601 datetime string
  notes: text('notes'),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
});

export type PatientMedicationLog = typeof patientMedicationLogs.$inferSelect;
export type NewPatientMedicationLog = typeof patientMedicationLogs.$inferInsert;
