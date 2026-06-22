import { api } from './apiClient';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ClinicProviderSnapshot {
    id: string;
    name: string;
    specialty: string | null;
    avatarUrl: string | null;
}

export interface RemoteAppointment {
    id: string;
    clinicId: string;
    clinicName: string;
    provider: ClinicProviderSnapshot;
    serviceType: string | null;
    /** ISO-8601 UTC */
    scheduledAt: string;
    durationMinutes: number;
    /** "pending" | "confirmed" | "cancelled" | "completed" | "noShow" | "actionRequired" */
    status: string;
    notes: string | null;
}

export interface ClinicAppointmentsResult {
    items: RemoteAppointment[];
    totalCount: number;
}

// ── API function ──────────────────────────────────────────────────────────────

/**
 * Fetches appointments from a specific clinic's backend, proxied via the PatientApp API.
 * The clinicBaseUrl is the value stored in the local clinics table (clinic.baseUrl).
 */
export async function fetchClinicAppointments(
    getToken: () => Promise<string | null>,
    patientId: string,
    clinicBaseUrl: string,
): Promise<ClinicAppointmentsResult> {
    const params = new URLSearchParams({ clinicBaseUrl });
    return api.get<ClinicAppointmentsResult>(
        getToken,
        `/patients/${patientId}/clinic-appointments?${params}`,
    );
}

export interface LiveAvailableSlot {
    id: string;
    time: string;
    displayTime: string;
    period: 'morning' | 'afternoon' | 'evening';
    available: boolean;
}

export interface LiveAvailableSlotsResponse {
    date: string;
    slots: LiveAvailableSlot[];
}

export async function fetchAvailableSlotsLive(
    getToken: () => Promise<string | null>,
    clinicId: string,
    providerId: string,
    date: string,
): Promise<LiveAvailableSlotsResponse> {
    const params = new URLSearchParams({ date });
    return api.get<LiveAvailableSlotsResponse>(
        getToken,
        `/clinics/${clinicId}/providers/${providerId}/slots?${params}`,
    );
}
