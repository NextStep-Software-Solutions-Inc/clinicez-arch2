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
