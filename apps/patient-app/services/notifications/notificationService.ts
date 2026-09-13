import * as ExpoNotifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { db } from '@db/index';
import { notifications } from '@db/schema/notifications';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import type { NotificationCategory, NotificationType } from '@db/schema/notifications';

const PUSH_TOKEN_KEY = 'push_token';

// ─── Push Permission & Token ─────────────────────────────────────────────────

export async function registerForPushNotifications(patientId: string): Promise<{
  token: string | null;
  status: ExpoNotifications.PermissionStatus;
}> {
  const { status: existingStatus } = await ExpoNotifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await ExpoNotifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return { token: null, status: finalStatus };
  }

  // Expo push tokens only work in native builds (not Expo Go).
  let token: string | null = null;
  try {
    const tokenData = await ExpoNotifications.getExpoPushTokenAsync();
    token = tokenData.data;
    await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
  } catch (_) {
    // Silently fail in Expo Go or simulator builds
  }

  if (Platform.OS === 'android') {
    await ExpoNotifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: ExpoNotifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3B82F6',
    });
    await ExpoNotifications.setNotificationChannelAsync('appointments', {
      name: 'Appointments',
      importance: ExpoNotifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3B82F6',
    });
    await ExpoNotifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders',
      importance: ExpoNotifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F59E0B',
    });
  }

  return { token, status: finalStatus };
}

export async function getStoredPushToken(): Promise<string | null> {
  return SecureStore.getItemAsync(PUSH_TOKEN_KEY);
}

// ─── Notification Listeners ────────────────────────────────────────────────────

export interface NotificationPayload {
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sourceId?: string;
}

export function setupNotificationListeners(
  patientId: string,
  onNotification: (payload: NotificationPayload) => void,
  onNotificationResponse: (response: ExpoNotifications.NotificationResponse) => void,
): () => void {
  const receivedSub = ExpoNotifications.addNotificationReceivedListener(async (notification) => {
    const raw = notification.request.content;
    const payload: NotificationPayload = {
      type: (raw.data?.type as NotificationType) ?? 'system',
      category: (raw.data?.category as NotificationCategory) ?? 'system',
      title: raw.title ?? 'Notification',
      body: raw.body ?? '',
      data: raw.data as Record<string, unknown>,
      sourceId: raw.data?.sourceId as string | undefined,
    };
    // Persist in-app
    await saveNotification(patientId, payload);
    onNotification(payload);
  });

  const responseSub = ExpoNotifications.addNotificationResponseReceivedListener(onNotificationResponse);

  return () => {
    receivedSub.remove();
    responseSub.remove();
  };
}

// ─── Notification CRUD ─────────────────────────────────────────────────────────

export async function saveNotification(
  patientId: string,
  payload: NotificationPayload,
): Promise<typeof notifications.$inferSelect> {
  const now = new Date();
  const row = {
    id: randomUUID(),
    patientId,
    type: payload.type,
    category: payload.category,
    title: payload.title,
    body: payload.body,
    data: payload.data ? JSON.stringify(payload.data) : null,
    isRead: false,
    createdAt: now,
    readAt: null,
    expiresAt: null,
    sourceId: payload.sourceId ?? null,
    deletedAt: null,
  };
  await db.insert(notifications).values(row);
  return row as unknown as typeof notifications.$inferSelect;
}

export type NotificationFilter = 'all' | 'unread' | NotificationCategory;

export async function getNotifications(
  patientId: string,
  opts: { filter?: NotificationFilter; limit?: number } = {},
) {
  const { filter = 'all', limit = 100 } = opts;

  const conditions = [
    eq(notifications.patientId, patientId),
    isNull(notifications.deletedAt),
  ];

  if (filter === 'unread') {
    conditions.push(eq(notifications.isRead, false));
  } else if (filter !== 'all') {
    // category filter
    conditions.push(eq(notifications.category, filter));
  }

  return db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function getUnreadCount(patientId: string): Promise<number> {
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.patientId, patientId),
        eq(notifications.isRead, false),
        isNull(notifications.deletedAt),
      ),
    );
  return rows.length;
}

export async function markAsRead(id: string): Promise<void> {
  await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(eq(notifications.id, id));
}

export async function markAllAsRead(patientId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(notifications.patientId, patientId),
        eq(notifications.isRead, false),
        isNull(notifications.deletedAt),
      ),
    );
}

export async function deleteNotification(id: string): Promise<void> {
  await db
    .update(notifications)
    .set({ deletedAt: new Date() })
    .where(eq(notifications.id, id));
}

// ─── Backend Sync ──────────────────────────────────────────────────────────────

import {
  fetchNotificationsFromBackend,
  markNotificationReadOnBackend,
  markAllNotificationsReadOnBackend,
} from '../api/notificationsApi';

/**
 * Pulls the latest notifications from the backend and upserts them into the
 * local SQLite table. Intended to be called on app foreground / pull-to-refresh.
 * Fails silently when offline.
 */
export async function syncNotificationsFromBackend(
  getToken: () => Promise<string | null>,
  patientId: string,
): Promise<void> {
  try {
    const result = await fetchNotificationsFromBackend(getToken, patientId, { take: 100 });
    for (const n of result.items) {
      await db
        .insert(notifications)
        .values({
          id: n.id,
          patientId,
          type: (n.type as NotificationType) ?? 'system',
          category: (n.category as NotificationCategory) ?? 'system',
          title: n.title,
          body: n.body,
          data: n.payload,
          isRead: n.isRead,
          createdAt: n.createdAt ? new Date(n.createdAt) : new Date(),
          readAt: n.readAt ? new Date(n.readAt) : null,
          expiresAt: n.expiresAt ? new Date(n.expiresAt) : null,
          sourceId: n.sourceId,
          deletedAt: null,
        })
        .onConflictDoUpdate({
          target: notifications.id,
          set: {
            isRead: n.isRead,
            readAt: n.readAt ? new Date(n.readAt) : null,
            title: n.title,
            body: n.body,
          },
        });
    }
  } catch {
    // Offline — local cache remains unchanged
  }
}

/**
 * Marks a single notification as read locally and fires-and-forgets to the backend.
 */
export async function markAsReadWithSync(
  getToken: () => Promise<string | null>,
  patientId: string,
  id: string,
): Promise<void> {
  await markAsRead(id);
  try { await markNotificationReadOnBackend(getToken, patientId, id); } catch { /* offline */ }
}

/**
 * Marks all notifications as read locally and fires-and-forgets to the backend.
 */
export async function markAllAsReadWithSync(
  getToken: () => Promise<string | null>,
  patientId: string,
): Promise<void> {
  await markAllAsRead(patientId);
  try { await markAllNotificationsReadOnBackend(getToken, patientId); } catch { /* offline */ }
}

export async function clearAllNotifications(patientId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(notifications.patientId, patientId), isNull(notifications.deletedAt)),
    );
}

// ─── Dev / Seed ──────────────────────────────────────────────────────────────

/** Inserts a realistic set of mock notifications for every category.
 *  Only intended for __DEV__ usage. */
export async function seedMockNotifications(patientId: string): Promise<void> {
  const now = Date.now();
  const mins = (n: number) => new Date(now - n * 60_000);
  const hrs = (n: number) => new Date(now - n * 3_600_000);
  const days = (n: number) => new Date(now - n * 86_400_000);

  const mocks: Array<{
    createdAt: Date;
    isRead: boolean;
    payload: NotificationPayload;
  }> = [
      // ── Appointments ──────────────────────────────────────────────────────────
      {
        createdAt: mins(5),
        isRead: false,
        payload: {
          type: 'appointment_reminder' as const,
          category: 'appointments',
          title: 'Appointment Confirmed',
          body: 'Your appointment with Dr. Reyes on Jun 15 at 10:00 AM has been confirmed.',
        },
      },
      {
        createdAt: hrs(2),
        isRead: false,
        payload: {
          type: 'appointment_reminder' as const,
          category: 'appointments',
          title: 'Appointment Tomorrow',
          body: 'Reminder: You have an appointment with Dr. Santos tomorrow at 2:00 PM.',
        },
      },
      {
        createdAt: days(1),
        isRead: true,
        payload: {
          type: 'appointment_reminder' as const,
          category: 'appointments',
          title: 'Appointment Rescheduled',
          body: 'Your appointment with Makati Medical Center has been moved to Jun 20 at 9:00 AM.',
        },
      },
      // ── Reminders ─────────────────────────────────────────────────────────────
      {
        createdAt: mins(30),
        isRead: false,
        payload: {
          type: 'medication_reminder' as const,
          category: 'reminders',
          title: 'Take Your Medication',
          body: "Time to take Metformin 500 mg. Don't skip your dose.",
        },
      },
      {
        createdAt: hrs(5),
        isRead: false,
        payload: {
          type: 'medication_reminder' as const,
          category: 'reminders',
          title: 'Blood Pressure Check',
          body: 'Your weekly blood pressure log is due. Please update your vitals.',
        },
      },
      {
        createdAt: days(2),
        isRead: true,
        payload: {
          type: 'medication_reminder' as const,
          category: 'reminders',
          title: 'Annual Check-up Due',
          body: "It's been over a year since your last annual physical. Book an appointment soon.",
        },
      },
      // ── Clinic ────────────────────────────────────────────────────────────────
      {
        createdAt: hrs(1),
        isRead: false,
        payload: {
          type: 'lab_result' as const,
          category: 'clinic',
          title: 'New Lab Result Available',
          body: 'Your CBC panel result from Jun 12 is now available. Tap to view.',
        },
      },
      {
        createdAt: hrs(8),
        isRead: true,
        payload: {
          type: 'clinic_announcement' as const,
          category: 'clinic',
          title: 'Prescription Ready',
          body: 'Your prescription for Amlodipine 5 mg is ready for pick-up at the clinic.',
        },
      },
      {
        createdAt: days(3),
        isRead: true,
        payload: {
          type: 'clinic_announcement' as const,
          category: 'clinic',
          title: 'Clinic Maintenance Notice',
          body: 'Clinic EZ Marikina will be closed on Jun 17 for scheduled maintenance.',
        },
      },
      // ── Messages ──────────────────────────────────────────────────────────────
      {
        createdAt: mins(45),
        isRead: false,
        payload: {
          type: 'new_message' as const,
          category: 'messages',
          title: 'Message from Dr. Reyes',
          body: 'Please bring your previous lab results to your next visit.',
        },
      },
      {
        createdAt: days(1),
        isRead: true,
        payload: {
          type: 'new_message' as const,
          category: 'messages',
          title: 'Clinic Replied',
          body: 'Makati Medical answered your query about vaccine availability.',
        },
      },
      // ── System ────────────────────────────────────────────────────────────────
      {
        createdAt: hrs(3),
        isRead: false,
        payload: {
          type: 'system' as const,
          category: 'system',
          title: 'App Updated',
          body: "Clinic EZ has been updated to version 2.1. Check out what's new.",
        },
      },
      {
        createdAt: days(5),
        isRead: true,
        payload: {
          type: 'system' as const,
          category: 'system',
          title: 'Welcome to Clinic EZ',
          body: 'Your account is set up. Start by connecting to a clinic near you.',
        },
      },
    ];

  for (const mock of mocks) {
    const row = {
      id: randomUUID(),
      patientId,
      type: mock.payload.type,
      category: mock.payload.category,
      title: mock.payload.title,
      body: mock.payload.body,
      data: null,
      isRead: mock.isRead,
      createdAt: mock.createdAt,
      readAt: mock.isRead ? mock.createdAt : null,
      expiresAt: null,
      sourceId: null,
      deletedAt: null,
    };
    await db.insert(notifications).values(row);
  }
}

// ─── Local Scheduling ──────────────────────────────────────────────────────────

export async function scheduleLocalNotification(
  title: string,
  body: string,
  data: Record<string, unknown> = {},
  trigger: ExpoNotifications.NotificationTriggerInput = { type: ExpoNotifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1 },
): Promise<string> {
  return ExpoNotifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
    },
    trigger,
  });
}
