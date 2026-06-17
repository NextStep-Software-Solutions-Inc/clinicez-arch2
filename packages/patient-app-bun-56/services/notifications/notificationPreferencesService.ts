import { randomUUID } from 'expo-crypto';
import { db } from '@db/index';
import { notificationPreferences, NOTIFICATION_CATEGORIES } from '@db/schema/notificationPreferences';
import { and, eq } from 'drizzle-orm';
import type { NotificationCategory } from '@db/schema/notifications';

export interface NotificationPreference {
  id: string;
  patientId: string;
  category: NotificationCategory;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  updatedAt: Date;
}

/** Default preference when no row exists in the DB */
const DEFAULT_PREF: Pick<NotificationPreference, 'pushEnabled' | 'inAppEnabled'> = {
  pushEnabled: true,
  inAppEnabled: true,
};

export async function getPreferences(
  patientId: string,
): Promise<NotificationPreference[]> {
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.patientId, patientId));

  const map = new Map(rows.map((r) => [r.category, r]));

  // Ensure all categories are represented with defaults
  return NOTIFICATION_CATEGORIES.map((cat) => {
    const existing = map.get(cat.id);
    if (existing) {
      return {
        id: existing.id,
        patientId: existing.patientId,
        category: existing.category as NotificationCategory,
        pushEnabled: existing.pushEnabled,
        inAppEnabled: existing.inAppEnabled,
        updatedAt: new Date(existing.updatedAt as unknown as number),
      };
    }
    return {
      id: '',
      patientId,
      category: cat.id,
      ...DEFAULT_PREF,
      updatedAt: new Date(),
    };
  });
}

export async function getPreference(
  patientId: string,
  category: NotificationCategory,
): Promise<NotificationPreference> {
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.patientId, patientId),
        eq(notificationPreferences.category, category),
      ),
    );

  if (rows.length === 0) {
    return { id: '', patientId, category, ...DEFAULT_PREF, updatedAt: new Date() };
  }

  const r = rows[0];
  return {
    id: r.id,
    patientId: r.patientId,
    category: r.category as NotificationCategory,
    pushEnabled: r.pushEnabled,
    inAppEnabled: r.inAppEnabled,
    updatedAt: new Date(r.updatedAt as unknown as number),
  };
}

export async function setPreference(
  patientId: string,
  category: NotificationCategory,
  pushEnabled: boolean,
  inAppEnabled: boolean,
): Promise<void> {
  const existing = await db
    .select({ id: notificationPreferences.id })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.patientId, patientId),
        eq(notificationPreferences.category, category),
      ),
    );

  const now = new Date();

  if (existing.length > 0) {
    await db
      .update(notificationPreferences)
      .set({ pushEnabled, inAppEnabled, updatedAt: now })
      .where(eq(notificationPreferences.id, existing[0].id));
  } else {
    await db.insert(notificationPreferences).values({
      id: randomUUID(),
      patientId,
      category,
      pushEnabled,
      inAppEnabled,
      updatedAt: now,
    });
  }
}

export async function isNotificationEnabled(
  patientId: string,
  category: NotificationCategory,
  type: 'push' | 'inApp' = 'inApp',
): Promise<boolean> {
  const pref = await getPreference(patientId, category);
  return type === 'push' ? pref.pushEnabled : pref.inAppEnabled;
}

export { NOTIFICATION_CATEGORIES };

// ─── Backend Sync ──────────────────────────────────────────────────────────────

import {
  fetchNotificationPreferencesFromBackend,
  upsertNotificationPreferenceOnBackend,
} from '../api/notificationsApi';

/**
 * Pulls notification preferences from the backend and merges them into the
 * local SQLite table. Called on app foreground when online.
 * Fails silently when offline.
 */
export async function syncPreferencesFromBackend(
  getToken: () => Promise<string | null>,
  patientId: string,
): Promise<void> {
  try {
    const remote = await fetchNotificationPreferencesFromBackend(getToken, patientId);
    for (const p of remote) {
      await setPreference(
        patientId,
        p.category as NotificationCategory,
        p.pushEnabled,
        p.inAppEnabled,
      );
    }
  } catch { /* offline */ }
}

/**
 * Saves a preference locally and pushes to the backend (fire-and-forget on failure).
 */
export async function setPreferenceWithSync(
  getToken: () => Promise<string | null>,
  patientId: string,
  category: NotificationCategory,
  pushEnabled: boolean,
  inAppEnabled: boolean,
): Promise<void> {
  await setPreference(patientId, category, pushEnabled, inAppEnabled);
  try {
    await upsertNotificationPreferenceOnBackend(getToken, patientId, category, pushEnabled, inAppEnabled);
  } catch { /* offline — will reconcile on next sync */ }
}
