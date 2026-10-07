// token-guard:ignore-file (native notification preferences category metadata colours)
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { NotificationCategory } from './notifications';

export const notificationPreferences = sqliteTable(
  'notification_preferences',
  {
    id: text('id').primaryKey(),
    patientId: text('patient_id').notNull(),
    /** NotificationCategory value */
    category: text('category').notNull(),
    pushEnabled: integer('push_enabled', { mode: 'boolean' }).notNull().default(true),
    inAppEnabled: integer('in_app_enabled', { mode: 'boolean' }).notNull().default(true),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    uniquePref: uniqueIndex('uq_notification_pref').on(t.patientId, t.category),
  }),
);

/** All supported notification categories with metadata for UI rendering */
export const NOTIFICATION_CATEGORIES: Array<{
  id: NotificationCategory;
  label: string;
  description: string;
  iconAndroid: string;
  iconIos: string;
  color: string;
}> = [
    {
      id: 'appointments',
      label: 'Appointment Reminders',
      description: 'Upcoming appointments and follow-ups',
      iconAndroid: 'event',
      iconIos: 'calendar.fill',
      color: '#3B82F6',
    },
    {
      id: 'reminders',
      label: 'Medication Reminders',
      description: 'Scheduled medication alerts',
      iconAndroid: 'alarm',
      iconIos: 'alarm.fill',
      color: '#F59E0B',
    },
    {
      id: 'clinic',
      label: 'Clinic Announcements',
      description: 'Updates from your clinics',
      iconAndroid: 'local_hospital',
      iconIos: 'cross.case.fill',
      color: '#10B981',
    },
    {
      id: 'messages',
      label: 'New Messages',
      description: 'Messages from your care team',
      iconAndroid: 'chat',
      iconIos: 'message.fill',
      color: '#8B5CF6',
    },
    {
      id: 'system',
      label: 'System Notifications',
      description: 'App updates and important notices',
      iconAndroid: 'info',
      iconIos: 'info.circle.fill',
      color: '#6B7280',
    },
  ];
