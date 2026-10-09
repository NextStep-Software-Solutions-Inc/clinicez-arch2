import type { BookingShareSection } from '../sharing/bookingSections';
export type ShareableFieldKey =
    | 'fullName'
    | 'dateOfBirth'
    | 'sex'
    | 'mobile'
    | 'email'
    | 'address'
    | 'emergencyContact'
    | 'philhealthId';

export interface OrganizationRole {
    id: string;
    name: string;
    description: string;
}

export interface HealthMetric {
    label: string;
    value: string;
    note: string;
}

export interface AppointmentLineupItem {
    id: string;
    clinicId?: string;
    title: string;
    subtitle: string;
    dateLabel: string;
    timeLabel: string;
    status: 'draft' | 'scheduled' | 'follow-up';
}

export interface OrganizationEntity {
    id: string;
    slug: string;
    name: string;
    description: string;
    isPublic: boolean;
    logoUrl?: string;
    coverImageUrl?: string;
    inviteCode?: string;
    addressHint?: string;
    privacyPolicyUrl: string;
    termsAndConditionsUrl: string;
    roles: OrganizationRole[];
    requiredShareFields: ShareableFieldKey[];
    partneredClinicIds: string[];
    featuredScore: number;
    activeMemberCount: number;
}

export interface ClinicProvider {
    id: string;
    name: string;
    specialty: string;
    avatarUrl?: string | null;
    bio?: string | null;
    credentials: string[];
    rating: number;  // 0–5, one decimal place
}

export interface ClinicEntity {
    id: string;
    name: string;
    description: string;
    address: string;
    isPublic: boolean;
    supportsAppointments: boolean;
    organizationIds: string[];
    requiredShareFields: ShareableFieldKey[];
    privacyPolicyUrl: string;
    termsAndConditionsUrl: string;
    logoUrl?: string;
    coverImageUrl?: string;
    specialties: string[];
    featuredScore: number;
    activeMemberCount: number;
}

export interface ConsentSelection {
    acceptedPrivacyPolicy: boolean;
    acceptedTermsAndConditions: boolean;
    acceptedDataSharing: boolean;
}

export interface JoinOrganizationInput {
    organizationId: string;
    roleId: string;
    inviteCode?: string;
    consent: ConsentSelection;
}

export interface JoinClinicInput {
    clinicId: string;
    consent: ConsentSelection;
}

export interface OrganizationView extends OrganizationEntity {
    isJoined: boolean;
    membershipStatus?: 'pending' | 'active' | null;
}

export interface ClinicView extends ClinicEntity {
    isJoined: boolean;
    isVisible: boolean;
    unlockedByOrganizationIds: string[];
    membershipStatus?: 'pending' | 'active' | null;
}

export interface OrganizationDetail extends OrganizationView {
    linkedClinics: ClinicEntity[];
    membershipRoleName?: string;
}

export interface ClinicService {
    id: string;
    name: string;
    description?: string | null;
    durationMinutes?: number | null;
    price?: number | null;
}

export interface ClinicDetail extends ClinicView {
    linkedOrganizations: OrganizationEntity[];
    membershipStatus?: 'pending' | 'active';
    healthcareProviders: ClinicProvider[];
    services: ClinicService[];
}

export interface BookingDraftRecord {
    id: string;
    clinicId: string;
    organizationId?: string | null;
    preferredDate?: string | null;
    preferredTime?: string | null;
    reason?: string | null;
    notes?: string | null;
    shareFields: ShareableFieldKey[];
    shareSections: BookingShareSection[];
    status: 'draft' | 'ready';
    attachedFileIds: string[];
}

export interface BookingDraftInput {
    clinicId: string;
    organizationId?: string | null;
    preferredDate?: string;
    preferredTime?: string;
    reason: string;
    notes?: string;
    shareFields: ShareableFieldKey[];
    shareSections: BookingShareSection[];
    attachedFileIds?: string[];
}

export interface HomeDashboard {
    greetingName: string;
    summary: HomeSummary;
    healthMetrics: HealthMetric[];
    nextAppointments: AppointmentLineupItem[];
    recentConsultationSummary: string[];
}

export interface HomeSummary {
    joinedOrganizations: number;
    joinedClinics: number;
    availablePublicOrganizations: number;
    availablePublicClinics: number;
    suggestedActions: string[];
}
