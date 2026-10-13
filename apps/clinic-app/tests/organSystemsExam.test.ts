// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, value, onPress, title, horizontal }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(value !== undefined ? { 'data-value': value } : {}),
        ...(title ? { 'data-title': title } : {}),
        ...(horizontal ? { 'data-horizontal': 'true' } : {}),
        onClick: onPress,
      },
      title ?? placeholder ?? children
    );
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
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
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
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
  Alert: { alert: mock(() => {}) },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: 'svg',
  Circle: 'circle',
  Ellipse: 'ellipse',
  G: 'g',
  Text: 'text',
  TSpan: 'tspan',
  TextPath: 'textPath',
  Path: 'path',
  Polygon: 'polygon',
  Polyline: 'polyline',
  Line: 'line',
  Rect: 'rect',
  Use: 'use',
  Image: 'image',
  Symbol: 'symbol',
  Defs: 'defs',
  LinearGradient: 'linearGradient',
  RadialGradient: 'radialGradient',
  Stop: 'stop',
  ClipPath: 'clipPath',
  Pattern: 'pattern',
  Mask: 'mask',
  default: 'svg',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const mockCatalogMap: Record<string, Array<{ code: string; description: string; isActive: boolean }>> = {
  lib_skin_extremities: [
    { code: '1', description: 'Essentially normal', isActive: true },
    { code: '2', description: 'Clubbing', isActive: true },
    { code: '3', description: 'Cold clammy', isActive: true },
    { code: '4', description: 'Cyanosis/mottled', isActive: true },
  ],
  lib_heent: [
    { code: '11', description: 'Essentially Normal', isActive: true },
    { code: '1', description: 'Anicteric sclerae', isActive: true },
    { code: '2', description: 'Exudates', isActive: true },
    { code: '3', description: 'Pupils sluggish', isActive: true },
  ],
  lib_chest: [
    { code: '6', description: 'Essentially normal', isActive: true },
    { code: '1', description: 'Asymmetrical chest expansion', isActive: true },
    { code: '2', description: 'Decreased breath sounds', isActive: true },
    { code: '5', description: 'Wheezes', isActive: true },
  ],
  lib_heart: [
    { code: '5', description: 'Essentially normal', isActive: true },
    { code: '1', description: 'Displaced apex beat', isActive: true },
    { code: '2', description: 'Heaves and/or thrills', isActive: true },
    { code: '3', description: 'Murmur', isActive: true },
  ],
  lib_abdomen: [
    { code: '7', description: 'Essentially normal', isActive: true },
    { code: '1', description: 'Abdominal rigidity', isActive: true },
    { code: '2', description: 'Abdominal tenderness', isActive: true },
    { code: '4', description: 'Palpable mass', isActive: true },
  ],
  lib_neuro: [
    { code: '6', description: 'Essentially normal', isActive: true },
    { code: '1', description: 'Abnormal gait', isActive: true },
    { code: '2', description: 'Abnormal position sense', isActive: true },
    { code: '3', description: 'Motor deficit', isActive: true },
  ],
  lib_genitourinary: [
    { code: '1', description: 'Essentially normal', isActive: true },
    { code: '2', description: 'Blood tinged discharge', isActive: true },
    { code: '3', description: 'Lesions', isActive: true },
  ],
  lib_digital_rectal: [
    { code: '1', description: 'Essentially normal', isActive: true },
    { code: '2', description: 'Bld / mucous on gloved finger', isActive: true },
    { code: '3', description: 'Enlarged prostate', isActive: true },
    { code: '4', description: 'Mass', isActive: true },
  ],
};

mock.module('@utils/usePhilHealthCatalog', () => ({
  usePhilHealthCatalog: (library: string) => ({
    items: mockCatalogMap[library] || [{ code: '1', description: 'Essentially normal', isActive: true }],
    loading: false,
    error: null,
    reload: () => {},
  }),
}));

mock.module('../../utils/usePhilHealthCatalog', () => ({
  usePhilHealthCatalog: (library: string) => ({
    items: mockCatalogMap[library] || [{ code: '1', description: 'Essentially normal', isActive: true }],
    loading: false,
    error: null,
    reload: () => {},
  }),
}));

const {
  default: OrganSystemsExamSection,
  ORGAN_SYSTEMS,
  DEFAULT_ORGAN_SYSTEM_NORMAL_CODES,
} = await import('../components/chart/OrganSystemsExamSection');

const { default: ExecutiveSummaryTab } = await import('../components/chart/ExecutiveSummaryTab');

describe('Organ Systems Examination Suite', () => {
  describe('1. Statutory Catalog Definitions & Normal Codes', () => {
    test('1.1 defines all 8 PhilHealth examination systems', () => {
      expect(ORGAN_SYSTEMS).toHaveLength(8);
      const keys = ORGAN_SYSTEMS.map((s) => s.key);
      expect(keys).toContain('skinId');
      expect(keys).toContain('heentId');
      expect(keys).toContain('chestId');
      expect(keys).toContain('heartId');
      expect(keys).toContain('abdomenId');
      expect(keys).toContain('neuroId');
      expect(keys).toContain('guId');
      expect(keys).toContain('rectalId');
    });

    test('1.2 accurately maps each organ system to official PhilHealth library', () => {
      const libMap = Object.fromEntries(ORGAN_SYSTEMS.map((s) => [s.key, s.library]));
      expect(libMap.skinId).toBe('lib_skin_extremities');
      expect(libMap.heentId).toBe('lib_heent');
      expect(libMap.chestId).toBe('lib_chest');
      expect(libMap.heartId).toBe('lib_heart');
      expect(libMap.abdomenId).toBe('lib_abdomen');
      expect(libMap.neuroId).toBe('lib_neuro');
      expect(libMap.guId).toBe('lib_genitourinary');
      expect(libMap.rectalId).toBe('lib_digital_rectal');
    });

    test('1.3 enforces statutory default essentially normal codes per library', () => {
      expect(DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.skinId).toBe('1');
      expect(DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.heentId).toBe('11');
      expect(DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.chestId).toBe('6');
      expect(DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.heartId).toBe('5');
      expect(DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.abdomenId).toBe('7');
      expect(DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.neuroId).toBe('6');
      expect(DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.guId).toBe('1');
      expect(DEFAULT_ORGAN_SYSTEM_NORMAL_CODES.rectalId).toBe('1');
    });
  });

  describe('2. OrganSystemsExamSection Component Rendering & Horizontal Scroll', () => {
    test('2.1 renders section title, all 8 organ system labels, and horizontal scroll wrappers', () => {
      const markup = renderToStaticMarkup(
        React.createElement(OrganSystemsExamSection, {
          values: DEFAULT_ORGAN_SYSTEM_NORMAL_CODES,
          onChange: () => {},
        })
      );

      expect(markup).toContain('Organ systems examination');
      expect(markup).toContain('Skin / extremities');
      expect(markup).toContain('HEENT');
      expect(markup).toContain('Chest / lungs');
      expect(markup).toContain('Heart');
      expect(markup).toContain('Abdomen');
      expect(markup).toContain('Neurological');
      expect(markup).toContain('Genitourinary');
      expect(markup).toContain('Rectal');

      // Verifies horizontal scrollable containers are present
      expect(markup).toContain('data-horizontal="true"');
      expect(markup).toContain('All Essentially Normal');
    });

    test('2.2 reflects abnormal findings count badge when systems deviate from normal', () => {
      const valuesWithAbnormal = {
        ...DEFAULT_ORGAN_SYSTEM_NORMAL_CODES,
        skinId: '2', // Clubbing (abnormal)
        chestId: '5', // Wheezes (abnormal)
      };

      const markup = renderToStaticMarkup(
        React.createElement(OrganSystemsExamSection, {
          values: valuesWithAbnormal,
          onChange: () => {},
        })
      );

      expect(markup).toContain('2 Abnormal Findings');
    });
  });

  describe('3. Medical Chart ExecutiveSummaryTab Integration', () => {
    test('3.1 renders Organ Systems Examination card in executive summary with horizontal scroll', () => {
      const mockPatient = {
        id: 'pt-101',
        clinicId: 'cl-1',
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        sex: 'Male' as const,
        dateOfBirth: '1985-05-15',
        contactNumber: '09171234567',
        isPhilHealthMember: true,
      };

      const mockChart = {
        patientId: 'pt-101',
        patientName: 'Juan Dela Cruz',
        totalVisits: 3,
        consultations: [],
        vitalsHistory: [],
        proceduresHistory: [],
        labOrdersHistory: [],
        invoicesHistory: [],
        problems: [],
        allergies: [],
      };

      const markup = renderToStaticMarkup(
        React.createElement(ExecutiveSummaryTab, {
          patient: mockPatient,
          chart: mockChart,
          onNavigateTab: () => {},
          profile: {
            ...DEFAULT_ORGAN_SYSTEM_NORMAL_CODES,
            medicalHistories: [],
            surgicalHistories: [],
            familyHistories: [],
            isSmoker: false,
            isAlcoholDrinker: false,
            illDrugUser: false,
            isSexuallyActive: false,
            childImmunizations: [],
            youngWomanImmunizations: [],
            pregnantWomanImmunizations: [],
            elderlyImmunizations: [],
            otherImmunizations: [],
            menstrualApplicable: false,
            isMenopause: false,
            pregnancyApplicable: false,
            gravida: 0,
            para: 0,
            fullTermCount: 0,
            prematureCount: 0,
            abortionCount: 0,
            livingChildrenCount: 0,
            preEclampsiaHypertension: false,
            familyPlanningCounseling: false,
            genSurveyId: '1',
            ncdAnswers: {},
          },
        })
      );

      expect(markup).toContain('Organ Systems Examination');
      expect(markup).toContain('Review &amp; Edit');
      expect(markup).toContain('All Essentially Normal');
      expect(markup).toContain('Skin / extremities');
      expect(markup).toContain('HEENT');
      expect(markup).toContain('Chest / lungs');
      expect(markup).toContain('data-horizontal="true"');
    });

    test('3.2 displays abnormal badge and findings when profile contains abnormal values in executive summary', () => {
      const mockPatient = {
        id: 'pt-102',
        clinicId: 'cl-1',
        firstName: 'Maria',
        lastName: 'Santos',
        sex: 'Female' as const,
        dateOfBirth: '1990-08-20',
        contactNumber: '09181234567',
      };

      const markup = renderToStaticMarkup(
        React.createElement(ExecutiveSummaryTab, {
          patient: mockPatient,
          onNavigateTab: () => {},
          profile: {
            ...DEFAULT_ORGAN_SYSTEM_NORMAL_CODES,
            skinId: '4', // Cyanosis (abnormal)
            heartId: '3', // Murmur (abnormal)
            medicalHistories: [],
            surgicalHistories: [],
            familyHistories: [],
            isSmoker: false,
            isAlcoholDrinker: false,
            illDrugUser: false,
            isSexuallyActive: false,
            childImmunizations: [],
            youngWomanImmunizations: [],
            pregnantWomanImmunizations: [],
            elderlyImmunizations: [],
            otherImmunizations: [],
            menstrualApplicable: false,
            isMenopause: false,
            pregnancyApplicable: false,
            gravida: 0,
            para: 0,
            fullTermCount: 0,
            prematureCount: 0,
            abortionCount: 0,
            livingChildrenCount: 0,
            preEclampsiaHypertension: false,
            familyPlanningCounseling: false,
            genSurveyId: '1',
            ncdAnswers: {},
          },
        })
      );

      expect(markup).toContain('2 Abnormal Findings');
      expect(markup).toContain('Abnormal');
    });
  });
});
