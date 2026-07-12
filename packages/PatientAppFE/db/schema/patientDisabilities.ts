import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// A7 — Disabilities (list)
export const patientDisabilities = sqliteTable('patient_disabilities', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  bodyPart: text('body_part'),
  classification: text('classification'),
  isPwdCertified: integer('is_pwd_certified', { mode: 'boolean' }).default(false),
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export type PatientDisability = typeof patientDisabilities.$inferSelect;
export type NewPatientDisability = typeof patientDisabilities.$inferInsert;
