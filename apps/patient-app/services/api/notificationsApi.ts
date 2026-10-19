import { z } from 'zod';
import { api } from './apiClient';
import { notificationCategorySchema, notificationTypeSchema, type NotificationWireCategory } from './wireEnums';

// ── Schemas (camelCase properties, PascalCase enum values) ────────────────────

export const remoteNotificationSchema = z.object({
    id: z.string(),
    type: notificationTypeSchema,
    category: notificationCategorySchema,
    title: z.string(),
    body: z.string(),
    isRead: z.boolean(),
    readAt: z.string().nullable(),
    expiresAt: z.string().nullable(),
    sourceId: z.string().nullable(),
    /** JSON-encoded extra data */
    payload: z.string().nullable(),
    createdAt: z.string(),
});
export type RemoteNotification = z.infer<typeof remoteNotificationSchema>;

/**
 * Notification as delivered by `GET /patients/{id}/sync/changes`: same as the notifications
 * endpoint but `category`, `expiresAt` and `sourceId` may be absent. Document notifications carry
 * `payload` JSON `{ kind, documentId }`.
 */
export const syncNotificationSchema = remoteNotificationSchema.extend({
    category: notificationCategorySchema.optional(),
    expiresAt: z.string().nullable().optional(),
    sourceId: z.string().nullable().optional(),
});
export type SyncNotificationDto = z.infer<typeof syncNotificationSchema>;

export const notificationListResultSchema = z.object({
    items: z.array(remoteNotificationSchema),
    unreadCount: z.number(),
    totalCount: z.number(),
});
export type NotificationListResult = z.infer<typeof notificationListResultSchema>;

export const remoteNotificationPreferenceSchema = z.object({
    id: z.string(),
    category: notificationCategorySchema,
    pushEnabled: z.boolean(),
    inAppEnabled: z.boolean(),
});
export type RemoteNotificationPreference = z.infer<typeof remoteNotificationPreferenceSchema>;

export const remoteNotificationPreferenceListSchema = z.array(remoteNotificationPreferenceSchema);

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
    const data = await api.get<unknown>(getToken, `/patients/${patientId}/notifications?${params}`);
    return notificationListResultSchema.parse(data);
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
    const data = await api.get<unknown>(getToken, `/patients/${patientId}/notification-preferences`);
    return remoteNotificationPreferenceListSchema.parse(data);
}

export async function upsertNotificationPreferenceOnBackend(
    getToken: () => Promise<string | null>,
    patientId: string,
    category: NotificationWireCategory,
    pushEnabled: boolean,
    inAppEnabled: boolean,
): Promise<RemoteNotificationPreference> {
    const data = await api.put<unknown>(
        getToken,
        `/patients/${patientId}/notification-preferences/${category}`,
        { pushEnabled, inAppEnabled },
    );
    return remoteNotificationPreferenceSchema.parse(data);
}
