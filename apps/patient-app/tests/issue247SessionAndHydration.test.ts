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

mock.module('expo-notifications', () => ({
  PermissionStatus: { UNDETERMINED: 'undetermined', GRANTED: 'granted', DENIED: 'denied' },
  getPermissionsAsync: async () => ({ status: 'undetermined' }),
  requestPermissionsAsync: async () => ({ status: 'undetermined' }),
  setNotificationHandler: () => {},
}));

mock.module('../db/index', dbIndexMock);
mock.module(path.resolve(import.meta.dir, '../db/index.ts'), dbIndexMock);
mock.module('@db/index', dbIndexMock);

const { Database } = await import('bun:sqlite');
const { drizzle } = await import('drizzle-orm/bun-sqlite');
const { eq } = await import('drizzle-orm');
const schema = await import('../db/schema/index');
const { computePendingSyncScope, hydrateFullRecord } = await import('../db/hydrate');
const { api } = await import('../services/api/apiClient');
const { pullAndHydrateProfile, syncFullProfile } = await import('../services/api/syncService');
const { computeIsSessionExpired, resolveNavAccess } = await import('../utils/sessionExpiry');
const { pluralizeCount, pluralizeNoun } = await import('../utils/pluralize');

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
    CREATE TABLE patient_social_history (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL UNIQUE,
      tobacco_status TEXT,
      cigs_per_day INTEGER,
      pack_years REAL,
      quit_date TEXT,
      other_tobacco_products TEXT,
      alcohol_use_level TEXT,
      alcohol_type TEXT,
      alcohol_frequency_days_per_week INTEGER,
      alcohol_quantity_per_occasion INTEGER,
      substance_use INTEGER DEFAULT 0,
      substance_name TEXT,
      substance_route TEXT,
      substance_frequency TEXT,
      activity_level TEXT,
      exercise_type TEXT,
      exercise_frequency_days_per_week INTEGER,
      diet_pattern TEXT,
      food_restrictions TEXT,
      sleep_avg_hours REAL,
      sleep_quality TEXT,
      is_sexually_active INTEGER,
      water_intake TEXT,
      caffeine_use TEXT,
      daily_screen_time TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      server_id TEXT
    );
  `);

  sqlite.run(`
    CREATE TABLE patient_allergies (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      allergen TEXT NOT NULL,
      reaction_type TEXT,
      severity TEXT,
      management TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      server_id TEXT,
      deleted_at INTEGER
    );
  `);

  const listTables = [
    'patient_addresses',
    'emergency_contacts',
    'patient_healthcare_providers',
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

function makeFullRecordPayload(
  patientId: string,
  overrides: {
    demographics?: Partial<Record<string, any>>;
    allergies?: any[];
    socialHistory?: any;
  } = {},
) {
  return {
    demographics: {
      id: patientId,
      firstName: 'Ely',
      middleName: 'An',
      lastName: 'Real',
      suffix: null,
      sex: 'Female',
      dateOfBirth: '1992-04-12',
      placeOfBirth: 'Manila',
      bloodType: 'OPositive',
      civilStatus: 'Single',
      nationality: 'Filipino',
      ethnicity: null,
      religion: null,
      primaryLanguage: 'English',
      educationLevel: null,
      mobile: '09171234567',
      altPhone: null,
      email: 'ely@example.com',
      messengerHandle: null,
      avatarUrl: 'https://cdn.example.com/ely.jpg',
      consentToShareInfo: true,
      ...overrides.demographics,
    },
    governmentIds: [],
    addresses: [],
    emergencyContacts: [],
    healthcareProviders: [],
    allergies: overrides.allergies ?? [],
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
    socialHistory: overrides.socialHistory ?? null,
    occupation: null,
    obstetricProfile: null,
    maleReproductive: null,
    dentalVision: null,
    mentalHealthProfile: null,
    ncdQuestionnaire: null,
  } as any;
}

describe('Issue #247: Session Expiry, Hydration Queue Scoping, Profile Sync & Pluralization', () => {
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

  describe('1. hydrateFullRecord() syncQueue scoping', () => {
    test('updates patients demographics when syncQueue has synced, rejected, or dead patient rows referencing patientId', async () => {
      const now = new Date();
      await rawDb.insert(schema.patients).values({
        id: PATIENT_ID,
        clerkUserId: 'user_123',
        firstName: 'Old',
        lastName: 'Name',
        bloodType: null,
        createdAt: now,
        updatedAt: now,
      });

      await rawDb.insert(schema.syncQueue).values([
        {
          id: 'sq-synced-1',
          entityType: 'patient',
          entityId: PATIENT_ID,
          operation: 'update',
          payloadJson: JSON.stringify({ patientId: PATIENT_ID, clientId: PATIENT_ID, firstName: 'Old' }),
          status: 'synced',
          retryCount: 0,
          createdAt: now,
        },
        {
          id: 'sq-rejected-1',
          entityType: 'patient',
          entityId: PATIENT_ID,
          operation: 'update',
          payloadJson: JSON.stringify({ patientId: PATIENT_ID, clientId: PATIENT_ID, firstName: 'Rejected' }),
          status: 'rejected',
          retryCount: 0,
          createdAt: now,
        },
        {
          id: 'sq-dead-1',
          entityType: 'patient',
          entityId: PATIENT_ID,
          operation: 'update',
          payloadJson: JSON.stringify({ patientId: PATIENT_ID, clientId: PATIENT_ID, firstName: 'Dead' }),
          status: 'dead',
          retryCount: 5,
          createdAt: now,
        },
      ]);

      await hydrateFullRecord(
        makeFullRecordPayload(PATIENT_ID, {
          demographics: { firstName: 'Ely', lastName: 'Real', bloodType: 'OPositive' },
        }),
      );

      const [updated] = await rawDb
        .select()
        .from(schema.patients)
        .where(eq(schema.patients.id, PATIENT_ID));

      expect(updated.firstName).toBe('Ely');
      expect(updated.lastName).toBe('Real');
      expect(updated.bloodType).toBe('O+');
      expect(updated.clerkUserId).toBe('user_123');
      expect(updated.email).toBe('ely@example.com');
    });

    test('updates patients demographics when syncQueue has pending child-entity items containing patientId', async () => {
      const now = new Date();
      await rawDb.insert(schema.patients).values({
        id: PATIENT_ID,
        firstName: 'Stale',
        lastName: 'Patient',
        createdAt: now,
        updatedAt: now,
      });

      // Pending child mutations that include patientId in payloadJson
      await rawDb.insert(schema.syncQueue).values([
        {
          id: 'sq-allergy-pending',
          entityType: 'patient_allergies',
          entityId: 'allergy-local-1',
          operation: 'create',
          payloadJson: JSON.stringify({
            id: 'allergy-local-1',
            clientId: 'allergy-local-1',
            patientId: PATIENT_ID,
            allergenName: 'Peanuts',
          }),
          status: 'pending',
          retryCount: 0,
          createdAt: now,
        },
        {
          id: 'sq-gov-pending',
          entityType: 'patient_government_ids',
          entityId: 'gov-local-1',
          operation: 'create',
          payloadJson: JSON.stringify({
            patientId: PATIENT_ID,
            idType: 'PhilHealth',
            idNumber: '12-345678901-2',
          }),
          status: 'pending',
          retryCount: 0,
          createdAt: now,
        },
        {
          id: 'sq-social-pending',
          entityType: 'patient_social_history',
          entityId: 'social-local-1',
          operation: 'update',
          payloadJson: JSON.stringify({
            patientId: PATIENT_ID,
            clientId: 'social-local-1',
            smokingStatus: 'Never',
          }),
          status: 'failed',
          retryCount: 1,
          createdAt: now,
        },
      ]);

      await rawDb.insert(schema.patientSocialHistory).values({
        id: 'social-local-1',
        patientId: PATIENT_ID,
        tobaccoStatus: 'Current',
        cigsPerDay: 5,
        createdAt: now,
        updatedAt: now,
      });

      await hydrateFullRecord(
        makeFullRecordPayload(PATIENT_ID, {
          demographics: { firstName: 'Ely', lastName: 'Real', bloodType: 'ABPositive' },
          socialHistory: {
            id: 'srv-social-1',
            smokingStatus: 'Never',
            cigsPerDay: 0,
            updatedAt: now.toISOString(),
          },
        }),
      );

      // Demographics MUST update despite pending child & singleton rows referencing patientId
      const [patientRow] = await rawDb
        .select()
        .from(schema.patients)
        .where(eq(schema.patients.id, PATIENT_ID));
      expect(patientRow.firstName).toBe('Ely');
      expect(patientRow.lastName).toBe('Real');
      expect(patientRow.bloodType).toBe('AB+');

      // Pending social history edit MUST remain protected
      const [socialRow] = await rawDb
        .select()
        .from(schema.patientSocialHistory)
        .where(eq(schema.patientSocialHistory.patientId, PATIENT_ID));
      expect(socialRow.id).toBe('social-local-1');
      expect(socialRow.tobaccoStatus).toBe('Current');
      expect(socialRow.cigsPerDay).toBe(5);
    });

    test('protects active pending, syncing, and failed patient demographics edits from server overwrite', async () => {
      const now = new Date();
      for (const activeStatus of ['pending', 'syncing', 'failed'] as const) {
        await rawDb.delete(schema.syncQueue);
        await rawDb.delete(schema.patients);

        await rawDb.insert(schema.patients).values({
          id: PATIENT_ID,
          firstName: 'LocalEdited',
          lastName: 'PendingSave',
          bloodType: 'B+',
          createdAt: now,
          updatedAt: now,
        });

        await rawDb.insert(schema.syncQueue).values({
          id: `sq-patient-${activeStatus}`,
          entityType: 'patient',
          entityId: PATIENT_ID,
          operation: 'update',
          payloadJson: JSON.stringify({
            clientId: PATIENT_ID,
            firstName: 'LocalEdited',
            lastName: 'PendingSave',
          }),
          status: activeStatus,
          retryCount: 0,
          createdAt: now,
        });

        await hydrateFullRecord(
          makeFullRecordPayload(PATIENT_ID, {
            demographics: { firstName: 'ServerStale', lastName: 'OldName', bloodType: 'ONegative' },
          }),
        );

        const [patientRow] = await rawDb
          .select()
          .from(schema.patients)
          .where(eq(schema.patients.id, PATIENT_ID));
        expect(patientRow.firstName).toBe('LocalEdited');
        expect(patientRow.lastName).toBe('PendingSave');
        expect(patientRow.bloodType).toBe('B+');
      }
    });

    test('computePendingSyncScope never adds payload.patientId to pendingEntityIds', () => {
      const scope = computePendingSyncScope(
        [
          {
            entityId: 'child-1',
            entityType: 'patient_allergies',
            status: 'pending',
            payloadJson: JSON.stringify({ id: 'child-1', clientId: 'cli-1', patientId: PATIENT_ID }),
          },
          {
            entityId: PATIENT_ID,
            entityType: 'patient',
            status: 'synced',
            payloadJson: JSON.stringify({ id: PATIENT_ID, patientId: PATIENT_ID }),
          },
        ],
        PATIENT_ID,
      );

      expect(scope.pendingEntityIds.has('child-1')).toBe(true);
      expect(scope.pendingEntityIds.has('cli-1')).toBe(true);
      expect(scope.pendingEntityIds.has(PATIENT_ID)).toBe(false);
      expect(scope.pendingEntityTypesForPatient.has('patient_allergies')).toBe(true);
      expect(scope.pendingEntityTypesForPatient.has('patient')).toBe(false);
    });
  });

  describe('2. Expired Clerk session detection, non-destructive re-auth, and sync guards', () => {
    test('computeIsSessionExpired returns true only when online, Clerk loaded, signed out, and locally authenticated', () => {
      expect(
        computeIsSessionExpired({
          isOnline: true,
          isClerkLoaded: true,
          isClerkSignedIn: false,
          isLocallyAuthenticated: true,
        }),
      ).toBe(true);

      // Offline cold-boot must NOT be treated as expired session
      expect(
        computeIsSessionExpired({
          isOnline: false,
          isClerkLoaded: true,
          isClerkSignedIn: false,
          isLocallyAuthenticated: true,
        }),
      ).toBe(false);

      // Clerk still initializing
      expect(
        computeIsSessionExpired({
          isOnline: true,
          isClerkLoaded: false,
          isClerkSignedIn: false,
          isLocallyAuthenticated: true,
        }),
      ).toBe(false);

      // Signed in
      expect(
        computeIsSessionExpired({
          isOnline: true,
          isClerkLoaded: true,
          isClerkSignedIn: true,
          isLocallyAuthenticated: true,
        }),
      ).toBe(false);

      // Signed-out fresh visitor with no local vault
      expect(
        computeIsSessionExpired({
          isOnline: true,
          isClerkLoaded: true,
          isClerkSignedIn: false,
          isLocallyAuthenticated: false,
        }),
      ).toBe(false);
    });

    test('resolveNavAccess routes non-destructive re-auth directly to Login (bypassing Onboarding on web) and restores Main on cancel', () => {
      const base = {
        isAuthenticated: true,
        isInitialized: true,
        internalPatientId: PATIENT_ID,
        hasPIN: true,
        isLocked: false,
        isLoading: false,
        onboardingComplete: true,
        onboardingLoading: false,
        isClerkLoaded: true,
        isClerkSignedIn: false,
      };

      const duringReauth = resolveNavAccess({ ...base, isReauthenticating: true });
      expect(duringReauth.isAppLoading).toBe(false);
      expect(duringReauth.isInAuthFlow).toBe(true);
      expect(duringReauth.isUnauthenticatedWeb).toBe(true);
      expect(duringReauth.isOnboardingWeb).toBe(false);
      expect(duringReauth.isOnboarding).toBe(false);
      expect(duringReauth.isMainReady).toBe(false);
      expect(duringReauth.isMainReadyWeb).toBe(false);

      const cancelledReauth = resolveNavAccess({ ...base, isReauthenticating: false });
      expect(cancelledReauth.isMainReady).toBe(true);
      expect(cancelledReauth.isMainReadyWeb).toBe(true);
      expect(cancelledReauth.isInAuthFlow).toBe(false);
      expect(cancelledReauth.isUnauthenticatedWeb).toBe(false);
    });

    test('syncFullProfile and pullAndHydrateProfile skip network requests and preserve pending queue items when getToken returns null', async () => {
      const now = new Date();
      await rawDb.insert(schema.syncQueue).values({
        id: 'sq-offline-pending',
        entityType: 'patient',
        entityId: PATIENT_ID,
        operation: 'update',
        payloadJson: JSON.stringify({ clientId: PATIENT_ID, firstName: 'EditedOffline' }),
        status: 'pending',
        retryCount: 0,
        createdAt: now,
      });

      const getSpy = spyOn(api, 'get');
      const postSpy = spyOn(api, 'post');

      try {
        const nullToken = async () => null;
        const fullResult = await syncFullProfile(PATIENT_ID, nullToken);
        const pullResult = await pullAndHydrateProfile(PATIENT_ID, nullToken);

        expect(fullResult.skipped).toBe(true);
        expect(fullResult.success).toBe(false);
        expect(pullResult.skipped).toBe(true);
        expect(pullResult.success).toBe(false);
        expect(getSpy).not.toHaveBeenCalled();
        expect(postSpy).not.toHaveBeenCalled();

        // Pending item was NOT marked 'syncing' or 'failed' and retryCount stayed 0
        const [item] = await rawDb.select().from(schema.syncQueue);
        expect(item.status).toBe('pending');
        expect(item.retryCount).toBe(0);
      } finally {
        getSpy.mockRestore();
        postSpy.mockRestore();
      }
    });
  });

  describe('3. Irregular pluralization & UI reactivity invariants', () => {
    test('pluralizeCount handles 0, singular, regular, and irregular profile nouns', () => {
      expect(pluralizeCount(0, 'allergy')).toBe('None');
      expect(pluralizeCount(1, 'allergy')).toBe('1 allergy');
      expect(pluralizeCount(2, 'allergy')).toBe('2 allergies');

      expect(pluralizeCount(1, 'address')).toBe('1 address');
      expect(pluralizeCount(2, 'address')).toBe('2 addresses');

      expect(pluralizeCount(1, 'illness')).toBe('1 illness');
      expect(pluralizeCount(2, 'illness')).toBe('2 illnesses');

      expect(pluralizeCount(1, 'disability')).toBe('1 disability');
      expect(pluralizeCount(2, 'disability')).toBe('2 disabilities');

      expect(pluralizeCount(1, 'pregnancy')).toBe('1 pregnancy');
      expect(pluralizeCount(2, 'pregnancy')).toBe('2 pregnancies');

      expect(pluralizeCount(1, 'entry')).toBe('1 entry');
      expect(pluralizeCount(2, 'entry')).toBe('2 entries');

      expect(pluralizeCount(2, 'contact')).toBe('2 contacts');
      expect(pluralizeCount(2, 'provider')).toBe('2 providers');
      expect(pluralizeCount(2, 'medication')).toBe('2 medications');
      expect(pluralizeCount(2, 'procedure')).toBe('2 procedures');
      expect(pluralizeCount(2, 'condition')).toBe('2 conditions');
      expect(pluralizeCount(2, 'vaccine')).toBe('2 vaccines');
      expect(pluralizeCount(2, 'trip')).toBe('2 trips');

      expect(pluralizeNoun('dish')).toBe('dishes');
    });

    test('ProfileCard, WebSidebar, WebAppFrame, and filesService enforce session-expired & sync reactivity invariants', () => {
      const readApp = (relPath: string) =>
        fs.readFileSync(path.resolve(import.meta.dir, '..', relPath), 'utf8').replace(/\r\n/g, '\n');

      const profileCardWeb = readApp('components/ProfileCard.web.tsx');
      expect(profileCardWeb).toContain('useProfileSync(reloadPatient)');
      expect(profileCardWeb).toContain('patientRecord?.email');

      const profileCardNative = readApp('components/ProfileCard.tsx');
      expect(profileCardNative).toContain('useProfileSync(reloadPatient)');
      expect(profileCardNative).toContain('patientRecord?.email');

      const sidebarWeb = readApp('components/layout/WebSidebar.web.tsx');
      expect(sidebarWeb).toContain('db.query.patients.findFirst');
      expect(sidebarWeb).toContain("DeviceEventEmitter.addListener('profile-synced'");
      expect(sidebarWeb).toContain('localDbName');

      const webFrame = readApp('components/layout/WebAppFrame.web.tsx');
      expect(webFrame).toContain('<SessionExpiredBanner');

      const profileWeb = readApp('navigation/screens/profile/Profile.screen.web.tsx');
      const profileNative = readApp('navigation/screens/profile/Profile.screen.tsx');
      expect(profileWeb).toContain("from '@utils/pluralize'");
      expect(profileNative).toContain("from '@utils/pluralize'");
      expect(profileWeb).not.toContain('function plural(');
      expect(profileNative).not.toContain('function plural(');

      const filesWeb = readApp('services/files/filesService.web.ts');
      const filesNative = readApp('services/files/filesService.ts');
      const blobStorageSrc = readApp('services/storage/blobStorage.ts');
      expect(filesWeb).toContain('downloadBlobWithAuthRetry');
      expect(filesNative).toContain('downloadBlobWithAuthRetry');
      expect(blobStorageSrc).toContain('!token || !token.trim()');
      expect(blobStorageSrc).toContain('Your session has expired');
    });
  });
});
