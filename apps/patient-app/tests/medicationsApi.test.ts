import { beforeEach, describe, expect, test, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '../db/schema/index';
import { api, ApiError } from '../services/api/apiClient';
import {
  fetchTodayMedications,
  logMedicationAdherence,
  getCachedTodayMedications,
  persistTodayMedicationsToCache,
  setMedicationsDb,
  type TodayMedicationDto,
} from '../services/api/medicationsApi';

function createTestMedicationsDb() {
  const sqlite = new Database(':memory:');
  sqlite.run(`
    CREATE TABLE patient_medications (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      drug_name TEXT NOT NULL,
      dosage TEXT,
      dosage_form TEXT,
      frequency TEXT,
      prescribing_physician TEXT,
      start_date TEXT,
      indication TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      server_id TEXT,
      deleted_at INTEGER
    );
  `);
  return drizzle(sqlite, { schema });
}

describe('Medications API Client & SQLite Caching Suite (medicationsApi.ts)', () => {
  const patientId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
  let testDb: any;

  beforeEach(() => {
    testDb = createTestMedicationsDb();
    setMedicationsDb(testDb);
  });

  test('fetchTodayMedications calls GET /patients/{patientId}/medications/today and enriches items', async () => {
    const mockMeds: TodayMedicationDto[] = [
      {
        id: 'med-1',
        medicationName: 'Lisinopril',
        dosage: '10mg',
        instructions: '1 tablet with breakfast',
        scheduledTime: '8:00 AM',
        isTaken: true,
        takenAt: '2026-11-03T08:15:00Z',
      },
      {
        id: 'med-2',
        medicationName: 'Omega-3 DHA',
        dosage: '1000mg',
        instructions: '1 softgel after dinner',
        scheduledTime: '7:00 PM',
        isTaken: false,
        takenAt: null,
      },
    ];

    const originalGet = api.get;
    (api as any).get = mock(async (_getToken: any, path: string) => {
      expect(path).toBe(`/patients/${patientId}/medications/today`);
      return mockMeds;
    });

    try {
      const result = await fetchTodayMedications(patientId);
      expect(result.length).toBe(2);
      expect(result[0].medicationName).toBe('Lisinopril');
      expect(result[0].name).toBe('Lisinopril');
      expect(result[0].instruction).toBe('1 tablet with breakfast');
      expect(result[0].isTaken).toBe(true);
      expect(result[0].takenAt).toBe('2026-11-03T08:15:00Z');

      expect(result[1].medicationName).toBe('Omega-3 DHA');
      expect(result[1].name).toBe('Omega-3 DHA');
      expect(result[1].isTaken).toBe(false);
    } finally {
      (api as any).get = originalGet;
    }
  });

  test('fetchTodayMedications respects optional date parameter', async () => {
    const originalGet = api.get;
    (api as any).get = mock(async (_getToken: any, path: string) => {
      expect(path).toBe(`/patients/${patientId}/medications/today?date=2026-11-05`);
      return [];
    });

    try {
      const result = await fetchTodayMedications(patientId, '2026-11-05');
      expect(result).toEqual([]);
    } finally {
      (api as any).get = originalGet;
    }
  });

  test('fetchTodayMedications falls back to SQLite cache when network throws', async () => {
    // 1. Seed cached medications
    const cachedMeds: TodayMedicationDto[] = [
      {
        id: 'med-cached-1',
        medicationName: 'Metformin',
        dosage: '500mg',
        instructions: '2x daily with meals',
        scheduledTime: '8:00 AM',
        isTaken: false,
        takenAt: null,
      },
    ];
    await persistTodayMedicationsToCache(patientId, cachedMeds);

    // 2. Mock network failure
    const originalGet = api.get;
    (api as any).get = mock(async () => {
      throw new ApiError('Network connection unavailable', 0);
    });

    try {
      const result = await fetchTodayMedications(patientId);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('med-cached-1');
      expect(result[0].medicationName).toBe('Metformin');
      expect(result[0].name).toBe('Metformin');
      expect(result[0].instruction).toBe('2x daily with meals');
    } finally {
      (api as any).get = originalGet;
    }
  });

  test('logMedicationAdherence calls POST /patients/{patientId}/medications/{medicationId}/log', async () => {
    const medicationId = 'med-log-1';
    const takenAt = '2026-11-03T08:30:00Z';

    const originalPost = api.post;
    (api as any).post = mock(async (_getToken: any, path: string, body: any) => {
      expect(path).toBe(`/patients/${patientId}/medications/${medicationId}/log`);
      expect(body.takenAt).toBe(takenAt);
      return true;
    });

    try {
      const success = await logMedicationAdherence(patientId, medicationId, takenAt);
      expect(success).toBe(true);
    } finally {
      (api as any).post = originalPost;
    }
  });
});
