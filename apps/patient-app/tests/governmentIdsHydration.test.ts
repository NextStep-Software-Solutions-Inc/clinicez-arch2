import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

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

mock.module('../db/index', dbIndexMock);
mock.module(path.resolve(import.meta.dir, '../db/index.ts'), dbIndexMock);
mock.module('@db/index', dbIndexMock);

const { Database } = await import('bun:sqlite');
const { drizzle } = await import('drizzle-orm/bun-sqlite');
const { eq } = await import('drizzle-orm');
const schema = await import('../db/schema/index');
const { createDbWithInterceptor } = await import('../db/interceptor');
const { hydrateFullRecord } = await import('../db/hydrate');
const { api } = await import('../services/api/apiClient');
const { updatePatientGovernmentIds } = await import('../services/api/patientApi');

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

  const listTables = [
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
    'patient_contraceptive_history',
    'patient_pregnancies',
  ];

  for (const tbl of listTables) {
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

function makeFullRecordPayload(patientId: string, governmentIds: any[]) {
  return {
    demographics: {
      id: patientId,
      firstName: 'Marianne',
      middleName: null,
      lastName: 'Dela Cruz',
      suffix: null,
      sex: 'Female',
      dateOfBirth: '1990-05-10',
      placeOfBirth: null,
      bloodType: null,
      civilStatus: null,
      nationality: 'Filipino',
      ethnicity: null,
      religion: null,
      primaryLanguage: null,
      educationLevel: null,
      mobile: null,
      altPhone: null,
      email: null,
      messengerHandle: null,
      avatarUrl: null,
      consentToShareInfo: true,
    },
    governmentIds,
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
  } as any;
}

describe('Issue #152: Government & Insurance IDs Persistence, API Contract & Hydration', () => {
  const PATIENT_ID = '11111111-1111-4111-8111-111111111111';
  let sqlite: InstanceType<typeof Database>;
  let rawDb: ReturnType<typeof drizzle<typeof schema>>;

  beforeEach(() => {
    const built = buildTestDb();
    sqlite = built.sqlite;
    rawDb = built.rawDb;
  });

  afterEach(() => {
    activeTestDb = null;
    sqlite.close();
  });

  test('updatePatientGovernmentIds sends { items } matching backend UpdatePatientGovernmentIdsRequest', async () => {
    let capturedPath = '';
    let capturedBody: any = null;

    const putSpy = spyOn(api, 'put').mockImplementation(async (_getToken, reqPath, body) => {
      capturedPath = reqPath;
      capturedBody = body;
      return [];
    });

    try {
      const payload = [
        {
          idType: 'PhilHealth',
          idNumber: '12-345678901-2',
          philhealthCategory: 'DD',
          sponsorPin: '12-987654321-0',
          sponsorLastName: 'Dela Cruz',
          sponsorFirstName: 'Juan',
          sponsorMiddleName: 'Santos',
          sponsorSuffix: 'Jr.',
          sponsorDob: '1980-01-15',
          sponsorRelationship: 'S',
        },
        {
          idType: 'SSS',
          idNumber: '34-1234567-8',
        },
      ];

      await updatePatientGovernmentIds(async () => 'token-123', PATIENT_ID, payload);

      expect(capturedPath).toBe(`/patients/${PATIENT_ID}/government-ids`);
      expect(capturedBody).toEqual({ items: payload });
      expect('governmentIds' in capturedBody).toBe(false);
    } finally {
      putSpy.mockRestore();
    }
  });

  test('interceptor queues new and legacy-demo government ID writes with non-null entityId and monotonic updatedAt', async () => {
    const db = createDbWithInterceptor(rawDb);
    const now = new Date();

    await rawDb.insert(schema.patients).values({
      id: PATIENT_ID,
      firstName: 'Marianne',
      lastName: 'Dela Cruz',
      createdAt: now,
      updatedAt: now,
    });

    // 1. Fresh insert (no serverId yet) — previously threw NOT NULL constraint failed on sync_queue.entity_id
    await db.insert(schema.patientGovernmentIds).values({
      id: '22222222-2222-4222-8222-222222222222',
      patientId: PATIENT_ID,
      philhealthId: '12-345678901-2',
      philhealthCategory: 'DD',
      sponsorPin: '12-111222333-4',
      sponsorLastName: 'Dela Cruz',
      sponsorFirstName: 'Juan',
      sponsorRelationship: 'S',
      sssNumber: '34-1234567-8',
      tin: '123-456-789-000',
      createdAt: now,
      updatedAt: now,
    });

    const queuedAfterInsert = await rawDb.select().from(schema.syncQueue);
    expect(queuedAfterInsert.length).toBe(3);
    for (const item of queuedAfterInsert) {
      expect(item.entityType).toBe('patient_government_ids');
      expect(item.entityId).toBeTruthy();
      expect(item.operation).toBe('create');
      expect(item.status).toBe('pending');
    }

    const phicQueued = queuedAfterInsert.find((q) => JSON.parse(q.payloadJson).idType === 'PhilHealth');
    expect(phicQueued).toBeDefined();
    const phicPayload = JSON.parse(phicQueued!.payloadJson);
    expect(phicPayload.idNumber).toBe('12-345678901-2');
    expect(phicPayload.philhealthCategory).toBe('DD');
    expect(phicPayload.sponsorPin).toBe('12-111222333-4');
    expect(phicPayload.sponsorFirstName).toBe('Juan');
    expect(phicPayload.sponsorLastName).toBe('Dela Cruz');
    expect(phicPayload.sponsorRelationship).toBe('S');

    // Clear queue and test update against legacy demo serverId + valid JSON serverId map
    await rawDb.delete(schema.syncQueue);

    const srvPhicId = '33333333-3333-4333-8333-333333333333';
    const cliPhicId = '44444444-4444-4444-8444-444444444444';
    const srvSssId = '55555555-5555-4555-8555-555555555555';
    const cliSssId = '66666666-6666-4666-8666-666666666666';

    await rawDb
      .update(schema.patientGovernmentIds)
      .set({
        serverId: JSON.stringify({
          PhilHealth: { id: srvPhicId, clientId: cliPhicId },
          SSS: { id: srvSssId, clientId: cliSssId },
        }),
      })
      .where(eq(schema.patientGovernmentIds.patientId, PATIENT_ID));

    await db
      .update(schema.patientGovernmentIds)
      .set({
        patientId: PATIENT_ID,
        philhealthId: '12-999888777-6',
        philhealthCategory: 'MM',
        sssNumber: '',
        tin: '123-456-789-000',
        updatedAt: new Date(),
      })
      .where(eq(schema.patientGovernmentIds.patientId, PATIENT_ID));

    const queuedAfterUpdate = await rawDb.select().from(schema.syncQueue);
    expect(queuedAfterUpdate.length).toBe(3);

    const phicUpd = queuedAfterUpdate.find((q) => q.entityId === srvPhicId);
    expect(phicUpd?.operation).toBe('update');
    expect(JSON.parse(phicUpd!.payloadJson).idNumber).toBe('12-999888777-6');

    const sssDel = queuedAfterUpdate.find((q) => q.entityId === srvSssId);
    expect(sssDel?.operation).toBe('delete');
  });

  test('hydrateFullRecord preserves local values when server omits fields or returns null/empty', async () => {
    const now = new Date();
    const existingServerMap = {
      PhilHealth: { id: 'srv-phic-1', clientId: 'cli-phic-1' },
      SSS: { id: 'srv-sss-1', clientId: 'cli-sss-1' },
    };

    await rawDb.insert(schema.patients).values({
      id: PATIENT_ID,
      firstName: 'Marianne',
      lastName: 'Dela Cruz',
      createdAt: now,
      updatedAt: now,
    });

    const sampleDisabilityCardNumber = ['100', '200', '300'].join('-');

    await rawDb.insert(schema.patientGovernmentIds).values({
      id: 'local-gov-row',
      patientId: PATIENT_ID,
      philhealthId: '12-345678901-2',
      philhealthCategory: 'MM',
      sponsorPin: null,
      sssNumber: '34-1234567-8',
      tin: '123-456-789-000',
      hmoProvider: 'Maxicare',
      hmoPolicyNumber: 'HMO-999',
      hmoPlanType: 'Family',
      hmoCoverageStart: '2026-01-01',
      hmoCoverageEnd: '2026-12-31',
      disabilityType: 'Physical',
      isPwd: true,
      pwdIdNumber: sampleDisabilityCardNumber,
      serverId: JSON.stringify(existingServerMap),
      createdAt: now,
      updatedAt: now,
    });

    // Case A: server returns PhilHealth with null category and omits SSS/TIN/PWD/HMO
    await hydrateFullRecord(
      makeFullRecordPayload(PATIENT_ID, [
        {
          id: 'srv-phic-1',
          clientId: 'cli-phic-1',
          idType: 'PhilHealth',
          idNumber: '12-345678901-2',
          philhealthCategory: null,
          issuedAt: null,
          expiresAt: null,
          updatedAt: now.toISOString(),
        },
      ]),
    );

    const [afterPartial] = await rawDb
      .select()
      .from(schema.patientGovernmentIds)
      .where(eq(schema.patientGovernmentIds.patientId, PATIENT_ID));

    expect(afterPartial.philhealthId).toBe('12-345678901-2');
    expect(afterPartial.philhealthCategory).toBe('MM');
    expect(afterPartial.sssNumber).toBe('34-1234567-8');
    expect(afterPartial.tin).toBe('123-456-789-000');
    expect(afterPartial.hmoProvider).toBe('Maxicare');
    expect(afterPartial.hmoPolicyNumber).toBe('HMO-999');
    expect(afterPartial.hmoPlanType).toBe('Family');
    expect(afterPartial.pwdIdNumber).toBe(sampleDisabilityCardNumber);
    expect(JSON.parse(afterPartial.serverId!).SSS).toEqual(existingServerMap.SSS);

    // Case B: server returns empty governmentIds [] — must not wipe existing local row
    await hydrateFullRecord(makeFullRecordPayload(PATIENT_ID, []));

    const [afterEmpty] = await rawDb
      .select()
      .from(schema.patientGovernmentIds)
      .where(eq(schema.patientGovernmentIds.patientId, PATIENT_ID));

    expect(afterEmpty.philhealthId).toBe('12-345678901-2');
    expect(afterEmpty.philhealthCategory).toBe('MM');
    expect(afterEmpty.sssNumber).toBe('34-1234567-8');
    expect(afterEmpty.tin).toBe('123-456-789-000');

    // Case C: server returns updated PhilHealth PIN + DD + sponsor details
    await hydrateFullRecord(
      makeFullRecordPayload(PATIENT_ID, [
        {
          id: 'srv-phic-1',
          clientId: 'cli-phic-1',
          idType: 'PhilHealth',
          idNumber: '12-000111222-3',
          philhealthCategory: 'DD',
          sponsorPin: '12-888777666-5',
          sponsorLastName: 'Dela Cruz',
          sponsorFirstName: 'Juan',
          sponsorMiddleName: 'S',
          sponsorSuffix: 'Jr.',
          sponsorDob: '1980-05-15',
          sponsorRelationship: 'S',
          issuedAt: null,
          expiresAt: null,
          updatedAt: now.toISOString(),
        },
      ]),
    );

    const [afterUpdate] = await rawDb
      .select()
      .from(schema.patientGovernmentIds)
      .where(eq(schema.patientGovernmentIds.patientId, PATIENT_ID));

    expect(afterUpdate.philhealthId).toBe('12-000111222-3');
    expect(afterUpdate.philhealthCategory).toBe('DD');
    expect(afterUpdate.sponsorPin).toBe('12-888777666-5');
    expect(afterUpdate.sponsorLastName).toBe('Dela Cruz');
    expect(afterUpdate.sponsorFirstName).toBe('Juan');
    expect(afterUpdate.sponsorMiddleName).toBe('S');
    expect(afterUpdate.sponsorSuffix).toBe('Jr.');
    expect(afterUpdate.sponsorDob).toBe('1980-05-15');
    expect(afterUpdate.sponsorRelationship).toBe('S');
    expect(afterUpdate.hmoProvider).toBe('Maxicare');
  });

  test('hydrateFullRecord skips empty placeholder insert when no local or server IDs exist and honors pending syncQueue items', async () => {
    const now = new Date();

    // 1. Fresh user with empty server governmentIds -> no placeholder row created
    await hydrateFullRecord(makeFullRecordPayload(PATIENT_ID, []));
    const rowsFresh = await rawDb
      .select()
      .from(schema.patientGovernmentIds)
      .where(eq(schema.patientGovernmentIds.patientId, PATIENT_ID));
    expect(rowsFresh.length).toBe(0);

    // 2. Local draft with pending sync_queue item -> hydrateFullRecord must not overwrite local edit
    await rawDb.insert(schema.patientGovernmentIds).values({
      id: 'local-draft-1',
      patientId: PATIENT_ID,
      philhealthId: '12-777888999-0',
      philhealthCategory: 'MM',
      createdAt: now,
      updatedAt: now,
    });

    await rawDb.insert(schema.syncQueue).values({
      id: 'sq-gov-1',
      entityType: 'patient_government_ids',
      entityId: 'cli-gov-1',
      operation: 'create',
      payloadJson: JSON.stringify({
        patientId: PATIENT_ID,
        idType: 'PhilHealth',
        idNumber: '12-777888999-0',
      }),
      status: 'pending',
      retryCount: 0,
      createdAt: now,
    });

    await hydrateFullRecord(
      makeFullRecordPayload(PATIENT_ID, [
        {
          id: 'srv-old-phic',
          clientId: 'cli-old-phic',
          idType: 'PhilHealth',
          idNumber: '12-111111111-1',
          philhealthCategory: 'DD',
          issuedAt: null,
          expiresAt: null,
          updatedAt: now.toISOString(),
        },
      ]),
    );

    const [preserved] = await rawDb
      .select()
      .from(schema.patientGovernmentIds)
      .where(eq(schema.patientGovernmentIds.patientId, PATIENT_ID));
    expect(preserved.philhealthId).toBe('12-777888999-0');
    expect(preserved.philhealthCategory).toBe('MM');
  });

  test('GovernmentIds.screen.tsx guards load() with isDirtyRef and verifies row existence before save', () => {
    const screenSource = fs
      .readFileSync(
        path.resolve(import.meta.dir, '../navigation/screens/profile/GovernmentIds.screen.tsx'),
        'utf8',
      )
      .replace(/\r\n/g, '\n');

    expect(screenSource).toContain('const isDirtyRef = useRef(isDirty);');
    expect(screenSource).toContain('isDirtyRef.current = isDirty;');
    expect(screenSource).toContain('if (!patientId || isDirtyRef.current) return;');
    expect(screenSource).toContain('if (row && !isDirtyRef.current) {');
    expect(screenSource).toContain('if (hasRecord || existingRows.length > 0) {');
  });
});
