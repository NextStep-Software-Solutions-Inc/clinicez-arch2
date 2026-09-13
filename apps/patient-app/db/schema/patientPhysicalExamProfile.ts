import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';
import { clinics } from './clinics';

// PhilHealth YAKAP/eKonsulta — Physical Examination (per-visit, HCW-entered, read-only for patient)
// Maps to: PEGENSURVEY, PESPECIFIC, and PEMISCS elements in KonsultaData DTD.
export const patientPhysicalExamProfile = sqliteTable('patient_physical_exam_profile', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  clinicId: text('clinic_id').references(() => clinics.id),
  examDate: text('exam_date').notNull(), // YYYY-MM-DD

  // PEGENSURVEY — General Survey
  genSurveyId: text('gen_survey_id'),
  genSurveyRem: text('gen_survey_rem'),

  // PESPECIFIC — System-specific findings (free-text remarks)
  skinRem: text('skin_rem'),
  heentRem: text('heent_rem'),
  chestRem: text('chest_rem'),
  heartRem: text('heart_rem'),
  abdomenRem: text('abdomen_rem'),
  neuroRem: text('neuro_rem'),
  rectalRem: text('rectal_rem'),
  guRem: text('gu_rem'),

  // PEMISCS — coded finding IDs (space-separated code strings matching PhilHealth lookup)
  skinId: text('skin_id'),
  heentId: text('heent_id'),
  chestId: text('chest_id'),
  heartId: text('heart_id'),
  abdomenId: text('abdomen_id'),
  neuroId: text('neuro_id'),
  guId: text('gu_id'),
  rectalId: text('rectal_id'),

  // Read-only sync metadata
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  serverCreatedAt: integer('server_created_at', { mode: 'timestamp_ms' }),
});

export type PatientPhysicalExamProfile = typeof patientPhysicalExamProfile.$inferSelect;
export type NewPatientPhysicalExamProfile = typeof patientPhysicalExamProfile.$inferInsert;
