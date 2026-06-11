// ─────────────────────────────────────────────────────────────────────────────
// Appointments Feature — TypeScript Types
// ─────────────────────────────────────────────────────────────────────────────

export type AppointmentStatus =
    | 'confirmed'
    | 'pending'
    | 'canceled'
    | 'action_required'
    | 'completed'
    | 'no_show';

export interface AffiliatedClinic {
    id: string;
    name: string;
    logoUrl?: string | null;
    address: string;
}

export interface ProviderSnapshot {
    id: string;
    name: string;
    specialty: string;
    avatarUrl?: string | null;
    bio?: string | null;
    credentials: string[];
    affiliatedClinics: AffiliatedClinic[];
}

export interface ClinicSnapshot {
    id: string;
    name: string;
    address: string;
    logoUrl?: string | null;
    coverImageUrl?: string | null;
    phoneNumber?: string | null;
}

export interface AttachedDocument {
    id: string;
    name: string;
    uploadedAt: string;  // ISO-8601
    sizeBytes: number;
    mimeType: string;
    uploadedBy: 'patient' | 'clinic';
}

export interface AppointmentItem {
    id: string;
    patientId: string;
    clinic: ClinicSnapshot;
    provider: ProviderSnapshot;
    serviceType: string;
    scheduledAt: string;          // ISO-8601 datetime
    durationMinutes: number;
    status: AppointmentStatus;
    notes?: string | null;
    attachedDocuments: AttachedDocument[];
    cachedAt: string;             // ISO-8601 — when this was last fetched from server
}

export interface AppointmentsApiResponse {
    appointments: AppointmentItem[];
    fetchedAt: string;  // ISO-8601
}

// ── Booking Wizard Types ──────────────────────────────────────────────────────

export interface AvailableSlot {
    id: string;
    time: string;                         // e.g. "09:00"
    displayTime: string;                   // e.g. "9:00 AM"
    period: 'morning' | 'afternoon' | 'evening';
    available: boolean;
}

export interface AvailableSlotsResponse {
    date: string;                         // YYYY-MM-DD
    slots: AvailableSlot[];
}

export interface BookingServiceOption {
    id: string;
    name: string;
    description?: string | null;
    durationMinutes: number;
}

export interface BookingProviderOption {
    id: string;
    name: string;
    specialty: string;
    avatarUrl?: string | null;
}

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export interface BookingWizardState {
    step: WizardStep;
    clinicId: string;
    clinicName: string;
    service: BookingServiceOption | null;
    provider: BookingProviderOption | null;
    date: string;        // YYYY-MM-DD
    time: string;        // HH:mm
    slotId: string;
    chiefComplaint: string;
    notes: string;
}

// ── Navigation param lists ────────────────────────────────────────────────────

import type { StaticScreenProps } from '@react-navigation/native';

export type AppointmentDetailParams = { appointmentId: string };
export type ProviderProfileParams = { providerData: ProviderSnapshot };
export type BookingDraftParams = { clinicId?: string } | undefined;

export type AppointmentDetailScreenProps = StaticScreenProps<AppointmentDetailParams>;
export type ProviderProfileScreenProps = StaticScreenProps<ProviderProfileParams>;
export type BookingDraftScreenProps = StaticScreenProps<BookingDraftParams>;
