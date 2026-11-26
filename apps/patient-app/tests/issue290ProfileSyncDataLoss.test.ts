import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as path from 'node:path';

(globalThis as any).__DEV__ = false;

let activeTestDb: any = null;

const dbProxy = new Proxy(
  {},
  {
    get(_target, prop) {
      if (!activeTestDb) throw new Error('activeTestDb has not been initialized');
      return activeTestDb[prop];
    },
  },
);

const dbIndexMock = () => ({
  originalDb: dbProxy,
  db: dbProxy,
  registerSyncTrigger: () => {},
  flushDatabaseSnapshot: async () => {},
  clearWebDatabaseSnapshot: async () => {},
  ensureDatabaseReady: async () => {},
});

mock.module('expo-notifications', () => ({
  PermissionStatus: { UNDETERMINED: 'undetermined', GRANTED: 'granted', DENIED: 'denied' },
  getPermissionsAsync: async () => ({ status: 'undetermined' }),
  requestPermissionsAsync: async () => ({ status: 'undetermined' }),
  setNotificationHandler: () => {},
}));

let uuidSeq = 1;
mock.module('expo-crypto', () => ({
  getRandomBytes: (n: number) => {
    const bytes = new Uint8Array(n);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  },
  digestStringAsync: async (_algo: string, s: string) => {
    const h = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(h))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  },
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  randomUUID: () => {
    const hex = (uuidSeq++).toString(16).padStart(12, '0');
    return `aaaaaaaa-aaaa-4aaa-8aaa-${hex}`;
  },
}));

mock.module('../db/index', dbIndexMock);
mock.module(path.resolve(import.meta.dir, '../db/index.ts'), dbIndexMock);
mock.module('@db/index', dbIndexMock);

const { Database } = await import('bun:sqlite');
const { drizzle } = await import('drizzle-orm/bun-sqlite');
const { eq } = await import('drizzle-orm');
const schema = await import('../db/schema/index');
const { createDbWithInterceptor } = await import('../db/interceptor');
const { api } = await import('../services/api/apiClient');
const { syncFullProfile } = await import('../services/api/syncService');

function buildTestDb() {
  const sqlite = new Database(':memory:');

  sqlite.run(`
    CREATE TABLE sync_queue (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);

  sqlite.run(`
    CREATE TABLE sync_cursors (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  sqlite.run(`
    CREATE TABLE patients (
      id TEXT PRIMARY KEY,
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
  `);

  sqlite.run(`
    CREATE TABLE patient_home_cache (
      patient_id TEXT PRIMARY KEY,
      clinic_ez_id TEXT,
      welcome_visited_steps_json TEXT NOT NULL DEFAULT '[]',
      checked_in_appointments_json TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL
    );
  `);

  sqlite.run(`
    CREATE TABLE patient_government_ids (
      id TEXT PRIMARY KEY,
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
      server_id TEXT
    );
  `);

  sqlite.run(`
    CREATE TABLE patient_dental_vision (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL UNIQUE,
      dentist_name TEXT,
      dentist_clinic TEXT,
      orthodontic_device TEXT,
      eye_doctor_name TEXT,
      corrective_lenses TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      server_id TEXT
    );
  `);

  sqlite.run(`
    CREATE TABLE patient_obstetric_profile (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL UNIQUE,
      age_at_menarche INTEGER,
      cycle_length INTEGER,
      cycle_duration INTEGER,
      regularity TEXT,
      dysmenorrhea_severity TEXT,
      menopausal_status TEXT,
      age_at_menopause INTEGER,
      pads_per_day INTEGER,
      age_at_onset_sexual_activity INTEGER,
      current_contraceptive_method TEXT,
      menstruation_applicable INTEGER DEFAULT 1,
      gravida INTEGER,
      para INTEGER,
      abortion INTEGER,
      living_children INTEGER,
      lmp TEXT,
      delivery_cnt INTEGER,
      delivery_type TEXT,
      full_term_deliveries INTEGER,
      premature_deliveries INTEGER,
      pregnancy_induced_hypertension INTEGER,
      on_family_planning INTEGER,
      pregnancy_applicable INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      server_id TEXT
    );
  `);

  sqlite.run(`
    CREATE TABLE patient_pregnancies (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      year INTEGER,
      outcome TEXT,
      gestational_age_weeks INTEGER,
      delivery_type TEXT,
      birth_weight_kg REAL,
      complications TEXT,
      facility TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      server_id TEXT,
      deleted_at INTEGER
    );
  `);

  sqlite.run(`
    CREATE TABLE patient_contraceptive_history (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      method TEXT NOT NULL,
      is_current INTEGER DEFAULT 0,
      date_started TEXT,
      reason_for_stopping TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      server_id TEXT,
      deleted_at INTEGER
    );
  `);

  const otherListTables = [
    'patient_addresses',
    'emergency_contacts',
    'patient_healthcare_providers',
    'patient_allergies',
    'patient_medications',
    'patient_surgical_history',
    'patient_past_illnesses',
    'patient_chronic_conditions',
    'patient_family_history',
    'patient_immunizations_self',
    'patient_disabilities',
    'patient_travel_history',
  ];

  for (const tbl of otherListTables) {
    sqlite.run(`
      CREATE TABLE ${tbl} (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        server_id TEXT,
        deleted_at INTEGER
      );
    `);
  }

  const rawDb = drizzle(sqlite, { schema });
  activeTestDb = rawDb;
  return { sqlite, rawDb };
}

function makeFullRecord(patientId: string, overrides: Record<string, any> = {}) {
  return {
    demographics: {
      id: patientId,
      firstName: 'Maria',
      middleName: 'Clara',
      lastName: 'Santos',
      suffix: null,
      sex: 'Female',
      dateOfBirth: '1990-05-20',
      placeOfBirth: 'Manila',
      bloodType: 'OPositive',
      civilStatus: 'Single',
      nationality: 'Filipino',
      ethnicity: null,
      religion: null,
      primaryLanguage: 'Tagalog',
      educationLevel: null,
      mobile: '+639171112222',
      altPhone: null,
      email: 'maria@example.com',
      messengerHandle: '@maria',
      avatarUrl: null,
      consentToShareInfo: true,
    },
    governmentIds: [],
    addresses: [],
    emergencyContacts: [],
    healthcareProviders: [],
    allergies: [],
    medications: [],
    surgicalHistories: [],
    pastIllnesses: [],
    chronicConditions: [],
    familyHistories: [],
    immunizationsSelf: [],
    disabilities: [],
    travelHistories: [],
    contraceptiveHistories: [],
    pregnancies: [],
    socialHistory: null,
    occupation: null,
    obstetricProfile: null,
    maleReproductive: null,
    dentalVision: null,
    mentalHealthProfile: null,
    ncdQuestionnaire: null,
    ...overrides,
  };
}

describe('Issue #290: Client interceptor, singleton serverId, partial patients merge & ConflictResolved protection', () => {
  const PATIENT_ID = '11111111-1111-4111-8111-111111111111';
  let sqlite: InstanceType<typeof Database>;
  let rawDb: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(() => {
    uuidSeq = 1;
    const built = buildTestDb();
    sqlite = built.sqlite;
    rawDb = built.rawDb;
  });

  afterEach(() => {
    activeTestDb = null;
    sqlite.close();
  });

  test('interceptor pre-captures server-hydrated updatedAt on singleton UPDATE for clock-skew protection', async () => {
    const interceptedDb = createDbWithInterceptor(rawDb);
    const futureServerTs = new Date(Date.now() + 120_000); // 2 minutes ahead of client clock
    const serverRowId = '22222222-2222-4222-8222-222222222222';

    await rawDb.insert(schema.patients).values({
      id: PATIENT_ID,
      firstName: 'Maria',
      lastName: 'Santos',
      createdAt: futureServerTs,
      updatedAt: futureServerTs,
    });

    await rawDb.insert(schema.patientDentalVision).values({
      id: serverRowId,
      patientId: PATIENT_ID,
      dentistName: 'Dr. Old',
      correctiveLenses: 'None',
      createdAt: futureServerTs,
      updatedAt: futureServerTs,
      syncedAt: futureServerTs,
      serverId: serverRowId,
    });

    // Screen overwrites updatedAt with current device clock (behind server clock)
    await interceptedDb
      .update(schema.patientDentalVision)
      .set({ dentistName: 'Dr. New', updatedAt: new Date() })
      .where(eq(schema.patientDentalVision.patientId, PATIENT_ID));

    const queued = await rawDb.select().from(schema.syncQueue).all();
    expect(queued.length).toBe(1);
    expect(queued[0].operation).toBe('update');
    expect(queued[0].entityId).toBe(serverRowId);

    const payload = JSON.parse(queued[0].payloadJson);
    const queuedTs = new Date(payload.updatedAt).getTime();
    expect(queuedTs).toBeGreaterThanOrEqual(futureServerTs.getTime() + 1000);
  });

  test('interceptor classifies unsynced singleton with randomUUID id as CREATE, and synced singleton as UPDATE using serverId', async () => {
    const interceptedDb = createDbWithInterceptor(rawDb);
    const localUuid = '33333333-3333-4333-8333-333333333333';
    const serverUuid = '44444444-4444-4444-8444-444444444444';
    const now = new Date();

    await rawDb.insert(schema.patients).values({
      id: PATIENT_ID,
      firstName: 'Maria',
      lastName: 'Santos',
      createdAt: now,
      updatedAt: now,
    });

    // Unsynced local row created offline with randomUUID()
    await rawDb.insert(schema.patientObstetricProfile).values({
      id: localUuid,
      patientId: PATIENT_ID,
      gravida: 1,
      createdAt: now,
      updatedAt: now,
      syncedAt: null,
      serverId: null,
    });

    await interceptedDb
      .update(schema.patientObstetricProfile)
      .set({ gravida: 2, updatedAt: new Date() })
      .where(eq(schema.patientObstetricProfile.patientId, PATIENT_ID));

    let queued = await rawDb.select().from(schema.syncQueue).all();
    expect(queued.length).toBe(1);
    expect(queued[0].operation).toBe('create');

    // Now simulate row synced with canonical serverId
    await rawDb.delete(schema.syncQueue);
    await rawDb
      .update(schema.patientObstetricProfile)
      .set({ serverId: serverUuid, syncedAt: now })
      .where(eq(schema.patientObstetricProfile.patientId, PATIENT_ID));

    await interceptedDb
      .update(schema.patientObstetricProfile)
      .set({ gravida: 3, updatedAt: new Date() })
      .where(eq(schema.patientObstetricProfile.patientId, PATIENT_ID));

    queued = await rawDb.select().from(schema.syncQueue).all();
    expect(queued.length).toBe(1);
    expect(queued[0].operation).toBe('update');
    expect(queued[0].entityId).toBe(serverUuid);
  });

  test('interceptor merges existing patient columns on partial updates from ContactInfo and PersonalDemographics', async () => {
    const interceptedDb = createDbWithInterceptor(rawDb);
    const serverTs = new Date(Date.now() + 30_000);

    await rawDb.insert(schema.patients).values({
      id: PATIENT_ID,
      clerkUserId: 'clerk-p1',
      firstName: 'Maria',
      middleName: 'Clara',
      lastName: 'Santos',
      sex: 'Female',
      dob: '1990-05-20',
      bloodType: 'O+',
      nationality: 'Filipino',
      mobile: '+639171112222',
      email: 'maria@example.com',
      messengerHandle: '@maria',
      consentToShareInfo: true,
      createdAt: serverTs,
      updatedAt: serverTs,
      syncedAt: serverTs,
    });

    // 1. ContactInfo updates only contact columns
    await interceptedDb
      .update(schema.patients)
      .set({
        mobile: '+639189998888',
        altPhone: '+6328123456',
        firstName: 'Maria',
        lastName: 'Santos',
        updatedAt: new Date(),
      })
      .where(eq(schema.patients.id, PATIENT_ID));

    let queued = await rawDb.select().from(schema.syncQueue).all();
    expect(queued.length).toBe(1);
    const contactPayload = JSON.parse(queued[0].payloadJson);
    expect(contactPayload.mobile).toBe('+639189998888');
    expect(contactPayload.middleName).toBe('Clara');
    expect(contactPayload.dateOfBirth).toBe('1990-05-20');
    expect(contactPayload.bloodType).toBe('OPositive');
    expect(contactPayload.nationality).toBe('Filipino');
    expect(contactPayload.email).toBe('maria@example.com');
    expect(new Date(contactPayload.updatedAt).getTime()).toBeGreaterThanOrEqual(serverTs.getTime() + 1000);

    // 2. PersonalDemographics uses insert().values(...).onConflictDoUpdate(...) without contact fields
    await rawDb.delete(schema.syncQueue);
    await interceptedDb
      .insert(schema.patients)
      .values({
        id: PATIENT_ID,
        clerkUserId: 'clerk-p1',
        firstName: 'Maria Updated',
        lastName: 'Santos',
        dob: '1990-05-21',
        bloodType: 'A+',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.patients.id,
        set: {
          firstName: 'Maria Updated',
          lastName: 'Santos',
          dob: '1990-05-21',
          bloodType: 'A+',
          updatedAt: new Date(),
        },
      });

    queued = await rawDb.select().from(schema.syncQueue).all();
    expect(queued.length).toBe(1);
    const demoPayload = JSON.parse(queued[0].payloadJson);
    expect(demoPayload.firstName).toBe('Maria Updated');
    expect(demoPayload.bloodType).toBe('APositive');
    expect(demoPayload.mobile).toBe('+639189998888');
    expect(demoPayload.altPhone).toBe('+6328123456');
    expect(demoPayload.email).toBe('maria@example.com');
    expect(demoPayload.messengerHandle).toBe('@maria');
  });

  test('syncFullProfile persists serverId on singletons and protects local data when server returns ConflictResolved', async () => {
    const interceptedDb = createDbWithInterceptor(rawDb);
    const now = new Date();
    const localDentalId = '55555555-5555-4555-8555-555555555555';
    const canonicalDentalId = '66666666-6666-4666-8666-666666666666';
    const localPregId = '77777777-7777-4777-8777-777777777777';

    await rawDb.insert(schema.patients).values({
      id: PATIENT_ID,
      firstName: 'Maria',
      lastName: 'Santos',
      createdAt: now,
      updatedAt: now,
    });

    // 1. Create singleton locally -> push succeeds with Applied & serverId
    await interceptedDb.insert(schema.patientDentalVision).values({
      id: localDentalId,
      patientId: PATIENT_ID,
      dentistName: 'Dr. Reyes',
      correctiveLenses: 'Glasses',
      createdAt: now,
      updatedAt: now,
    });

    const postSpy = spyOn(api, 'post');
    const getSpy = spyOn(api, 'get');

    try {
      postSpy.mockImplementation(async (_getToken, _url, body: any) => {
        const items = body?.items || [];
        return {
          accepted: items.length,
          alreadyProcessed: 0,
          applied: items.length,
          conflicts: 0,
          rejected: 0,
          acknowledgedAt: new Date().toISOString(),
          items: items.map((i: any) => ({
            idempotencyKey: i.idempotencyKey,
            entityType: i.entityType,
            operation: i.operation,
            clientId: localDentalId,
            serverId: canonicalDentalId,
            status: 'Applied',
            conflictDetail: null,
          })),
        };
      });
      getSpy.mockImplementation(async (_getToken, url: string) => {
        if (url.includes('/documents/changes')) return { items: [], nextCursor: null, hasMore: false };
        return makeFullRecord(PATIENT_ID, {
          dentalVision: {
            id: canonicalDentalId,
            clientId: localDentalId,
            dentistName: 'Dr. Reyes',
            dentistClinic: null,
            orthodonticDevice: null,
            eyeDoctorName: null,
            correctiveLenses: 'Glasses',
            updatedAt: new Date().toISOString(),
          },
        });
      });

      const firstSync = await syncFullProfile(PATIENT_ID, async () => 'tok');
      expect(firstSync.success).toBe(true);
      expect(firstSync.failed).toBe(0);

      const [dentalAfterApply] = await rawDb
        .select()
        .from(schema.patientDentalVision)
        .where(eq(schema.patientDentalVision.patientId, PATIENT_ID));
      expect(dentalAfterApply.serverId).toBe(canonicalDentalId);
      expect(dentalAfterApply.syncedAt).not.toBeNull();

      // 2. Simulate ConflictResolved on an updated singleton + unsynced list row
      await interceptedDb
        .update(schema.patientDentalVision)
        .set({ dentistName: 'Dr. Local Unpushed Edit', updatedAt: new Date() })
        .where(eq(schema.patientDentalVision.patientId, PATIENT_ID));

      await interceptedDb.insert(schema.patientPregnancies).values({
        id: localPregId,
        patientId: PATIENT_ID,
        year: 2024,
        outcome: 'LiveBirth',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      postSpy.mockImplementation(async (_getToken, _url, body: any) => {
        const items = body?.items || [];
        return {
          accepted: items.length,
          alreadyProcessed: 0,
          applied: 0,
          conflicts: items.length,
          rejected: 0,
          acknowledgedAt: new Date().toISOString(),
          items: items.map((i: any) => ({
            idempotencyKey: i.idempotencyKey,
            entityType: i.entityType,
            operation: i.operation,
            clientId: null,
            serverId: null,
            status: 'ConflictResolved',
            conflictDetail: 'Server version is newer',
          })),
        };
      });

      // Pull returns stale server dental & empty pregnancies
      getSpy.mockImplementation(async (_getToken, url: string) => {
        if (url.includes('/documents/changes')) return { items: [], nextCursor: null, hasMore: false };
        return makeFullRecord(PATIENT_ID, {
          dentalVision: {
            id: canonicalDentalId,
            clientId: localDentalId,
            dentistName: 'Dr. Stale Server',
            correctiveLenses: 'None',
            updatedAt: new Date().toISOString(),
          },
          pregnancies: [],
        });
      });

      const conflictSync = await syncFullProfile(PATIENT_ID, async () => 'tok');
      expect(conflictSync.success).toBe(false);
      expect(conflictSync.failed).toBe(2);
      expect(conflictSync.reason).toContain('Server version is newer');

      // Local SQLite rows MUST NOT be overwritten or deleted by Pull
      const [dentalAfterConflict] = await rawDb
        .select()
        .from(schema.patientDentalVision)
        .where(eq(schema.patientDentalVision.patientId, PATIENT_ID));
      expect(dentalAfterConflict.dentistName).toBe('Dr. Local Unpushed Edit');

      const pregRows = await rawDb
        .select()
        .from(schema.patientPregnancies)
        .where(eq(schema.patientPregnancies.patientId, PATIENT_ID));
      expect(pregRows.length).toBe(1);
      expect(pregRows[0].id).toBe(localPregId);

      // syncQueue keeps both items in 'conflict' status (never deleted)
      const queueAfterConflict = await rawDb.select().from(schema.syncQueue).all();
      expect(queueAfterConflict.length).toBe(2);
      expect(queueAfterConflict.every((q) => q.status === 'conflict')).toBe(true);
    } finally {
      postSpy.mockRestore();
      getSpy.mockRestore();
    }
  });
});
