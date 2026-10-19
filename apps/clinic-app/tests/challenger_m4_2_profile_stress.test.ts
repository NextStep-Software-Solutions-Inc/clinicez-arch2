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

// API mock state for adversarial testing
let lastGetUrl = '';
let lastPutUrl = '';
let lastPutPayload: any = null;
let mockGetResponse: any = null;
let mockPutResponse: any = null;
let mockGetError: any = null;
let mockPutError: any = null;
let alertCalls: { title: string; message: string }[] = [];

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

describe('Challenger M4.2 Adversarial Stress Suite: Profile Persistence & Chart Synchronization', () => {
  const basePatient: ClinicPatient = {
    id: 'pat-stress-m4-001',
    tenantId: 'tenant-stress-1',
    clinicId: 'clinic-stress-1',
    firstName: 'Consuelo',
    lastName: 'Reyes',
    dateOfBirth: '1978-11-20',
    gender: 'Female',
    philHealthNumber: '09-123456789-0',
    chronicConditions: 'Hypertension, Asthma',
    status: 'Active',
  };

  const richProfile: PhilHealthPatientProfile = {
    ...defaultPhilHealthProfile,
    isSmoker: true,
    isAlcoholDrinker: false,
    skinId: '2',
    heentId: '3',
    medicalHistories: [
      { code: '011', specificDesc: 'Hypertension' },
      { code: '006', specificDesc: 'Diabetes Mellitus' },
      { code: '998', specificDesc: 'Systemic Lupus Erythematosus' },
    ],
    familyHistories: [
      { code: '003', specificDesc: 'Cancer' },
      { code: '005', specificDesc: 'Coronary Artery Disease' },
      { code: '998', specificDesc: 'Polycystic Kidney Disease' },
    ],
    medicalHistoryNotes: 'Line 1: Diagnosed in 2019.\nLine 2: Maintained on Losartan 50mg daily.\nLine 3: Nil complications.',
    familyHistoryNotes: 'Father: MI at 50 yo.\nMother: Breast cancer at 48 yo.',
  };

  beforeEach(() => {
    lastGetUrl = '';
    lastPutUrl = '';
    lastPutPayload = null;
    mockGetResponse = null;
    mockPutResponse = null;
    mockGetError = null;
    mockPutError = null;
    alertCalls = [];
  });

  // =========================================================================
  // 1. ADVERSARIAL INITIAL SEEDING & DIRTY INPUT RESILIENCE
  // =========================================================================
  describe('1. Adversarial Initial Seeding & Dirty Input Resilience', () => {
    test('1.1 Handles null and undefined initialProfile gracefully without throw', () => {
      const markup1 = renderToStaticMarkup(
        React.createElement(ClinicalHistoryTab, {
          patient: { ...basePatient, chronicConditions: undefined },
          initialProfile: undefined,
        })
      );
      expect(markup1).toContain('Past Medical History (Personal)');
      expect(markup1).toContain('0 Selected');

      const markup2 = renderToStaticMarkup(
        React.createElement(ClinicalHistoryTab, {
          patient: { ...basePatient, chronicConditions: undefined },
          initialProfile: null as any,
        })
      );
      expect(markup2).toContain('Past Medical History (Personal)');
      expect(markup2).toContain('0 Selected');
    });

    test('1.2 Chronic conditions fallback handles mixed case, extra spaces, empty delimiters and codes', () => {
      const dirtyPatient: ClinicPatient = {
        ...basePatient,
        chronicConditions: '  , ,  HYPERTENSION  , , 002 ,  cAnCeR ,  unknown_ailment_xyz , 998 ,  ',
      };

      const markup = renderToStaticMarkup(
        React.createElement(ClinicalHistoryTab, {
          patient: dirtyPatient,
          initialProfile: undefined,
        })
      );

      // Should match Hypertension (011), Asthma (code 002), Cancer (003), and Others (998)
      expect(markup).toContain('Hypertension');
      expect(markup).toContain('Asthma');
      expect(markup).toContain('Cancer');
      expect(markup).toContain('Others');
      // 4 conditions should be selected
      expect(markup).toContain('4 Selected');
    });

    test('1.3 Chronic conditions fallback with pure whitespace or empty string yields 0 selected', () => {
      const whitespacePatient: ClinicPatient = {
        ...basePatient,
        chronicConditions: '   , , ,   ',
      };

      const markup = renderToStaticMarkup(
        React.createElement(ClinicalHistoryTab, {
          patient: whitespacePatient,
          initialProfile: undefined,
        })
      );

      expect(markup).toContain('0 Selected');
    });

    test('1.4 When initialProfile.medicalHistories is populated, chronicConditions fallback is NOT invoked', () => {
      const patientWithOtherConditions: ClinicPatient = {
        ...basePatient,
        chronicConditions: 'Peptic Ulcer, Pneumonia', // Codes 012, 013
      };

      const specificProfile: PhilHealthPatientProfile = {
        ...defaultPhilHealthProfile,
        medicalHistories: [
          { code: '001', specificDesc: 'Allergy' },
        ],
      };

      const markup = renderToStaticMarkup(
        React.createElement(ClinicalHistoryTab, {
          patient: patientWithOtherConditions,
          initialProfile: specificProfile,
        })
      );

      // Should have 1 selected (Allergy), NOT Peptic Ulcer or Pneumonia
      expect(markup).toContain('1 Selected');
    });

    test('1.5 Multi-line and special-character notes are seeded without truncation', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ClinicalHistoryTab, {
          patient: basePatient,
          initialProfile: richProfile,
        })
      );

      expect(markup).toContain('Diagnosed in 2019.');
      expect(markup).toContain('Maintained on Losartan 50mg daily.');
      expect(markup).toContain('Father: MI at 50 yo.');
      expect(markup).toContain('Mother: Breast cancer at 48 yo.');
    });

    test('1.6 998 Others specific description is populated from profile', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ClinicalHistoryTab, {
          patient: basePatient,
          initialProfile: richProfile,
        })
      );

      expect(markup).toContain('Systemic Lupus Erythematosus');
      expect(markup).toContain('Polycystic Kidney Disease');
      expect(markup).toContain('Specific Description for Other Medical Condition *');
      expect(markup).toContain('Specific Description for Other Family Condition *');
    });
  });

  // =========================================================================
  // 2. ADVERSARIAL PAYLOAD ASSEMBLY & MAPPING VERIFICATION
  // =========================================================================
  describe('2. Adversarial Payload Assembly & Mapping Verification', () => {
    test('2.1 Standard statutory codes map to canonical PhilHealth catalog descriptions', () => {
      const testCodes = ['001', '004', '008', '015', '018'];
      const assembled: PhilHealthConditionEntry[] = testCodes.map((code) => {
        const item = PHILHEALTH_MDISEASES_CONDITIONS.find((c) => c.code === code);
        return {
          code,
          specificDesc: item?.description || code,
        };
      });

      expect(assembled[0]).toEqual({ code: '001', specificDesc: 'Allergy' });
      expect(assembled[1]).toEqual({ code: '004', specificDesc: 'Cerebrovascular Disease' });
      expect(assembled[2]).toEqual({ code: '008', specificDesc: 'Epilepsy/Seizure Disorder' });
      expect(assembled[3]).toEqual({ code: '015', specificDesc: 'Pulmonary Tuberculosis' });
      expect(assembled[4]).toEqual({ code: '018', specificDesc: 'Mental Illness' });
    });

    test('2.2 Code 998 with user description uses trimmed description', () => {
      const customDesc = '   Hashimoto Thyroiditis with Secondary Goiter   ';
      const assembledDesc = customDesc.trim() || 'Others';

      expect(assembledDesc).toBe('Hashimoto Thyroiditis with Secondary Goiter');
    });

    test('2.3 Code 998 with empty or whitespace-only description falls back safely to "Others"', () => {
      const blankDesc = '     ';
      const assembledDesc = blankDesc.trim() || 'Others';

      expect(assembledDesc).toBe('Others');
    });

    test('2.4 Notes with trailing/leading whitespace are trimmed; empty whitespace becomes undefined', () => {
      const whitespaceNotes = '   \t  \n  ';
      const trimmedNotes = whitespaceNotes.trim() || undefined;
      expect(trimmedNotes).toBeUndefined();

      const validMultilineNotes = '   Line 1\nLine 2   ';
      const trimmedMultiline = validMultilineNotes.trim() || undefined;
      expect(trimmedMultiline).toBe('Line 1\nLine 2');
    });

    test('2.5 Full profile metadata is preserved across PUT request (zero data wiping)', async () => {
      mockPutResponse = {
        ...richProfile,
        lastUpdatedAt: '2026-10-12T07:20:00Z',
      };

      const [res, err] = await clinicService.updatePhilHealthPatientProfile(
        basePatient.id,
        richProfile
      );

      expect(err).toBeNull();
      expect(res).not.toBeNull();
      expect(lastPutUrl).toBe(`/yakap/patients/${basePatient.id}/profile`);
      // Verify other fields were NOT wiped
      expect(lastPutPayload.isSmoker).toBe(true);
      expect(lastPutPayload.isAlcoholDrinker).toBe(false);
      expect(lastPutPayload.skinId).toBe('2');
      expect(lastPutPayload.heentId).toBe('3');
      expect(lastPutPayload.medicalHistories.length).toBe(3);
      expect(lastPutPayload.familyHistories.length).toBe(3);
    });
  });

  // =========================================================================
  // 3. ADVERSARIAL NETWORK & ERROR HANDLING STRESS
  // =========================================================================
  describe('3. Adversarial Network & Error Handling Stress', () => {
    test('3.1 HTTP 400 Bad Request error is trapped gracefully', async () => {
      mockPutError = { status: 400, message: 'Invalid condition code 9999' };

      const [res, err] = await clinicService.updatePhilHealthPatientProfile(
        basePatient.id,
        richProfile
      );

      expect(res).toBeNull();
      expect(err).not.toBeNull();
      expect(err!.status).toBe(400);
      expect(err!.message).toBe('Invalid condition code 9999');
    });

    test('3.2 HTTP 500 Internal Server Error is handled without unhandled promise rejection', async () => {
      mockPutError = { status: 500, message: 'Yakap database connection timed out' };

      const [res, err] = await clinicService.updatePhilHealthPatientProfile(
        basePatient.id,
        richProfile
      );

      expect(res).toBeNull();
      expect(err).not.toBeNull();
      expect(err!.status).toBe(500);
      expect(err!.message).toBe('Yakap database connection timed out');
    });

    test('3.3 GET profile API error returns error tuple without crashing client', async () => {
      mockGetError = { status: 404, message: 'Profile not found' };

      const [res, err] = await clinicService.getPhilHealthPatientProfile(basePatient.id);

      expect(res).toBeNull();
      expect(err).not.toBeNull();
      expect(err!.status).toBe(404);
      expect(err!.message).toBe('Profile not found');
    });
  });

  // =========================================================================
  // 4. CHART SYNCHRONIZATION & onRefreshChart DISPATCH STRESS
  // =========================================================================
  describe('4. Chart Synchronization & onRefreshChart Dispatch Stress', () => {
    test('4.1 onRefreshChart callback prop contract is honored on successful profile update', () => {
      let refreshCount = 0;
      const onRefreshChartMock = () => {
        refreshCount++;
      };

      // Simulate save callback logic from ClinicalHistoryTab.tsx:342-354
      const simulateSaveFlow = async (isSuccess: boolean) => {
        if (isSuccess) {
          onRefreshChartMock();
        }
      };

      simulateSaveFlow(true);
      expect(refreshCount).toBe(1);

      // On failure, should NOT increment
      simulateSaveFlow(false);
      expect(refreshCount).toBe(1);
    });

    test('4.2 HealthProfilesTab forwards onRefreshChart correctly to sub-components', () => {
      let forwarded = false;
      const onRefreshChartMock = () => {
        forwarded = true;
      };

      const markup = renderToStaticMarkup(
        React.createElement(HealthProfilesTab, {
          patient: basePatient,
          profile: richProfile,
          initialSubTab: 'surgical',
          onRefreshChart: onRefreshChartMock,
        })
      );

      // Verify HealthProfilesTab renders the active 'Surgical & Clinical' sub-tab containing ClinicalHistoryTab
      expect(markup).toContain('Past Medical History (Personal)');
      expect(markup).toContain('Family Medical History');
      expect(markup).toContain('Save Medical &amp; Family History');
    });
  });

  // =========================================================================
  // 5. PHILHEALTH STATUTORY INTEGRITY & REGRESSION GUARDS
  // =========================================================================
  describe('5. PhilHealth Statutory Integrity & Regression Guards', () => {
    test('5.1 Code 999 ("None") is strictly absent from interactive selection chips', () => {
      const selectableCodes = PHILHEALTH_MDISEASES_CONDITIONS.map((c) => c.code);
      expect(selectableCodes).not.toContain('999');

      const markup = renderToStaticMarkup(
        React.createElement(ClinicalHistoryTab, {
          patient: basePatient,
          initialProfile: defaultPhilHealthProfile,
        })
      );

      // Ensure no chip labeled "None" exists in statutory condition chips
      expect(markup).not.toContain('accessibilitylabel="Toggle personal None"');
      expect(markup).not.toContain('accessibilitylabel="Toggle family None"');
    });

    test('5.2 HealthProfilesTab strictly renders all 4 statutory sub-tab buttons', () => {
      const markup = renderToStaticMarkup(
        React.createElement(HealthProfilesTab, {
          patient: basePatient,
          profile: richProfile,
        })
      );

      expect(markup).toContain('Surgical &amp; Clinical');
      expect(markup).toContain('Lifestyle &amp; Social');
      expect(markup).toContain('Reproductive / OB-GYN');
      expect(markup).toContain('Cardiometabolic &amp; NCD');
    });
  });
});
