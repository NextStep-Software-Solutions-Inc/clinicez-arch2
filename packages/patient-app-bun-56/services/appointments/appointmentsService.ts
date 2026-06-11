// ─────────────────────────────────────────────────────────────────────────────
// Appointments Service
// Orchestrates: mock API calls → SQLite cache reads/writes.
// The UI should always call fetchAppointments() — it attempts the live API and
// falls back to the SQLite cache on failure, returning an isFromCache flag.
// ─────────────────────────────────────────────────────────────────────────────

import { eq, desc } from 'drizzle-orm';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { appointments } from '@db/schema/appointments';
import {
    getAppointments,
    getAvailableSlots,
    getServiceOptions,
    getProviderOptions,
} from './appointmentsMockApi';
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
): Promise<FetchAppointmentsResult> {
    try {
        const response = await getAppointments(patientId);
        const items = response.appointments;
        await persistToCache(db, patientId, items);
        return {
            items,
            isFromCache: false,
            cachedAt: response.fetchedAt,
        };
    } catch {
        const cached = await readFromCache(db, patientId);
        const cachedAt = cached.length > 0 ? cached[0].cachedAt : null;
        return {
            items: cached,
            isFromCache: true,
            cachedAt,
        };
    }
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
    const rows = await db
        .select()
        .from(appointments)
        .where(eq(appointments.id, appointmentId));

    if (rows.length === 0) return null;
    return rowToItem(rows[0]);
}

/**
 * Fetches available time slots for a clinic on a given date.
 * Not cached — always live (mock for now).
 */
export async function fetchAvailableSlots(
    clinicId: string,
    date: string,
): Promise<AvailableSlotsResponse> {
    return getAvailableSlots(clinicId, date);
}

/**
 * Fetches bookable service options for a clinic.
 * Not cached — always live (mock for now).
 */
export async function fetchServiceOptions(clinicId: string): Promise<BookingServiceOption[]> {
    return getServiceOptions(clinicId);
}

/**
 * Fetches available healthcare providers for a clinic.
 * Not cached — always live (mock for now).
 */
export async function fetchProviderOptions(clinicId: string): Promise<BookingProviderOption[]> {
    return getProviderOptions(clinicId);
}
