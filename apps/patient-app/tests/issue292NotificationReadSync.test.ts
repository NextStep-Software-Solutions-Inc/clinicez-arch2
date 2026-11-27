import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { notifications } from '../db/schema/notifications';

const APP_ROOT = join(import.meta.dir, '..');
const readApp = (rel: string): string =>
  readFileSync(join(APP_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.run(`
    CREATE TABLE notifications (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      data TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      read_at INTEGER,
      expires_at INTEGER,
      source_id TEXT,
      deleted_at INTEGER
    );
  `);
  return { sqlite, db: drizzle(sqlite) };
}

let activeDb = createTestDb().db;

const emittedEvents: string[] = [];
const listeners = new Map<string, Set<() => void>>();

mock.module('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (obj: Record<string, unknown>) => obj?.web ?? obj?.default,
  },
  DeviceEventEmitter: {
    emit: (event: string) => {
      emittedEvents.push(event);
      listeners.get(event)?.forEach((fn) => fn());
    },
    addListener: (event: string, fn: () => void) => {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(fn);
      return {
        remove: () => {
          set?.delete(fn);
        },
      };
    },
  },
}));

mock.module('expo-notifications', () => ({
  PermissionStatus: {
    UNDETERMINED: 'undetermined',
    GRANTED: 'granted',
    DENIED: 'denied',
  },
  AndroidImportance: { MAX: 5, HIGH: 4 },
  getPermissionsAsync: async () => ({ status: 'undetermined' }),
  requestPermissionsAsync: async () => ({ status: 'undetermined' }),
  getExpoPushTokenAsync: async () => ({ data: 'mock-token' }),
  setNotificationChannelAsync: async () => {},
  addNotificationReceivedListener: () => ({ remove: () => {} }),
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  scheduleNotificationAsync: async () => 'mock-id',
}));

mock.module('@db/index', () => ({
  db: new Proxy(
    {},
    {
      get(_target, prop) {
        const value = (activeDb as any)[prop];
        return typeof value === 'function' ? value.bind(activeDb) : value;
      },
    },
  ),
}));

let fetchImpl: (
  getToken: () => Promise<string | null>,
  patientId: string,
  opts?: { unreadOnly?: boolean; skip?: number; take?: number },
) => Promise<{
  items: Array<{
    id: string;
    type: 'AppointmentReminder';
    category: 'Appointments';
    title: string;
    body: string;
    isRead: boolean;
    readAt?: string | null;
    createdAt: string;
  }>;
  unreadCount: number;
  totalCount: number;
}> = async () => ({ items: [], unreadCount: 0, totalCount: 0 });

let markReadImpl: (
  getToken: () => Promise<string | null>,
  patientId: string,
  notificationId: string,
) => Promise<void> = async () => {};

let markAllReadImpl: (
  getToken: () => Promise<string | null>,
  patientId: string,
) => Promise<void> = async () => {};

const apiCalls: Array<{ op: string; patientId: string; id?: string }> = [];

mock.module('../services/api/notificationsApi', () => ({
  fetchNotificationsFromBackend: async (
    getToken: () => Promise<string | null>,
    patientId: string,
    opts?: { unreadOnly?: boolean; skip?: number; take?: number },
  ) => {
    apiCalls.push({ op: 'fetch', patientId });
    return fetchImpl(getToken, patientId, opts);
  },
  markNotificationReadOnBackend: async (
    getToken: () => Promise<string | null>,
    patientId: string,
    notificationId: string,
  ) => {
    apiCalls.push({ op: 'markRead', patientId, id: notificationId });
    return markReadImpl(getToken, patientId, notificationId);
  },
  markAllNotificationsReadOnBackend: async (
    getToken: () => Promise<string | null>,
    patientId: string,
  ) => {
    apiCalls.push({ op: 'markAllRead', patientId });
    return markAllReadImpl(getToken, patientId);
  },
}));

const {
  NOTIFICATIONS_CHANGED_EVENT,
  clearAllNotificationsWithSync,
  deleteNotificationWithSync,
  getUnreadCount,
  markAllAsReadWithSync,
  markAsReadWithSync,
  syncNotificationsFromBackend,
} = await import('../services/notifications/notificationService');

const PATIENT_ID = 'patient-292';
const getToken = async () => 'token-292';

async function seedNotification(id: string, isRead = false) {
  await activeDb.insert(notifications).values({
    id,
    patientId: PATIENT_ID,
    type: 'appointment_reminder',
    category: 'appointments',
    title: 'Appointment Reminder (In 2 Hours): Nextstep OPD',
    body: 'Reminder for your upcoming visit.',
    data: null,
    isRead,
    createdAt: new Date('2026-11-27T01:00:00.000Z'),
    readAt: isRead ? new Date('2026-11-27T01:30:00.000Z') : null,
    expiresAt: null,
    sourceId: 'appt-1',
    deletedAt: null,
  });
}

describe('Issue #292 notification read & delete backend sync', () => {
  beforeEach(() => {
    activeDb = createTestDb().db;
    emittedEvents.length = 0;
    apiCalls.length = 0;
    fetchImpl = async () => ({ items: [], unreadCount: 0, totalCount: 0 });
    markReadImpl = async () => {};
    markAllReadImpl = async () => {};
  });

  test('markAsReadWithSync updates SQLite, calls backend PATCH, emits change event, and clears unread count', async () => {
    await seedNotification('notif-1', false);
    expect(await getUnreadCount(PATIENT_ID)).toBe(1);

    await markAsReadWithSync(getToken, PATIENT_ID, 'notif-1');

    const [row] = await activeDb
      .select()
      .from(notifications)
      .where(eq(notifications.id, 'notif-1'));
    expect(row.isRead).toBe(true);
    expect(row.readAt).toBeTruthy();
    expect(await getUnreadCount(PATIENT_ID)).toBe(0);
    expect(apiCalls).toEqual([{ op: 'markRead', patientId: PATIENT_ID, id: 'notif-1' }]);
    expect(emittedEvents).toContain(NOTIFICATIONS_CHANGED_EVENT);
  });

  test('markAllAsReadWithSync updates all unread rows, calls backend POST, emits change event, and clears unread count', async () => {
    await seedNotification('notif-1', false);
    await seedNotification('notif-2', false);
    expect(await getUnreadCount(PATIENT_ID)).toBe(2);

    await markAllAsReadWithSync(getToken, PATIENT_ID);

    expect(await getUnreadCount(PATIENT_ID)).toBe(0);
    expect(apiCalls).toEqual([{ op: 'markAllRead', patientId: PATIENT_ID }]);
    expect(emittedEvents).toContain(NOTIFICATIONS_CHANGED_EVENT);
  });

  test('deleteNotificationWithSync marks unread notifications read on backend, skips backend read for already-read rows', async () => {
    await seedNotification('notif-unread', false);
    await seedNotification('notif-read', true);

    await deleteNotificationWithSync(getToken, PATIENT_ID, 'notif-unread');
    await deleteNotificationWithSync(getToken, PATIENT_ID, 'notif-read');

    expect(await getUnreadCount(PATIENT_ID)).toBe(0);
    expect(apiCalls).toEqual([{ op: 'markRead', patientId: PATIENT_ID, id: 'notif-unread' }]);
  });

  test('clearAllNotificationsWithSync soft-deletes locally and calls markAllNotificationsReadOnBackend', async () => {
    await seedNotification('notif-1', false);
    await clearAllNotificationsWithSync(getToken, PATIENT_ID);

    expect(await getUnreadCount(PATIENT_ID)).toBe(0);
    expect(apiCalls).toEqual([{ op: 'markAllRead', patientId: PATIENT_ID }]);
  });

  test('syncNotificationsFromBackend waits for in-flight markAsReadWithSync so stale backend data cannot revert isRead', async () => {
    await seedNotification('notif-race', false);

    let backendMarkedRead = false;
    let resolvePatch!: () => void;
    const patchGate = new Promise<void>((resolve) => {
      resolvePatch = resolve;
    });

    markReadImpl = async () => {
      await patchGate;
      backendMarkedRead = true;
    };

    fetchImpl = async () => ({
      items: [
        {
          id: 'notif-race',
          type: 'AppointmentReminder',
          category: 'Appointments',
          title: 'Appointment Reminder (In 2 Hours): Nextstep OPD',
          body: 'Reminder for your upcoming visit.',
          isRead: backendMarkedRead,
          readAt: backendMarkedRead ? '2026-11-27T02:00:00.000Z' : null,
          createdAt: '2026-11-27T01:00:00.000Z',
        },
      ],
      unreadCount: backendMarkedRead ? 0 : 1,
      totalCount: 1,
    });

    const markPromise = markAsReadWithSync(getToken, PATIENT_ID, 'notif-race');
    const syncPromise = syncNotificationsFromBackend(getToken, PATIENT_ID);

    // Yield microtasks: sync must NOT have called fetch yet while PATCH is in-flight
    await Promise.resolve();
    await Promise.resolve();
    expect(apiCalls.some((c) => c.op === 'fetch')).toBe(false);

    resolvePatch();
    await Promise.all([markPromise, syncPromise]);

    expect(apiCalls.map((c) => c.op)).toEqual(['markRead', 'fetch']);
    expect(await getUnreadCount(PATIENT_ID)).toBe(0);
  });

  test('offline resilience: local read updates succeed even when backend sync fails', async () => {
    await seedNotification('notif-offline-1', false);
    await seedNotification('notif-offline-2', false);

    markReadImpl = async () => {
      throw new Error('Network offline');
    };
    markAllReadImpl = async () => {
      throw new Error('Network offline');
    };

    await expect(markAsReadWithSync(getToken, PATIENT_ID, 'notif-offline-1')).resolves.toBeUndefined();
    expect(await getUnreadCount(PATIENT_ID)).toBe(1);

    await expect(markAllAsReadWithSync(getToken, PATIENT_ID)).resolves.toBeUndefined();
    expect(await getUnreadCount(PATIENT_ID)).toBe(0);
  });

  test('UI screens wire *WithSync helpers and Appointments queries exclude deleted notifications', () => {
    const webScreen = readApp('navigation/screens/Notification.screen.web.tsx');
    expect(webScreen).toContain('markAllAsReadWithSync');
    expect(webScreen).toContain('markAsReadWithSync');
    expect(webScreen).toContain('deleteNotificationWithSync');
    expect(webScreen).not.toMatch(/\bmarkAllAsRead\(/);
    expect(webScreen).not.toMatch(/\bmarkAsRead\(/);
    expect(webScreen).not.toMatch(/\bdeleteNotification\(/);

    const nativeScreen = readApp('navigation/screens/Notification.screen.tsx');
    expect(nativeScreen).toContain('markAllAsReadWithSync');
    expect(nativeScreen).toContain('deleteNotificationWithSync');
    expect(nativeScreen).not.toMatch(/\bmarkAllAsRead\(/);
    expect(nativeScreen).not.toMatch(/\bdeleteNotification\(/);

    const detailScreen = readApp('navigation/screens/NotificationDetail.screen.tsx');
    expect(detailScreen).toContain('markAsReadWithSync');

    const settingsWeb = readApp('navigation/screens/settings/NotificationsSettings.screen.web.tsx');
    expect(settingsWeb).toContain('clearAllNotificationsWithSync');
    expect(settingsWeb).not.toMatch(/\bclearAllNotifications\(/);

    const settingsNative = readApp('navigation/screens/settings/NotificationsSettings.screen.tsx');
    expect(settingsNative).toContain('clearAllNotificationsWithSync');
    expect(settingsNative).not.toMatch(/\bclearAllNotifications\(/);

    const apptsWeb = readApp('navigation/screens/Appointments.screen.web.tsx');
    expect(apptsWeb).toContain('isNull(notificationsTable.deletedAt)');

    const apptsNative = readApp('navigation/screens/Appointments.screen.tsx');
    expect(apptsNative).toContain('isNull(notificationsTable.deletedAt)');
  });
});
