import { describe, expect, test, mock, beforeEach } from 'bun:test';

(globalThis as any).__DEV__ = true;

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s },
  View: 'View',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  Text: 'Text',
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
  Switch: 'Switch',
  TouchableOpacity: 'TouchableOpacity',
  TouchableHighlight: 'TouchableHighlight',
  Image: 'Image',
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
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: 'Animated.View',
    Text: 'Animated.Text',
  },
  Alert: {
    alert: () => {},
  },
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
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

// API client mock
let lastGetUrl = '';
let lastGetConfig: any = null;
let lastPostUrl = '';
let lastPostPayload: any = null;
let mockGetResponse: any = null;
let mockPostResponse: any = null;
let mockErrorResponse: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async (url: string, config?: any) => {
      lastGetUrl = url;
      lastGetConfig = config;
      if (mockErrorResponse) return [null, mockErrorResponse];
      return [mockGetResponse, null];
    },
    post: async (url: string, data?: any) => {
      lastPostUrl = url;
      lastPostPayload = data;
      if (mockErrorResponse) return [null, mockErrorResponse];
      return [mockPostResponse, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const { clinicService } = await import('../services/clinicService');
import type {
  PatientChart,
  PatientImmunizationRecord,
  AdministerVaccinePayload,
  RecordHistoricalImmunizationPayload,
  RecordAefiPayload,
} from '../services/clinicService';

const {
  evaluateBloodPressure,
  evaluateHeartRate,
  evaluateRespiratoryRate,
  evaluateTemperature,
  evaluateOxygenSat,
  evaluateZScoreCategory,
  formatPhilHealthPin,
} = await import('../components/chart/PatientSummarySpine');

const {
  lookupStatutoryDiagnosticCode,
  STATUTORY_DIAGNOSTIC_CODES,
} = await import('../components/chart/DiagnosticLabTab');

const {
  lookupStatutoryManagementCode,
  STATUTORY_MANAGEMENT_CODES,
} = await import('../components/chart/NursingProceduresTab');

const {
  PHILHEALTH_STATUTORY_VACCINES,
} = await import('../components/chart/StatutoryImmunizationsTab');

const {
  PHILHEALTH_CHEST_XRAY_FINDINGS,
  PHILHEALTH_CHEST_XRAY_OBSERVATIONS,
} = await import('../components/chart/ExternalDocumentVaultTab');

describe('Milestone 3 Features 14, 15, 16: Patient Chart & Clinical Spine', () => {
  beforeEach(() => {
    lastGetUrl = '';
    lastGetConfig = null;
    lastPostUrl = '';
    lastPostPayload = null;
    mockGetResponse = null;
    mockPostResponse = null;
    mockErrorResponse = null;
  });

  describe('Feature 14: Clinical Vitals & Z-Score Evaluation Engine', () => {
    describe('evaluateBloodPressure', () => {
      test('correctly classifies Normal BP (<120 / <80)', () => {
        const res = evaluateBloodPressure(110, 70);
        expect(res.level).toBe('routine');
        expect(res.label).toBe('Normal');
        expect(res.isAbnormal).toBe(false);
      });

      test('correctly classifies Elevated BP (120-129 / <80)', () => {
        const res = evaluateBloodPressure(125, 75);
        expect(res.level).toBe('warning');
        expect(res.label).toBe('Elevated');
        expect(res.isAbnormal).toBe(true);
      });

      test('correctly classifies Stage 1 Hypertension (130-139 or 80-89)', () => {
        const resSystolic = evaluateBloodPressure(135, 75);
        expect(resSystolic.level).toBe('urgent');
        expect(resSystolic.label).toBe('Stage 1 HTN');
        expect(resSystolic.isAbnormal).toBe(true);

        const resDiastolic = evaluateBloodPressure(118, 85);
        expect(resDiastolic.level).toBe('urgent');
        expect(resDiastolic.label).toBe('Stage 1 HTN');
      });

      test('correctly classifies Stage 2 Hypertension (>=140 or >=90)', () => {
        const res = evaluateBloodPressure(150, 95);
        expect(res.level).toBe('emergency');
        expect(res.label).toBe('Stage 2 HTN');
        expect(res.isAbnormal).toBe(true);
      });

      test('correctly flags Hypertensive Crisis (>=180 or >=120)', () => {
        const resSys = evaluateBloodPressure(190, 100);
        expect(resSys.level).toBe('emergency');
        expect(resSys.label).toBe('Crisis');
        expect(resSys.isAbnormal).toBe(true);

        const resDia = evaluateBloodPressure(160, 125);
        expect(resDia.level).toBe('emergency');
        expect(resDia.label).toBe('Crisis');
      });

      test('correctly flags Hypotension (<90 or <60)', () => {
        const res = evaluateBloodPressure(85, 55);
        expect(res.level).toBe('urgent');
        expect(res.label).toBe('Hypotension');
        expect(res.isAbnormal).toBe(true);
      });

      test('tolerates missing or zero BP values', () => {
        expect(evaluateBloodPressure(undefined, undefined).level).toBe('routine');
        expect(evaluateBloodPressure(undefined, undefined).label).toBe('—');
      });
    });

    describe('evaluateHeartRate', () => {
      test('identifies Normal resting heart rate (60-100 bpm)', () => {
        const res = evaluateHeartRate(72);
        expect(res.level).toBe('routine');
        expect(res.label).toBe('Normal');
        expect(res.isAbnormal).toBe(false);
      });

      test('identifies Bradycardia (<60 bpm)', () => {
        const res = evaluateHeartRate(48);
        expect(res.level).toBe('urgent');
        expect(res.label).toBe('Bradycardia');
        expect(res.isAbnormal).toBe(true);
      });

      test('identifies Severe Bradycardia (<45 bpm)', () => {
        const res = evaluateHeartRate(40);
        expect(res.level).toBe('emergency');
        expect(res.label).toBe('Severe Bradycardia');
        expect(res.isAbnormal).toBe(true);
      });

      test('identifies Tachycardia (>100 bpm) and Marked Tachycardia (>130 bpm)', () => {
        const res1 = evaluateHeartRate(115);
        expect(res1.level).toBe('urgent');
        expect(res1.label).toBe('Tachycardia');

        const res2 = evaluateHeartRate(135);
        expect(res2.level).toBe('emergency');
        expect(res2.label).toBe('Marked Tachycardia');
      });

      test('handles undefined or 0 bpm gracefully', () => {
        expect(evaluateHeartRate(undefined).level).toBe('routine');
        expect(evaluateHeartRate(0).level).toBe('routine');
      });
    });

    describe('evaluateRespiratoryRate', () => {
      test('identifies Normal respiratory rate (12-20 bpm)', () => {
        const res = evaluateRespiratoryRate(16);
        expect(res.level).toBe('routine');
        expect(res.label).toBe('Normal');
        expect(res.isAbnormal).toBe(false);
      });

      test('identifies Bradypnea (<12 bpm) and Severe Bradypnea (<8 bpm)', () => {
        const res = evaluateRespiratoryRate(9);
        expect(res.level).toBe('urgent');
        expect(res.label).toBe('Bradypnea');
        expect(res.isAbnormal).toBe(true);

        const resSev = evaluateRespiratoryRate(6);
        expect(resSev.level).toBe('emergency');
        expect(resSev.label).toBe('Severe Bradypnea');
      });

      test('identifies Tachypnea (>20 bpm) and Severe Tachypnea (>28 bpm)', () => {
        const resWarn = evaluateRespiratoryRate(24);
        expect(resWarn.level).toBe('urgent');
        expect(resWarn.label).toBe('Tachypnea');

        const resUrg = evaluateRespiratoryRate(32);
        expect(resUrg.level).toBe('emergency');
        expect(resUrg.label).toBe('Severe Tachypnea');
      });
    });

    describe('evaluateTemperature', () => {
      test('identifies Afebrile / Normal (36.0 - 37.5 °C)', () => {
        const res = evaluateTemperature(36.8);
        expect(res.level).toBe('routine');
        expect(res.label).toBe('Normal');
        expect(res.isAbnormal).toBe(false);
      });

      test('identifies Pyrexia (37.6 - 38.4 °C)', () => {
        const res = evaluateTemperature(38.0);
        expect(res.level).toBe('warning');
        expect(res.label).toBe('Pyrexia');
        expect(res.isAbnormal).toBe(true);
      });

      test('identifies High Fever (>=38.5 °C)', () => {
        const resHigh = evaluateTemperature(38.8);
        expect(resHigh.level).toBe('emergency');
        expect(resHigh.label).toBe('High Fever');
      });

      test('identifies Hypothermia (<35.5 °C)', () => {
        const res = evaluateTemperature(34.8);
        expect(res.level).toBe('urgent');
        expect(res.label).toBe('Hypothermia');
      });
    });

    describe('evaluateOxygenSat', () => {
      test('identifies Normal room air SpO2 (>=95%)', () => {
        const res = evaluateOxygenSat(98);
        expect(res.level).toBe('routine');
        expect(res.label).toBe('Normal');
        expect(res.isAbnormal).toBe(false);
      });

      test('identifies Mild Hypoxia (91-94%)', () => {
        const res = evaluateOxygenSat(92);
        expect(res.level).toBe('warning');
        expect(res.label).toBe('Mild Hypoxia');
        expect(res.isAbnormal).toBe(true);
      });

      test('identifies Severe Hypoxia (<=90%)', () => {
        const res = evaluateOxygenSat(86);
        expect(res.level).toBe('emergency');
        expect(res.label).toBe('Severe Hypoxia');
        expect(res.isAbnormal).toBe(true);
      });
    });

    describe('evaluateZScoreCategory', () => {
      test('evaluates WHO pediatric anthropometric Z-score strata to BadgeVariants', () => {
        expect(evaluateZScoreCategory('Severely Wasted (SAM)')).toBe('emergency');
        expect(evaluateZScoreCategory('Obese')).toBe('emergency');
        expect(evaluateZScoreCategory('Moderately Wasted (MAM)')).toBe('urgent');
        expect(evaluateZScoreCategory('Overweight')).toBe('urgent');
        expect(evaluateZScoreCategory('Normal')).toBe('success');
        expect(evaluateZScoreCategory(undefined)).toBe('neutral');
      });
    });

    describe('formatPhilHealthPin', () => {
      test('formats 12 unhyphenated digits to PhilHealth standard XX-XXXXXXXXX-X', () => {
        expect(formatPhilHealthPin('123456789018')).toBe('12-345678901-8');
        expect(formatPhilHealthPin('010250000010')).toBe('01-025000001-0');
      });

      test('returns non-standard or partial lengths unchanged', () => {
        expect(formatPhilHealthPin('12345')).toBe('12345');
        expect(formatPhilHealthPin(null as any)).toBe('');
        expect(formatPhilHealthPin(undefined)).toBe('');
      });
    });
  });

  describe('Feature 15: PhilHealth Statutory Mapping & Catalogs', () => {
    describe('lookupStatutoryDiagnosticCode', () => {
      test('correctly maps laboratory test names to PhilHealth lib_diagnostic statutory codes', () => {
        expect(lookupStatutoryDiagnosticCode('Complete Blood Count (CBC)').code).toBe('1');
        expect(lookupStatutoryDiagnosticCode('Urinalysis').code).toBe('2');
        expect(lookupStatutoryDiagnosticCode('Fecalysis with Occult Blood').code).toBe('3');
        expect(lookupStatutoryDiagnosticCode('Chest X-Ray PA View').code).toBe('4');
        expect(lookupStatutoryDiagnosticCode('Sputum GeneXpert Exam').code).toBe('5');
        expect(lookupStatutoryDiagnosticCode('Fasting Blood Sugar (FBS)').code).toBe('7');
        expect(lookupStatutoryDiagnosticCode('Lipid Profile Screen').code).toBe('6');
        expect(lookupStatutoryDiagnosticCode('Hemoglobin A1c (HbA1c)').code).toBe('18');
        expect(lookupStatutoryDiagnosticCode('Pap Smear Exfoliative Cytology').code).toBe('13');
        expect(lookupStatutoryDiagnosticCode('12-Lead Electrocardiogram').code).toBe('9');
      });

      test('returns statutory fallback code 99 for non-catalog tests', () => {
        const unmapped = lookupStatutoryDiagnosticCode('Special Specialized Antibody Assay');
        expect(unmapped.code).toBe('99');
        expect(unmapped.name).toBe('Special Specialized Antibody Assay');
      });
    });

    describe('lookupStatutoryManagementCode', () => {
      test('correctly maps clinic procedures to PhilHealth lib_management statutory codes', () => {
        expect(lookupStatutoryManagementCode('Breastfeeding Counseling & Guidance').code).toBe('1');
        expect(lookupStatutoryManagementCode('Smoking Cessation Program').code).toBe('2');
        expect(lookupStatutoryManagementCode('Lifestyle Modification & Diet Counseling').code).toBe('3');
        expect(lookupStatutoryManagementCode('Oral Health Examination and Prophylaxis').code).toBe('4');
      });

      test('returns statutory fallback code X for other procedures', () => {
        const custom = lookupStatutoryManagementCode('Wound Debridement and Suture');
        expect(custom.code).toBe('X');
        expect(custom.name).toContain('Others');
      });
    });

    describe('PHILHEALTH_STATUTORY_VACCINES catalog', () => {
      test('includes all statutory PhilHealth immunization libraries', () => {
        expect(PHILHEALTH_STATUTORY_VACCINES.lib_immchild.length).toBeGreaterThanOrEqual(13);
        expect(PHILHEALTH_STATUTORY_VACCINES.lib_immyoungw.length).toBeGreaterThanOrEqual(2);
        expect(PHILHEALTH_STATUTORY_VACCINES.lib_immpregw.length).toBeGreaterThanOrEqual(2);
        expect(PHILHEALTH_STATUTORY_VACCINES.lib_immelderly.length).toBeGreaterThanOrEqual(2);
      });

      test('contains mandatory statutory codes C01 BCG and C09 HepB Birth Dose', () => {
        const bcg = PHILHEALTH_STATUTORY_VACCINES.lib_immchild.find((v) => v.code === 'C01');
        expect(bcg).toBeDefined();
        expect(bcg?.name).toContain('BCG');

        const hepb = PHILHEALTH_STATUTORY_VACCINES.lib_immchild.find((v) => v.code === 'C09');
        expect(hepb).toBeDefined();
        expect(hepb?.name).toContain('Hepatitis B');
      });
    });

    describe('PHILHEALTH_CHEST_XRAY mappings', () => {
      test('contains standard findings codes for external vault verification', () => {
        expect(PHILHEALTH_CHEST_XRAY_FINDINGS['1']).toBe('Essentially Normal');
        expect(PHILHEALTH_CHEST_XRAY_FINDINGS['2']).toBe('Pneumonia');
        expect(PHILHEALTH_CHEST_XRAY_FINDINGS['3']).toContain('Tuberculosis');
        expect(PHILHEALTH_CHEST_XRAY_FINDINGS['12']).toContain('Nodule');
      });

      test('contains standard observations codes', () => {
        expect(PHILHEALTH_CHEST_XRAY_OBSERVATIONS['1']).toContain('Infiltrates');
        expect(PHILHEALTH_CHEST_XRAY_OBSERVATIONS['3']).toBe('Consolidation');
        expect(PHILHEALTH_CHEST_XRAY_OBSERVATIONS['9']).toBe('Cardiomegaly');
      });
    });
  });

  describe('Feature 16: Longitudinal Patient Chart & Immunizations API Client', () => {
    describe('clinicService.getPatientChart', () => {
      test('successfully queries /patients/{patientId}/chart and maps all 7 modular chart sections', async () => {
        const mockChart: PatientChart = {
          patientId: 'pat-100',
          patientName: 'Juan Dela Cruz',
          totalVisits: 3,
          demographics: {
            age: 45,
            gender: 'Male',
            contactNumber: '09171234567',
            philHealthNumber: '123456789018',
            seniorCitizenId: null,
            pwdId: null,
            philHealthAtc: 'ATC-2026-KON01',
          },
          consultations: [
            {
              id: 'enc-1',
              tenantId: 'ten-1',
              clinicId: 'cln-1',
              patientId: 'pat-100',
              patientName: 'Juan Dela Cruz',
              doctorId: 'doc-1',
              doctorName: 'Dr. Santos',
              encounterDate: '2026-10-10T08:00:00Z',
              subjective: 'Productive cough for 3 days',
              objective: 'Crackles in right base',
              assessment: 'Community-Acquired Pneumonia',
              plan: 'Oral Azithromycin 500mg daily x 3 days',
              isSigned: true,
              diagnoses: [{ icd10Code: 'J18.9', description: 'Pneumonia', isPrimary: true }],
              prescriptions: [],
            },
          ],
          vitalsHistory: [
            {
              id: 'vit-1',
              queueItemId: 'q-1',
              bloodPressure: '120/80',
              heartRateBpm: 76,
              respiratoryRateBreathsPerMin: 18,
              temperatureCelsius: 37.0,
              oxygenSaturationPercent: 98,
              recordedAt: '2026-10-10T07:45:00Z',
            },
          ],
          proceduresHistory: [
            {
              id: 'proc-1',
              patientId: 'pat-100',
              procedureCode: '1',
              procedureName: 'Breastfeeding Program Education',
              status: 'Completed',
              requestedAtUtc: '2026-10-10T08:30:00Z',
            },
          ],
          labOrdersHistory: [
            {
              id: 'lab-1',
              orderNumber: 'LAB-2026-001',
              clinicId: 'cln-1',
              patientId: 'pat-100',
              doctorId: 'doc-1',
              doctorName: 'Dr. Santos',
              orderDate: '2026-10-10T08:15:00Z',
              status: 'Completed',
              urgency: 'Routine',
              items: [{ testCode: 'CBC', testName: 'Complete Blood Count', category: 'Hematology', status: 'Completed' }],
            },
          ],
          invoicesHistory: [],
          problems: [
            {
              id: 'prob-1',
              clinicId: 'cln-1',
              patientId: 'pat-100',
              icd10Code: 'I10',
              description: 'Essential (primary) hypertension',
              status: 'Active',
              onsetDate: '2024-01-15',
              recordedAtUtc: '2026-10-10T08:00:00Z',
            },
          ],
          allergies: [
            {
              id: 'alg-1',
              clinicId: 'cln-1',
              patientId: 'pat-100',
              category: 'Medication',
              allergen: 'Penicillin G',
              severity: 'Severe',
              isAnaphylactic: true,
              recordedAtUtc: '2026-10-10T08:00:00Z',
            },
          ],
          immunizations: [
            {
              id: 'imm-1',
              patientId: 'pat-100',
              patientName: 'Juan Dela Cruz',
              philHealthLibrary: 'lib_immchild',
              philHealthCode: 'C01',
              vaccineName: 'BCG (Bacillus Calmette-Guérin)',
              lotBatchNumber: 'LOT-9923',
              expirationDate: '2027-12-31',
              doseSequence: 1,
              isSeriesCompleted: true,
              route: 'Intradermal',
              injectionSite: 'Right Deltoid',
              administeredAtUtc: '2026-10-10T09:00:00Z',
              administeredByStaffId: 'stf-1',
              administeredByStaffName: 'Nurse Ramos',
              hasAdverseReaction: false,
              adverseReactionSeverity: 'None',
              isHistorical: false,
              isSynchronizedToPatientApp: true,
            },
          ],
          attachments: [
            {
              id: 'att-1',
              patientId: 'pat-100',
              recordType: 'OutsideChestXRay',
              title: 'External Chest X-Ray PA',
              fileName: 'cxr_2026.pdf',
              storageUri: 'tenants/1/records/cxr.pdf.cez',
              encryptionAlgorithm: 'AES-256-GCM',
              verificationStatus: 'Verified',
              uploadedAtUtc: '2026-10-10T08:00:00Z',
            },
          ],
        };

        mockGetResponse = mockChart;

        const [chart, err] = await clinicService.getPatientChart('pat-100');

        expect(err).toBeNull();
        expect(lastGetUrl).toBe('/patients/pat-100/chart');
        expect(chart).toBeDefined();
        expect(chart?.patientId).toBe('pat-100');
        expect(chart?.totalVisits).toBe(3);
        expect(chart?.demographics?.philHealthNumber).toBe('123456789018');
        expect(chart?.problems?.length).toBe(1);
        expect(chart?.problems?.[0].icd10Code).toBe('I10');
        expect(chart?.allergies?.[0].isAnaphylactic).toBe(true);
        expect(chart?.immunizations?.length).toBe(1);
        expect(chart?.attachments?.[0].verificationStatus).toBe('Verified');
      });

      test('tolerates sparse / newly registered patient chart without throwing', async () => {
        const sparseChart: PatientChart = {
          patientId: 'pat-new',
          patientName: 'Maria Santos',
          totalVisits: 0,
          consultations: [],
          vitalsHistory: [],
          proceduresHistory: [],
          labOrdersHistory: [],
          invoicesHistory: [],
        };

        mockGetResponse = sparseChart;

        const [chart, err] = await clinicService.getPatientChart('pat-new');

        expect(err).toBeNull();
        expect(chart?.totalVisits).toBe(0);
        expect(chart?.problems).toBeUndefined();
        expect(chart?.allergies).toBeUndefined();
        expect(chart?.immunizations).toBeUndefined();
      });

      test('returns error tuple when server returns 404 Not Found', async () => {
        mockErrorResponse = { status: 404, message: 'Patient not found' };

        const [chart, err] = await clinicService.getPatientChart('pat-invalid');

        expect(chart).toBeNull();
        expect(err).toBeDefined();
        expect(err.status).toBe(404);
        expect(err.message).toBe('Patient not found');
      });
    });

    describe('Immunization endpoints', () => {
      test('getPatientImmunizations queries /patients/{patientId}/immunizations', async () => {
        const mockList: PatientImmunizationRecord[] = [
          {
            id: 'imm-1',
            patientId: 'pat-1',
            patientName: 'Baby Santos',
            philHealthLibrary: 'lib_immchild',
            philHealthCode: 'C01',
            vaccineName: 'BCG',
            lotBatchNumber: 'LOT-A1',
            expirationDate: '2027-01-01',
            doseSequence: 1,
            isSeriesCompleted: true,
            route: 'Intradermal',
            injectionSite: 'Right Arm',
            administeredAtUtc: '2026-10-10T08:00:00Z',
            administeredByStaffId: 'stf-1',
            administeredByStaffName: 'Nurse Jane',
            hasAdverseReaction: false,
            adverseReactionSeverity: 'None',
            isHistorical: false,
            isSynchronizedToPatientApp: true,
          },
        ];

        mockGetResponse = mockList;

        const [data, err] = await clinicService.getPatientImmunizations('pat-1');

        expect(err).toBeNull();
        expect(lastGetUrl).toBe('/patients/pat-1/immunizations');
        expect(data?.length).toBe(1);
        expect(data?.[0].vaccineName).toBe('BCG');
      });

      test('administerVaccine posts payload to /patients/{patientId}/immunizations/administer', async () => {
        const payload: AdministerVaccinePayload = {
          philHealthLibrary: 'lib_immchild',
          philHealthCode: 'C05',
          vaccineName: 'Pentavalent 1 (DPT-HepB-Hib 1)',
          lotBatchNumber: 'LOT-PENTA-99',
          expirationDate: '2028-06-30',
          doseSequence: 1,
          isSeriesCompleted: false,
          route: 'Intramuscular',
          injectionSite: 'Anterolateral Thigh',
          administeredAtUtc: new Date().toISOString(),
          administeredByStaffId: 'stf-10',
          administeredByStaffName: 'Nurse Maria Santos',
          administeredByPrcLicense: 'PRC-0987654',
          remarks: 'Tolerated well without acute distress',
        };

        mockPostResponse = { id: 'imm-new-1', ...payload };

        const [result, err] = await clinicService.administerVaccine('pat-1', payload);

        expect(err).toBeNull();
        expect(lastPostUrl).toBe('/patients/pat-1/immunizations/administer');
        expect(lastPostPayload.lotBatchNumber).toBe('LOT-PENTA-99');
        expect(lastPostPayload.philHealthCode).toBe('C05');
        expect(result?.id).toBe('imm-new-1');
      });

      test('recordHistoricalImmunization posts payload to /patients/{patientId}/immunizations/historical', async () => {
        const payload: RecordHistoricalImmunizationPayload = {
          philHealthLibrary: 'lib_immchild',
          philHealthCode: 'C08',
          vaccineName: 'Measles Vaccine (MCV1)',
          administeredDate: '2023-05-15',
          doseSequence: 1,
          isSeriesCompleted: true,
          historicalFacilityName: 'Barangay Health Center',
          remarks: 'Verified via Baby Immunization Booklet',
        };

        mockPostResponse = { id: 'imm-hist-1', isHistorical: true, ...payload };

        const [result, err] = await clinicService.recordHistoricalImmunization('pat-1', payload);

        expect(err).toBeNull();
        expect(lastPostUrl).toBe('/patients/pat-1/immunizations/historical');
        expect(lastPostPayload.historicalFacilityName).toBe('Barangay Health Center');
        expect(result?.isHistorical).toBe(true);
      });

      test('recordImmunizationAefi posts AEFI reaction payload to /patients/{patientId}/immunizations/{id}/aefi', async () => {
        const payload: RecordAefiPayload = {
          adverseReactionSeverity: 'Moderate',
          adverseReactionRemarks: 'High fever 39.2C, localized swelling >5cm at injection site within 6 hours',
          recordedAtUtc: new Date().toISOString(),
        };

        mockPostResponse = { id: 'imm-1', hasAdverseReaction: true, ...payload };

        const [result, err] = await clinicService.recordImmunizationAefi('pat-1', 'imm-1', payload);

        expect(err).toBeNull();
        expect(lastPostUrl).toBe('/patients/pat-1/immunizations/imm-1/aefi');
        expect(lastPostPayload.adverseReactionSeverity).toBe('Moderate');
        expect(result?.hasAdverseReaction).toBe(true);
      });

      test('handles API network and validation errors gracefully', async () => {
        mockErrorResponse = { status: 400, message: 'Invalid lot number or expired vaccine' };

        const payload: AdministerVaccinePayload = {
          philHealthLibrary: 'lib_immchild',
          philHealthCode: 'C01',
          vaccineName: 'BCG',
          lotBatchNumber: 'EXPIRED',
          expirationDate: '2020-01-01',
          doseSequence: 1,
          isSeriesCompleted: true,
          route: 'Intradermal',
          injectionSite: 'Arm',
          administeredAtUtc: new Date().toISOString(),
          administeredByStaffId: 'stf-1',
          administeredByStaffName: 'Nurse',
        };

        const [result, err] = await clinicService.administerVaccine('pat-1', payload);

        expect(result).toBeNull();
        expect(err).toBeDefined();
        expect(err.status).toBe(400);
        expect(err.message).toBe('Invalid lot number or expired vaccine');
      });
    });
  });
});
