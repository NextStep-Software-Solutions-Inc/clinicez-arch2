import { describe, expect, test, mock } from 'bun:test';
import * as path from 'node:path';

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

mock.module('expo-sqlite', () => ({
  openDatabaseSync: () => ({}),
}));

mock.module('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
}));

mock.module('drizzle-orm/expo-sqlite', () => ({
  drizzle: () => ({}),
}));

// Mutable reference for active test SQLite DB
let activeTestDb: any = null;

const dbProxy = new Proxy({}, {
  get(_target, prop) {
    if (!activeTestDb) throw new Error('activeTestDb has not been initialized');
    return activeTestDb[prop];
  },
});

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

mock.module('@react-native-community/netinfo', () => ({
  default: {
    fetch: async () => ({ isConnected: true, isInternetReachable: true }),
    addEventListener: () => () => {},
  },
  fetch: async () => ({ isConnected: true, isInternetReachable: true }),
}));

let mockUuidCounter = 1000;
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
    const hex = (mockUuidCounter++).toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${hex}`;
  },
}));

// Dynamic imports
const { Database } = await import('bun:sqlite');
const { drizzle } = await import('drizzle-orm/bun-sqlite');
const { eq, inArray } = await import('drizzle-orm');
const schema = await import('../db/schema/index');
const {
  translateLocalToSyncPayload,
  createDbWithInterceptor,
  TABLE_TO_ENTITY_TYPE,
  SINGLETON_TABLES,
} = await import('../db/interceptor');
const {
  reconcileListEntity,
  hydrateFullRecord,
  upsertPatientSummary,
} = await import('../db/hydrate');

function buildFullTestDb() {
  const sqlite = new Database(':memory:');

  // 1. sync_queue
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

  // 2. patients
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

  // 3. patient_government_ids
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

  // 4. patient_addresses
  sqlite.run(`
    CREATE TABLE patient_addresses (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      type TEXT NOT NULL,
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
      deleted_at INTEGER
    );
  `);

  // 5. emergency_contacts
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

  // 6. patient_healthcare_providers
  sqlite.run(`
    CREATE TABLE patient_healthcare_providers (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      provider_type TEXT NOT NULL,
      name TEXT,
      specialty TEXT,
      clinic_hospital TEXT,
      phone TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      server_id TEXT,
      deleted_at INTEGER
    );
  `);

  // 7. patient_allergies
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

  // 8. patient_medications
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

  // 9. patient_surgical_history
  sqlite.run(`
    CREATE TABLE patient_surgical_history (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      procedure TEXT NOT NULL,
      surgeon TEXT,
      facility TEXT,
      date TEXT,
      anesthesia_type TEXT,
      complications TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      server_id TEXT,
      deleted_at INTEGER
    );
  `);

  // 10. patient_past_illnesses
  sqlite.run(`
    CREATE TABLE patient_past_illnesses (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      diagnosis TEXT NOT NULL,
      duration TEXT,
      complications TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      server_id TEXT,
      deleted_at INTEGER
    );
  `);

  // 11. patient_chronic_conditions
  sqlite.run(`
    CREATE TABLE patient_chronic_conditions (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      diagnosis TEXT NOT NULL,
      control_status TEXT,
      monitoring_frequency TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      server_id TEXT,
      deleted_at INTEGER
    );
  `);

  // 12. patient_disabilities
  sqlite.run(`
    CREATE TABLE patient_disabilities (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      body_part TEXT,
      classification TEXT,
      is_pwd_certified INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      server_id TEXT,
      deleted_at INTEGER
    );
  `);

  // 13. patient_immunizations_self
  sqlite.run(`
    CREATE TABLE patient_immunizations_self (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      immunization_category TEXT,
      vaccine_name TEXT NOT NULL,
      dose_number TEXT,
      lot_number TEXT,
      date TEXT,
      administered_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      server_id TEXT,
      deleted_at INTEGER
    );
  `);

  // 14. patient_social_history
  sqlite.run(`
    CREATE TABLE patient_social_history (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL UNIQUE,
      tobacco_status TEXT,
      smoking_status TEXT,
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

  // 15. patient_family_history
  sqlite.run(`
    CREATE TABLE patient_family_history (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      condition TEXT NOT NULL,
      affected_relative TEXT,
      side TEXT,
      age_of_onset INTEGER,
      is_deceased INTEGER DEFAULT 0,
      age_at_death INTEGER,
      cause_of_death TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      server_id TEXT,
      deleted_at INTEGER
    );
  `);

  // 16. patient_occupation
  sqlite.run(`
    CREATE TABLE patient_occupation (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL UNIQUE,
      occupation TEXT,
      employer TEXT,
      industry TEXT,
      work_environment TEXT,
      years_in_occupation INTEGER,
      hazard_exposure TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      server_id TEXT
    );
  `);

  // 17. patient_travel_history
  sqlite.run(`
    CREATE TABLE patient_travel_history (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      destination TEXT NOT NULL,
      city_province TEXT,
      departure_date TEXT,
      return_date TEXT,
      purpose TEXT,
      illness_during_after_travel TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      server_id TEXT,
      deleted_at INTEGER
    );
  `);

  // 18. patient_obstetric_profile
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

  // 19. patient_pregnancies
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

  // 20. patient_contraceptive_history
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

  // 21. patient_male_reproductive
  sqlite.run(`
    CREATE TABLE patient_male_reproductive (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL UNIQUE,
      has_vasectomy INTEGER DEFAULT 0,
      vasectomy_date TEXT,
      conditions TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      server_id TEXT
    );
  `);

  // 22. patient_dental_vision
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

  // 23. patient_mental_health_profile
  sqlite.run(`
    CREATE TABLE patient_mental_health_profile (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL UNIQUE,
      has_prior_diagnosis INTEGER DEFAULT 0,
      provider_name TEXT,
      provider_specialty TEXT,
      provider_clinic TEXT,
      psychotherapy_status TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER,
      server_id TEXT
    );
  `);

  // 24. patient_ncd_questionnaire
  sqlite.run(`
    CREATE TABLE patient_ncd_questionnaire (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL UNIQUE,
      qid1_yn TEXT,
      qid2_yn TEXT,
      qid3_yn TEXT,
      qid4_yn TEXT,
      qid5_ynx TEXT,
      qid6_yn TEXT,
      qid7_yn TEXT,
      qid8_yn TEXT,
      qid9_yn TEXT,
      qid10_yn TEXT,
      qid11_yn TEXT,
      qid12_yn TEXT,
      qid13_yn TEXT,
      qid14_yn TEXT,
      qid15_yn TEXT,
      qid16_yn TEXT,
      qid17_abcde TEXT,
      qid18_yn TEXT,
      qid19_yn TEXT,
      qid19_fbs_mgdl REAL,
      qid19_fbs_mmol REAL,
      qid19_fbs_date TEXT,
      qid20_yn TEXT,
      qid20_chole_val REAL,
      qid20_chole_date TEXT,
      qid21_yn TEXT,
      qid21_keton_val REAL,
      qid21_keton_date TEXT,
      qid22_yn TEXT,
      qid22_protein_val REAL,
      qid22_protein_date TEXT,
      qid23_yn TEXT,
      qid24_yn TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER
    );
  `);

  const rawDb = drizzle(sqlite, { schema });
  activeTestDb = rawDb;
  return { sqlite, rawDb };
}

describe('Challenger M2: Empirical Stress Test Suite for PHR Sync & Hydration', () => {

  // ═════════════════════════════════════════════════════════════════════════════
  // DIMENSION 1: DTO DUAL-KEY TRANSLATION & TYPE COERCION ACROSS ALL 22 TABLES
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Dimension 1: DTO Dual-Key Translation & Coercion across all 22 PHR Tables', () => {

    test('1.1 patient_allergies: dual keys (allergen/allergenName, reactionType/reaction, management/notes) and boolean isActive', () => {
      const active = translateLocalToSyncPayload('patient_allergies', {
        allergen: 'Penicillin',
        reactionType: 'Anaphylaxis',
        management: 'Administer IM Epinephrine',
        isActive: 1,
      });
      expect(active.allergen).toBe('Penicillin');
      expect(active.allergenName).toBe('Penicillin');
      expect(active.reactionType).toBe('Anaphylaxis');
      expect(active.reaction).toBe('Anaphylaxis');
      expect(active.management).toBe('Administer IM Epinephrine');
      expect(active.notes).toBe('Administer IM Epinephrine');
      expect(active.isActive).toBe(true);

      const inactive = translateLocalToSyncPayload('patient_allergies', {
        allergen: 'Latex',
        isActive: 0,
      });
      expect(inactive.isActive).toBe(false);
    });

    test('1.2 patient_medications: dual keys (drugName/medicationName, dosageForm/route, prescribingPhysician/prescribedBy, indication/purpose) and booleans', () => {
      const med = translateLocalToSyncPayload('patient_medications', {
        drugName: 'Amlodipine Besylate',
        dosage: '10mg',
        dosageForm: 'Oral Tablet',
        frequency: 'OD mane',
        prescribingPhysician: 'Dr. Santos',
        indication: 'Essential Hypertension',
        isActive: 1,
      });
      expect(med.drugName).toBe('Amlodipine Besylate');
      expect(med.medicationName).toBe('Amlodipine Besylate');
      expect(med.dosageForm).toBe('Oral Tablet');
      expect(med.route).toBe('Oral Tablet');
      expect(med.prescribingPhysician).toBe('Dr. Santos');
      expect(med.prescribedBy).toBe('Dr. Santos');
      expect(med.indication).toBe('Essential Hypertension');
      expect(med.purpose).toBe('Essential Hypertension');
      expect(med.isActive).toBe(true);
      expect(med.isCurrentlyTaking).toBe(true);

      const inactiveMed = translateLocalToSyncPayload('patient_medications', {
        drugName: 'Co-Amoxiclav',
        isActive: 0,
      });
      expect(inactiveMed.isActive).toBe(false);
      expect(inactiveMed.isCurrentlyTaking).toBe(false);
    });

    test('1.3 patient_chronic_conditions: diagnosis/conditionName and bidirectional string/boolean controlStatus/isControlled', () => {
      // 1. Controlled (capitalized)
      const controlled = translateLocalToSyncPayload('patient_chronic_conditions', {
        diagnosis: 'Type 2 Diabetes Mellitus',
        controlStatus: 'Controlled',
        monitoringFrequency: 'HbA1c Q3M',
      });
      expect(controlled.diagnosis).toBe('Type 2 Diabetes Mellitus');
      expect(controlled.conditionName).toBe('Type 2 Diabetes Mellitus');
      expect(controlled.controlStatus).toBe('Controlled');
      expect(controlled.isControlled).toBe(true);
      expect(controlled.treatmentNotes).toBe('HbA1c Q3M');

      // 2. controlled (lowercase, trimmed)
      const lower = translateLocalToSyncPayload('patient_chronic_conditions', {
        diagnosis: 'Asthma',
        controlStatus: '  controlled  ',
      });
      expect(lower.isControlled).toBe(true);

      // 3. Uncontrolled
      const uncontrolled = translateLocalToSyncPayload('patient_chronic_conditions', {
        diagnosis: 'Hypertension',
        controlStatus: 'Uncontrolled',
      });
      expect(uncontrolled.controlStatus).toBe('Uncontrolled');
      expect(uncontrolled.isControlled).toBe(false);

      // 4. Reverse mapping (from backend boolean isControlled -> local string controlStatus)
      const reverseTrue = translateLocalToSyncPayload('patient_chronic_conditions', {
        diagnosis: 'CAD',
        isControlled: true,
      });
      expect(reverseTrue.controlStatus).toBe('Controlled');
      expect(reverseTrue.isControlled).toBe(true);

      const reverseFalse = translateLocalToSyncPayload('patient_chronic_conditions', {
        diagnosis: 'CAD',
        isControlled: false,
      });
      expect(reverseFalse.controlStatus).toBe('Uncontrolled');
      expect(reverseFalse.isControlled).toBe(false);
    });

    test('1.4 patient_surgical_history: procedure/procedureName, surgeon/surgeonName, facility/hospital, date/surgeryDate', () => {
      const surg = translateLocalToSyncPayload('patient_surgical_history', {
        procedure: 'Laparoscopic Cholecystectomy',
        surgeon: 'Dr. Jose Rizal',
        facility: 'Philippine General Hospital',
        date: '2023-08-15',
      });
      expect(surg.procedure).toBe('Laparoscopic Cholecystectomy');
      expect(surg.procedureName).toBe('Laparoscopic Cholecystectomy');
      expect(surg.surgeon).toBe('Dr. Jose Rizal');
      expect(surg.surgeonName).toBe('Dr. Jose Rizal');
      expect(surg.facility).toBe('Philippine General Hospital');
      expect(surg.hospital).toBe('Philippine General Hospital');
      expect(surg.date).toBe('2023-08-15');
      expect(surg.surgeryDate).toBe('2023-08-15');
    });

    test('1.5 patient_past_illnesses: diagnosis/illnessName, duration/notes, complications/treatmentReceived', () => {
      const illness = translateLocalToSyncPayload('patient_past_illnesses', {
        diagnosis: 'Pulmonary Tuberculosis',
        duration: '6 Months DOTS Course',
        complications: 'Completed Cat 1 Regimen',
      });
      expect(illness.diagnosis).toBe('Pulmonary Tuberculosis');
      expect(illness.illnessName).toBe('Pulmonary Tuberculosis');
      expect(illness.duration).toBe('6 Months DOTS Course');
      expect(illness.notes).toBe('6 Months DOTS Course');
      expect(illness.complications).toBe('Completed Cat 1 Regimen');
      expect(illness.treatmentReceived).toBe('Completed Cat 1 Regimen');
    });

    test('1.6 patient_family_history: condition/conditionName, affectedRelative/relation, boolean isDeceased', () => {
      const fh1 = translateLocalToSyncPayload('patient_family_history', {
        condition: 'Colorectal Carcinoma',
        affectedRelative: 'Maternal Grandfather',
        isDeceased: 1,
      });
      expect(fh1.condition).toBe('Colorectal Carcinoma');
      expect(fh1.conditionName).toBe('Colorectal Carcinoma');
      expect(fh1.affectedRelative).toBe('Maternal Grandfather');
      expect(fh1.relation).toBe('Maternal Grandfather');
      expect(fh1.isDeceased).toBe(true);

      const fh2 = translateLocalToSyncPayload('patient_family_history', {
        condition: 'Hypertension',
        affectedRelative: 'Father',
        isDeceased: 0,
      });
      expect(fh2.isDeceased).toBe(false);
    });

    test('1.7 emergency_contacts: name/fullName, phone/mobile, sortOrder -> boolean isPrimary', () => {
      const primary = translateLocalToSyncPayload('emergency_contacts', {
        name: 'Maria Clara',
        phone: '09171234567',
        sortOrder: 1,
      });
      expect(primary.name).toBe('Maria Clara');
      expect(primary.fullName).toBe('Maria Clara');
      expect(primary.phone).toBe('09171234567');
      expect(primary.mobile).toBe('09171234567');
      expect(primary.isPrimary).toBe(true);

      const secondary = translateLocalToSyncPayload('emergency_contacts', {
        name: 'Crisostomo Ibarra',
        phone: '09181234567',
        sortOrder: 2,
      });
      expect(secondary.isPrimary).toBe(false);

      const tertiary = translateLocalToSyncPayload('emergency_contacts', {
        name: 'Elias Salome',
        sortOrder: 0,
      });
      expect(tertiary.isPrimary).toBe(false);
    });

    test('1.8 patient_addresses: houseStreet/street, cityMunicipality/city, zipCode/postalCode, type -> boolean isPrimary, country default', () => {
      const primaryAddr = translateLocalToSyncPayload('patient_addresses', {
        houseStreet: 'Unit 12B Horizon Tower',
        cityMunicipality: 'Makati City',
        zipCode: '1226',
        type: 'primary',
      });
      expect(primaryAddr.houseStreet).toBe('Unit 12B Horizon Tower');
      expect(primaryAddr.street).toBe('Unit 12B Horizon Tower');
      expect(primaryAddr.cityMunicipality).toBe('Makati City');
      expect(primaryAddr.city).toBe('Makati City');
      expect(primaryAddr.zipCode).toBe('1226');
      expect(primaryAddr.postalCode).toBe('1226');
      expect(primaryAddr.isPrimary).toBe(true);
      expect(primaryAddr.country).toBe('Philippines');

      const secondaryAddr = translateLocalToSyncPayload('patient_addresses', {
        type: 'secondary',
      });
      expect(secondaryAddr.isPrimary).toBe(false);
    });

    test('1.9 patient_social_history: tobaccoStatus/smokingStatus, alcoholUseLevel/alcoholUse, boolean usesSubstances', () => {
      const social = translateLocalToSyncPayload('patient_social_history', {
        tobaccoStatus: 'Current Smoker',
        alcoholUseLevel: 'Social Drinker',
        substanceUse: 1,
      });
      expect(social.tobaccoStatus).toBe('Current Smoker');
      expect(social.smokingStatus).toBe('Current Smoker');
      expect(social.alcoholUseLevel).toBe('Social Drinker');
      expect(social.alcoholUse).toBe('Social Drinker');
      expect(social.usesSubstances).toBe(true);

      const cleanSocial = translateLocalToSyncPayload('patient_social_history', {
        substanceUse: 0,
      });
      expect(cleanSocial.usesSubstances).toBe(false);
    });

    test('1.10 patient_obstetric_profile: abortion/abortusCount, cycleLength/menstrualCycleLengthDays, lmp/lastMenstrualPeriod, boolean hasDysmenorrhea, applicable booleans', () => {
      const ob = translateLocalToSyncPayload('patient_obstetric_profile', {
        abortion: 2,
        cycleLength: 32,
        lmp: '2026-03-10',
        dysmenorrheaSeverity: 'Severe',
        menstruationApplicable: 1,
        pregnancyApplicable: 0,
      });
      expect(ob.abortion).toBe(2);
      expect(ob.abortusCount).toBe(2);
      expect(ob.cycleLength).toBe(32);
      expect(ob.menstrualCycleLengthDays).toBe(32);
      expect(ob.lmp).toBe('2026-03-10');
      expect(ob.lastMenstrualPeriod).toBe('2026-03-10');
      expect(ob.hasDysmenorrhea).toBe(true);
      expect(ob.menstruationApplicable).toBe(true);
      expect(ob.pregnancyApplicable).toBe(false);

      const obNoPain = translateLocalToSyncPayload('patient_obstetric_profile', {
        dysmenorrheaSeverity: 'None',
      });
      expect(obNoPain.hasDysmenorrhea).toBe(false);
    });

    test('1.11 patient_mental_health_profile: boolean hasDiagnosis, therapistName, therapyType, notes, sessionFrequency', () => {
      const mh = translateLocalToSyncPayload('patient_mental_health_profile', {
        hasPriorDiagnosis: 1,
        providerName: 'Dr. Angela David',
        providerSpecialty: 'Cognitive Behavioral Therapy',
        providerClinic: 'The Medical City Wellness Center',
        psychotherapyStatus: 'Weekly',
      });
      expect(mh.hasPriorDiagnosis).toBe(1);
      expect(mh.hasDiagnosis).toBe(true);
      expect(mh.providerName).toBe('Dr. Angela David');
      expect(mh.therapistName).toBe('Dr. Angela David');
      expect(mh.providerSpecialty).toBe('Cognitive Behavioral Therapy');
      expect(mh.therapyType).toBe('Cognitive Behavioral Therapy');
      expect(mh.providerClinic).toBe('The Medical City Wellness Center');
      expect(mh.notes).toBe('The Medical City Wellness Center');
      expect(mh.psychotherapyStatus).toBe('Weekly');
      expect(mh.sessionFrequency).toBe('Weekly');
    });

    test('1.12-1.15 Booleans for disabilities, contraceptive, male reproductive, and patients', () => {
      const dis = translateLocalToSyncPayload('patient_disabilities', { isPwdCertified: 1 });
      expect(dis.isPwdCertified).toBe(true);

      const contra = translateLocalToSyncPayload('patient_contraceptive_history', { isCurrent: 1 });
      expect(contra.isCurrent).toBe(true);

      const male = translateLocalToSyncPayload('patient_male_reproductive', { hasVasectomy: 1 });
      expect(male.hasVasectomy).toBe(true);

      const pt = translateLocalToSyncPayload('patients', {
        dob: '1992-04-20',
        bloodType: 'B+',
        consentToShareInfo: 1,
      });
      expect(pt.dob).toBe('1992-04-20');
      expect(pt.dateOfBirth).toBe('1992-04-20');
      expect(pt.bloodType).toBe('BPositive');
      expect(pt.consentToShareInfo).toBe(true);
    });

    test('1.16 Intercepted write inserts dual-key syncPayload into syncQueue for all PHR tables', async () => {
      const { rawDb } = buildFullTestDb();
      const interceptedDb = createDbWithInterceptor(rawDb);
      const now = new Date();

      // Seed a patient first
      await rawDb.insert(schema.patients).values({
        id: 'patient-dual-test',
        firstName: 'Juan',
        lastName: 'Tamad',
        createdAt: now,
        updatedAt: now,
      });

      // Insert into patientAllergies via interceptedDb
      await interceptedDb.insert(schema.patientAllergies).values({
        id: 'alg-001',
        patientId: 'patient-dual-test',
        allergen: 'Seafood',
        reactionType: 'Urticaria',
        severity: 'Mild',
        management: 'Cetirizine',
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      });

      // Insert into patientMedications via interceptedDb
      await interceptedDb.insert(schema.patientMedications).values({
        id: 'med-001',
        patientId: 'patient-dual-test',
        drugName: 'Losartan Potassium',
        dosage: '50mg',
        dosageForm: 'Oral',
        prescribingPhysician: 'Dr. Ramos',
        indication: 'Hypertension',
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      });

      // Insert into emergencyContacts via interceptedDb
      await interceptedDb.insert(schema.emergencyContacts).values({
        id: 'ec-001',
        patientId: 'patient-dual-test',
        name: 'Maria Clara',
        phone: '09170001111',
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      });

      const queueItems = await rawDb.select().from(schema.syncQueue).all();
      expect(queueItems.length).toBe(3);

      const algQueue = queueItems.find(q => q.entityType === 'patient_allergies');
      const medQueue = queueItems.find(q => q.entityType === 'patient_medications');
      const ecQueue = queueItems.find(q => q.entityType === 'emergency_contacts');

      expect(algQueue).toBeDefined();
      const algPayload = JSON.parse(algQueue!.payloadJson);
      expect(algPayload.allergen).toBe('Seafood');
      expect(algPayload.allergenName).toBe('Seafood');
      expect(algPayload.reaction).toBe('Urticaria');
      expect(algPayload.notes).toBe('Cetirizine');
      expect(algPayload.isActive).toBe(true);

      expect(medQueue).toBeDefined();
      const medPayload = JSON.parse(medQueue!.payloadJson);
      expect(medPayload.drugName).toBe('Losartan Potassium');
      expect(medPayload.medicationName).toBe('Losartan Potassium');
      expect(medPayload.route).toBe('Oral');
      expect(medPayload.prescribedBy).toBe('Dr. Ramos');
      expect(medPayload.isCurrentlyTaking).toBe(true);

      expect(ecQueue).toBeDefined();
      const ecPayload = JSON.parse(ecQueue!.payloadJson);
      expect(ecPayload.fullName).toBe('Maria Clara');
      expect(ecPayload.mobile).toBe('09170001111');
      expect(ecPayload.isPrimary).toBe(true);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // DIMENSION 2: PRE-DELETE ROW CAPTURE UNDER RAPID CONCURRENT DELETIONS
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Dimension 2: Pre-Delete Row Capture under Rapid Concurrent Deletions', () => {

    test('2.1 executes 50 rapid concurrent deletions and verifies 100% snapshot capture and serverId preservation', async () => {
      const { rawDb } = buildFullTestDb();
      const interceptedDb = createDbWithInterceptor(rawDb);
      const now = new Date();

      // Seed 50 allergies with distinct server IDs and allergen names
      const allergySeedData = Array.from({ length: 50 }, (_, i) => ({
        id: `local-allergy-${i + 1}`,
        patientId: 'patient-stress-test',
        allergen: `Allergen #${i + 1}`,
        reactionType: i % 2 === 0 ? 'Anaphylaxis' : 'Rash',
        severity: (i % 3 === 0 ? 'Severe' : i % 3 === 1 ? 'Moderate' : 'Mild') as 'Mild' | 'Moderate' | 'Severe',
        management: `Protocol #${i + 1}`,
        isActive: 1,
        serverId: `server-allergy-guid-${(i + 1).toString().padStart(4, '0')}`,
        createdAt: now,
        updatedAt: now,
      }));

      for (const item of allergySeedData) {
        await rawDb.insert(schema.patientAllergies).values(item);
      }

      // Verify all 50 exist in SQLite initially
      const initialCount = await rawDb.select().from(schema.patientAllergies).all();
      expect(initialCount.length).toBe(50);

      // Execute all 50 deletions concurrently via Promise.all on interceptedDb
      const deletePromises = allergySeedData.map((item) =>
        interceptedDb.delete(schema.patientAllergies).where(eq(schema.patientAllergies.id, item.id))
      );
      await Promise.all(deletePromises);

      // 1. Verify all 50 rows were deleted from SQLite
      const remainingRows = await rawDb.select().from(schema.patientAllergies).all();
      expect(remainingRows.length).toBe(0);

      // 2. Verify syncQueue has exactly 50 deletion entries
      const queuedDeletes = await rawDb.select().from(schema.syncQueue).all();
      expect(queuedDeletes.length).toBe(50);

      // 3. Inspect every single queued payload
      for (const q of queuedDeletes) {
        expect(q.entityType).toBe('patient_allergies');
        expect(q.operation).toBe('delete');
        expect(q.payloadJson).not.toBeNull();
        expect(q.payloadJson).not.toBe('{}');

        const payload = JSON.parse(q.payloadJson);
        // Verify entityId in syncQueue matches serverId
        expect(q.entityId).toBe(payload.serverId);
        expect(payload.serverId).toMatch(/^server-allergy-guid-\d{4}$/);
        expect(payload.patientId).toBe('patient-stress-test');
        expect(payload.allergen).toBeDefined();
        expect(payload.allergenName).toBeDefined();
        expect(payload.allergenName).toBe(payload.allergen);
        expect(payload.reactionType).toBeDefined();
        expect(payload.management).toBeDefined();
      }

      // Verify all 50 distinct server IDs were captured without duplicates or omissions
      const capturedServerIds = new Set(queuedDeletes.map(q => q.entityId));
      expect(capturedServerIds.size).toBe(50);
    });

    test('2.2 pre-captures singleton delete row snapshot and serverId when deleted by id', async () => {
      const { rawDb } = buildFullTestDb();
      const interceptedDb = createDbWithInterceptor(rawDb);
      const now = new Date();

      // Seed singleton social history with serverId
      await rawDb.insert(schema.patientSocialHistory).values({
        id: 'soc-hist-1',
        patientId: 'patient-single-del',
        tobaccoStatus: 'Current',
        smokingStatus: 'Current Smoker',
        cigsPerDay: 20,
        alcoholUseLevel: 'Moderate',
        caffeineUse: '4 cups coffee',
        serverId: 'server-soc-hist-guid-999',
        createdAt: now,
        updatedAt: now,
      });

      // Execute deletion by table.id
      await interceptedDb.delete(schema.patientSocialHistory).where(eq(schema.patientSocialHistory.id, 'soc-hist-1'));

      // Verify row removed from SQLite
      const remaining = await rawDb.select().from(schema.patientSocialHistory).where(eq(schema.patientSocialHistory.id, 'soc-hist-1'));
      expect(remaining.length).toBe(0);

      // Verify syncQueue captured row data
      const queueItems = await rawDb.select().from(schema.syncQueue).all();
      expect(queueItems.length).toBe(1);
      expect(queueItems[0].entityType).toBe('patient_social_history');
      expect(queueItems[0].operation).toBe('delete');

      const payload = JSON.parse(queueItems[0].payloadJson);
      expect(payload.serverId).toBe('server-soc-hist-guid-999');
      expect(payload.patientId).toBe('patient-single-del');
      expect(payload.tobaccoStatus).toBe('Current');
      expect(payload.caffeineUse).toBe('4 cups coffee');
    });

    test('2.3 [FAILURE MODE] singleton delete by patientId fails pre-capture because interceptor assumes eq(t.id, entityId)', async () => {
      const { rawDb } = buildFullTestDb();
      const interceptedDb = createDbWithInterceptor(rawDb);
      const now = new Date();

      // Seed singleton social history where id ('soc-hist-2') !== patientId ('patient-single-del-2')
      await rawDb.insert(schema.patientSocialHistory).values({
        id: 'soc-hist-2',
        patientId: 'patient-single-del-2',
        tobaccoStatus: 'Current',
        smokingStatus: 'Current Smoker',
        cigsPerDay: 20,
        alcoholUseLevel: 'Moderate',
        caffeineUse: '4 cups coffee',
        serverId: 'server-soc-hist-guid-888',
        createdAt: now,
        updatedAt: now,
      });

      // Execute deletion by patientId (the natural key for singletons)
      await interceptedDb.delete(schema.patientSocialHistory).where(eq(schema.patientSocialHistory.patientId, 'patient-single-del-2'));

      // The row is removed from SQLite
      const remaining = await rawDb.select().from(schema.patientSocialHistory).where(eq(schema.patientSocialHistory.patientId, 'patient-single-del-2'));
      expect(remaining.length).toBe(0);

      // Inspect syncQueue: because interceptor queried findFirst({ where: eq(t.id, entityId) }) where entityId was 'patient-single-del-2',
      // it matched nothing before deletion. After deletion, the row was gone.
      const queueItems = await rawDb.select().from(schema.syncQueue).all();
      expect(queueItems.length).toBe(1);
      const payload = JSON.parse(queueItems[0].payloadJson);
      
      // Vulnerability confirmation: serverId is null instead of 'server-soc-hist-guid-888'
      // This empirically proves the flaw in createQueryProxy line 650.
      const isVulnerable = payload.serverId === null;
      expect(isVulnerable).toBe(true);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // DIMENSION 3: NON-DESTRUCTIVE HYDRATION (100% LOCAL-ONLY COLUMN RETENTION)
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Dimension 3: Non-Destructive Hydration (100% Local-Only Retention)', () => {

    test('3.1 preserves local-only columns across multiple entities when server returns nulls or omits fields', async () => {
      const { rawDb } = buildFullTestDb();
      const now = new Date();
      const patientId = 'patient-hydration-test';

      // 1. Seed patient demographics
      await rawDb.insert(schema.patients).values({
        id: patientId,
        firstName: 'Andres',
        lastName: 'Bonifacio',
        createdAt: now,
        updatedAt: now,
      });

      // 2. Seed local medication with local-only dosageForm & prescribingPhysician
      await rawDb.insert(schema.patientMedications).values({
        id: 'local-med-1',
        patientId,
        drugName: 'Salbutamol MDI',
        dosage: '100mcg',
        dosageForm: 'Inhaler / Aerosol', // Local-only column
        frequency: '2 puffs PRN',
        prescribingPhysician: 'Dr. Santiago', // Extended column
        indication: 'Bronchospasm',
        isActive: 1,
        serverId: 'srv-med-uuid-1',
        createdAt: now,
        updatedAt: now,
      });

      // 3. Seed emergency contact with local-only email & address
      await rawDb.insert(schema.emergencyContacts).values({
        id: 'local-ec-1',
        patientId,
        name: 'Gregoria de Jesus',
        relationship: 'Spouse',
        phone: '09171112222',
        email: 'oryang@katipunan.ph', // Local-only column
        address: 'Caloocan, Manila',   // Local-only column
        sortOrder: 1,
        serverId: 'srv-ec-uuid-1',
        createdAt: now,
        updatedAt: now,
      });

      // 4. Seed social history with local-only caffeineUse & dailyScreenTime
      await rawDb.insert(schema.patientSocialHistory).values({
        id: 'local-sh-1',
        patientId,
        tobaccoStatus: 'Never',
        alcoholUseLevel: 'None',
        caffeineUse: '4 mugs barako daily', // Local-only
        dailyScreenTime: '6 hours',        // Local-only
        serverId: 'srv-sh-uuid-1',
        createdAt: now,
        updatedAt: now,
      });

      // 5. Seed obstetric profile with local-only deliveryCnt, cycleDuration, regularity
      await rawDb.insert(schema.patientObstetricProfile).values({
        id: 'local-op-1',
        patientId,
        gravida: 3,
        para: 2,
        abortion: 1,
        livingChildren: 2,
        lmp: '2026-01-15',
        cycleLength: 30,
        cycleDuration: 5,        // Local-only
        regularity: 'Regular',   // Local-only
        deliveryCnt: 2,          // Local-only
        deliveryType: 'Normal Spontaneous Delivery', // Local-only
        fullTermDeliveries: 2,   // Local-only
        dysmenorrheaSeverity: 'Mild',
        serverId: 'srv-op-uuid-1',
        createdAt: now,
        updatedAt: now,
      });

      // 6. Seed family history with local-only side, ageAtDeath, causeOfDeath
      await rawDb.insert(schema.patientFamilyHistory).values({
        id: 'local-fh-1',
        patientId,
        condition: 'Myocardial Infarction',
        affectedRelative: 'Father',
        side: 'Paternal',        // Local-only
        ageAtDeath: 62,          // Local-only
        causeOfDeath: 'Acute Coronary Syndrome', // Local-only
        isDeceased: 1,
        serverId: 'srv-fh-uuid-1',
        createdAt: now,
        updatedAt: now,
      });

      // 7. Seed occupation with local-only hazardExposure & workEnvironment
      await rawDb.insert(schema.patientOccupation).values({
        id: 'local-occ-1',
        patientId,
        occupation: 'Military General',
        employer: 'Katipunan Forces',
        workEnvironment: 'Outdoors', // Local-only
        yearsInOccupation: 10,
        hazardExposure: 'Gunfire / Trauma', // Local-only
        serverId: 'srv-occ-uuid-1',
        createdAt: now,
        updatedAt: now,
      });

      // Construct server full-record API payload where local-only fields are null/missing
      const serverPayload: any = {
        demographics: {
          id: patientId,
          firstName: 'Andres',
          lastName: 'Bonifacio',
          consentToShareInfo: true,
        },
        governmentIds: [],
        addresses: [],
        emergencyContacts: [
          {
            id: 'srv-ec-uuid-1',
            clientId: 'local-ec-1',
            fullName: 'Gregoria de Jesus',
            relationship: 'Spouse',
            mobile: '09171112222',
            email: null,   // Server returns null
            address: null, // Server returns null
            isPrimary: true,
            updatedAt: new Date().toISOString(),
          },
        ],
        healthcareProviders: [],
        allergies: [],
        medications: [
          {
            id: 'srv-med-uuid-1',
            clientId: 'local-med-1',
            medicationName: 'Salbutamol MDI',
            dosage: '100mcg',
            route: null,       // Server returns null for route/dosageForm
            frequency: '2 puffs PRN',
            prescribedBy: null, // Server returns null
            purpose: 'Bronchospasm',
            isCurrentlyTaking: true,
            updatedAt: new Date().toISOString(),
          },
        ],
        surgicalHistories: [],
        pastIllnesses: [],
        chronicConditions: [],
        familyHistories: [
          {
            id: 'srv-fh-uuid-1',
            clientId: 'local-fh-1',
            conditionName: 'Myocardial Infarction',
            relation: 'Father',
            isDeceased: true,
            notes: null,
            updatedAt: new Date().toISOString(),
            // side, ageAtDeath, causeOfDeath absent
          },
        ],
        immunizationsSelf: [],
        disabilities: [],
        travelHistories: [],
        contraceptiveHistories: [],
        pregnancies: [],
        socialHistory: {
          id: 'srv-sh-uuid-1',
          smokingStatus: 'Never',
          alcoholUse: 'None',
          updatedAt: new Date().toISOString(),
          // caffeineUse, dailyScreenTime absent
        },
        occupation: {
          id: 'srv-occ-uuid-1',
          occupation: 'Military General',
          employer: 'Katipunan Forces',
          updatedAt: new Date().toISOString(),
          // workEnvironment, hazardExposure absent
        },
        obstetricProfile: {
          id: 'srv-op-uuid-1',
          gravida: 3,
          para: 2,
          abortusCount: 1,
          livingChildren: 2,
          lastMenstrualPeriod: '2026-01-15',
          menstrualCycleLengthDays: 30,
          hasDysmenorrhea: true,
          updatedAt: new Date().toISOString(),
          // deliveryCnt, cycleDuration, regularity, deliveryType absent
        },
        maleReproductive: null,
        dentalVision: null,
        mentalHealthProfile: null,
      };

      // Execute full record hydration
      await hydrateFullRecord(serverPayload);

      // ── VERIFY PRESERVATION IN SQLITE ──────────────────────────────────────

      // 1. Medication dosageForm & prescribingPhysician preserved
      const meds = await rawDb.select().from(schema.patientMedications).where(eq(schema.patientMedications.patientId, patientId));
      expect(meds.length).toBe(1);
      expect(meds[0].dosageForm).toBe('Inhaler / Aerosol');
      expect(meds[0].prescribingPhysician).toBe('Dr. Santiago');

      // 2. Emergency contact email & address preserved
      const ecs = await rawDb.select().from(schema.emergencyContacts).where(eq(schema.emergencyContacts.patientId, patientId));
      expect(ecs.length).toBe(1);
      expect(ecs[0].email).toBe('oryang@katipunan.ph');
      expect(ecs[0].address).toBe('Caloocan, Manila');

      // 3. Social history caffeineUse & dailyScreenTime preserved
      const sh = await rawDb.select().from(schema.patientSocialHistory).where(eq(schema.patientSocialHistory.patientId, patientId));
      expect(sh.length).toBe(1);
      expect(sh[0].caffeineUse).toBe('4 mugs barako daily');
      expect(sh[0].dailyScreenTime).toBe('6 hours');

      // 4. Obstetric profile deliveryCnt, cycleDuration, regularity, deliveryType preserved
      const op = await rawDb.select().from(schema.patientObstetricProfile).where(eq(schema.patientObstetricProfile.patientId, patientId));
      expect(op.length).toBe(1);
      expect(op[0].deliveryCnt).toBe(2);
      expect(op[0].cycleDuration).toBe(5);
      expect(op[0].regularity).toBe('Regular');
      expect(op[0].deliveryType).toBe('Normal Spontaneous Delivery');
      expect(op[0].fullTermDeliveries).toBe(2);

      // 5. Family history side, ageAtDeath, causeOfDeath preserved
      const fh = await rawDb.select().from(schema.patientFamilyHistory).where(eq(schema.patientFamilyHistory.patientId, patientId));
      expect(fh.length).toBe(1);
      expect(fh[0].side).toBe('Paternal');
      expect(fh[0].ageAtDeath).toBe(62);
      expect(fh[0].causeOfDeath).toBe('Acute Coronary Syndrome');

      // 6. Occupation workEnvironment & hazardExposure preserved
      const occ = await rawDb.select().from(schema.patientOccupation).where(eq(schema.patientOccupation.patientId, patientId));
      expect(occ.length).toBe(1);
      expect(occ[0].workEnvironment).toBe('Outdoors');
      expect(occ[0].hazardExposure).toBe('Gunfire / Trauma');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // DIMENSION 4: SINGLETON OFFLINE PROTECTION AGAINST SERVER OVERWRITE
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Dimension 4: Singleton Offline Protection Against Server Overwrite', () => {

    test('4.1 pending offline singleton edit in syncQueue blocks hydrateFullRecord from overwriting local draft', async () => {
      const { rawDb } = buildFullTestDb();
      const now = new Date();
      const patientId = 'patient-singleton-prot';

      // 1. Seed patient
      await rawDb.insert(schema.patients).values({
        id: patientId,
        firstName: 'Jose',
        lastName: 'Rizal',
        createdAt: now,
        updatedAt: now,
      });

      // 2. Local user makes offline edits to social history
      const localSocialDraft = {
        id: 'local-sh-draft',
        patientId,
        tobaccoStatus: 'Current' as const,
        smokingStatus: 'Current Smoker',
        cigsPerDay: 40,
        alcoholUseLevel: 'Heavy',
        caffeineUse: '8 cups espresso',
        createdAt: now,
        updatedAt: now,
      };
      await rawDb.insert(schema.patientSocialHistory).values(localSocialDraft);

      // 3. The write interceptor placed this offline edit in syncQueue
      await rawDb.insert(schema.syncQueue).values({
        id: 'queue-singleton-edit-1',
        entityType: 'patient_social_history',
        entityId: 'local-sh-draft',
        operation: 'update',
        payloadJson: JSON.stringify({
          patientId,
          clientId: 'local-sh-draft',
          smokingStatus: 'Current Smoker',
          cigsPerDay: 40,
        }),
        status: 'pending',
        createdAt: now,
      });

      // 4. Server delivers full-record containing old/stale server values
      const staleServerPayload: any = {
        demographics: {
          id: patientId,
          firstName: 'Jose',
          lastName: 'Rizal',
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
        socialHistory: {
          id: 'server-sh-old-guid',
          smokingStatus: 'Never', // Stale server value!
          cigsPerDay: 0,          // Stale server value!
          alcoholUse: 'None',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
        occupation: null,
        obstetricProfile: null,
        maleReproductive: null,
        dentalVision: null,
        mentalHealthProfile: null,
      };

      // Execute hydration while offline edit is pending in syncQueue
      await hydrateFullRecord(staleServerPayload);

      // 5. Verify local draft was NOT overwritten
      const localRow = await rawDb
        .select()
        .from(schema.patientSocialHistory)
        .where(eq(schema.patientSocialHistory.patientId, patientId));

      expect(localRow.length).toBe(1);
      expect(localRow[0].tobaccoStatus).toBe('Current');
      expect(localRow[0].cigsPerDay).toBe(40);
      expect(localRow[0].caffeineUse).toBe('8 cups espresso');
      expect(localRow[0].id).toBe('local-sh-draft');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // DIMENSION 5: SYNC REJECTION RETENTION & ERROR TRACKING
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Dimension 5: Sync Rejection Retention & Error Tracking in SQLite', () => {

    test('5.1 rejected items transition to status="rejected" with error_message and are not deleted from SQLite', async () => {
      const { rawDb } = buildFullTestDb();
      const now = new Date();

      // Enqueue 4 items in syncQueue
      await rawDb.insert(schema.syncQueue).values([
        {
          id: 'sync-item-1',
          entityType: 'patient_allergies',
          entityId: 'alg-1',
          operation: 'create',
          payloadJson: JSON.stringify({ allergenName: 'Pollen' }),
          status: 'pending',
          createdAt: now,
        },
        {
          id: 'sync-item-2',
          entityType: 'patient_medications',
          entityId: 'med-2',
          operation: 'create',
          payloadJson: JSON.stringify({ medicationName: 'Controlled Opioid' }),
          status: 'pending',
          createdAt: now,
        },
        {
          id: 'sync-item-3',
          entityType: 'patient_chronic_conditions',
          entityId: 'cc-3',
          operation: 'update',
          payloadJson: JSON.stringify({ conditionName: 'Hypertension', isControlled: true }),
          status: 'pending',
          createdAt: now,
        },
        {
          id: 'sync-item-4',
          entityType: 'patient_obstetric_profile',
          entityId: 'ob-4',
          operation: 'update',
          payloadJson: JSON.stringify({ menstrualCycleLengthDays: 120 }),
          status: 'pending',
          createdAt: now,
        },
      ]);

      // Simulated server push response
      const serverPushAck = {
        accepted: 2,
        rejected: 2,
        items: [
          { idempotencyKey: 'sync-item-1', status: 'Accepted' },
          {
            idempotencyKey: 'sync-item-2',
            status: 'Rejected',
            conflictDetail: 'S2 dangerous drug prescription requires physician PRC credential and cannot be self-enqueued',
          },
          { idempotencyKey: 'sync-item-3', status: 'Accepted' },
          {
            idempotencyKey: 'sync-item-4',
            status: 'Rejected',
            conflictDetail: 'Cycle length 120 exceeds allowable clinical range (10-90 days)',
          },
        ],
      };

      // Execute exact partition and update logic used in syncService.executePushSync
      const acceptedIds: string[] = [];
      const resultMap = new Map<string, any>();
      for (const res of serverPushAck.items) {
        if (res.idempotencyKey) {
          resultMap.set(res.idempotencyKey, res);
        }
      }

      const pendingItems = await rawDb.select().from(schema.syncQueue).all();
      for (const item of pendingItems) {
        const serverResult = resultMap.get(item.id);
        if (serverResult && serverResult.status === 'Rejected') {
          const errorMsg = serverResult.conflictDetail || 'Rejected by server';
          await rawDb
            .update(schema.syncQueue)
            .set({
              status: 'rejected',
              errorMessage: errorMsg,
            })
            .where(eq(schema.syncQueue.id, item.id));
        } else {
          acceptedIds.push(item.id);
        }
      }

      if (acceptedIds.length > 0) {
        await rawDb.delete(schema.syncQueue).where(inArray(schema.syncQueue.id, acceptedIds));
      }

      // Verify syncQueue contents in SQLite
      const remainingItems = await rawDb.select().from(schema.syncQueue).all();

      // Exactly 2 items remain
      expect(remainingItems.length).toBe(2);

      // Verify accepted items 1 and 3 are deleted
      expect(remainingItems.find(q => q.id === 'sync-item-1')).toBeUndefined();
      expect(remainingItems.find(q => q.id === 'sync-item-3')).toBeUndefined();

      // Verify rejected items 2 and 4 are retained with status='rejected' and exact error messages
      const rej2 = remainingItems.find(q => q.id === 'sync-item-2');
      expect(rej2).toBeDefined();
      expect(rej2!.status).toBe('rejected');
      expect(rej2!.errorMessage).toBe('S2 dangerous drug prescription requires physician PRC credential and cannot be self-enqueued');

      const rej4 = remainingItems.find(q => q.id === 'sync-item-4');
      expect(rej4).toBeDefined();
      expect(rej4!.status).toBe('rejected');
      expect(rej4!.errorMessage).toBe('Cycle length 120 exceeds allowable clinical range (10-90 days)');

      // Verify that subsequent queries for pending or failed items do NOT pick up rejected items
      const nextPending = await rawDb
        .select()
        .from(schema.syncQueue)
        .where(inArray(schema.syncQueue.status, ['pending', 'failed']));
      expect(nextPending.length).toBe(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // DIMENSION 6: ADVERSARIAL RECONCILIATION & OFFLINE CREATE RETENTION
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Dimension 6: Adversarial Reconciliation & Offline Create Retention', () => {

    test('6.1 reconcileListEntity does NOT delete pending local additions not yet on server', async () => {
      const { rawDb } = buildFullTestDb();
      const now = new Date();
      const patientId = 'patient-recon-pending';

      // 1. Existing synced allergy on local and server
      await rawDb.insert(schema.patientAllergies).values({
        id: 'alg-synced-1',
        patientId,
        allergen: 'Pollen',
        severity: 'Mild',
        isActive: 1,
        serverId: 'srv-pollen-1',
        createdAt: now,
        updatedAt: now,
        syncedAt: now,
      });

      // 2. Newly added offline allergy created while offline (in SQLite, and in pendingEntityIds)
      await rawDb.insert(schema.patientAllergies).values({
        id: 'alg-offline-draft-1',
        patientId,
        allergen: 'Dust Mites',
        severity: 'Moderate',
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      });

      // 3. Stale local allergy that was deleted on the server (not pending, not on server)
      await rawDb.insert(schema.patientAllergies).values({
        id: 'alg-stale-1',
        patientId,
        allergen: 'Old Allergen',
        severity: 'Mild',
        isActive: 1,
        serverId: 'srv-old-allergen',
        createdAt: now,
        updatedAt: now,
        syncedAt: now,
      });

      // Server only returns the one synced item
      const serverItems = [
        {
          id: 'srv-pollen-1',
          allergenName: 'Pollen',
          severity: 'Mild',
          isActive: true,
          updatedAt: now.toISOString(),
        },
      ];

      // pendingEntityIds contains the offline draft
      const pendingEntityIds = new Set(['alg-offline-draft-1']);

      await reconcileListEntity(
        schema.patientAllergies,
        patientId,
        serverItems,
        pendingEntityIds,
        (item: any, _i: number, existing?: any) => ({
          id: existing?.id ?? item.id,
          patientId,
          allergen: item.allergenName,
          severity: item.severity,
          isActive: item.isActive ? 1 : 0,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          syncedAt: now,
        }),
        rawDb
      );

      // Verify SQLite state:
      const rows = await rawDb.select().from(schema.patientAllergies).where(eq(schema.patientAllergies.patientId, patientId));
      expect(rows.length).toBe(2);

      // Synced row remains
      expect(rows.find(r => r.id === 'alg-synced-1')).toBeDefined();

      // Offline draft is PROTECTED from deletion
      expect(rows.find(r => r.id === 'alg-offline-draft-1')).toBeDefined();

      // Stale row WAS pruned
      expect(rows.find(r => r.id === 'alg-stale-1')).toBeUndefined();
    });

    test('6.2 client ID remapping removes local client row when server assigns new canonical ID', async () => {
      const { rawDb } = buildFullTestDb();
      const now = new Date();
      const patientId = 'patient-remap';

      const clientTempId = '00000000-0000-4000-8000-0000000000aa';
      const serverCanonicalId = '00000000-0000-4000-8000-0000000000bb';

      // Insert temporary client-created row in SQLite
      await rawDb.insert(schema.patientAllergies).values({
        id: clientTempId,
        patientId,
        allergen: 'Latex',
        severity: 'Severe',
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      });

      // Server returns canonical row referencing clientId
      const serverItems = [
        {
          id: serverCanonicalId,
          clientId: clientTempId,
          allergenName: 'Latex',
          severity: 'Severe',
          isActive: true,
          updatedAt: now.toISOString(),
        },
      ];

      await reconcileListEntity(
        schema.patientAllergies,
        patientId,
        serverItems,
        new Set(),
        (item: any, _i: number, existing?: any) => ({
          id: item.id,
          patientId,
          allergen: item.allergenName,
          severity: item.severity,
          isActive: item.isActive ? 1 : 0,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          syncedAt: now,
        }),
        rawDb
      );

      // Verify no duplicate rows
      const rows = await rawDb.select().from(schema.patientAllergies).where(eq(schema.patientAllergies.patientId, patientId));
      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(serverCanonicalId);
      expect(rows[0].serverId).toBe(serverCanonicalId);
      expect(rows.find(r => r.id === clientTempId)).toBeUndefined();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // DIMENSION 7: BOUNDARY VALUE ROBUSTNESS & UNEXPECTED INPUTS
  // ═════════════════════════════════════════════════════════════════════════════
  describe('Dimension 7: Boundary Value Robustness & Unexpected Inputs', () => {

    test('7.1 handles empty objects, null fields, and unknown controlStatus values cleanly', () => {
      const empty = translateLocalToSyncPayload('patient_allergies', {});
      expect(empty).toEqual({});

      // Unknown control status defaults to boolean false
      const weirdStatus = translateLocalToSyncPayload('patient_chronic_conditions', {
        controlStatus: 'Borderline Inadequate',
      });
      expect(weirdStatus.isControlled).toBe(false);

      // Falsy control status
      const emptyStatus = translateLocalToSyncPayload('patient_chronic_conditions', {
        controlStatus: '',
      });
      expect(emptyStatus.isControlled).toBe(false);

      // Boolean isActive with string truthy / falsy
      const strTrue = translateLocalToSyncPayload('patient_allergies', { isActive: 'true' });
      expect(strTrue.isActive).toBe(true);

      const numZero = translateLocalToSyncPayload('patient_allergies', { isActive: 0 });
      expect(numZero.isActive).toBe(false);

      // Unknown table name returns shallow copy untouched
      const unknown = translateLocalToSyncPayload('unknown_table_xyz', { foo: 'bar' });
      expect(unknown.foo).toBe('bar');
    });
  });
});

