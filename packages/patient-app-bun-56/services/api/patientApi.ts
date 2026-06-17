import { api, ApiError } from './apiClient';

// ── Types mirroring PatientApp.Application.Common.DTOs.PatientDtos ───────────

export interface PatientSummary {
    id: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
    suffix: string | null;
    /** e.g. "male" | "female" | "other" (lowercase from backend) */
    sex: string | null;
    /** YYYY-MM-DD */
    dateOfBirth: string | null;
    bloodType: string | null;
    civilStatus: string | null;
    nationality: string | null;
    mobile: string | null;
    email: string | null;
    avatarUrl: string | null;
    consentToShareInfo: boolean;
}

export interface SyncItemRequest {
    clientId: string;
    entityType: string;
    /** "create" | "update" | "delete" */
    operation: string;
    /** ISO-8601 UTC */
    clientTimestamp: string;
    payloadJson: string | null;
}

export interface PushSyncAck {
    accepted: number;
    alreadyProcessed: number;
    acknowledgedAt: string;
}

// ── API functions ─────────────────────────────────────────────────────────────

/**
 * Looks up a patient profile by Clerk user ID.
 * Returns null on 404 — used to detect first sign-in.
 */
export async function getPatientByClerkId(
    getToken: () => Promise<string | null>,
    clerkUserId: string,
): Promise<PatientSummary | null> {
    try {
        return await api.get<PatientSummary>(getToken, `/patients/by-clerk/${clerkUserId}`);
    } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
    }
}

/**
 * Creates a new patient profile on first sign-in.
 * Returns the server-assigned patient UUID.
 */
export async function createPatient(
    getToken: () => Promise<string | null>,
    payload: {
        clerkUserId: string;
        firstName: string;
        middleName?: string | null;
        lastName: string;
        suffix?: string | null;
        sex?: string | null;
        dateOfBirth?: string | null;
        nationality?: string | null;
    },
): Promise<string> {
    return api.post<string>(getToken, '/patients', payload);
}

/**
 * Pushes queued offline changes to the backend.
 * The backend is idempotent — duplicate clientIds are counted as alreadyProcessed.
 */
export async function pushSyncPayload(
    getToken: () => Promise<string | null>,
    patientId: string,
    items: SyncItemRequest[],
): Promise<PushSyncAck> {
    return api.post<PushSyncAck>(getToken, `/patients/${patientId}/sync`, { items });
}

/**
 * Returns the backend sync log summary for a patient.
 * Useful for debugging stuck sync items.
 */
export async function getSyncStatus(
    getToken: () => Promise<string | null>,
    patientId: string,
    take = 50,
): Promise<unknown> {
    return api.get(getToken, `/patients/${patientId}/sync/status?take=${take}`);
}
