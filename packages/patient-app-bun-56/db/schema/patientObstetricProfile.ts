import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// A12 — Obstetric Profile (singleton, female only)
export const patientObstetricProfile = sqliteTable('patient_obstetric_profile', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .unique()
    .references(() => patients.id, { onDelete: 'cascade' }),
  // Menstrual profile
  ageAtMenarche: integer('age_at_menarche'),
  cycleLength: integer('cycle_length'),       // days
  cycleDuration: integer('cycle_duration'),   // days of bleeding
  regularity: text('regularity', { enum: ['Regular', 'Irregular'] }),
  dysmenorrheaSeverity: text('dysmenorrhea_severity', {
    enum: ['None', 'Mild', 'Moderate', 'Severe'],
  }),
  menopausalStatus: text('menopausal_status', {
    enum: ['PreMenopausal', 'Peri', 'PostMenopausal', 'NA'],
  }),
  ageAtMenopause: integer('age_at_menopause'),
  // Obstetric summary (GPAL)
  gravida: integer('gravida'),
  para: integer('para'),
  abortion: integer('abortion'),
  livingChildren: integer('living_children'),
  lmp: text('lmp'), // YYYY-MM-DD last menstrual period
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
});

export type PatientObstetricProfile = typeof patientObstetricProfile.$inferSelect;
export type NewPatientObstetricProfile = typeof patientObstetricProfile.$inferInsert;
