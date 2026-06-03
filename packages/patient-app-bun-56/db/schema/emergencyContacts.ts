import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';

// A5 — Emergency Contacts (list, max 2)
export const emergencyContacts = sqliteTable('emergency_contacts', {
  id: text('id').primaryKey(),
  patientId: text('patient_id')
    .notNull()
    .references(() => patients.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(1),
  name: text('name').notNull(),
  relationship: text('relationship'),
  phone: text('phone').notNull(),
  altPhone: text('alt_phone'),
  email: text('email'),
  address: text('address'),
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
  serverId: text('server_id'),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
});

export type EmergencyContact = typeof emergencyContacts.$inferSelect;
export type NewEmergencyContact = typeof emergencyContacts.$inferInsert;
