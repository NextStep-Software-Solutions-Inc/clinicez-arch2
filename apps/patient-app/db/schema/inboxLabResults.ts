import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { RESULT_SOURCES, RESULT_VERIFICATIONS } from '../../services/api/wireEnums';

// Document inbox — lab results from ClinicEZ labs, external labs or patient uploads
// (read-only, upserted from sync/changes). Distinct from the legacy `lab_results` profile table.
export const inboxLabResults = sqliteTable(
  'inbox_lab_results',
  {
    id: text('id').primaryKey(),
    patientId: text('patient_id').notNull(),
    requisitionId: text('requisition_id'),
    laboratoryName: text('laboratory_name').notNull(),
    title: text('title').notNull(),
    source: text('source', { enum: RESULT_SOURCES }).notNull(),
    verification: text('verification', { enum: RESULT_VERIFICATIONS }).notNull(),
    reviewedByName: text('reviewed_by_name'),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }),
    remarks: text('remarks'),
    impression: text('impression'),
    isCritical: integer('is_critical', { mode: 'boolean' }).notNull().default(false),
    resultedAt: integer('resulted_at', { mode: 'timestamp_ms' }).notNull(),
    /** Short-lived download URL; refreshed on every sync */
    fileUrl: text('file_url'),
    /** JSON-encoded `{ panel, name, value, unit, referenceRange, flag }[]` */
    observationsJson: text('observations_json').notNull().default('[]'),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    patientResultedIdx: index('idx_inbox_lab_results_patient_resulted').on(t.patientId, t.resultedAt),
    requisitionIdx: index('idx_inbox_lab_results_requisition').on(t.requisitionId),
  }),
);

export type InboxLabResult = typeof inboxLabResults.$inferSelect;
export type NewInboxLabResult = typeof inboxLabResults.$inferInsert;
