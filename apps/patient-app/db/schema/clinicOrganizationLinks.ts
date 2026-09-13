import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { clinics } from './clinics';
import { organizations } from './organizations';

export const clinicOrganizationLinks = sqliteTable('clinic_organization_links', {
    id: text('id').primaryKey(),
    clinicId: text('clinic_id')
        .notNull()
        .references(() => clinics.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
    relationType: text('relation_type', { enum: ['partnered', 'sponsored', 'referral'] }).notNull().default('partnered'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
});

export type ClinicOrganizationLink = typeof clinicOrganizationLinks.$inferSelect;
export type NewClinicOrganizationLink = typeof clinicOrganizationLinks.$inferInsert;
