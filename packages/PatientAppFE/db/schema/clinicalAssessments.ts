import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';
import { clinics } from './clinics';

// B7 — Provider-Documented Clinical Assessments (read-only for patient)
// Uses JSON blobs for type-specific score/finding fields
export const clinicalAssessments = sqliteTable('clinical_assessments', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  clinicId: text('clinic_id').references(() => clinics.id),
  assessmentType: text('assessment_type', {
    enum: [
      'OccupationalHealth',
      'PHQ9',
      'GAD7',
      'CSSRS',
      'DentalVisit',
      'EyeExam',
      'CervicalScreening',
      'BreastExam',
      'PSA',
      'TesticularExam',
    ],
  }).notNull(),
  date: text('date').notNull(), // YYYY-MM-DD
  assessedBy: text('assessed_by'),
  // JSON blobs for type-specific fields (typed at app layer per assessmentType)
  scoresJson: text('scores_json'),
  findingsJson: text('findings_json'),
  // Read-only sync metadata
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  serverCreatedAt: integer('server_created_at', { mode: 'timestamp_ms' }),
});

export type ClinicalAssessment = typeof clinicalAssessments.$inferSelect;
export type NewClinicalAssessment = typeof clinicalAssessments.$inferInsert;
