// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    placeholder,
    value,
    onPress,
    title,
    disabled,
  }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(accessibilityState?.disabled || disabled ? { 'aria-disabled': 'true' } : {}),
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
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  default: 'Svg',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

let mockAuthUser: any = {
  id: 'staff-doc-001',
  name: 'Dr. Jose Rizal',
  role: 'Doctor',
};
let mockAuthState = 'signedIn';
let mockPermissionsList: string[] = [
  'appointments:read',
  'queue:read',
  'queue:call',
  'queue:complete',
  'triage:read',
  'consultations:read',
  'consultations:write',
  'consultations:sign',
  'patients:read',
  'patients:write',
  'documents:read',
  'documents:issue',
  'records:read',
  'records:upload',
  'procedures:read',
  'procedures:write',
  'laborders:read',
  'laborders:write',
  'labresults:review',
  'services:read',
];

mock.module('../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    state: mockAuthState,
    permissions: mockPermissionsList,
    offline: false,
    notice: null,
    can: (p: string) => mockPermissionsList.includes(p),
  }),
  usePermission: (perm: string) => mockPermissionsList.includes(perm),
}));

const apiCalls: { method: string; url: string; payload?: any }[] = [];

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async (url: string) => {
      apiCalls.push({ method: 'GET', url });
      return [null, null];
    },
    put: async (url: string, payload?: any) => {
      apiCalls.push({ method: 'PUT', url, payload });
      if (!mockPermissionsList.includes('patients:write')) {
        return [
          null,
          {
            status: 403,
            message: "Forbidden: Insufficient permissions. Required permission 'patients:write' is not granted for this clinic role.",
          },
        ];
      }
      return [payload ?? { id: 'updated-1' }, null];
    },
    post: async (url: string, payload?: any) => {
      apiCalls.push({ method: 'POST', url, payload });
      if (!mockPermissionsList.includes('patients:write')) {
        return [
          null,
          {
            status: 403,
            message: "Forbidden: Insufficient permissions. Required permission 'patients:write' is not granted for this clinic role.",
          },
        ];
      }
      return [{ id: 'created-1', ...(payload || {}) }, null];
    },
    patch: async (url: string, payload?: any) => {
      apiCalls.push({ method: 'PATCH', url, payload });
      if (!mockPermissionsList.includes('patients:write')) {
        return [
          null,
          {
            status: 403,
            message: "Forbidden: Insufficient permissions. Required permission 'patients:write' is not granted for this clinic role.",
          },
        ];
      }
      return [{ id: 'patched-1', ...(payload || {}) }, null];
    },
    delete: async (url: string) => {
      apiCalls.push({ method: 'DELETE', url });
      if (!mockPermissionsList.includes('patients:write')) {
        return [
          null,
          {
            status: 403,
            message: "Forbidden: Insufficient permissions. Required permission 'patients:write' is not granted for this clinic role.",
          },
        ];
      }
      return [true, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const { clinicService } = await import('../services/clinicService');
const { default: HealthProfilesTab } = await import('../components/chart/HealthProfilesTab');
const { default: ClinicalHistoryTab, defaultPhilHealthProfile } = await import('../components/chart/ClinicalHistoryTab');
const { default: LifestyleSocialTab } = await import('../components/chart/LifestyleSocialTab');
const { default: ReproductiveHealthTab } = await import('../components/chart/ReproductiveHealthTab');
const { default: CardiometabolicRiskTab } = await import('../components/chart/CardiometabolicRiskTab');

type ClinicPatient = import('../services/clinicService').ClinicPatient;

const renderHtml = (element: React.ReactElement) =>
  renderToStaticMarkup(element).replaceAll('&#x27;', "'").replaceAll('&amp;', '&');

describe('Issue #52 — Consultations Patient Chart Profile RBAC & Doctor Permissions', () => {
  const femalePatient: ClinicPatient = {
    id: 'pat-issue52-001',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    firstName: 'Maria',
    lastName: 'Clara',
    dateOfBirth: '1988-05-12',
    age: 38,
    gender: 'Female',
    philHealthNumber: '12-345678901-2',
    status: 'Active',
  };

  beforeEach(() => {
    apiCalls.length = 0;
    mockAuthUser = {
      id: 'staff-doc-001',
      name: 'Dr. Jose Rizal',
      role: 'Doctor',
    };
    mockAuthState = 'signedIn';
    mockPermissionsList = [
      'appointments:read',
      'queue:read',
      'queue:call',
      'queue:complete',
      'triage:read',
      'consultations:read',
      'consultations:write',
      'consultations:sign',
      'patients:read',
      'patients:write',
      'documents:read',
      'documents:issue',
      'records:read',
      'records:upload',
      'procedures:read',
      'procedures:write',
      'laborders:read',
      'laborders:write',
      'labresults:review',
      'services:read',
    ];
  });

  describe('1. Doctor / Attending Physician Role (Authorized with patients:write)', () => {
    test('1.1 HealthProfilesTab and all 4 sub-tabs render in editable mode without read-only restriction banners', () => {
      const surgicalMarkup = renderHtml(
        React.createElement(HealthProfilesTab, {
          patient: femalePatient,
          profile: defaultPhilHealthProfile,
          initialSubTab: 'surgical',
        })
      );
      expect(surgicalMarkup).not.toContain('Read-Only Clinical Profile View');
      expect(surgicalMarkup).not.toContain("Read-only mode: 'patients:write' permission is required");
      expect(surgicalMarkup).toContain('Save Medical & Family History');

      const lifestyleMarkup = renderHtml(
        React.createElement(LifestyleSocialTab, {
          patient: femalePatient,
        })
      );
      expect(lifestyleMarkup).not.toContain("Read-only mode: 'patients:write' permission is required");
      expect(lifestyleMarkup).toContain('Save Lifestyle Profile');

      const reproductiveMarkup = renderHtml(
        React.createElement(ReproductiveHealthTab, {
          patient: femalePatient,
        })
      );
      expect(reproductiveMarkup).not.toContain("Read-only mode: 'patients:write' permission is required");
      expect(reproductiveMarkup).toContain("Save Women's Health Profile");

      const cardiometabolicMarkup = renderHtml(
        React.createElement(CardiometabolicRiskTab, {
          patient: femalePatient,
        })
      );
      expect(cardiometabolicMarkup).not.toContain("Read-only mode: 'patients:write' permission is required");
      expect(cardiometabolicMarkup).toContain('Record Cardiometabolic Assessment');
    });

    test('1.2 Doctor role successfully saves records across all 4 Patient Chart Profile sections', async () => {
      // Section 1: Surgical & Clinical (Medical/Family History, Allergies, Problem List, Surgical History, Physical Exam)
      const [profileRes, profileErr] = await clinicService.updatePhilHealthPatientProfile(
        femalePatient.id,
        defaultPhilHealthProfile
      );
      expect(profileErr).toBeNull();
      expect(profileRes).not.toBeNull();

      const [allergyRes, allergyErr] = await clinicService.createPatientAllergy(femalePatient.id, {
        category: 'Medication',
        allergen: 'Penicillin',
        severity: 'Severe',
        isAnaphylactic: true,
      });
      expect(allergyErr).toBeNull();
      expect(allergyRes?.allergen).toBe('Penicillin');

      const [problemRes, problemErr] = await clinicService.createPatientProblem(femalePatient.id, {
        icd10Code: 'I10',
        problemTitle: 'Essential (primary) hypertension',
        status: 'Active',
        severity: 'Moderate',
        isChronicNcd: true,
      });
      expect(problemErr).toBeNull();
      expect(problemRes?.icd10Code).toBe('I10');

      const [surgRes, surgErr] = await clinicService.addSurgicalHistory(femalePatient.id, {
        procedureName: 'Laparoscopic Cholecystectomy',
        surgeryDate: '2022-04-10',
      });
      expect(surgErr).toBeNull();
      expect(surgRes?.procedureName).toBe('Laparoscopic Cholecystectomy');

      // Section 2: Lifestyle & Social
      const [socialRes, socialErr] = await clinicService.updateSocialHistory(femalePatient.id, {
        isSmoker: false,
        smokingStatus: 'never',
        isAlcoholDrinker: false,
        alcoholStatus: 'never',
        usesIllicitDrugs: false,
        isSexuallyActive: true,
        physicalActivityFrequency: 'Moderate Activity (≥150 mins/week)',
        dietaryHabits: 'Standard Balanced Diet',
      });
      expect(socialErr).toBeNull();
      expect(socialRes).not.toBeNull();

      // Section 3: Reproductive / OB-GYN
      const [reproRes, reproErr] = await clinicService.updateReproductiveHistory(femalePatient.id, {
        isApplicable: true,
        menarcheAge: 12,
        isMenopausal: false,
        receivedFamilyPlanningCounseling: true,
        gravidity: 2,
        parity: 2,
        termBirths: 2,
        pretermBirths: 0,
        abortions: 0,
        livingChildren: 2,
        hadPreEclampsiaHypertension: false,
      });
      expect(reproErr).toBeNull();
      expect(reproRes).not.toBeNull();

      // Section 4: Cardiometabolic & NCD
      const [ncdRes, ncdErr] = await clinicService.saveNcdRiskAssessment(femalePatient.id, {
        riskBand: 'BandA',
        calculatedRiskScorePercent: 5,
        eatsProcessedFoodWeekly: false,
        threeServingsVegetablesDaily: true,
        twoToThreeServingsFruitDaily: true,
        physicalActivityAtLeast150MinsWeekly: true,
        diagnosedDiabetes: 'N',
      });
      expect(ncdErr).toBeNull();
      expect(ncdRes?.riskBand).toBe('BandA');
    });
  });

  describe('2. Restricted Roles Without patients:write (UI & Backend Enforcement Consistency)', () => {
    beforeEach(() => {
      mockAuthUser = {
        id: 'staff-dpo-001',
        name: 'Compliance Officer',
        role: 'Admin',
      };
      mockPermissionsList = ['patients:read', 'audit:read', 'audit:export', 'reports:read'];
    });

    test('2.1 HealthProfilesTab displays read-only alert banner and disables mutation actions across all 4 sections', () => {
      const surgicalMarkup = renderHtml(
        React.createElement(HealthProfilesTab, {
          patient: femalePatient,
          profile: defaultPhilHealthProfile,
          initialSubTab: 'surgical',
        })
      );
      expect(surgicalMarkup).toContain('Read-Only Clinical Profile View');
      expect(surgicalMarkup).toContain("Read-only mode: 'patients:write' permission is required to save surgical & clinical profile changes.");
      expect(surgicalMarkup).toContain('aria-disabled="true"');

      const lifestyleMarkup = renderHtml(
        React.createElement(LifestyleSocialTab, {
          patient: femalePatient,
        })
      );
      expect(lifestyleMarkup).toContain("Read-only mode: 'patients:write' permission is required to save lifestyle changes.");
      expect(lifestyleMarkup).toContain('aria-disabled="true"');

      const reproductiveMarkup = renderHtml(
        React.createElement(ReproductiveHealthTab, {
          patient: femalePatient,
        })
      );
      expect(reproductiveMarkup).toContain("Read-only mode: 'patients:write' permission is required to save reproductive health changes.");
      expect(reproductiveMarkup).toContain('aria-disabled="true"');

      const cardiometabolicMarkup = renderHtml(
        React.createElement(CardiometabolicRiskTab, {
          patient: femalePatient,
        })
      );
      expect(cardiometabolicMarkup).toContain("Read-only mode: 'patients:write' permission is required to save cardiometabolic & NCD assessments.");
      expect(cardiometabolicMarkup).toContain('aria-disabled="true"');
    });

    test('2.2 Restricted role receives 403 Forbidden if attempting direct API mutations without patients:write', async () => {
      const [profileRes, profileErr] = await clinicService.updatePhilHealthPatientProfile(
        femalePatient.id,
        defaultPhilHealthProfile
      );
      expect(profileRes).toBeNull();
      expect(profileErr?.status).toBe(403);
      expect(profileErr?.message).toContain("Required permission 'patients:write' is not granted");
    });
  });
});
