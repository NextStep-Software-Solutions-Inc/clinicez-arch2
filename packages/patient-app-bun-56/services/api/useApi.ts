/**
 * SWR hooks for the PatientApp backend API.
 *
 * Each hook uses the pattern:
 *   useSWR([swrKey, getToken], ([key, gt]) => swrFetcher(key, gt), options)
 *
 * All hooks return the standard SWR { data, error, isLoading, mutate } object.
 * They degrade gracefully when offline (isLoading=false, data=undefined, error set).
 *
 * Mutations (POST / PUT / PATCH) use useSWRMutation for explicit triggering.
 */

import useSWR, { type SWRConfiguration } from 'swr';
import useSWRMutation from 'swr/mutation';
import { swrFetcher, swrKey, api, ApiError } from './apiClient';
import type { PatientSummary, PushSyncAck, SyncItemRequest, PatientFullRecord } from './patientApi';
import type {
    PagedResult,
    OrganizationSummary,
    OrganizationDetail,
    ClinicSummary,
    ClinicDetail,
} from './discoveryApi';
import type { NotificationListResult, RemoteNotificationPreference } from './notificationsApi';

// ── Shared options ────────────────────────────────────────────────────────────

const OFFLINE_OPTS: SWRConfiguration = {
    shouldRetryOnError: false,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
};

// ── Patient ───────────────────────────────────────────────────────────────────

export function usePatientByClerkId(
    getToken: () => Promise<string | null>,
    clerkUserId: string | null | undefined,
) {
    const key = clerkUserId ? swrKey(`/patients/by-clerk/${clerkUserId}`) : null;
    return useSWR<PatientSummary | null>(
        key ? [key, getToken] : null,
        async ([k, gt]) => {
            try { return await swrFetcher<PatientSummary>(k, gt); }
            catch (err) { if (err instanceof ApiError && err.status === 404) return null; throw err; }
        },
        OFFLINE_OPTS,
    );
}

/**
 * Fetches the full patient record — all 22 ISyncable entity categories.
 *
 * Use on first install or re-install to hydrate local SQLite from server state.
 * `revalidateOnFocus: false` because this is expensive and should be triggered
 * explicitly, not on every app-foreground event.
 */
export function usePatientFullRecord(
    getToken: () => Promise<string | null>,
    patientId: string | null | undefined,
) {
    const key = patientId ? swrKey(`/patients/${patientId}/full-record`) : null;
    return useSWR<PatientFullRecord>(
        key ? [key, getToken] : null,
        ([k, gt]) => swrFetcher<PatientFullRecord>(k, gt),
        { ...OFFLINE_OPTS, revalidateOnFocus: false },
    );
}

// ── Discovery: Organizations ──────────────────────────────────────────────────

export function useOrganizations(
    getToken: () => Promise<string | null>,
    query?: string,
    skip = 0,
    take = 20,
) {
    const key = swrKey('/organizations', { q: query, skip, take });
    return useSWR<PagedResult<OrganizationSummary>>(
        [key, getToken],
        ([k, gt]) => swrFetcher<PagedResult<OrganizationSummary>>(k, gt),
        OFFLINE_OPTS,
    );
}

export function useOrganizationByInviteCode(
    getToken: () => Promise<string | null>,
    inviteCode: string | null | undefined,
) {
    const key = inviteCode
        ? swrKey(`/organizations/by-invite/${encodeURIComponent(inviteCode.trim())}`)
        : null;
    return useSWR<OrganizationDetail | null>(
        key ? [key, getToken] : null,
        async ([k, gt]) => {
            try { return await swrFetcher<OrganizationDetail>(k, gt); }
            catch (err) { if (err instanceof ApiError && err.status === 404) return null; throw err; }
        },
        { ...OFFLINE_OPTS, revalidateOnFocus: false },
    );
}

// ── Discovery: Clinics ────────────────────────────────────────────────────────

export function useClinics(
    getToken: () => Promise<string | null>,
    query?: string,
    organizationId?: string,
    skip = 0,
    take = 20,
) {
    const key = swrKey('/clinics', { q: query, organizationId, skip, take });
    return useSWR<PagedResult<ClinicSummary>>(
        [key, getToken],
        ([k, gt]) => swrFetcher<PagedResult<ClinicSummary>>(k, gt),
        OFFLINE_OPTS,
    );
}

export function useClinicDetail(
    getToken: () => Promise<string | null>,
    clinicId: string | null | undefined,
    forPatientId?: string,
) {
    const key = clinicId
        ? swrKey(`/clinics/${clinicId}`, forPatientId ? { forPatientId } : undefined)
        : null;
    return useSWR<ClinicDetail | null>(
        key ? [key, getToken] : null,
        async ([k, gt]) => {
            try { return await swrFetcher<ClinicDetail>(k, gt); }
            catch (err) { if (err instanceof ApiError && err.status === 404) return null; throw err; }
        },
        OFFLINE_OPTS,
    );
}

// ── Notifications ─────────────────────────────────────────────────────────────

export function useNotifications(
    getToken: () => Promise<string | null>,
    patientId: string | null | undefined,
    opts: { unreadOnly?: boolean; skip?: number; take?: number } = {},
) {
    const key = patientId
        ? swrKey(`/patients/${patientId}/notifications`, {
            unreadOnly: opts.unreadOnly ? 'true' : undefined,
            skip: opts.skip,
            take: opts.take ?? 30,
        })
        : null;
    return useSWR<NotificationListResult>(
        key ? [key, getToken] : null,
        ([k, gt]) => swrFetcher<NotificationListResult>(k, gt),
        OFFLINE_OPTS,
    );
}

export function useNotificationPreferences(
    getToken: () => Promise<string | null>,
    patientId: string | null | undefined,
) {
    const key = patientId
        ? swrKey(`/patients/${patientId}/notification-preferences`)
        : null;
    return useSWR<RemoteNotificationPreference[]>(
        key ? [key, getToken] : null,
        ([k, gt]) => swrFetcher<RemoteNotificationPreference[]>(k, gt),
        OFFLINE_OPTS,
    );
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/** Pushes offline sync payload to the backend. */
export function usePushSync(
    getToken: () => Promise<string | null>,
    patientId: string,
) {
    return useSWRMutation(
        `/patients/${patientId}/sync`,
        (_key: string, { arg }: { arg: SyncItemRequest[] }) =>
            api.post<PushSyncAck>(getToken, `/patients/${patientId}/sync`, { items: arg }),
    );
}

/** Submits a booking draft to the Clinic Dashboard via PatientApp backend. */
export function useSubmitBooking(
    getToken: () => Promise<string | null>,
    patientId: string,
    draftId: string,
) {
    return useSWRMutation(
        `/patients/${patientId}/booking-drafts/${draftId}/submit`,
        (_key: string) =>
            api.post<string | null>(
                getToken,
                `/patients/${patientId}/booking-drafts/${draftId}/submit`,
            ),
    );
}

/** Marks a single notification as read. */
export function useMarkNotificationRead(
    getToken: () => Promise<string | null>,
    patientId: string,
) {
    return useSWRMutation(
        `/patients/${patientId}/notifications/read`,
        (_key: string, { arg: notificationId }: { arg: string }) =>
            api.patch<void>(getToken, `/patients/${patientId}/notifications/${notificationId}/read`),
    );
}

/** Upserts a notification preference. */
export function useUpsertNotificationPreference(
    getToken: () => Promise<string | null>,
    patientId: string,
) {
    return useSWRMutation(
        `/patients/${patientId}/notification-preferences`,
        (
            _key: string,
            { arg }: { arg: { category: string; pushEnabled: boolean; inAppEnabled: boolean } },
        ) =>
            api.put(getToken, `/patients/${patientId}/notification-preferences/${arg.category}`, {
                pushEnabled: arg.pushEnabled,
                inAppEnabled: arg.inAppEnabled,
            }),
    );
}
