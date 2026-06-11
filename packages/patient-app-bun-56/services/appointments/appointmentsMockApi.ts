// ─────────────────────────────────────────────────────────────────────────────
// Appointments Mock API
// Simulates network responses. Replace this module's functions with real HTTP
// calls when the backend API is ready. The service layer (appointmentsService.ts)
// calls these functions and handles caching — it does NOT need to change.
// ─────────────────────────────────────────────────────────────────────────────

import {
    AppointmentItem,
    AppointmentsApiResponse,
    AppointmentStatus,
    AvailableSlot,
    AvailableSlotsResponse,
    BookingProviderOption,
    BookingServiceOption,
    ProviderSnapshot,
    ClinicSnapshot,
    AttachedDocument,
    AffiliatedClinic,
} from './types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isoDate(offsetDays: number, hour: number, minute = 0): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
}

// ── Fixture Data ──────────────────────────────────────────────────────────────

const AFFILIATED_CLINICS_CITYSIDE: AffiliatedClinic[] = [
    { id: 'clinic-1', name: 'Cityside Medical Center', address: '123 Ayala Ave, Makati City, Metro Manila' },
    { id: 'clinic-4', name: 'Eastwood Outpatient Clinic', address: '45 Eastwood Ave, Quezon City, Metro Manila' },
];

const AFFILIATED_CLINICS_HOPEWELL: AffiliatedClinic[] = [
    { id: 'clinic-2', name: 'Hopewell Community Clinic', address: '78 Rizal St, Bacolod City, Negros Occidental' },
    { id: 'clinic-5', name: 'Southern Cross Medical Hub', address: '12 Burgos St, Davao City, Davao del Sur' },
];

const AFFILIATED_CLINICS_METRO: AffiliatedClinic[] = [
    { id: 'clinic-3', name: 'Metro Primary Care Center', address: '56 Session Rd, Baguio City, Benguet' },
];

const PROVIDER_DR_REYES: ProviderSnapshot = {
    id: 'prov-1',
    name: 'Dr. Maria Santos Reyes, MD',
    specialty: 'Internal Medicine',
    avatarUrl: 'https://i.pravatar.cc/150?img=47',
    bio: 'Dr. Reyes is a board-certified internist with over 15 years of clinical practice. She completed her fellowship at the Philippine General Hospital and specializes in preventive medicine and chronic disease management. She is known for her holistic, patient-centered approach.',
    credentials: ['MD', 'FPCP', 'DPIM', 'MSCE'],
    affiliatedClinics: AFFILIATED_CLINICS_CITYSIDE,
};

const PROVIDER_DR_VILLANUEVA: ProviderSnapshot = {
    id: 'prov-2',
    name: 'Dr. Jose Villanueva, MD',
    specialty: 'Cardiology',
    avatarUrl: 'https://i.pravatar.cc/150?img=68',
    bio: 'Dr. Villanueva is a cardiologist with expertise in interventional cardiology and heart failure management. He trained at the Heart Institute of the Philippines and has been practicing for 20 years.',
    credentials: ['MD', 'FPCC', 'FACC', 'DPCM'],
    affiliatedClinics: AFFILIATED_CLINICS_HOPEWELL,
};

const PROVIDER_DR_DELA_CRUZ: ProviderSnapshot = {
    id: 'prov-3',
    name: 'Dr. Ana Dela Cruz, MD',
    specialty: 'General Practice',
    avatarUrl: 'https://i.pravatar.cc/150?img=32',
    bio: 'Dr. Dela Cruz is a general practitioner serving the Baguio community for over 10 years. She provides comprehensive primary care for all ages, with a focus on family medicine and preventive health.',
    credentials: ['MD', 'DPFM'],
    affiliatedClinics: AFFILIATED_CLINICS_METRO,
};

const CLINIC_CITYSIDE: ClinicSnapshot = {
    id: 'clinic-1',
    name: 'Cityside Medical Center',
    address: '123 Ayala Ave, Makati City, Metro Manila',
    logoUrl: 'https://ui-avatars.com/api/?name=Cityside+Medical&background=1D4ED8&color=fff&size=128',
    coverImageUrl: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=800&q=80',
    phoneNumber: '+63 2 8888 1234',
};

const CLINIC_HOPEWELL: ClinicSnapshot = {
    id: 'clinic-2',
    name: 'Hopewell Community Clinic',
    address: '78 Rizal St, Bacolod City, Negros Occidental',
    logoUrl: 'https://ui-avatars.com/api/?name=Hopewell+Clinic&background=059669&color=fff&size=128',
    coverImageUrl: 'https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=800&q=80',
    phoneNumber: '+63 34 433 5678',
};

const CLINIC_METRO: ClinicSnapshot = {
    id: 'clinic-3',
    name: 'Metro Primary Care Center',
    address: '56 Session Rd, Baguio City, Benguet',
    logoUrl: 'https://ui-avatars.com/api/?name=Metro+Primary&background=7C3AED&color=fff&size=128',
    coverImageUrl: 'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?w=800&q=80',
    phoneNumber: '+63 74 442 9012',
};

const DOCS_CITYSIDE: AttachedDocument[] = [
    {
        id: 'doc-1',
        name: 'CBC Results - May 2026.pdf',
        uploadedAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
        sizeBytes: 184_320,
        mimeType: 'application/pdf',
        uploadedBy: 'patient',
    },
    {
        id: 'doc-2',
        name: 'Lab Request Form.pdf',
        uploadedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        sizeBytes: 92_160,
        mimeType: 'application/pdf',
        uploadedBy: 'clinic',
    },
];

// ── Mock Appointments Dataset ─────────────────────────────────────────────────

function buildMockAppointments(patientId: string, now: string): AppointmentItem[] {
    return [
        // 1. Active Today — confirmed
        {
            id: 'appt-today-1',
            patientId,
            clinic: CLINIC_CITYSIDE,
            provider: PROVIDER_DR_REYES,
            serviceType: 'Annual Physical Exam',
            scheduledAt: isoDate(0, 10, 30),
            durationMinutes: 45,
            status: 'confirmed' as AppointmentStatus,
            notes: 'Please fast for 8 hours before the appointment. Bring your previous lab results.',
            attachedDocuments: DOCS_CITYSIDE,
            cachedAt: now,
        },
        // 2. Upcoming — action_required (consent needed)
        {
            id: 'appt-upcoming-1',
            patientId,
            clinic: CLINIC_HOPEWELL,
            provider: PROVIDER_DR_VILLANUEVA,
            serviceType: 'Cardiology Follow-Up',
            scheduledAt: isoDate(3, 14, 0),
            durationMinutes: 30,
            status: 'action_required' as AppointmentStatus,
            notes: 'Please review and sign the updated consent form before your visit.',
            attachedDocuments: [],
            cachedAt: now,
        },
        // 3. Upcoming — pending
        {
            id: 'appt-upcoming-2',
            patientId,
            clinic: CLINIC_METRO,
            provider: PROVIDER_DR_DELA_CRUZ,
            serviceType: 'General Consultation',
            scheduledAt: isoDate(7, 9, 0),
            durationMinutes: 20,
            status: 'pending' as AppointmentStatus,
            notes: null,
            attachedDocuments: [],
            cachedAt: now,
        },
        // 4. Past — completed
        {
            id: 'appt-past-1',
            patientId,
            clinic: CLINIC_CITYSIDE,
            provider: PROVIDER_DR_REYES,
            serviceType: 'Follow-Up Consultation',
            scheduledAt: isoDate(-14, 11, 0),
            durationMinutes: 30,
            status: 'completed' as AppointmentStatus,
            notes: null,
            attachedDocuments: [],
            cachedAt: now,
        },
        // 5. Past — canceled
        {
            id: 'appt-past-2',
            patientId,
            clinic: CLINIC_HOPEWELL,
            provider: PROVIDER_DR_VILLANUEVA,
            serviceType: 'Echocardiogram',
            scheduledAt: isoDate(-30, 15, 30),
            durationMinutes: 60,
            status: 'canceled' as AppointmentStatus,
            notes: 'Canceled by patient — rescheduled.',
            attachedDocuments: [],
            cachedAt: now,
        },
    ];
}

// ── Mock Slot Fixtures ────────────────────────────────────────────────────────

function buildMockSlots(date: string): AvailableSlot[] {
    // Deterministic "availability" based on the date string so the same date
    // always returns the same pattern during development.
    const seed = date.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const unavailableSet = new Set([seed % 8, (seed + 3) % 8, (seed + 5) % 8]);

    const definitions: Array<{ time: string; displayTime: string; period: 'morning' | 'afternoon' | 'evening' }> = [
        { time: '09:00', displayTime: '9:00 AM', period: 'morning' },
        { time: '09:30', displayTime: '9:30 AM', period: 'morning' },
        { time: '10:00', displayTime: '10:00 AM', period: 'morning' },
        { time: '11:00', displayTime: '11:00 AM', period: 'morning' },
        { time: '13:00', displayTime: '1:00 PM', period: 'afternoon' },
        { time: '14:00', displayTime: '2:00 PM', period: 'afternoon' },
        { time: '15:00', displayTime: '3:00 PM', period: 'afternoon' },
        { time: '16:00', displayTime: '4:00 PM', period: 'afternoon' },
        { time: '17:30', displayTime: '5:30 PM', period: 'evening' },
        { time: '18:00', displayTime: '6:00 PM', period: 'evening' },
    ];

    return definitions.map((def, idx) => ({
        id: `${date}-${def.time}`,
        ...def,
        available: !unavailableSet.has(idx),
    }));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Simulates fetching all appointments for a patient from the server.
 * Replace the body of this function with a real fetch() call when the
 * backend /v1/patient/appointments endpoint is ready.
 */
export async function getAppointments(patientId: string): Promise<AppointmentsApiResponse> {
    await delay(320);
    const now = new Date().toISOString();
    return {
        appointments: buildMockAppointments(patientId, now),
        fetchedAt: now,
    };
}

/**
 * Simulates fetching available time slots for a clinic on a specific date.
 */
export async function getAvailableSlots(clinicId: string, date: string): Promise<AvailableSlotsResponse> {
    await delay(180);
    return {
        date,
        slots: buildMockSlots(date),
    };
}

/**
 * Simulates fetching bookable service options for a clinic.
 */
export async function getServiceOptions(_clinicId: string): Promise<BookingServiceOption[]> {
    await delay(150);
    return [
        { id: 'svc-1', name: 'Annual Physical Exam', description: 'Comprehensive head-to-toe physical examination', durationMinutes: 45 },
        { id: 'svc-2', name: 'General Consultation', description: 'Discuss symptoms, get a diagnosis and treatment plan', durationMinutes: 20 },
        { id: 'svc-3', name: 'Follow-Up Visit', description: 'Review test results or check on a previous condition', durationMinutes: 15 },
        { id: 'svc-4', name: 'Specialist Referral Consult', description: 'Consultation for specialist referral evaluation', durationMinutes: 30 },
    ];
}

/**
 * Simulates fetching available healthcare providers for a clinic.
 */
export async function getProviderOptions(_clinicId: string): Promise<BookingProviderOption[]> {
    await delay(150);
    return [
        { id: PROVIDER_DR_REYES.id, name: PROVIDER_DR_REYES.name, specialty: PROVIDER_DR_REYES.specialty, avatarUrl: PROVIDER_DR_REYES.avatarUrl },
        { id: PROVIDER_DR_VILLANUEVA.id, name: PROVIDER_DR_VILLANUEVA.name, specialty: PROVIDER_DR_VILLANUEVA.specialty, avatarUrl: PROVIDER_DR_VILLANUEVA.avatarUrl },
        { id: PROVIDER_DR_DELA_CRUZ.id, name: PROVIDER_DR_DELA_CRUZ.name, specialty: PROVIDER_DR_DELA_CRUZ.specialty, avatarUrl: PROVIDER_DR_DELA_CRUZ.avatarUrl },
    ];
}
