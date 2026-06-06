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
    inviteCode?: string;
    addressHint?: string;
    privacyPolicyUrl: string;
    termsAndConditionsUrl: string;
    roles: OrganizationRole[];
    requiredShareFields: ShareableFieldKey[];
    partneredClinicIds: string[];
    featuredScore: number;
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
    specialties: string[];
    featuredScore: number;
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
}

export interface ClinicView extends ClinicEntity {
    isJoined: boolean;
    isVisible: boolean;
    unlockedByOrganizationIds: string[];
}

export interface OrganizationDetail extends OrganizationView {
    linkedClinics: ClinicEntity[];
    membershipRoleName?: string;
}

export interface ClinicDetail extends ClinicView {
    linkedOrganizations: OrganizationEntity[];
    membershipStatus?: 'pending' | 'active';
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
    status: 'draft' | 'ready';
}

export interface BookingDraftInput {
    clinicId: string;
    organizationId?: string | null;
    preferredDate?: string;
    preferredTime?: string;
    reason: string;
    notes?: string;
    shareFields: ShareableFieldKey[];
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
