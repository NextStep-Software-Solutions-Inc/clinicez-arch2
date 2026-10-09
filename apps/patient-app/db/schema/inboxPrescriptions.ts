import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Document inbox — prescriptions issued by facilities (read-only, upserted from sync/changes).
// Distinct from the legacy `prescriptions` table used by the clinical profile section.
export const inboxPrescriptions = sqliteTable(
  'inbox_prescriptions',
  {
    id: text('id').primaryKey(),
    patientId: text('patient_id').notNull(),
    prescriptionNumber: text('prescription_number').notNull(),
    orderingTenantId: text('ordering_tenant_id').notNull(),
    orderingFacilityId: text('ordering_facility_id').notNull(),
    orderingFacilityName: text('ordering_facility_name'),
    prescriberName: text('prescriber_name').notNull(),
    prescriberPrcLicense: text('prescriber_prc_license'),
    diagnosis: text('diagnosis'),
    instructions: text('instructions'),
    /** JSON-encoded prescription line items */
    itemsJson: text('items_json').notNull().default('[]'),
    stage: text('stage').notNull(),
    quotedAmount: real('quoted_amount'),
    pharmacyName: text('pharmacy_name'),
    claimToken: text('claim_token'),
    verificationUrl: text('verification_url'),
    receiptNumber: text('receipt_number'),
    dispensedAt: integer('dispensed_at', { mode: 'timestamp_ms' }),
    externalPharmacyName: text('external_pharmacy_name'),
    issuedAt: integer('issued_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    patientIssuedIdx: index('idx_inbox_prescriptions_patient_issued').on(t.patientId, t.issuedAt),
  }),
);

export type InboxPrescription = typeof inboxPrescriptions.$inferSelect;
export type NewInboxPrescription = typeof inboxPrescriptions.$inferInsert;
