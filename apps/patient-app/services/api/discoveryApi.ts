import { z } from 'zod';
import { api, ApiError } from './apiClient';
import { membershipStatusSchema } from './wireEnums';

// ── Schemas mirroring DiscoveryDtos + MembershipDtos ──────────────────────────
// `membershipStatus` is the PascalCase member name ("Pending" | "Active") or null when not joined.

const organizationSummarySchema = z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    isPublic: z.boolean(),
    logoUrl: z.string().nullable(),
    coverImageUrl: z.string().nullable(),
    addressHint: z.string().nullable(),
    featuredScore: z.number(),
    activeMemberCount: z.number(),
    requiredShareFieldsJson: z.string(),
    rolesJson: z.string(),
    membershipStatus: membershipStatusSchema.nullish(),
});
export type OrganizationSummary = z.infer<typeof organizationSummarySchema>;

const clinicSummarySchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    address: z.string().nullable(),
    isPublic: z.boolean(),
    supportsAppointments: z.boolean(),
    isGated: z.boolean().optional(),
    isUnlocked: z.boolean().optional(),
    isOnlineBookingPaused: z.boolean().optional(),
    operatingHours: z.string().nullable().optional(),
    isPhilHealthAccredited: z.boolean().optional(),
    contactNumber: z.string().nullable().optional(),
    contactEmail: z.string().nullable().optional(),
    logoUrl: z.string().nullable(),
    coverImageUrl: z.string().nullable(),
    specialtiesJson: z.string(),
    requiredShareFieldsJson: z.string(),
    featuredScore: z.number(),
    activeMemberCount: z.number(),
    membershipStatus: membershipStatusSchema.nullish(),
});
export type ClinicSummary = z.infer<typeof clinicSummarySchema>;

const organizationDetailSchema = organizationSummarySchema.extend({
    privacyPolicyUrl: z.string().nullable(),
    termsAndConditionsUrl: z.string().nullable(),
    linkedClinics: z.array(clinicSummarySchema),
});
export type OrganizationDetail = z.infer<typeof organizationDetailSchema>;

const clinicProviderSchema = z.object({
    id: z.string(),
    name: z.string(),
    specialty: z.string(),
    avatarUrl: z.string().nullable(),
    professionalLicenseNo: z.string().nullable(),
});
export type ClinicProviderDto = z.infer<typeof clinicProviderSchema>;

const clinicServiceSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    durationMinutes: z.number().nullable(),
    price: z.number().nullable(),
});
export type ClinicServiceDto = z.infer<typeof clinicServiceSchema>;

const clinicDetailSchema = clinicSummarySchema.extend({
    privacyPolicyUrl: z.string().nullable(),
    termsAndConditionsUrl: z.string().nullable(),
    linkedOrganizations: z.array(organizationSummarySchema),
    membershipStatus: membershipStatusSchema.nullable(),
    healthcareProviders: z.array(clinicProviderSchema),
    services: z.array(clinicServiceSchema),
});
export type ClinicDetail = z.infer<typeof clinicDetailSchema>;

function pagedSchema<T extends z.ZodType>(item: T) {
    return z.object({
        items: z.array(item),
        totalCount: z.number(),
        skip: z.number(),
        take: z.number(),
    });
}
export interface PagedResult<T> {
    items: T[];
    totalCount: number;
    skip: number;
    take: number;
}

const organizationMembershipResultSchema = z.object({
    id: z.string(),
    organizationId: z.string(),
    organizationName: z.string(),
    roleId: z.string(),
    roleName: z.string(),
    status: membershipStatusSchema,
    consentDataSharing: z.boolean(),
    consentedAt: z.string().nullable(),
    createdAt: z.string(),
});
export type OrganizationMembershipResult = z.infer<typeof organizationMembershipResultSchema>;
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
    const data = await api.get<unknown>(getToken, `/organizations?${params}`);
    return pagedSchema(organizationSummarySchema).parse(data);
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
        const data = await api.get<unknown>(
            getToken,
            `/organizations/by-invite/${encodeURIComponent(inviteCode.trim())}`,
        );
        return organizationDetailSchema.parse(data);
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
    const data = await api.get<unknown>(getToken, `/clinics?${params}`);
    return pagedSchema(clinicSummarySchema).parse(data);
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
        const data = await api.get<unknown>(getToken, `/clinics/${clinicId}${params}`);
        return clinicDetailSchema.parse(data);
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
    const data = await api.post<unknown>(
        getToken,
        `/patients/${patientId}/organization-memberships`,
        { organizationId, inviteCode, roleId, ...consent },
    );
    return organizationMembershipResultSchema.parse(data);
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

// ── Unlock Gated Clinic API ──────────────────────────────────────────────────

export const unlockClinicResultSchema = z.object({
    success: z.boolean().optional(),
    isUnlocked: z.boolean(),
    membershipId: z.string().nullable().optional(),
    message: z.string().nullable().optional(),
});
export type UnlockClinicResult = z.infer<typeof unlockClinicResultSchema>;

export interface UnlockClinicAccessInput {
    joinCode?: string;
    organizationId?: string;
    consentPrivacyPolicy?: boolean;
    consentTermsAndConditions?: boolean;
    consentDataSharing?: boolean;
}

/**
 * Submits an unlock request for a gated clinic using a 6-character Join Code
 * or linked partner Organization ID.
 *
 * Backend endpoint: POST /api/v1/clinics/{clinicId}/unlock
 */
export async function unlockClinic(
    getToken: () => Promise<string | null>,
    clinicId: string,
    input: UnlockClinicAccessInput,
): Promise<UnlockClinicResult> {
    const data = await api.post<unknown>(
        getToken,
        `/clinics/${encodeURIComponent(clinicId)}/unlock`,
        input,
    );
    return unlockClinicResultSchema.parse(data);
}

