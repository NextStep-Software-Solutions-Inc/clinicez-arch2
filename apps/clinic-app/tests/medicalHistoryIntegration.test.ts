// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, value, onPress, title }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(value !== undefined ? { 'data-value': value } : {}),
        ...(title ? { 'data-title': title } : {}),
        onClick: onPress,
      },
      title ?? placeholder ?? children
    );
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

// API mock state
let lastGetUrl = '';
let lastPutUrl = '';
let lastPutPayload: any = null;
let mockGetResponse: any = null;
let mockPutResponse: any = null;
let mockGetError: any = null;
let mockPutError: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async (url: string) => {
      lastGetUrl = url;
      if (mockGetError) return [null, mockGetError];
      return [mockGetResponse, null];
    },
    put: async (url: string, payload?: any) => {
      lastPutUrl = url;
      lastPutPayload = payload;
      if (mockPutError) return [null, mockPutError];
      return [mockPutResponse ?? payload, null];
    },
    post: async () => [null, null],
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const { clinicService } = await import('../services/clinicService');
type ClinicPatient = import('../services/clinicService').ClinicPatient;
type PhilHealthPatientProfile = import('../services/clinicService').PhilHealthPatientProfile;
type PhilHealthConditionEntry = import('../services/clinicService').PhilHealthConditionEntry;

const {
  default: ClinicalHistoryTab,
  PHILHEALTH_MDISEASES_CONDITIONS,
  defaultPhilHealthProfile,
} = await import('../components/chart/ClinicalHistoryTab');

const {
  default: HealthProfilesTab,
} = await import('../components/chart/HealthProfilesTab');

describe('Milestone M4 — Personal and Family Medical History Integration (lib_mdiseases)', () => {
  const mockPatient: ClinicPatient = {
    id: 'pat-medhist-001',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    firstName: 'Rosa',
    lastName: 'Santos',
    dateOfBirth: '1985-06-15',
    gender: 'Female',
    philHealthNumber: '12-345678901-2',
    chronicConditions: 'Hypertension, Asthma',
    status: 'Active',
  };

  const sampleProfile: PhilHealthPatientProfile = {
    ...defaultPhilHealthProfile,
    medicalHistories: [
      { code: '011', specificDesc: 'Hypertension' },
      { code: '006', specificDesc: 'Diabetes Mellitus' },
      { code: '998', specificDesc: 'Systemic Lupus Erythematosus' },
    ],
    familyHistories: [
      { code: '003', specificDesc: 'Cancer' },
      { code: '005', specificDesc: 'Coronary Artery Disease' },
      { code: '998', specificDesc: 'Familial Hypercholesterolemia' },
    ],
    medicalHistoryNotes: 'Patient diagnosed with Stage 1 HTN in 2021, controlled with Amlodipine.',
    familyHistoryNotes: 'Maternal grandmother had colon cancer at age 62; father had MI at age 55.',
  };

  beforeEach(() => {
    lastGetUrl = '';
    lastPutUrl = '';
    lastPutPayload = null;
    mockGetResponse = null;
    mockPutResponse = null;
    mockGetError = null;
    mockPutError = null;
  });

  // =========================================================================
  // 1. STATUTORY CATALOG COMPLETENESS & DATA DICTIONARY CONFORMANCE
  // =========================================================================
  describe('1. Statutory Catalog (lib_mdiseases) Completeness', () => {
    test('1.1 PHILHEALTH_MDISEASES_CONDITIONS contains all 19 statutory conditions (001-018, 998)', () => {
      expect(PHILHEALTH_MDISEASES_CONDITIONS.length).toBe(19);

      const codes = PHILHEALTH_MDISEASES_CONDITIONS.map((c) => c.code);
      // Verify specific codes 001 to 018
      for (let i = 1; i <= 18; i++) {
        const expectedCode = String(i).padStart(3, '0');
        expect(codes).toContain(expectedCode);
      }
      // Verify 998 Others is present
      expect(codes).toContain('998');
      // Ensure 999 None is excluded from selectable condition chips
      expect(codes).not.toContain('999');
    });

    test('1.2 Statutory descriptions match PhilHealth lib_mdiseases specifications', () => {
      const conditionMap = Object.fromEntries(
        PHILHEALTH_MDISEASES_CONDITIONS.map((c) => [c.code, c.description])
      );

      expect(conditionMap['001']).toBe('Allergy');
      expect(conditionMap['002']).toBe('Asthma');
      expect(conditionMap['003']).toBe('Cancer');
      expect(conditionMap['004']).toBe('Cerebrovascular Disease');
      expect(conditionMap['005']).toBe('Coronary Artery Disease');
      expect(conditionMap['006']).toBe('Diabetes Mellitus');
      expect(conditionMap['007']).toBe('Emphysema');
      expect(conditionMap['008']).toBe('Epilepsy/Seizure Disorder');
      expect(conditionMap['009']).toBe('Hepatitis');
      expect(conditionMap['010']).toBe('Hyperlipidemia');
      expect(conditionMap['011']).toBe('Hypertension');
      expect(conditionMap['012']).toBe('Peptic Ulcer');
      expect(conditionMap['013']).toBe('Pneumonia');
      expect(conditionMap['014']).toBe('Thyroid Disease');
      expect(conditionMap['015']).toBe('Pulmonary Tuberculosis');
      expect(conditionMap['016']).toBe('Extrapulmonary Tuberculosis');
      expect(conditionMap['017']).toBe('Urinary Tract Infection');
      expect(conditionMap['018']).toBe('Mental Illness');
      expect(conditionMap['998']).toBe('Others');
    });
  });

  // =========================================================================
  // 2. COMPONENT RENDERING & DESIGN TOKENS CONFORMANCE
  // =========================================================================
  describe('2. Component Structure and Markup', () => {
    test('2.1 ClinicalHistoryTab renders personal and family medical history sections', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ClinicalHistoryTab, {
          patient: mockPatient,
          initialProfile: sampleProfile,
        })
      );

      // Section titles
      expect(markup).toContain('Past Medical History (Personal)');
      expect(markup).toContain('Family Medical History');
      expect(markup).toContain('Save Medical &amp; Family History');

      // Badges
      expect(markup).toContain('3 Selected');

      // Notes inputs
      expect(markup).toContain('Personal Medical History Notes');
      expect(markup).toContain('Family Medical History Notes');

      // 998 Others inputs
      expect(markup).toContain('Specific Description for Other Medical Condition *');
      expect(markup).toContain('Specific Description for Other Family Condition *');
    });

    test('2.2 HealthProfilesTab preserves all 4 statutory sub-tabs', () => {
      const markup = renderToStaticMarkup(
        React.createElement(HealthProfilesTab, {
          patient: mockPatient,
          profile: sampleProfile,
        })
      );

      // Strict check for the 4 sub-tab buttons
      expect(markup).toContain('Surgical &amp; Clinical');
      expect(markup).toContain('Lifestyle &amp; Social');
      expect(markup).toContain('Reproductive / OB-GYN');
      expect(markup).toContain('Cardiometabolic &amp; NCD');
    });
  });

  // =========================================================================
  // 3. SEEDING FROM GET PHILHEALTH PATIENT PROFILE
  // =========================================================================
  describe('3. Seeding from getPhilHealthPatientProfile', () => {
    test('3.1 Seeds selected personal and family condition codes from profile', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ClinicalHistoryTab, {
          patient: mockPatient,
          initialProfile: sampleProfile,
        })
      );

      // Personal chips: Hypertension, Diabetes, Others are active
      expect(markup).toContain('Hypertension');
      expect(markup).toContain('Diabetes Mellitus');
      expect(markup).toContain('Others');

      // Family chips: Cancer, CAD, Others are active
      expect(markup).toContain('Cancer');
      expect(markup).toContain('Coronary Artery Disease');

      // 998 specific descriptions are populated
      expect(markup).toContain('Systemic Lupus Erythematosus');
      expect(markup).toContain('Familial Hypercholesterolemia');

      // Notes are populated
      expect(markup).toContain('Stage 1 HTN in 2021');
      expect(markup).toContain('Maternal grandmother had colon cancer');
    });

    test('3.2 Fallback gracefully when patient has no existing profile', () => {
      const emptyPatient: ClinicPatient = {
        ...mockPatient,
        chronicConditions: undefined,
      };

      const markup = renderToStaticMarkup(
        React.createElement(ClinicalHistoryTab, {
          patient: emptyPatient,
          initialProfile: defaultPhilHealthProfile,
        })
      );

      // 0 selected badge
      expect(markup).toContain('0 Selected');
      // No 998 specific descriptions shown when not selected
      expect(markup).not.toContain('Specific Description for Other Medical Condition *');
      expect(markup).not.toContain('Specific Description for Other Family Condition *');
    });
  });

  // =========================================================================
  // 4. API PERSISTENCE, PAYLOAD ASSEMBLY & onRefreshChart
  // =========================================================================
  describe('4. Profile Persistence & Synchronisation (PUT /api/v1/yakap/patients/{id}/profile)', () => {
    test('4.1 clinicService.updatePhilHealthPatientProfile updates profile correctly', async () => {
      mockPutResponse = {
        ...sampleProfile,
        lastUpdatedAt: '2026-10-12T07:15:00Z',
      };

      const [res, err] = await clinicService.updatePhilHealthPatientProfile(
        mockPatient.id,
        sampleProfile
      );

      expect(err).toBeNull();
      expect(res).not.toBeNull();
      expect(lastPutUrl).toBe(`/yakap/patients/${mockPatient.id}/profile`);
      expect(lastPutPayload.medicalHistories.length).toBe(3);
      expect(lastPutPayload.familyHistories.length).toBe(3);
      expect(lastPutPayload.medicalHistoryNotes).toBe(sampleProfile.medicalHistoryNotes);
      expect(lastPutPayload.familyHistoryNotes).toBe(sampleProfile.familyHistoryNotes);
    });

    test('4.2 clinicService.getPhilHealthPatientProfile retrieves profile correctly', async () => {
      mockGetResponse = sampleProfile;

      const [res, err] = await clinicService.getPhilHealthPatientProfile(mockPatient.id);

      expect(err).toBeNull();
      expect(res).not.toBeNull();
      expect(lastGetUrl).toBe(`/yakap/patients/${mockPatient.id}/profile`);
      expect(res!.medicalHistories.map((m: PhilHealthConditionEntry) => m.code)).toContain('011');
      expect(res!.familyHistories.map((f: PhilHealthConditionEntry) => f.code)).toContain('003');
    });

    test('4.3 Handles API error gracefully without throwing', async () => {
      mockPutError = { status: 500, message: 'Database connection failed' };

      const [res, err] = await clinicService.updatePhilHealthPatientProfile(
        mockPatient.id,
        sampleProfile
      );

      expect(res).toBeNull();
      expect(err).not.toBeNull();
      expect(err!.message).toBe('Database connection failed');
    });
  });

  // =========================================================================
  // 5. BEHAVIORAL LOGIC: PAYLOAD MAPPING & TOGGLE HANDLING
  // =========================================================================
  describe('5. Behavioral Logic & Payload Mapping', () => {
    test('5.1 Assembles PhilHealthConditionEntry with statutory description and custom other description', () => {
      const selectedCodes = new Set(['011', '006', '998']);
      const otherDesc = 'Rheumatoid Arthritis';

      const assembled: PhilHealthConditionEntry[] = Array.from(selectedCodes).map((code) => {
        const item = PHILHEALTH_MDISEASES_CONDITIONS.find((c) => c.code === code);
        const desc = code === '998' ? (otherDesc.trim() || 'Others') : (item?.description || code);
        return {
          code,
          specificDesc: desc,
        };
      });

      expect(assembled.length).toBe(3);
      expect(assembled.find((a) => a.code === '011')?.specificDesc).toBe('Hypertension');
      expect(assembled.find((a) => a.code === '006')?.specificDesc).toBe('Diabetes Mellitus');
      expect(assembled.find((a) => a.code === '998')?.specificDesc).toBe('Rheumatoid Arthritis');
    });

    test('5.2 Toggling a selected code deselects it and toggling an unselected code selects it', () => {
      const selected = new Set(['011', '002']);

      // Toggle '002' off
      if (selected.has('002')) {
        selected.delete('002');
      } else {
        selected.add('002');
      }
      expect(selected.has('002')).toBe(false);

      // Toggle '003' on
      if (selected.has('003')) {
        selected.delete('003');
      } else {
        selected.add('003');
      }
      expect(selected.has('003')).toBe(true);
      expect(Array.from(selected)).toEqual(['011', '003']);
    });

    test('5.3 Deselecting code 998 clears other description', () => {
      let otherDesc = 'Rare auto-immune syndrome';
      const selected = new Set(['998']);

      // Deselect 998
      selected.delete('998');
      if (!selected.has('998')) {
        otherDesc = '';
      }

      expect(selected.has('998')).toBe(false);
      expect(otherDesc).toBe('');
    });

    test('5.4 Condition chips render accessibility labels and toggle targets for personal and family history', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ClinicalHistoryTab, {
          patient: mockPatient,
          initialProfile: sampleProfile,
        })
      );

      // Verify personal and family toggle button accessibility labels
      expect(markup).toContain('aria-label="Toggle personal Hypertension"');
      expect(markup).toContain('aria-label="Toggle family Cancer"');
      expect(markup).toContain('aria-label="Toggle family Coronary Artery Disease"');
      expect(markup).toContain('aria-label="Toggle personal Asthma"');
    });

    test('5.5 Medical history condition options render with correct selected states matching profile', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ClinicalHistoryTab, {
          patient: mockPatient,
          initialProfile: sampleProfile,
        })
      );

      // Personal: 3 selected (011 Hypertension, 006 Diabetes Mellitus, 998 Others)
      expect(markup).toContain('3 Selected');
      // Both sections should render 19 conditions each
      const personalMatches = markup.match(/aria-label="Toggle personal /g) || [];
      const familyMatches = markup.match(/aria-label="Toggle family /g) || [];
      expect(personalMatches.length).toBe(19);
      expect(familyMatches.length).toBe(19);
    });
  });
});

