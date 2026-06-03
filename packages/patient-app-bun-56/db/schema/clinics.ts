import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Clinics — registered clinics the patient belongs to
export const clinics = sqliteTable('clinics', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  baseUrl: text('base_url').notNull(),
  inviteCode: text('invite_code'),
  joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
});

export type Clinic = typeof clinics.$inferSelect;
export type NewClinic = typeof clinics.$inferInsert;
