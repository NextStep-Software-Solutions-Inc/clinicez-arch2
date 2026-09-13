import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';
import { clinics } from './clinics';
import { filesMetadata } from './filesMetadata';

// B5 — Imaging & Radiology Results (read-only for patient)
export const imagingResults = sqliteTable('imaging_results', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  clinicId: text('clinic_id').references(() => clinics.id),
  imagingType: text('imaging_type', {
    enum: ['XRay', 'Ultrasound', 'CT', 'MRI', 'ECG', 'Echo', 'Mammogram', 'Other'],
  }).notNull(),
  bodyPart: text('body_part'),
  examDate: text('exam_date').notNull(), // YYYY-MM-DD
  orderingPhysician: text('ordering_physician'),
  radiologist: text('radiologist'),
  findings: text('findings'),
  impression: text('impression'),
  recommendation: text('recommendation'),
  fileAttachmentId: text('file_attachment_id').references(() => filesMetadata.id),
  // Read-only sync metadata
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  serverCreatedAt: integer('server_created_at', { mode: 'timestamp_ms' }),
});

export type ImagingResult = typeof imagingResults.$inferSelect;
export type NewImagingResult = typeof imagingResults.$inferInsert;
