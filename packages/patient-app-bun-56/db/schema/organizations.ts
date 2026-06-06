import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const organizations = sqliteTable('organizations', {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    logoUrl: text('logo_url'),
    addressHint: text('address_hint'),
    isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(true),
    inviteCode: text('invite_code'),
    privacyPolicyUrl: text('privacy_policy_url').notNull(),
    termsAndConditionsUrl: text('terms_and_conditions_url').notNull(),
    rolesJson: text('roles_json').notNull(),
    requiredShareFieldsJson: text('required_share_fields_json').notNull(),
    featuredScore: integer('featured_score').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    syncedAt: integer('synced_at', { mode: 'timestamp_ms' }),
    serverId: text('server_id'),
});

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
