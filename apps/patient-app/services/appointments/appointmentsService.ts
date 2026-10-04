// ─────────────────────────────────────────────────────────────────────────────
// Appointments Service
// Orchestrates: mock API calls → SQLite cache reads/writes.
// The UI should always call fetchAppointments() — it attempts the live API and
// falls back to the SQLite cache on failure, returning an isFromCache flag.
// ─────────────────────────────────────────────────────────────────────────────

import { eq, desc, and, inArray } from 'drizzle-orm';
import NetInfo from '@react-native-community/netinfo';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { appointments } from '@db/schema/appointments';
import { bookingDrafts } from '@db/schema/bookingDrafts';
import { clinics } from '@db/schema/clinics';
// No mock imports
import { getClinicDetailOnline, listClinics } from '../discovery/discoveryService';
import { fetchAppointmentsLive } from '../api/appointmentsApi';
import type { RemoteAppointment } from '../api/appointmentsApi';
import type {
    AppointmentItem,
    AvailableSlotsResponse,
    BookingServiceOption,
    BookingProviderOption,
} from './types';

export interface FetchAppointmentsResult {
    items: AppointmentItem[];
    isFromCache: boolean;
    cachedAt: string | null;
}

// ── Local booking helpers (bookingDrafts with status='ready') ────────────────

/**
 * Converts a confirmed local booking (bookingDrafts row with status='ready')
 * into an AppointmentItem so it can be displayed in the Appointments screen
 * before the server has synced it.
 */
function localBookingToAppointmentItem(
    draft: typeof bookingDrafts.$inferSelect,
    clinic: typeof clinics.$inferSelect | undefined,
): AppointmentItem {
    // Parse service name from encoded notes: [[service:id=X;name=Y]]
    const serviceMatch = draft.notes?.match(/^\[\[service:id=[^;]+;name=([^\]]+)\]\]/);
    const serviceName = serviceMatch?.[1] ?? draft.reason ?? 'Booking Request';

    // Strip metadata prefix from notes for display
    const cleanNotes = draft.notes?.replace(/^\[\[service:[^\]]+\]\]\n?/, '').trim() || null;

    const dateStr = draft.preferredDate ?? new Date().toISOString().slice(0, 10);
    const timeStr = draft.preferredTime ?? '09:00';
    const scheduledAt = (() => {
        const [result, error] = safeRun(() => new Date(`${dateStr}T${timeStr}:00`))
        if (error || result === null) return new Date().toISOString();
        return result.toISOString();
    })();

    return {
        id: draft.id,
        patientId: draft.patientId,
        clinic: {
            id: draft.clinicId,
            name: clinic?.name ?? 'Clinic',
            address: clinic?.address ?? '',
            logoUrl: clinic?.logoUrl ?? null,
            coverImageUrl: clinic?.coverImageUrl ?? null,
            phoneNumber: null,
        },
        provider: {
            id: 'local-pending',
            name: 'To be assigned',
            specialty: '',
            avatarUrl: null,
            bio: 'The clinic will assign a provider once the appointment is confirmed.',
            credentials: [],
            affiliatedClinics: [],
            rating: 0,
        },
        serviceType: serviceName,
        scheduledAt,
        durationMinutes: 30,
        status: 'pending',
        notes: cleanNotes,
        attachedDocuments: [],
        cachedAt: draft.updatedAt.toISOString(),
        paymentStatus: null,
        paymentDueAt: null,
        invoiceAmount: null,
        currency: 'PHP',
    };
}

function mapRemoteStatus(status?: string): AppointmentItem['status'] {
    if (!status) return 'pending';
    const s = status.toLowerCase();
    if (s.includes('cancel')) return 'canceled';
    if (s.includes('noshow')) return 'no_show';
    if (s.includes('action')) return 'action_required';
    if (s === 'confirmed') return 'confirmed';
    if (s === 'completed') return 'completed';
    if (s === 'pending') return 'pending';
    return 'pending';
}

function remoteToLocalItem(remote: RemoteAppointment): AppointmentItem {
    return {
        id: remote.id,
        patientId: '',
        clinic: {
            id: remote.clinicId,
            name: remote.clinicName,
            address: '',
            logoUrl: null,
            coverImageUrl: null,
            phoneNumber: '',
        },
        provider: {
            id: remote.provider.id,
            name: remote.provider.name,
            specialty: remote.provider.specialty ?? '',
            avatarUrl: remote.provider.avatarUrl ?? null,
            bio: '',
            credentials: [],
            affiliatedClinics: [],
            rating: 0,
        },
        serviceType: remote.serviceType ?? 'Consultation',
        scheduledAt: remote.scheduledAt,
        durationMinutes: remote.durationMinutes,
        status: mapRemoteStatus(remote.status),
        notes: remote.notes ?? null,
        subject: remote.subject ?? null,
        chiefComplaint: remote.chiefComplaint ?? null,
        clinicalAssessment: remote.clinicalAssessment ?? null,
        doctorPlan: remote.doctorPlan ?? null,
        prescriptionsSummary: remote.prescriptionsSummary ?? null,
        prescriptionPublicVerificationUrl: remote.prescriptionPublicVerificationUrl ?? null,
        attachedDocuments: [],
        cachedAt: new Date().toISOString(),
        paymentStatus: null,
        paymentDueAt: null,
        invoiceAmount: null,
        currency: 'PHP',
    };
}

/**
 * Reads all locally-confirmed bookings (status='ready') for a patient.
 * These are bookings submitted by the user but not yet acknowledged by the
 * server. They persist across app restarts and are merged into the
 * appointments list until the server sync replaces them.
 */
async function loadLocalBookings(
    db: ExpoSQLiteDatabase<any>,
    patientId: string,
): Promise<AppointmentItem[]> {
    const draftRows = await db
        .select()
        .from(bookingDrafts)
        .where(and(
            eq(bookingDrafts.patientId, patientId),
            eq(bookingDrafts.status, 'ready'),
        ))
        .orderBy(desc(bookingDrafts.updatedAt));

    if (draftRows.length === 0) return [];

    const clinicIds = [...new Set(draftRows.map(r => r.clinicId))];
    const clinicRows = await db.select().from(clinics).where(inArray(clinics.id, clinicIds));
    const clinicMap = new Map(clinicRows.map(c => [c.id, c]));

    return draftRows.map(draft => localBookingToAppointmentItem(draft, clinicMap.get(draft.clinicId)));
}

/**
 * Merges local confirmed bookings with server/cache items.
 * Local items take precedence when IDs match (shouldn't happen in practice
 * since local IDs are UUIDs and server IDs are server-assigned).
 * Result is sorted newest scheduledAt first.
 */
function mergeWithLocalBookings(
    local: AppointmentItem[],
    remote: AppointmentItem[],
): AppointmentItem[] {
    const localIds = new Set(local.map(a => a.id));
    const merged = [...local, ...remote.filter(a => !localIds.has(a.id))];
    return merged.sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

function rowToItem(row: typeof appointments.$inferSelect): AppointmentItem {
    return JSON.parse(row.rawJson) as AppointmentItem;
}

async function persistToCache(
    db: ExpoSQLiteDatabase<any>,
    patientId: string,
    items: AppointmentItem[],
): Promise<void> {
    const now = new Date().toISOString();

    // Delete all cached rows for this patient, then insert fresh ones
    await db.delete(appointments).where(eq(appointments.patientId, patientId));

    if (items.length === 0) return;

    const rows = items.map(item => ({
        id: item.id,
        patientId,
        clinicId: item.clinic.id,
        clinicName: item.clinic.name,
        clinicAddress: item.clinic.address ?? null,
        clinicLogoUrl: item.clinic.logoUrl ?? null,
        clinicCoverImageUrl: item.clinic.coverImageUrl ?? null,
        clinicPhoneNumber: item.clinic.phoneNumber ?? null,
        providerId: item.provider.id,
        providerName: item.provider.name,
        providerSpecialty: item.provider.specialty ?? null,
        providerAvatarUrl: item.provider.avatarUrl ?? null,
        providerBio: item.provider.bio ?? null,
        providerCredentialsJson: JSON.stringify(item.provider.credentials),
        providerAffiliatedClinicsJson: JSON.stringify(item.provider.affiliatedClinics),
        serviceType: item.serviceType ?? null,
        scheduledAt: item.scheduledAt,
        durationMinutes: item.durationMinutes,
        status: item.status,
        notes: item.notes ?? null,
        attachedDocumentsJson: JSON.stringify(item.attachedDocuments),
        cachedAt: now,
        rawJson: JSON.stringify({ ...item, cachedAt: now }),
    }));

    await db.insert(appointments).values(rows);
}

async function readFromCache(
    db: ExpoSQLiteDatabase<any>,
    patientId: string,
): Promise<AppointmentItem[]> {
    const rows = await db
        .select()
        .from(appointments)
        .where(eq(appointments.patientId, patientId))
        .orderBy(desc(appointments.scheduledAt));
    return rows.map(rowToItem);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetches appointments from the live API, persists them to SQLite, and returns
 * the items with isFromCache = false.
 *
 * On any failure (network error, API error), reads from the SQLite cache and
 * returns items with isFromCache = true.
 *
 * The Appointments screen should always call this function on focus so users
 * always see the most up-to-date schedule when online.
 */
export async function fetchAppointments(
    patientId: string,
    db: ExpoSQLiteDatabase<any>,
    getToken: () => Promise<string | null>,
): Promise<FetchAppointmentsResult> {
    const localBookings = await loadLocalBookings(db, patientId);
    const netInfo = await NetInfo.fetch();
    const isOnline = netInfo.isConnected && netInfo.isInternetReachable;

    if (!isOnline) {
        const cached = await readFromCache(db, patientId);
        const cachedAt = cached.length > 0 ? cached[0].cachedAt : null;
        return {
            items: mergeWithLocalBookings(localBookings, cached),
            isFromCache: true,
            cachedAt,
        };
    }

    try {
        const res = await fetchAppointmentsLive(getToken, patientId);
        const apiItems = res.items.map(remoteToLocalItem);

        apiItems.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

        await persistToCache(db, patientId, apiItems);
        return {
            items: mergeWithLocalBookings(localBookings, apiItems),
            isFromCache: false,
            cachedAt: new Date().toISOString(),
        };
    } catch {
        const cached = await readFromCache(db, patientId);
        const cachedAt = cached.length > 0 ? cached[0].cachedAt : null;
        return {
            items: mergeWithLocalBookings(localBookings, cached),
            isFromCache: true,
            cachedAt,
        };
    }
}

export async function getCachedAppointmentsWithLocalBookings(
    patientId: string,
    db: ExpoSQLiteDatabase<any>,
): Promise<FetchAppointmentsResult> {
    const localBookings = await loadLocalBookings(db, patientId);
    const cached = await readFromCache(db, patientId);
    const cachedAt = cached.length > 0 ? cached[0].cachedAt : null;
    return {
        items: mergeWithLocalBookings(localBookings, cached),
        isFromCache: true,
        cachedAt,
    };
}

/**
 * Reads appointments directly from the SQLite cache without touching the network.
 * Useful for initial render before the network call resolves.
 */
export async function getCachedAppointments(
    patientId: string,
    db: ExpoSQLiteDatabase<any>,
): Promise<AppointmentItem[]> {
    return readFromCache(db, patientId);
}

/**
 * Returns a single appointment by ID from the SQLite cache.
 * Returns null if not found.
 */
export async function getAppointmentDetail(
    appointmentId: string,
    db: ExpoSQLiteDatabase<any>,
): Promise<AppointmentItem | null> {
    // 1. Check the API cache first (server-confirmed appointments)
    const rows = await db
        .select()
        .from(appointments)
        .where(eq(appointments.id, appointmentId));

    if (rows.length > 0) return rowToItem(rows[0]);

    // 2. Fall back to locally-confirmed bookings not yet synced to server
    const draftRows = await db
        .select()
        .from(bookingDrafts)
        .where(and(
            eq(bookingDrafts.id, appointmentId),
            eq(bookingDrafts.status, 'ready'),
        ));

    if (draftRows.length === 0) return null;

    const draft = draftRows[0];
    const clinicRows = await db.select().from(clinics).where(eq(clinics.id, draft.clinicId));
    return localBookingToAppointmentItem(draft, clinicRows[0]);
}

/**
 * Updates an appointment's schedule in-place:
 *   - Sets scheduledAt to the new ISO-8601 datetime
 *   - Resets status to 'pending' (awaiting clinic re-confirmation)
 *   - Appends the reschedule reason to notes; everything else is preserved as-is
 *
 * Works for both API-cached appointments (in `appointments` table) and
 * locally-confirmed bookings (in `bookingDrafts` with status='ready').
 */
export async function rescheduleAppointment(
    appointmentId: string,
    newScheduledAt: string,
    reason: string,
    db: ExpoSQLiteDatabase<any>,
): Promise<AppointmentItem | null> {
    const network = await NetInfo.fetch();
    if (!network.isConnected) {
        throw new Error('OFFLINE_ERROR');
    }

    const existing = await getAppointmentDetail(appointmentId, db);
    if (!existing) return null;

    const now = new Date().toISOString();
    const rescheduleNote = reason.trim()
        ? `Reschedule request: ${reason.trim()}`
        : 'Reschedule requested by patient';

    const updatedNotes = existing.notes
        ? `${existing.notes}\n\n${rescheduleNote}`
        : rescheduleNote;

    const updated: AppointmentItem = {
        ...existing,
        scheduledAt: newScheduledAt,
        status: 'pending',
        notes: updatedNotes,
        cachedAt: now,
    };

    // 1. Update the API-cache table (server-confirmed appointments)
    await db
        .update(appointments)
        .set({
            scheduledAt: newScheduledAt,
            status: 'pending',
            notes: updatedNotes,
            cachedAt: now,
            rawJson: JSON.stringify(updated),
        })
        .where(eq(appointments.id, appointmentId));

    // 2. Also update bookingDrafts for locally-confirmed bookings that
    //    haven't synced yet (their id matches appointmentId in that table)
    const dateStr = newScheduledAt.slice(0, 10);       // YYYY-MM-DD
    const timeStr = newScheduledAt.slice(11, 16);       // HH:mm
    await db
        .update(bookingDrafts)
        .set({
            preferredDate: dateStr,
            preferredTime: timeStr,
            notes: (() => {
                // Preserve the [[service:...]] metadata prefix if present
                const raw = existing.notes ?? '';
                const metaMatch = raw.match(/^(\[\[service:[^\]]+\]\]\n?)([\s\S]*)$/);
                if (metaMatch) {
                    const body = metaMatch[2].trim();
                    const newBody = body ? `${body}\n\n${rescheduleNote}` : rescheduleNote;
                    return `${metaMatch[1]}${newBody}`;
                }
                return raw ? `${raw}\n\n${rescheduleNote}` : rescheduleNote;
            })(),
            updatedAt: new Date(),
        })
        .where(eq(bookingDrafts.id, appointmentId));

    return updated;
}

import { fetchAvailableSlotsLive } from '../api/appointmentsApi';
import { safeRun } from '@shared/safe';

/**
 * Fetches available time slots for a clinic on a given date.
 * Not cached — always live (mock for now).
 */
export async function fetchAvailableSlots(
    clinicId: string,
    providerId: string,
    date: string,
    getToken: () => Promise<string | null>,
): Promise<AvailableSlotsResponse> {
    const live = await fetchAvailableSlotsLive(getToken, clinicId, providerId, date);
    return live as AvailableSlotsResponse;
}

/**
 * Fetches bookable service options for a clinic.
 * Not cached — always live (mock for now).
 */
export async function fetchServiceOptions(
    clinicId: string,
    patientId: string,
    getToken: () => Promise<string | null>
): Promise<BookingServiceOption[]> {
    const detail = await getClinicDetailOnline(patientId, clinicId, getToken);
    if (!detail) throw new Error('Clinic not found');
    return detail.services.map(s => ({ ...s, durationMinutes: s.durationMinutes ?? 0 }));
}

/**
 * Fetches available healthcare providers for a clinic.
 * Not cached — always live (mock for now).
 */
export async function fetchProviderOptions(
    clinicId: string,
    patientId: string,
    getToken: () => Promise<string | null>
): Promise<BookingProviderOption[]> {
    const detail = await getClinicDetailOnline(patientId, clinicId, getToken);
    if (!detail) throw new Error('Clinic not found');
    return detail.healthcareProviders;
}
