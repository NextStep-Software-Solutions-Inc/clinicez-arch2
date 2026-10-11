import { z } from 'zod';
import { api } from './apiClient';
import {
    grantSourceSchema,
    grantStatusSchema,
    sharingScopeSchema,
    type SharingScope,
} from './wireEnums';

// ── Schemas mirroring the patient-api sharing contract ────────────────────────

export const shareTokenResponseSchema = z.object({
    token: z.string(),
    expiresAt: z.string(),
    ttlSeconds: z.number(),
    clinicEzId: z.string(),
    scopes: z.array(sharingScopeSchema),
    purpose: z.string(),
    maxRedemptions: z.number().int(),
});
export type ShareTokenResponse = z.infer<typeof shareTokenResponseSchema>;

/** One-time code: `ABCD-EFGH` (8 characters and a hyphen), valid for `ttlSeconds` (600). */
export const shareCodeResponseSchema = z.object({
    code: z.string(),
    expiresAt: z.string(),
    ttlSeconds: z.number(),
    clinicEzId: z.string(),
    scopes: z.array(sharingScopeSchema),
    purpose: z.string(),
});
export type ShareCodeResponse = z.infer<typeof shareCodeResponseSchema>;

export const accessGrantSchema = z.object({
    id: z.string(),
    tenantId: z.string(),
    facilityId: z.string(),
    facilityName: z.string().nullable(),
    scopes: z.array(sharingScopeSchema),
    purpose: z.string(),
    source: grantSourceSchema,
    status: grantStatusSchema,
    expiresAt: z.string(),
    revokedAt: z.string().nullable(),
    createdAt: z.string(),
});
export type AccessGrantDto = z.infer<typeof accessGrantSchema>;

export const accessGrantListSchema = z.array(accessGrantSchema);

export const accessLogSchema = z.object({
    id: z.string(),
    grantId: z.string(),
    facilityName: z.string().nullable(),
    actor: z.string(),
    action: z.string(),
    detail: z.string().nullable(),
    at: z.string(),
});
export type AccessLogDto = z.infer<typeof accessLogSchema>;

export const accessLogPageSchema = z.object({
    items: z.array(accessLogSchema),
    totalCount: z.number(),
});
export type AccessLogPage = z.infer<typeof accessLogPageSchema>;

// ── Sharing API ───────────────────────────────────────────────────────────────

export async function createShareToken(
    getToken: () => Promise<string | null>,
    patientId: string,
    scopes: SharingScope[],
    options: { purpose?: string; maxRedemptions?: number } = {},
): Promise<ShareTokenResponse> {
    const data = await api.post<unknown>(getToken, `/patients/${patientId}/share-tokens`, {
        scopes,
        ...(options.purpose ? { purpose: options.purpose } : {}),
        ...(options.maxRedemptions ? { maxRedemptions: options.maxRedemptions } : {}),
    });
    return shareTokenResponseSchema.parse(data);
}

export async function createShareCode(
    getToken: () => Promise<string | null>,
    patientId: string,
    scopes: SharingScope[],
    purpose?: string,
): Promise<ShareCodeResponse> {
    const data = await api.post<unknown>(getToken, `/patients/${patientId}/share-codes`, {
        scopes,
        ...(purpose ? { purpose } : {}),
    });
    return shareCodeResponseSchema.parse(data);
}

export async function fetchAccessGrants(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<AccessGrantDto[]> {
    const data = await api.get<unknown>(getToken, `/patients/${patientId}/access-grants`);
    return accessGrantListSchema.parse(data);
}

export function revokeAccessGrant(
    getToken: () => Promise<string | null>,
    patientId: string,
    grantId: string,
): Promise<void> {
    return api.delete<void>(getToken, `/patients/${patientId}/access-grants/${grantId}`);
}

export async function fetchAccessLog(
    getToken: () => Promise<string | null>,
    patientId: string,
    opts: { grantId?: string; skip?: number; take?: number } = {},
): Promise<AccessLogPage> {
    const params = new URLSearchParams({
        skip: String(opts.skip ?? 0),
        take: String(opts.take ?? 50),
    });
    if (opts.grantId) params.set('grantId', opts.grantId);
    const data = await api.get<unknown>(getToken, `/patients/${patientId}/access-log?${params}`);
    return accessLogPageSchema.parse(data);
}

/** Raw JSON document (not wrapped in the ApiResponse envelope). */
export function fetchPatientExport(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<string> {
    return api.getText(getToken, `/patients/${patientId}/export`);
}
