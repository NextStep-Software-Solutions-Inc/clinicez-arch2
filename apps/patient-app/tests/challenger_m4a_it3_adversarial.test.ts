import { describe, expect, test, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import axios from 'axios';

// Set API URL environment before loading services
process.env.EXPO_PUBLIC_API_URL = 'https://patient-api.test/api/v1';

// ── Native Module Mocks ────────────────────────────────────────────────────────
const inMemoryStore = new Map<string, string>();

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

// Load services and schema under test
const { optionsService: patientOptionsService } = await import('../services/api/optionsService');
const { teleconsultRecordingsApi } = await import('../services/api/teleconsultRecordingsApi');
const { api, ApiError } = await import('../services/api/apiClient');
const { patients } = await import('../db/schema/patients');
const { patientAddresses } = await import('../db/schema/patientAddresses');
import type { EhrOptionDescriptor } from '@shared/safe';

/* ========================================================================= */
/* OBJECTIVE 1: SQLITE MIGRATION 0016 FRESH & UPGRADED DATABASE CHALLENGE    */
/* ========================================================================= */

describe('CHALLENGER M4A-IT3 OBJECTIVE 1: SQLite Migration 0016 PSGC Columns', () => {
  let sqlite: Database;
  let db: ReturnType<typeof drizzle>;

  afterEach(() => {
    if (sqlite) sqlite.close();
  });

  test('Freshly initialized SQLite database applies 0016 and queries all 9 PSGC columns without errors', async () => {
    sqlite = new Database(':memory:');
    db = drizzle(sqlite);

    // 1. Create base schema with patients and patient_addresses including all 0016 columns
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
    `);

    // 2. Verify all 9 PSGC columns are in the table schema
    const colInfo = sqlite.query(`PRAGMA table_info(patient_addresses)`).all() as Array<{ name: string; type: string }>;
    const colNames = colInfo.map((c) => c.name);

    const requiredPsgcCols = [
      'region_psgc',
      'province_psgc',
      'city_municipality_psgc',
      'barangay_psgc',
      'region_name',
      'province_name',
      'city_municipality_name',
      'barangay_name',
      'is_same_as_permanent',
    ];

    for (const col of requiredPsgcCols) {
      expect(colNames).toContain(col);
    }

    const now = new Date();
    await db.insert(patients).values({
      id: 'fresh-patient-1',
      firstName: 'Maria Clara',
      lastName: 'de los Santos',
      createdAt: now,
      updatedAt: now,
    });

    // 3. Insert and verify NCR address (province PSGC is null) with special characters (Ñ)
    await db.insert(patientAddresses).values({
      id: 'addr-fresh-ncr',
      patientId: 'fresh-patient-1',
      type: 'primary',
      houseStreet: 'Unit 402 Doña Soledad Avenue',
      regionPsgc: '1300000000',
      provincePsgc: null,
      cityMunicipalityPsgc: '1376040000',
      barangayPsgc: '137604015',
      regionName: 'National Capital Region',
      provinceName: null,
      cityMunicipalityName: 'City of Parañaque',
      barangayName: 'San Antonio (Santo Niño)',
      zipCode: '1700',
      isSameAsPermanent: false,
      createdAt: now,
      updatedAt: now,
    });

    // 4. Query all 9 columns via raw SQL with zero errors
    const sqlRow: any = sqlite.query(`
      SELECT
        region_psgc,
        province_psgc,
        city_municipality_psgc,
        barangay_psgc,
        region_name,
        province_name,
        city_municipality_name,
        barangay_name,
        is_same_as_permanent
      FROM patient_addresses
      WHERE id = 'addr-fresh-ncr'
    `).get();

    expect(sqlRow).toBeDefined();
    expect(sqlRow.region_psgc).toBe('1300000000');
    expect(sqlRow.province_psgc).toBeNull();
    expect(sqlRow.city_municipality_psgc).toBe('1376040000');
    expect(sqlRow.barangay_psgc).toBe('137604015');
    expect(sqlRow.region_name).toBe('National Capital Region');
    expect(sqlRow.province_name).toBeNull();
    expect(sqlRow.city_municipality_name).toBe('City of Parañaque');
    expect(sqlRow.barangay_name).toBe('San Antonio (Santo Niño)');
    expect(sqlRow.is_same_as_permanent).toBe(0);

    // 5. Query all 9 columns via Drizzle ORM
    const drizzleRows = await db
      .select()
      .from(patientAddresses)
      .where(eq(patientAddresses.id, 'addr-fresh-ncr'));

    expect(drizzleRows.length).toBe(1);
    expect(drizzleRows[0].cityMunicipalityName).toBe('City of Parañaque');
    expect(drizzleRows[0].barangayName).toBe('San Antonio (Santo Niño)');
    expect(drizzleRows[0].isSameAsPermanent).toBe(false);
  });

  test('Upgraded SQLite database: applies 0016 migration on existing pre-0016 database and queries all 9 columns', async () => {
    sqlite = new Database(':memory:');
    db = drizzle(sqlite);

    // 1. Create PRE-0016 legacy schema (WITHOUT the 9 PSGC columns)
    sqlite.run(`
      CREATE TABLE patients (
        id TEXT PRIMARY KEY NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
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
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        synced_at INTEGER,
        server_id TEXT,
        deleted_at INTEGER,
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
      );
    `);

    // Insert pre-existing legacy record
    const legacyCreatedAt = Date.now() - 100000;
    sqlite.run(`
      INSERT INTO patients (id, first_name, last_name, created_at, updated_at)
      VALUES ('legacy-patient-99', 'Jose', 'Rizal', ${legacyCreatedAt}, ${legacyCreatedAt});

      INSERT INTO patient_addresses (id, patient_id, type, house_street, barangay, city_municipality, province, region, zip_code, created_at, updated_at)
      VALUES ('legacy-addr-99', 'legacy-patient-99', 'primary', 'Calamba St.', 'Real', 'Calamba', 'Laguna', 'Region IV-A', '4027', ${legacyCreatedAt}, ${legacyCreatedAt});
    `);

    // Verify 9 PSGC columns DO NOT exist yet
    let colInfo = sqlite.query(`PRAGMA table_info(patient_addresses)`).all() as Array<{ name: string }>;
    let colNames = colInfo.map((c) => c.name);
    expect(colNames).not.toContain('region_psgc');
    expect(colNames).not.toContain('is_same_as_permanent');

    // 2. Read and execute the exact 0016 migration file
    const migration0016Path = join(
      import.meta.dir,
      '../drizzle/0016_add_psgc_address_columns.sql'
    );
    expect(existsSync(migration0016Path)).toBe(true);
    const migration0016Sql = readFileSync(migration0016Path, 'utf8');

    const statements = migration0016Sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);

    expect(statements.length).toBe(9);

    for (const stmt of statements) {
      sqlite.run(stmt);
    }

    // 3. Verify all 9 columns now exist
    colInfo = sqlite.query(`PRAGMA table_info(patient_addresses)`).all() as Array<{ name: string }>;
    colNames = colInfo.map((c) => c.name);

    const requiredPsgcCols = [
      'region_psgc',
      'province_psgc',
      'city_municipality_psgc',
      'barangay_psgc',
      'region_name',
      'province_name',
      'city_municipality_name',
      'barangay_name',
      'is_same_as_permanent',
    ];

    for (const col of requiredPsgcCols) {
      expect(colNames).toContain(col);
    }

    // 4. Verify existing legacy row has NULLs and default 0 for new columns
    const legacyRow: any = sqlite.query(`
      SELECT
        region_psgc,
        province_psgc,
        city_municipality_psgc,
        barangay_psgc,
        region_name,
        province_name,
        city_municipality_name,
        barangay_name,
        is_same_as_permanent
      FROM patient_addresses
      WHERE id = 'legacy-addr-99'
    `).get();

    expect(legacyRow.region_psgc).toBeNull();
    expect(legacyRow.province_psgc).toBeNull();
    expect(legacyRow.is_same_as_permanent).toBe(0);

    // 5. Update legacy row with PSGC values and insert a post-migration row
    sqlite.run(`
      UPDATE patient_addresses
      SET
        region_psgc = '0400000000',
        province_psgc = '0434000000',
        city_municipality_psgc = '0434050000',
        barangay_psgc = '043405035',
        region_name = 'Region IV-A (CALABARZON)',
        province_name = 'Laguna',
        city_municipality_name = 'City of Calamba',
        barangay_name = 'Poblacion',
        is_same_as_permanent = 1
      WHERE id = 'legacy-addr-99';
    `);

    const now = new Date();
    await db.insert(patientAddresses).values({
      id: 'new-addr-post-0016',
      patientId: 'legacy-patient-99',
      type: 'secondary',
      houseStreet: 'Poblacion 1',
      regionPsgc: '1000000000',
      provincePsgc: '1043000000',
      cityMunicipalityPsgc: '1043050000',
      barangayPsgc: '104305001',
      regionName: 'Region X (Northern Mindanao)',
      provinceName: 'Misamis Oriental',
      cityMunicipalityName: 'Cagayan de Oro City',
      barangayName: 'Barangay 1',
      zipCode: '9000',
      isSameAsPermanent: false,
      createdAt: now,
      updatedAt: now,
    });

    // 6. Query all 9 columns via Drizzle ORM across both rows
    const allAddrs = await db.select().from(patientAddresses);
    expect(allAddrs.length).toBe(2);

    const upgradedLegacy = allAddrs.find((a) => a.id === 'legacy-addr-99')!;
    expect(upgradedLegacy.regionPsgc).toBe('0400000000');
    expect(upgradedLegacy.provincePsgc).toBe('0434000000');
    expect(upgradedLegacy.cityMunicipalityPsgc).toBe('0434050000');
    expect(upgradedLegacy.barangayPsgc).toBe('043405035');
    expect(upgradedLegacy.cityMunicipalityName).toBe('City of Calamba');
    expect(upgradedLegacy.isSameAsPermanent).toBe(true);

    const postMigrationRow = allAddrs.find((a) => a.id === 'new-addr-post-0016')!;
    expect(postMigrationRow.regionPsgc).toBe('1000000000');
    expect(postMigrationRow.cityMunicipalityName).toBe('Cagayan de Oro City');
    expect(postMigrationRow.isSameAsPermanent).toBe(false);
  });
});

/* ========================================================================= */
/* OBJECTIVE 2: TELECONSULT RECORDING PLAYBACK: HTTP 404 & EMPTY STATE       */
/* ========================================================================= */

describe('CHALLENGER M4A-IT3 OBJECTIVE 2: Teleconsult Recording Playback 404 & Empty State', () => {
  const dummyTokenFetcher = async () => 'test-patient-jwt';
  const patientId = 'patient-uuid-404-test';
  const appointmentId = 'appt-teleconsult-404-test';

  test('HTTP 404 cleanly returns null with ZERO fake tickets or fabricated durations', async () => {
    const error404 = new ApiError('Not Found', 404, []);
    const getSpy = spyOn(api, 'get').mockRejectedValueOnce(error404);

    const ticket = await teleconsultRecordingsApi.getPlaybackTicket(
      dummyTokenFetcher,
      patientId,
      appointmentId
    );

    // Must return strictly null
    expect(ticket).toBeNull();

    // Verify metadata also returns strictly null on 404
    getSpy.mockRejectedValueOnce(error404);
    const meta = await teleconsultRecordingsApi.getRecordingMetadata(
      dummyTokenFetcher,
      patientId,
      appointmentId
    );
    expect(meta).toBeNull();

    getSpy.mockRestore();
  });

  test('Static AST & Source Invariant: TeleconsultRecordingPlayerModal has 0 fake tickets and 0 setInterval timers', () => {
    const modalPath = join(
      import.meta.dir,
      '../components/teleconsult/TeleconsultRecordingPlayerModal.tsx'
    );
    expect(existsSync(modalPath)).toBe(true);
    const source = readFileSync(modalPath, 'utf8');

    // Invariant: ZERO setInterval or clearInterval (no fake ticking timers)
    expect(source.includes('setInterval')).toBe(false);
    expect(source.includes('clearInterval')).toBe(false);

    // Invariant: ZERO fake ticket patterns (ticket-${appointmentId}-*)
    expect(source.includes('ticket-${')).toBe(false);
    expect(source.includes('mock-ticket')).toBe(false);
    expect(source.includes('fake-ticket')).toBe(false);

    // Invariant: Authentic empty state messaging present
    expect(source.includes('Recording Not Available')).toBe(true);
    expect(source.includes('No Segment Available')).toBe(true);
    expect(source.includes('No recording is available for this consultation')).toBe(true);
  });

  test('Non-404 errors (401 Unauthorized, 500 Internal Error) are NOT swallowed as null and throw properly', async () => {
    const error401 = new ApiError('Unauthorized token', 401, []);
    const getSpy = spyOn(api, 'get').mockRejectedValueOnce(error401);

    await expect(
      teleconsultRecordingsApi.getPlaybackTicket(dummyTokenFetcher, patientId, appointmentId)
    ).rejects.toThrow('Unauthorized token');

    const error500 = new ApiError('Internal Server Error', 500, []);
    getSpy.mockRejectedValueOnce(error500);

    await expect(
      teleconsultRecordingsApi.getPlaybackTicket(dummyTokenFetcher, patientId, appointmentId)
    ).rejects.toThrow('Internal Server Error');

    getSpy.mockRestore();
  });
});

/* ========================================================================= */
/* OBJECTIVE 3: DYNAMIC OPTIONS CACHING WITH SHA-256 ETAG 304 REVALIDATION   */
/* ========================================================================= */

describe('CHALLENGER M4A-IT3 OBJECTIVE 3: Dynamic Options SHA-256 ETag 304 Revalidation', () => {
  beforeEach(() => {
    patientOptionsService.clearMemoryCache();
    inMemoryStore.clear();
  });

  afterEach(() => {
    patientOptionsService.clearMemoryCache();
    inMemoryStore.clear();
  });

  test('Patient App: 200 initial fetch persists SHA-256 ETag; 304 Not Modified revalidates without re-parsing', async () => {
    const sha256Etag = '"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"';
    const mockDescriptors: EhrOptionDescriptor[] = [
      { value: 'single', label: 'Single' },
      { value: 'married', label: 'Married' },
      { value: 'widowed', label: 'Widowed' },
    ];

    let callCount = 0;
    let sentIfNoneMatch: string | undefined;

    const getSpy = spyOn(axios, 'get').mockImplementation(async (url: string, config?: any) => {
      callCount++;
      sentIfNoneMatch = config?.headers?.['If-None-Match'];

      if (callCount === 1) {
        // Initial request -> 200 with ETag
        return {
          status: 200,
          headers: { etag: sha256Etag },
          data: { succeeded: true, data: mockDescriptors },
        } as any;
      }

      if (callCount === 2) {
        // Second request -> returns 304 Not Modified
        return {
          status: 304,
          headers: { etag: sha256Etag },
          data: null,
        } as any;
      }

      throw new Error('Unexpected call');
    });

    // 1st Call -> Fetch from network, persist to memory and storage
    const firstResult = await patientOptionsService.getOptionSet('civil_status');
    expect(firstResult).toEqual(mockDescriptors);
    expect(callCount).toBe(1);
    expect(sentIfNoneMatch).toBeUndefined();

    // Verify storage persistence
    const stored = inMemoryStore.get('clinicez.options.civil_status');
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored!);
    expect(parsed.version).toBe(sha256Etag);
    expect(parsed.data).toEqual(mockDescriptors);

    // 2nd Call -> Revalidates with 304
    const secondResult = await patientOptionsService.getOptionSet('civil_status');
    expect(secondResult).toEqual(mockDescriptors);
    expect(callCount).toBe(2);
    expect(sentIfNoneMatch).toBe(sha256Etag);

    getSpy.mockRestore();
  });

  test('Patient App: Server updates option set (new SHA-256 ETag 200 OK) overwrites cached descriptors', async () => {
    const oldEtag = '"sha256-v1-hash"';
    const newEtag = '"sha256-v2-hash"';

    const v1Data: EhrOptionDescriptor[] = [{ value: 'v1', label: 'Version 1' }];
    const v2Data: EhrOptionDescriptor[] = [
      { value: 'v1', label: 'Version 1' },
      { value: 'v2', label: 'Version 2 (Added Dynamic Option)' },
    ];

    // Seed storage with v1
    inMemoryStore.set(
      'clinicez.options.test_dynamic',
      JSON.stringify({ version: oldEtag, data: v1Data })
    );

    let sentIfNoneMatch: string | undefined;
    const getSpy = spyOn(axios, 'get').mockImplementation(async (url: string, config?: any) => {
      sentIfNoneMatch = config?.headers?.['If-None-Match'];
      return {
        status: 200,
        headers: { etag: newEtag },
        data: { succeeded: true, data: v2Data },
      } as any;
    });

    const result = await patientOptionsService.getOptionSet('test_dynamic');
    expect(sentIfNoneMatch).toBe(oldEtag);
    expect(result).toEqual(v2Data);
    expect(result.length).toBe(2);

    // Verify storage updated with new ETag and data
    const stored = inMemoryStore.get('clinicez.options.test_dynamic');
    const parsed = JSON.parse(stored!);
    expect(parsed.version).toBe(newEtag);
    expect(parsed.data).toEqual(v2Data);

    getSpy.mockRestore();
  });

  test('Clinic App & Patient App Options Contract Consistency: shared EhrOptionDescriptor structure', async () => {
    // Read clinic-app optionsService source and verify identical caching mechanics
    const clinicOptionsServicePath = join(
      import.meta.dir,
      '../../clinic-app/services/optionsService.ts'
    );
    expect(existsSync(clinicOptionsServicePath)).toBe(true);
    const clinicServiceCode = readFileSync(clinicOptionsServicePath, 'utf8');

    // Clinic app must support If-None-Match, status 304, and etag header
    expect(clinicServiceCode.includes("headers['If-None-Match'] = cached.version")).toBe(true);
    expect(clinicServiceCode.includes('response.status === 304')).toBe(true);
    expect(clinicServiceCode.includes('response.status === 200')).toBe(true);
    expect(clinicServiceCode.includes('etag')).toBe(true);
    expect(clinicServiceCode.includes('options/manifest')).toBe(true);
  });
});
