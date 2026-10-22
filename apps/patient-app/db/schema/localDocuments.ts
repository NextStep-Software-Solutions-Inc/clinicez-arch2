import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const CLINICAL_DOCUMENT_CATEGORIES = [
  'lab_request',
  'lab_result',
  'prescription',
  'medical_certificate',
] as const;
export type ClinicalDocumentCategory = (typeof CLINICAL_DOCUMENT_CATEGORIES)[number];

export const localDocuments = sqliteTable(
  'local_documents',
  {
    id: text('id').primaryKey(), // Document GUID from server
    patientId: text('patient_id').notNull(),
    category: text('category', { enum: CLINICAL_DOCUMENT_CATEGORIES }).notNull(),
    title: text('title').notNull(),
    documentNumber: text('document_number'), // Accession, Rx No, Cert No
    orderingFacilityId: text('ordering_facility_id'),
    orderingFacilityName: text('ordering_facility_name'),
    issuerName: text('issuer_name'),
    issuerPrcLicense: text('issuer_prc_license'),
    issuedAt: integer('issued_at', { mode: 'timestamp_ms' }).notNull(),
    provenance: text('provenance', {
      enum: ['clinicez_verified', 'external_lab', 'patient_uploaded'],
    })
      .notNull()
      .default('clinicez_verified'),
    urgency: text('urgency', { enum: ['routine', 'urgent', 'stat'] })
      .notNull()
      .default('routine'),
    stage: text('stage').notNull(),
    payloadJson: text('payload_json').notNull().default('{}'), // Full structured items/observations
    fileUrl: text('file_url'), // Server stream path e.g. /api/v1/patients/.../stream
    fileName: text('file_name'),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),
    localBlobPath: text('local_blob_path'),
    isCached: integer('is_cached', { mode: 'boolean' }).notNull().default(false),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    patientIssuedIdx: index('idx_local_documents_patient_issued').on(t.patientId, t.issuedAt),
    patientCategoryIdx: index('idx_local_documents_patient_category').on(t.patientId, t.category),
  })
);

export type LocalDocument = typeof localDocuments.$inferSelect;
export type NewLocalDocument = typeof localDocuments.$inferInsert;
