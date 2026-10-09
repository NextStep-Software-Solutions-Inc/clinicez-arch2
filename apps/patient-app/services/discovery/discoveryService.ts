import { and, count, desc, eq, inArray, not } from 'drizzle-orm';
import NetInfo from '@react-native-community/netinfo';
import { db } from '@db/index';
import { bookingDrafts } from '@db/schema/bookingDrafts';
import { clinicMemberships } from '@db/schema/clinicMemberships';
import { clinicOrganizationLinks } from '@db/schema/clinicOrganizationLinks';
import { clinics } from '@db/schema/clinics';
import { consultations } from '@db/schema/consultations';
import { organizationMemberships } from '@db/schema/organizationMemberships';
import { organizations } from '@db/schema/organizations';
import { patients } from '@db/schema/patients';
import { vitalSigns } from '@db/schema/vitalSigns';
import {
    searchOrganizations as apiSearchOrgs,
    searchClinics as apiSearchClinics,
    getOrganizationByInviteCode as apiGetOrgByInvite,
    getClinicDetail as apiGetClinicDetail,
    joinOrganization as apiJoinOrg,
    joinClinic as apiJoinClinic,
    cancelOrganizationMembership as apiCancelOrgMembership,
    cancelClinicMembership as apiCancelClinicMembership,
    type OrganizationSummary as RemoteOrgSummary,
    type OrganizationDetail as RemoteOrgDetail,
    type ClinicSummary as RemoteClinicSummary,
    type ClinicDetail as RemoteClinicDetail,
    type JoinConsentInput,
} from '../api/discoveryApi';
import { createBookingDraft as apiCreateDraft, submitBookingDraft as apiSubmitDraft } from '../api/bookingApi';
import { ApiError } from '../api/apiClient';
import { localMembershipStatus } from './membershipStatus';

import {
    AppointmentLineupItem,
    BookingDraftInput,
    BookingDraftRecord,
    ClinicDetail,
    ClinicEntity,
    ClinicProvider,
    ClinicView,
    ConsentSelection,
    HealthMetric,
    HomeDashboard,
    HomeSummary,
    JoinClinicInput,
    JoinOrganizationInput,
    OrganizationDetail,
    OrganizationEntity,
    OrganizationRole,
    OrganizationView,
    ShareableFieldKey,
} from './types';

const shareFieldLabels: Record<ShareableFieldKey, string> = {
    fullName: 'Full name',
    dateOfBirth: 'Date of birth',
    sex: 'Sex',
    mobile: 'Mobile number',
    email: 'Email address',
    address: 'Address',
    emergencyContact: 'Emergency contact',
    philhealthId: 'PhilHealth ID',
};



const regions = [
    'Metro Manila',
    'Central Luzon',
    'Calabarzon',
    'Northern Mindanao',
    'Western Visayas',
    'Central Visayas',
    'Bicol Region',
    'Ilocos Region',
    'Davao Region',
    'Cordillera',
];

const organizationThemes = [
    'Family Wellness Network',
    'Care Circle Alliance',
    'Community Health Collective',
    'Patient Advocacy Guild',
    'Telehealth Partner Hub',
    'Alumni Care Society',
    'Workforce Wellness Network',
    'Senior Care Network',
    'Mothers Care Cooperative',
    'Chronic Care Alliance',
    'Student Wellness League',
    'Regional Care Consortium',
];

const clinicSpecialties = [
    'Family Medicine',
    'Internal Medicine',
    'Pediatrics',
    'Cardiology',
    'OB-GYN',
    'Dermatology',
    'Dentistry',
    'Diagnostics',
    'Rehabilitation',
    'Behavioral Health',
    'Endocrinology',
    'Pulmonology',
];

const requiredFieldSets: ShareableFieldKey[][] = [
    ['fullName', 'mobile', 'email'],
    ['fullName', 'dateOfBirth', 'mobile'],
    ['fullName', 'sex', 'mobile', 'email'],
    ['fullName', 'dateOfBirth', 'sex', 'philhealthId'],
    ['fullName', 'mobile', 'address'],
    ['fullName', 'dateOfBirth', 'mobile', 'emergencyContact'],
];

function slugify(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function now(): Date {
    return new Date();
}

function parseMembershipStatus(status?: string | null): 'pending' | 'active' | undefined {
    return status === 'active' || status === 'pending' ? status : undefined;
}

function getId(prefix: string, index: number): string {
    return `${prefix}-${String(index + 1).padStart(3, '0')}`;
}

function getRolesForIndex(index: number): OrganizationRole[] {
    if (index % 6 === 0) {
        return [
            { id: 'member', name: 'Member', description: 'General community access.' },
            { id: 'coordinator', name: 'Coordinator', description: 'Helps coordinate member programs.' },
            { id: 'officer', name: 'Officer', description: 'Administrative access for officers.' },
        ];
    }

    if (index % 3 === 0) {
        return [
            { id: 'member', name: 'Member', description: 'General community access.' },
            { id: 'lead', name: 'Lead', description: 'Guides member activity and support.' },
        ];
    }

    return [
        { id: 'member', name: 'Member', description: 'General community access.' },
        { id: 'volunteer', name: 'Volunteer', description: 'Support volunteer participation.' },
    ];
}

function getRequiredFieldsForIndex(index: number): ShareableFieldKey[] {
    return requiredFieldSets[index % requiredFieldSets.length];
}

function buildOrganizationSeed() {
    const timestamp = now();
    const organizationsSeed = Array.from({ length: 120 }, (_, index) => {
        const region = regions[index % regions.length];
        const theme = organizationThemes[index % organizationThemes.length];
        const domain = theme.split(' ')[0];
        const isPublic = index % 5 !== 0;
        const slug = slugify(`${domain}-${region}-${index + 1}`);
        const inviteCode = isPublic ? null : `INV-${String(index + 1).padStart(4, '0')}`;
        const requiredShareFields = getRequiredFieldsForIndex(index);
        const roles = getRolesForIndex(index);

        return {
            id: getId('org', index),
            slug,
            name: `${region} ${theme}`,
            description: `A ${isPublic ? 'public' : 'private'} patient community for ${region.toLowerCase()} members who want coordinated care and partner clinic access.`,
            logoUrl: `https://picsum.photos/seed/org-logo-${index}/80/80`,
            coverImageUrl: `https://picsum.photos/seed/org-cover-${index}/400/180`,
            addressHint: region,
            isPublic,
            inviteCode,
            privacyPolicyUrl: `https://Clinic EZ.app/privacy/${slug}`,
            termsAndConditionsUrl: `https://Clinic EZ.app/terms/${slug}`,
            rolesJson: JSON.stringify(roles),
            requiredShareFieldsJson: JSON.stringify(requiredShareFields),
            featuredScore: 120 - index,
            createdAt: timestamp,
            updatedAt: timestamp,
            syncedAt: timestamp,
            serverId: null,
        };
    });

    const clinicsSeed = Array.from({ length: 120 }, (_, index) => {
        const region = regions[index % regions.length];
        const specialty = clinicSpecialties[index % clinicSpecialties.length];
        const isPublic = index % 6 !== 0;
        const supportsAppointments = index % 8 !== 0;
        const slug = slugify(`${specialty}-${region}-${index + 1}`);
        const requiredShareFields = getRequiredFieldsForIndex(index + 2);

        return {
            id: getId('clinic', index),
            name: `${region} ${specialty} Clinic`,
            address: `${region}, Philippines`,
            description: `A ${isPublic ? 'public' : 'private'} ${specialty.toLowerCase()} clinic built for online consultations and follow-up care.`,
            logoUrl: `https://picsum.photos/seed/clinic-logo-${index}/80/80`,
            coverImageUrl: `https://picsum.photos/seed/clinic-cover-${index}/400/180`,
            isPublic,
            supportsAppointments,
            inviteCode: isPublic ? null : `CLN-${String(index + 1).padStart(4, '0')}`,
            privacyPolicyUrl: `https://Clinic EZ.app/privacy/${slug}`,
            termsAndConditionsUrl: `https://Clinic EZ.app/terms/${slug}`,
            specialtiesJson: JSON.stringify([specialty, supportsAppointments ? 'Telehealth' : 'Virtual Follow-Up']),
            requiredShareFieldsJson: JSON.stringify(requiredShareFields),
            joinedAt: timestamp,
            syncedAt: timestamp,
        };
    });

    const linksSeed = organizationsSeed.flatMap((org, index) => {
        const firstClinic = clinicsSeed[index % clinicsSeed.length];
        const secondClinic = clinicsSeed[(index + 11) % clinicsSeed.length];
        const thirdClinic = clinicsSeed[(index + 27) % clinicsSeed.length];

        return [
            {
                id: `${org.id}:${firstClinic.id}`,
                clinicId: firstClinic.id,
                organizationId: org.id,
                relationType: 'partnered' as const,
                isActive: true,
                createdAt: timestamp,
                updatedAt: timestamp,
                syncedAt: timestamp,
            },
            {
                id: `${org.id}:${secondClinic.id}`,
                clinicId: secondClinic.id,
                organizationId: org.id,
                relationType: index % 3 === 0 ? ('sponsored' as const) : ('partnered' as const),
                isActive: true,
                createdAt: timestamp,
                updatedAt: timestamp,
                syncedAt: timestamp,
            },
            {
                id: `${org.id}:${thirdClinic.id}`,
                clinicId: thirdClinic.id,
                organizationId: org.id,
                relationType: 'referral' as const,
                isActive: true,
                createdAt: timestamp,
                updatedAt: timestamp,
                syncedAt: timestamp,
            },
        ];
    });

    return { organizationsSeed, clinicsSeed, linksSeed };
}

function parseJsonArray<T>(value: string | null | undefined, fallback: T[]): T[] {
    if (!value) return fallback;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

const providerFirstNames = ['Maria', 'Jose', 'Ana', 'Juan', 'Sofia', 'Carlos', 'Elena', 'Miguel', 'Rosa', 'Luis', 'Patricia', 'Eduardo'];
const providerLastNames = ['Santos', 'Reyes', 'Cruz', 'Garcia', 'Lopez', 'Bautista', 'Mendoza', 'Torres', 'Ramos', 'Dela Cruz', 'Gonzales', 'Castillo'];
const providerCredentials = ['MD', 'MD-FPCP', 'MD-FPOGS', 'MD-FPSCC', 'MD-FPCM', 'RN', 'RND', 'RPh', 'DDS', 'PT'];

function buildProvidersForClinic(clinicId: string, clinicName: string, specialty: string): ClinicProvider[] {
    const baseIndex = parseInt(clinicId.replace('clinic-', ''), 10) - 1;
    const count = 2 + (baseIndex % 4);
    return Array.from({ length: count }, (_, i) => {
        const nameIdx = (baseIndex * 7 + i * 13) % providerFirstNames.length;
        const lastIdx = (nameIdx + 3) % providerLastNames.length;
        const credIdx = (baseIndex + i * 3) % providerCredentials.length;
        const cred = providerCredentials[credIdx];
        // Generate a deterministic rating between 3.5–5.0
        const rawRating = 3.5 + ((baseIndex * 3 + i * 7) % 16) * 0.1;
        const rating = Math.round(rawRating * 10) / 10;
        return {
            id: `provider-${clinicId}-${i + 1}`,
            name: `Dr. ${providerFirstNames[nameIdx]} ${providerLastNames[lastIdx]}`,
            specialty,
            avatarUrl: `https://picsum.photos/seed/prov-${clinicId}-${i}/80/80`,
            bio: `${cred} specializing in ${specialty.toLowerCase()} at ${clinicName}.`,
            credentials: [cred],
            rating,
        } satisfies ClinicProvider;
    });
}



function hasAllConsent(consent: ConsentSelection): boolean {
    return consent.acceptedDataSharing && consent.acceptedPrivacyPolicy && consent.acceptedTermsAndConditions;
}

function sortByFeatured<T extends { featuredScore: number; name: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => b.featuredScore - a.featuredScore || a.name.localeCompare(b.name));
}

function normalizeQuery(query: string): string {
    return query.trim().toLowerCase();
}

function searchMatch(value: string, query: string): boolean {
    if (!query) return true;
    return value.toLowerCase().includes(query);
}

async function withLatency<T>(value: T): Promise<T> {
    return new Promise((resolve) => {
        setTimeout(() => resolve(value), 140);
    });
}

export async function seedCatalog(): Promise<boolean> {
    const existing = await db.select({ count: count() }).from(organizations);
    if ((existing[0]?.count ?? 0) > 0) return false;

    const { organizationsSeed, clinicsSeed, linksSeed } = buildOrganizationSeed();
    await db.insert(organizations).values(organizationsSeed);
    await db.insert(clinics).values(clinicsSeed);
    await db.insert(clinicOrganizationLinks).values(linksSeed);
    return true;
}

function mapOrganizationRows(rows: Array<Record<string, any>>) {
    return rows.map((row) => ({
        id: row.id as string,
        slug: row.slug as string,
        name: row.name as string,
        description: row.description as string,
        isPublic: Boolean(row.isPublic),
        logoUrl: row.logoUrl ?? undefined,
        coverImageUrl: row.coverImageUrl ?? undefined,
        inviteCode: row.inviteCode ?? undefined,
        addressHint: row.addressHint ?? undefined,
        privacyPolicyUrl: row.privacyPolicyUrl as string,
        termsAndConditionsUrl: row.termsAndConditionsUrl as string,
        roles: parseJsonArray<OrganizationRole>(row.rolesJson, [{ id: 'member', name: 'Member', description: 'General access.' }]),
        requiredShareFields: parseJsonArray<ShareableFieldKey>(row.requiredShareFieldsJson, ['fullName', 'mobile']),
        partneredClinicIds: [] as string[],
        featuredScore: Number(row.featuredScore ?? 0),
        activeMemberCount: Number(row.activeMemberCount ?? 0),
    } as OrganizationEntity));
}

function mapClinicRows(rows: Array<Record<string, any>>) {
    return rows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
        description: row.description ?? '',
        address: row.address ?? '',
        isPublic: Boolean(row.isPublic),
        supportsAppointments: Boolean(row.supportsAppointments ?? true),
        organizationIds: [] as string[],
        requiredShareFields: parseJsonArray<ShareableFieldKey>(row.requiredShareFieldsJson, ['fullName', 'mobile']),
        privacyPolicyUrl: row.privacyPolicyUrl ?? 'https://Clinic EZ.app/privacy',
        termsAndConditionsUrl: row.termsAndConditionsUrl ?? 'https://Clinic EZ.app/terms',
        logoUrl: row.logoUrl ?? undefined,
        coverImageUrl: row.coverImageUrl ?? undefined,
        specialties: parseJsonArray<string>(row.specialtiesJson, []),
        featuredScore: Number(row.featuredScore ?? 0),
        activeMemberCount: Number(row.activeMemberCount ?? 0),
    } as ClinicEntity));
}

async function loadCatalogSnapshot(patientId: string) {

    const [organizationRows, clinicRows, linkRows, organizationMembershipRows, clinicMembershipRows, bookingDraftRows, patientRows, vitalRows, consultationRows] =
        await Promise.all([
            db.select().from(organizations),
            db.select().from(clinics),
            db.select().from(clinicOrganizationLinks),
            db.select().from(organizationMemberships).where(eq(organizationMemberships.patientId, patientId)),
            db.select().from(clinicMemberships).where(eq(clinicMemberships.patientId, patientId)),
            db.select().from(bookingDrafts).where(eq(bookingDrafts.patientId, patientId)),
            db.select().from(patients).where(eq(patients.id, patientId)).limit(1),
            db.select().from(vitalSigns).where(eq(vitalSigns.patientId, patientId)),
            db.select().from(consultations).where(eq(consultations.patientId, patientId)),
        ]);

    const organizationViewRows = mapOrganizationRows(organizationRows as Array<Record<string, any>>);
    const clinicViewRows = mapClinicRows(clinicRows as Array<Record<string, any>>);

    const orgToClinicIds = new Map<string, string[]>();
    const clinicToOrgIds = new Map<string, string[]>();

    for (const link of linkRows as Array<Record<string, any>>) {
        if (!link.isActive) continue;
        const clinicId = String(link.clinicId);
        const organizationId = String(link.organizationId);

        const orgClinicList = orgToClinicIds.get(organizationId) ?? [];
        if (!orgClinicList.includes(clinicId)) orgClinicList.push(clinicId);
        orgToClinicIds.set(organizationId, orgClinicList);

        const clinicOrgList = clinicToOrgIds.get(clinicId) ?? [];
        if (!clinicOrgList.includes(organizationId)) clinicOrgList.push(organizationId);
        clinicToOrgIds.set(clinicId, clinicOrgList);
    }

    const organizationsWithRelations = organizationViewRows.map((organization) => {
        const linkedClinicIds = orgToClinicIds.get(organization.id) ?? [];
        const linkedClinics = clinicViewRows.filter((clinic) => linkedClinicIds.includes(clinic.id));
        const membership = organizationMembershipRows.find((item: Record<string, any>) => String(item.organizationId) === organization.id);

        return {
            ...organization,
            partneredClinicIds: linkedClinicIds,
            isJoined: membership?.status === 'active',
            membershipStatus: parseMembershipStatus(membership?.status),
            membershipRoleName: membership?.roleName,
            linkedClinics,
        } satisfies OrganizationDetail;
    });

    const clinicsWithRelations = clinicViewRows.map((clinic) => {
        const organizationIds = clinicToOrgIds.get(clinic.id) ?? [];
        const linkedOrganizations = organizationViewRows.filter((organization) => organizationIds.includes(organization.id));
        const membership = clinicMembershipRows.find((item: Record<string, any>) => String(item.clinicId) === clinic.id);
        const unlockedByOrganizationIds = organizationIds.filter((organizationId) =>
            organizationMembershipRows.some((membershipRow: Record<string, any>) => String(membershipRow.organizationId) === organizationId && membershipRow.status === 'active'),
        );
        const isJoined = membership?.status === 'active';
        const isVisible = clinic.isPublic || isJoined || unlockedByOrganizationIds.length > 0;

        return {
            ...clinic,
            organizationIds,
            linkedOrganizations,
            isJoined,
            isVisible,
            unlockedByOrganizationIds,
            membershipStatus: parseMembershipStatus(membership?.status),
            healthcareProviders: [],
            services: [],
        } satisfies ClinicDetail;
    });

    const patient = patientRows[0] as Record<string, any> | undefined;
    const latestVital = [...(vitalRows as Array<Record<string, any>>)].sort((a, b) => String(b.measuredAt).localeCompare(String(a.measuredAt)))[0];
    const nextConsultations = [...(consultationRows as Array<Record<string, any>>)]
        .filter((consultation) => Boolean(consultation.followUpDate))
        .sort((a, b) => String(a.followUpDate).localeCompare(String(b.followUpDate)))
        .slice(0, 3);

    return {
        organizations: organizationsWithRelations,
        clinics: clinicsWithRelations,
        organizationMembershipRows,
        clinicMembershipRows,
        bookingDraftRows,
        patient,
        latestVital,
        nextConsultations,
    };
}

function createHomeSummary(snapshot: Awaited<ReturnType<typeof loadCatalogSnapshot>>): HomeSummary {
    const joinedOrganizations = snapshot.organizationMembershipRows.filter((row) => row.status === 'active').length;
    const joinedClinics = snapshot.clinicMembershipRows.filter((row) => row.status === 'active').length;
    const availablePublicOrganizations = snapshot.organizations.filter((organization) => organization.isPublic).length;
    const availablePublicClinics = snapshot.clinics.filter((clinic) => clinic.isPublic).length;

    const suggestedActions: string[] = [];
    if (joinedOrganizations === 0) {
        suggestedActions.push('Join a community organization to unlock partner clinic access.');
    }
    if (joinedClinics === 0) {
        suggestedActions.push('Join a clinic to start preparing consultation booking drafts.');
    }
    if (snapshot.bookingDraftRows.length === 0) {
        suggestedActions.push('Create your first booking draft from a clinic detail page.');
    }
    if (suggestedActions.length === 0) {
        suggestedActions.push('Review next appointments and continue exploring care options.');
    }

    return {
        joinedOrganizations,
        joinedClinics,
        availablePublicOrganizations,
        availablePublicClinics,
        suggestedActions,
    };
}

function createHealthMetrics(snapshot: Awaited<ReturnType<typeof loadCatalogSnapshot>>): HealthMetric[] {
    const latestVital = snapshot.latestVital as Record<string, any> | undefined;
    const consultCount = snapshot.nextConsultations.length;

    return [
        {
            label: 'Blood Pressure',
            value: latestVital?.bpSystolic && latestVital?.bpDiastolic ? `${latestVital.bpSystolic}/${latestVital.bpDiastolic}` : '—',
            note: 'Latest recorded vitals',
        },
        {
            label: 'BMI',
            value: latestVital?.bmi ? Number(latestVital.bmi).toFixed(1) : '—',
            note: 'Body composition trend',
        },
        {
            label: 'FBS',
            value: latestVital?.fastingBloodGlucose ? `${Number(latestVital.fastingBloodGlucose).toFixed(0)} mg/dL` : '—',
            note: 'Fasting blood glucose',
        },
        {
            label: 'Follow-ups',
            value: String(consultCount),
            note: 'Upcoming appointment lineup',
        },
    ];
}

function createAppointmentLineup(snapshot: Awaited<ReturnType<typeof loadCatalogSnapshot>>): AppointmentLineupItem[] {
    const draftLineup = snapshot.bookingDraftRows.map((row) => ({
        id: String(row.id),
        clinicId: String(row.clinicId),
        title: 'Booking draft',
        subtitle: snapshot.clinics.find((clinic) => clinic.id === row.clinicId)?.name ?? 'Clinic draft',
        dateLabel: row.preferredDate ?? 'TBD',
        timeLabel: row.preferredTime ?? 'TBD',
        status: 'draft' as const,
    }));

    const followUps = snapshot.nextConsultations.map((consultation: Record<string, any>) => ({
        id: String(consultation.id),
        clinicId: String(consultation.clinicId ?? ''),
        title: String(consultation.primaryDiagnosis ?? consultation.clinicName ?? 'Upcoming follow-up'),
        subtitle: String(consultation.doctorName ?? 'Care provider'),
        dateLabel: String(consultation.followUpDate ?? consultation.visitDate ?? 'TBD'),
        timeLabel: 'Scheduled',
        status: 'follow-up' as const,
    }));

    return [...draftLineup, ...followUps].slice(0, 4);
}

function createRecentConsultationSummary(snapshot: Awaited<ReturnType<typeof loadCatalogSnapshot>>): string[] {
    return snapshot.nextConsultations.map((consultation: Record<string, any>) => {
        const clinicName = String(consultation.clinicName ?? 'Clinic visit');
        const diagnosis = String(consultation.primaryDiagnosis ?? 'Review pending');
        const followUpDate = String(consultation.followUpDate ?? '');
        return `${clinicName} · ${diagnosis}${followUpDate ? ` · Follow-up ${followUpDate}` : ''}`;
    });
}

function serializeShareFields(fields: ShareableFieldKey[]): string {
    return JSON.stringify(fields);
}

function getMembershipId(prefix: string, patientId: string, entityId: string): string {
    return `${prefix}:${patientId}:${entityId}`;
}

function buildOrganizationPayload(row: Record<string, any>): OrganizationEntity {
    return {
        id: String(row.id),
        slug: String(row.slug),
        name: String(row.name),
        description: String(row.description ?? ''),
        isPublic: Boolean(row.isPublic),
        logoUrl: row.logoUrl ?? undefined,
        coverImageUrl: row.coverImageUrl ?? undefined,
        inviteCode: row.inviteCode ?? undefined,
        addressHint: row.addressHint ?? undefined,
        privacyPolicyUrl: String(row.privacyPolicyUrl),
        termsAndConditionsUrl: String(row.termsAndConditionsUrl),
        roles: parseJsonArray<OrganizationRole>(String(row.rolesJson ?? '[]'), [{ id: 'member', name: 'Member', description: 'General access.' }]),
        requiredShareFields: parseJsonArray<ShareableFieldKey>(String(row.requiredShareFieldsJson ?? '[]'), ['fullName', 'mobile']),
        partneredClinicIds: [],
        featuredScore: Number(row.featuredScore ?? 0),
        activeMemberCount: Number(row.activeMemberCount ?? 0),
    };
}

function buildClinicPayload(row: Record<string, any>): ClinicEntity {
    return {
        id: String(row.id),
        name: String(row.name),
        description: String(row.description ?? ''),
        address: String(row.address ?? ''),
        isPublic: Boolean(row.isPublic),
        supportsAppointments: Boolean(row.supportsAppointments ?? true),
        organizationIds: [],
        requiredShareFields: parseJsonArray<ShareableFieldKey>(String(row.requiredShareFieldsJson ?? '[]'), ['fullName', 'mobile']),
        privacyPolicyUrl: String(row.privacyPolicyUrl ?? 'https://Clinic EZ.app/privacy'),
        termsAndConditionsUrl: String(row.termsAndConditionsUrl ?? 'https://Clinic EZ.app/terms'),
        logoUrl: row.logoUrl ?? undefined,
        coverImageUrl: row.coverImageUrl ?? undefined,
        specialties: parseJsonArray<string>(String(row.specialtiesJson ?? '[]'), []),
        featuredScore: Number(row.featuredScore ?? 0),
        activeMemberCount: Number(row.activeMemberCount ?? 0),
    };
}

async function updateOrganizationCache(patientId: string, remoteOrgs: RemoteOrgSummary[]) {
    const memberships = await db.select({ orgId: organizationMemberships.organizationId })
        .from(organizationMemberships)
        .where(eq(organizationMemberships.patientId, patientId));
    const joinedOrgIds = memberships.map(m => m.orgId);

    let orgIdsToKeep = [...joinedOrgIds];

    const clinicMembershipsList = await db.select({ clinicId: clinicMemberships.clinicId })
        .from(clinicMemberships)
        .where(eq(clinicMemberships.patientId, patientId));
    const joinedClinicIds = clinicMembershipsList.map(m => m.clinicId);

    let clinicIdsToKeep = [...joinedClinicIds];

    if (joinedOrgIds.length > 0) {
        const partneredLinks = await db.select({ clinicId: clinicOrganizationLinks.clinicId })
            .from(clinicOrganizationLinks)
            .where(inArray(clinicOrganizationLinks.organizationId, joinedOrgIds));
        partneredLinks.forEach(l => {
            if (!clinicIdsToKeep.includes(l.clinicId)) clinicIdsToKeep.push(l.clinicId);
        });
    }

    if (joinedClinicIds.length > 0) {
        const partneredOrgLinks = await db.select({ orgId: clinicOrganizationLinks.organizationId })
            .from(clinicOrganizationLinks)
            .where(inArray(clinicOrganizationLinks.clinicId, joinedClinicIds));
        partneredOrgLinks.forEach(l => {
            if (!orgIdsToKeep.includes(l.orgId)) orgIdsToKeep.push(l.orgId);
        });
    }

    if (orgIdsToKeep.length > 0) {
        await db.delete(organizations).where(not(inArray(organizations.id, orgIdsToKeep)));
    } else {
        await db.delete(organizations);
    }

    for (const org of remoteOrgs) {
        // Handle seed ID to API GUID migration to prevent UNIQUE constraint violation on slug
        const existingOrg = await db.select({ id: organizations.id })
            .from(organizations)
            .where(eq(organizations.slug, org.slug));

        if (existingOrg.length > 0 && existingOrg[0].id !== org.id) {
            const oldId = existingOrg[0].id;
            console.log(`[DiscoveryService] Migrating organization from local ID ${oldId} to remote ID ${org.id}`);

            await db.update(organizationMemberships)
                .set({ organizationId: org.id })
                .where(eq(organizationMemberships.organizationId, oldId));

            await db.update(clinicOrganizationLinks)
                .set({ organizationId: org.id })
                .where(eq(clinicOrganizationLinks.organizationId, oldId));

            await db.update(bookingDrafts)
                .set({ organizationId: org.id })
                .where(eq(bookingDrafts.organizationId, oldId));

            await db.delete(organizations).where(eq(organizations.id, oldId));
        }

        const row = {
            id: org.id,
            slug: org.slug,
            name: org.name,
            description: org.description,
            isPublic: org.isPublic,
            logoUrl: org.logoUrl,
            coverImageUrl: org.coverImageUrl,
            addressHint: org.addressHint,
            privacyPolicyUrl: 'https://Clinic EZ.app/privacy',
            termsAndConditionsUrl: 'https://Clinic EZ.app/terms',
            rolesJson: org.rolesJson,
            requiredShareFieldsJson: org.requiredShareFieldsJson,
            featuredScore: org.featuredScore,
            activeMemberCount: org.activeMemberCount,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        await db.insert(organizations).values(row).onConflictDoUpdate({
            target: organizations.id,
            set: row,
        });

        if (org.membershipStatus) {
            const membershipRow = {
                id: getMembershipId('org-membership', patientId, org.id),
                patientId,
                organizationId: org.id,
                status: localMembershipStatus(org.membershipStatus) ?? 'pending',
                roleId: 'member',
                roleName: 'Member',
                consentPrivacyPolicy: true,
                consentTermsAndConditions: true,
                consentDataSharing: true,
                consentedAt: now(),
                createdAt: now(),
                updatedAt: now(),
                syncedAt: now(),
            };
            await db.insert(organizationMemberships).values(membershipRow).onConflictDoUpdate({
                target: organizationMemberships.id,
                set: {
                    status: localMembershipStatus(org.membershipStatus) ?? 'pending',
                    updatedAt: now(),
                    syncedAt: now(),
                },
            });
        }
    }
}

async function updateClinicCache(patientId: string, remoteClinics: RemoteClinicSummary[]) {
    const memberships = await db.select({ orgId: organizationMemberships.organizationId })
        .from(organizationMemberships)
        .where(eq(organizationMemberships.patientId, patientId));
    const joinedOrgIds = memberships.map(m => m.orgId);

    let orgIdsToKeep = [...joinedOrgIds];

    const clinicMembershipsList = await db.select({ clinicId: clinicMemberships.clinicId })
        .from(clinicMemberships)
        .where(eq(clinicMemberships.patientId, patientId));
    const joinedClinicIds = clinicMembershipsList.map(m => m.clinicId);

    let clinicIdsToKeep = [...joinedClinicIds];

    if (joinedOrgIds.length > 0) {
        const partneredLinks = await db.select({ clinicId: clinicOrganizationLinks.clinicId })
            .from(clinicOrganizationLinks)
            .where(inArray(clinicOrganizationLinks.organizationId, joinedOrgIds));
        partneredLinks.forEach(l => {
            if (!clinicIdsToKeep.includes(l.clinicId)) clinicIdsToKeep.push(l.clinicId);
        });
    }

    if (joinedClinicIds.length > 0) {
        const partneredOrgLinks = await db.select({ orgId: clinicOrganizationLinks.organizationId })
            .from(clinicOrganizationLinks)
            .where(inArray(clinicOrganizationLinks.clinicId, joinedClinicIds));
        partneredOrgLinks.forEach(l => {
            if (!orgIdsToKeep.includes(l.orgId)) orgIdsToKeep.push(l.orgId);
        });
    }

    if (clinicIdsToKeep.length > 0) {
        await db.delete(clinics).where(not(inArray(clinics.id, clinicIdsToKeep)));
    } else {
        await db.delete(clinics);
    }

    for (const clinic of remoteClinics) {
        // Handle seed ID to API GUID migration for clinics based on name
        const existingClinic = await db.select({ id: clinics.id })
            .from(clinics)
            .where(eq(clinics.name, clinic.name));

        if (existingClinic.length > 0 && existingClinic[0].id !== clinic.id) {
            const oldId = existingClinic[0].id;
            console.log(`[DiscoveryService] Migrating clinic from local ID ${oldId} to remote ID ${clinic.id}`);

            await db.update(clinicMemberships)
                .set({ clinicId: clinic.id })
                .where(eq(clinicMemberships.clinicId, oldId));

            await db.update(clinicOrganizationLinks)
                .set({ clinicId: clinic.id })
                .where(eq(clinicOrganizationLinks.clinicId, oldId));

            await db.update(bookingDrafts)
                .set({ clinicId: clinic.id })
                .where(eq(bookingDrafts.clinicId, oldId));

            await db.delete(clinics).where(eq(clinics.id, oldId));
        }

        const row = {
            id: clinic.id,
            name: clinic.name,
            address: clinic.address,
            description: clinic.description,
            logoUrl: clinic.logoUrl,
            coverImageUrl: clinic.coverImageUrl,
            isPublic: clinic.isPublic,
            supportsAppointments: clinic.supportsAppointments,
            privacyPolicyUrl: 'https://Clinic EZ.app/privacy',
            termsAndConditionsUrl: 'https://Clinic EZ.app/terms',
            specialtiesJson: clinic.specialtiesJson,
            requiredShareFieldsJson: clinic.requiredShareFieldsJson,
            activeMemberCount: clinic.activeMemberCount,
            joinedAt: new Date(),
        };
        await db.insert(clinics).values(row).onConflictDoUpdate({
            target: clinics.id,
            set: row,
        });

        if (clinic.membershipStatus) {
            const membershipRow = {
                id: getMembershipId('clinic-membership', patientId, clinic.id),
                patientId,
                clinicId: clinic.id,
                status: localMembershipStatus(clinic.membershipStatus) ?? 'pending',
                consentPrivacyPolicy: true,
                consentTermsAndConditions: true,
                consentDataSharing: true,
                consentedAt: now(),
                createdAt: now(),
                updatedAt: now(),
                syncedAt: now(),
            };
            await db.insert(clinicMemberships).values(membershipRow).onConflictDoUpdate({
                target: clinicMemberships.id,
                set: {
                    status: localMembershipStatus(clinic.membershipStatus) ?? 'pending',
                    updatedAt: now(),
                    syncedAt: now(),
                },
            });
        }
    }
}

export async function listOrganizations(
    patientId: string,
    query = '',
    filter: 'all' | 'public' | 'private' | 'joined' = 'all',
    getToken?: () => Promise<string | null>,
): Promise<OrganizationView[]> {
    if (getToken) {
        try {
            const remoteOrgs = await searchOrganizationsOnline(getToken, query, patientId);
            await updateOrganizationCache(patientId, remoteOrgs);
        } catch (err) {
            console.warn('[DiscoveryService] Failed to fetch organizations from API, falling back to local DB cache:', err);
        }
    }

    const snapshot = await loadCatalogSnapshot(patientId);
    const normalizedQuery = normalizeQuery(query);
    const membershipMap = new Map(snapshot.organizationMembershipRows.map((membership: Record<string, any>) => [String(membership.organizationId), membership]));
    const orgToClinicIds = new Map<string, string[]>();

    for (const clinic of snapshot.clinics) {
        for (const organizationId of clinic.organizationIds) {
            const list = orgToClinicIds.get(organizationId) ?? [];
            if (!list.includes(clinic.id)) list.push(clinic.id);
            orgToClinicIds.set(organizationId, list);
        }
    }

    const items = snapshot.organizations
        .map((organization) => {
            const membership = membershipMap.get(organization.id);
            const linkedClinicIds = orgToClinicIds.get(organization.id) ?? [];

            return {
                ...organization,
                partneredClinicIds: linkedClinicIds,
                isJoined: membership?.status === 'active',
                membershipStatus: parseMembershipStatus(membership?.status),
                membershipRoleName: membership?.roleName,
            } as OrganizationDetail;
        })
        .filter((organization) => {
            if (filter === 'public' && !organization.isPublic) return false;
            if (filter === 'private' && organization.isPublic) return false;
            if (filter === 'joined' && !organization.isJoined) return false;
            return searchMatch(organization.name, normalizedQuery) || searchMatch(organization.description, normalizedQuery) || searchMatch(organization.addressHint ?? '', normalizedQuery);
        })
        .sort((a, b) => Number(b.isJoined) - Number(a.isJoined) || b.featuredScore - a.featuredScore || a.name.localeCompare(b.name));

    return withLatency(items);
}

export async function listClinics(
    patientId: string,
    options: { query?: string; filter?: 'all' | 'public' | 'partnered' | 'joined'; organizationId?: string } = {},
    getToken?: () => Promise<string | null>,
): Promise<ClinicDetail[]> {
    if (getToken) {
        try {
            const remoteClinics = await searchClinicsOnline(getToken, options.query, options.organizationId, patientId);
            await updateClinicCache(patientId, remoteClinics);
        } catch (err) {
            console.warn('[DiscoveryService] Failed to fetch clinics from API, falling back to local DB cache:', err);
        }
    }

    const snapshot = await loadCatalogSnapshot(patientId);
    const normalizedQuery = normalizeQuery(options.query ?? '');
    const filter = options.filter ?? 'all';
    const clinicToOrganizationIds = new Map<string, string[]>();

    for (const organization of snapshot.organizations) {
        for (const clinicId of organization.partneredClinicIds) {
            const list = clinicToOrganizationIds.get(clinicId) ?? [];
            if (!list.includes(organization.id)) list.push(organization.id);
            clinicToOrganizationIds.set(clinicId, list);
        }
    }

    const items = snapshot.clinics
        .map((clinic) => {
            const clinicMembership = snapshot.clinicMembershipRows.find((membership: Record<string, any>) => String(membership.clinicId) === clinic.id);
            const linkedOrganizationIds = clinicToOrganizationIds.get(clinic.id) ?? [];
            const unlockedByOrganizationIds = linkedOrganizationIds.filter((organizationId) => snapshot.organizationMembershipRows.some((membership: Record<string, any>) => String(membership.organizationId) === organizationId && membership.status === 'active'));
            const isJoined = clinicMembership?.status === 'active';
            const isVisible = clinic.isPublic || isJoined || unlockedByOrganizationIds.length > 0;

            return {
                ...clinic,
                organizationIds: linkedOrganizationIds,
                unlockedByOrganizationIds,
                isJoined,
                isVisible,
                membershipStatus: parseMembershipStatus(clinicMembership?.status),
                healthcareProviders: buildProvidersForClinic(clinic.id, clinic.name, clinic.specialties[0] ?? 'General Medicine'),
            } as ClinicDetail;
        })
        .filter((clinic) => {
            if (options.organizationId && !clinic.organizationIds.includes(options.organizationId)) return false;
            if (!clinic.isVisible) return false;
            if (filter === 'public' && !clinic.isPublic) return false;
            if (filter === 'partnered' && clinic.unlockedByOrganizationIds.length === 0) return false;
            if (filter === 'joined' && !clinic.isJoined) return false;
            return searchMatch(clinic.name, normalizedQuery) || searchMatch(clinic.description, normalizedQuery) || searchMatch(clinic.address, normalizedQuery);
        })
        .sort((a, b) => Number(b.isJoined) - Number(a.isJoined) || b.featuredScore - a.featuredScore || a.name.localeCompare(b.name));

    return withLatency(items);
}

// ── Local-first helpers ───────────────────────────────────────────────────────
//
// Use these in screens instead of listOrganizations/listClinics for the
// offline-first pattern:
//
//   1. Call loadLocal* immediately → display cached data (no spinner if data exists)
//   2. Call refresh*FromApi in background → updates local DB cache
//   3. After step 2 completes, call loadLocal* again to pick up new data

/**
 * Reads organizations from local SQLite only — no API call.
 * Returns immediately with whatever is cached.
 */
export async function loadLocalOrganizations(
    patientId: string,
    query = '',
    filter: 'all' | 'public' | 'private' | 'joined' = 'all',
): Promise<OrganizationView[]> {
    const snapshot = await loadCatalogSnapshot(patientId);
    const normalizedQuery = normalizeQuery(query);
    const membershipMap = new Map(snapshot.organizationMembershipRows.map((m: Record<string, any>) => [String(m.organizationId), m]));
    const orgToClinicIds = new Map<string, string[]>();

    for (const clinic of snapshot.clinics) {
        for (const organizationId of clinic.organizationIds) {
            const list = orgToClinicIds.get(organizationId) ?? [];
            if (!list.includes(clinic.id)) list.push(clinic.id);
            orgToClinicIds.set(organizationId, list);
        }
    }

    return snapshot.organizations
        .map((organization) => {
            const membership = membershipMap.get(organization.id);
            const linkedClinicIds = orgToClinicIds.get(organization.id) ?? [];
            return {
                ...organization,
                partneredClinicIds: linkedClinicIds,
                isJoined: membership?.status === 'active',
                membershipStatus: parseMembershipStatus(membership?.status),
                membershipRoleName: membership?.roleName,
            } as OrganizationDetail;
        })
        .filter((organization) => {
            if (filter === 'public' && !organization.isPublic) return false;
            if (filter === 'private' && organization.isPublic) return false;
            if (filter === 'joined' && !organization.isJoined) return false;
            return searchMatch(organization.name, normalizedQuery) || searchMatch(organization.description, normalizedQuery) || searchMatch(organization.addressHint ?? '', normalizedQuery);
        })
        .sort((a, b) => Number(b.isJoined) - Number(a.isJoined) || b.featuredScore - a.featuredScore || a.name.localeCompare(b.name));
}

/**
 * Fetches fresh organizations from the API and updates the local DB cache.
 * Does NOT return data — call loadLocalOrganizations afterwards.
 * Throws on network errors so the caller can handle them.
 */
export async function refreshOrganizationsFromApi(
    patientId: string,
    query: string,
    getToken: () => Promise<string | null>,
): Promise<void> {
    const remoteOrgs = await searchOrganizationsOnline(getToken, query);
    await updateOrganizationCache(patientId, remoteOrgs);
}

/**
 * Reads clinics from local SQLite only — no API call.
 * Returns immediately with whatever is cached.
 */
export async function loadLocalClinics(
    patientId: string,
    options: { query?: string; filter?: 'all' | 'public' | 'partnered' | 'joined'; organizationId?: string } = {},
): Promise<ClinicDetail[]> {
    const snapshot = await loadCatalogSnapshot(patientId);
    const normalizedQuery = normalizeQuery(options.query ?? '');
    const filter = options.filter ?? 'all';
    const clinicToOrganizationIds = new Map<string, string[]>();

    for (const organization of snapshot.organizations) {
        for (const clinicId of organization.partneredClinicIds) {
            const list = clinicToOrganizationIds.get(clinicId) ?? [];
            if (!list.includes(organization.id)) list.push(organization.id);
            clinicToOrganizationIds.set(clinicId, list);
        }
    }

    return snapshot.clinics
        .map((clinic) => {
            const clinicMembership = snapshot.clinicMembershipRows.find((m: Record<string, any>) => String(m.clinicId) === clinic.id);
            const linkedOrganizationIds = clinicToOrganizationIds.get(clinic.id) ?? [];
            const unlockedByOrganizationIds = linkedOrganizationIds.filter((organizationId) =>
                snapshot.organizationMembershipRows.some((m: Record<string, any>) => String(m.organizationId) === organizationId && m.status === 'active'),
            );
            const isJoined = clinicMembership?.status === 'active';
            const isVisible = clinic.isPublic || isJoined || unlockedByOrganizationIds.length > 0;

            return {
                ...clinic,
                organizationIds: linkedOrganizationIds,
                unlockedByOrganizationIds,
                isJoined,
                isVisible,
                membershipStatus: parseMembershipStatus(clinicMembership?.status),
                healthcareProviders: buildProvidersForClinic(clinic.id, clinic.name, clinic.specialties[0] ?? 'General Medicine'),
            } as ClinicDetail;
        })
        .filter((clinic) => {
            if (options.organizationId && !clinic.organizationIds.includes(options.organizationId)) return false;
            if (!clinic.isVisible) return false;
            if (filter === 'public' && !clinic.isPublic) return false;
            if (filter === 'partnered' && clinic.unlockedByOrganizationIds.length === 0) return false;
            if (filter === 'joined' && !clinic.isJoined) return false;
            return searchMatch(clinic.name, normalizedQuery) || searchMatch(clinic.description, normalizedQuery) || searchMatch(clinic.address, normalizedQuery);
        })
        .sort((a, b) => Number(b.isJoined) - Number(a.isJoined) || b.featuredScore - a.featuredScore || a.name.localeCompare(b.name));
}

/**
 * Fetches fresh clinics from the API and updates the local DB cache.
 * Does NOT return data — call loadLocalClinics afterwards.
 * Throws on network errors so the caller can handle them.
 */
export async function refreshClinicsFromApi(
    patientId: string,
    query: string,
    organizationId: string | undefined,
    getToken: () => Promise<string | null>,
): Promise<void> {
    const remoteClinics = await searchClinicsOnline(getToken, query, organizationId);
    await updateClinicCache(patientId, remoteClinics);
}

export async function getOrganizationDetail(patientId: string, organizationId: string): Promise<OrganizationDetail> {
    const snapshot = await loadCatalogSnapshot(patientId);
    const organization = snapshot.organizations.find((item) => item.id === organizationId);
    if (!organization) throw new Error('Organization not found.');

    const linkedClinics = snapshot.clinics.filter((clinic) => clinic.organizationIds.includes(organizationId));
    const membership = snapshot.organizationMembershipRows.find((item: Record<string, any>) => String(item.organizationId) === organizationId);

    return {
        ...organization,
        linkedClinics,
        isJoined: membership?.status === 'active',
        membershipStatus: parseMembershipStatus(membership?.status),
        membershipRoleName: membership?.roleName,
    };
}

export async function getClinicDetail(patientId: string, clinicId: string): Promise<ClinicDetail> {
    const snapshot = await loadCatalogSnapshot(patientId);
    const clinic = snapshot.clinics.find((item) => item.id === clinicId);
    if (!clinic) throw new Error('Clinic not found.');

    const linkedOrganizationIds = snapshot.organizations.filter((organization) => organization.partneredClinicIds.includes(clinicId)).map((organization) => organization.id);
    const linkedOrganizations = snapshot.organizations.filter((organization) => linkedOrganizationIds.includes(organization.id));
    const membership = snapshot.clinicMembershipRows.find((item: Record<string, any>) => String(item.clinicId) === clinicId);
    const unlockedByOrganizationIds = linkedOrganizationIds.filter((organizationId) => snapshot.organizationMembershipRows.some((membershipRow: Record<string, any>) => String(membershipRow.organizationId) === organizationId && membershipRow.status === 'active'));
    const isJoined = membership?.status === 'active';
    const isVisible = clinic.isPublic || isJoined || unlockedByOrganizationIds.length > 0;

    if (!isVisible && !clinic.isPublic) {
        throw new Error('This clinic is private. Join a partner organization first.');
    }

    return {
        ...clinic,
        organizationIds: linkedOrganizationIds,
        linkedOrganizations,
        isJoined,
        isVisible,
        unlockedByOrganizationIds,
        membershipStatus: parseMembershipStatus(membership?.status),
        healthcareProviders: buildProvidersForClinic(clinic.id, clinic.name, clinic.specialties[0] ?? 'General Medicine'),
        services: [],
    };
}

export async function joinOrganization(
    patientId: string,
    input: JoinOrganizationInput,
    getToken: () => Promise<string | null>,
): Promise<{ success: true }> {
    const network = await NetInfo.fetch();
    if (!network.isConnected) {
        throw new Error('OFFLINE_ERROR');
    }

    const snapshot = await loadCatalogSnapshot(patientId);
    const organization = snapshot.organizations.find((item) => item.id === input.organizationId);
    if (!organization) throw new Error('Organization not found.');

    if (!organization.roles.some((role) => role.id === input.roleId)) {
        throw new Error('Please select a valid organization role.');
    }

    if (!organization.isPublic && organization.inviteCode !== input.inviteCode?.trim()) {
        throw new Error('Invalid invite code for this private organization.');
    }

    if (!hasAllConsent(input.consent)) {
        throw new Error('Please accept privacy policy, terms, and data sharing consent.');
    }

    const inviteCode = input.inviteCode?.trim() || organization.inviteCode || null;
    const consentPayload = {
        consentPrivacyPolicy: input.consent.acceptedPrivacyPolicy,
        consentTermsAndConditions: input.consent.acceptedTermsAndConditions,
        consentDataSharing: input.consent.acceptedDataSharing,
    };

    // Call API first!
    const apiResult = await apiJoinOrg(getToken, patientId, organization.id, inviteCode, input.roleId, consentPayload);

    const role = organization.roles.find((item) => item.id === input.roleId) ?? organization.roles[0];
    const timestamp = now();
    const row = {
        id: apiResult.id || getMembershipId('org-membership', patientId, organization.id),
        patientId,
        organizationId: organization.id,
        roleId: input.roleId,
        roleName: role ? role.name : 'Member',
        status: 'pending' as const,
        consentPrivacyPolicy: input.consent.acceptedPrivacyPolicy,
        consentTermsAndConditions: input.consent.acceptedTermsAndConditions,
        consentDataSharing: input.consent.acceptedDataSharing,
        consentedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
        syncedAt: timestamp,
        serverId: apiResult.id,
    };

    await db.insert(organizationMemberships).values(row).onConflictDoUpdate({ target: organizationMemberships.id, set: row });
    return { success: true };
}

export async function joinClinic(
    patientId: string,
    input: JoinClinicInput,
    getToken: () => Promise<string | null>,
): Promise<{ success: true }> {
    const network = await NetInfo.fetch();
    if (!network.isConnected) {
        throw new Error('OFFLINE_ERROR');
    }

    const snapshot = await loadCatalogSnapshot(patientId);
    const clinic = snapshot.clinics.find((item) => item.id === input.clinicId);
    if (!clinic) throw new Error('Clinic not found.');

    if (!clinic.isPublic) {
        const canAccessPrivateClinic = snapshot.organizations.some((organization) => organization.partneredClinicIds.includes(clinic.id) && snapshot.organizationMembershipRows.some((membership: Record<string, any>) => String(membership.organizationId) === organization.id && membership.status === 'active'));
        if (!canAccessPrivateClinic) {
            throw new Error('This private clinic is only available to eligible organization members.');
        }
    }

    if (!hasAllConsent(input.consent)) {
        throw new Error('Please accept privacy policy, terms, and data sharing consent.');
    }

    const consentPayload = {
        consentPrivacyPolicy: input.consent.acceptedPrivacyPolicy,
        consentTermsAndConditions: input.consent.acceptedTermsAndConditions,
        consentDataSharing: input.consent.acceptedDataSharing,
    };

    // Call API first!
    const serverId = await apiJoinClinic(getToken, patientId, clinic.id, consentPayload);

    const timestamp = now();
    const row = {
        id: serverId || getMembershipId('clinic-membership', patientId, clinic.id),
        patientId,
        clinicId: clinic.id,
        status: 'pending' as const,
        consentPrivacyPolicy: input.consent.acceptedPrivacyPolicy,
        consentTermsAndConditions: input.consent.acceptedTermsAndConditions,
        consentDataSharing: input.consent.acceptedDataSharing,
        consentedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
        syncedAt: timestamp,
        serverId: serverId,
    };

    await db.insert(clinicMemberships).values(row).onConflictDoUpdate({ target: clinicMemberships.id, set: row });
    return { success: true };
}

export async function getBookingDraft(patientId: string, clinicId: string): Promise<BookingDraftRecord | null> {
    const draft = await db.select().from(bookingDrafts).where(eq(bookingDrafts.patientId, patientId));
    const row = draft.find((item) => item.clinicId === clinicId);
    if (!row) return null;

    return {
        id: String(row.id),
        clinicId: String(row.clinicId),
        organizationId: row.organizationId ?? null,
        preferredDate: row.preferredDate ?? null,
        preferredTime: row.preferredTime ?? null,
        reason: row.reason ?? null,
        notes: row.notes ?? null,
        shareFields: parseJsonArray<ShareableFieldKey>(String(row.shareFieldsJson ?? '[]'), []),
        attachedFileIds: parseJsonArray<string>(String(row.attachedFileIdsJson ?? '[]'), []),
        status: (row.status as 'draft' | 'ready') ?? 'draft',
    };
}

export async function saveBookingDraft(
    patientId: string,
    input: BookingDraftInput,
    serverId?: string,
): Promise<BookingDraftRecord> {
    const timestamp = now();

    // Check if draft exists for the clinic
    const existing = await db
        .select()
        .from(bookingDrafts)
        .where(and(eq(bookingDrafts.patientId, patientId), eq(bookingDrafts.clinicId, input.clinicId)))
        .limit(1);

    const rowId = serverId || (existing.length > 0 ? existing[0].id : getMembershipId('booking-draft', patientId, input.clinicId));

    const row = {
        id: rowId,
        patientId,
        clinicId: input.clinicId,
        organizationId: input.organizationId ?? null,
        preferredDate: input.preferredDate ?? null,
        preferredTime: input.preferredTime ?? null,
        reason: input.reason,
        notes: input.notes ?? null,
        shareFieldsJson: serializeShareFields(input.shareFields),
        attachedFileIdsJson: JSON.stringify(input.attachedFileIds ?? []),
        status: input.preferredDate && input.preferredTime && input.reason ? ('ready' as const) : ('draft' as const),
        createdAt: existing.length > 0 ? existing[0].createdAt : timestamp,
        updatedAt: timestamp,
        syncedAt: timestamp,
    };

    await db.insert(bookingDrafts).values(row).onConflictDoUpdate({ target: bookingDrafts.id, set: row });

    return {
        id: row.id,
        clinicId: row.clinicId,
        organizationId: row.organizationId,
        preferredDate: row.preferredDate,
        preferredTime: row.preferredTime,
        reason: row.reason,
        notes: row.notes,
        shareFields: input.shareFields,
        attachedFileIds: input.attachedFileIds || [],
        status: row.status,
    };
}

export async function getHomeDashboard(patientId: string): Promise<HomeDashboard> {
    const snapshot = await loadCatalogSnapshot(patientId);
    const summary = createHomeSummary(snapshot);
    const healthMetrics = createHealthMetrics(snapshot);
    const nextAppointments = createAppointmentLineup(snapshot);
    const recentConsultationSummary = createRecentConsultationSummary(snapshot);

    return {
        greetingName: snapshot.patient?.firstName ? String(snapshot.patient.firstName) : 'Patient',
        summary,
        healthMetrics,
        nextAppointments,
        recentConsultationSummary,
    };
}

export async function listBookingDrafts(patientId: string): Promise<BookingDraftRecord[]> {
    const rows = await db.select().from(bookingDrafts).where(eq(bookingDrafts.patientId, patientId));
    return rows.map((row) => ({
        id: String(row.id),
        clinicId: String(row.clinicId),
        organizationId: row.organizationId ?? null,
        preferredDate: row.preferredDate ?? null,
        preferredTime: row.preferredTime ?? null,
        reason: row.reason ?? null,
        notes: row.notes ?? null,
        shareFields: parseJsonArray<ShareableFieldKey>(String(row.shareFieldsJson ?? '[]'), []),
        attachedFileIds: parseJsonArray<string>(String(row.attachedFileIdsJson ?? '[]'), []),
        status: (row.status as 'draft' | 'ready') ?? 'draft',
    }));
}

export function getShareFieldLabel(field: ShareableFieldKey): string {
    return shareFieldLabels[field] ?? field;
}

export function getOrganizationVisibilityLabel(organization: OrganizationEntity): string {
    return organization.isPublic ? 'Public' : 'Private';
}

export function getClinicVisibilityLabel(clinic: ClinicEntity): string {
    return clinic.isPublic ? 'Public' : 'Private';
}

// ─── Online-first API wrappers ─────────────────────────────────────────────────
// These functions call the PatientApp backend when connectivity is available,
// and fall back silently so callers can continue from local seeded/SQLite data.



export type { RemoteOrgSummary, RemoteOrgDetail, RemoteClinicSummary, RemoteClinicDetail };

/**
 * Searches organizations from the backend. Returns [] when offline.
 * Use the raw useSWR hook (useOrganizations from services/api/useApi) for
 * reactive UI components that need automatic revalidation.
 */
export async function searchOrganizationsOnline(
    getToken: () => Promise<string | null>,
    query?: string,
    patientId?: string,
): Promise<RemoteOrgSummary[]> {
    const result = await apiSearchOrgs(getToken, query, patientId, 0, 50);
    return result.items;
}

/**
 * Resolves an organization by invite code. Returns null when offline or not found.
 * Used by the join-flow screens before the patient commits to joining.
 */
export async function lookupOrganizationByInviteCode(
    getToken: () => Promise<string | null>,
    inviteCode: string,
): Promise<RemoteOrgDetail | null> {
    return apiGetOrgByInvite(getToken, inviteCode.trim());
}

/**
 * Searches clinics from the backend. Pass organizationId to scope to a joined org.
 */
export async function searchClinicsOnline(
    getToken: () => Promise<string | null>,
    query?: string,
    organizationId?: string,
    patientId?: string,
): Promise<RemoteClinicSummary[]> {
    const result = await apiSearchClinics(getToken, query, organizationId, patientId, 0, 50);
    return result.items;
}

/**
 * Fetches full clinic detail including linked organizations and the
 * current patient's membership status.
 */
export async function fetchClinicDetailOnline(
    getToken: () => Promise<string | null>,
    clinicId: string,
    patientId?: string,
): Promise<RemoteClinicDetail | null> {
    return apiGetClinicDetail(getToken, clinicId, patientId);
}

/**
 * Joins an organization via invite code — requires online.
 * Throws ApiError on failure (UI should handle the error message).
 */
export async function joinOrganizationOnline(
    getToken: () => Promise<string | null>,
    patientId: string,
    organizationId: string | null,
    inviteCode: string | null,
    roleId: string,
    consent: JoinConsentInput,
) {
    return apiJoinOrg(getToken, patientId, organizationId, inviteCode, roleId, consent);
}

/**
 * Joins a clinic directly — consent only, no invite code.
 * Returns the new ClinicMembership server ID.
 */
export async function joinClinicOnline(
    getToken: () => Promise<string | null>,
    patientId: string,
    clinicId: string,
    consent: JoinConsentInput,
): Promise<string> {
    return apiJoinClinic(getToken, patientId, clinicId, consent);
}

/**
 * Creates a booking draft on the backend and returns the server UUID.
 * The local bookingDrafts row should be updated with this serverId afterwards.
 */
export async function createBookingDraftOnline(
    getToken: () => Promise<string | null>,
    patientId: string,
    payload: {
        clinicId: string;
        organizationId?: string | null;
        preferredDate?: string | null;
        preferredTime?: string | null;
        reason?: string | null;
        notes?: string | null;
        shareFieldsJson: string;
        attachedFileIdsJson?: string;
    },
): Promise<string> {
    return apiCreateDraft(getToken, patientId, payload);
}

/**
 * Submits a ready booking draft to the Clinic Dashboard via the PatientApp backend.
 */
export async function submitBookingDraftOnline(
    getToken: () => Promise<string | null>,
    patientId: string,
    draftId: string,
): Promise<string | null> {
    return apiSubmitDraft(getToken, patientId, draftId);
}

export async function getClinicDetailOnline(
    patientId: string,
    clinicId: string,
    getToken: () => Promise<string | null>,
): Promise<ClinicDetail | null> {
    const remote = await fetchClinicDetailOnline(getToken, clinicId, patientId);
    if (!remote) return null;

    return {
        id: remote.id,
        name: remote.name,
        description: remote.description ?? '',
        address: remote.address ?? '',
        isPublic: remote.isPublic,
        supportsAppointments: remote.supportsAppointments,
        organizationIds: (remote.linkedOrganizations ?? []).map((o) => o.id),
        requiredShareFields: parseJsonArray<ShareableFieldKey>(remote.requiredShareFieldsJson, ['fullName', 'mobile']),
        privacyPolicyUrl: remote.privacyPolicyUrl ?? 'https://Clinic EZ.app/privacy',
        termsAndConditionsUrl: remote.termsAndConditionsUrl ?? 'https://Clinic EZ.app/terms',
        logoUrl: remote.logoUrl ?? undefined,
        coverImageUrl: remote.coverImageUrl ?? undefined,
        specialties: parseJsonArray<string>(remote.specialtiesJson, []),
        featuredScore: remote.featuredScore ?? 0,
        activeMemberCount: remote.activeMemberCount ?? 0,
        isJoined: remote.membershipStatus === 'Active',
        isVisible: remote.isPublic || Boolean(remote.membershipStatus),
        unlockedByOrganizationIds: [],
        membershipStatus: localMembershipStatus(remote.membershipStatus),
        linkedOrganizations: (remote.linkedOrganizations ?? []).map((org) => ({
            id: org.id,
            slug: org.slug,
            name: org.name,
            description: org.description,
            isPublic: org.isPublic,
            logoUrl: org.logoUrl ?? undefined,
            coverImageUrl: org.coverImageUrl ?? undefined,
            featuredScore: org.featuredScore,
            activeMemberCount: org.activeMemberCount,
            addressHint: org.addressHint ?? undefined,
            requiredShareFields: parseJsonArray<ShareableFieldKey>(org.requiredShareFieldsJson, ['fullName', 'mobile']),
            roles: parseJsonArray(org.rolesJson, []),
            partneredClinicIds: [],
            privacyPolicyUrl: '',
            termsAndConditionsUrl: '',
        })),
        healthcareProviders: (remote.healthcareProviders ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            specialty: p.specialty,
            avatarUrl: p.avatarUrl ?? undefined,
            bio: '',
            credentials: p.professionalLicenseNo ? [p.professionalLicenseNo] : [],
            rating: 5.0,
        })),
        services: (remote.services ?? []).map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description ?? undefined,
            durationMinutes: s.durationMinutes ?? undefined,
            price: s.price ?? undefined,
        })),
    };
}

export async function cancelOrganizationMembershipOnline(
    patientId: string,
    organizationId: string,
    getToken: () => Promise<string | null>,
): Promise<{ success: true }> {
    const network = await NetInfo.fetch();
    if (!network.isConnected) {
        throw new Error('OFFLINE_ERROR');
    }

    await apiCancelOrgMembership(getToken, patientId, organizationId);

    // Update local database (remove membership row)
    await db.delete(organizationMemberships)
        .where(
            and(
                eq(organizationMemberships.patientId, patientId),
                eq(organizationMemberships.organizationId, organizationId)
            )
        );

    return { success: true };
}

export async function cancelClinicMembershipOnline(
    patientId: string,
    clinicId: string,
    getToken: () => Promise<string | null>,
): Promise<{ success: true }> {
    const network = await NetInfo.fetch();
    if (!network.isConnected) {
        throw new Error('OFFLINE_ERROR');
    }

    await apiCancelClinicMembership(getToken, patientId, clinicId);

    // Update local database (remove membership row)
    await db.delete(clinicMemberships)
        .where(
            and(
                eq(clinicMemberships.patientId, patientId),
                eq(clinicMemberships.clinicId, clinicId)
            )
        );

    return { success: true };
}

