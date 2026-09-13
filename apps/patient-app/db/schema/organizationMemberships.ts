import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { patients } from './patients';
import { organizations } from './organizations';

export const organizationMemberships = sqliteTable('organization_memberships', {
    id: text('id').primaryKey(),
    patientId: text('patient_id')
        .notNull()
        .references(() => patients.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
        .notNull()
        .references(() => organizations.id, { onDelete: 'cascade' }),
    roleId: text('role_id').notNull(),
    roleName: text('role_name').notNull(),
    status: text('status', { enum: ['pending', 'active'] }).notNull().default('active'),
    consentPrivacyPolicy: integer('consent_privacy_policy', { mode: 'boolean' }).notNull().default(false),
    consentTermsAndConditions: integer('consent_terms_and_conditions', { mode: 'boolean' }).notNull().default(false),
    consentDataSharing: integer('consent_data_sharing', { mode: 'boolean' }).notNull().default(false),
    consentedAt: integer('consented_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
    serverId: text('server_id'),
});

export type OrganizationMembership = typeof organizationMemberships.$inferSelect;
export type NewOrganizationMembership = typeof organizationMemberships.$inferInsert;
