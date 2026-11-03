import { beforeEach, describe, expect, test, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from '../db/schema/index';
import { api, ApiError } from '../services/api/apiClient';
import {
  fetchUnifiedSearch,
  getCachedUnifiedSearch,
  setSearchDb,
  type UnifiedSearchResultDto,
} from '../services/api/searchApi';

function createTestSearchDb() {
  const sqlite = new Database(':memory:');
  sqlite.run(`
    CREATE TABLE clinics (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      description TEXT,
      logo_url TEXT,
      cover_image_url TEXT,
      is_public INTEGER NOT NULL DEFAULT 1,
      supports_appointments INTEGER NOT NULL DEFAULT 1,
      invite_code TEXT,
      privacy_policy_url TEXT,
      terms_and_conditions_url TEXT,
      specialties_json TEXT NOT NULL DEFAULT '[]',
      required_share_fields_json TEXT NOT NULL DEFAULT '[]',
      active_member_count INTEGER NOT NULL DEFAULT 0,
      joined_at INTEGER NOT NULL,
      synced_at INTEGER
    );
  `);
  return drizzle(sqlite, { schema });
}

describe('Unified Search API Client & SQLite Fallback Suite (searchApi.ts)', () => {
  let testDb: any;

  beforeEach(() => {
    testDb = createTestSearchDb();
    setSearchDb(testDb);
  });

  test('fetchUnifiedSearch calls GET /discovery/search with query and type filters', async () => {
    const mockResults: UnifiedSearchResultDto = {
      doctors: [
        {
          id: 'doc-1',
          fullName: 'Dr. Evelyn Reed, MD',
          specialty: 'Cardiology Specialist',
          clinicName: 'Metro Cardiology Center',
          distance: '1.2 km away',
          rating: 4.9,
          reviewsCount: 128,
          nextAvailableSlot: 'Tomorrow, 10:30 AM',
          tags: ['Accepts Insurance', 'In-Person & Telehealth'],
        },
      ],
      clinics: [
        {
          id: 'clinic-1',
          name: 'Metro Cardiology Center',
          address: '402 Medical Blvd, Suite 402',
          distance: '1.2 km away',
          isOpenNow: true,
          openText: 'Open Today • Closes 6:00 PM',
          rating: 4.8,
          reviewsCount: 94,
          tags: ['Echo & Diagnostic Lab', 'Walk-ins Welcome'],
        },
      ],
      services: [
        {
          id: 'service-1',
          name: 'Comprehensive Cardiac Screening',
          description: 'Includes 12-lead ECG, Lipid Profile & Consult',
          durationMinutes: 45,
          isCovered: true,
          tags: ['Fully Covered by Insurance', 'Prep Guide Included'],
        },
      ],
    };

    const originalGet = api.get;
    (api as any).get = mock(async (_getToken: any, path: string) => {
      expect(path).toContain('/discovery/search?');
      expect(path).toContain('q=cardio');
      expect(path).toContain('type=doctors');
      return mockResults;
    });

    try {
      const results = await fetchUnifiedSearch('cardio', 'doctors');
      expect(results.doctors.length).toBe(1);
      expect(results.doctors[0].fullName).toBe('Dr. Evelyn Reed, MD');
      expect(results.clinics.length).toBe(1);
      expect(results.services.length).toBe(1);
    } finally {
      (api as any).get = originalGet;
    }
  });

  test('fetchUnifiedSearch returns empty arrays for empty/whitespace query without making network call', async () => {
    const originalGet = api.get;
    let callCount = 0;
    (api as any).get = mock(async () => {
      callCount++;
      return { doctors: [], clinics: [], services: [] };
    });

    try {
      const results1 = await fetchUnifiedSearch('');
      expect(results1).toEqual({ doctors: [], clinics: [], services: [] });

      const results2 = await fetchUnifiedSearch('   ');
      expect(results2).toEqual({ doctors: [], clinics: [], services: [] });

      expect(callCount).toBe(0);
    } finally {
      (api as any).get = originalGet;
    }
  });

  test('fetchUnifiedSearch falls back to SQLite cache when network fails', async () => {
    // 1. Seed clinic in local SQLite
    await testDb.insert(schema.clinics).values({
      id: 'clinic-local-1',
      name: 'Downtown Family Clinic',
      address: '123 Main Street',
      isPublic: true,
      supportsAppointments: true,
      specialtiesJson: JSON.stringify(['Pediatrics', 'Family Medicine']),
      requiredShareFieldsJson: '[]',
      activeMemberCount: 88,
      joinedAt: new Date(),
    });

    // 2. Mock network failure
    const originalGet = api.get;
    (api as any).get = mock(async () => {
      throw new ApiError('Service unavailable', 503);
    });

    try {
      const results = await fetchUnifiedSearch('Downtown');
      expect(results.clinics.length).toBe(1);
      expect(results.clinics[0].name).toBe('Downtown Family Clinic');
      expect(results.clinics[0].address).toBe('123 Main Street');
      expect(results.clinics[0].tags).toContain('Offline Cached');
    } finally {
      (api as any).get = originalGet;
    }
  });
});
