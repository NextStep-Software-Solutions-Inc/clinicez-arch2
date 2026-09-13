import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

export type NotificationType =
  | 'appointment_reminder'
  | 'clinic_announcement'
  | 'medication_reminder'
  | 'lab_result'
  | 'new_message'
  | 'system';

export type NotificationCategory =
  | 'appointments'
  | 'reminders'
  | 'clinic'
  | 'messages'
  | 'system';

export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    patientId: text('patient_id').notNull(),
    type: text('type').notNull(), // NotificationType
    category: text('category').notNull(), // NotificationCategory
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** JSON-encoded extra data, e.g. { appointmentId, clinicId } */
    data: text('data'),
    isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    readAt: integer('read_at', { mode: 'timestamp_ms' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
    /** Reference to the triggering entity (appointment id, clinic id, etc.) */
    sourceId: text('source_id'),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (t) => ({
    patientIdx: index('idx_notifications_patient_id').on(t.patientId),
    unreadIdx: index('idx_notifications_unread').on(t.patientId, t.isRead),
  }),
);
