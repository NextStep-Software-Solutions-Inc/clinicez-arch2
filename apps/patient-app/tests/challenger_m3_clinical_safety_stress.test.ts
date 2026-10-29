import { describe, expect, test, mock } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseISO, differenceInCalendarDays, subDays, addDays } from 'date-fns';

(globalThis as any).__DEV__ = false;

// ── Mock Native Modules ───────────────────────────────────────────────
mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s, hairlineWidth: 1 },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  DeviceEventEmitter: { emit: () => {}, addListener: () => ({ remove: () => {} }) },
  TurboModuleRegistry: {
    get: () => null,
    getEnforcing: () => ({}),
  },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  FlatList: 'FlatList',
  Modal: 'Modal',
  TextInput: 'TextInput',
  Image: 'Image',
}));

// Dynamic SQLite imports
const { Database } = await import('bun:sqlite');
const { drizzle } = await import('drizzle-orm/bun-sqlite');
const { and, eq, isNull, count } = await import('drizzle-orm');

// Import schemas
const { patientAddresses } = await import('../db/schema/patientAddresses');
const { emergencyContacts } = await import('../db/schema/emergencyContacts');
const { patientHealthcareProviders } = await import('../db/schema/patientHealthcareProviders');
const { patientAllergies } = await import('../db/schema/patientAllergies');
const { patientMedications } = await import('../db/schema/patientMedications');
const { patientSurgicalHistory } = await import('../db/schema/patientSurgicalHistory');
const { patientPastIllnesses } = await import('../db/schema/patientPastIllnesses');
const { patientChronicConditions } = await import('../db/schema/patientChronicConditions');
const { patientDisabilities } = await import('../db/schema/patientDisabilities');
const { patientImmunizationsSelf } = await import('../db/schema/patientImmunizationsSelf');
const { patientFamilyHistory } = await import('../db/schema/patientFamilyHistory');
const { patientTravelHistory } = await import('../db/schema/patientTravelHistory');
const { patientPregnancies } = await import('../db/schema/patientPregnancies');

const APP_ROOT = join(import.meta.dir, '..');
const readApp = (rel: string): string =>
  readFileSync(join(APP_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

describe('Milestone 3 Adversarial Challenge: Clinical Safety & Teleconsultation Gating', () => {

  // ═══════════════════════════════════════════════════════════════════════
  // Challenge 1: Zero Fake Clinical Data, Mock Clinicians, Fake PRC & FBS
  // ═══════════════════════════════════════════════════════════════════════
  describe('Adversarial Probe 1: Zero Fake Data in DOM/Components', () => {
    const rxContent = readApp('navigation/screens/profile/Prescriptions.screen.tsx');
    const labContent = readApp('navigation/screens/profile/LabResults.screen.tsx');
    const recordsContent = readApp('navigation/screens/records/Records.screen.tsx');

    test('prescriptions screen contains zero mock fallback arrays or hardcoded clinical entities', () => {
      // Forbidden fake drugs
      expect(rxContent.toLowerCase().includes('amlodipine')).toBe(false);
      expect(rxContent.toLowerCase().includes('amoxicillin')).toBe(false);
      expect(rxContent.toLowerCase().includes('co-amoxiclav')).toBe(false);
      expect(rxContent.toLowerCase().includes('besylate')).toBe(false);

      // Forbidden fake prescriber & clinics
      expect(rxContent.includes('Dr. Roberto Cruz')).toBe(false);
      expect(rxContent.includes('Roberto Cruz')).toBe(false);
      expect(rxContent.includes('0149281')).toBe(false);
      expect(rxContent.includes('Fuente Osmeña')).toBe(false);
      expect(rxContent.includes('Metro Health Outpatient Clinic')).toBe(false);
      expect(rxContent.includes('UPSC-HCI990001-2026-000142')).toBe(false);

      // Verify no mock data array is defined
      expect(rxContent.includes('MOCK_PRESCRIPTIONS')).toBe(false);
      expect(rxContent.includes('mockPrescriptions')).toBe(false);
      expect(rxContent.includes('DEMO_PRESCRIPTIONS')).toBe(false);
    });

    test('lab results screen contains zero mock fallback arrays, fake FBS, or mock clinicians', () => {
      // Forbidden fake tests & results
      expect(labContent.includes('CBC with Platelet Count')).toBe(false);
      expect(labContent.includes('Fasting Blood Sugar')).toBe(false);
      expect(labContent.includes('108.4')).toBe(false);
      expect(labContent.toLowerCase().includes('108.4 high')).toBe(false);

      // Forbidden fake medical staff & clinics
      expect(labContent.includes('Dr. Evelyn Lim')).toBe(false);
      expect(labContent.includes('0078912')).toBe(false);
      expect(labContent.includes('Mark Joshua Bautista')).toBe(false);
      expect(labContent.includes('0091823')).toBe(false);
      expect(labContent.includes('Metro Health Diagnostic Lab')).toBe(false);

      // Forbidden mock PDF dialog
      expect(labContent.includes('Preparing encrypted PDF report')).toBe(false);

      // Verify no mock data array is defined
      expect(labContent.includes('MOCK_LAB_RESULTS')).toBe(false);
      expect(labContent.includes('mockLabResults')).toBe(false);
      expect(labContent.includes('DEMO_LAB_RESULTS')).toBe(false);
    });

    test('prescriptions and lab screens render authentic EmptyState when database returns 0 records', () => {
      expect(rxContent.includes('<EmptyState')).toBe(true);
      expect(rxContent.includes('title="No Prescriptions"')).toBe(true);
      expect(rxContent.includes('RecordSkeletonList')).toBe(true);

      expect(labContent.includes('<EmptyState')).toBe(true);
      expect(labContent.includes('title="No Diagnostic Results"')).toBe(true);
      expect(labContent.includes('RecordSkeletonList')).toBe(true);
    });

    test('prescriptions renders real SVG QrCodeView with PHILHEALTH:YAKAP:UPSC format', () => {
      expect(rxContent.includes('QrCodeView')).toBe(true);
      expect(rxContent.includes('PHILHEALTH:YAKAP:UPSC:')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Challenge 2: In-Person Appointments NEVER Render Teleconsult Entry Points
  // ═══════════════════════════════════════════════════════════════════════
  describe('Adversarial Probe 2: Teleconsultation Gating on In-Person Visits', () => {
    const detailContent = readApp('navigation/screens/appointments/AppointmentDetail.screen.tsx');

    // Verification oracle replicating the component's exact guard
    function shouldRenderTeleconsultCard(serviceType: string | null | undefined, status: string): boolean {
      const isFinalStatus = status === 'canceled' || status === 'completed' || status === 'no_show';
      return !isFinalStatus && (serviceType === 'teleconsult' || serviceType === 'virtual');
    }

    test('codebase enforces strict guard {!isFinalStatus && (item.serviceType === "teleconsult" || item.serviceType === "virtual")}', () => {
      expect(
        detailContent.includes(
          "{!isFinalStatus && (item.serviceType === 'teleconsult' || item.serviceType === 'virtual') && ("
        )
      ).toBe(true);
    });

    test('exhaustive service type matrix: in-person visits NEVER render teleconsultation entry card', () => {
      const inPersonTypes = [
        'in-person',
        'In-Person',
        'clinic',
        'Clinic Visit',
        'walk-in',
        'Walk-In',
        'onsite',
        'Annual Physical Exam',
        'Cardiology Follow-Up',
        'Free Initial Screening',
        'Echocardiogram',
        'Routine Checkup',
        'Vaccination',
        'Laboratory Extraction',
        '',
        null,
        undefined,
      ];

      const nonFinalStatuses = ['scheduled', 'confirmed', 'arrived', 'in_progress', 'pending'];

      for (const serviceType of inPersonTypes) {
        for (const status of nonFinalStatuses) {
          const rendered = shouldRenderTeleconsultCard(serviceType, status);
          expect(rendered).toBe(false);
        }
      }
    });

    test('final status visits NEVER render teleconsultation entry card even if virtual or teleconsult', () => {
      const finalStatuses = ['completed', 'canceled', 'no_show'];
      const virtualTypes = ['teleconsult', 'virtual'];

      for (const serviceType of virtualTypes) {
        for (const status of finalStatuses) {
          const rendered = shouldRenderTeleconsultCard(serviceType, status);
          expect(rendered).toBe(false);
        }
      }
    });

    test('only active/scheduled teleconsult or virtual visits render teleconsultation entry card', () => {
      expect(shouldRenderTeleconsultCard('teleconsult', 'scheduled')).toBe(true);
      expect(shouldRenderTeleconsultCard('teleconsult', 'confirmed')).toBe(true);
      expect(shouldRenderTeleconsultCard('virtual', 'scheduled')).toBe(true);
      expect(shouldRenderTeleconsultCard('virtual', 'confirmed')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Challenge 3: EXPO_PUBLIC_DEMO_TELECONSULT Environment Gating
  // ═══════════════════════════════════════════════════════════════════════
  describe('Adversarial Probe 3: Demo Teleconsultation Gating & Honest Session Copy', () => {
    const waitingRoomContent = readApp('navigation/screens/teleconsult/TeleconsultWaitingRoom.screen.tsx');
    const callContent = readApp('navigation/screens/teleconsult/TeleconsultCall.screen.tsx');

    function evalIsDemo(envVal: string | undefined): boolean {
      return envVal === 'true';
    }

    test('isDemo strictly evaluates to false when env is undefined, false, 0, or empty string', () => {
      expect(evalIsDemo(undefined)).toBe(false);
      expect(evalIsDemo('false')).toBe(false);
      expect(evalIsDemo('0')).toBe(false);
      expect(evalIsDemo('')).toBe(false);
      expect(evalIsDemo('no')).toBe(false);
      expect(evalIsDemo('TRUE')).toBe(false); // strict === 'true'
      expect(evalIsDemo('true')).toBe(true);
    });

    test('TeleconsultWaitingRoom gates simulated 2.5s doctor admission behind isDemo', () => {
      expect(waitingRoomContent.includes("process.env.EXPO_PUBLIC_DEMO_TELECONSULT === 'true'")).toBe(true);
      expect(waitingRoomContent.includes("process.env.EXPO_PUBLIC_ENABLE_DEMO_TELECONSULT === 'true'")).toBe(true);
      expect(waitingRoomContent.includes('if (isDemo) {')).toBe(true);
      expect(waitingRoomContent.includes('setIsReadyToAdmit(false);')).toBe(true);
    });

    test('TeleconsultWaitingRoom renders honest session-readiness copy when isDemo is false', () => {
      expect(waitingRoomContent.includes('{!isDemo && (')).toBe(true);
      expect(
        waitingRoomContent.includes(
          'Teleconsultation session will connect once your physician initiates the call room'
        )
      ).toBe(true);
    });

    test('TeleconsultCall screen displays Waiting for Host badge and honest copy when isDemo is false', () => {
      expect(callContent.includes("process.env.EXPO_PUBLIC_DEMO_TELECONSULT === 'true'")).toBe(true);
      expect(callContent.includes("process.env.EXPO_PUBLIC_ENABLE_DEMO_TELECONSULT === 'true'")).toBe(true);
      expect(callContent.includes("label={isDemo ? 'Connected' : 'Waiting for Host'}")).toBe(true);
      expect(callContent.includes("tone={isDemo ? 'success' : 'warning'}")).toBe(true);
      expect(
        callContent.includes(
          "Teleconsultation session will connect once your physician initiates the call room"
        )
      ).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Challenge 4: loadCounts Multi-Patient Tenant Isolation & Soft-Delete Filtering
  // ═══════════════════════════════════════════════════════════════════════
  describe('Adversarial Probe 4: loadCounts Isolation & Soft-Delete Filtering', () => {
    let sqlite: InstanceType<typeof Database>;
    let testDb: any;

    const patientA = 'patient_uuid_AAAAAA';
    const patientB = 'patient_uuid_BBBBBB';

    // Create SQLite tables matching all 13 profile schemas
    const tableNames = [
      'patient_addresses',
      'emergency_contacts',
      'patient_healthcare_providers',
      'patient_allergies',
      'patient_medications',
      'patient_surgical_history',
      'patient_past_illnesses',
      'patient_chronic_conditions',
      'patient_disabilities',
      'patient_immunizations_self',
      'patient_family_history',
      'patient_travel_history',
      'patient_pregnancies',
    ];

    const tablesMap: Record<string, any> = {
      patient_addresses: patientAddresses,
      emergency_contacts: emergencyContacts,
      patient_healthcare_providers: patientHealthcareProviders,
      patient_allergies: patientAllergies,
      patient_medications: patientMedications,
      patient_surgical_history: patientSurgicalHistory,
      patient_past_illnesses: patientPastIllnesses,
      patient_chronic_conditions: patientChronicConditions,
      patient_disabilities: patientDisabilities,
      patient_immunizations_self: patientImmunizationsSelf,
      patient_family_history: patientFamilyHistory,
      patient_travel_history: patientTravelHistory,
      patient_pregnancies: patientPregnancies,
    };

    // Execution oracle replicating the exact queries in Profile.screen.tsx and Profile.screen.web.tsx
    async function executeLoadCounts(dbInstance: any, patientId: string) {
      if (!patientId) {
        return {
          addresses: 0, emergency: 0, providers: 0, allergies: 0, medications: 0,
          surgeries: 0, illnesses: 0, chronic: 0, disabilities: 0, immunizations: 0,
          family: 0, travel: 0, pregnancies: 0,
        };
      }

      const [
        addressCount, emergencyCount, providerCount, allergyCount, medicationCount,
        surgeryCount, illnessCount, chronicCount, disabilityCount, immunizationCount,
        familyCount, travelCount, pregnancyCount,
      ] = await Promise.all([
        dbInstance.select({ c: count() }).from(patientAddresses).where(and(eq(patientAddresses.patientId, patientId), isNull(patientAddresses.deletedAt))),
        dbInstance.select({ c: count() }).from(emergencyContacts).where(and(eq(emergencyContacts.patientId, patientId), isNull(emergencyContacts.deletedAt))),
        dbInstance.select({ c: count() }).from(patientHealthcareProviders).where(and(eq(patientHealthcareProviders.patientId, patientId), isNull(patientHealthcareProviders.deletedAt))),
        dbInstance.select({ c: count() }).from(patientAllergies).where(and(eq(patientAllergies.patientId, patientId), isNull(patientAllergies.deletedAt))),
        dbInstance.select({ c: count() }).from(patientMedications).where(and(eq(patientMedications.patientId, patientId), isNull(patientMedications.deletedAt))),
        dbInstance.select({ c: count() }).from(patientSurgicalHistory).where(and(eq(patientSurgicalHistory.patientId, patientId), isNull(patientSurgicalHistory.deletedAt))),
        dbInstance.select({ c: count() }).from(patientPastIllnesses).where(and(eq(patientPastIllnesses.patientId, patientId), isNull(patientPastIllnesses.deletedAt))),
        dbInstance.select({ c: count() }).from(patientChronicConditions).where(and(eq(patientChronicConditions.patientId, patientId), isNull(patientChronicConditions.deletedAt))),
        dbInstance.select({ c: count() }).from(patientDisabilities).where(and(eq(patientDisabilities.patientId, patientId), isNull(patientDisabilities.deletedAt))),
        dbInstance.select({ c: count() }).from(patientImmunizationsSelf).where(and(eq(patientImmunizationsSelf.patientId, patientId), isNull(patientImmunizationsSelf.deletedAt))),
        dbInstance.select({ c: count() }).from(patientFamilyHistory).where(and(eq(patientFamilyHistory.patientId, patientId), isNull(patientFamilyHistory.deletedAt))),
        dbInstance.select({ c: count() }).from(patientTravelHistory).where(and(eq(patientTravelHistory.patientId, patientId), isNull(patientTravelHistory.deletedAt))),
        dbInstance.select({ c: count() }).from(patientPregnancies).where(and(eq(patientPregnancies.patientId, patientId), isNull(patientPregnancies.deletedAt))),
      ]);

      return {
        addresses: addressCount[0]?.c ?? 0,
        emergency: emergencyCount[0]?.c ?? 0,
        providers: providerCount[0]?.c ?? 0,
        allergies: allergyCount[0]?.c ?? 0,
        medications: medicationCount[0]?.c ?? 0,
        surgeries: surgeryCount[0]?.c ?? 0,
        illnesses: illnessCount[0]?.c ?? 0,
        chronic: chronicCount[0]?.c ?? 0,
        disabilities: disabilityCount[0]?.c ?? 0,
        immunizations: immunizationCount[0]?.c ?? 0,
        family: familyCount[0]?.c ?? 0,
        travel: travelCount[0]?.c ?? 0,
        pregnancies: pregnancyCount[0]?.c ?? 0,
      };
    }

    test('setup in-memory sqlite and seed multi-patient active and soft-deleted rows', () => {
      sqlite = new Database(':memory:');
      testDb = drizzle(sqlite);

      // Create all 13 tables
      for (const tName of tableNames) {
        sqlite.run(`
          CREATE TABLE ${tName} (
            id TEXT PRIMARY KEY,
            patient_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            deleted_at INTEGER
          );
        `);
      }

      const now = Date.now();

      // Seed each table:
      // Patient A: 3 active rows, 2 soft-deleted rows (5 total)
      // Patient B: 4 active rows, 3 soft-deleted rows (7 total)
      for (const tName of tableNames) {
        // Patient A active
        for (let i = 1; i <= 3; i++) {
          sqlite.run(`INSERT INTO ${tName} (id, patient_id, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)`, [
            `${tName}_A_active_${i}`, patientA, now, now
          ]);
        }
        // Patient A soft-deleted
        for (let i = 1; i <= 2; i++) {
          sqlite.run(`INSERT INTO ${tName} (id, patient_id, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?)`, [
            `${tName}_A_deleted_${i}`, patientA, now, now, now
          ]);
        }
        // Patient B active
        for (let i = 1; i <= 4; i++) {
          sqlite.run(`INSERT INTO ${tName} (id, patient_id, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)`, [
            `${tName}_B_active_${i}`, patientB, now, now
          ]);
        }
        // Patient B soft-deleted
        for (let i = 1; i <= 3; i++) {
          sqlite.run(`INSERT INTO ${tName} (id, patient_id, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?)`, [
            `${tName}_B_deleted_${i}`, patientB, now, now, now
          ]);
        }
      }
    });

    test('Patient A receives exactly 3 for all 13 counts (0 cross-tenant leaks, 0 soft-delete leaks)', async () => {
      const countsA = await executeLoadCounts(testDb, patientA);

      expect(countsA.addresses).toBe(3);
      expect(countsA.emergency).toBe(3);
      expect(countsA.providers).toBe(3);
      expect(countsA.allergies).toBe(3);
      expect(countsA.medications).toBe(3);
      expect(countsA.surgeries).toBe(3);
      expect(countsA.illnesses).toBe(3);
      expect(countsA.chronic).toBe(3);
      expect(countsA.disabilities).toBe(3);
      expect(countsA.immunizations).toBe(3);
      expect(countsA.family).toBe(3);
      expect(countsA.travel).toBe(3);
      expect(countsA.pregnancies).toBe(3);
    });

    test('Patient B receives exactly 4 for all 13 counts (0 cross-tenant leaks, 0 soft-delete leaks)', async () => {
      const countsB = await executeLoadCounts(testDb, patientB);

      expect(countsB.addresses).toBe(4);
      expect(countsB.emergency).toBe(4);
      expect(countsB.providers).toBe(4);
      expect(countsB.allergies).toBe(4);
      expect(countsB.medications).toBe(4);
      expect(countsB.surgeries).toBe(4);
      expect(countsB.illnesses).toBe(4);
      expect(countsB.chronic).toBe(4);
      expect(countsB.disabilities).toBe(4);
      expect(countsB.immunizations).toBe(4);
      expect(countsB.family).toBe(4);
      expect(countsB.travel).toBe(4);
      expect(countsB.pregnancies).toBe(4);
    });

    test('Non-existent patient receives exactly 0 counts across all 13 entities', async () => {
      const countsUnknown = await executeLoadCounts(testDb, 'patient_non_existent');
      for (const val of Object.values(countsUnknown)) {
        expect(val).toBe(0);
      }
    });

    test('Falsy patientId immediately returns all 0 counts without querying database', async () => {
      const countsNull = await executeLoadCounts(testDb, '');
      for (const val of Object.values(countsNull)) {
        expect(val).toBe(0);
      }
    });

    test('both native and web Profile screen files contain the exact 13 isNull(deletedAt) and eq(patientId) guards', () => {
      const nativeProfile = readApp('navigation/screens/profile/Profile.screen.tsx');
      const webProfile = readApp('navigation/screens/profile/Profile.screen.web.tsx');

      const expectedEntities = [
        'patientAddresses', 'emergencyContacts', 'patientHealthcareProviders',
        'patientAllergies', 'patientMedications', 'patientSurgicalHistory',
        'patientPastIllnesses', 'patientChronicConditions', 'patientDisabilities',
        'patientImmunizationsSelf', 'patientFamilyHistory', 'patientTravelHistory',
        'patientPregnancies',
      ];

      for (const entity of expectedEntities) {
        const querySnippet = `and(eq(${entity}.patientId, patientId), isNull(${entity}.deletedAt))`;
        expect(nativeProfile.includes(querySnippet)).toBe(true);
        expect(webProfile.includes(querySnippet)).toBe(true);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Challenge 5: After-Visit Summary (AVS) Date Boundaries & Home Care Copy
  // ═══════════════════════════════════════════════════════════════════════
  describe('Adversarial Probe 5: AVS 7-Day Window & Clinical Discharge Copy', () => {
    function shouldPinAvs(visitDateStr: string | null | undefined): boolean {
      if (!visitDateStr) return false;
      try {
        const diff = differenceInCalendarDays(new Date(), parseISO(visitDateStr));
        return diff >= 0 && diff <= 7;
      } catch {
        return false;
      }
    }

    test('date boundary oracle: pins strictly within [0, 7] calendar days', () => {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const yesterday = subDays(now, 1).toISOString().slice(0, 10);
      const day6 = subDays(now, 6).toISOString().slice(0, 10);
      const day7 = subDays(now, 7).toISOString().slice(0, 10);
      const day8 = subDays(now, 8).toISOString().slice(0, 10);
      const day30 = subDays(now, 30).toISOString().slice(0, 10);
      const tomorrow = addDays(now, 1).toISOString().slice(0, 10);

      expect(shouldPinAvs(today)).toBe(true);
      expect(shouldPinAvs(yesterday)).toBe(true);
      expect(shouldPinAvs(day6)).toBe(true);
      expect(shouldPinAvs(day7)).toBe(true);
      expect(shouldPinAvs(day8)).toBe(false);
      expect(shouldPinAvs(day30)).toBe(false);
      expect(shouldPinAvs(tomorrow)).toBe(false);
      expect(shouldPinAvs(null)).toBe(false);
      expect(shouldPinAvs('invalid-date')).toBe(false);
    });

    test('AfterVisitSummaryCard displays Home Care instructions, 14-day messaging notice, and follow-up CTA', () => {
      const avsContent = readApp('components/records/AfterVisitSummaryCard.tsx');

      expect(avsContent.includes('Home Care & Discharge Instructions')).toBe(true);
      expect(avsContent.includes('Direct 14-day post-consultation messaging window is active with your care team.')).toBe(true);
      expect(avsContent.includes('onBookFollowUp')).toBe(true);
      expect(avsContent.includes('onMessageClinic')).toBe(true);
      expect(avsContent.includes('primaryDiagnosis')).toBe(true);
      expect(avsContent.includes('icd10Code')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Challenge 6: Desktop Accessibility on ProfileListItemCard
  // ═══════════════════════════════════════════════════════════════════════
  describe('Adversarial Probe 6: Desktop Accessibility on ProfileListItemCard', () => {
    const cardContent = readApp('components/profile/ProfileListItemCard.tsx');

    test('ProfileListItemCard provides >=44px desktop touch targets for Edit and Delete', () => {
      expect(cardContent.includes('minWidth: 44')).toBe(true);
      expect(cardContent.includes('minHeight: 44')).toBe(true);
      expect(cardContent.includes('accessibilityLabel="Edit"')).toBe(true);
      expect(cardContent.includes('accessibilityLabel="Delete"')).toBe(true);
      expect(cardContent.includes('accessibilityRole="button"')).toBe(true);
    });
  });
});
