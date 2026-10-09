import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Document inbox — lab request slips issued by facilities (read-only, upserted from sync/changes)
export const inboxLabRequests = sqliteTable(
  'inbox_lab_requests',
  {
    id: text('id').primaryKey(),
    patientId: text('patient_id').notNull(),
    requisitionId: text('requisition_id').notNull(),
    orderingTenantId: text('ordering_tenant_id').notNull(),
    orderingFacilityId: text('ordering_facility_id').notNull(),
    orderingFacilityName: text('ordering_facility_name'),
    accessionNumber: text('accession_number'),
    title: text('title').notNull(),
    urgency: text('urgency'),
    /** JSON-encoded `{ code, name, category }[]` */
    itemsJson: text('items_json').notNull().default('[]'),
    stage: text('stage').notNull(),
    quotedAmount: real('quoted_amount'),
    currency: text('currency'),
    paymentRequired: integer('payment_required', { mode: 'boolean' }).notNull().default(false),
    paymentStatus: text('payment_status').notNull().default('none'),
    laboratoryName: text('laboratory_name'),
    claimToken: text('claim_token'),
    reason: text('reason'),
    issuedAt: integer('issued_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    patientIssuedIdx: index('idx_inbox_lab_requests_patient_issued').on(t.patientId, t.issuedAt),
  }),
);

export type InboxLabRequest = typeof inboxLabRequests.$inferSelect;
export type NewInboxLabRequest = typeof inboxLabRequests.$inferInsert;
