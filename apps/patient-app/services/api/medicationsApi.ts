/**
 * Pure HTTP API client and SQLite caching layer for Patient Medications & Adherence.
 *
 * Connects to patient-api:
 * - GET  /api/v1/patients/{patientId}/medications/today?date={date}
 * - POST /api/v1/patients/{patientId}/medications/{medicationId}/log
 *
 * Implements offline SQLite fallback querying the `patient_medications` table when offline or when network throws.
 */

import { and, desc, eq } from 'drizzle-orm';
import { api, ApiError, type TokenProvider } from './apiClient';
import { db } from '../../db/index';
import { patientMedications, type PatientMedication } from '../../db/schema/patientMedications';

let globalTokenProvider: TokenProvider = async () => null;
let customDb: any = null;

/**
 * Configure a custom database instance (e.g. in-memory SQLite for tests).
 */
export function setMedicationsDb(database: any): void {
  customDb = database;
}

export function getActiveMedicationsDb(): any {
  return customDb ?? db;
}

/**
 * Configure a default token provider (e.g. from Clerk or auth state).
 */
export function setMedicationsTokenProvider(provider: TokenProvider): void {
  globalTokenProvider = provider;
}

export interface TodayMedicationDto {
  id: string;
  medicationName: string;
  dosage: string | null;
  instructions: string | null;
  scheduledTime: string | null;
  isTaken: boolean;
  takenAt: string | null;
  // Aliases for compatibility with MedicationScheduleItem / UI components
  name?: string;
  instruction?: string;
}

export interface LogAdherenceInput {
  takenAt?: string;
  notes?: string;
}

// In-memory or temporary local adherence map for offline adherence logging
const localAdherenceStore = new Map<string, { isTaken: boolean; takenAt: string; notes?: string }>();

// ── SQLite Cache Helpers ───────────────────────────────────────────────────────

/**
 * Persists today's active medications into local SQLite for offline resilience.
 */
export async function persistTodayMedicationsToCache(
  patientId: string,
  items: TodayMedicationDto[],
): Promise<void> {
  if (!items || items.length === 0) return;
  const nowMs = Date.now();

  try {
    const activeDb = getActiveMedicationsDb();
    if (!activeDb || typeof activeDb.insert !== 'function') return;

    for (const item of items) {
      await activeDb
        .insert(patientMedications)
        .values({
          id: item.id,
          patientId,
          drugName: item.medicationName,
          dosage: item.dosage,
          frequency: item.instructions ?? 'Daily',
          isActive: true,
          createdAt: new Date(nowMs),
          updatedAt: new Date(nowMs),
          syncedAt: new Date(nowMs),
        })
        .onConflictDoUpdate({
          target: patientMedications.id,
          set: {
            drugName: item.medicationName,
            dosage: item.dosage,
            frequency: item.instructions ?? 'Daily',
            isActive: true,
            updatedAt: new Date(nowMs),
            syncedAt: new Date(nowMs),
          },
        });
    }
  } catch (err) {
    if (!String(err).includes('target.insert is not a function')) {
      console.warn('[medicationsApi] Failed to persist medications to SQLite cache:', err);
    }
  }
}

/**
 * Retrieves active medications from local SQLite cache when offline.
 */
export async function getCachedTodayMedications(
  patientId: string,
): Promise<TodayMedicationDto[]> {
  try {
    const activeDb = getActiveMedicationsDb();
    if (!activeDb || typeof activeDb.select !== 'function') return [];

    const rows = await activeDb
      .select()
      .from(patientMedications)
      .where(
        and(
          eq(patientMedications.patientId, patientId),
          eq(patientMedications.isActive, true),
        ),
      )
      .orderBy(desc(patientMedications.updatedAt));

    return rows.map((r: any) => {
      const adherenceKey = `${patientId}_${r.id}`;
      const localAdherence = localAdherenceStore.get(adherenceKey);

      return {
        id: r.id,
        medicationName: r.drugName,
        dosage: r.dosage,
        instructions: r.frequency ?? 'Daily',
        scheduledTime: '8:00 AM',
        isTaken: localAdherence?.isTaken ?? false,
        takenAt: localAdherence?.takenAt ?? null,
        name: r.drugName,
        instruction: r.frequency ?? 'Daily',
      };
    });
  } catch (err) {
    console.warn('[medicationsApi] Failed to read medications from SQLite cache:', err);
    return [];
  }
}

// ── HTTP API Methods ──────────────────────────────────────────────────────────

/**
 * Fetches active daily medications and adherence status for today.
 * Calls `GET /api/v1/patients/{patientId}/medications/today?date={date}`.
 * Persists into SQLite on success, falls back to SQLite cache when offline or on error.
 */
export async function fetchTodayMedications(
  patientId: string,
  date?: string,
  getToken?: TokenProvider,
): Promise<TodayMedicationDto[]> {
  const tokenFn = getToken ?? globalTokenProvider;
  const path = date
    ? `/patients/${patientId}/medications/today?date=${encodeURIComponent(date)}`
    : `/patients/${patientId}/medications/today`;

  try {
    const data = await api.get<TodayMedicationDto[]>(tokenFn, path);

    if (data && Array.isArray(data)) {
      const enriched = data.map((item) => ({
        ...item,
        name: item.medicationName,
        instruction: item.instructions ?? '',
      }));
      await persistTodayMedicationsToCache(patientId, enriched).catch(() => {});
      return enriched;
    }

    return [];
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return [];
    }

    // Try offline SQLite fallback
    const cached = await getCachedTodayMedications(patientId);
    if (cached && cached.length > 0) {
      return cached;
    }

    throw err;
  }
}

/**
 * Logs a medication dose taken for today ("Log Now" button).
 * Calls `POST /api/v1/patients/{patientId}/medications/{medicationId}/log`.
 * Also records locally for offline persistence.
 */
export async function logMedicationAdherence(
  patientId: string,
  medicationId: string,
  takenAt?: string,
  notes?: string,
  getToken?: TokenProvider,
): Promise<boolean> {
  const tokenFn = getToken ?? globalTokenProvider;
  const resolvedTakenAt = takenAt ?? new Date().toISOString();

  // Record locally first for instant offline responsiveness
  const adherenceKey = `${patientId}_${medicationId}`;
  localAdherenceStore.set(adherenceKey, {
    isTaken: true,
    takenAt: resolvedTakenAt,
    notes,
  });

  try {
    const success = await api.post<boolean>(
      tokenFn,
      `/patients/${patientId}/medications/${medicationId}/log`,
      {
        takenAt: resolvedTakenAt,
        notes,
      },
    );
    return success;
  } catch (err) {
    // If offline or network error, local store has recorded it; rethrow or return true if acceptable
    console.warn('[medicationsApi] Online log failed, saved in local adherence store:', err);
    throw err;
  }
}
