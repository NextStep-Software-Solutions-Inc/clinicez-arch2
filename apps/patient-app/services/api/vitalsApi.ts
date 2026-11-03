/**
 * Pure HTTP API client and SQLite caching layer for Patient Vitals telemetry.
 *
 * Connects to patient-api:
 * - GET  /api/v1/patients/{patientId}/vitals/latest
 * - GET  /api/v1/patients/{patientId}/vitals
 * - POST /api/v1/patients/{patientId}/vitals
 *
 * Implements offline SQLite fallback querying the `vital_signs` table when offline or when network throws.
 */

import { desc, eq } from 'drizzle-orm';
import { api, ApiError, type TokenProvider } from './apiClient';
import { db } from '../../db/index';
import { vitalSigns, type VitalSign } from '../../db/schema/vitalSigns';

export type { TokenProvider };

let globalTokenProvider: TokenProvider = async () => null;
let customDb: any = null;

/**
 * Configure a custom database instance (e.g. in-memory SQLite for tests).
 */
export function setVitalsDb(database: any): void {
  customDb = database;
}

export function getActiveVitalsDb(): any {
  return customDb ?? db;
}

/**
 * Configure a default token provider (e.g. from Clerk or auth state).
 */
export function setVitalsTokenProvider(provider: TokenProvider): void {
  globalTokenProvider = provider;
}

export interface LatestVitalsDto {
  heartRateBpm: number | null;
  heartRateTrend: string | null;
  systolicBp: number | null;
  diastolicBp: number | null;
  bpCategory: string | null;
  bloodGlucoseMgDl: number | null;
  glucoseCategory: string | null;
  sleepHours: number | null;
  sleepFormatted: string | null;
  sleepDeepFormatted: string | null;
  recordedAt: string;
  // Aliases for compatibility with VitalsData / UI components
  bpSystolic?: number | null;
  bpDiastolic?: number | null;
  fastingBloodGlucose?: number | string | null;
  spO2Percent?: number | string | null;
}

export interface VitalSignsDto {
  id: string;
  patientId: string;
  clinicId?: string | null;
  consultationId?: string | null;
  recordedAt: string;
  weightKg?: number | null;
  heightCm?: number | null;
  bmi?: number | null;
  systolicBp?: number | null;
  diastolicBp?: number | null;
  heartRateBpm?: number | null;
  temperatureCelsius?: number | null;
  oxygenSaturationPercent?: number | null;
  respiratoryRateBreathsPerMin?: number | null;
  fastingBloodGlucose?: number | null;
  bloodGlucoseMgDl?: number | null;
  sleepHours?: number | null;
  takenBy?: string | null;
  facility?: string | null;
  createdAt?: string;
  updatedAt?: string | null;
}

export interface RecordVitalsInput {
  clinicId?: string | null;
  consultationId?: string | null;
  recordedAt?: string;
  weightKg?: number | null;
  heightCm?: number | null;
  bmi?: number | null;
  systolicBp?: number | null;
  diastolicBp?: number | null;
  heartRateBpm?: number | null;
  temperatureCelsius?: number | null;
  oxygenSaturationPercent?: number | null;
  respiratoryRateBreathsPerMin?: number | null;
  fastingBloodGlucose?: number | null;
  bloodGlucoseMgDl?: number | null;
  sleepHours?: number | null;
  takenBy?: string | null;
  facility?: string | null;
}

// ── SQLite Cache Helpers ───────────────────────────────────────────────────────

/**
 * Persists the latest vitals record into local SQLite for offline resilience.
 */
export async function persistLatestVitalsToCache(
  patientId: string,
  vitals: LatestVitalsDto,
): Promise<void> {
  try {
    const activeDb = getActiveVitalsDb();
    if (!activeDb || typeof activeDb.insert !== 'function') return;

    const rowId = `vitals_latest_${patientId}`;
    const measuredAt = vitals.recordedAt ?? new Date().toISOString();
    const systolic = vitals.systolicBp ?? vitals.bpSystolic ?? null;
    const diastolic = vitals.diastolicBp ?? vitals.bpDiastolic ?? null;
    const glucose = vitals.bloodGlucoseMgDl != null
      ? Number(vitals.bloodGlucoseMgDl)
      : (vitals.fastingBloodGlucose != null ? Number(vitals.fastingBloodGlucose) : null);

    await activeDb
      .insert(vitalSigns)
      .values({
        id: rowId,
        patientId,
        measuredAt,
        heartRateBpm: vitals.heartRateBpm,
        bpSystolic: systolic,
        bpDiastolic: diastolic,
        fastingBloodGlucose: glucose,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: vitalSigns.id,
        set: {
          measuredAt,
          heartRateBpm: vitals.heartRateBpm,
          bpSystolic: systolic,
          bpDiastolic: diastolic,
          fastingBloodGlucose: glucose,
          syncedAt: new Date(),
        },
      });
  } catch (err) {
    if (!String(err).includes('target.insert is not a function')) {
      console.warn('[vitalsApi] Failed to persist latest vitals to SQLite cache:', err);
    }
  }
}

/**
 * Persists a list of vital signs into local SQLite.
 */
export async function persistVitalsHistoryToCache(
  patientId: string,
  items: VitalSignsDto[],
): Promise<void> {
  if (!items || items.length === 0) return;
  try {
    const activeDb = getActiveVitalsDb();
    if (!activeDb || typeof activeDb.insert !== 'function') return;

    for (const item of items) {
      await activeDb
        .insert(vitalSigns)
        .values({
          id: item.id,
          patientId,
          clinicId: item.clinicId ?? null,
          measuredAt: item.recordedAt ?? item.createdAt ?? new Date().toISOString(),
          heightCm: item.heightCm != null ? Number(item.heightCm) : null,
          weightKg: item.weightKg != null ? Number(item.weightKg) : null,
          bmi: item.bmi != null ? Number(item.bmi) : null,
          temperatureCelsius: item.temperatureCelsius != null ? Number(item.temperatureCelsius) : null,
          bpSystolic: item.systolicBp,
          bpDiastolic: item.diastolicBp,
          heartRateBpm: item.heartRateBpm,
          respiratoryRate: item.respiratoryRateBreathsPerMin,
          spO2Percent: item.oxygenSaturationPercent != null ? Number(item.oxygenSaturationPercent) : null,
          fastingBloodGlucose: item.bloodGlucoseMgDl != null
            ? Number(item.bloodGlucoseMgDl)
            : (item.fastingBloodGlucose != null ? Number(item.fastingBloodGlucose) : null),
          takenBy: item.takenBy ?? null,
          facility: item.facility ?? null,
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: vitalSigns.id,
          set: {
            measuredAt: item.recordedAt ?? item.createdAt ?? new Date().toISOString(),
            heightCm: item.heightCm != null ? Number(item.heightCm) : null,
            weightKg: item.weightKg != null ? Number(item.weightKg) : null,
            bmi: item.bmi != null ? Number(item.bmi) : null,
            temperatureCelsius: item.temperatureCelsius != null ? Number(item.temperatureCelsius) : null,
            bpSystolic: item.systolicBp,
            bpDiastolic: item.diastolicBp,
            heartRateBpm: item.heartRateBpm,
            respiratoryRate: item.respiratoryRateBreathsPerMin,
            spO2Percent: item.oxygenSaturationPercent != null ? Number(item.oxygenSaturationPercent) : null,
            fastingBloodGlucose: item.bloodGlucoseMgDl != null
              ? Number(item.bloodGlucoseMgDl)
              : (item.fastingBloodGlucose != null ? Number(item.fastingBloodGlucose) : null),
            takenBy: item.takenBy ?? null,
            facility: item.facility ?? null,
            syncedAt: new Date(),
          },
        });
    }
  } catch (err) {
    if (!String(err).includes('target.insert is not a function')) {
      console.warn('[vitalsApi] Failed to persist vitals history to SQLite cache:', err);
    }
  }
}

/**
 * Retrieves cached latest vitals from local SQLite when offline.
 */
export async function getCachedLatestVitals(patientId: string): Promise<LatestVitalsDto | null> {
  try {
    const activeDb = getActiveVitalsDb();
    if (!activeDb || typeof activeDb.select !== 'function') return null;

    const rows = await activeDb
      .select()
      .from(vitalSigns)
      .where(eq(vitalSigns.patientId, patientId))
      .orderBy(desc(vitalSigns.measuredAt))
      .limit(2);

    if (rows.length === 0) return null;

    const latest = rows[0];
    const previous = rows.length > 1 ? rows[1] : null;

    // Calculate heart rate trend
    let heartRateTrend: string | null = null;
    if (latest.heartRateBpm != null) {
      if (previous?.heartRateBpm != null) {
        const diff = latest.heartRateBpm - previous.heartRateBpm;
        heartRateTrend = diff > 0 ? `+${diff} bpm` : (diff < 0 ? `${diff} bpm` : '0 bpm');
      } else {
        heartRateTrend = '+0 bpm';
      }
    }

    // Blood pressure category
    let bpCategory: string | null = null;
    if (latest.bpSystolic != null && latest.bpDiastolic != null) {
      const sys = latest.bpSystolic;
      const dia = latest.bpDiastolic;
      if (sys < 120 && dia < 80) bpCategory = 'Optimal';
      else if (sys < 130 && dia < 85) bpCategory = 'Normal';
      else if (sys < 140 && dia < 90) bpCategory = 'Normal High';
      else bpCategory = 'Elevated';
    }

    // Glucose category
    let glucoseCategory: string | null = null;
    const glucoseVal = latest.fastingBloodGlucose != null ? Number(latest.fastingBloodGlucose) : null;
    if (glucoseVal != null) {
      if (glucoseVal <= 100) glucoseCategory = 'Fasting';
      else if (glucoseVal <= 140) glucoseCategory = 'Normal';
      else glucoseCategory = 'Elevated';
    }

    return {
      heartRateBpm: latest.heartRateBpm,
      heartRateTrend,
      systolicBp: latest.bpSystolic,
      diastolicBp: latest.bpDiastolic,
      bpCategory,
      bloodGlucoseMgDl: glucoseVal,
      glucoseCategory,
      sleepHours: null,
      sleepFormatted: null,
      sleepDeepFormatted: null,
      recordedAt: latest.measuredAt,
      bpSystolic: latest.bpSystolic,
      bpDiastolic: latest.bpDiastolic,
      fastingBloodGlucose: glucoseVal,
      spO2Percent: latest.spO2Percent,
    };
  } catch (err) {
    console.warn('[vitalsApi] Failed to read latest vitals from SQLite cache:', err);
    return null;
  }
}

/**
 * Retrieves cached vitals history from local SQLite when offline.
 */
export async function getCachedVitalsHistory(
  patientId: string,
  take = 10,
): Promise<VitalSignsDto[]> {
  try {
    const activeDb = getActiveVitalsDb();
    if (!activeDb || typeof activeDb.select !== 'function') return [];

    const rows = await activeDb
      .select()
      .from(vitalSigns)
      .where(eq(vitalSigns.patientId, patientId))
      .orderBy(desc(vitalSigns.measuredAt))
      .limit(take);

    return rows.map((r: any) => ({
      id: r.id,
      patientId: r.patientId,
      clinicId: r.clinicId,
      consultationId: null,
      recordedAt: r.measuredAt,
      weightKg: r.weightKg,
      heightCm: r.heightCm,
      bmi: r.bmi,
      systolicBp: r.bpSystolic,
      diastolicBp: r.bpDiastolic,
      heartRateBpm: r.heartRateBpm,
      temperatureCelsius: r.temperatureCelsius,
      oxygenSaturationPercent: r.spO2Percent,
      respiratoryRateBreathsPerMin: r.respiratoryRate,
      fastingBloodGlucose: r.fastingBloodGlucose,
      bloodGlucoseMgDl: r.fastingBloodGlucose,
      sleepHours: null,
      takenBy: r.takenBy,
      facility: r.facility,
      createdAt: r.measuredAt,
      updatedAt: null,
    }));
  } catch (err) {
    console.warn('[vitalsApi] Failed to read vitals history from SQLite cache:', err);
    return [];
  }
}

// ── HTTP API Methods ──────────────────────────────────────────────────────────

/**
 * Fetches the latest vital signs telemetry for a patient.
 * Calls `GET /api/v1/patients/{patientId}/vitals/latest`.
 * Persists into SQLite on success, falls back to SQLite cache when offline or on error.
 */
export async function fetchLatestVitals(
  patientId: string,
  getToken?: TokenProvider,
): Promise<LatestVitalsDto | null> {
  const tokenFn = getToken ?? globalTokenProvider;

  try {
    const data = await api.get<LatestVitalsDto | null>(
      tokenFn,
      `/patients/${patientId}/vitals/latest`,
    );

    if (data) {
      const enriched: LatestVitalsDto = {
        ...data,
        bpSystolic: data.systolicBp ?? data.bpSystolic ?? null,
        bpDiastolic: data.diastolicBp ?? data.bpDiastolic ?? null,
        fastingBloodGlucose: data.bloodGlucoseMgDl ?? data.fastingBloodGlucose ?? null,
      };
      await persistLatestVitalsToCache(patientId, enriched).catch(() => {});
      return enriched;
    }

    // Null returned from backend (e.g. brand new patient zero data)
    return null;
  } catch (err) {
    // If not found (404), return null
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }

    // Try offline SQLite fallback
    const cached = await getCachedLatestVitals(patientId);
    if (cached) {
      return cached;
    }

    throw err;
  }
}

/**
 * Fetches recent vital signs history for a patient.
 * Calls `GET /api/v1/patients/{patientId}/vitals?take={take}`.
 * Persists into SQLite on success, falls back to SQLite cache when offline or on error.
 */
export async function fetchVitalsHistory(
  patientId: string,
  take = 10,
  getToken?: TokenProvider,
): Promise<VitalSignsDto[]> {
  const tokenFn = getToken ?? globalTokenProvider;

  try {
    const data = await api.get<VitalSignsDto[]>(
      tokenFn,
      `/patients/${patientId}/vitals?take=${take}`,
    );

    if (data && Array.isArray(data)) {
      await persistVitalsHistoryToCache(patientId, data).catch(() => {});
      return data;
    }

    return [];
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return [];
    }

    const cached = await getCachedVitalsHistory(patientId, take);
    if (cached && cached.length > 0) {
      return cached;
    }

    throw err;
  }
}

/**
 * Records a new vital signs entry for a patient.
 * Calls `POST /api/v1/patients/{patientId}/vitals`.
 * Updates local SQLite cache with the newly recorded entry.
 */
export async function recordPatientVitals(
  patientId: string,
  vitals: RecordVitalsInput,
  getToken?: TokenProvider,
): Promise<VitalSignsDto> {
  const tokenFn = getToken ?? globalTokenProvider;

  const result = await api.post<VitalSignsDto>(
    tokenFn,
    `/patients/${patientId}/vitals`,
    vitals,
  );

  // Update local cache
  if (result) {
    await persistVitalsHistoryToCache(patientId, [result]).catch(() => {});
    const latestDto: LatestVitalsDto = {
      heartRateBpm: result.heartRateBpm ?? null,
      heartRateTrend: '+0 bpm',
      systolicBp: result.systolicBp ?? null,
      diastolicBp: result.diastolicBp ?? null,
      bpCategory: result.systolicBp && result.diastolicBp
        ? (result.systolicBp < 120 && result.diastolicBp < 80 ? 'Optimal' : 'Normal')
        : null,
      bloodGlucoseMgDl: result.bloodGlucoseMgDl ?? result.fastingBloodGlucose ?? null,
      glucoseCategory: result.bloodGlucoseMgDl
        ? (result.bloodGlucoseMgDl <= 100 ? 'Fasting' : 'Normal')
        : null,
      sleepHours: result.sleepHours ?? null,
      sleepFormatted: result.sleepHours ? `${result.sleepHours}h` : null,
      sleepDeepFormatted: null,
      recordedAt: result.recordedAt ?? new Date().toISOString(),
      bpSystolic: result.systolicBp ?? null,
      bpDiastolic: result.diastolicBp ?? null,
      fastingBloodGlucose: result.bloodGlucoseMgDl ?? result.fastingBloodGlucose ?? null,
      spO2Percent: result.oxygenSaturationPercent ?? null,
    };
    await persistLatestVitalsToCache(patientId, latestDto).catch(() => {});
  }

  return result;
}
