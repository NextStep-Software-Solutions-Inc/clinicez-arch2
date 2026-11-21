// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
      placeholder,
      children
    );
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s, absoluteFill: {}, absoluteFillObject: {} },
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
  RefreshControl: createMockComponent('RefreshControl'),
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
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    parallel: () => ({ start: (cb?: any) => cb && cb() }),
  },
  processColor: (c: any) => c,
  Alert: { alert: () => {} },
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('Svg'),
  Path: createMockComponent('Path'),
  Circle: createMockComponent('Circle'),
  Rect: createMockComponent('Rect'),
  Line: createMockComponent('Line'),
  default: createMockComponent('Svg'),
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-issue164',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const { evaluateRespiratoryRate, default: PatientSummarySpine } = await import(
  '../components/chart/PatientSummarySpine'
);
const { evaluateBmi } = await import('../components/consultation/VitalsFormFields');

describe('Issue #164: Pediatric Clinical Thresholds & Z-Score Handling', () => {
  describe('1. Age-Aware Respiratory Rate Evaluation (evaluateRespiratoryRate)', () => {
    test('Mateo Santos Case: 5yo child with normal RR 22 cpm evaluates as Normal/Routine, NOT Tachypnea', () => {
      // Previously, RR 22 returned { level: 'urgent', label: 'Tachypnea', isAbnormal: true }
      const res = evaluateRespiratoryRate(22, 5);
      expect(res).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
    });

    test('Preschool (3–5 years, norm 20–30 cpm): boundary and threshold evaluations', () => {
      expect(evaluateRespiratoryRate(20, 5)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateRespiratoryRate(30, 5)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateRespiratoryRate(31, 5)).toEqual({ level: 'urgent', label: 'Tachypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(40, 5)).toEqual({ level: 'urgent', label: 'Tachypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(41, 5)).toEqual({ level: 'emergency', label: 'Severe Tachypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(19, 5)).toEqual({ level: 'urgent', label: 'Bradypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(12, 5)).toEqual({ level: 'urgent', label: 'Bradypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(11, 5)).toEqual({ level: 'emergency', label: 'Severe Bradypnea', isAbnormal: true });
    });

    test('Infant (<1 year, norm 30–60 cpm): boundary evaluations', () => {
      expect(evaluateRespiratoryRate(45, 0)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateRespiratoryRate(30, 0)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateRespiratoryRate(60, 0)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateRespiratoryRate(61, 0)).toEqual({ level: 'urgent', label: 'Tachypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(71, 0)).toEqual({ level: 'emergency', label: 'Severe Tachypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(29, 0)).toEqual({ level: 'urgent', label: 'Bradypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(19, 0)).toEqual({ level: 'emergency', label: 'Severe Bradypnea', isAbnormal: true });
    });

    test('Toddler (1–2 years, norm 24–40 cpm): boundary evaluations', () => {
      expect(evaluateRespiratoryRate(32, 2)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateRespiratoryRate(24, 2)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateRespiratoryRate(40, 2)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateRespiratoryRate(41, 2)).toEqual({ level: 'urgent', label: 'Tachypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(51, 2)).toEqual({ level: 'emergency', label: 'Severe Tachypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(23, 2)).toEqual({ level: 'urgent', label: 'Bradypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(14, 2)).toEqual({ level: 'emergency', label: 'Severe Bradypnea', isAbnormal: true });
    });

    test('School-age (6–12 years, norm 18–25 cpm): boundary evaluations', () => {
      expect(evaluateRespiratoryRate(22, 8)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateRespiratoryRate(18, 8)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateRespiratoryRate(25, 8)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateRespiratoryRate(26, 8)).toEqual({ level: 'urgent', label: 'Tachypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(36, 8)).toEqual({ level: 'emergency', label: 'Severe Tachypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(17, 8)).toEqual({ level: 'urgent', label: 'Bradypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(9, 8)).toEqual({ level: 'emergency', label: 'Severe Bradypnea', isAbnormal: true });
    });

    test('Adolescent (13–17 years, norm 12–20 cpm): boundary evaluations', () => {
      expect(evaluateRespiratoryRate(16, 15)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateRespiratoryRate(12, 15)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateRespiratoryRate(20, 15)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateRespiratoryRate(21, 15)).toEqual({ level: 'urgent', label: 'Tachypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(29, 15)).toEqual({ level: 'emergency', label: 'Severe Tachypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(11, 15)).toEqual({ level: 'urgent', label: 'Bradypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(7, 15)).toEqual({ level: 'emergency', label: 'Severe Bradypnea', isAbnormal: true });
    });

    test('Adult / Unspecified age: preserves backwards-compatible adult cutoffs (>20 Tachypnea, >28 Severe)', () => {
      expect(evaluateRespiratoryRate(16)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateRespiratoryRate(21)).toEqual({ level: 'urgent', label: 'Tachypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(29)).toEqual({ level: 'emergency', label: 'Severe Tachypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(11)).toEqual({ level: 'urgent', label: 'Bradypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(7)).toEqual({ level: 'emergency', label: 'Severe Bradypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(undefined)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
      expect(evaluateRespiratoryRate(0)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
    });
  });

  describe('2. Pediatric BMI Classification Guard (evaluateBmi)', () => {
    test('Mateo Santos Case: 5yo child (110cm, 18.5kg -> BMI 15.3) suppresses adult Underweight label', () => {
      const res = evaluateBmi('110', '18.5', undefined, false, true);
      expect(res).not.toBeNull();
      expect(res!.bmi).toBe(15.3);
      expect(res!.category).toBeNull();
    });

    test('Adult comparison: same BMI 15.3 for adult evaluates as Underweight warning', () => {
      const res = evaluateBmi('170', '44.2', undefined, false, false);
      expect(res).not.toBeNull();
      expect(res!.bmi).toBe(15.3);
      expect(res!.category).toEqual({ label: 'Underweight', variant: 'warning' });
    });

    test('Adult standard thresholds without isPediatric flag (backwards compatibility)', () => {
      expect(evaluateBmi('170', '50')?.category?.label).toBe('Underweight');
      expect(evaluateBmi('170', '65')?.category?.label).toBe('Normal weight');
      expect(evaluateBmi('170', '80')?.category?.label).toBe('Overweight');
      expect(evaluateBmi('170', '95')?.category?.label).toBe('Obese');
    });
  });

  describe('3. PatientSummarySpine WHO Z-Scores Strip & Post-60-Month Handling', () => {
    test('Mateo Santos Case: Post-60-month child (62 mo) displays cohort indicator and omits empty dashes', () => {
      const markup = renderToStaticMarkup(
        React.createElement(PatientSummarySpine, {
          variant: 'workstation',
          patient: {
            id: 'pat-mateo-164',
            fullName: 'Mateo Luis Santos',
            patientCode: 'PAT-MATEO-01',
            dateOfBirth: '2021-08-14',
            sex: 'Male',
            age: 5,
          } as any,
          vitals: {
            heartRateBpm: 98,
            respiratoryRateBreathsPerMin: 22,
            temperatureCelsius: 36.6,
            heightCm: 110,
            weightKg: 18.5,
            bmi: 15.3,
            recordedAt: '2026-11-12T08:00:00Z',
          } as any,
        })
      );

      // 1. Respiratory Rate 22 must NOT say Tachypnea
      expect(markup).not.toContain('Tachypnea');
      expect(markup).toContain('22');

      // 2. WHO Under-5 cohort indicator must be present
      expect(markup).toContain('WHO Under-5 curves apply to ≤60 months');

      // 3. Broken empty dashes (WAZ: —, HAZ: —, WHZ: —) must NOT be rendered
      expect(markup).not.toContain('WAZ (Weight-for-Age):');
      expect(markup).not.toContain('HAZ (Height-for-Age):');
      expect(markup).not.toContain('WHZ (Weight-for-Height):');
    });

    test('Under-5 child with valid WHO Z-Scores renders full Z-Score strip', () => {
      const markup = renderToStaticMarkup(
        React.createElement(PatientSummarySpine, {
          variant: 'workstation',
          patient: {
            id: 'pat-infant-164',
            fullName: 'Baby Maria Gomez',
            dateOfBirth: '2025-05-10',
            sex: 'Female',
            age: 1,
          } as any,
          vitals: {
            heartRateBpm: 110,
            respiratoryRateBreathsPerMin: 32,
            temperatureCelsius: 36.8,
            heightCm: 80,
            weightKg: 10.5,
            zScoreWeightForAge: -0.2,
            zScoreLengthForAge: 0.1,
            zScoreWeightForLength: -0.4,
            philHealthZScoreCategory: 'Normal',
            recordedAt: '2026-11-12T08:00:00Z',
          } as any,
        })
      );

      expect(markup).toContain('WHO Pediatric Anthropometrics &amp; Z-Scores');
      expect(markup).toContain('WAZ (Weight-for-Age):');
      expect(markup).toContain('-0.2 SD');
      expect(markup).toContain('HAZ (Height-for-Age):');
      expect(markup).toContain('0.1 SD');
      expect(markup).toContain('WHZ (Weight-for-Height):');
      expect(markup).toContain('-0.4 SD');
      expect(markup).toContain('Normal');
    });

    test('Under-5 child without recorded Z-Scores suppresses empty dashes widget', () => {
      const markup = renderToStaticMarkup(
        React.createElement(PatientSummarySpine, {
          variant: 'workstation',
          patient: {
            id: 'pat-toddler-novitals',
            fullName: 'Baby Juan',
            dateOfBirth: '2025-08-10',
            sex: 'Male',
            age: 1,
          } as any,
          vitals: {
            heartRateBpm: 100,
            temperatureCelsius: 36.7,
            recordedAt: '2026-11-12T08:00:00Z',
          } as any,
        })
      );

      // Neither Z-scores nor post-60-months indicator should render
      expect(markup).not.toContain('WAZ (Weight-for-Age):');
      expect(markup).not.toContain('WHO Under-5 curves apply to ≤60 months');
    });
  });
});
