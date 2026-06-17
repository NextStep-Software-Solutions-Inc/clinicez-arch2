import { api } from './apiClient';

// ── Types (camelCase from backend) ────────────────────────────────────────────

export interface RemoteNotification {
    id: string;
    /** e.g. "appointmentReminder" | "clinicAnnouncement" | "medicationReminder" | "labResult" | "newMessage" | "system" | "syncConflict" */
    type: string;
    /** e.g. "appointments" | "reminders" | "clinic" | "messages" | "system" */
    category: string;
    title: string;
    body: string;
    isRead: boolean;
    readAt: string | null;
    expiresAt: string | null;
    sourceId: string | null;
    /** JSON-encoded extra data */
    payload: string | null;
    createdAt: string;
}

export interface NotificationListResult {
    items: RemoteNotification[];
    unreadCount: number;
    totalCount: number;
}

export interface RemoteNotificationPreference {
    id: string;
    category: string;
    pushEnabled: boolean;
    inAppEnabled: boolean;
}

// ── Notifications API ─────────────────────────────────────────────────────────

export async function fetchNotificationsFromBackend(
    getToken: () => Promise<string | null>,
    patientId: string,
    opts: { unreadOnly?: boolean; skip?: number; take?: number } = {},
): Promise<NotificationListResult> {
    const params = new URLSearchParams();
    if (opts.unreadOnly) params.set('unreadOnly', 'true');
    if (opts.skip) params.set('skip', String(opts.skip));
    params.set('take', String(opts.take ?? 100));
    return api.get<NotificationListResult>(
        getToken,
        `/patients/${patientId}/notifications?${params}`,
    );
}

export async function markNotificationReadOnBackend(
    getToken: () => Promise<string | null>,
    patientId: string,
    notificationId: string,
): Promise<void> {
    return api.patch<void>(
        getToken,
        `/patients/${patientId}/notifications/${notificationId}/read`,
    );
}

export async function markAllNotificationsReadOnBackend(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<void> {
    return api.post<void>(getToken, `/patients/${patientId}/notifications/mark-all-read`);
}

// ── Notification Preferences API ──────────────────────────────────────────────

export async function fetchNotificationPreferencesFromBackend(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<RemoteNotificationPreference[]> {
    return api.get<RemoteNotificationPreference[]>(
        getToken,
        `/patients/${patientId}/notification-preferences`,
    );
}

export async function upsertNotificationPreferenceOnBackend(
    getToken: () => Promise<string | null>,
    patientId: string,
    category: string,
    pushEnabled: boolean,
    inAppEnabled: boolean,
): Promise<RemoteNotificationPreference> {
    return api.put<RemoteNotificationPreference>(
        getToken,
        `/patients/${patientId}/notification-preferences/${category}`,
        { pushEnabled, inAppEnabled },
    );
}
