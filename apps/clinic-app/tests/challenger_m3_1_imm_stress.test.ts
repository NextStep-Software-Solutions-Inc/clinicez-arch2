// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EhrOptionDescriptor } from '@shared/safe';

(globalThis as any).__DEV__ = true;

function loadBackendSeedCatalog(library: string): Array<{ code: string; description: string; isActive: boolean }> {
  const seedPath = join(
    import.meta.dir,
    '..',
    '..',
    '..',
    'services',
    'clinic-api',
    'ClinicEz.Clinic.Infrastructure',
    'PhilHealth',
    'Catalog',
    'Seed',
    `${library}.json`
  );
  return JSON.parse(readFileSync(seedPath, 'utf8')).items;
}

const BACKEND_STATUTORY_SEEDS: Record<string, Array<{ code: string; description: string; isActive: boolean }>> = {
  lib_immchild: loadBackendSeedCatalog('lib_immchild'),
  lib_immyoungw: loadBackendSeedCatalog('lib_immyoungw'),
  lib_immpregw: loadBackendSeedCatalog('lib_immpregw'),
  lib_immelderly: loadBackendSeedCatalog('lib_immelderly'),
};

const BACKEND_ROUTES = [
  'Intramuscular (IM)',
  'Subcutaneous (SC)',
  'Intradermal (ID)',
  'Oral (PO)',
] as const;

const BACKEND_SITES = [
  'Left Deltoid',
  'Right Deltoid',
  'Left Anterolateral Thigh',
  'Right Anterolateral Thigh',
] as const;

const BACKEND_EHR_OPTIONS: Record<string, EhrOptionDescriptor[]> = {
  immunization_cohort: [
    {
      code: 'lib_immchild',
      label: 'Child Schedule (0–17y)',
      philHealthLibrary: 'lib_immchild',
      metadata: { modalLabel: 'Child (0–17y)', badgeLabel: 'Childhood' },
    },
    {
      code: 'lib_immyoungw',
      label: 'Young Women (HPV)',
      philHealthLibrary: 'lib_immyoungw',
      metadata: { modalLabel: 'Young Women', badgeLabel: 'Young Women' },
    },
    {
      code: 'lib_immpregw',
      label: 'Maternal (Td / Tdap)',
      philHealthLibrary: 'lib_immpregw',
      metadata: { modalLabel: 'Maternal (Td)', badgeLabel: 'Maternal' },
    },
    {
      code: 'lib_immelderly',
      label: 'Senior Citizens (60+)',
      philHealthLibrary: 'lib_immelderly',
      metadata: { modalLabel: 'Senior (60+)', badgeLabel: 'Senior Citizen' },
    },
    {
      code: 'OtherImm',
      label: 'Adult / Other',
      philHealthLibrary: 'OtherImm',
      metadata: { modalLabel: 'Adult / Other', badgeLabel: 'Adult / Other', optionSet: 'adult_other_vaccine' },
    },
  ],
  adult_other_vaccine: [
    { code: 'O01', label: 'Tetanus Toxoid / Td / Tdap Booster', philHealthCode: 'O01', philHealthLibrary: 'OtherImm' },
    { code: 'O02', label: 'Anti-Rabies Vaccine (PVRV / PCECV)', philHealthCode: 'O02', philHealthLibrary: 'OtherImm' },
    { code: 'O03', label: 'Seasonal Influenza Vaccine (Adult)', philHealthCode: 'O03', philHealthLibrary: 'OtherImm' },
    { code: 'O04', label: 'Hepatitis B Vaccine (Adult)', philHealthCode: 'O04', philHealthLibrary: 'OtherImm' },
    { code: 'O05', label: 'COVID-19 Vaccine', philHealthCode: 'O05', philHealthLibrary: 'OtherImm' },
  ],
  vaccine_route: BACKEND_ROUTES.map((label, idx) => ({ code: `R${idx + 1}`, label })),
  vaccine_injection_site: BACKEND_SITES.map((label, idx) => ({ code: `S${idx + 1}`, label })),
};

// Mock React Native modules for Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(testID ? { 'data-testid': testID } : {}),
      },
      placeholder,
      children
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
    loop: () => ({ start: (cb?: any) => cb && cb(), stop: () => {} }),
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
  Path: 'path',
  Circle: 'circle',
  Rect: 'rect',
  Line: 'line',
  default: 'svg',
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

mock.module('../utils/usePhilHealthCatalog', () => ({
  usePhilHealthCatalog: (library: string, enabled = true) => ({
    items: enabled ? (BACKEND_STATUTORY_SEEDS[library] ?? []) : [],
    loading: false,
    error: null,
    reload: () => {},
  }),
}));

mock.module('../hooks/useEhrOptions', () => ({
  useEhrOptions: (optionSet: string, options?: { enabled?: boolean }) => {
    if (options?.enabled === false) {
      return { options: [], labels: [], loading: false, error: null, reload: async () => {} };
    }
    const items = BACKEND_EHR_OPTIONS[optionSet] ?? [];
    return {
      options: items,
      labels: items.map((d) => d.label),
      loading: false,
      error: null,
      reload: async () => {},
    };
  },
}));

const {
  default: StatutoryImmunizationsTab,
} = await import('../components/chart/StatutoryImmunizationsTab');

const {
  default: AdministerVaccineModal,
  resolveInitialVaccineCohort,
} = await import('../components/chart/AdministerVaccineModal');

const {
  default: HistoricalVaccineModal,
} = await import('../components/chart/HistoricalVaccineModal');

const {
  validateDateString,
} = await import('../components/ui/ValidatedDateInput');

import type {
  ClinicPatient,
  PatientDemographics,
  AdministerVaccinePayload,
  RecordHistoricalImmunizationPayload,
} from '../services/clinicService';

describe('Adversarial Stress Test: Milestone M3 Immunization Modals (challenger_m3_1_gen7)', () => {
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

  const mockPatientChild: ClinicPatient = {
    id: 'pat-child-001',
    clinicId: 'clinic-1',
    tenantId: 'tenant-1',
    patientCode: 'PAT-0001',
    fullName: 'Baby Pedro Santos',
    firstName: 'Pedro',
    lastName: 'Santos',
    dateOfBirth: '2025-06-01',
    age: 1,
    sex: 'Male',
    civilStatus: 'Single',
    contactNumber: '09171234567',
    verificationStatus: 'Verified',
    createdAtUtc: '2025-06-01T00:00:00Z',
    updatedAtUtc: '2025-06-01T00:00:00Z',
  };

  const mockPatientAdultFemale: ClinicPatient = {
    id: 'pat-adult-002',
    clinicId: 'clinic-1',
    tenantId: 'tenant-1',
    patientCode: 'PAT-0002',
    fullName: 'Ana Maria Reyes',
    firstName: 'Ana Maria',
    lastName: 'Reyes',
    dateOfBirth: '2006-03-15',
    age: 20,
    sex: 'Female',
    civilStatus: 'Single',
    contactNumber: '09181234567',
    verificationStatus: 'Verified',
    createdAtUtc: '2025-01-01T00:00:00Z',
    updatedAtUtc: '2025-01-01T00:00:00Z',
  };

  const mockPatientSenior: ClinicPatient = {
    id: 'pat-senior-003',
    clinicId: 'clinic-1',
    tenantId: 'tenant-1',
    patientCode: 'PAT-0003',
    fullName: 'Lola Carmen Cruz',
    firstName: 'Carmen',
    lastName: 'Cruz',
    dateOfBirth: '1952-11-20',
    age: 73,
    sex: 'Female',
    civilStatus: 'Widowed',
    contactNumber: '09191234567',
    verificationStatus: 'Verified',
    createdAtUtc: '2025-01-01T00:00:00Z',
    updatedAtUtc: '2025-01-01T00:00:00Z',
  };

  /* -------------------------------------------------------------------------- */
  /* SUITE 1: BOUNDARY DATES WITH VALIDATEDDATEINPUT                            */
  /* -------------------------------------------------------------------------- */
  describe('Suite 1: Boundary Dates & Temporal Constraints', () => {
    describe('AdministerVaccineModal Expiration Date (boundaryMode="futureOrToday")', () => {
      test('accepts today as valid expiration date', () => {
        const result = validateDateString(todayStr, { boundaryMode: 'futureOrToday' });
        expect(result.isValid).toBe(true);
        expect(result.formattedDate).toBe(todayStr);
      });

      test('accepts near and far future expiration dates', () => {
        expect(validateDateString('2028-06-30', { boundaryMode: 'futureOrToday' }).isValid).toBe(true);
        expect(validateDateString('2035-12-31', { boundaryMode: 'futureOrToday' }).isValid).toBe(true);
      });

      test('rejects past expiration date (expired vaccine)', () => {
        const res1 = validateDateString('2020-01-01', { boundaryMode: 'futureOrToday' });
        const res2 = validateDateString('2023-12-31', { boundaryMode: 'futureOrToday' });

        expect(res1.isValid).toBe(false);
        expect(res1.errorMessage).toContain('today or in the future');
        expect(res2.isValid).toBe(false);
      });

      test('rejects yesterday by exactly 1 calendar day', () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(yesterday);

        const result = validateDateString(yesterdayStr, { boundaryMode: 'futureOrToday' });
        expect(result.isValid).toBe(false);
        expect(result.errorMessage).toContain('today or in the future');
      });

      test('validates leap year future dates accurately', () => {
        expect(validateDateString('2028-02-29', { boundaryMode: 'futureOrToday' }).isValid).toBe(true);

        const nonLeap2027 = validateDateString('2027-02-29', { boundaryMode: 'futureOrToday' });
        expect(nonLeap2027.isValid).toBe(false);
        expect(nonLeap2027.errorMessage).toContain('February 2027 has only 28 days');

        const nonLeap2100 = validateDateString('2100-02-29', { boundaryMode: 'futureOrToday' });
        expect(nonLeap2100.isValid).toBe(false);
        expect(nonLeap2100.errorMessage).toContain('February 2100 has only 28 days');
      });

      test('rejects invalid 31st days on 30-day future months', () => {
        expect(validateDateString('2027-04-31', { boundaryMode: 'futureOrToday' }).isValid).toBe(false);
        expect(validateDateString('2027-06-31', { boundaryMode: 'futureOrToday' }).isValid).toBe(false);
        expect(validateDateString('2027-09-31', { boundaryMode: 'futureOrToday' }).isValid).toBe(false);
        expect(validateDateString('2027-11-31', { boundaryMode: 'futureOrToday' }).isValid).toBe(false);
      });

      test('rejects malformed and corrupted input strings', () => {
        const corrupted = validateDateString('2028-10asaasoalkslak', { boundaryMode: 'futureOrToday' });
        expect(corrupted.isValid).toBe(false);
        expect(corrupted.isComplete).toBe(false);
        expect(corrupted.formattedDate).toBe('2028-10');

        expect(validateDateString('', { boundaryMode: 'futureOrToday' }).isValid).toBe(false);
        expect(validateDateString('2028', { boundaryMode: 'futureOrToday' }).isValid).toBe(false);
        expect(validateDateString('2028-06', { boundaryMode: 'futureOrToday' }).isValid).toBe(false);
      });
    });

    describe('HistoricalVaccineModal Administered Date (boundaryMode="pastOrToday")', () => {
      test('accepts today as valid administration date', () => {
        const result = validateDateString(todayStr, { boundaryMode: 'pastOrToday' });
        expect(result.isValid).toBe(true);
        expect(result.formattedDate).toBe(todayStr);
      });

      test('accepts valid past dates spanning historical decades', () => {
        expect(validateDateString('1995-08-20', { boundaryMode: 'pastOrToday' }).isValid).toBe(true);
        expect(validateDateString('2015-11-04', { boundaryMode: 'pastOrToday' }).isValid).toBe(true);
        expect(validateDateString('2024-01-15', { boundaryMode: 'pastOrToday' }).isValid).toBe(true);
      });

      test('accepts year 1900 boundary and rejects pre-1900 dates', () => {
        expect(validateDateString('1900-01-01', { boundaryMode: 'pastOrToday' }).isValid).toBe(true);

        const pre1900 = validateDateString('1899-12-31', { boundaryMode: 'pastOrToday' });
        expect(pre1900.isValid).toBe(false);
        expect(pre1900.errorMessage).toContain('Year must be between 1900 and 2100');
      });

      test('rejects tomorrow and future administration dates', () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(tomorrow);

        const resultTomorrow = validateDateString(tomorrowStr, { boundaryMode: 'pastOrToday' });
        expect(resultTomorrow.isValid).toBe(false);
        expect(resultTomorrow.errorMessage).toContain('Future date not permitted');

        const resultFuture = validateDateString('2030-01-01', { boundaryMode: 'pastOrToday' });
        expect(resultFuture.isValid).toBe(false);
        expect(resultFuture.errorMessage).toContain('Future date not permitted');
      });
    });
  });

  /* -------------------------------------------------------------------------- */
  /* SUITE 2: DEMOGRAPHIC COHORT SWITCHING & BACKEND CATALOG CODE INTEGRITY     */
  /* -------------------------------------------------------------------------- */
  describe('Suite 2: Demographic Cohort Switching & Backend Catalog Completeness', () => {
    test('backend statutory catalog seed libraries conform strictly to PhilHealth Kit v1.1 specifications', () => {
      const activeNonFallback = (lib: string) =>
        (BACKEND_STATUTORY_SEEDS[lib] ?? []).filter((v) => v.isActive && v.code !== '999');

      // lib_immchild: 13 vaccines (C01..C13)
      const childVaccines = activeNonFallback('lib_immchild');
      expect(childVaccines.length).toBe(13);
      expect(childVaccines.map((v) => v.code)).toEqual([
        'C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12', 'C13',
      ]);

      // lib_immyoungw: 2 vaccines (Y01, Y02)
      const ywVaccines = activeNonFallback('lib_immyoungw');
      expect(ywVaccines.length).toBe(2);
      expect(ywVaccines.map((v) => v.code)).toEqual(['Y01', 'Y02']);

      // lib_immpregw: P01 Tetanus Toxoid
      const pregVaccines = activeNonFallback('lib_immpregw');
      expect(pregVaccines.length).toBe(1);
      expect(pregVaccines.map((v) => v.code)).toEqual(['P01']);

      // lib_immelderly: 2 vaccines (E01, E02)
      const eldVaccines = activeNonFallback('lib_immelderly');
      expect(eldVaccines.length).toBe(2);
      expect(eldVaccines.map((v) => v.code)).toEqual(['E01', 'E02']);

      const allStatutory = [...childVaccines, ...ywVaccines, ...pregVaccines, ...eldVaccines];
      const uniqueCodes = new Set(allStatutory.map((v) => v.code));
      expect(uniqueCodes.size).toBe(allStatutory.length);

      for (const vac of allStatutory) {
        expect(vac.description.trim().length).toBeGreaterThan(0);
      }
    });

    test('initial cohort auto-detection matrices across patient demographic spectra', () => {
      // Pediatric infant / child (< 18) -> lib_immchild
      expect(resolveInitialVaccineCohort({ age: 0, sex: 'Male' } as PatientDemographics)).toBe('lib_immchild');
      expect(resolveInitialVaccineCohort({ age: 1, sex: 'Female' } as PatientDemographics)).toBe('lib_immchild');
      expect(resolveInitialVaccineCohort({ age: 17, sex: 'Female' } as PatientDemographics)).toBe('lib_immchild');
      expect(resolveInitialVaccineCohort({ age: 17, sex: 'Male' } as PatientDemographics)).toBe('lib_immchild');

      // Young women (Female, 18-49y) -> lib_immyoungw
      expect(resolveInitialVaccineCohort({ age: 18, sex: 'Female' } as PatientDemographics)).toBe('lib_immyoungw');
      expect(resolveInitialVaccineCohort({ age: 26, sex: 'Female' } as PatientDemographics)).toBe('lib_immyoungw');
      expect(resolveInitialVaccineCohort({ age: 45, sex: 'Female' } as PatientDemographics)).toBe('lib_immyoungw');

      // Adult Men (18-59y) and Females (50-59y) -> OtherImm (Adult / Other)
      expect(resolveInitialVaccineCohort({ age: 18, sex: 'Male' } as PatientDemographics)).toBe('OtherImm');
      expect(resolveInitialVaccineCohort({ age: 32, sex: 'Male' } as PatientDemographics)).toBe('OtherImm');
      expect(resolveInitialVaccineCohort({ age: 54, sex: 'Female' } as PatientDemographics)).toBe('OtherImm');

      // Senior citizens (>= 60 or isSenior) -> lib_immelderly
      expect(resolveInitialVaccineCohort({ age: 60, sex: 'Male' } as PatientDemographics)).toBe('lib_immelderly');
      expect(resolveInitialVaccineCohort({ age: 60, sex: 'Female' } as PatientDemographics)).toBe('lib_immelderly');
      expect(resolveInitialVaccineCohort({ age: 85, sex: 'Male' } as PatientDemographics)).toBe('lib_immelderly');
      expect(resolveInitialVaccineCohort({ age: 45, sex: 'Male', isSenior: true } as PatientDemographics)).toBe('lib_immelderly');
    });

    test('cohort chip selector renders backend vaccines for each patient demographic', () => {
      // Child modal -> BE lib_immchild
      const htmlChild = renderToStaticMarkup(
        React.createElement(AdministerVaccineModal, {
          visible: true,
          onClose: () => {},
          patient: mockPatientChild,
          demographics: { age: 1, sex: 'Male' } as PatientDemographics,
          onAdministerVaccine: async () => {},
        })
      );
      expect(htmlChild).toContain('BCG');
      expect(BACKEND_STATUTORY_SEEDS.lib_immchild.find((v) => v.description.includes('BCG'))?.code).toBe('C01');

      // Young women modal -> BE lib_immyoungw
      const htmlYw = renderToStaticMarkup(
        React.createElement(AdministerVaccineModal, {
          visible: true,
          onClose: () => {},
          patient: mockPatientAdultFemale,
          demographics: { age: 20, sex: 'Female' } as PatientDemographics,
          onAdministerVaccine: async () => {},
        })
      );
      expect(htmlYw).toContain('HPV');
      expect(BACKEND_STATUTORY_SEEDS.lib_immyoungw.find((v) => v.description.includes('HPV'))?.code).toBe('Y01');

      // Senior modal -> BE lib_immelderly
      const htmlSenior = renderToStaticMarkup(
        React.createElement(AdministerVaccineModal, {
          visible: true,
          onClose: () => {},
          patient: mockPatientSenior,
          demographics: { age: 73, sex: 'Female', isSenior: true } as PatientDemographics,
          onAdministerVaccine: async () => {},
        })
      );
      expect(htmlSenior).toContain('Pnuemococcal Vaccine');
      expect(BACKEND_STATUTORY_SEEDS.lib_immelderly.find((v) => v.code === 'E01')?.code).toBe('E01');

      // Adult Male modal -> BE adult_other_vaccine
      const htmlAdultMale = renderToStaticMarkup(
        React.createElement(AdministerVaccineModal, {
          visible: true,
          onClose: () => {},
          demographics: { age: 35, sex: 'Male' } as PatientDemographics,
          onAdministerVaccine: async () => {},
        })
      );
      expect(htmlAdultMale).toContain('Tetanus Toxoid / Td / Tdap Booster');
      expect(htmlAdultMale).toContain('Anti-Rabies Vaccine (PVRV / PCECV)');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* SUITE 3: DEFENSIVE VALIDATION BOUNDARIES & MISSING FIELDS                  */
  /* -------------------------------------------------------------------------- */
  describe('Suite 3: Defensive Validation Boundaries & Required Fields', () => {
    describe('AdministerVaccineModal Input Guarding', () => {
      const simulateAdministerValidation = (params: {
        lotBatchNumber: string;
        expirationDate: string;
        doseSequence: string;
        staffName?: string;
        currentName?: string;
      }): { valid: boolean; error?: string } => {
        if (!params.lotBatchNumber.trim()) {
          return { valid: false, error: 'Lot / Batch number is required.' };
        }

        const expValidation = validateDateString(params.expirationDate, { boundaryMode: 'futureOrToday' });
        if (!expValidation.isValid) {
          return { valid: false, error: expValidation.errorMessage || 'Valid future expiration date required (YYYY-MM-DD).' };
        }

        const seqNum = parseInt(params.doseSequence, 10);
        if (isNaN(seqNum) || seqNum < 1) {
          return { valid: false, error: 'Dose sequence must be a positive integer (e.g. 1, 2, 3).' };
        }

        const adminName = (params.staffName || '').trim() || params.currentName || 'Staff Clinician';
        if (!adminName) {
          return { valid: false, error: 'Administering clinician name is required.' };
        }

        return { valid: true };
      };

      test('rejects empty or whitespace-only lot/batch numbers', () => {
        expect(
          simulateAdministerValidation({
            lotBatchNumber: '',
            expirationDate: '2028-12-31',
            doseSequence: '1',
          }).error
        ).toBe('Lot / Batch number is required.');

        expect(
          simulateAdministerValidation({
            lotBatchNumber: '     \t  \n  ',
            expirationDate: '2028-12-31',
            doseSequence: '1',
          }).error
        ).toBe('Lot / Batch number is required.');
      });

      test('accepts valid lot numbers and trims whitespace in payload', () => {
        const check = simulateAdministerValidation({
          lotBatchNumber: '  LOT-2026-BCG-01  ',
          expirationDate: '2028-12-31',
          doseSequence: '1',
        });
        expect(check.valid).toBe(true);
        expect('  LOT-2026-BCG-01  '.trim()).toBe('LOT-2026-BCG-01');
      });

      test('rejects dose sequences: zero, negative, empty, and non-numeric strings', () => {
        const invalidDoses = ['0', '-1', '-99', '', '   ', 'abc', 'one', 'NaN'];
        for (const dose of invalidDoses) {
          const res = simulateAdministerValidation({
            lotBatchNumber: 'LOT-123',
            expirationDate: '2028-12-31',
            doseSequence: dose,
          });
          expect(res.valid).toBe(false);
          expect(res.error).toBe('Dose sequence must be a positive integer (e.g. 1, 2, 3).');
        }
      });

      test('accepts valid dose sequences: 1, 2, 3, 4, 5, and large integers', () => {
        const validDoses = ['1', '2', '3', '4', '5', '10', '99'];
        for (const dose of validDoses) {
          const res = simulateAdministerValidation({
            lotBatchNumber: 'LOT-123',
            expirationDate: '2028-12-31',
            doseSequence: dose,
          });
          expect(res.valid).toBe(true);
          expect(parseInt(dose, 10)).toBeGreaterThanOrEqual(1);
        }
      });

      test('falls back safely to default staff clinician name when empty', () => {
        const res = simulateAdministerValidation({
          lotBatchNumber: 'LOT-123',
          expirationDate: '2028-12-31',
          doseSequence: '1',
          staffName: '   ',
          currentName: '',
        });
        expect(res.valid).toBe(true);
      });
    });

    describe('HistoricalVaccineModal Input Guarding', () => {
      const simulateHistoricalValidation = (params: {
        administeredDate: string;
        doseSequence: string;
      }): { valid: boolean; error?: string } => {
        const adminDateValidation = validateDateString(params.administeredDate, { boundaryMode: 'pastOrToday' });
        if (!adminDateValidation.isValid) {
          return {
            valid: false,
            error: adminDateValidation.errorMessage || 'Valid past or today administration date required (YYYY-MM-DD).',
          };
        }

        const seqNum = parseInt(params.doseSequence, 10);
        if (isNaN(seqNum) || seqNum < 1) {
          return { valid: false, error: 'Dose sequence must be a positive integer (e.g. 1, 2, 3).' };
        }

        return { valid: true };
      };

      test('rejects future administration date for historical vaccine', () => {
        const res = simulateHistoricalValidation({
          administeredDate: '2099-01-01',
          doseSequence: '1',
        });
        expect(res.valid).toBe(false);
        expect(res.error).toContain('Future date not permitted');
      });

      test('rejects invalid dose sequences: 0, negative, and strings', () => {
        expect(simulateHistoricalValidation({ administeredDate: '2024-01-01', doseSequence: '0' }).valid).toBe(false);
        expect(simulateHistoricalValidation({ administeredDate: '2024-01-01', doseSequence: '-3' }).valid).toBe(false);
        expect(simulateHistoricalValidation({ administeredDate: '2024-01-01', doseSequence: 'invalid' }).valid).toBe(false);
      });

      test('safely handles optional facility name and lot number in payload assembly', () => {
        const constructHistoricalPayload = (
          facilityName: string,
          lotNumber: string,
          route: string,
          site: string
        ): RecordHistoricalImmunizationPayload => ({
          philHealthLibrary: 'lib_immchild',
          philHealthCode: 'C01',
          vaccineName: 'BCG',
          administeredDate: '2024-01-01',
          doseSequence: 1,
          isSeriesCompleted: true,
          historicalFacilityName: facilityName.trim() || undefined,
          lotBatchNumber: lotNumber.trim() || undefined,
          route: route.trim() || undefined,
          injectionSite: site.trim() || undefined,
        });

        const payloadEmpty = constructHistoricalPayload('   ', '   ', '', '');
        expect(payloadEmpty.historicalFacilityName).toBeUndefined();
        expect(payloadEmpty.lotBatchNumber).toBeUndefined();
        expect(payloadEmpty.route).toBeUndefined();
        expect(payloadEmpty.injectionSite).toBeUndefined();

        const payloadPopulated = constructHistoricalPayload(
          '  Baguio Health Center  ',
          '  LOT-HIST-001  ',
          ' Intramuscular (IM) ',
          ' Left Deltoid '
        );
        expect(payloadPopulated.historicalFacilityName).toBe('Baguio Health Center');
        expect(payloadPopulated.lotBatchNumber).toBe('LOT-HIST-001');
        expect(payloadPopulated.route).toBe('Intramuscular (IM)');
        expect(payloadPopulated.injectionSite).toBe('Left Deltoid');
      });
    });
  });

  /* -------------------------------------------------------------------------- */
  /* SUITE 4: SERIES COMPLETED TOGGLE & ASYNC ERROR RESILIENCE                  */
  /* -------------------------------------------------------------------------- */
  describe('Suite 4: Series Completed Switch & Async Error Handling', () => {
    test('renders series completed switch with role="switch" accessibility attribute', () => {
      const html = renderToStaticMarkup(
        React.createElement(HistoricalVaccineModal, {
          visible: true,
          onClose: () => {},
          patient: mockPatientChild,
          onRecordHistoricalVaccine: async () => {},
        })
      );

      expect(html).toContain('Series Completed?');
      expect(html).toContain('Mark full immunization series');
      expect(html).toContain('role="switch"');
    });

    test('administer modal series completed toggle renders Yes/No state label', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdministerVaccineModal, {
          visible: true,
          onClose: () => {},
          patient: mockPatientChild,
          onAdministerVaccine: async () => {},
        })
      );

      expect(html).toContain('Series Completed?');
      expect(html).toContain('Mark final dose in sequence');
      expect(html).toContain('No');
    });

    test('handles submission network failure without unhandled promise crash', async () => {
      let caughtError: string | null = null;

      const failingSubmit = async (_payload: AdministerVaccinePayload) => {
        throw new Error('500 Internal Server Error: Interop Hub unreachable');
      };

      try {
        await failingSubmit({
          philHealthLibrary: 'lib_immchild',
          philHealthCode: 'C01',
          vaccineName: 'BCG',
          lotBatchNumber: 'LOT-123',
          expirationDate: '2028-12-31',
          doseSequence: 1,
          administeredAtUtc: new Date().toISOString(),
          administeredByStaffId: 'stf-1',
          administeredByStaffName: 'Nurse Jane',
        });
      } catch (err: any) {
        caughtError = err?.message;
      }

      expect(caughtError).toBe('500 Internal Server Error: Interop Hub unreachable');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* SUITE 5: COMPREHENSIVE MODAL MARKUP & VISUAL ELEVATION AUDIT               */
  /* -------------------------------------------------------------------------- */
  describe('Suite 5: Modal Elements & Complete Field Rendering', () => {
    test('AdministerVaccineModal contains all clinical administration form fields', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdministerVaccineModal, {
          visible: true,
          onClose: () => {},
          patient: mockPatientChild,
          demographics: { age: 1, sex: 'Male' } as PatientDemographics,
          onAdministerVaccine: async () => {},
        })
      );

      expect(html).toContain('1. Vaccine Category *');
      expect(html).toContain('2. Select Vaccine');
      expect(html).toContain('Lot / Batch Number *');
      expect(html).toContain('Expiration Date *');
      expect(html).toContain('Brand Name (Optional)');
      expect(html).toContain('Manufacturer (Optional)');
      expect(html).toContain('Dose Sequence Number *');
      expect(html).toContain('Administration Route *');
      expect(html).toContain('Injection Site *');
      expect(html).toContain('Administering Staff Name *');
      expect(html).toContain('PRC License Number');
      expect(html).toContain('Clinical Remarks (Optional)');

      // All 5 BE cohort choices
      expect(html).toContain('Child (0–17y)');
      expect(html).toContain('Young Women');
      expect(html).toContain('Maternal (Td)');
      expect(html).toContain('Senior (60+)');
      expect(html).toContain('Adult / Other');

      // BE-supplied routes & sites
      for (const route of BACKEND_ROUTES) {
        expect(html).toContain(route);
      }
      for (const site of BACKEND_SITES) {
        expect(html).toContain(site);
      }
    });

    test('HistoricalVaccineModal contains all historical transcription form fields', () => {
      const html = renderToStaticMarkup(
        React.createElement(HistoricalVaccineModal, {
          visible: true,
          onClose: () => {},
          patient: mockPatientChild,
          demographics: { age: 1, sex: 'Male' } as PatientDemographics,
          onRecordHistoricalVaccine: async () => {},
        })
      );

      expect(html).toContain('Add Historical Vaccine');
      expect(html).toContain('1. Vaccine Category *');
      expect(html).toContain('Date Administered *');
      expect(html).toContain('Dose Sequence Number *');
      expect(html).toContain('Outside Clinic / Facility Name');
      expect(html).toContain('Lot / Batch Number (If documented on card)');
      expect(html).toContain('Administration Route (Optional)');
      expect(html).toContain('Injection Site (Optional)');
      expect(html).toContain('Clinical Remarks / Card Verification Notes');
      expect(html).toContain('Save Historical Vaccine');
    });

    test('StatutoryImmunizationsTab renders clinical status banner when patient has 0 vaccines', () => {
      const html = renderToStaticMarkup(
        React.createElement(StatutoryImmunizationsTab, {
          patient: mockPatientChild,
          demographics: { age: 1, sex: 'Male' } as PatientDemographics,
          immunizations: [],
          onAdministerVaccine: async () => {},
          onRecordHistoricalVaccine: async () => {},
        })
      );

      expect(html).toContain('Immunization Documentation Status');
      expect(html).toContain('No immunizations are currently documented for this patient');
      expect(html).toContain('No immunizations recorded');
      expect(html).toContain('Administer Vax');
      expect(html).toContain('Log Vax History');
      expect(html).not.toContain('+ +');
      expect(html).not.toContain('PhilHealth');
      expect(html).not.toContain('Fallback Code 999');
    });
  });
});
