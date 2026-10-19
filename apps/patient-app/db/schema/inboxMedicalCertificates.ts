import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Document inbox — medical certificates issued by facilities (read-only, upserted from sync/changes)
export const inboxMedicalCertificates = sqliteTable(
  'inbox_medical_certificates',
  {
    id: text('id').primaryKey(),
    patientId: text('patient_id').notNull(),
    certificateNumber: text('certificate_number').notNull(),
    issuerName: text('issuer_name').notNull(),
    doctorName: text('doctor_name').notNull(),
    doctorPrcLicense: text('doctor_prc_license'),
    purpose: text('purpose').notNull(),
    diagnosis: text('diagnosis'),
    remarks: text('remarks'),
    restDays: integer('rest_days'),
    validFrom: integer('valid_from', { mode: 'timestamp_ms' }),
    validTo: integer('valid_to', { mode: 'timestamp_ms' }),
    verificationUrl: text('verification_url'),
    issuedAt: integer('issued_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    patientIssuedIdx: index('idx_inbox_medical_certificates_patient_issued').on(t.patientId, t.issuedAt),
  }),
);

export type InboxMedicalCertificate = typeof inboxMedicalCertificates.$inferSelect;
export type NewInboxMedicalCertificate = typeof inboxMedicalCertificates.$inferInsert;
