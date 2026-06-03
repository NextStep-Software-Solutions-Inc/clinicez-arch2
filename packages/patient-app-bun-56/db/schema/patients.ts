import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const patients = sqliteTable('patients', {
  id: text('id').primaryKey(),
  clerkUserId: text('clerk_user_id').unique(),
  // A1 — Personal Demographics
  firstName: text('first_name').notNull(),
  middleName: text('middle_name'),
  lastName: text('last_name').notNull(),
  suffix: text('suffix'),
  sex: text('sex', { enum: ['Male', 'Female', 'Other'] }),
  dob: text('dob'), // YYYY-MM-DD
  placeOfBirth: text('place_of_birth'),
  civilStatus: text('civil_status', {
    enum: ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'],
  }),
  bloodType: text('blood_type', {
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'],
  }),
  nationality: text('nationality').default('Filipino'),
  ethnicity: text('ethnicity'),
  religion: text('religion'),
  primaryLanguage: text('primary_language'),
  educationLevel: text('education_level', {
    enum: ['None', 'Elementary', 'HighSchool', 'Vocational', 'College', 'Graduate', 'PostGraduate'],
  }),
  avatarUrl: text('avatar_url'),
  // A3 — Contact Information (flattened onto patient row)
  mobile: text('mobile'),
  altPhone: text('alt_phone'),
  email: text('email'),
  messengerHandle: text('messenger_handle'),
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
});

export type Patient = typeof patients.$inferSelect;
export type NewPatient = typeof patients.$inferInsert;
