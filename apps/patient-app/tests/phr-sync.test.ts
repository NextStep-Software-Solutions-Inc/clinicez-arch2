import { describe, expect, test, mock } from 'bun:test';

(globalThis as any).__DEV__ = false;

// ── Mock Native Modules Before Transitive Imports ────────────────────
mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  DeviceEventEmitter: { emit: () => {}, addListener: () => ({ remove: () => {} }) },
  TurboModuleRegistry: {
    get: () => null,
    getEnforcing: () => ({}),
  },
  View: 'View',
  Text: 'Text',
}));

mock.module('../db/index', () => ({
  originalDb: {},
  db: {},
  registerSyncTrigger: () => {},
  flushDatabaseSnapshot: async () => {},
  ensureDatabaseReady: async () => {},
}));

mock.module('@db/index', () => ({
  originalDb: {},
  db: {},
  registerSyncTrigger: () => {},
  flushDatabaseSnapshot: async () => {},
  ensureDatabaseReady: async () => {},
}));

mock.module('@react-native-community/netinfo', () => ({
  default: {
    fetch: async () => ({ isConnected: true, isInternetReachable: true }),
    addEventListener: () => () => {},
  },
  fetch: async () => ({ isConnected: true, isInternetReachable: true }),
}));

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
  randomUUID: () => 'mock-uuid-12345',
}));

// Dynamic imports after mock.module to avoid ES hoisting
const { Database } = await import('bun:sqlite');
const { drizzle } = await import('drizzle-orm/bun-sqlite');
const { eq, inArray } = await import('drizzle-orm');
const { translateLocalToSyncPayload, createDbWithInterceptor } = await import('../db/interceptor');
const { patientAllergies } = await import('../db/schema/patientAllergies');
const { patientMedications } = await import('../db/schema/patientMedications');
const { emergencyContacts } = await import('../db/schema/emergencyContacts');
const { syncQueue } = await import('../db/schema/syncQueue');
const { reconcileListEntity } = await import('../db/hydrate');

function createPhrTestDb() {
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
    CREATE TABLE patient_allergies (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      allergen TEXT NOT NULL,
      reaction_type TEXT,
      severity TEXT NOT NULL DEFAULT 'Mild',
      management TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      server_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      deleted_at INTEGER
    );
  `);

  sqlite.run(`
    CREATE TABLE patient_medications (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      drug_name TEXT NOT NULL,
      generic_name TEXT,
      brand_name TEXT,
      dosage TEXT,
      dosage_form TEXT,
      frequency TEXT,
      prescribing_physician TEXT,
      start_date TEXT,
      indication TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      server_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      deleted_at INTEGER
    );
  `);

  sqlite.run(`
    CREATE TABLE emergency_contacts (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      name TEXT NOT NULL,
      relationship TEXT,
      phone TEXT NOT NULL,
      alt_phone TEXT,
      email TEXT,
      address TEXT,
      sort_order INTEGER NOT NULL DEFAULT 1,
      server_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      deleted_at INTEGER
    );
  `);

  sqlite.run(`
    CREATE TABLE patient_social_history (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL UNIQUE,
      tobacco_status TEXT,
      smoking_status TEXT,
      alcohol_use_level TEXT,
      substance_use INTEGER,
      dietary_habits TEXT,
      physical_activity_level TEXT,
      caffeine_use TEXT,
      daily_screen_time TEXT,
      server_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER
    );
  `);

  sqlite.run(`
    CREATE TABLE patient_obstetric_profile (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL UNIQUE,
      gravida INTEGER,
      para INTEGER,
      abortion INTEGER,
      living_children INTEGER,
      lmp TEXT,
      cycle_length INTEGER,
      cycle_duration INTEGER,
      regularity TEXT,
      delivery_cnt INTEGER,
      dysmenorrhea_severity TEXT,
      server_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER
    );
  `);

  return { sqlite, db: drizzle(sqlite) };
}

describe('PHR Sync & Hydration Protection Suite', () => {
  describe('1. Bidirectional PHR DTO Translation (Dual-Key Emission)', () => {
    test('patient_allergies translates allergen -> allergenName and preserves isActive bool', () => {
      const local = {
        allergen: 'Penicillin',
        reactionType: 'Anaphylaxis',
        management: 'EpiPen administered',
        isActive: 1,
      };
      const translated = translateLocalToSyncPayload('patient_allergies', local);
      expect(translated.allergen).toBe('Penicillin');
      expect(translated.allergenName).toBe('Penicillin');
      expect(translated.reaction).toBe('Anaphylaxis');
      expect(translated.notes).toBe('EpiPen administered');
      expect(translated.isActive).toBe(true);
    });

    test('patient_medications translates drugName -> medicationName, route, and isCurrentlyTaking', () => {
      const local = {
        drugName: 'Metformin',
        dosageForm: 'Oral',
        prescribingPhysician: 'Dr. Santos',
        indication: 'Type 2 Diabetes',
        isActive: 1,
      };
      const translated = translateLocalToSyncPayload('patient_medications', local);
      expect(translated.drugName).toBe('Metformin');
      expect(translated.medicationName).toBe('Metformin');
      expect(translated.route).toBe('Oral');
      expect(translated.prescribedBy).toBe('Dr. Santos');
      expect(translated.purpose).toBe('Type 2 Diabetes');
      expect(translated.isActive).toBe(true);
      expect(translated.isCurrentlyTaking).toBe(true);
    });

    test('patient_chronic_conditions translates controlStatus string to boolean isControlled', () => {
      const controlled = translateLocalToSyncPayload('patient_chronic_conditions', {
        diagnosis: 'Hypertension',
        controlStatus: 'Controlled',
      });
      expect(controlled.conditionName).toBe('Hypertension');
      expect(controlled.controlStatus).toBe('Controlled');
      expect(controlled.isControlled).toBe(true);

      const uncontrolled = translateLocalToSyncPayload('patient_chronic_conditions', {
        diagnosis: 'Asthma',
        controlStatus: 'Uncontrolled',
      });
      expect(uncontrolled.controlStatus).toBe('Uncontrolled');
      expect(uncontrolled.isControlled).toBe(false);
    });

    test('patient_surgical_history maps procedure -> procedureName, surgeon -> surgeonName, facility -> hospital', () => {
      const local = {
        procedure: 'Appendectomy',
        surgeon: 'Dr. Gomez',
        facility: 'St. Luke’s Medical Center',
        date: '2023-05-12',
      };
      const translated = translateLocalToSyncPayload('patient_surgical_history', local);
      expect(translated.procedureName).toBe('Appendectomy');
      expect(translated.surgeonName).toBe('Dr. Gomez');
      expect(translated.hospital).toBe('St. Luke’s Medical Center');
      expect(translated.surgeryDate).toBe('2023-05-12');
    });

    test('emergency_contacts maps name -> fullName, phone -> mobile, and sortOrder === 1 -> isPrimary', () => {
      const contact1 = translateLocalToSyncPayload('emergency_contacts', {
        name: 'Maria Dela Cruz',
        phone: '09171234567',
        sortOrder: 1,
      });
      expect(contact1.fullName).toBe('Maria Dela Cruz');
      expect(contact1.mobile).toBe('09171234567');
      expect(contact1.isPrimary).toBe(true);

      const contact2 = translateLocalToSyncPayload('emergency_contacts', {
        name: 'Juan Dela Cruz',
        phone: '09181234567',
        sortOrder: 2,
      });
      expect(contact2.isPrimary).toBe(false);
    });

    test('patient_social_history maps tobaccoStatus -> smokingStatus and alcoholUseLevel -> alcoholUse', () => {
      const local = {
        tobaccoStatus: 'Former Smoker',
        alcoholUseLevel: 'Moderate',
        substanceUse: 0,
      };
      const translated = translateLocalToSyncPayload('patient_social_history', local);
      expect(translated.smokingStatus).toBe('Former Smoker');
      expect(translated.alcoholUse).toBe('Moderate');
      expect(translated.usesSubstances).toBe(false);
    });

    test('patient_obstetric_profile maps abortion -> abortusCount, cycleLength, and lmp', () => {
      const local = {
        abortion: 1,
        cycleLength: 28,
        lmp: '2026-03-01',
        dysmenorrheaSeverity: 'Moderate',
      };
      const translated = translateLocalToSyncPayload('patient_obstetric_profile', local);
      expect(translated.abortusCount).toBe(1);
      expect(translated.menstrualCycleLengthDays).toBe(28);
      expect(translated.lastMenstrualPeriod).toBe('2026-03-01');
      expect(translated.hasDysmenorrhea).toBe(true);
    });
  });

  describe('2. Pre-Delete Row Capture in Write Interceptor', () => {
    test('captures full row snapshot and serverId in syncQueue before executing SQL delete', async () => {
      const { db: rawDb } = createPhrTestDb();
      const interceptedDb = createDbWithInterceptor(rawDb);
      const now = new Date();

      // Seed local allergy
      await rawDb.insert(patientAllergies).values({
        id: 'allergy-offline-1',
        patientId: 'patient-test-1',
        allergen: 'Aspirin',
        reactionType: 'Hives',
        severity: 'Moderate',
        management: 'Antihistamines',
        isActive: 1,
        serverId: 'srv-allergy-999',
        createdAt: now,
        updatedAt: now,
      });

      // Execute deletion through intercepted proxy
      await interceptedDb.delete(patientAllergies).where(eq(patientAllergies.id, 'allergy-offline-1'));

      // 1. Verify row was removed from patient_allergies
      const remaining = await rawDb.select().from(patientAllergies).where(eq(patientAllergies.id, 'allergy-offline-1'));
      expect(remaining.length).toBe(0);

      // 2. Verify deletion entry was queued with row snapshot & serverId
      const queued = await rawDb.select().from(syncQueue).all();
      expect(queued.length).toBe(1);
      expect(queued[0].entityType).toBe('patient_allergies');
      expect(queued[0].operation).toBe('delete');
      expect(queued[0].entityId).toBe('srv-allergy-999');

      const payload = JSON.parse(queued[0].payloadJson);
      expect(payload.serverId).toBe('srv-allergy-999');
      expect(payload.patientId).toBe('patient-test-1');
      expect(payload.allergenName).toBe('Aspirin');
      expect(payload.allergen).toBe('Aspirin');
    });
  });

  describe('3. Hydration Protection (Preserving Local-Only Columns)', () => {
    test('reconcileListEntity preserves local-only columns when server returns nulls', async () => {
      const { db } = createPhrTestDb();
      const now = new Date();

      // 1. Insert local medication with local-only dosageForm
      await db.insert(patientMedications).values({
        id: 'med-local-1',
        patientId: 'patient-1',
        drugName: 'Paracetamol',
        dosage: '500mg',
        dosageForm: 'Syrup', // Local-only field absent in basic server DTO
        frequency: 'Every 4 hours',
        isActive: 1,
        serverId: 'srv-med-1',
        createdAt: now,
        updatedAt: now,
      });

      // 2. Incoming server payload for same record with null dosageForm
      const serverIncoming = [
        {
          id: 'srv-med-1',
          drugName: 'Paracetamol',
          dosage: '500mg',
          dosageForm: null, // Server returns null for unsupported local-only field
          frequency: 'Every 4 hours',
          isActive: 1,
        },
      ];

      await reconcileListEntity(
        patientMedications,
        'patient-1',
        serverIncoming,
        new Set(),
        (item: any, _idx: number, existing?: any) => ({
          id: existing?.id ?? item.id,
          patientId: 'patient-1',
          drugName: item.drugName,
          dosage: item.dosage,
          dosageForm: item.dosageForm ?? existing?.dosageForm ?? null,
          frequency: item.frequency,
          isActive: item.isActive ? 1 : 0,
          serverId: item.id,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          syncedAt: now,
        }),
        db
      );

      // Verify dosageForm was preserved from local row
      const reconciled = await db.select().from(patientMedications).where(eq(patientMedications.id, 'med-local-1'));
      expect(reconciled.length).toBe(1);
      expect(reconciled[0].dosageForm).toBe('Syrup');
      expect(reconciled[0].serverId).toBe('srv-med-1');
    });

    test('reconcileListEntity for emergencyContacts preserves local email & address', async () => {
      const { db } = createPhrTestDb();
      const now = new Date();

      await db.insert(emergencyContacts).values({
        id: 'contact-local-1',
        patientId: 'patient-1',
        name: 'Roberto Dela Cruz',
        relationship: 'Brother',
        phone: '09170001111',
        email: 'roberto@example.com', // Local-only
        address: '123 Rizal Ave, Manila', // Local-only
        sortOrder: 1,
        serverId: 'srv-contact-1',
        createdAt: now,
        updatedAt: now,
      });

      const serverIncoming = [
        {
          id: 'srv-contact-1',
          name: 'Roberto Dela Cruz',
          relationship: 'Brother',
          phone: '09170001111',
          email: null,
          address: null,
          sortOrder: 1,
        },
      ];

      await reconcileListEntity(
        emergencyContacts,
        'patient-1',
        serverIncoming,
        new Set(),
        (item: any, _idx: number, existing?: any) => ({
          id: existing?.id ?? item.id,
          patientId: 'patient-1',
          name: item.name,
          relationship: item.relationship,
          phone: item.phone,
          email: item.email ?? existing?.email ?? null,
          address: item.address ?? existing?.address ?? null,
          sortOrder: item.sortOrder ?? 1,
          serverId: item.id,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          syncedAt: now,
        }),
        db
      );

      const rows = await db.select().from(emergencyContacts).where(eq(emergencyContacts.id, 'contact-local-1'));
      expect(rows[0].email).toBe('roberto@example.com');
      expect(rows[0].address).toBe('123 Rizal Ave, Manila');
    });
  });

  describe('4. Sync Queue Rejection Retention & Error Tracking', () => {
    test('rejected sync items transition to status="rejected" and retain error_message', async () => {
      const { db } = createPhrTestDb();
      const now = new Date();

      // Enqueue two pending items
      await db.insert(syncQueue).values([
        {
          id: 'item-accepted-1',
          entityType: 'patient_allergies',
          entityId: 'allergy-1',
          operation: 'create',
          payloadJson: JSON.stringify({ id: 'allergy-1', allergenName: 'Pollen' }),
          status: 'pending',
          createdAt: now,
        },
        {
          id: 'item-rejected-1',
          entityType: 'patient_medications',
          entityId: 'med-1',
          operation: 'create',
          payloadJson: JSON.stringify({ id: 'med-1', medicationName: 'Invalid Drug' }),
          status: 'pending',
          createdAt: now,
        },
      ]);

      // Simulated server push response
      const ack = {
        accepted: 1,
        rejected: 1,
        items: [
          { idempotencyKey: 'item-accepted-1', status: 'Accepted' },
          {
            idempotencyKey: 'item-rejected-1',
            status: 'Rejected',
            conflictDetail: 'Medication dose exceeds maximum recommended daily limit',
          },
        ],
      };

      // Execute reconciliation logic identical to syncService executePushSync
      const acceptedIds: string[] = [];
      const resultMap = new Map<string, any>();
      for (const res of ack.items) {
        if (res.idempotencyKey) {
          resultMap.set(res.idempotencyKey, res);
        }
      }

      const pendingItems = await db.select().from(syncQueue).all();
      for (const item of pendingItems) {
        const serverResult = resultMap.get(item.id);
        if (serverResult && serverResult.status === 'Rejected') {
          const errorMsg = serverResult.conflictDetail || 'Rejected by server';
          await db
            .update(syncQueue)
            .set({
              status: 'rejected',
              errorMessage: errorMsg,
            })
            .where(eq(syncQueue.id, item.id));
        } else {
          acceptedIds.push(item.id);
        }
      }

      // Delete accepted items
      if (acceptedIds.length > 0) {
        await db.delete(syncQueue).where(inArray(syncQueue.id, acceptedIds));
      }

      // Verify queue state: accepted is deleted, rejected is retained with error_message
      const remaining = await db.select().from(syncQueue).all();
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe('item-rejected-1');
      expect(remaining[0].status).toBe('rejected');
      expect(remaining[0].errorMessage).toBe('Medication dose exceeds maximum recommended daily limit');
    });
  });
});
