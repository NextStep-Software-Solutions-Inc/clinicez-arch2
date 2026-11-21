import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// A7 — Allergies (list)
export const patientAllergies = sqliteTable('patient_allergies', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  allergen: text('allergen').notNull(),
  reactionType: text('reaction_type'),
  severity: text('severity'),
  management: text('management'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export type PatientAllergy = typeof patientAllergies.$inferSelect;
export type NewPatientAllergy = typeof patientAllergies.$inferInsert;
