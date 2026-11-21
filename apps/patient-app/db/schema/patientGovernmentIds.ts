import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// A2 — Government & Insurance IDs (singleton per patient)
export const patientGovernmentIds = sqliteTable('patient_government_ids', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .unique()
    .references(() => patients.id, { onDelete: 'cascade' }),
  // PhilHealth
  philhealthId: text('philhealth_id'),
  philhealthCategory: text('philhealth_category'),
  sponsorPin: text('sponsor_pin'),
  sponsorLastName: text('sponsor_last_name'),
  sponsorFirstName: text('sponsor_first_name'),
  sponsorMiddleName: text('sponsor_middle_name'),
  sponsorSuffix: text('sponsor_suffix'),
  sponsorDob: text('sponsor_dob'),
  sponsorRelationship: text('sponsor_relationship'),
  // Other government IDs
  sssNumber: text('sss_number'),
  gsisNumber: text('gsis_number'),
  pagibigId: text('pagibig_id'),
  tin: text('tin'),
  seniorCitizenId: text('senior_citizen_id'),
  // PWD
  isPwd: integer('is_pwd', { mode: 'boolean' }).default(false),
  pwdIdNumber: text('pwd_id_number'),
  disabilityType: text('disability_type'),
  // HMO
  hmoProvider: text('hmo_provider'),
  hmoPolicyNumber: text('hmo_policy_number'),
  hmoPlanType: text('hmo_plan_type'),
  hmoCoverageStart: text('hmo_coverage_start'), // YYYY-MM-DD
  hmoCoverageEnd: text('hmo_coverage_end'),     // YYYY-MM-DD
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
});

export type PatientGovernmentIds = typeof patientGovernmentIds.$inferSelect;
export type NewPatientGovernmentIds = typeof patientGovernmentIds.$inferInsert;
