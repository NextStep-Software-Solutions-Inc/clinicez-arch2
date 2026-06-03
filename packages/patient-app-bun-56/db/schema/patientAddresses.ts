import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// A4 — Addresses (list — primary + secondary)
export const patientAddresses = sqliteTable('patient_addresses', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['primary', 'secondary'] }).notNull().default('primary'),
  houseStreet: text('house_street'),
  barangay: text('barangay'),
  cityMunicipality: text('city_municipality'),
  province: text('province'),
  region: text('region'),
  zipCode: text('zip_code'),
  country: text('country').default('Philippines'),
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export type PatientAddress = typeof patientAddresses.$inferSelect;
export type NewPatientAddress = typeof patientAddresses.$inferInsert;
