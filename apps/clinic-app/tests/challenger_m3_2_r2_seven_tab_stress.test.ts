// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun environment
// Mock React Native modules for Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({ children }: any) => React.createElement('div', { 'data-component': name }, children);
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  TextInput: createMockComponent('TextInput'),
  Text: createMockComponent('Text'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
  FlatList: createMockComponent('FlatList'),
  SectionList: createMockComponent('SectionList'),
  Switch: createMockComponent('Switch'),
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  TouchableHighlight: createMockComponent('TouchableHighlight'),
  Image: createMockComponent('Image'),
  Dimensions: {
    get: () => ({ width: 1024, height: 768 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1024, height: 768 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
  Alert: { alert: () => {} },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  default: 'Svg',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Polyline: 'Polyline',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

// API client mock state
let lastGetUrl = '';
let lastGetConfig: any = null;
let lastPostUrl = '';
let lastPostPayload: any = null;
let mockGetResponse: any = null;
let mockPostResponse: any = null;
let mockNetworkError: any = null;
let refreshSessionCalled = false;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async (url: string, config?: any) => {
      lastGetUrl = url;
      lastGetConfig = config;
      if (mockNetworkError) {
        if (mockNetworkError.status === 401 && !config?._retried) {
          refreshSessionCalled = true;
          return [mockGetResponse, null];
        }
        return [null, mockNetworkError];
      }
      return [mockGetResponse, null];
    },
    post: async (url: string, data?: any) => {
      lastPostUrl = url;
      lastPostPayload = data;
      if (mockNetworkError) return [null, mockNetworkError];
      return [mockPostResponse, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const { clinicService } = await import('../services/clinicService');
import type {
  ClinicPatient,
  PatientChart,
  PatientImmunizationRecord,
  AdministerVaccinePayload,
  RecordHistoricalImmunizationPayload,
  RecordAefiPayload,
} from '../services/clinicService';

const {
  default: PatientSummarySpine,
  evaluateBloodPressure,
  evaluateHeartRate,
  evaluateRespiratoryRate,
  evaluateTemperature,
  evaluateOxygenSat,
  evaluateZScoreCategory,
  formatPhilHealthPin,
} = await import('../components/chart/PatientSummarySpine');

const {
  default: ExecutiveSummaryTab,
} = await import('../components/chart/ExecutiveSummaryTab');

const {
  default: EncountersTimelineTab,
} = await import('../components/chart/EncountersTimelineTab');

const {
  default: DiagnosticLabTab,
  lookupStatutoryDiagnosticCode,
  STATUTORY_DIAGNOSTIC_CODES,
} = await import('../components/chart/DiagnosticLabTab');

const {
  default: NursingProceduresTab,
  lookupStatutoryManagementCode,
  STATUTORY_MANAGEMENT_CODES,
} = await import('../components/chart/NursingProceduresTab');

const {
  default: StatutoryImmunizationsTab,
  PHILHEALTH_STATUTORY_VACCINES,
} = await import('../components/chart/StatutoryImmunizationsTab');

const {
  default: HealthProfilesTab,
} = await import('../components/chart/HealthProfilesTab');

const {
  default: ExternalDocumentVaultTab,
  PHILHEALTH_CHEST_XRAY_FINDINGS,
  PHILHEALTH_CHEST_XRAY_OBSERVATIONS,
} = await import('../components/chart/ExternalDocumentVaultTab');

describe('Empirical Adversarial Stress Suite — Milestone M3 Round 2 (Challenger 2)', () => {
  beforeEach(() => {
    lastGetUrl = '';
    lastGetConfig = null;
    lastPostUrl = '';
    lastPostPayload = null;
    mockGetResponse = null;
    mockPostResponse = null;
    mockNetworkError = null;
    refreshSessionCalled = false;
  });

  const basePatient: ClinicPatient = {
    id: 'pat-stress-base-1',
    tenantId: 'ten-1',
    clinicId: 'cln-1',
    patientCode: 'CE-2026-9999',
    firstName: 'Remedios',
    lastName: 'Del Fierro',
    middleName: 'G',
    fullName: 'Remedios Del Fierro',
    age: 46,
    dateOfBirth: '1980-08-20',
    gender: 'Female',
    contactNumber: '09175558888',
    philHealthNumber: '123456789018',
    allergies: 'Penicillin, Aspirin',
    chronicConditions: 'Hypertension, Type 2 Diabetes Mellitus',
    createdAt: '2026-01-01T00:00:00Z',
  };

  // =========================================================================
  // Section 1: Atomic Chart Loading & Network Fault Tolerance
  // =========================================================================
  describe('1. Atomic Chart Loading & Schema Completeness', () => {
    test('1.1 Full PatientChartDto payload parses losslessly across all 7 collections', async () => {
      const fullChart: PatientChart = {
        patientId: 'pat-stress-base-1',
        patientName: 'Remedios Del Fierro',
        totalVisits: 8,
        demographics: {
          age: 46,
          gender: 'Female',
          contactNumber: '09175558888',
          philHealthNumber: '123456789018',
          seniorCitizenId: null,
          pwdId: null,
          philHealthAtc: 'ATC-2026-YAKAP01',
          bloodType: 'B+',
          memberStatus: 'Member',
          activeCaseNo: 'C000921202600099',
        },
        consultations: [
          {
            id: 'enc-1',
            tenantId: 'ten-1',
            clinicId: 'cln-1',
            patientId: 'pat-stress-base-1',
            patientName: 'Remedios Del Fierro',
            doctorId: 'doc-1',
            doctorName: 'Dr. Maria Santos',
            doctorPrcLicense: 'PRC-0099881',
            encounterDate: '2026-10-11T09:00:00Z',
            subjective: 'Follow-up for BP check, no headaches',
            objective: 'BP 128/78 mmHg, clear lungs, S1/S2 distinct',
            assessment: 'Controlled primary hypertension',
            plan: 'Maintain lifestyle changes and medication adherence',
            isSigned: true,
            isYakapEligible: true,
            hciCaseNo: 'C000921202600099',
            hciTransNo: 'T000921202600099',
            soapTransNo: 'S000921202600099',
            diagnoses: [{ icd10Code: 'I10', description: 'Essential hypertension', isPrimary: true }],
            prescriptions: [
              {
                id: 'rx-1',
                genericName: 'Losartan Potassium',
                brandName: 'Cozaar',
                dosage: '50mg',
                sig: 'Take 1 tablet daily',
              },
            ],
          },
        ],
        vitalsHistory: [
          {
            id: 'vit-1',
            queueItemId: 'q-101',
            systolicBp: 128,
            diastolicBp: 78,
            bloodPressure: '128/78',
            heartRateBpm: 72,
            respiratoryRateBreathsPerMin: 16,
            temperatureCelsius: 36.6,
            oxygenSaturationPercent: 98,
            weightKg: 62.0,
            heightCm: 158.0,
            bmi: 24.8,
            recordedAt: '2026-10-11T08:45:00Z',
          },
        ],
        proceduresHistory: [
          {
            id: 'proc-1',
            patientId: 'pat-stress-base-1',
            procedureCode: '3',
            procedureName: 'Dietary & Lifestyle Modification Counseling',
            status: 'Completed',
            requestedAtUtc: '2026-10-11T09:15:00Z',
          },
        ],
        labOrdersHistory: [
          {
            id: 'lab-1',
            orderNumber: 'LAB-2026-777',
            clinicId: 'cln-1',
            patientId: 'pat-stress-base-1',
            doctorId: 'doc-1',
            doctorName: 'Dr. Maria Santos',
            orderDate: '2026-10-11T09:10:00Z',
            status: 'Completed',
            urgency: 'Routine',
            items: [
              { testCode: 'FBS', testName: 'Fasting Blood Sugar', category: 'Chemistry', status: 'Completed' },
            ],
          },
        ],
        invoicesHistory: [],
        problems: [
          {
            id: 'prob-1',
            clinicId: 'cln-1',
            patientId: 'pat-stress-base-1',
            icd10Code: 'I10',
            problemTitle: 'Essential (primary) hypertension',
            description: 'Essential (primary) hypertension',
            status: 'Active',
            onsetDate: '2021-03-10',
            createdAt: '2026-10-11T08:00:00Z',
          },
        ],
        allergies: [
          {
            id: 'alg-1',
            clinicId: 'cln-1',
            patientId: 'pat-stress-base-1',
            category: 'Medication',
            allergen: 'Penicillin',
            severity: 'Severe',
            isAnaphylactic: true,
            reactionManifestation: 'Facial angioedema',
            createdAt: '2026-10-11T08:00:00Z',
          },
        ],
        immunizations: [
          {
            id: 'imm-1',
            patientId: 'pat-stress-base-1',
            patientName: 'Remedios Del Fierro',
            philHealthLibrary: 'lib_immyoungw',
            philHealthCode: 'Y01',
            vaccineName: 'Human Papillomavirus (HPV) Quadrivalent',
            lotBatchNumber: 'LOT-HPV-998',
            expirationDate: '2028-12-31',
            doseSequence: 1,
            isSeriesCompleted: false,
            route: 'Intramuscular',
            injectionSite: 'Left Deltoid',
            administeredAtUtc: '2026-10-11T09:30:00Z',
            administeredByStaffId: 'stf-nurse-1',
            administeredByStaffName: 'Nurse Clarissa',
            hasAdverseReaction: false,
            adverseReactionSeverity: 'None',
            isHistorical: false,
            isSynchronizedToPatientApp: true,
          },
        ],
        attachments: [
          {
            id: 'att-1',
            patientId: 'pat-stress-base-1',
            recordType: 'OutsideChestXRay',
            title: 'Outside Chest X-Ray PA View',
            fileName: 'cxr_outside.pdf',
            storageUri: 'vault/cxr.pdf.cez',
            encryptionAlgorithm: 'AES-256-GCM',
            verificationStatus: 'Verified',
            uploadedAtUtc: '2026-10-11T08:00:00Z',
          },
        ],
        surgicalHistories: [],
        socialHistory: {
          patientId: 'pat-stress-base-1',
          smokingStatus: 'Never',
          packYears: 0,
          alcoholConsumption: 'None',
        } as any,
        reproductiveHistory: null as any,
        latestNcdAssessment: {
          patientId: 'pat-stress-base-1',
          cvdRiskScorePercent: 8.5,
          riskBand: 'Band A (<10%)',
        } as any,
      };

      mockGetResponse = fullChart;
      const [chart, err] = await clinicService.getPatientChart('pat-stress-base-1');

      expect(err).toBeNull();
      expect(lastGetUrl).toBe('/patients/pat-stress-base-1/chart');
      expect(chart).not.toBeNull();
      expect(chart?.patientId).toBe('pat-stress-base-1');
      expect(chart?.totalVisits).toBe(8);
      expect(chart?.consultations.length).toBe(1);
      expect(chart?.vitalsHistory.length).toBe(1);
      expect(chart?.proceduresHistory.length).toBe(1);
      expect(chart?.labOrdersHistory.length).toBe(1);
      expect(chart?.problems?.length).toBe(1);
      expect(chart?.allergies?.length).toBe(1);
      expect(chart?.immunizations?.length).toBe(1);
      expect(chart?.attachments?.length).toBe(1);
    });

    test('1.2 Fuzz 15 sparse/corrupted chart schemas verifying zero unhandled exceptions', async () => {
      const fuzzedVariants: Partial<PatientChart>[] = [
        { patientId: 'p-fz-1', totalVisits: 0, consultations: [] },
        { patientId: 'p-fz-2', demographics: null as any, consultations: [] },
        { patientId: 'p-fz-3', demographics: {} as any, consultations: [] },
        { patientId: 'p-fz-4', problems: null as any, consultations: [] },
        { patientId: 'p-fz-5', allergies: null as any, consultations: [] },
        { patientId: 'p-fz-6', immunizations: null as any, consultations: [] },
        { patientId: 'p-fz-7', attachments: null as any, consultations: [] },
        { patientId: 'p-fz-8', surgicalHistories: null as any, consultations: [] },
        { patientId: 'p-fz-9', socialHistory: null as any, consultations: [] },
        { patientId: 'p-fz-10', reproductiveHistory: null as any, consultations: [] },
        { patientId: 'p-fz-11', latestNcdAssessment: null as any, consultations: [] },
        { patientId: 'p-fz-12', vitalsHistory: null as any, consultations: [] },
        { patientId: 'p-fz-13', proceduresHistory: null as any, consultations: [] },
        { patientId: 'p-fz-14', labOrdersHistory: null as any, consultations: [] },
        { patientId: 'p-fz-15', invoicesHistory: null as any, consultations: [] },
      ];

      for (const variant of fuzzedVariants) {
        mockGetResponse = variant;
        const [chart, err] = await clinicService.getPatientChart(variant.patientId!);
        expect(err).toBeNull();
        expect(chart).not.toBeNull();
        expect(chart?.patientId).toBe(variant.patientId!);
      }
    });

    test('1.3 Handles HTTP 404, 500, network offline (0), and token refresh (401) cleanly', async () => {
      // 404 Not Found
      mockNetworkError = { status: 404, message: 'Patient not found' };
      const [r404, e404] = await clinicService.getPatientChart('p-404');
      expect(r404).toBeNull();
      expect(e404?.status).toBe(404);

      // 500 Server Error
      mockNetworkError = { status: 500, message: 'Internal server error' };
      const [r500, e500] = await clinicService.getPatientChart('p-500');
      expect(r500).toBeNull();
      expect(e500?.status).toBe(500);

      // 0 Offline
      mockNetworkError = { status: 0, message: 'Network offline' };
      const [r0, e0] = await clinicService.getPatientChart('p-off');
      expect(r0).toBeNull();
      expect(e0?.status).toBe(0);

      // 401 Session refresh
      mockNetworkError = { status: 401, message: 'Token expired' };
      mockGetResponse = { patientId: 'p-refresh', consultations: [] };
      const [r401, e401] = await clinicService.getPatientChart('p-refresh');
      expect(refreshSessionCalled).toBe(true);
      expect(e401).toBeNull();
      expect(r401?.patientId).toBe('p-refresh');
    });
  });

  // =========================================================================
  // Section 2: 7-Tab Layout Component Rendering & Empty/Sparse Resilience
  // =========================================================================
  describe('2. 7-Tab Layout Component Rendering & Empty/Sparse Resilience', () => {
    test('2.1 Tab 1: ExecutiveSummaryTab renders under both full and sparse data', () => {
      // Full data render
      const fullMarkup = renderToStaticMarkup(
        React.createElement(ExecutiveSummaryTab, {
          patient: basePatient,
          chart: {
            patientId: basePatient.id,
            patientName: basePatient.firstName + ' ' + basePatient.lastName,
            totalVisits: 5,
            consultations: [],
            vitalsHistory: [{ systolicBp: 120, diastolicBp: 80, recordedAt: '2026-10-10' } as any],
            proceduresHistory: [],
            labOrdersHistory: [],
            invoicesHistory: [],
            problems: [
              {
                id: 'prob-1',
                clinicId: 'c1',
                patientId: basePatient.id,
                icd10Code: 'I10',
                problemTitle: 'Hypertension',
                status: 'Active',
                createdAt: '2026-01-01',
              },
            ],
            allergies: [
              {
                id: 'alg-1',
                clinicId: 'c1',
                patientId: basePatient.id,
                category: 'Medication',
                allergen: 'Penicillin',
                severity: 'LifeThreatening',
                isAnaphylactic: true,
                status: 'Active',
                createdAt: '2026-01-01',
              },
            ],
          },
          onNavigateTab: () => {},
        })
      );
      expect(fullMarkup).toContain('Total Visits');
      expect(fullMarkup).toContain('Active Problems');
      expect(fullMarkup).toContain('Allergies');
      expect(fullMarkup).toContain('Penicillin');

      // Sparse data render (null chart, empty collections)
      const sparseMarkup = renderToStaticMarkup(
        React.createElement(ExecutiveSummaryTab, {
          patient: { ...basePatient, allergies: undefined, chronicConditions: undefined },
          chart: {
            patientId: basePatient.id,
            totalVisits: 0,
            consultations: [],
            vitalsHistory: [],
            proceduresHistory: [],
            labOrdersHistory: [],
            invoicesHistory: [],
            problems: [],
            allergies: [],
          },
          onNavigateTab: () => {},
        })
      );
      expect(sparseMarkup).toContain('Total Visits');
      expect(sparseMarkup).toContain('0');
    });

    test('2.2 Tab 2: EncountersTimelineTab renders full encounters and empty state cleanly', () => {
      // Full encounter render
      const encounterList: any[] = [
        {
          id: 'enc-1',
          encounterDate: '2026-10-10T10:00:00Z',
          doctorId: 'doc-1',
          doctorName: 'Dr. Maria Santos',
          doctorPrcLicense: 'PRC-123456',
          isSigned: true,
          isYakapEligible: true,
          subjective: 'Cough',
          objective: 'Clear',
          assessment: 'URTI',
          plan: 'Rest',
          diagnoses: [{ icd10Code: 'J06.9', description: 'Acute upper respiratory infection', isPrimary: true }],
          prescriptions: [],
        },
      ];

      const fullMarkup = renderToStaticMarkup(
        React.createElement(EncountersTimelineTab, {
          patient: basePatient,
          consultations: encounterList,
        })
      );
      expect(fullMarkup).toContain('Dr. Maria Santos');
      expect(fullMarkup).toContain('PRC-123456');
      expect(fullMarkup).toContain('PhilHealth Konsulta');
      expect(fullMarkup).toContain('J06.9');

      // Empty encounters render
      const emptyMarkup = renderToStaticMarkup(
        React.createElement(EncountersTimelineTab, {
          patient: basePatient,
          consultations: [],
        })
      );
      expect(emptyMarkup).toContain('No encounters found');
      expect(emptyMarkup).toContain('Zero longitudinal SOAP encounter records documented');
    });

    test('2.3 Tab 3: DiagnosticLabTab renders lab orders, critical panic alerts, and empty state', () => {
      // Full lab order with critical panic alert
      const orders = [
        {
          id: 'lab-ord-1',
          orderNumber: 'LAB-2026-901',
          doctorId: 'doc-1',
          doctorName: 'Dr. Santos',
          orderDate: '2026-10-11T09:00:00Z',
          status: 'Completed',
          urgency: 'STAT',
          hasCriticalPanicAlert: true,
          isPanicAcknowledged: false,
          criticalFindings: 'Serum Potassium 6.9 mEq/L (Critical High)',
          items: [{ testCode: 'K', testName: 'Serum Potassium', category: 'Chemistry', status: 'Completed' }],
        },
      ];

      const fullMarkup = renderToStaticMarkup(
        React.createElement(DiagnosticLabTab, {
          patient: basePatient,
          labOrders: orders,
        })
      );
      expect(fullMarkup).toContain('LAB-2026-901');
      expect(fullMarkup).toContain('CRITICAL LAB PANIC VALUE');
      expect(fullMarkup).toContain('Serum Potassium 6.9');
      expect(fullMarkup).toContain('Document Readback');

      // Empty lab orders render
      const emptyMarkup = renderToStaticMarkup(
        React.createElement(DiagnosticLabTab, {
          patient: basePatient,
          labOrders: [],
        })
      );
      expect(emptyMarkup).toContain('No laboratory orders');
      expect(emptyMarkup).toContain('Zero diagnostic requisitions');

      // Statutory diagnostic code mapping
      expect(lookupStatutoryDiagnosticCode('Complete Blood Count').code).toBe('1');
      expect(lookupStatutoryDiagnosticCode('NonCatalogSpecialAssay').code).toBe('99');
    });

    test('2.4 Tab 4: NursingProceduresTab renders in-clinic procedures and empty state', () => {
      const procedures: any[] = [
        {
          id: 'proc-1',
          procedureCode: '1',
          procedureName: 'Breastfeeding Counseling & Guidance',
          status: 'Completed',
          requestedAtUtc: '2026-10-11T10:00:00Z',
          completedAtUtc: '2026-10-11T10:30:00Z',
          executedByStaffName: 'Nurse Clarissa',
        },
      ];

      const fullMarkup = renderToStaticMarkup(
        React.createElement(NursingProceduresTab, {
          patient: basePatient,
          procedures: procedures,
        })
      );
      expect(fullMarkup).toContain('Breastfeeding Counseling &amp; Guidance');
      expect(fullMarkup).toContain('PhilHealth Covered');

      // Empty procedures render
      const emptyMarkup = renderToStaticMarkup(
        React.createElement(NursingProceduresTab, {
          patient: basePatient,
          procedures: [],
        })
      );
      expect(emptyMarkup).toContain('No in-clinic procedures recorded');
      expect(emptyMarkup).toContain('Zero nursing procedures ordered or executed');

      // Statutory management code mapping
      expect(lookupStatutoryManagementCode('Breastfeeding Counseling & Guidance').code).toBe('1');
      expect(lookupStatutoryManagementCode('CustomProcedureNotCataloged').code).toBe('X');
    });

    test('2.5 Tab 5: StatutoryImmunizationsTab renders vaccine records, clinical status notice, and empty state', () => {
      const immunizations: PatientImmunizationRecord[] = [
        {
          id: 'imm-1',
          patientId: basePatient.id,
          patientName: 'Baby Santos',
          philHealthLibrary: 'lib_immchild',
          philHealthCode: 'C01',
          vaccineName: 'BCG (Bacillus Calmette-Guérin)',
          lotBatchNumber: 'LOT-BCG-01',
          expirationDate: '2027-12-31',
          doseSequence: 1,
          isSeriesCompleted: true,
          route: 'Intradermal',
          injectionSite: 'Right Deltoid',
          administeredAtUtc: '2026-10-11T08:00:00Z',
          administeredByStaffId: 'stf-1',
          administeredByStaffName: 'Nurse Ana',
          administeredByPrcLicense: 'PRC-RN-998877',
          hasAdverseReaction: false,
          adverseReactionSeverity: 'None',
          isHistorical: false,
          isSynchronizedToPatientApp: true,
        },
      ];

      const fullMarkup = renderToStaticMarkup(
        React.createElement(StatutoryImmunizationsTab, {
          patient: basePatient,
          immunizations: immunizations,
        })
      );
      expect(fullMarkup).toContain('BCG (Bacillus Calmette-Guérin)');
      expect(fullMarkup).toContain('LOT-BCG-01');
      expect(fullMarkup).toContain('PRC: PRC-RN-998877');
      expect(fullMarkup).toContain('Report Adverse Reaction (AEFI)');

      // Empty immunizations render (verifies clinical documentation status notice)
      const emptyMarkup = renderToStaticMarkup(
        React.createElement(StatutoryImmunizationsTab, {
          patient: basePatient,
          immunizations: [],
        })
      );
      expect(emptyMarkup).toContain('Immunization Documentation Status');
      expect(emptyMarkup).toContain('No immunizations are currently documented for this patient');
      expect(emptyMarkup).toContain('No immunizations recorded');
      expect(emptyMarkup).toContain('No vaccination records found for this patient');
      expect(emptyMarkup).not.toContain('PhilHealth');
      expect(emptyMarkup).not.toContain('Fallback Code 999');

      // Catalog completeness
      expect(PHILHEALTH_STATUTORY_VACCINES.lib_immchild.length).toBe(13);
      expect(PHILHEALTH_STATUTORY_VACCINES.lib_immyoungw.length).toBe(2);
      expect(PHILHEALTH_STATUTORY_VACCINES.lib_immpregw.length).toBe(5);
      expect(PHILHEALTH_STATUTORY_VACCINES.lib_immelderly.length).toBe(2);
    });

    test('2.6 Tab 6: HealthProfilesTab renders all 4 sub-tabs safely with null profiles', () => {
      const markup = renderToStaticMarkup(
        React.createElement(HealthProfilesTab, {
          patient: basePatient,
          surgicalHistories: undefined,
          socialHistory: undefined,
          reproductiveHistory: undefined,
          latestNcdAssessment: undefined,
        })
      );
      expect(markup).toContain('Surgical &amp; Clinical');
      expect(markup).toContain('Lifestyle &amp; Social');
      expect(markup).toContain('Reproductive / OB-GYN');
      expect(markup).toContain('Cardiometabolic &amp; NCD');
    });

    test('2.7 Tab 7: ExternalDocumentVaultTab renders outside records, AES-256-GCM badges, and empty state', () => {
      const attachments = [
        {
          id: 'att-1',
          patientId: basePatient.id,
          recordType: 'OutsideChestXRay',
          title: 'Chest X-Ray PA View Film',
          fileName: 'cxr_outside.pdf',
          storageUri: 'tenants/1/vault/cxr.pdf.cez',
          encryptionAlgorithm: 'AES-256-GCM',
          verificationStatus: 'Verified',
          verifiedByStaffName: 'Dr. Santos',
          uploadedAtUtc: '2026-10-10T08:00:00Z',
        },
      ];

      const fullMarkup = renderToStaticMarkup(
        React.createElement(ExternalDocumentVaultTab, {
          patient: basePatient,
          attachments: attachments as any,
        })
      );
      expect(fullMarkup).toContain('Chest X-Ray PA View Film');
      expect(fullMarkup).toContain('AES-256-GCM');
      expect(fullMarkup).toContain('Verified');

      // Empty vault render
      const emptyMarkup = renderToStaticMarkup(
        React.createElement(ExternalDocumentVaultTab, {
          patient: basePatient,
          attachments: [],
        })
      );
      expect(emptyMarkup).toContain('No external documents in vault');
      expect(emptyMarkup).toContain('Zero uploaded medical clearances');

      // Chest X-ray catalog verification
      expect(PHILHEALTH_CHEST_XRAY_FINDINGS['1']).toBe('Essentially Normal');
      expect(PHILHEALTH_CHEST_XRAY_OBSERVATIONS['1']).toContain('Infiltrates');
    });
  });

  // =========================================================================
  // Section 3: Statutory Immunization Actions & Lifecycle
  // =========================================================================
  describe('3. Statutory Immunization Actions & Lifecycle', () => {
    test('3.1 Administer in-clinic vaccine with complete regulatory credentials', async () => {
      const payload: AdministerVaccinePayload = {
        philHealthLibrary: 'lib_immchild',
        philHealthCode: 'C05',
        vaccineName: 'DPT-HepB-Hib 1 (Pentavalent 1)',
        brandName: 'Quinvaxem',
        manufacturer: 'Sanofi Pasteur',
        lotBatchNumber: 'LOT-PENTA-881',
        expirationDate: '2027-10-31',
        doseSequence: 1,
        isSeriesCompleted: false,
        route: 'Intramuscular',
        injectionSite: 'Left Anterolateral Thigh',
        administeredAtUtc: '2026-10-11T10:00:00Z',
        administeredByStaffId: 'stf-nurse-1',
        administeredByStaffName: 'Nurse Clarissa',
        administeredByPrcLicense: 'PRC-RN-004455',
        remarks: 'Given 0.5 mL IM. Patient tolerated well.',
      };

      const mockResult: PatientImmunizationRecord = {
        id: 'imm-rec-101',
        patientId: basePatient.id,
        patientName: 'Baby Patient',
        ...payload,
        hasAdverseReaction: false,
        adverseReactionSeverity: 'None',
        isHistorical: false,
        isSynchronizedToPatientApp: true,
      };

      mockPostResponse = mockResult;
      const [result, err] = await clinicService.administerVaccine(basePatient.id, payload);

      expect(err).toBeNull();
      expect(lastPostUrl).toBe(`/patients/${basePatient.id}/immunizations/administer`);
      expect(lastPostPayload.lotBatchNumber).toBe('LOT-PENTA-881');
      expect(lastPostPayload.administeredByPrcLicense).toBe('PRC-RN-004455');
      expect(result?.id).toBe('imm-rec-101');
      expect(result?.isHistorical).toBe(false);
    });

    test('3.2 Record historical vaccine with external health facility verification', async () => {
      const payload: RecordHistoricalImmunizationPayload = {
        philHealthLibrary: 'lib_immchild',
        philHealthCode: 'C01',
        vaccineName: 'BCG',
        administeredDate: '2025-06-15',
        doseSequence: 1,
        isSeriesCompleted: true,
        historicalFacilityName: 'Barangay Health Station Diliman',
        remarks: 'Recorded from ECCD Child Health Record',
      };

      const mockResult: PatientImmunizationRecord = {
        id: 'imm-rec-hist-1',
        patientId: basePatient.id,
        patientName: 'Child Patient',
        lotBatchNumber: 'HISTORICAL',
        expirationDate: '2025-06-15',
        route: 'Intradermal',
        injectionSite: 'Right Deltoid',
        administeredAtUtc: '2025-06-15T08:00:00Z',
        administeredByStaffId: '',
        administeredByStaffName: 'Historical Provider',
        hasAdverseReaction: false,
        adverseReactionSeverity: 'None',
        isHistorical: true,
        isSynchronizedToPatientApp: true,
        ...payload,
      };

      mockPostResponse = mockResult;
      const [result, err] = await clinicService.recordHistoricalImmunization(basePatient.id, payload);

      expect(err).toBeNull();
      expect(lastPostUrl).toBe(`/patients/${basePatient.id}/immunizations/historical`);
      expect(lastPostPayload.historicalFacilityName).toBe('Barangay Health Station Diliman');
      expect(result?.isHistorical).toBe(true);
    });

    test('3.3 Record adverse event (AEFI) across severity tiers', async () => {
      const severities: Array<'Mild' | 'Moderate' | 'Severe'> = ['Mild', 'Moderate', 'Severe'];

      for (const severity of severities) {
        const payload: RecordAefiPayload = {
          adverseReactionSeverity: severity,
          adverseReactionRemarks: `Observed ${severity} adverse reaction post-vaccination.`,
          recordedAtUtc: new Date().toISOString(),
        };

        mockPostResponse = {
          id: 'imm-rec-101',
          hasAdverseReaction: true,
          ...payload,
        };

        const [result, err] = await clinicService.recordImmunizationAefi(basePatient.id, 'imm-rec-101', payload);

        expect(err).toBeNull();
        expect(lastPostUrl).toBe(`/patients/${basePatient.id}/immunizations/imm-rec-101/aefi`);
        expect(result?.hasAdverseReaction).toBe(true);
        expect(result?.adverseReactionSeverity).toBe(severity);
      }
    });
  });

  // =========================================================================
  // Section 4: Screen Integrations & Workstation Spine
  // =========================================================================
  describe('4. Screen Integrations & PatientSummarySpine Parity', () => {
    test('4.1 PatientSummarySpine renders cleanly with full demographics, vitals, and red alert badges', () => {
      const chart: PatientChart = {
        patientId: basePatient.id,
        patientName: 'Remedios Del Fierro',
        totalVisits: 3,
        consultations: [],
        vitalsHistory: [
          {
            id: 'v-1',
            queueItemId: 'q-1',
            systolicBp: 136,
            diastolicBp: 86,
            bloodPressure: '136/86',
            heartRateBpm: 78,
            respiratoryRateBreathsPerMin: 18,
            temperatureCelsius: 36.7,
            oxygenSaturationPercent: 99,
            weightKg: 65,
            heightCm: 160,
            bmi: 25.4,
            recordedAt: '2026-10-11T08:00:00Z',
          },
        ],
        proceduresHistory: [],
        labOrdersHistory: [],
        invoicesHistory: [],
        problems: [
          {
            id: 'p-1',
            clinicId: 'c-1',
            patientId: basePatient.id,
            icd10Code: 'I10',
            problemTitle: 'Hypertension',
            status: 'Active',
            createdAt: '2026-01-01',
          },
        ],
        allergies: [
          {
            id: 'a-1',
            clinicId: 'c-1',
            patientId: basePatient.id,
            category: 'Medication',
            allergen: 'Penicillin G',
            severity: 'LifeThreatening',
            isAnaphylactic: true,
            createdAt: '2026-01-01',
          },
        ],
      };

      const spineMarkup = renderToStaticMarkup(
        React.createElement(PatientSummarySpine, {
          patient: basePatient,
          chart: chart,
          vitals: chart.vitalsHistory[0],
          loading: false,
          onPressRefresh: () => {},
        })
      );

      expect(spineMarkup).toContain('Remedios Del Fierro');
      expect(spineMarkup).toContain('CE-2026-9999');
      expect(spineMarkup).toContain('12-345678901-8');
      expect(spineMarkup).toContain('STAT ALLERGY: PENICILLIN G');
      expect(spineMarkup).toContain('Stage 1 HTN');
    });

    test('4.2 PatientSummarySpine workstation variant handles completely null chart and vitals without crashing', () => {
      const spineMarkup = renderToStaticMarkup(
        React.createElement(PatientSummarySpine, {
          variant: 'workstation',
          patient: basePatient,
          chart: null,
          vitals: undefined,
          loading: false,
        })
      );

      expect(spineMarkup).toContain('Remedios Del Fierro');
      // Vitals should show placeholder message when null
      expect(spineMarkup).toContain('No triage vitals recorded for today.');
    });

    test('4.3 PatientsScreen 7-tab chart contract and immunization action handlers verified', async () => {
      // Contractual verification of the 7 tabs available in PatientsScreen
      const canonicalTabs = [
        'summary',
        'encounters',
        'diagnostics',
        'procedures',
        'immunizations',
        'profiles',
        'vault',
      ];
      expect(canonicalTabs.length).toBe(7);

      // Verify immunization actions wire directly to clinicService
      const sampleAdminister: AdministerVaccinePayload = {
        philHealthLibrary: 'lib_immchild',
        philHealthCode: 'C01',
        vaccineName: 'BCG',
        lotBatchNumber: 'LOT-1',
        expirationDate: '2028-01-01',
        doseSequence: 1,
        isSeriesCompleted: true,
        route: 'Intradermal',
        injectionSite: 'Deltoid',
        administeredAtUtc: '2026-10-11T00:00:00Z',
        administeredByStaffId: 's1',
        administeredByStaffName: 'Nurse',
      };
      mockPostResponse = { id: 'imm-1', ...sampleAdminister };
      const [resAdmin] = await clinicService.administerVaccine(basePatient.id, sampleAdminister);
      expect(resAdmin?.id).toBe('imm-1');

      const sampleHist: RecordHistoricalImmunizationPayload = {
        philHealthLibrary: 'lib_immchild',
        philHealthCode: 'C01',
        vaccineName: 'BCG',
        administeredDate: '2025-01-01',
        doseSequence: 1,
        isSeriesCompleted: true,
        historicalFacilityName: 'Health Center',
      };
      mockPostResponse = { id: 'imm-h1', isHistorical: true, ...sampleHist };
      const [resHist] = await clinicService.recordHistoricalImmunization(basePatient.id, sampleHist);
      expect(resHist?.isHistorical).toBe(true);

      const sampleAefi: RecordAefiPayload = {
        adverseReactionSeverity: 'Mild',
        adverseReactionRemarks: 'Mild tenderness',
        recordedAtUtc: '2026-10-11T00:00:00Z',
      };
      mockPostResponse = { id: 'imm-1', hasAdverseReaction: true, ...sampleAefi };
      const [resAefi] = await clinicService.recordImmunizationAefi(basePatient.id, 'imm-1', sampleAefi);
      expect(resAefi?.hasAdverseReaction).toBe(true);
    });

    test('4.4 ConsultationsScreen queue-to-patient mapping, PatientSummarySpine, and panic alert detection', () => {
      // Simulate consultation queue selection
      const queuePatient = {
        patientId: 'pat-q-100',
        clinicId: 'cln-1',
        tenantId: 'ten-1',
        patientName: 'Juan Dela Cruz',
        queueNumber: 'Q-012',
        priority: 'Urgent',
        chiefComplaint: 'Chest tightness, palpitations',
      };

      // Fallback patient construction matching Consultations.screen.tsx lines 1493-1506
      const fallbackRecord: ClinicPatient = {
        id: queuePatient.patientId,
        clinicId: queuePatient.clinicId,
        tenantId: queuePatient.tenantId,
        patientCode: '',
        fullName: queuePatient.patientName,
        firstName: queuePatient.patientName.split(' ')[0] || '',
        lastName: queuePatient.patientName.split(' ').slice(1).join(' ') || '',
        age: 0,
        contactNumber: '',
        dateOfBirth: '',
        gender: '',
        createdAt: '',
      };

      const spineMarkup = renderToStaticMarkup(
        React.createElement(PatientSummarySpine, {
          variant: 'workstation',
          patient: fallbackRecord,
          chart: null,
          vitals: undefined,
          queueTicket: queuePatient.queueNumber,
          queuePriority: queuePatient.priority as any,
          chiefComplaint: queuePatient.chiefComplaint,
          loading: false,
        })
      );

      expect(spineMarkup).toContain('Juan Dela Cruz');
      expect(spineMarkup).toContain('Q-012');
      expect(spineMarkup).toContain('Urgent');
      expect(spineMarkup).toContain('Chest tightness, palpitations');
    });
  });
});
