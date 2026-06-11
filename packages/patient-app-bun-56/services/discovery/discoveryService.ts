import { count, desc, eq } from 'drizzle-orm';
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

const discoverySeedPromiseMap = new Map<string, Promise<void>>();

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
            privacyPolicyUrl: `https://clinicez.app/privacy/${slug}`,
            termsAndConditionsUrl: `https://clinicez.app/terms/${slug}`,
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
            baseUrl: `https://${slug}.clinicez.local`,
            inviteCode: isPublic ? null : `CLN-${String(index + 1).padStart(4, '0')}`,
            privacyPolicyUrl: `https://clinicez.app/privacy/${slug}`,
            termsAndConditionsUrl: `https://clinicez.app/terms/${slug}`,
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

function computeActiveMemberCount(featuredScore: number): number {
    return 50 + Math.floor(featuredScore * 41.7);
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

async function seedCatalogIfNeeded(): Promise<void> {
    const existing = await db.select({ count: count() }).from(organizations);
    if ((existing[0]?.count ?? 0) > 0) return;

    const { organizationsSeed, clinicsSeed, linksSeed } = buildOrganizationSeed();
    await db.insert(organizations).values(organizationsSeed);
    await db.insert(clinics).values(clinicsSeed);
    await db.insert(clinicOrganizationLinks).values(linksSeed);
}

async function ensureSeeded(): Promise<void> {
    const key = 'catalog';
    if (!discoverySeedPromiseMap.has(key)) {
        discoverySeedPromiseMap.set(key, seedCatalogIfNeeded().finally(() => discoverySeedPromiseMap.delete(key)));
    }

    await discoverySeedPromiseMap.get(key);
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
        activeMemberCount: computeActiveMemberCount(Number(row.featuredScore ?? 0)),
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
        privacyPolicyUrl: row.privacyPolicyUrl ?? 'https://clinicez.app/privacy',
        termsAndConditionsUrl: row.termsAndConditionsUrl ?? 'https://clinicez.app/terms',
        logoUrl: row.logoUrl ?? undefined,
        coverImageUrl: row.coverImageUrl ?? undefined,
        specialties: parseJsonArray<string>(row.specialtiesJson, []),
        featuredScore: Number(row.featuredScore ?? 0),
    } as ClinicEntity));
}

async function loadCatalogSnapshot(patientId: string) {
    await ensureSeeded();

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
            membershipStatus: membership?.status,
            healthcareProviders: buildProvidersForClinic(clinic.id, clinic.name, clinic.specialties[0] ?? 'General Medicine'),
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
        activeMemberCount: computeActiveMemberCount(Number(row.featuredScore ?? 0)),
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
        privacyPolicyUrl: String(row.privacyPolicyUrl ?? 'https://clinicez.app/privacy'),
        termsAndConditionsUrl: String(row.termsAndConditionsUrl ?? 'https://clinicez.app/terms'),
        logoUrl: row.logoUrl ?? undefined,
        coverImageUrl: row.coverImageUrl ?? undefined,
        specialties: parseJsonArray<string>(String(row.specialtiesJson ?? '[]'), []),
        featuredScore: Number(row.featuredScore ?? 0),
    };
}

export async function listOrganizations(patientId: string, query = '', filter: 'all' | 'public' | 'private' | 'joined' = 'all'): Promise<OrganizationView[]> {
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
                membershipStatus: clinicMembership?.status,
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
        membershipStatus: membership?.status,
        healthcareProviders: buildProvidersForClinic(clinic.id, clinic.name, clinic.specialties[0] ?? 'General Medicine'),
    };
}

export async function joinOrganization(patientId: string, input: JoinOrganizationInput): Promise<{ success: true }> {
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

    const role = organization.roles.find((item) => item.id === input.roleId) ?? organization.roles[0];
    const timestamp = now();
    const row = {
        id: getMembershipId('org-membership', patientId, organization.id),
        patientId,
        organizationId: organization.id,
        roleId: role.id,
        roleName: role.name,
        status: 'active' as const,
        consentPrivacyPolicy: input.consent.acceptedPrivacyPolicy,
        consentTermsAndConditions: input.consent.acceptedTermsAndConditions,
        consentDataSharing: input.consent.acceptedDataSharing,
        consentedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
        syncedAt: timestamp,
    };

    await db.insert(organizationMemberships).values(row).onConflictDoUpdate({ target: organizationMemberships.id, set: row });
    return withLatency({ success: true as const });
}

export async function joinClinic(patientId: string, input: JoinClinicInput): Promise<{ success: true }> {
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

    const timestamp = now();
    const row = {
        id: getMembershipId('clinic-membership', patientId, clinic.id),
        patientId,
        clinicId: clinic.id,
        status: 'active' as const,
        consentPrivacyPolicy: input.consent.acceptedPrivacyPolicy,
        consentTermsAndConditions: input.consent.acceptedTermsAndConditions,
        consentDataSharing: input.consent.acceptedDataSharing,
        consentedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
        syncedAt: timestamp,
    };

    await db.insert(clinicMemberships).values(row).onConflictDoUpdate({ target: clinicMemberships.id, set: row });
    return withLatency({ success: true as const });
}

export async function getBookingDraft(patientId: string, clinicId: string): Promise<BookingDraftRecord | null> {
    await ensureSeeded();
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
        status: (row.status as 'draft' | 'ready') ?? 'draft',
    };
}

export async function saveBookingDraft(patientId: string, input: BookingDraftInput): Promise<BookingDraftRecord> {
    const timestamp = now();
    const row = {
        id: getMembershipId('booking-draft', patientId, input.clinicId),
        patientId,
        clinicId: input.clinicId,
        organizationId: input.organizationId ?? null,
        preferredDate: input.preferredDate ?? null,
        preferredTime: input.preferredTime ?? null,
        reason: input.reason,
        notes: input.notes ?? null,
        shareFieldsJson: serializeShareFields(input.shareFields),
        status: input.preferredDate && input.preferredTime && input.reason ? ('ready' as const) : ('draft' as const),
        createdAt: timestamp,
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
    await ensureSeeded();
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
