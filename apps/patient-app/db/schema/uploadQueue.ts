import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const UPLOAD_QUEUE_STATUSES = ['queued', 'uploading', 'completed', 'failed'] as const;
export type UploadQueueStatus = (typeof UPLOAD_QUEUE_STATUSES)[number];

export const uploadQueue = sqliteTable(
  'upload_queue',
  {
    id: text('id').primaryKey(), // Queue Job UUID
    patientId: text('patient_id').notNull(),
    recordId: text('record_id').notNull(), // Links to localHealthRecords.id or filesMetadata.id
    fileUri: text('file_uri').notNull(), // Local sandbox URI or IndexedDB blob key
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    title: text('title').notNull(),
    documentTypeId: text('document_type_id').notNull(),
    documentDate: text('document_date'),
    facilityName: text('facility_name'),
    notes: text('notes'),
    status: text('status', { enum: UPLOAD_QUEUE_STATUSES }).notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp_ms' }),
    errorMessage: text('error_message'),
    fatalError: integer('fatal_error').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    patientStatusIdx: index('idx_upload_queue_patient_status').on(t.patientId, t.status, t.createdAt),
  })
);

export type UploadQueueItem = typeof uploadQueue.$inferSelect;
export type NewUploadQueueItem = typeof uploadQueue.$inferInsert;
