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
    subject?: string | null;
    chiefComplaint?: string | null;
    clinicalAssessment?: string | null;
    doctorPlan?: string | null;
    prescriptionsSummary?: string | null;
    prescriptionPublicVerificationUrl?: string | null;
}

export interface ClinicAppointmentsResult {
    items: RemoteAppointment[];
    totalCount: number;
}

// ── API function ──────────────────────────────────────────────────────────────

/**
 * Fetches appointments directly from the PatientApp backend.
 */
export async function fetchAppointmentsLive(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<ClinicAppointmentsResult> {
    return api.get<ClinicAppointmentsResult>(
        getToken,
        `/patients/${patientId}/appointments`,
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
