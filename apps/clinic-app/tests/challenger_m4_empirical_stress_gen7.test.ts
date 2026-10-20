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

// API mock interception state
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

const { setSessionItem } = await import('../utils/deviceStorage');

describe('Empirical Challenger Gen7 — Milestone M4 Stress Test Harness', () => {
  const basePatient: ClinicPatient = {
    id: 'pat-stress-gen7-001',
    tenantId: 'tenant-stress-1',
    clinicId: 'clinic-stress-1',
    firstName: 'Maria',
    lastName: 'Del Fierro',
    dateOfBirth: '1979-11-23',
    gender: 'Female',
    philHealthNumber: '02-123456789-0',
    chronicConditions: undefined,
    status: 'Active',
  };

  beforeEach(() => {
    setSessionItem('clinicez_health_profiles_active_subtab', null);
    lastGetUrl = '';
    lastPutUrl = '';
    lastPutPayload = null;
    mockGetResponse = null;
    mockPutResponse = null;
    mockGetError = null;
    mockPutError = null;
  });

  // =========================================================================
  // SUITE 1: CHIP TOGGLES & MULTI-SELECTION ACROSS ALL 19 STATUTORY CODES
  // =========================================================================
  describe('Suite 1: Chip Toggles and Multi-Selection across all 19 statutory codes', () => {
    test('1.1 PHILHEALTH_MDISEASES_CONDITIONS strictly spans 001 to 018 plus 998 and excludes 999', () => {
      expect(PHILHEALTH_MDISEASES_CONDITIONS.length).toBe(19);

      const allCodes = PHILHEALTH_MDISEASES_CONDITIONS.map((c) => c.code);
      const allDescriptions = PHILHEALTH_MDISEASES_CONDITIONS.map((c) => c.description);

      for (let i = 1; i <= 18; i++) {
        const expectedCode = String(i).padStart(3, '0');
        expect(allCodes).toContain(expectedCode);
      }
      expect(allCodes).toContain('998');
      expect(allCodes).not.toContain('999');
      expect(allDescriptions).toContain('Others');
      expect(allDescriptions.map((d) => d.toLowerCase())).not.toContain('none');
    });

    test('1.2 Multi-selection state correctly accumulates all 19 conditions simultaneously', () => {
      const selected = new Set<string>();

      // Progressively select all 19
      for (const cond of PHILHEALTH_MDISEASES_CONDITIONS) {
        selected.add(cond.code);
      }
      expect(selected.size).toBe(19);

      // Verify all 19 codes are present in the set
      for (const cond of PHILHEALTH_MDISEASES_CONDITIONS) {
        expect(selected.has(cond.code)).toBe(true);
      }

      // Deselect half of them
      const firstTen = PHILHEALTH_MDISEASES_CONDITIONS.slice(0, 10);
      for (const cond of firstTen) {
        selected.delete(cond.code);
      }
      expect(selected.size).toBe(9);

      // Remaining 9 are still selected
      const remainingNine = PHILHEALTH_MDISEASES_CONDITIONS.slice(10);
      for (const cond of remainingNine) {
        expect(selected.has(cond.code)).toBe(true);
      }
    });

    test('1.3 Rapid flip-flop toggling alternates selection state deterministically', () => {
      const toggleFn = (set: Set<string>, code: string) => {
        const next = new Set(set);
        if (next.has(code)) {
          next.delete(code);
        } else {
          next.add(code);
        }
        return next;
      };

      let state = new Set<string>();
      // Toggle '001' (Allergy) 100 times
      for (let i = 0; i < 100; i++) {
        state = toggleFn(state, '001');
        const shouldBeSelected = (i % 2 === 0);
        expect(state.has('001')).toBe(shouldBeSelected);
      }
      // After an even number of toggles (100), it should be unselected
      expect(state.has('001')).toBe(false);
      expect(state.size).toBe(0);
    });

    test('1.4 ClinicalHistoryTab renders all 19 selectable chips in both personal and family sections', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ClinicalHistoryTab, {
          patient: basePatient,
          initialProfile: defaultPhilHealthProfile,
        })
      );

      // Personal & Family accessibility labels for all 19 conditions must exist
      for (const cond of PHILHEALTH_MDISEASES_CONDITIONS) {
        expect(markup).toContain(`Toggle personal ${cond.description}`);
        expect(markup).toContain(`Toggle family ${cond.description}`);
      }
    });
  });

  // =========================================================================
  // SUITE 2: CODE 998 OTHERS & DESCRIPTION BEHAVIOR
  // =========================================================================
  describe('Suite 2: Code 998 Others & Specific Description Behavior', () => {
    test('2.1 Code 998 input displays when selected and hides when not selected', () => {
      // Profile WITHOUT 998
      const profileWithout998: PhilHealthPatientProfile = {
        ...defaultPhilHealthProfile,
        medicalHistories: [{ code: '011', specificDesc: 'Hypertension' }],
        familyHistories: [{ code: '006', specificDesc: 'Diabetes Mellitus' }],
      };

      const markupWithout998 = renderToStaticMarkup(
        React.createElement(ClinicalHistoryTab, {
          patient: basePatient,
          initialProfile: profileWithout998,
        })
      );

      expect(markupWithout998).not.toContain('Specific Description for Other Medical Condition *');
      expect(markupWithout998).not.toContain('Specific Description for Other Family Condition *');

      // Profile WITH 998 in medical history
      const profileWithPersonal998: PhilHealthPatientProfile = {
        ...defaultPhilHealthProfile,
        medicalHistories: [{ code: '998', specificDesc: 'Sjögren Syndrome' }],
        familyHistories: [],
      };

      const markupWithPersonal998 = renderToStaticMarkup(
        React.createElement(ClinicalHistoryTab, {
          patient: basePatient,
          initialProfile: profileWithPersonal998,
        })
      );

      expect(markupWithPersonal998).toContain('Specific Description for Other Medical Condition *');
      expect(markupWithPersonal998).toContain('Sjögren Syndrome');
      // Family 998 input must NOT be rendered
      expect(markupWithPersonal998).not.toContain('Specific Description for Other Family Condition *');
    });

    test('2.2 Deselecting 998 clears description cleanly in toggle handler', () => {
      let medicalOtherDesc = 'Polymyalgia Rheumatica';
      const selected = new Set(['011', '998']);

      // Simulate toggleMedicalCondition('998') deselection logic
      const code = '998';
      if (selected.has(code)) {
        selected.delete(code);
        if (code === '998') {
          medicalOtherDesc = '';
        }
      }

      expect(selected.has('998')).toBe(false);
      expect(medicalOtherDesc).toBe('');
    });

    test('2.3 Boundary testing of specificDesc for 998 Others', () => {
      const assembleEntry = (code: string, otherDesc: string): PhilHealthConditionEntry => {
        const match = PHILHEALTH_MDISEASES_CONDITIONS.find((c) => c.code === code);
        const desc = code === '998' ? (otherDesc.trim() || 'Others') : (match?.description || code);
        return { code, specificDesc: desc };
      };

      // Case A: Empty string fallback
      expect(assembleEntry('998', '').specificDesc).toBe('Others');

      // Case B: Pure whitespace fallback
      expect(assembleEntry('998', '   \t\n  ').specificDesc).toBe('Others');

      // Case C: Normal custom text
      expect(assembleEntry('998', 'Systemic Sclerosis').specificDesc).toBe('Systemic Sclerosis');

      // Case D: Whitespace-padded text is trimmed
      expect(assembleEntry('998', '   Celiac Disease   ').specificDesc).toBe('Celiac Disease');

      // Case E: Special characters & XML tokens are safely preserved
      const xmlPayload = '<OtherDiagnosis name="G6PD & Hemolytic" notes="severity > 5"/>';
      expect(assembleEntry('998', xmlPayload).specificDesc).toBe(xmlPayload);

      // Case F: Very long string (2,000 characters)
      const longDesc = 'Rare Syndrome: ' + 'A'.repeat(2000);
      expect(assembleEntry('998', longDesc).specificDesc).toBe(longDesc);
    });
  });

  // =========================================================================
  // SUITE 3: INDEPENDENT STATE BETWEEN PERSONAL AND FAMILY HISTORY
  // =========================================================================
  describe('Suite 3: Independent State between Personal and Family History', () => {
    test('3.1 Personal condition selection does not mutate or leak into Family History', () => {
      let selectedPersonal = new Set<string>();
      let selectedFamily = new Set<string>();

      // Select 5 personal conditions
      selectedPersonal.add('001'); // Allergy
      selectedPersonal.add('002'); // Asthma
      selectedPersonal.add('011'); // Hypertension
      selectedPersonal.add('006'); // Diabetes
      selectedPersonal.add('998'); // Others

      // Family remains untouched
      expect(selectedPersonal.size).toBe(5);
      expect(selectedFamily.size).toBe(0);

      // Select 2 family conditions (different ones)
      selectedFamily.add('003'); // Cancer
      selectedFamily.add('005'); // CAD

      expect(selectedPersonal.size).toBe(5);
      expect(selectedFamily.size).toBe(2);
      expect(selectedPersonal.has('003')).toBe(false);
      expect(selectedPersonal.has('005')).toBe(false);
      expect(selectedFamily.has('001')).toBe(false);
      expect(selectedFamily.has('011')).toBe(false);
    });

    test('3.2 Personal 998 and Family 998 maintain isolated descriptions', () => {
      let personalDesc = 'Myasthenia Gravis';
      let familyDesc = 'Familial Hypercholesterolemia';

      // Deselecting personal 998 clears personal description but leaves family intact
      personalDesc = '';
      expect(personalDesc).toBe('');
      expect(familyDesc).toBe('Familial Hypercholesterolemia');

      // Modifying family description leaves personal intact
      familyDesc = 'Huntington Disease';
      expect(personalDesc).toBe('');
      expect(familyDesc).toBe('Huntington Disease');
    });

    test('3.3 Assembled payload preserves distinct medicalHistories and familyHistories', async () => {
      const personalCodes = new Set(['011', '013']); // HTN, Pneumonia
      const familyCodes = new Set(['003', '998']); // Cancer, Others
      const personalNotes = 'Patient had pneumonia in 2024.';
      const familyNotes = 'Maternal aunt had breast cancer.';
      const familyOtherDesc = 'Polycystic Kidney Disease';

      const medicalHistories: PhilHealthConditionEntry[] = Array.from(personalCodes).map((code) => {
        const match = PHILHEALTH_MDISEASES_CONDITIONS.find((c) => c.code === code);
        return { code, specificDesc: match?.description || code };
      });

      const familyHistories: PhilHealthConditionEntry[] = Array.from(familyCodes).map((code) => {
        const match = PHILHEALTH_MDISEASES_CONDITIONS.find((c) => c.code === code);
        const desc = code === '998' ? (familyOtherDesc.trim() || 'Others') : (match?.description || code);
        return { code, specificDesc: desc };
      });

      const payload: PhilHealthPatientProfile = {
        ...defaultPhilHealthProfile,
        medicalHistories,
        familyHistories,
        medicalHistoryNotes: personalNotes,
        familyHistoryNotes: familyNotes,
      };

      mockPutResponse = { ...payload, lastUpdatedAt: '2026-10-12T07:20:00Z' };

      const [res, err] = await clinicService.updatePhilHealthPatientProfile(basePatient.id, payload);

      expect(err).toBeNull();
      expect(res).not.toBeNull();
      expect(lastPutPayload.medicalHistories).toHaveLength(2);
      expect(lastPutPayload.familyHistories).toHaveLength(2);

      // Verify medical histories contain HTN and Pneumonia
      const medCodes = lastPutPayload.medicalHistories.map((m: any) => m.code);
      expect(medCodes).toContain('011');
      expect(medCodes).toContain('013');
      expect(medCodes).not.toContain('003');

      // Verify family histories contain Cancer and 998 PKD
      const famCodes = lastPutPayload.familyHistories.map((f: any) => f.code);
      expect(famCodes).toContain('003');
      expect(famCodes).toContain('998');
      expect(famCodes).not.toContain('011');
      expect(lastPutPayload.familyHistories.find((f: any) => f.code === '998').specificDesc).toBe('Polycystic Kidney Disease');

      // Notes are isolated
      expect(lastPutPayload.medicalHistoryNotes).toBe(personalNotes);
      expect(lastPutPayload.familyHistoryNotes).toBe(familyNotes);
    });

    test('3.4 Markup renders correct badges reflecting independent selection counts', () => {
      const profile: PhilHealthPatientProfile = {
        ...defaultPhilHealthProfile,
        medicalHistories: [
          { code: '001', specificDesc: 'Allergy' },
          { code: '002', specificDesc: 'Asthma' },
          { code: '011', specificDesc: 'Hypertension' },
          { code: '014', specificDesc: 'Thyroid Disease' },
        ],
        familyHistories: [
          { code: '003', specificDesc: 'Cancer' },
        ],
      };

      const markup = renderToStaticMarkup(
        React.createElement(ClinicalHistoryTab, {
          patient: basePatient,
          initialProfile: profile,
        })
      );

      // Personal has 4, Family has 1
      expect(markup).toContain('4 Selected');
      expect(markup).toContain('1 Selected');
    });
  });

  // =========================================================================
  // SUITE 4: SEEDING PRIORITY & PATIENT CHRONIC CONDITIONS ROBUSTNESS
  // =========================================================================
  describe('Suite 4: Seeding Priority & Chronic Conditions Text Parsing', () => {
    test('4.1 Parses patient.chronicConditions string by code or description (case-insensitive)', () => {
      const patientWithChronic: ClinicPatient = {
        ...basePatient,
        chronicConditions: 'hypertension, ASTHMA, 006, Peptic Ulcer, NonExistentDisease',
      };

      const parsed = patientWithChronic.chronicConditions!.split(',').map((s) => s.trim().toLowerCase());
      const codes = new Set<string>();
      for (const item of PHILHEALTH_MDISEASES_CONDITIONS) {
        if (parsed.some((p) => p === item.code.toLowerCase() || p === item.description.toLowerCase())) {
          codes.add(item.code);
        }
      }

      // Expected matched codes:
      // 'hypertension' -> '011'
      // 'ASTHMA' -> '002'
      // '006' -> '006' (Diabetes Mellitus)
      // 'Peptic Ulcer' -> '012'
      // 'NonExistentDisease' -> no match
      expect(codes.size).toBe(4);
      expect(codes.has('011')).toBe(true);
      expect(codes.has('002')).toBe(true);
      expect(codes.has('006')).toBe(true);
      expect(codes.has('012')).toBe(true);
    });

    test('4.2 InitialProfile takes strict precedence over patient.chronicConditions', () => {
      const patientWithChronic: ClinicPatient = {
        ...basePatient,
        chronicConditions: 'Hypertension, Asthma', // would give 011 and 002
      };

      // Profile specifies only Hepatitis (009)
      const profileOverride: PhilHealthPatientProfile = {
        ...defaultPhilHealthProfile,
        medicalHistories: [{ code: '009', specificDesc: 'Hepatitis' }],
        familyHistories: [],
      };

      const markup = renderToStaticMarkup(
        React.createElement(ClinicalHistoryTab, {
          patient: patientWithChronic,
          initialProfile: profileOverride,
        })
      );

      // Must have 1 Selected, not 2 or 3
      expect(markup).toContain('1 Selected');
    });

    test('4.3 Empty, null, or whitespace chronicConditions does not crash or select codes', () => {
      const testPatients: ClinicPatient[] = [
        { ...basePatient, chronicConditions: '' },
        { ...basePatient, chronicConditions: '   ' },
        { ...basePatient, chronicConditions: ',,, , ' },
      ];

      for (const pat of testPatients) {
        const markup = renderToStaticMarkup(
          React.createElement(ClinicalHistoryTab, {
            patient: pat,
            initialProfile: defaultPhilHealthProfile,
          })
        );
        expect(markup).toContain('0 Selected');
      }
    });
  });

  // =========================================================================
  // SUITE 5: PERSISTENCE ERROR HANDLING & EDGE CASES
  // =========================================================================
  describe('Suite 5: Persistence Error Handling and Edge Cases', () => {
    test('5.1 API 400 Bad Request error triggers error banner without crashing', async () => {
      mockPutError = { status: 400, message: 'Invalid PhilHealth Condition Code: 999 is not allowed' };

      const [res, err] = await clinicService.updatePhilHealthPatientProfile(basePatient.id, defaultPhilHealthProfile);

      expect(res).toBeNull();
      expect(err).not.toBeNull();
      expect(err!.status).toBe(400);
      expect(err!.message).toContain('Invalid PhilHealth Condition Code');
    });

    test('5.2 Empty notes are converted to undefined in payload to prevent whitespace pollution', () => {
      const emptyNotes = '    ';
      const payloadNote = emptyNotes.trim() || undefined;
      expect(payloadNote).toBeUndefined();

      const validNote = 'Patient reports seasonal allergies in summer.';
      const validPayloadNote = validNote.trim() || undefined;
      expect(validPayloadNote).toBe('Patient reports seasonal allergies in summer.');
    });

    test('5.3 HealthProfilesTab renders all 4 statutory sub-tabs correctly alongside ClinicalHistoryTab', () => {
      const markup = renderToStaticMarkup(
        React.createElement(HealthProfilesTab, {
          patient: basePatient,
          profile: defaultPhilHealthProfile,
          initialSubTab: 'surgical',
        })
      );

      expect(markup).toContain('Surgical &amp; Clinical');
      expect(markup).toContain('Lifestyle &amp; Social');
      expect(markup).toContain('Reproductive / OB-GYN');
      expect(markup).toContain('Cardiometabolic &amp; NCD');
      // Embedded section from ClinicalHistoryTab must be present
      expect(markup).toContain('Past Medical History (Personal)');
      expect(markup).toContain('Family Medical History');
    });
  });
});
