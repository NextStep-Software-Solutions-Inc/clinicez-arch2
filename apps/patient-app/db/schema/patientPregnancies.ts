import { integer, sqliteTable, text, real } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// A12 — Past Pregnancies (list)
export const patientPregnancies = sqliteTable('patient_pregnancies', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  year: integer('year'),
  outcome: text('outcome'),
  gestationalAgeWeeks: integer('gestational_age_weeks'),
  deliveryType: text('delivery_type'),
  birthWeightKg: real('birth_weight_kg'),
  complications: text('complications'),
  facility: text('facility'),
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export type PatientPregnancy = typeof patientPregnancies.$inferSelect;
export type NewPatientPregnancy = typeof patientPregnancies.$inferInsert;
