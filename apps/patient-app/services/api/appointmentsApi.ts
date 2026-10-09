import { z } from 'zod';
import { api } from './apiClient';
import { appointmentStatusSchema } from './wireEnums';

// ── Schemas ───────────────────────────────────────────────────────────────────

const clinicProviderSnapshotSchema = z.object({
    id: z.string(),
    name: z.string(),
    specialty: z.string().nullable(),
    avatarUrl: z.string().nullable(),
});
export type ClinicProviderSnapshot = z.infer<typeof clinicProviderSnapshotSchema>;

export const remoteAppointmentSchema = z.object({
    id: z.string(),
    clinicId: z.string(),
    clinicName: z.string(),
    provider: clinicProviderSnapshotSchema,
    serviceType: z.string().nullable(),
    /** ISO-8601 UTC */
    scheduledAt: z.string(),
    durationMinutes: z.number(),
    /** PascalCase member name: Pending | Confirmed | Cancelled | Completed | NoShow | ActionRequired */
    status: appointmentStatusSchema,
    notes: z.string().nullable(),
    subject: z.string().nullish(),
    chiefComplaint: z.string().nullish(),
    clinicalAssessment: z.string().nullish(),
    doctorPlan: z.string().nullish(),
    prescriptionsSummary: z.string().nullish(),
    prescriptionPublicVerificationUrl: z.string().nullish(),
});
export type RemoteAppointment = z.infer<typeof remoteAppointmentSchema>;

export const clinicAppointmentsResultSchema = z.object({
    items: z.array(remoteAppointmentSchema),
    totalCount: z.number(),
});
export type ClinicAppointmentsResult = z.infer<typeof clinicAppointmentsResultSchema>;

// ── API function ──────────────────────────────────────────────────────────────

/**
 * Fetches appointments directly from the PatientApp backend.
 */
export async function fetchAppointmentsLive(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<ClinicAppointmentsResult> {
    const data = await api.get<unknown>(getToken, `/patients/${patientId}/appointments`);
    return clinicAppointmentsResultSchema.parse(data);
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
