import type { SharingScope } from '../sharing/scopes';
import { api } from './apiClient';

// ── Types mirroring the patient-api sharing contract ──────────────────────────

export interface ShareTokenResponse {
    token: string;
    expiresAt: string;
    ttlSeconds: number;
    clinicEzId: string;
    scopes: string[];
    purpose: string;
}

export type AccessGrantSource = 'qr' | 'booking' | 'manual';
export type AccessGrantStatus = 'active' | 'expired' | 'revoked';

export interface AccessGrantDto {
    id: string;
    tenantId: string;
    facilityId: string;
    facilityName: string | null;
    scopes: string[];
    purpose: string;
    source: AccessGrantSource;
    status: AccessGrantStatus;
    expiresAt: string;
    revokedAt: string | null;
    createdAt: string;
}

export interface AccessLogDto {
    id: string;
    grantId: string;
    facilityName: string | null;
    actor: string;
    action: string;
    detail: string | null;
    at: string;
}

export interface AccessLogPage {
    items: AccessLogDto[];
    totalCount: number;
}

// ── Sharing API ───────────────────────────────────────────────────────────────

export function createShareToken(
    getToken: () => Promise<string | null>,
    patientId: string,
    scopes: SharingScope[],
    purpose?: string,
): Promise<ShareTokenResponse> {
    return api.post<ShareTokenResponse>(getToken, `/patients/${patientId}/share-tokens`, {
        scopes,
        ...(purpose ? { purpose } : {}),
    });
}

export function fetchAccessGrants(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<AccessGrantDto[]> {
    return api.get<AccessGrantDto[]>(getToken, `/patients/${patientId}/access-grants`);
}

export function revokeAccessGrant(
    getToken: () => Promise<string | null>,
    patientId: string,
    grantId: string,
): Promise<void> {
    return api.delete<void>(getToken, `/patients/${patientId}/access-grants/${grantId}`);
}

export function fetchAccessLog(
    getToken: () => Promise<string | null>,
    patientId: string,
    opts: { grantId?: string; skip?: number; take?: number } = {},
): Promise<AccessLogPage> {
    const params = new URLSearchParams({
        skip: String(opts.skip ?? 0),
        take: String(opts.take ?? 50),
    });
    if (opts.grantId) params.set('grantId', opts.grantId);
    return api.get<AccessLogPage>(getToken, `/patients/${patientId}/access-log?${params}`);
}

/** Raw JSON document (not wrapped in the ApiResponse envelope). */
export function fetchPatientExport(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<string> {
    return api.getText(getToken, `/patients/${patientId}/export`);
}
