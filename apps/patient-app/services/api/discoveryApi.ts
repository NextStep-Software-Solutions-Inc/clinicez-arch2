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
    membershipStatus?: 'pending' | 'active' | null;
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
    activeMemberCount: number;
    membershipStatus?: 'pending' | 'active' | null;
}

export interface ClinicProviderDto {
    id: string;
    name: string;
    specialty: string;
    avatarUrl: string | null;
    professionalLicenseNo: string | null;
}

export interface ClinicServiceDto {
    id: string;
    name: string;
    description: string | null;
    durationMinutes: number | null;
    price: number | null;
}

export interface ClinicDetail extends ClinicSummary {
    privacyPolicyUrl: string | null;
    termsAndConditionsUrl: string | null;
    linkedOrganizations: OrganizationSummary[];
    /** "pending" | "active" | null if not joined */
    membershipStatus: 'pending' | 'active' | null;
    healthcareProviders: ClinicProviderDto[];
    services: ClinicServiceDto[];
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

export interface OrganizationRoleDto {
    id: string;
    organizationId: string;
    roleId: string;
    name: string;
    description: string;
}

// ── Discovery API ─────────────────────────────────────────────────────────────

export async function searchOrganizations(
    getToken: () => Promise<string | null>,
    query?: string,
    forPatientId?: string,
    skip = 0,
    take = 20,
): Promise<PagedResult<OrganizationSummary>> {
    const params = new URLSearchParams({
        skip: skip.toString(),
        take: take.toString(),
    });
    if (query?.trim()) params.set('q', query.trim());
    if (forPatientId) params.append('forPatientId', forPatientId);
    return api.get<PagedResult<OrganizationSummary>>(getToken, `/organizations?${params}`);
}

/**
 * Fetches roles available for a specific organization.
 */
export async function getOrganizationRoles(
    getToken: () => Promise<string | null>,
    organizationId: string,
): Promise<OrganizationRoleDto[]> {
    return api.get<OrganizationRoleDto[]>(getToken, `/organizations/${organizationId}/roles`);
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
    forPatientId?: string,
    skip = 0,
    take = 20,
): Promise<PagedResult<ClinicSummary>> {
    const params = new URLSearchParams({
        skip: skip.toString(),
        take: take.toString(),
    });
    if (query?.trim()) params.set('q', query.trim());
    if (organizationId) params.set('organizationId', organizationId);
    if (forPatientId) params.append('forPatientId', forPatientId);
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
    organizationId: string | null,
    inviteCode: string | null,
    roleId: string,
    consent: JoinConsentInput,
): Promise<OrganizationMembershipResult> {
    return api.post<OrganizationMembershipResult>(
        getToken,
        `/patients/${patientId}/organization-memberships`,
        { organizationId, inviteCode, roleId, ...consent },
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

/**
 * Cancels an organization membership (either pending or active).
 */
export async function cancelOrganizationMembership(
    getToken: () => Promise<string | null>,
    patientId: string,
    organizationId: string,
): Promise<boolean> {
    return api.delete<boolean>(getToken, `/patients/${patientId}/organization-memberships/${organizationId}`);
}

/**
 * Cancels a clinic membership (either pending or active).
 */
export async function cancelClinicMembership(
    getToken: () => Promise<string | null>,
    patientId: string,
    clinicId: string,
): Promise<boolean> {
    return api.delete<boolean>(getToken, `/patients/${patientId}/clinic-memberships/${clinicId}`);
}

