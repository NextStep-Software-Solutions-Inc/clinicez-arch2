import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';
import { clinics } from './clinics';
import { organizations } from './organizations';

export const bookingDrafts = sqliteTable('booking_drafts', {
    id: text('id').primaryKey(),
    patientId: text('patient_id')
        .notNull()
        .references(() => patients.id, { onDelete: 'cascade' }),
    clinicId: text('clinic_id')
        .notNull()
        .references(() => clinics.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
    preferredDate: text('preferred_date'),
    preferredTime: text('preferred_time'),
    reason: text('reason'),
    notes: text('notes'),
    shareFieldsJson: text('share_fields_json').notNull().default('[]'),
    /** JSON array of record-section scope names (PascalCase, never Demographics) sent with the booking */
    shareSectionsJson: text('share_sections_json').notNull().default('[]'),
    attachedFileIdsJson: text('attached_file_ids_json').notNull().default('[]'),
    status: text('status', { enum: ['draft', 'ready'] }).notNull().default('draft'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
});

export type BookingDraft = typeof bookingDrafts.$inferSelect;
export type NewBookingDraft = typeof bookingDrafts.$inferInsert;
