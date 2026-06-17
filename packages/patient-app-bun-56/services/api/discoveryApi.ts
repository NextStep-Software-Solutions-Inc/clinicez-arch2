import { api, ApiError } from './apiClient';

// ── Types mirroring DiscoveryDtos + MembershipDtos ────────────────────────────

export interface OrganizationSummary {
    id: string;
    slug: string;
    name: string;
    description: string;
    isPublic: boolean;
    logoUrl: string | null;
    coverImageUrl: string | null;
    addressHint: string | null;
    featuredScore: number;
    activeMemberCount: number;
    requiredShareFieldsJson: string;
    rolesJson: string;
}

export interface OrganizationDetail extends OrganizationSummary {
    privacyPolicyUrl: string | null;
    termsAndConditionsUrl: string | null;
    linkedClinics: ClinicSummary[];
}

export interface ClinicSummary {
    id: string;
    name: string;
    description: string | null;
    address: string | null;
    isPublic: boolean;
    supportsAppointments: boolean;
    logoUrl: string | null;
    coverImageUrl: string | null;
    specialtiesJson: string;
    requiredShareFieldsJson: string;
    featuredScore: number;
}

export interface ClinicDetail extends ClinicSummary {
    /** PatientApp backend will proxy API calls to this URL */
    baseUrl: string;
    privacyPolicyUrl: string | null;
    termsAndConditionsUrl: string | null;
    linkedOrganizations: OrganizationSummary[];
    /** "pending" | "active" | null if not joined */
    membershipStatus: string | null;
}

export interface PagedResult<T> {
    items: T[];
    totalCount: number;
    skip: number;
    take: number;
}

export interface OrganizationMembershipResult {
    id: string;
    organizationId: string;
    organizationName: string;
    roleId: string;
    roleName: string;
    status: string;
    consentDataSharing: boolean;
    consentedAt: string | null;
    createdAt: string;
}

export interface JoinConsentInput {
    consentPrivacyPolicy: boolean;
    consentTermsAndConditions: boolean;
    consentDataSharing: boolean;
}

// ── Discovery API ─────────────────────────────────────────────────────────────

export async function searchOrganizations(
    getToken: () => Promise<string | null>,
    query?: string,
    skip = 0,
    take = 20,
): Promise<PagedResult<OrganizationSummary>> {
    const params = new URLSearchParams({ skip: String(skip), take: String(take) });
    if (query?.trim()) params.set('q', query.trim());
    return api.get<PagedResult<OrganizationSummary>>(getToken, `/organizations?${params}`);
}

/**
 * Looks up an organization by invite code before the user joins.
 * Returns null if the code is invalid / not found.
 */
export async function getOrganizationByInviteCode(
    getToken: () => Promise<string | null>,
    inviteCode: string,
): Promise<OrganizationDetail | null> {
    try {
        return await api.get<OrganizationDetail>(
            getToken,
            `/organizations/by-invite/${encodeURIComponent(inviteCode.trim())}`,
        );
    } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
    }
}

export async function searchClinics(
    getToken: () => Promise<string | null>,
    query?: string,
    organizationId?: string,
    skip = 0,
    take = 20,
): Promise<PagedResult<ClinicSummary>> {
    const params = new URLSearchParams({ skip: String(skip), take: String(take) });
    if (query?.trim()) params.set('q', query.trim());
    if (organizationId) params.set('organizationId', organizationId);
    return api.get<PagedResult<ClinicSummary>>(getToken, `/clinics?${params}`);
}

/**
 * Fetches full clinic detail including linked organizations and the
 * current patient's membership status.
 */
export async function getClinicDetail(
    getToken: () => Promise<string | null>,
    clinicId: string,
    forPatientId?: string,
): Promise<ClinicDetail | null> {
    try {
        const params = forPatientId ? `?forPatientId=${forPatientId}` : '';
        return await api.get<ClinicDetail>(getToken, `/clinics/${clinicId}${params}`);
    } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
    }
}

// ── Membership API ────────────────────────────────────────────────────────────

/**
 * Joins an organization via invite code.
 * The patient must supply a valid roleId from the org's rolesJson.
 */
export async function joinOrganization(
    getToken: () => Promise<string | null>,
    patientId: string,
    inviteCode: string,
    roleId: string,
    consent: JoinConsentInput,
): Promise<OrganizationMembershipResult> {
    return api.post<OrganizationMembershipResult>(
        getToken,
        `/patients/${patientId}/organization-memberships`,
        { inviteCode, roleId, ...consent },
    );
}

/**
 * Joins a clinic directly — no invite code required, only consent.
 * Returns the new ClinicMembership server ID.
 */
export async function joinClinic(
    getToken: () => Promise<string | null>,
    patientId: string,
    clinicId: string,
    consent: JoinConsentInput,
): Promise<string> {
    return api.post<string>(getToken, `/patients/${patientId}/clinic-memberships`, {
        clinicId,
        ...consent,
    });
}
