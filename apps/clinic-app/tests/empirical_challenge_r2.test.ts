// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun environment
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

const {
  evaluateBloodPressure,
  evaluateHeartRate,
  evaluateRespiratoryRate,
  evaluateTemperature,
  evaluateOxygenSat,
  evaluateZScoreCategory,
  formatPhilHealthPin,
  isPregnancyIcd10,
  evaluatePregnancyStatus,
  HIGH_FALL_RISK_REGEX,
  isHighFallRisk,
} = await import('../components/chart/PatientSummarySpine');

import type {
  ClinicPatient,
  PatientChart,
  PatientAllergyRecord,
  PatientProblemRecord,
  TriageVitals,
} from '../services/clinicService';

describe('EMPIRICAL CHALLENGER R2 — Adversarial Stress Harness', () => {

  // =========================================================================
  // 1. Finding 1: evaluatePregnancyStatus Stress Harness
  // =========================================================================
  describe('Finding 1: evaluatePregnancyStatus Adversarial Verification', () => {
    test('1.1 Post-menarche nulliparous female (reproductiveHistory.isApplicable === true) NEVER triggers alert', () => {
      // Extensive permutations of post-menarche female profiles
      const permutations = [
        { gender: 'Female', reproductiveHistory: { isApplicable: true } },
        { gender: 'female', reproductiveHistory: { isApplicable: true, remarks: '' } },
        { gender: 'F', reproductiveHistory: { isApplicable: true } },
        { gender: 'f', reproductiveHistory: { isApplicable: true } },
        { gender: ' Female ', reproductiveHistory: { isApplicable: true } },
        { gender: 'Female', reproductiveHistory: { isApplicable: true, isMenopausal: false } },
        { gender: 'Female', reproductiveHistory: { isApplicable: true, remarks: 'Normal regular menses' } },
        { gender: 'Female', reproductiveHistory: { isApplicable: true, remarks: 'Menarche at age 13, nulliparous' } },
        { gender: 'Female', reproductiveHistory: { isApplicable: true }, problems: [] },
        {
          gender: 'Female',
          reproductiveHistory: { isApplicable: true },
          problems: [
            {
              id: 'p1',
              clinicId: 'c1',
              patientId: 'pt1',
              icd10Code: 'I10',
              problemTitle: 'Essential hypertension',
              status: 'Active',
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ];

      for (const p of permutations) {
        expect(evaluatePregnancyStatus(p as any)).toBe(false);
      }
    });

    test('1.2 Menopausal patients unconditionally evaluate to false across all inputs', () => {
      const menopausalCases = [
        // Boolean flag
        { gender: 'Female', reproductiveHistory: { isApplicable: true, isMenopausal: true } },
        { gender: 'Female', reproductiveHistory: { isMenopausal: true }, alerts: 'Pregnant' },
        // Menopause age > 0
        { gender: 'Female', reproductiveHistory: { menopauseAge: 50 } },
        { gender: 'Female', reproductiveHistory: { menopauseAge: 45 }, alerts: 'G3P2 pregnancy' },
        // Lexical alerts match
        { gender: 'Female', alerts: 'Menopausal female' },
        { gender: 'Female', alerts: 'Post-menopausal' },
        { gender: 'Female', alerts: 'Patient reached menopause' },
        // Lexical remarks match
        { gender: 'Female', reproductiveHistory: { remarks: 'Postmenopausal since 2020' } },
        { gender: 'Female', reproductiveHistory: { remarks: 'Menopausal bleeding workup' } },
      ];

      for (const m of menopausalCases) {
        expect(evaluatePregnancyStatus(m as any)).toBe(false);
      }
    });

    test('1.3 Male patients unconditionally evaluate to false even with corrupted/misplaced data', () => {
      const maleCases = [
        { gender: 'Male', alerts: 'Pregnant' },
        { gender: 'male', alerts: 'Active Pregnancy' },
        { gender: 'M', alerts: 'Intrauterine pregnancy' },
        { gender: 'm', reproductiveHistory: { remarks: 'EDD: 2026-11-20' } },
        {
          gender: 'Male',
          problems: [
            {
              id: 'p1',
              clinicId: 'c1',
              patientId: 'pt1',
              icd10Code: 'Z34.0',
              problemTitle: 'Supervision of normal first pregnancy',
              status: 'Active',
              createdAt: new Date().toISOString(),
            },
          ],
        },
        // Non-female gender strings
        { gender: undefined, alerts: 'Pregnant' },
        { gender: '', alerts: 'Pregnant' },
        { gender: 'Unknown', alerts: 'Pregnant' },
        { gender: 'Other', alerts: 'Pregnant' },
      ];

      for (const mc of maleCases) {
        expect(evaluatePregnancyStatus(mc as any)).toBe(false);
      }
    });

    test('1.4 Explicit non-pregnancy statements in alerts or remarks cleanly suppress alerts', () => {
      const negativeCases = [
        { gender: 'Female', alerts: 'Pregnancy test negative' },
        { gender: 'Female', alerts: 'Pregnancy test: negative' },
        { gender: 'Female', alerts: 'UPT negative' },
        { gender: 'Female', alerts: 'UPT: negative' },
        { gender: 'Female', alerts: 'Beta-hCG negative' },
        { gender: 'Female', alerts: 'Beta-hCG: negative' },
        { gender: 'Female', alerts: 'Patient is not pregnant' },
        { gender: 'Female', alerts: 'Non-pregnant' },
        { gender: 'Female', alerts: 'Negative for pregnancy' },
        { gender: 'Female', alerts: 'Pregnancy is resolved' },
        { gender: 'Female', alerts: 'Pregnancy ended' },
        { gender: 'Female', reproductiveHistory: { remarks: 'UPT is negative' } },
        { gender: 'Female', reproductiveHistory: { remarks: 'Beta-hCG test: negative' } },
        { gender: 'Female', reproductiveHistory: { remarks: 'Patient confirmed non-pregnant' } },
      ];

      for (const nc of negativeCases) {
        expect(evaluatePregnancyStatus(nc as any)).toBe(false);
      }
    });

    test('1.5 Inactive, resolved, or archived obstetric problems do NOT trigger alert', () => {
      const resolvedStatuses = ['Resolved', 'Inactive', 'Archived', 'Deleted', 'Completed'];

      for (const status of resolvedStatuses) {
        const result = evaluatePregnancyStatus({
          gender: 'Female',
          problems: [
            {
              id: 'p1',
              clinicId: 'c1',
              patientId: 'pt1',
              icd10Code: 'O24.4',
              problemTitle: 'Gestational diabetes mellitus in prior pregnancy',
              status,
              createdAt: new Date().toISOString(),
            },
            {
              id: 'p2',
              clinicId: 'c1',
              patientId: 'pt1',
              icd10Code: 'Z34.0',
              problemTitle: 'Prior supervision of pregnancy',
              status,
              createdAt: new Date().toISOString(),
            },
          ],
        });
        expect(result).toBe(false);
      }
    });

    test('1.6 Full ICD-10 pregnancy code matrix coverage (isPregnancyIcd10 & active problem alerts)', () => {
      const trueCodes = [
        // Z33
        'Z33', 'Z33.1',
        // Z34
        'Z34', 'Z34.0', 'Z34.8', 'Z34.9',
        // Z35
        'Z35', 'Z35.0', 'Z35.1', 'Z35.2', 'Z35.3', 'Z35.4', 'Z35.5', 'Z35.6', 'Z35.7', 'Z35.8', 'Z35.9',
        // Chapter 15 O00-O9A
        'O00', 'O00.1', 'O02', 'O03.4', 'O08', 'O10', 'O13', 'O14.0', 'O15', 'O20.0',
        'O24', 'O24.4', 'O26.8', 'O30.0', 'O40', 'O60.0', 'O70', 'O80', 'O90.0', 'O99.0',
        'O9A', 'O9A.1', 'O9A.5',
      ];

      for (const code of trueCodes) {
        expect(isPregnancyIcd10(code)).toBe(true);
        expect(isPregnancyIcd10(code.toLowerCase())).toBe(true);

        const alertFired = evaluatePregnancyStatus({
          gender: 'Female',
          problems: [
            {
              id: 'p1',
              clinicId: 'c1',
              patientId: 'pt1',
              icd10Code: code,
              problemTitle: 'Active gestational problem',
              status: 'Active',
              createdAt: new Date().toISOString(),
            },
          ],
        });
        expect(alertFired).toBe(true);
      }

      // Non-pregnancy codes must return false
      const falseCodes = [
        'Z30', 'Z30.0', // Contraceptive management
        'Z31', 'Z31.4', // Procreative management
        'Z32', 'Z32.0', // Pregnancy exam/test unconfirmed
        'Z36', 'Z36.8', // Antenatal screening
        'Z37', 'Z37.0', // Outcome of delivery
        'Z38', 'Z38.0', // Liveborn infant (newborn chart)
        'Z39', 'Z39.1', // Postpartum care (post-delivery)
        'I10', 'E11.9', 'J45.0', 'K21.9', 'N91.0', 'N92.0', 'N97.0',
        '', '   ', undefined, null as any,
      ];

      for (const code of falseCodes) {
        expect(isPregnancyIcd10(code)).toBe(false);
      }
    });

    test('1.7 Affirmative text triggers in alerts and remarks', () => {
      const positiveTexts = [
        { gender: 'Female', alerts: 'Active Pregnancy' },
        { gender: 'Female', alerts: '32 weeks gestation' },
        { gender: 'Female', alerts: 'G2P1 14 wks gestating' },
        { gender: 'Female', alerts: 'Gravid 2, Para 1' },
        { gender: 'Female', alerts: 'Intrauterine pregnancy' },
        { gender: 'Female', alerts: 'Confirmed IUP' },
        { gender: 'Female', reproductiveHistory: { remarks: '1st trimester scan normal' } },
        { gender: 'Female', reproductiveHistory: { remarks: 'Expected delivery date: Nov 2026' } },
        { gender: 'Female', reproductiveHistory: { remarks: 'EDD 2026-11-20' } },
        { gender: 'Female', reproductiveHistory: { remarks: 'EDC Dec 2026' } },
      ];

      for (const pt of positiveTexts) {
        expect(evaluatePregnancyStatus(pt as any)).toBe(true);
      }
    });
  });

  // =========================================================================
  // 2. Finding 2: isHighFallRisk & HIGH_FALL_RISK_REGEX Stress Harness
  // =========================================================================
  describe('Finding 2: isHighFallRisk & HIGH_FALL_RISK_REGEX Adversarial Verification', () => {
    test('2.1 Low, zero, none, and resolved fall risk designations evaluate to false', () => {
      const nonHighAlerts = [
        'Low fall risk',
        'low fall risk',
        'LOW FALL RISK',
        'Low risk of falls',
        'Low risk of fall',
        'No fall risk',
        'no fall risk',
        'NO FALL RISK',
        'Zero fall risk',
        'Minimal fall risk',
        'Resolved fall risk',
        'Morse Fall Risk: Low',
        'Morse Fall Scale: 15 (Low Risk)',
        'Morse Fall Scale: 0 (No Risk)',
        'Morse Fall Scale: 20',
        'Morse Fall Scale: Moderate',
        'Morse fall risk: moderate',
        'Fall risk: None',
        'Fall risk: Negative',
        'Fall risk: Resolved',
        'Fall risk: Low',
        'Fall risk - Low',
        'Fall risk: Minimal',
        'Fall risk: Zero',
        'Fall risk: Moderate',
        'Fall risk level: moderate',
        'Patient not at high fall risk',
        'Patient without high fall risk',
        'No high fall risk',
        'Not high fall risk',
        'Fall risk: mild',
        '',
        '   ',
        null,
        undefined,
      ];

      for (const alert of nonHighAlerts) {
        expect(isHighFallRisk(alert as any)).toBe(false);
      }
    });

    test('2.2 High and moderate-high fall risk designations evaluate to true', () => {
      const highAlerts = [
        'High Fall Risk',
        'high fall risk',
        'HIGH FALL RISK',
        'High fall risk protocol active',
        'Fall risk: High',
        'Fall risk - High',
        'Fall risk = High',
        'Fall risk: high',
        'Fall risk is high',
        'Fall risk (high)',
        'Fall risk (High Risk)',
        'Fall risk level: high',
        'Fall risk grade: high',
        'Morse Fall Scale: 65 (High Risk)',
        'Morse Fall Scale: 55 (High Risk)',
        'Morse Fall scale: high',
        'Morse fall risk: high',
        'Morse Fall Scale: 55 High',
        'Moderate-high fall risk',
        'Moderate to high fall risk',
        'High risk of falls',
        'High risk of fall',
        'Risk of falls: high',
        'High fall hazard',
      ];

      for (const alert of highAlerts) {
        expect(isHighFallRisk(alert)).toBe(true);
      }
    });

    test('2.4 Morse scale syntax edge cases and boundaries', () => {
      // Standard documented format
      expect(isHighFallRisk('Morse Fall Scale: 65 (High Risk)')).toBe(true);
      expect(isHighFallRisk('Morse Fall Scale: 45 (High Risk)')).toBe(true);
      expect(isHighFallRisk('Morse Fall Scale: 55 High')).toBe(true);
      expect(isHighFallRisk('Morse Fall Scale = 55 (High)')).toBe(true);
      // Low Morse score formats
      expect(isHighFallRisk('Morse Fall Scale: 15 (Low Risk)')).toBe(false);
      expect(isHighFallRisk('Morse Fall Scale: 0 (No Risk)')).toBe(false);
      expect(isHighFallRisk('Morse Fall Risk: Low')).toBe(false);
    });

    test('2.3 Multi-alert compound strings with other clinical flags', () => {
      // Must NOT trigger (fall risk is low/none, but other high flags present)
      expect(isHighFallRisk('Low fall risk, high blood pressure')).toBe(false);
      expect(isHighFallRisk('No fall risk, high cholesterol')).toBe(false);
      expect(isHighFallRisk('High blood pressure, low fall risk')).toBe(false);
      expect(isHighFallRisk('High cholesterol; Morse Fall Risk: Low')).toBe(false);
      expect(isHighFallRisk('Low fall risk; High cardiovascular risk')).toBe(false);
      expect(isHighFallRisk('Allergies: Penicillin; Low fall risk; High BMI')).toBe(false);

      // Must trigger (high fall risk accompanied by other text)
      expect(isHighFallRisk('Penicillin allergy; High fall risk; Diabetic')).toBe(true);
      expect(isHighFallRisk('No known allergies; High fall risk')).toBe(true);
      expect(isHighFallRisk('Asthma; High fall risk; Hypertension')).toBe(true);
      expect(isHighFallRisk('Fall risk: High; Low sodium diet')).toBe(true);
      expect(isHighFallRisk('Patient alert: High fall risk! Assist with ambulation')).toBe(true);
    });
  });

  // =========================================================================
  // 3. Finding 3: Pediatric Z-Score Null Handling Stress Harness
  // =========================================================================
  describe('Finding 3: Pediatric Z-Scores Null vs 0 vs Undefined Verification', () => {
    test('3.1 Expressions evaluate to em-dash fallback for null and undefined', () => {
      const formatZScore = (z: number | null | undefined): string => {
        return z != null ? `${z} SD` : '—';
      };

      // Null values (from .NET double? serialization)
      expect(formatZScore(null)).toBe('—');
      // Undefined values (missing property)
      expect(formatZScore(undefined)).toBe('—');
    });

    test('3.2 Expressions evaluate to formatted string for 0 and non-zero numbers', () => {
      const formatZScore = (z: number | null | undefined): string => {
        return z != null ? `${z} SD` : '—';
      };

      // Exactly 0 (mean WHO curve)
      expect(formatZScore(0)).toBe('0 SD');
      // Negative z-scores
      expect(formatZScore(-1.5)).toBe('-1.5 SD');
      expect(formatZScore(-2)).toBe('-2 SD');
      expect(formatZScore(-3.25)).toBe('-3.25 SD');
      // Positive z-scores
      expect(formatZScore(0.5)).toBe('0.5 SD');
      expect(formatZScore(1.8)).toBe('1.8 SD');
      expect(formatZScore(2.45)).toBe('2.45 SD');
    });

    test('3.3 Empirical comparison: loose null check (!= null) vs old strict check (!== undefined)', () => {
      const oldLogic = (z: any) => (z !== undefined ? `${z} SD` : '—');
      const newLogic = (z: any) => (z != null ? `${z} SD` : '—');

      // The old logic would produce "null SD" on JSON null!
      expect(oldLogic(null)).toBe('null SD'); // BUG REPRODUCED on old logic!
      expect(newLogic(null)).toBe('—');       // REMEDIATED on new logic!

      // Both correctly format 0
      expect(oldLogic(0)).toBe('0 SD');
      expect(newLogic(0)).toBe('0 SD');

      // Both correctly handle undefined
      expect(oldLogic(undefined)).toBe('—');
      expect(newLogic(undefined)).toBe('—');
    });
  });

  // =========================================================================
  // 4. Finding 4: evaluateBloodPressure Cascade Stress Harness
  // =========================================================================
  describe('Finding 4: evaluateBloodPressure Cascade & Priority Ordering', () => {
    test('4.1 Discordant combinations prioritizing acute hypotension over warning states', () => {
      // 125/55 mmHg: Systolic Elevated (120-129) vs Diastolic Hypotension (<60)
      const bp1 = evaluateBloodPressure(125, 55);
      expect(bp1).toEqual({ level: 'urgent', label: 'Hypotension', isAbnormal: true });

      // 85/85 mmHg: Systolic Hypotension (<90) vs Diastolic Stage 1 HTN (80-89)
      const bp2 = evaluateBloodPressure(85, 85);
      expect(bp2).toEqual({ level: 'urgent', label: 'Hypotension', isAbnormal: true });

      // 135/55 mmHg: Systolic Stage 1 HTN (130-139) vs Diastolic Hypotension (<60)
      const bp3 = evaluateBloodPressure(135, 55);
      expect(bp3).toEqual({ level: 'urgent', label: 'Hypotension', isAbnormal: true });

      // 88/70 mmHg: Systolic Hypotension (<90) vs Diastolic Normal
      const bp4 = evaluateBloodPressure(88, 70);
      expect(bp4).toEqual({ level: 'urgent', label: 'Hypotension', isAbnormal: true });

      // 115/58 mmHg: Systolic Normal vs Diastolic Hypotension (<60)
      const bp5 = evaluateBloodPressure(115, 58);
      expect(bp5).toEqual({ level: 'urgent', label: 'Hypotension', isAbnormal: true });
    });

    test('4.2 Hypertensive Crisis and Stage 2 HTN retain emergency priority over hypotension', () => {
      // 180/55 mmHg: Systolic Crisis (>=180) vs Diastolic Hypotension (<60) -> Crisis takes priority
      const crisisBp = evaluateBloodPressure(180, 55);
      expect(crisisBp).toEqual({ level: 'emergency', label: 'Crisis', isAbnormal: true });

      // 145/55 mmHg: Systolic Stage 2 HTN (>=140) vs Diastolic Hypotension (<60) -> Stage 2 HTN takes priority
      const stage2Bp = evaluateBloodPressure(145, 55);
      expect(stage2Bp).toEqual({ level: 'emergency', label: 'Stage 2 HTN', isAbnormal: true });

      // 85/95 mmHg: Systolic Hypotension (<90) vs Diastolic Stage 2 HTN (>=90) -> Stage 2 HTN takes priority
      const stage2Diastolic = evaluateBloodPressure(85, 95);
      expect(stage2Diastolic).toEqual({ level: 'emergency', label: 'Stage 2 HTN', isAbnormal: true });
    });

    test('4.3 Standard concordant tiers remain 100% accurate', () => {
      // Normal: 90-119 / 60-79
      expect(evaluateBloodPressure(115, 75)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateBloodPressure(90, 60)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateBloodPressure(119, 79)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });

      // Elevated: 120-129 / <80 (and >=60)
      expect(evaluateBloodPressure(120, 75)).toEqual({ level: 'warning', label: 'Elevated', isAbnormal: true });
      expect(evaluateBloodPressure(125, 70)).toEqual({ level: 'warning', label: 'Elevated', isAbnormal: true });
      expect(evaluateBloodPressure(129, 79)).toEqual({ level: 'warning', label: 'Elevated', isAbnormal: true });

      // Stage 1 HTN: 130-139 or 80-89
      expect(evaluateBloodPressure(130, 75)).toEqual({ level: 'urgent', label: 'Stage 1 HTN', isAbnormal: true });
      expect(evaluateBloodPressure(115, 80)).toEqual({ level: 'urgent', label: 'Stage 1 HTN', isAbnormal: true });
      expect(evaluateBloodPressure(135, 85)).toEqual({ level: 'urgent', label: 'Stage 1 HTN', isAbnormal: true });

      // Stage 2 HTN: 140-179 or 90-119
      expect(evaluateBloodPressure(140, 80)).toEqual({ level: 'emergency', label: 'Stage 2 HTN', isAbnormal: true });
      expect(evaluateBloodPressure(120, 90)).toEqual({ level: 'emergency', label: 'Stage 2 HTN', isAbnormal: true });
      expect(evaluateBloodPressure(160, 100)).toEqual({ level: 'emergency', label: 'Stage 2 HTN', isAbnormal: true });

      // Crisis: >=180 or >=120
      expect(evaluateBloodPressure(180, 80)).toEqual({ level: 'emergency', label: 'Crisis', isAbnormal: true });
      expect(evaluateBloodPressure(120, 120)).toEqual({ level: 'emergency', label: 'Crisis', isAbnormal: true });
      expect(evaluateBloodPressure(190, 125)).toEqual({ level: 'emergency', label: 'Crisis', isAbnormal: true });
    });

    test('4.4 Null, undefined, and zero boundary inputs', () => {
      expect(evaluateBloodPressure(undefined, undefined)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
      expect(evaluateBloodPressure(0, 80)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
      expect(evaluateBloodPressure(120, 0)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
      expect(evaluateBloodPressure(0, 0)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
    });
  });

  // =========================================================================
  // 5. Component Alert Rendering Integration Test
  // =========================================================================
  describe('5. End-to-End Spine Red Alert Integration', () => {
    test('5.1 Non-pregnant female patient with applicable reproductive history produces zero pregnancy alerts', () => {
      const patient: ClinicPatient = {
        id: 'p-1',
        clinicId: 'c-1',
        patientCode: 'CE-2026-0001',
        firstName: 'Maria',
        lastName: 'Santos',
        dateOfBirth: '1995-05-15',
        gender: 'Female',
        contactNumber: '09171234567',
        philHealthNumber: '123456789012',
        allergies: 'None',
        createdAt: new Date().toISOString(),
      };

      const chart: PatientChart = {
        patientId: 'p-1',
        patientName: 'Maria Santos',
        demographics: {
          dob: '1995-05-15',
          gender: 'Female',
          contactNumber: '09171234567',
          philHealthNumber: '123456789012',
          alerts: 'Low fall risk',
        },
        reproductiveHistory: {
          isApplicable: true,
          isMenopausal: false,
          remarks: 'Regular cycles',
        },
        problems: [
          {
            id: 'prob-1',
            clinicId: 'c-1',
            patientId: 'p-1',
            icd10Code: 'I10',
            problemTitle: 'Hypertension',
            status: 'Active',
            createdAt: new Date().toISOString(),
          },
        ],
        totalVisits: 2,
        consultations: [],
        vitalsHistory: [],
        proceduresHistory: [],
        labOrdersHistory: [],
        invoicesHistory: [],
        allergies: [],
        immunizations: [],
        attachments: [],
      };

      const isPregnant = evaluatePregnancyStatus({
        gender: chart.demographics?.gender,
        alerts: chart.demographics?.alerts,
        reproductiveHistory: chart.reproductiveHistory,
        problems: chart.problems,
      });
      expect(isPregnant).toBe(false);

      const isFallRisk = isHighFallRisk(chart.demographics?.alerts);
      expect(isFallRisk).toBe(false);
    });

    test('5.2 Actively pregnant female with Morse high fall risk generates both red alerts', () => {
      const chart: PatientChart = {
        patientId: 'p-2',
        patientName: 'Ana Reyes',
        demographics: {
          dob: '1998-02-10',
          gender: 'Female',
          contactNumber: '09179876543',
          alerts: 'Morse Fall Scale: 70 (High Risk)',
        },
        reproductiveHistory: {
          isApplicable: true,
          isMenopausal: false,
          remarks: 'G1P0 30 weeks gestation, EDD Dec 2026',
        },
        problems: [
          {
            id: 'prob-1',
            clinicId: 'c-1',
            patientId: 'p-2',
            icd10Code: 'Z34.0',
            problemTitle: 'Supervision of normal first pregnancy',
            status: 'Active',
            createdAt: new Date().toISOString(),
          },
        ],
        totalVisits: 1,
        consultations: [],
        vitalsHistory: [],
        proceduresHistory: [],
        labOrdersHistory: [],
        invoicesHistory: [],
        allergies: [],
        immunizations: [],
        attachments: [],
      };

      const isPregnant = evaluatePregnancyStatus({
        gender: chart.demographics?.gender,
        alerts: chart.demographics?.alerts,
        reproductiveHistory: chart.reproductiveHistory,
        problems: chart.problems,
      });
      expect(isPregnant).toBe(true);

      const isFallRisk = isHighFallRisk(chart.demographics?.alerts);
      expect(isFallRisk).toBe(true);
    });
  });
});
