import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Clinics — registered clinics the patient belongs to
export const clinics = sqliteTable('clinics', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  description: text('description'),
  logoUrl: text('logo_url'),
  coverImageUrl: text('cover_image_url'),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(true),
  supportsAppointments: integer('supports_appointments', { mode: 'boolean' }).notNull().default(true),
  inviteCode: text('invite_code'),
  privacyPolicyUrl: text('privacy_policy_url'),
  termsAndConditionsUrl: text('terms_and_conditions_url'),
  specialtiesJson: text('specialties_json').notNull().default('[]'),
  requiredShareFieldsJson: text('required_share_fields_json').notNull().default('[]'),
  activeMemberCount: integer('active_member_count').notNull().default(0),
  joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
});

export type Clinic = typeof clinics.$inferSelect;
export type NewClinic = typeof clinics.$inferInsert;
