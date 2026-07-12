import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// A11 — Travel History (list)
export const patientTravelHistory = sqliteTable('patient_travel_history', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  destination: text('destination').notNull(),
  cityProvince: text('city_province'),
  departureDate: text('departure_date'), // YYYY-MM-DD
  returnDate: text('return_date'),       // YYYY-MM-DD
  purpose: text('purpose', {
    enum: ['Leisure', 'Business', 'OFW', 'MedicalTourism', 'Other'],
  }),
  illnessDuringAfterTravel: text('illness_during_after_travel'),
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export type PatientTravelHistoryRecord = typeof patientTravelHistory.$inferSelect;
export type NewPatientTravelHistoryRecord = typeof patientTravelHistory.$inferInsert;
