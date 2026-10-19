import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';
import { clinics } from './clinics';

// B6 — Provider-Administered Vaccinations (read-only for patient)
export const vaccinationsAdministered = sqliteTable('vaccinations_administered', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  clinicId: text('clinic_id').references(() => clinics.id),
  vaccineName: text('vaccine_name').notNull(),
  diseaseTargeted: text('disease_targeted'),
  doseNumber: text('dose_number'),
  dateAdministered: text('date_administered').notNull(), // YYYY-MM-DD
  lotBatchNumber: text('lot_batch_number'),
  administeredBy: text('administered_by'),
  facility: text('facility'),
  route: text('route'),
  injectionSite: text('injection_site'),
  nextDueDate: text('next_due_date'), // YYYY-MM-DD
  adverseReaction: text('adverse_reaction', {
    enum: ['None', 'Local', 'Systemic', 'Severe'],
  }),
  adverseReactionDescription: text('adverse_reaction_description'),
  vaccineProgram: text('vaccine_program', {
    enum: ['DOH_EPI', 'Private', 'Travel', 'Occupational', 'Other'],
  }),
  // Read-only sync metadata
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  serverCreatedAt: integer('server_created_at', { mode: 'timestamp_ms' }),
});

export type VaccinationAdministered = typeof vaccinationsAdministered.$inferSelect;
export type NewVaccinationAdministered = typeof vaccinationsAdministered.$inferInsert;
