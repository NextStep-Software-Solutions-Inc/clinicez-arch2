import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';
import { clinics } from './clinics';
import { filesMetadata } from './filesMetadata';

// B4 — Laboratory & Diagnostic Results (read-only for patient)
export const labResults = sqliteTable('lab_results', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  clinicId: text('clinic_id').references(() => clinics.id),
  testName: text('test_name').notNull(),
  componentParameter: text('component_parameter'),
  resultValue: text('result_value'),
  unit: text('unit'),
  referenceRange: text('reference_range'),
  flag: text('flag', { enum: ['Normal', 'High', 'Low', 'Critical'] }),
  dateOrdered: text('date_ordered'),   // YYYY-MM-DD
  dateResulted: text('date_resulted'), // YYYY-MM-DD
  orderingPhysician: text('ordering_physician'),
  laboratory: text('laboratory'),
  fileAttachmentId: text('file_attachment_id').references(() => filesMetadata.id),
  // Read-only sync metadata
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  serverCreatedAt: integer('server_created_at', { mode: 'timestamp_ms' }),
});

export type LabResult = typeof labResults.$inferSelect;
export type NewLabResult = typeof labResults.$inferInsert;
