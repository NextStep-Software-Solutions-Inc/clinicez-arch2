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
  regionPsgc: text('region_psgc'),
  provincePsgc: text('province_psgc'),
  cityMunicipalityPsgc: text('city_municipality_psgc'),
  barangayPsgc: text('barangay_psgc'),
  regionName: text('region_name'),
  provinceName: text('province_name'),
  cityMunicipalityName: text('city_municipality_name'),
  barangayName: text('barangay_name'),
  isSameAsPermanent: integer('is_same_as_permanent', { mode: 'boolean' }).default(false),
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export type PatientAddress = typeof patientAddresses.$inferSelect;
export type NewPatientAddress = typeof patientAddresses.$inferInsert;
