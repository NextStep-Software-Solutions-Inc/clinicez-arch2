import { beforeEach, describe, expect, test, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '../db/schema/index';
import { api, ApiError } from '../services/api/apiClient';
import {
  fetchLatestVitals,
  fetchVitalsHistory,
  recordPatientVitals,
  getCachedLatestVitals,
  persistLatestVitalsToCache,
  setVitalsDb,
  type LatestVitalsDto,
  type VitalSignsDto,
  type RecordVitalsInput,
} from '../services/api/vitalsApi';
import { vitalSigns } from '../db/schema/vitalSigns';
import { eq } from 'drizzle-orm';

function createTestVitalsDb() {
  const sqlite = new Database(':memory:');
  sqlite.run(`
    CREATE TABLE vital_signs (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      clinic_id TEXT,
      measured_at TEXT NOT NULL,
      height_cm REAL,
      weight_kg REAL,
      bmi REAL,
      temperature_celsius REAL,
      bp_systolic INTEGER,
      bp_diastolic INTEGER,
      heart_rate_bpm INTEGER,
      respiratory_rate INTEGER,
      spo2_percent REAL,
      fasting_blood_glucose REAL,
      waist_cm REAL,
      hip_cm REAL,
      head_circumference_cm REAL,
      z_score REAL,
      left_vision_acuity TEXT,
      right_vision_acuity TEXT,
      body_length_cm REAL,
      skinfold_thickness_mm REAL,
      mid_upper_arm_circ_cm REAL,
      limb_measurements TEXT,
      taken_by TEXT,
      facility TEXT,
      synced_at INTEGER,
      server_id TEXT,
      server_created_at INTEGER
    );
  `);
  return drizzle(sqlite, { schema });
}

describe('Vitals API Client & SQLite Caching Suite (vitalsApi.ts)', () => {
  const patientId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
  let testDb: any;

  beforeEach(() => {
    testDb = createTestVitalsDb();
    setVitalsDb(testDb);
  });

  test('fetchLatestVitals calls /patients/{patientId}/vitals/latest and returns enriched DTO', async () => {
    const mockResponse: LatestVitalsDto = {
      heartRateBpm: 72,
      heartRateTrend: '+2 bpm',
      systolicBp: 118,
      diastolicBp: 76,
      bpCategory: 'Optimal',
      bloodGlucoseMgDl: 94,
      glucoseCategory: 'Fasting',
      sleepHours: 7.75,
      sleepFormatted: '7h 45m',
      sleepDeepFormatted: '2h 10m',
      recordedAt: '2026-11-03T08:00:00Z',
    };

    const originalGet = api.get;
    (api as any).get = mock(async (_getToken: any, path: string) => {
      expect(path).toBe(`/patients/${patientId}/vitals/latest`);
      return mockResponse;
    });

    try {
      const result = await fetchLatestVitals(patientId);
      expect(result).not.toBeNull();
      expect(result?.heartRateBpm).toBe(72);
      expect(result?.heartRateTrend).toBe('+2 bpm');
      expect(result?.systolicBp).toBe(118);
      expect(result?.bpSystolic).toBe(118);
      expect(result?.diastolicBp).toBe(76);
      expect(result?.bpDiastolic).toBe(76);
      expect(result?.bloodGlucoseMgDl).toBe(94);
      expect(result?.fastingBloodGlucose).toBe(94);
      expect(result?.sleepFormatted).toBe('7h 45m');
      expect(result?.sleepDeepFormatted).toBe('2h 10m');
    } finally {
      (api as any).get = originalGet;
    }
  });

  test('fetchLatestVitals returns null when patient has zero vitals (404 Not Found)', async () => {
    const originalGet = api.get;
    (api as any).get = mock(async () => {
      throw new ApiError('Patient vitals not found', 404);
    });

    try {
      const result = await fetchLatestVitals(patientId);
      expect(result).toBeNull();
    } finally {
      (api as any).get = originalGet;
    }
  });

  test('fetchLatestVitals falls back to SQLite cache when network throws', async () => {
    // 1. Seed cached record in SQLite
    const cachedVitals: LatestVitalsDto = {
      heartRateBpm: 68,
      heartRateTrend: '+0 bpm',
      systolicBp: 115,
      diastolicBp: 75,
      bpCategory: 'Optimal',
      bloodGlucoseMgDl: 92,
      glucoseCategory: 'Fasting',
      sleepHours: 8,
      sleepFormatted: '8h 0m',
      sleepDeepFormatted: '2h 14m',
      recordedAt: '2026-11-02T22:00:00Z',
      bpSystolic: 115,
      bpDiastolic: 75,
      fastingBloodGlucose: 92,
    };
    await persistLatestVitalsToCache(patientId, cachedVitals);

    // 2. Mock network failure (offline)
    const originalGet = api.get;
    (api as any).get = mock(async () => {
      throw new ApiError('Network connection timeout', 0);
    });

    try {
      const result = await fetchLatestVitals(patientId);
      expect(result).not.toBeNull();
      expect(result?.heartRateBpm).toBe(68);
      expect(result?.systolicBp).toBe(115);
      expect(result?.diastolicBp).toBe(75);
      expect(result?.bpCategory).toBe('Optimal');
      expect(result?.bloodGlucoseMgDl).toBe(92);
      expect(result?.glucoseCategory).toBe('Fasting');
    } finally {
      (api as any).get = originalGet;
    }
  });

  test('fetchVitalsHistory calls GET /patients/{patientId}/vitals with take parameter', async () => {
    const mockList: VitalSignsDto[] = [
      {
        id: 'vital-1',
        patientId,
        recordedAt: '2026-11-03T08:00:00Z',
        systolicBp: 120,
        diastolicBp: 80,
        heartRateBpm: 75,
      },
      {
        id: 'vital-2',
        patientId,
        recordedAt: '2026-11-02T08:00:00Z',
        systolicBp: 122,
        diastolicBp: 82,
        heartRateBpm: 78,
      },
    ];

    const originalGet = api.get;
    (api as any).get = mock(async (_getToken: any, path: string) => {
      expect(path).toBe(`/patients/${patientId}/vitals?take=5`);
      return mockList;
    });

    try {
      const history = await fetchVitalsHistory(patientId, 5);
      expect(history.length).toBe(2);
      expect(history[0].id).toBe('vital-1');
      expect(history[0].heartRateBpm).toBe(75);
    } finally {
      (api as any).get = originalGet;
    }
  });

  test('recordPatientVitals calls POST /patients/{patientId}/vitals and updates SQLite cache', async () => {
    const input: RecordVitalsInput = {
      heartRateBpm: 70,
      systolicBp: 116,
      diastolicBp: 74,
      bloodGlucoseMgDl: 90,
      sleepHours: 7.5,
      recordedAt: '2026-11-03T09:00:00Z',
    };

    const mockCreated: VitalSignsDto = {
      id: 'vital-created-1',
      patientId,
      recordedAt: input.recordedAt!,
      systolicBp: input.systolicBp,
      diastolicBp: input.diastolicBp,
      heartRateBpm: input.heartRateBpm,
      bloodGlucoseMgDl: input.bloodGlucoseMgDl,
      sleepHours: input.sleepHours,
    };

    const originalPost = api.post;
    (api as any).post = mock(async (_getToken: any, path: string, body: any) => {
      expect(path).toBe(`/patients/${patientId}/vitals`);
      expect(body.heartRateBpm).toBe(70);
      expect(body.systolicBp).toBe(116);
      return mockCreated;
    });

    try {
      const created = await recordPatientVitals(patientId, input);
      expect(created.id).toBe('vital-created-1');
      expect(created.heartRateBpm).toBe(70);

      // Verify cached in SQLite
      const cached = await getCachedLatestVitals(patientId);
      expect(cached).not.toBeNull();
      expect(cached?.heartRateBpm).toBe(70);
      expect(cached?.systolicBp).toBe(116);
      expect(cached?.diastolicBp).toBe(74);
    } finally {
      (api as any).post = originalPost;
    }
  });
});
