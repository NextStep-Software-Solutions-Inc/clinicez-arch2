// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';

(globalThis as any).__DEV__ = true;

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
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

describe('Adversarial Critic & Stress Suite — Milestone M3 (Features 14, 15, 16)', () => {
  beforeEach(() => {
    lastGetUrl = '';
    lastGetConfig = null;
    lastPostUrl = '';
    lastPostPayload = null;
    mockGetResponse = null;
    mockPostResponse = null;
    mockErrorResponse = null;
  });

  describe('Adversarial Stress: Blood Pressure Threshold Engine', () => {
    test('Extreme Hypertensive Crisis (>=180 or >=120)', () => {
      // Both high
      expect(evaluateBloodPressure(220, 130)).toEqual({ level: 'emergency', label: 'Crisis', isAbnormal: true });
      // Isolated systolic crisis
      expect(evaluateBloodPressure(185, 75)).toEqual({ level: 'emergency', label: 'Crisis', isAbnormal: true });
      // Isolated diastolic crisis
      expect(evaluateBloodPressure(120, 125)).toEqual({ level: 'emergency', label: 'Crisis', isAbnormal: true });
    });

    test('Stage 2 Hypertension (>=140 or >=90)', () => {
      expect(evaluateBloodPressure(140, 90)).toEqual({ level: 'emergency', label: 'Stage 2 HTN', isAbnormal: true });
      expect(evaluateBloodPressure(160, 85)).toEqual({ level: 'emergency', label: 'Stage 2 HTN', isAbnormal: true });
      expect(evaluateBloodPressure(120, 95)).toEqual({ level: 'emergency', label: 'Stage 2 HTN', isAbnormal: true });
    });

    test('Stage 1 Hypertension (130-139 or 80-89)', () => {
      expect(evaluateBloodPressure(130, 80)).toEqual({ level: 'urgent', label: 'Stage 1 HTN', isAbnormal: true });
      expect(evaluateBloodPressure(135, 78)).toEqual({ level: 'urgent', label: 'Stage 1 HTN', isAbnormal: true });
      expect(evaluateBloodPressure(118, 85)).toEqual({ level: 'urgent', label: 'Stage 1 HTN', isAbnormal: true });
    });

    test('Elevated BP (120-129 and <80)', () => {
      expect(evaluateBloodPressure(120, 75)).toEqual({ level: 'warning', label: 'Elevated', isAbnormal: true });
      expect(evaluateBloodPressure(129, 79)).toEqual({ level: 'warning', label: 'Elevated', isAbnormal: true });
    });

    test('Normal Blood Pressure (<120 and <80, >=90 and >=60)', () => {
      expect(evaluateBloodPressure(110, 70)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateBloodPressure(90, 60)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateBloodPressure(119, 79)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
    });

    test('Hypotension (<90 or <60)', () => {
      expect(evaluateBloodPressure(85, 55)).toEqual({ level: 'urgent', label: 'Hypotension', isAbnormal: true });
      expect(evaluateBloodPressure(88, 70)).toEqual({ level: 'urgent', label: 'Hypotension', isAbnormal: true });
      expect(evaluateBloodPressure(100, 58)).toEqual({ level: 'urgent', label: 'Hypotension', isAbnormal: true });
    });

    test('Zero, missing, and partial inputs gracefully degrade to routine —', () => {
      expect(evaluateBloodPressure(undefined, undefined)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
      expect(evaluateBloodPressure(120, undefined)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
      expect(evaluateBloodPressure(undefined, 80)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
      expect(evaluateBloodPressure(0, 0)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
    });
  });

  describe('Adversarial Stress: Heart Rate Threshold Engine', () => {
    test('Severe and marked tachycardia (>130 bpm)', () => {
      expect(evaluateHeartRate(131)).toEqual({ level: 'emergency', label: 'Marked Tachycardia', isAbnormal: true });
      expect(evaluateHeartRate(200)).toEqual({ level: 'emergency', label: 'Marked Tachycardia', isAbnormal: true });
    });

    test('Moderate tachycardia (101-130 bpm)', () => {
      expect(evaluateHeartRate(101)).toEqual({ level: 'urgent', label: 'Tachycardia', isAbnormal: true });
      expect(evaluateHeartRate(130)).toEqual({ level: 'urgent', label: 'Tachycardia', isAbnormal: true });
    });

    test('Normal resting heart rate boundaries (60-100 bpm)', () => {
      expect(evaluateHeartRate(60)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateHeartRate(100)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateHeartRate(75)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
    });

    test('Bradycardia (45-59 bpm)', () => {
      expect(evaluateHeartRate(59)).toEqual({ level: 'urgent', label: 'Bradycardia', isAbnormal: true });
      expect(evaluateHeartRate(45)).toEqual({ level: 'urgent', label: 'Bradycardia', isAbnormal: true });
    });

    test('Severe bradycardia (<45 bpm)', () => {
      expect(evaluateHeartRate(44)).toEqual({ level: 'emergency', label: 'Severe Bradycardia', isAbnormal: true });
      expect(evaluateHeartRate(25)).toEqual({ level: 'emergency', label: 'Severe Bradycardia', isAbnormal: true });
    });

    test('Missing, undefined, and zero gracefully return placeholder', () => {
      expect(evaluateHeartRate(undefined)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
      expect(evaluateHeartRate(0)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
    });
  });

  describe('Adversarial Stress: Respiratory Rate Threshold Engine', () => {
    test('Severe Tachypnea (>28 cpm)', () => {
      expect(evaluateRespiratoryRate(29)).toEqual({ level: 'emergency', label: 'Severe Tachypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(50)).toEqual({ level: 'emergency', label: 'Severe Tachypnea', isAbnormal: true });
    });

    test('Tachypnea (21-28 cpm)', () => {
      expect(evaluateRespiratoryRate(21)).toEqual({ level: 'urgent', label: 'Tachypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(28)).toEqual({ level: 'urgent', label: 'Tachypnea', isAbnormal: true });
    });

    test('Normal respiratory rate (12-20 cpm)', () => {
      expect(evaluateRespiratoryRate(12)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateRespiratoryRate(20)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateRespiratoryRate(16)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
    });

    test('Bradypnea (8-11 cpm)', () => {
      expect(evaluateRespiratoryRate(11)).toEqual({ level: 'urgent', label: 'Bradypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(8)).toEqual({ level: 'urgent', label: 'Bradypnea', isAbnormal: true });
    });

    test('Severe Bradypnea (<8 cpm)', () => {
      expect(evaluateRespiratoryRate(7)).toEqual({ level: 'emergency', label: 'Severe Bradypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(3)).toEqual({ level: 'emergency', label: 'Severe Bradypnea', isAbnormal: true });
    });

    test('Missing and 0 cpm gracefully handled', () => {
      expect(evaluateRespiratoryRate(undefined)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
      expect(evaluateRespiratoryRate(0)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
    });
  });

  describe('Adversarial Stress: Temperature & Oxygen Saturation Engine', () => {
    test('Temperature boundary testing', () => {
      expect(evaluateTemperature(38.5)).toEqual({ level: 'emergency', label: 'High Fever', isAbnormal: true });
      expect(evaluateTemperature(38.4)).toEqual({ level: 'warning', label: 'Pyrexia', isAbnormal: true });
      expect(evaluateTemperature(37.6)).toEqual({ level: 'warning', label: 'Pyrexia', isAbnormal: true });
      expect(evaluateTemperature(37.5)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateTemperature(35.5)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateTemperature(35.4)).toEqual({ level: 'urgent', label: 'Hypothermia', isAbnormal: true });
      expect(evaluateTemperature(undefined)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
    });

    test('Oxygen Saturation boundary testing', () => {
      expect(evaluateOxygenSat(95)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateOxygenSat(100)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateOxygenSat(94)).toEqual({ level: 'warning', label: 'Mild Hypoxia', isAbnormal: true });
      expect(evaluateOxygenSat(91)).toEqual({ level: 'warning', label: 'Mild Hypoxia', isAbnormal: true });
      expect(evaluateOxygenSat(90)).toEqual({ level: 'emergency', label: 'Severe Hypoxia', isAbnormal: true });
      expect(evaluateOxygenSat(75)).toEqual({ level: 'emergency', label: 'Severe Hypoxia', isAbnormal: true });
      expect(evaluateOxygenSat(undefined)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
    });
  });

  describe('Adversarial Stress: Z-Score & PhilHealth PIN Formatting', () => {
    test('evaluateZScoreCategory maps case-insensitively and prioritizes severe tiers', () => {
      expect(evaluateZScoreCategory('SEVERELY WASTED')).toBe('emergency');
      expect(evaluateZScoreCategory('severe acute malnutrition (sam)')).toBe('emergency');
      expect(evaluateZScoreCategory('Obese Class I')).toBe('emergency');
      expect(evaluateZScoreCategory('Moderately Stunted')).toBe('urgent');
      expect(evaluateZScoreCategory('MAM')).toBe('urgent');
      expect(evaluateZScoreCategory('Overweight')).toBe('urgent');
      expect(evaluateZScoreCategory('Normal Growth')).toBe('success');
      expect(evaluateZScoreCategory('')).toBe('neutral');
      expect(evaluateZScoreCategory(undefined)).toBe('neutral');
    });

    test('formatPhilHealthPin sanitizes delimiters and formats exactly 12 digits', () => {
      expect(formatPhilHealthPin('123456789018')).toBe('12-345678901-8');
      expect(formatPhilHealthPin('12-345678901-8')).toBe('12-345678901-8');
      expect(formatPhilHealthPin(' 12 345678901 8 ')).toBe('12-345678901-8');
      expect(formatPhilHealthPin('12.345678901.8')).toBe('12-345678901-8');
      // Incomplete PIN preserves raw string
      expect(formatPhilHealthPin('123456')).toBe('123456');
      expect(formatPhilHealthPin('123456789012345')).toBe('123456789012345');
      expect(formatPhilHealthPin('')).toBe('');
      expect(formatPhilHealthPin(undefined)).toBe('');
    });
  });

  describe('Adversarial Stress: PhilHealth Statutory Dictionaries & Fallbacks', () => {
    test('lookupStatutoryDiagnosticCode is robust against punctuation, whitespace, and capitalization', () => {
      expect(lookupStatutoryDiagnosticCode('  c.b.c. (Complete Blood Count) ').code).toBe('1');
      expect(lookupStatutoryDiagnosticCode('URINALYSIS with Microscopic').code).toBe('2');
      expect(lookupStatutoryDiagnosticCode('Chest X-Ray (CXR) - PA').code).toBe('4');
      expect(lookupStatutoryDiagnosticCode('HbA1c Glycated Hemoglobin').code).toBe('18');
      expect(lookupStatutoryDiagnosticCode('Fasting Blood Sugar (FBS)').code).toBe('7');
      expect(lookupStatutoryDiagnosticCode('Lipid Profile').code).toBe('6');
      // Fallback 99 for arbitrary tests
      expect(lookupStatutoryDiagnosticCode('Rare Anti-NMDA Receptor Encephalitis Panel').code).toBe('99');
    });

    test('lookupStatutoryManagementCode maps correctly and falls back to statutory X', () => {
      expect(lookupStatutoryManagementCode('Counseling on Breastfeeding Program').code).toBe('1');
      expect(lookupStatutoryManagementCode('Smoking cessation and behavioral support').code).toBe('2');
      expect(lookupStatutoryManagementCode('Lifestyle Modification and Exercise').code).toBe('3');
      expect(lookupStatutoryManagementCode('Oral checkup and prophylaxis').code).toBe('4');
      // Custom in-clinic procedures map to X
      expect(lookupStatutoryManagementCode('Suture of Lacerated Wound').code).toBe('X');
      expect(lookupStatutoryManagementCode('Nebulization Therapy with Salbutamol').code).toBe('X');
    });

    test('All 4 PhilHealth statutory vaccine libraries are complete and non-empty', () => {
      expect(PHILHEALTH_STATUTORY_VACCINES.lib_immchild.length).toBe(13);
      expect(PHILHEALTH_STATUTORY_VACCINES.lib_immyoungw.length).toBe(2);
      expect(PHILHEALTH_STATUTORY_VACCINES.lib_immpregw.length).toBe(5);
      expect(PHILHEALTH_STATUTORY_VACCINES.lib_immelderly.length).toBe(2);
    });

    test('Chest X-ray statutory findings and observations tables are populated', () => {
      expect(PHILHEALTH_CHEST_XRAY_FINDINGS['1']).toBe('Essentially Normal');
      expect(PHILHEALTH_CHEST_XRAY_FINDINGS['99']).toContain('Others');
      expect(PHILHEALTH_CHEST_XRAY_OBSERVATIONS['1']).toContain('Infiltrates');
      expect(PHILHEALTH_CHEST_XRAY_OBSERVATIONS['99']).toContain('Other');
    });
  });

  describe('Adversarial Stress: Immunizations API Client & Error Resilience', () => {
    test('handles 500 Internal Server Error cleanly without throwing unhandled exceptions', async () => {
      mockErrorResponse = { status: 500, message: 'Database connection failed' };
      const [res, err] = await clinicService.getPatientChart('pat-err');
      expect(res).toBeNull();
      expect(err).toBeDefined();
      expect(err.status).toBe(500);
    });

    test('handles 401 Unauthorized cleanly', async () => {
      mockErrorResponse = { status: 401, message: 'Token expired' };
      const [res, err] = await clinicService.getPatientImmunizations('pat-err');
      expect(res).toBeNull();
      expect(err).toBeDefined();
      expect(err.status).toBe(401);
    });

    test('administerVaccine validates lot number, expiration, and staff identity transmission', async () => {
      const payload = {
        philHealthLibrary: 'lib_immchild',
        philHealthCode: 'C01',
        vaccineName: 'BCG',
        lotBatchNumber: 'LOT-VALID-2026',
        expirationDate: '2028-12-31',
        doseSequence: 1,
        isSeriesCompleted: true,
        route: 'Intradermal',
        injectionSite: 'Right Deltoid',
        administeredAtUtc: '2026-10-11T10:00:00Z',
        administeredByStaffId: 'stf-99',
        administeredByStaffName: 'Nurse Maria',
        administeredByPrcLicense: 'PRC-1234567',
      };

      mockPostResponse = { id: 'imm-uuid-1', ...payload };

      const [res, err] = await clinicService.administerVaccine('pat-10', payload);
      expect(err).toBeNull();
      expect(res?.id).toBe('imm-uuid-1');
      expect(lastPostUrl).toBe('/patients/pat-10/immunizations/administer');
      expect(lastPostPayload.lotBatchNumber).toBe('LOT-VALID-2026');
      expect(lastPostPayload.administeredByPrcLicense).toBe('PRC-1234567');
    });
  });
});
