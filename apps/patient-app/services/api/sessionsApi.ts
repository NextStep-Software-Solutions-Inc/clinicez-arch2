import { z } from 'zod';
import { api } from './apiClient';

// ── Schemas mirroring the patient-api device-session contract ─────────────────

export const registerSessionResponseSchema = z.object({
    sessionId: z.string(),
    deviceId: z.string(),
    deviceLabel: z.string(),
    issuedAt: z.string(),
});
export type RegisterSessionResponse = z.infer<typeof registerSessionResponseSchema>;

export const deviceSessionSchema = z.object({
    id: z.string(),
    deviceId: z.string(),
    deviceLabel: z.string(),
    createdAt: z.string(),
    lastActiveAt: z.string(),
});
export type DeviceSessionDto = z.infer<typeof deviceSessionSchema>;

export const deviceSessionListSchema = z.array(deviceSessionSchema);

export interface RegisterDeviceSessionInput {
    deviceId: string;
    deviceLabel: string;
    clerkSessionId: string;
    pushToken?: string;
}

// ── Device sessions API ───────────────────────────────────────────────────────

/** Upserts this device's session; never signs out the patient's other devices. */
export async function registerDeviceSessionOnBackend(
    getToken: () => Promise<string | null>,
    patientId: string,
    input: RegisterDeviceSessionInput,
): Promise<RegisterSessionResponse> {
    const data = await api.post<unknown>(getToken, `/patients/${patientId}/sessions`, {
        deviceId: input.deviceId,
        deviceLabel: input.deviceLabel,
        clerkSessionId: input.clerkSessionId,
        ...(input.pushToken ? { pushToken: input.pushToken } : {}),
    });
    return registerSessionResponseSchema.parse(data);
}

/** Active sessions of the patient, most recently active first. */
export async function fetchDeviceSessions(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<DeviceSessionDto[]> {
    const data = await api.get<unknown>(getToken, `/patients/${patientId}/sessions`);
    return deviceSessionListSchema.parse(data);
}

/** Signs out a single device. The API answers 404 when it is no longer an active session. */
export function revokeDeviceSession(
    getToken: () => Promise<string | null>,
    patientId: string,
    sessionId: string,
): Promise<void> {
    return api.delete<void>(getToken, `/patients/${patientId}/sessions/${sessionId}`);
}

/** Signs the patient out of every device. */
export function revokeAllDeviceSessions(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<void> {
    return api.delete<void>(getToken, `/patients/${patientId}/sessions`);
}
