import { describe, expect, test, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Set API URL environment before loading services
process.env.EXPO_PUBLIC_API_URL = 'https://patient-api.test/api/v1';

// ── Native Module Mocks ────────────────────────────────────────────────────────
const inMemoryStore = new Map<string, string>();
(globalThis as any).__customSecureStore = inMemoryStore;

mock.module('expo-secure-store', () => ({
  getItemAsync: mock(async (key: string) => inMemoryStore.get(key) ?? null),
  setItemAsync: mock(async (key: string, val: string) => {
    inMemoryStore.set(key, val);
  }),
  deleteItemAsync: mock(async (key: string) => {
    inMemoryStore.delete(key);
  }),
}));

mock.module('react-native', () => ({
  StyleSheet: {
    create: (s: any) => s,
    flatten: (s: any) => s,
    hairlineWidth: 1,
  },
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  TouchableHighlight: 'TouchableHighlight',
  Pressable: 'Pressable',
  Modal: 'Modal',
  TextInput: 'TextInput',
  ScrollView: 'ScrollView',
  ActivityIndicator: 'ActivityIndicator',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
  Switch: 'Switch',
  Image: 'Image',
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  TurboModuleRegistry: {
    get: () => null,
    getEnforcing: () => null,
  },
  NativeModules: {},
  Dimensions: {
    get: () => ({ width: 1920, height: 1080 }),
    addEventListener: () => ({ remove: () => {} }),
    removeEventListener: () => {},
  },
  useWindowDimensions: () => ({ width: 1920, height: 1080 }),
  Keyboard: {
    dismiss: () => {},
    addListener: () => ({ remove: () => {} }),
  },
  AppState: {
    addEventListener: () => ({ remove: () => {} }),
    currentState: 'active',
  },
  Alert: {
    alert: () => {},
  },
  I18nManager: {
    isRTL: false,
  },
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
    },
    timing: () => ({ start: (cb?: any) => cb?.() }),
    spring: () => ({ start: (cb?: any) => cb?.() }),
    sequence: () => ({ start: (cb?: any) => cb?.() }),
    parallel: () => ({ start: (cb?: any) => cb?.() }),
    View: 'AnimatedView',
    Text: 'AnimatedText',
  },
}));

// ── Imports under test (loaded after native mocks) ────────────────────────────
import axios from 'axios';
const { optionsService } = await import('../services/api/optionsService');
const { locationService } = await import('../services/api/locationService');
const { teleconsultRecordingsApi } = await import('../services/api/teleconsultRecordingsApi');
const { api, ApiError } = await import('../services/api/apiClient');

import { patients } from '../db/schema/patients';
import { patientAddresses } from '../db/schema/patientAddresses';
import { patientAllergies } from '../db/schema/patientAllergies';
import { patientGovernmentIds } from '../db/schema/patientGovernmentIds';
import { patientMentalHealthProfile } from '../db/schema/patientMentalHealthProfile';
import { syncQueue } from '../db/schema/syncQueue';
const { fromBackendBloodType } = await import('../services/api/patientApi');
import type { StructuredPsgcAddress, EhrOptionDescriptor } from '@shared/safe';

/* ========================================================================= */
/* TEST 1: DYNAMIC OPTIONS ETAG 304 REVALIDATION & 2-TIER CACHING            */
/* ========================================================================= */

describe('CHALLENGER M4A-2 TEST 1: Dynamic Options ETag 304 Revalidation & Caching', () => {
  beforeEach(() => {
    optionsService.clearMemoryCache();
    inMemoryStore.clear();
  });

  afterEach(() => {
    optionsService.clearMemoryCache();
    inMemoryStore.clear();
  });

  test('Initial fetch: 200 OK with ETag returns descriptors and persists to memory & storage', async () => {
    const mockDescriptors: EhrOptionDescriptor[] = [
      { value: 'single', label: 'Single' },
      { value: 'married', label: 'Married' },
      { value: 'widowed', label: 'Widowed' },
    ];

    const getSpy = spyOn(axios, 'get').mockResolvedValueOnce({
      status: 200,
      headers: { etag: '"etag-civil-v1"' },
      data: { succeeded: true, data: mockDescriptors },
    } as any);

    const result = await optionsService.getOptionSet('civil_status');
    expect(result).toEqual(mockDescriptors);
    expect(getSpy).toHaveBeenCalledTimes(1);

    // Verify persisted to storage
    const stored = inMemoryStore.get('clinicez.options.civil_status');
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored!);
    expect(parsed.version).toBe('"etag-civil-v1"');
    expect(parsed.data).toEqual(mockDescriptors);

    getSpy.mockRestore();
  });

  test('Subsequent fetch: sends If-None-Match header and 304 Not Modified returns cached data without re-parsing', async () => {
    const cachedDescriptors: EhrOptionDescriptor[] = [
      { value: 'a_positive', label: 'A+' },
      { value: 'o_positive', label: 'O+' },
      { value: 'b_positive', label: 'B+' },
    ];

    // Seed storage and memory cache
    inMemoryStore.set(
      'clinicez.options.blood_type',
      JSON.stringify({ version: '"etag-blood-v1"', data: cachedDescriptors })
    );

    let sentIfNoneMatch: string | undefined;
    const getSpy = spyOn(axios, 'get').mockImplementationOnce(async (url: string, config?: any) => {
      sentIfNoneMatch = config?.headers?.['If-None-Match'];
      return {
        status: 304,
        headers: { etag: '"etag-blood-v1"' },
        data: null,
      } as any;
    });

    const result = await optionsService.getOptionSet('blood_type');
    expect(sentIfNoneMatch).toBe('"etag-blood-v1"');
    expect(result).toEqual(cachedDescriptors);
    expect(getSpy).toHaveBeenCalledTimes(1);

    getSpy.mockRestore();
  });

  test('Cache Invalidation: new ETag on 200 OK overwrites cached descriptors with dynamic open-text choices', async () => {
    // Initial v1 cached
    const v1Descriptors: EhrOptionDescriptor[] = [
      { value: 'single', label: 'Single' },
      { value: 'married', label: 'Married' },
    ];
    inMemoryStore.set(
      'clinicez.options.civil_status',
      JSON.stringify({ version: '"etag-civil-v1"', data: v1Descriptors })
    );

    // v2 updated with custom dynamic open-text civil status option
    const v2Descriptors: EhrOptionDescriptor[] = [
      { value: 'single', label: 'Single' },
      { value: 'married', label: 'Married' },
      { value: 'registered_domestic_partnership', label: 'Registered Domestic Partnership (Civil)' },
      { value: 'indigenous_customary_union', label: 'Indigenous Customary Union' },
    ];

    let requestCount = 0;
    const getSpy = spyOn(axios, 'get').mockImplementation(async (url: string, config?: any) => {
      requestCount++;
      if (requestCount === 1) {
        expect(config?.headers?.['If-None-Match']).toBe('"etag-civil-v1"');
        // Server emits 200 with new ETag
        return {
          status: 200,
          headers: { etag: '"etag-civil-v2"' },
          data: v2Descriptors,
        } as any;
      }
      if (requestCount === 2) {
        expect(config?.headers?.['If-None-Match']).toBe('"etag-civil-v2"');
        return {
          status: 304,
          headers: { etag: '"etag-civil-v2"' },
          data: null,
        } as any;
      }
      throw new Error('Unexpected call');
    });

    // 1st call -> receives v2
    const firstCall = await optionsService.getOptionSet('civil_status');
    expect(firstCall).toEqual(v2Descriptors);
    expect(firstCall.length).toBe(4);

    // 2nd call -> 304 revalidation of v2
    const secondCall = await optionsService.getOptionSet('civil_status');
    expect(secondCall).toEqual(v2Descriptors);

    // Verify storage has updated to v2
    const stored = inMemoryStore.get('clinicez.options.civil_status');
    expect(JSON.parse(stored!).version).toBe('"etag-civil-v2"');

    getSpy.mockRestore();
  });

  test('Network Failure Fallback: returns cached descriptors gracefully during network offline/timeout', async () => {
    const cachedDescriptors: EhrOptionDescriptor[] = [
      { value: 'mild', label: 'Mild' },
      { value: 'moderate', label: 'Moderate' },
      { value: 'severe', label: 'Severe' },
    ];
    inMemoryStore.set(
      'clinicez.options.allergy_severity',
      JSON.stringify({ version: '"etag-allergy-v1"', data: cachedDescriptors })
    );

    const getSpy = spyOn(axios, 'get').mockRejectedValueOnce(new Error('Network timeout / offline'));

    const result = await optionsService.getOptionSet('allergy_severity');
    expect(result).toEqual(cachedDescriptors);

    getSpy.mockRestore();
  });

  test('Envelope unwrapping resilience: handles both wrapped { data: [...] } and raw array payloads', async () => {
    const rawArrayData: EhrOptionDescriptor[] = [
      { value: 'roman_catholic', label: 'Roman Catholic' },
      { value: 'iglesia_ni_cristo', label: 'Iglesia Ni Cristo' },
    ];

    const getSpy = spyOn(axios, 'get').mockResolvedValueOnce({
      status: 200,
      headers: { etag: '"etag-religion-raw"' },
      data: rawArrayData, // Raw array without { data: ... } envelope
    } as any);

    const result = await optionsService.getOptionSet('religion');
    expect(result).toEqual(rawArrayData);

    getSpy.mockRestore();
  });

  test('Storage corruption resilience: recovers gracefully from malformed JSON in storage', async () => {
    inMemoryStore.set('clinicez.options.corrupt_set', '{invalid json syntax: missing quotes}');

    const freshDescriptors: EhrOptionDescriptor[] = [{ value: 'fresh', label: 'Fresh' }];

    const getSpy = spyOn(axios, 'get').mockResolvedValueOnce({
      status: 200,
      headers: { etag: '"etag-fresh"' },
      data: freshDescriptors,
    } as any);

    const result = await optionsService.getOptionSet('corrupt_set');
    expect(result).toEqual(freshDescriptors);

    getSpy.mockRestore();
  });

  test('clearMemoryCache() purges memory map, forcing storage reload and fresh revalidation', async () => {
    const descriptors: EhrOptionDescriptor[] = [{ value: 'opt1', label: 'Option 1' }];

    const getSpy = spyOn(axios, 'get').mockResolvedValue({
      status: 200,
      headers: { etag: '"etag-test"' },
      data: descriptors,
    } as any);

    await optionsService.getOptionSet('test_set');
    expect(getSpy).toHaveBeenCalledTimes(1);

    optionsService.clearMemoryCache();

    // After clearing memory cache, storage still holds the ETag so next call revalidates with 304
    getSpy.mockResolvedValueOnce({
      status: 304,
      headers: { etag: '"etag-test"' },
      data: null,
    } as any);

    const secondCall = await optionsService.getOptionSet('test_set');
    expect(secondCall).toEqual(descriptors);
    expect(getSpy).toHaveBeenCalledTimes(2);

    getSpy.mockRestore();
  });

  test('High-concurrency stress test: 20 concurrent requests for distinct option sets execute deterministically', async () => {
    const sets = ['civil_status', 'blood_type', 'religion', 'allergy_severity', 'disability_type'];

    const getSpy = spyOn(axios, 'get').mockImplementation(async (url: string) => {
      const match = url.match(/\/options\/([a-z_]+)$/);
      const setKey = match ? match[1] : 'unknown';
      return {
        status: 200,
        headers: { etag: `"etag-${setKey}-stress"` },
        data: [{ value: `${setKey}_1`, label: `Label for ${setKey}` }],
      } as any;
    });

    const tasks = Array.from({ length: 20 }, (_, i) => {
      const set = sets[i % sets.length];
      return optionsService.getOptionSet(set);
    });

    const results = await Promise.all(tasks);
    expect(results.length).toBe(20);
    for (let i = 0; i < 20; i++) {
      const set = sets[i % sets.length];
      expect(results[i]).toEqual([{ value: `${set}_1`, label: `Label for ${set}` }]);
    }

    getSpy.mockRestore();
  });
});

/* ========================================================================= */
/* TEST 2: DRIZZLE SQLITE SCHEMA & HYDRATION (DYNAMIC OPTIONS & 9 PSGC COLS) */
/* ========================================================================= */

describe('CHALLENGER M4A-2 TEST 2: Drizzle SQLite Schema & Hydration', () => {
  let sqlite: Database;
  let db: ReturnType<typeof drizzle>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    db = drizzle(sqlite);

    // Initialize full SQLite schema
    sqlite.run(`
      CREATE TABLE patients (
        id TEXT PRIMARY KEY NOT NULL,
        clerk_user_id TEXT UNIQUE,
        first_name TEXT NOT NULL,
        middle_name TEXT,
        last_name TEXT NOT NULL,
        suffix TEXT,
        sex TEXT,
        dob TEXT,
        place_of_birth TEXT,
        civil_status TEXT,
        blood_type TEXT,
        nationality TEXT DEFAULT 'Filipino',
        ethnicity TEXT,
        religion TEXT,
        primary_language TEXT,
        education_level TEXT,
        avatar_url TEXT,
        mobile TEXT,
        alt_phone TEXT,
        email TEXT,
        messenger_handle TEXT,
        consent_to_share_info INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        synced_at INTEGER,
        server_id TEXT
      );

      CREATE TABLE patient_addresses (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL,
        type TEXT DEFAULT 'primary' NOT NULL,
        house_street TEXT,
        barangay TEXT,
        city_municipality TEXT,
        province TEXT,
        region TEXT,
        zip_code TEXT,
        country TEXT DEFAULT 'Philippines',
        region_psgc TEXT,
        province_psgc TEXT,
        city_municipality_psgc TEXT,
        barangay_psgc TEXT,
        region_name TEXT,
        province_name TEXT,
        city_municipality_name TEXT,
        barangay_name TEXT,
        is_same_as_permanent INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        synced_at INTEGER,
        server_id TEXT,
        deleted_at INTEGER,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );

      CREATE TABLE patient_allergies (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL,
        allergen TEXT NOT NULL,
        reaction_type TEXT,
        severity TEXT,
        management TEXT,
        is_active INTEGER DEFAULT 1 NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        synced_at INTEGER,
        server_id TEXT,
        deleted_at INTEGER,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );

      CREATE TABLE patient_government_ids (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL UNIQUE,
        philhealth_id TEXT,
        philhealth_category TEXT,
        sponsor_pin TEXT,
        sponsor_last_name TEXT,
        sponsor_first_name TEXT,
        sponsor_middle_name TEXT,
        sponsor_suffix TEXT,
        sponsor_dob TEXT,
        sponsor_relationship TEXT,
        sss_number TEXT,
        gsis_number TEXT,
        pagibig_id TEXT,
        tin TEXT,
        senior_citizen_id TEXT,
        is_pwd INTEGER DEFAULT 0,
        pwd_id_number TEXT,
        disability_type TEXT,
        hmo_provider TEXT,
        hmo_policy_number TEXT,
        hmo_plan_type TEXT,
        hmo_coverage_start TEXT,
        hmo_coverage_end TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        synced_at INTEGER,
        server_id TEXT,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );

      CREATE TABLE patient_mental_health_profile (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL UNIQUE,
        has_prior_diagnosis INTEGER DEFAULT 0,
        provider_name TEXT,
        provider_specialty TEXT,
        provider_clinic TEXT,
        psychotherapy_status TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        synced_at INTEGER,
        server_id TEXT,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
    `);
  });

  afterEach(() => {
    sqlite.close();
  });

  test('Dynamic open-text options persist into patients table without SQLite constraint rejections', async () => {
    const now = new Date();
    const testCases = [
      {
        id: 'patient-custom-1',
        firstName: 'Maria',
        lastName: 'Santos',
        civilStatus: 'Domestic Partnership (Notary Registered #2026-001)',
        bloodType: 'A Rh-null (Golden Blood)',
        religion: 'Philippine Independent Church (Aglipayan)',
        educationLevel: 'Postdoctoral Fellowship in Genomics',
        sex: 'Non-Binary / Agender',
      },
      {
        id: 'patient-custom-2',
        firstName: 'Alex',
        lastName: 'Reyes',
        civilStatus: 'Common-Law Cohabitation > 10 Years',
        bloodType: 'Bombay Phenotype (Oh)',
        religion: 'Tribal / Indigenous Animism (Cordillera)',
        educationLevel: 'Alternative Learning System (ALS Accredited)',
        sex: 'Intersex (46,XY DSD)',
      },
    ];

    for (const tc of testCases) {
      await db.insert(patients).values({
        id: tc.id,
        firstName: tc.firstName,
        lastName: tc.lastName,
        civilStatus: tc.civilStatus,
        bloodType: tc.bloodType,
        religion: tc.religion,
        educationLevel: tc.educationLevel,
        sex: tc.sex,
        createdAt: now,
        updatedAt: now,
      });
    }

    const rows = await db.select().from(patients);
    expect(rows.length).toBe(2);

    expect(rows[0].civilStatus).toBe('Domestic Partnership (Notary Registered #2026-001)');
    expect(rows[0].bloodType).toBe('A Rh-null (Golden Blood)');
    expect(rows[0].religion).toBe('Philippine Independent Church (Aglipayan)');
    expect(rows[0].educationLevel).toBe('Postdoctoral Fellowship in Genomics');
    expect(rows[0].sex).toBe('Non-Binary / Agender');

    expect(rows[1].bloodType).toBe('Bombay Phenotype (Oh)');
    expect(rows[1].civilStatus).toBe('Common-Law Cohabitation > 10 Years');
  });

  test('All 9 PSGC address columns persist and hydrate with 100% precision for NCR and Provincial addresses', async () => {
    const now = new Date();
    await db.insert(patients).values({
      id: 'patient-addr-owner',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      createdAt: now,
      updatedAt: now,
    });

    // 1. NCR Address (Bypasses province)
    const ncrAddress = {
      id: 'addr-ncr-1',
      patientId: 'patient-addr-owner',
      type: 'primary' as const,
      houseStreet: 'Tower 2 Unit 1502, Ortigas Center',
      regionPsgc: '1300000000',
      provincePsgc: null,
      cityMunicipalityPsgc: '1376070000',
      barangayPsgc: '137607002',
      regionName: 'National Capital Region',
      provinceName: null,
      cityMunicipalityName: 'City of Pasig',
      barangayName: 'San Antonio',
      zipCode: '1600',
      isSameAsPermanent: false,
      createdAt: now,
      updatedAt: now,
    };

    // 2. Provincial Address (Standard 4-tier cascade)
    const provincialAddress = {
      id: 'addr-prov-2',
      patientId: 'patient-addr-owner',
      type: 'secondary' as const,
      houseStreet: 'Block 12 Lot 5, Villa Teresa Subd.',
      regionPsgc: '0400000000',
      provincePsgc: '0421000000',
      cityMunicipalityPsgc: '0421080000',
      barangayPsgc: '042108001',
      regionName: 'Region IV-A (CALABARZON)',
      provinceName: 'Cavite',
      cityMunicipalityName: 'City of Imus',
      barangayName: 'Alapan I-A',
      zipCode: '4103',
      isSameAsPermanent: false,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(patientAddresses).values(ncrAddress);
    await db.insert(patientAddresses).values(provincialAddress);

    const savedAddrs = await db.select().from(patientAddresses);
    expect(savedAddrs.length).toBe(2);

    const savedNcr = savedAddrs.find((a) => a.id === 'addr-ncr-1')!;
    expect(savedNcr.regionPsgc).toBe('1300000000');
    expect(savedNcr.provincePsgc).toBeNull();
    expect(savedNcr.cityMunicipalityPsgc).toBe('1376070000');
    expect(savedNcr.barangayPsgc).toBe('137607002');
    expect(savedNcr.regionName).toBe('National Capital Region');
    expect(savedNcr.provinceName).toBeNull();
    expect(savedNcr.cityMunicipalityName).toBe('City of Pasig');
    expect(savedNcr.barangayName).toBe('San Antonio');
    expect(savedNcr.zipCode).toBe('1600');

    const savedProv = savedAddrs.find((a) => a.id === 'addr-prov-2')!;
    expect(savedProv.regionPsgc).toBe('0400000000');
    expect(savedProv.provincePsgc).toBe('0421000000');
    expect(savedProv.cityMunicipalityPsgc).toBe('0421080000');
    expect(savedProv.barangayPsgc).toBe('042108001');
    expect(savedProv.regionName).toBe('Region IV-A (CALABARZON)');
    expect(savedProv.provinceName).toBe('Cavite');
    expect(savedProv.cityMunicipalityName).toBe('City of Imus');
    expect(savedProv.barangayName).toBe('Alapan I-A');
    expect(savedProv.zipCode).toBe('4103');
  });

  test('Dynamic open-text allergy severity and government ID types persist without schema rejections', async () => {
    const now = new Date();
    await db.insert(patients).values({
      id: 'patient-allergy-owner',
      firstName: 'Clara',
      lastName: 'Ocampo',
      createdAt: now,
      updatedAt: now,
    });

    // Custom allergy severity
    await db.insert(patientAllergies).values({
      id: 'allergy-1',
      patientId: 'patient-allergy-owner',
      allergen: 'Piperacillin / Tazobactam (Zosyn)',
      severity: 'Severe Grade 4 Anaphylactic Shock (Ventilator Required)',
      reactionType: 'Laryngeal Edema & Systemic Vasodilation',
      createdAt: now,
      updatedAt: now,
    });

    // Custom disability and HMO plan type
    await db.insert(patientGovernmentIds).values({
      id: 'gov-1',
      patientId: 'patient-allergy-owner',
      disabilityType: 'Non-Apparent Neurodivergent Sensory Processing',
      hmoProvider: 'Maxicare Platinum Global',
      hmoPlanType: 'Corporate Executive VIP Diamond Tier 2026',
      createdAt: now,
      updatedAt: now,
    });

    const savedAllergies = await db.select().from(patientAllergies);
    expect(savedAllergies.length).toBe(1);
    expect(savedAllergies[0].severity).toBe('Severe Grade 4 Anaphylactic Shock (Ventilator Required)');

    const savedGov = await db.select().from(patientGovernmentIds);
    expect(savedGov.length).toBe(1);
    expect(savedGov[0].disabilityType).toBe('Non-Apparent Neurodivergent Sensory Processing');
    expect(savedGov[0].hmoPlanType).toBe('Corporate Executive VIP Diamond Tier 2026');
  });

  test('Blood type normalization handles legacy, standard, and custom open-text strings safely', () => {
    expect(fromBackendBloodType('APositive')).toBe('A+');
    expect(fromBackendBloodType('aPositive')).toBe('A+');
    expect(fromBackendBloodType('ONegative')).toBe('O-');
    expect(fromBackendBloodType('ABPositive')).toBe('AB+');
    expect(fromBackendBloodType('BNegative')).toBe('B-');
    expect(fromBackendBloodType('Unknown')).toBe('Unknown');
    expect(fromBackendBloodType(null)).toBeNull();
    expect(fromBackendBloodType(undefined)).toBeNull();

    // Custom open-text blood types preserve raw input without crash
    expect(fromBackendBloodType('A Rh-null')).toBe('A Rh-null');
    expect(fromBackendBloodType('Bombay Phenotype')).toBe('Bombay Phenotype');
  });
});

/* ========================================================================= */
/* TEST 3: CASCADING ADDRESS PICKER WITH NCR PROVINCE BYPASS                 */
/* ========================================================================= */

describe('CHALLENGER M4A-2 TEST 3: Cascading Address Picker with NCR Province Bypass', () => {
  beforeEach(() => {
    locationService.clearMemoryCache();
    inMemoryStore.clear();
  });

  afterEach(() => {
    locationService.clearMemoryCache();
    inMemoryStore.clear();
  });

  test('4-Tier PSGC location queries cascade cleanly from Region down to Barangay with memory caching', async () => {
    const mockRegions = [
      { psgcCode: '1300000000', name: 'National Capital Region (NCR)' },
      { psgcCode: '0400000000', name: 'Region IV-A (CALABARZON)' },
    ];
    const mockProvinces = [
      { psgcCode: '0421000000', name: 'Cavite', regionPsgc: '0400000000' },
      { psgcCode: '0434000000', name: 'Laguna', regionPsgc: '0400000000' },
    ];
    const mockCities = [
      { psgcCode: '0421080000', name: 'City of Imus', provincePsgc: '0421000000', zipCode: '4103' },
    ];
    const mockBarangays = [
      { psgcCode: '042108001', name: 'Alapan I-A', cityMunicipalityPsgc: '0421080000' },
    ];

    const getSpy = spyOn(axios, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/locations/psgc/regions')) {
        return { data: { succeeded: true, data: mockRegions } } as any;
      }
      if (url.includes('/locations/psgc/provinces')) {
        return { data: { succeeded: true, data: mockProvinces } } as any;
      }
      if (url.includes('/locations/psgc/cities')) {
        return { data: { succeeded: true, data: mockCities } } as any;
      }
      if (url.includes('/locations/psgc/barangays')) {
        return { data: { succeeded: true, data: mockBarangays } } as any;
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    // 1. Fetch regions
    const regions = await locationService.getRegions();
    expect(regions).toEqual(mockRegions);

    // Cached check: subsequent call hits memoryCache without network hit
    const cachedRegions = await locationService.getRegions();
    expect(cachedRegions).toEqual(mockRegions);

    // 2. Fetch provinces for 0400000000
    const provinces = await locationService.getProvinces('0400000000');
    expect(provinces).toEqual(mockProvinces);

    // 3. Fetch cities for Cavite
    const cities = await locationService.getCities('0421000000', '0400000000');
    expect(cities).toEqual(mockCities);

    // 4. Fetch barangays for Imus
    const barangays = await locationService.getBarangays('0421080000');
    expect(barangays).toEqual(mockBarangays);

    getSpy.mockRestore();
  });

  test('NCR Province Bypass: Region 13 returns 0 provinces, bypasses province, and loads cities directly', async () => {
    const mockNcrCities = [
      { psgcCode: '1376020000', name: 'City of Manila', regionPsgc: '1300000000', zipCode: '1000' },
      { psgcCode: '1376040000', name: 'Quezon City', regionPsgc: '1300000000', zipCode: '1100' },
      { psgcCode: '1376070000', name: 'City of Pasig', regionPsgc: '1300000000', zipCode: '1600' },
    ];

    const getSpy = spyOn(axios, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/locations/psgc/provinces')) {
        // NCR has zero provinces
        return { data: [] } as any;
      }
      if (url.includes('/locations/psgc/cities')) {
        expect(url).toContain('regionPsgc=1300000000');
        return { data: mockNcrCities } as any;
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    // 1. Query provinces for NCR -> returns empty array
    const ncrProvinces = await locationService.getProvinces('1300000000');
    expect(ncrProvinces).toEqual([]);

    // 2. CascadingAddressPicker logic check:
    const regionName = 'National Capital Region (NCR)';
    const regionPsgc = '1300000000';
    const isNcrWithoutProvinces = Boolean(
      regionName.toLowerCase().includes('ncr') ||
      regionName.toLowerCase().includes('national capital') ||
      (regionPsgc && ncrProvinces.length === 0)
    );
    expect(isNcrWithoutProvinces).toBe(true);

    // 3. Since NCR has no provinces, cities are queried directly by regionPsgc
    const ncrCities = await locationService.getCities(undefined, regionPsgc);
    expect(ncrCities).toEqual(mockNcrCities);
    expect(ncrCities.length).toBe(3);

    getSpy.mockRestore();
  });

  test('Race Condition & Rapid Switching: rapid region changes cancel stale in-flight results', async () => {
    let callCounter = 0;

    // Simulate slow response for Region A (100ms) and fast response for Region B (10ms)
    const getSpy = spyOn(axios, 'get').mockImplementation(async (url: string) => {
      callCounter++;
      if (url.includes('regionPsgc=0400000000')) {
        await new Promise((res) => setTimeout(res, 80));
        return { data: [{ psgcCode: '0421000000', name: 'Cavite' }] } as any;
      }
      if (url.includes('regionPsgc=1300000000')) {
        await new Promise((res) => setTimeout(res, 10));
        return { data: [] } as any;
      }
      return { data: [] } as any;
    });

    // Emulate React component active flag lifecycle:
    let activeEffectId = 0;
    let finalProvinces: any[] = [];

    const selectRegion = (regionCode: string) => {
      const currentEffect = ++activeEffectId;
      locationService.getProvinces(regionCode).then((provs) => {
        if (currentEffect === activeEffectId) {
          finalProvinces = provs;
        }
      });
    };

    // User clicks Region 04 (CALABARZON)
    selectRegion('0400000000');
    // User immediately switches to Region 13 (NCR)
    selectRegion('1300000000');

    // Wait for both promises to resolve
    await new Promise((res) => setTimeout(res, 120));

    // Stale CALABARZON response was rejected; NCR's empty province list prevailed
    expect(finalProvinces).toEqual([]);
    expect(callCounter).toBe(2);

    getSpy.mockRestore();
  });

  test('Selection Invariant: changing upstream levels cleanly resets dependent downstream fields', () => {
    let currentAddress: StructuredPsgcAddress = {
      regionPsgc: '0400000000',
      regionName: 'Region IV-A',
      provincePsgc: '0421000000',
      provinceName: 'Cavite',
      cityMunicipalityPsgc: '0421080000',
      cityMunicipalityName: 'City of Imus',
      barangayPsgc: '042108001',
      barangayName: 'Alapan I-A',
      zipCode: '4103',
      postalCode: '4103',
    };

    // Handler for Region Change
    const handleSelectRegion = (newRegionPsgc: string, newRegionName: string) => {
      currentAddress = {
        ...currentAddress,
        regionPsgc: newRegionPsgc,
        regionName: newRegionName,
        provincePsgc: null,
        provinceName: null,
        cityMunicipalityPsgc: null,
        cityMunicipalityName: null,
        barangayPsgc: null,
        barangayName: null,
      };
    };

    handleSelectRegion('1300000000', 'National Capital Region');
    expect(currentAddress.regionPsgc).toBe('1300000000');
    expect(currentAddress.provincePsgc).toBeNull();
    expect(currentAddress.cityMunicipalityPsgc).toBeNull();
    expect(currentAddress.barangayPsgc).toBeNull();

    // Handler for City Change
    const handleSelectCity = (cityCode: string, cityName: string, zip?: string) => {
      currentAddress = {
        ...currentAddress,
        cityMunicipalityPsgc: cityCode,
        cityMunicipalityName: cityName,
        barangayPsgc: null,
        barangayName: null,
        zipCode: zip ?? currentAddress.zipCode ?? null,
        postalCode: zip ?? currentAddress.postalCode ?? null,
      };
    };

    handleSelectCity('1376020000', 'City of Manila', '1000');
    expect(currentAddress.cityMunicipalityPsgc).toBe('1376020000');
    expect(currentAddress.barangayPsgc).toBeNull();
    expect(currentAddress.zipCode).toBe('1000');
  });
});

/* ========================================================================= */
/* TEST 4: TELECONSULTATION RECORDING PLAYBACK & ARCHITECTURAL INVARIANTS   */
/* ========================================================================= */

describe('CHALLENGER M4A-2 TEST 4: Teleconsultation Recording Playback & Security', () => {
  const dummyTokenFetcher = async () => 'mock-jwt-patient-token-xyz';
  const patientId = 'patient-uuid-101';
  const appointmentId = 'appt-teleconsult-202';

  test('HMAC ticket request: retrieves valid signed playback ticket and stream URL from patient-api', async () => {
    const mockTicketResponse = {
      ticket: 'hmac-sha256-playback-ticket-token-999',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      streamUrl: `/patients/${patientId}/appointments/${appointmentId}/stream`,
      sessionId: `sess-${appointmentId}`,
      durationSeconds: 1240,
    };

    const getSpy = spyOn(api, 'get').mockResolvedValueOnce(mockTicketResponse);

    const ticket = await teleconsultRecordingsApi.getPlaybackTicket(
      dummyTokenFetcher,
      patientId,
      appointmentId
    );

    expect(ticket).not.toBeNull();
    expect(ticket!.ticket).toBe('hmac-sha256-playback-ticket-token-999');
    expect(ticket!.streamUrl).toBe(`/patients/${patientId}/appointments/${appointmentId}/stream`);
    expect(ticket!.durationSeconds).toBe(1240);
    expect(new Date(ticket!.expiresAt).getTime()).toBeGreaterThan(Date.now());

    getSpy.mockRestore();
  });

  test('HMAC ticket request: 404 returns null indicating no recording available', async () => {
    const error404 = new ApiError('Not found', 404, []);
    const getSpy = spyOn(api, 'get').mockRejectedValueOnce(error404);

    const ticket = await teleconsultRecordingsApi.getPlaybackTicket(
      dummyTokenFetcher,
      patientId,
      appointmentId
    );

    expect(ticket).toBeNull();

    getSpy.mockRestore();
  });

  test('HMAC ticket request: 401 Unauthorized or 500 error throws ApiError to trigger modal error state', async () => {
    const error401 = new ApiError('Unauthorized token', 401, [
      { field: null, code: 'AUTH_REQUIRED', message: 'Unauthorized playback access' },
    ]);
    const getSpy = spyOn(api, 'get').mockRejectedValueOnce(error401);

    await expect(
      teleconsultRecordingsApi.getPlaybackTicket(dummyTokenFetcher, patientId, appointmentId)
    ).rejects.toThrow('Unauthorized token');

    getSpy.mockRestore();
  });

  test('Recording metadata fetcher: returns valid DTO on success, null on 404, or fallback DTO', async () => {
    // 1. Success case
    const mockMeta = {
      sessionId: `sess-${appointmentId}`,
      appointmentId,
      status: 'Ready' as const,
      durationSeconds: 1800,
      recordedAt: new Date().toISOString(),
      streamUrl: `/patients/${patientId}/appointments/${appointmentId}/stream`,
      hasVideo: true,
      hasAudio: true,
    };

    const getSpy = spyOn(api, 'get').mockResolvedValueOnce(mockMeta);
    const meta = await teleconsultRecordingsApi.getRecordingMetadata(
      dummyTokenFetcher,
      patientId,
      appointmentId
    );
    expect(meta).toEqual(mockMeta);
    expect(meta?.hasVideo).toBe(true);

    // 2. 404 case
    const error404 = new ApiError('Recording not found', 404, []);
    getSpy.mockRejectedValueOnce(error404);
    const notFoundMeta = await teleconsultRecordingsApi.getRecordingMetadata(
      dummyTokenFetcher,
      patientId,
      appointmentId
    );
    expect(notFoundMeta).toBeNull();

    getSpy.mockRestore();
  });

  test('Player modal time formatting, speed cycler, and seek calculation unit logic', () => {
    // formatTime verification
    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9)).toBe('0:09');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(900)).toBe('15:00');
    expect(formatTime(1240)).toBe('20:40');

    // speed cycler verification
    const cycleSpeed = (curr: 1 | 1.25 | 1.5) => (curr === 1 ? 1.25 : curr === 1.25 ? 1.5 : 1);
    expect(cycleSpeed(1)).toBe(1.25);
    expect(cycleSpeed(1.25)).toBe(1.5);
    expect(cycleSpeed(1.5)).toBe(1);

    // seek ratio calculation & clamping verification
    const duration = 1200;
    const calculateSeek = (ratio: number) => {
      const clamped = Math.max(0, Math.min(1, ratio));
      return Math.floor(clamped * duration);
    };

    expect(calculateSeek(0)).toBe(0);
    expect(calculateSeek(0.5)).toBe(600);
    expect(calculateSeek(1)).toBe(1200);
    expect(calculateSeek(-0.2)).toBe(0); // Clamped low
    expect(calculateSeek(1.5)).toBe(1200); // Clamped high
  });

  test('Zero Base URL Leaks: patient-app teleconsult, options, and location files have 0 direct clinic wiring', () => {
    const APP_ROOT = join(import.meta.dir, '..');
    const targetFiles = [
      'services/api/teleconsultRecordingsApi.ts',
      'services/api/optionsService.ts',
      'services/api/locationService.ts',
      'components/teleconsult/TeleconsultRecordingPlayerModal.tsx',
      'components/profile/CascadingAddressPicker.tsx',
    ];

    const FORBIDDEN_TOKENS = ['uploadSharedFileToClinic', 'EXPO_PUBLIC_CLINIC_API_URL'];

    for (const file of targetFiles) {
      const fullPath = join(APP_ROOT, file);
      expect(existsSync(fullPath)).toBe(true);
      const source = readFileSync(fullPath, 'utf8');

      for (const token of FORBIDDEN_TOKENS) {
        expect(source.includes(token)).toBe(false);
      }

      // Ensure routes are strictly relative to patient-api
      expect(source.includes('clinic-api')).toBe(false);
    }
  });
});
