// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EhrOptionDescriptor, ApiError } from '@shared/safe';

(globalThis as any).__DEV__ = true;

// Load authoritative backend PhilHealth catalog seed JSONs directly from clinic-api
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
    { code: 'O06', label: 'Pneumococcal Vaccine (Adult)', philHealthCode: 'O06', philHealthLibrary: 'OtherImm' },
    { code: 'OTH', label: 'Other / Unlisted Vaccine', philHealthCode: 'OTH', philHealthLibrary: 'OtherImm', requiresSpecifyText: true },
  ],
  vaccine_route: [
    { code: 'INTRAMUSCULAR', label: 'Intramuscular (IM)', philHealthCode: 'IM', philHealthLibrary: 'lib_medicine_route' },
    { code: 'SUBCUTANEOUS', label: 'Subcutaneous (SC)', philHealthCode: 'SC', philHealthLibrary: 'lib_medicine_route' },
    { code: 'ORAL', label: 'Oral (PO)', philHealthCode: 'PO', philHealthLibrary: 'lib_medicine_route' },
    { code: 'INTRADERMAL', label: 'Intradermal (ID)', philHealthCode: 'ID', philHealthLibrary: 'lib_medicine_route' },
  ],
  vaccine_injection_site: [
    { code: 'LEFT_DELTOID', label: 'Left Deltoid' },
    { code: 'RIGHT_DELTOID', label: 'Right Deltoid' },
    { code: 'LEFT_THIGH', label: 'Left Anterolateral Thigh' },
    { code: 'RIGHT_THIGH', label: 'Right Anterolateral Thigh' },
    { code: 'ORAL', label: 'Oral' },
  ],
  allergy_severity: [
    { code: 'Mild', label: 'Mild', philHealthCode: '1' },
    { code: 'Moderate', label: 'Moderate', philHealthCode: '2' },
    { code: 'Severe', label: 'Severe', philHealthCode: '3' },
    { code: 'LifeThreatening', label: 'Life Threatening', philHealthCode: '4' },
  ],
};

let mockCatalogMode: 'normal' | 'empty' | 'loading' | 'error' = 'normal';
let mockOptionsMode: 'normal' | 'empty' = 'normal';

// Mock React Native modules for Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
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
  usePhilHealthCatalog: (library: string, enabled = true) => {
    if (!enabled) {
      return { items: [], loading: false, error: null, reload: () => {} };
    }
    if (mockCatalogMode === 'loading') {
      return { items: [], loading: true, error: null, reload: () => {} };
    }
    if (mockCatalogMode === 'error') {
      return {
        items: [],
        loading: false,
        error: { message: 'Catalog endpoint unreachable', status: 503 } as ApiError,
        reload: () => {},
      };
    }
    if (mockCatalogMode === 'empty') {
      return { items: [], loading: false, error: null, reload: () => {} };
    }
    return {
      items: BACKEND_STATUTORY_SEEDS[library] ?? [],
      loading: false,
      error: null,
      reload: () => {},
    };
  },
}));

mock.module('../hooks/useEhrOptions', () => ({
  useEhrOptions: (optionSet: string, options?: { enabled?: boolean }) => {
    if (options?.enabled === false || mockOptionsMode === 'empty') {
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
  resolveCohortCategoryLabel,
  styles: tabStyles,
} = await import('../components/chart/StatutoryImmunizationsTab');

const {
  default: AdministerVaccineModal,
  CUSTOM_VACCINE_CODE,
  doesVaccineRouteRequireInjectionSite,
  inferPreferredVaccineRoute,
  resolveInitialVaccineCohort,
  resolveVaccineSelection,
} = await import('../components/chart/AdministerVaccineModal');

const {
  shouldDisplayImmunizationInjectionSite,
} = await import('../components/chart/immunizationCatalog');

const {
  default: HistoricalVaccineModal,
} = await import('../components/chart/HistoricalVaccineModal');

const {
  validateDateString,
} = await import('../components/ui/ValidatedDateInput');

import type {
  ClinicPatient,
  PatientDemographics,
  PatientImmunizationRecord,
  AdministerImmunizationPayload,
  RecordHistoricalImmunizationPayload,
} from '../services/clinicService';

describe('Milestone M3: Backend-Driven Statutory Immunizations & Clinical Modals (Features 11, 12, 13, 14)', () => {
  beforeEach(() => {
    mockCatalogMode = 'normal';
    mockOptionsMode = 'normal';
  });

  const mockChildPatient: ClinicPatient = {
    id: 'pat-child-01',
    clinicId: 'clinic-1',
    tenantId: 'tenant-1',
    patientCode: 'PAT-0001',
    fullName: 'Baby Juan Dela Cruz',
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    dateOfBirth: '2025-01-01',
    age: 1,
    sex: 'Male',
    civilStatus: 'Single',
    contactNumber: '09170000001',
    verificationStatus: 'Verified',
    createdAtUtc: '2025-01-01T00:00:00Z',
    updatedAtUtc: '2025-01-01T00:00:00Z',
  };

  const mockSampleImmunizations: PatientImmunizationRecord[] = [
    {
      id: 'imm-001',
      patientId: 'pat-child-01',
      vaccineName: 'BCG',
      philHealthCode: 'C01',
      philHealthLibrary: 'lib_immchild',
      lotBatchNumber: 'LOT-BCG-2026',
      expirationDate: '2028-12-31',
      doseSequence: 1,
      isSeriesCompleted: true,
      route: 'Intradermal',
      injectionSite: 'Right Deltoid',
      administeredAtUtc: '2026-02-15T09:00:00Z',
      administeredByStaffName: 'Nurse Clara Garcia',
      administeredByPrcLicense: 'PRC-0987654',
      isHistorical: false,
      hasAdverseReaction: false,
    },
    {
      id: 'imm-002',
      patientId: 'pat-child-01',
      vaccineName: 'Hepatitis B',
      philHealthCode: 'C09',
      philHealthLibrary: 'lib_immchild',
      doseSequence: 1,
      isSeriesCompleted: true,
      administeredAtUtc: '2025-01-02T10:00:00Z',
      isHistorical: true,
      historicalFacilityName: 'St. Luke Medical Center',
      hasAdverseReaction: true,
      adverseReactionSeverity: 'Mild',
      adverseReactionRemarks: 'Slight redness at injection site',
    },
  ];

  describe('Feature 11: StatutoryImmunizationsTab Action Controls & Compliance Layout', () => {
    test('renders inline cohort filter tabs (no-wrap horizontal scroll) on the left and right-pinned action buttons', () => {
      expect(tabStyles.headerActionBar.justifyContent).toBe('space-between');
      expect(tabStyles.headerActionBar.flexWrap).toBe('nowrap');
      expect(tabStyles.cohortFilterRow.flexWrap).toBe('nowrap');
      expect(tabStyles.actionButtonsRow.justifyContent).toBe('flex-end');
      expect(tabStyles.actionButtonsRow.flexWrap).toBe('nowrap');
      expect(tabStyles.actionButtonsRow.flexShrink).toBe(0);
    });

    test('renders Administer Vax and Log Vax History header action buttons plus all 5 BE cohort tabs', () => {
      const html = renderToStaticMarkup(
        React.createElement(StatutoryImmunizationsTab, {
          patient: mockChildPatient,
          demographics: { age: 1, sex: 'Male' } as PatientDemographics,
          immunizations: [],
          onAdministerVaccine: async () => {},
          onRecordHistoricalVaccine: async () => {},
        })
      );

      expect(html).toContain('Administer Vax');
      expect(html).toContain('Log Vax History');
      expect(html).toContain('Child Schedule (0–17y) • Recommended');
      expect(html).toContain('Young Women (HPV)');
      expect(html).toContain('Maternal (Td / Tdap)');
      expect(html).toContain('Senior Citizens (60+)');
      expect(html).toContain('Adult / Other');
      expect(html).not.toContain('+ +');
    });

    test('renders immunization documentation status banner and pure clinical empty state when zero immunizations recorded', () => {
      const html = renderToStaticMarkup(
        React.createElement(StatutoryImmunizationsTab, {
          patient: mockChildPatient,
          demographics: { age: 1, sex: 'Male' } as PatientDemographics,
          immunizations: [],
          onAdministerVaccine: async () => {},
          onRecordHistoricalVaccine: async () => {},
        })
      );

      expect(html).toContain('Immunization Documentation Status');
      expect(html).toContain('No immunizations are currently documented for this patient');
      expect(html).toContain('Review the recommended vaccination schedule for their cohort');
      expect(html).toContain('Log Vax History');
      expect(html).toContain('No immunizations recorded');
      expect(html).toContain('No vaccination records found for this patient');

      // Strict exclusion of payer/regulatory jargon per user direction
      expect(html).not.toContain('PhilHealth');
      expect(html).not.toContain('Konsulta');
      expect(html).not.toContain('Fallback Code 999');
      expect(html).not.toContain('fallback code 999');
      expect(html).not.toContain('statutory fallback');
      expect(html).not.toContain('DTD v1.14');
      expect(html).not.toContain('claim compliance');
    });

    test('renders recorded immunizations with distinction between administered and historical', () => {
      const html = renderToStaticMarkup(
        React.createElement(StatutoryImmunizationsTab, {
          patient: mockChildPatient,
          demographics: { age: 1, sex: 'Male' } as PatientDemographics,
          immunizations: mockSampleImmunizations,
          onAdministerVaccine: async () => {},
          onRecordHistoricalVaccine: async () => {},
        })
      );

      expect(html).toContain('BCG');
      expect(html).toContain('LOT-BCG-2026');
      expect(html).toContain('Nurse Clara Garcia');
      expect(html).toContain('PRC: PRC-0987654');
      expect(html).toContain('Hepatitis B');
      expect(html).toContain('Historical Facility: St. Luke Medical Center');
      expect(html).toContain('AEFI REPORTED: Severity: Mild');
      expect(html).not.toContain('Immunization Documentation Status');
      expect(html).not.toContain('PhilHealth');
      expect(html).not.toContain('Fallback Code');
    });

    test('resolves clean clinical badge labels for all cohort categories including Adult / Other', () => {
      expect(resolveCohortCategoryLabel('lib_immchild')).toBe('Childhood');
      expect(resolveCohortCategoryLabel('lib_immyoungw')).toBe('Young Women');
      expect(resolveCohortCategoryLabel('lib_immpregw')).toBe('Maternal');
      expect(resolveCohortCategoryLabel('lib_immelderly')).toBe('Senior Citizen');
      expect(resolveCohortCategoryLabel('OtherImm')).toBe('Adult / Other');
      expect(resolveCohortCategoryLabel(undefined)).toBe('Adult / Other');
    });

    test('verifies backend seed catalogs exclude fallback code 999 ("None") when rendered in vaccine modals', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdministerVaccineModal, {
          visible: true,
          onClose: () => {},
          patient: mockChildPatient,
          demographics: { age: 1, sex: 'Male' } as PatientDemographics,
          onAdministerVaccine: async () => {},
        })
      );

      // 14 raw items in lib_immchild.json minus "999" ("None") = 13 selectable vaccines
      expect(html).toContain('2. Select Vaccine (13 available) *');
      expect(html).toContain('BCG');
      expect(html).toContain('Varicella (Chicken Pox)');
      expect(html).not.toContain('>None<');
    });
  });

  describe('Feature 12: AdministerVaccineModal Backend-Driven Configuration & 4-State Handling', () => {
    test('renders modal when visible=true with all 5 BE cohort options, BE routes, and BE injection sites', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdministerVaccineModal, {
          visible: true,
          onClose: () => {},
          patient: mockChildPatient,
          demographics: { age: 1, sex: 'Male' } as PatientDemographics,
          onAdministerVaccine: async () => {},
        })
      );

      expect(html).toContain('Administer Vaccine');
      expect(html).toContain('Document In-Clinic Administration');
      expect(html).toContain('Child (0–17y)');
      expect(html).toContain('Young Women');
      expect(html).toContain('Maternal (Td)');
      expect(html).toContain('Senior (60+)');
      expect(html).toContain('Adult / Other');

      // BE-supplied routes and sites (excluding Oral from anatomical injection sites)
      expect(html).toContain('Intramuscular (IM)');
      expect(html).toContain('Subcutaneous (SC)');
      expect(html).toContain('Oral (PO)');
      expect(html).toContain('Intradermal (ID)');
      expect(html).toContain('Left Deltoid');
      expect(html).toContain('Right Deltoid');
      expect(html).toContain('Left Anterolateral Thigh');
      expect(html).toContain('Right Anterolateral Thigh');
      expect(html).not.toContain('>Oral<');

      expect(doesVaccineRouteRequireInjectionSite('Intramuscular (IM)')).toBe(true);
      expect(doesVaccineRouteRequireInjectionSite('Subcutaneous (SC)')).toBe(true);
      expect(doesVaccineRouteRequireInjectionSite('Intradermal (ID)')).toBe(true);
      expect(doesVaccineRouteRequireInjectionSite('Oral (PO)')).toBe(false);
      expect(doesVaccineRouteRequireInjectionSite('Oral')).toBe(false);

      expect(shouldDisplayImmunizationInjectionSite('Oral (PO)', 'Left Deltoid')).toBe(false);
      expect(shouldDisplayImmunizationInjectionSite('Oral (PO)', 'Not Applicable')).toBe(false);
      expect(shouldDisplayImmunizationInjectionSite('Intramuscular (IM)', 'Left Deltoid')).toBe(true);

      const sampleRoutes = ['Intramuscular (IM)', 'Subcutaneous (SC)', 'Intradermal (ID)', 'Oral (PO)'];
      expect(inferPreferredVaccineRoute('C02', 'OPV1', sampleRoutes)).toBe('Oral (PO)');
      expect(inferPreferredVaccineRoute('C01', 'BCG', sampleRoutes)).toBe('Intradermal (ID)');
      expect(inferPreferredVaccineRoute('C09', 'Hepatitis B1', sampleRoutes)).toBe('Intramuscular (IM)');

      expect(html).toContain('Lot / Batch Number *');
      expect(html).toContain('Expiration Date *');
      expect(html).toContain('Administering Staff Name *');
    });

    test('renders loading skeleton, error state with retry, and zero-static-array empty fallback cleanly', () => {
      mockCatalogMode = 'loading';
      const loadingHtml = renderToStaticMarkup(
        React.createElement(AdministerVaccineModal, {
          visible: true,
          onClose: () => {},
          patient: mockChildPatient,
          demographics: { age: 1, sex: 'Male' } as PatientDemographics,
          onAdministerVaccine: async () => {},
        })
      );
      expect(loadingHtml).toContain('2. Select Vaccine (Loading...) *');
      expect(loadingHtml).toContain('role="progressbar"');

      mockCatalogMode = 'error';
      const errorHtml = renderToStaticMarkup(
        React.createElement(AdministerVaccineModal, {
          visible: true,
          onClose: () => {},
          patient: mockChildPatient,
          demographics: { age: 1, sex: 'Male' } as PatientDemographics,
          onAdministerVaccine: async () => {},
        })
      );
      expect(errorHtml).toContain('Unable to load vaccines');
      expect(errorHtml).toContain('Catalog endpoint unreachable');
      expect(errorHtml).toContain('Retry');

      // Empty BE options + empty catalog -> zero hardcoded vaccines, routes, or sites leaked
      mockCatalogMode = 'empty';
      mockOptionsMode = 'empty';
      const emptyHtml = renderToStaticMarkup(
        React.createElement(AdministerVaccineModal, {
          visible: true,
          onClose: () => {},
          patient: mockChildPatient,
          demographics: { age: 1, sex: 'Male' } as PatientDemographics,
          onAdministerVaccine: async () => {},
        })
      );
      expect(emptyHtml).toContain('No catalog vaccines returned for this category');
      expect(emptyHtml).toContain('Enter administration route');
      expect(emptyHtml).toContain('Enter anatomical injection site');
      expect(emptyHtml).not.toContain('Intramuscular (IM)');
      expect(emptyHtml).not.toContain('Left Deltoid');
      expect(emptyHtml).not.toContain('BCG');
    });

    test('validates vaccine expiration date with boundaryMode="futureOrToday"', () => {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
      const futureDate = '2028-12-31';
      const pastDate = '2020-01-01';

      expect(validateDateString(futureDate, { boundaryMode: 'futureOrToday' }).isValid).toBe(true);
      expect(validateDateString(today, { boundaryMode: 'futureOrToday' }).isValid).toBe(true);
      const pastResult = validateDateString(pastDate, { boundaryMode: 'futureOrToday' });
      expect(pastResult.isValid).toBe(false);
      expect(pastResult.errorMessage).toContain('today or in the future');
    });
  });

  describe('Feature 13: HistoricalVaccineModal Backend-Driven Configuration & Validation', () => {
    test('renders modal when visible=true with historical fields', () => {
      const html = renderToStaticMarkup(
        React.createElement(HistoricalVaccineModal, {
          visible: true,
          onClose: () => {},
          patient: mockChildPatient,
          demographics: { age: 1, sex: 'Male' } as PatientDemographics,
          onRecordHistoricalVaccine: async () => {},
        })
      );

      expect(html).toContain('Add Historical Vaccine');
      expect(html).toContain('Record vaccines received outside this facility');
      expect(html).toContain('Date Administered *');
      expect(html).toContain('Outside Clinic / Facility Name');
      expect(html).toContain('Series Completed?');
      expect(html).toContain('Save Historical Vaccine');
    });

    test('validates administered date with boundaryMode="pastOrToday"', () => {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
      const validPastDate = '2024-06-15';
      const invalidFutureDate = '2099-12-31';

      expect(validateDateString(validPastDate, { boundaryMode: 'pastOrToday' }).isValid).toBe(true);
      expect(validateDateString(today, { boundaryMode: 'pastOrToday' }).isValid).toBe(true);
      const futureResult = validateDateString(invalidFutureDate, { boundaryMode: 'pastOrToday' });
      expect(futureResult.isValid).toBe(false);
      expect(futureResult.errorMessage).toContain('Future date not permitted');
    });

    test('initializes cohort correctly from BE options/catalogs based on patient age and sex', () => {
      // Child (< 18) -> lib_immchild -> includes BCG from BE seed
      const childHtml = renderToStaticMarkup(
        React.createElement(HistoricalVaccineModal, {
          visible: true,
          onClose: () => {},
          demographics: { age: 5, sex: 'Female' } as PatientDemographics,
          onRecordHistoricalVaccine: async () => {},
        })
      );
      expect(childHtml).toContain('BCG');

      // Young Woman (Female, 18) -> lib_immyoungw -> includes HPV from BE seed
      const ywHtml = renderToStaticMarkup(
        React.createElement(HistoricalVaccineModal, {
          visible: true,
          onClose: () => {},
          demographics: { age: 18, sex: 'Female' } as PatientDemographics,
          onRecordHistoricalVaccine: async () => {},
        })
      );
      expect(ywHtml).toContain('HPV');
      expect(ywHtml).toContain('MMR');

      // Senior Citizen (65) -> lib_immelderly -> includes Pnuemococcal Vaccine & Flu Vaccine from BE seed
      const seniorHtml = renderToStaticMarkup(
        React.createElement(HistoricalVaccineModal, {
          visible: true,
          onClose: () => {},
          demographics: { age: 65, sex: 'Male', isSenior: true } as PatientDemographics,
          onRecordHistoricalVaccine: async () => {},
        })
      );
      expect(seniorHtml).toContain('Pnuemococcal Vaccine');
      expect(seniorHtml).toContain('Flu Vaccine');

      // Adult Male (32) -> OtherImm (Adult / Other) -> served from BE adult_other_vaccine optionSet
      expect(resolveInitialVaccineCohort({ age: 32, sex: 'Male' } as PatientDemographics)).toBe('OtherImm');
      expect(
        resolveInitialVaccineCohort({ dob: '1991-04-10', sex: 'Male' } as unknown as PatientDemographics)
      ).toBe('OtherImm');
      expect(
        resolveInitialVaccineCohort({ age: 25, sex: 'Female' } as PatientDemographics, null, 'OtherImm')
      ).toBe('OtherImm');

      const adultMaleTabHtml = renderToStaticMarkup(
        React.createElement(StatutoryImmunizationsTab, {
          demographics: { age: 32, sex: 'Male' } as PatientDemographics,
          immunizations: [],
          onAdministerVaccine: async () => {},
          onRecordHistoricalVaccine: async () => {},
        })
      );
      expect(adultMaleTabHtml).toContain('Adult / Other • Recommended');

      const adultMaleHtml = renderToStaticMarkup(
        React.createElement(HistoricalVaccineModal, {
          visible: true,
          onClose: () => {},
          demographics: { age: 32, sex: 'Male' } as PatientDemographics,
          onRecordHistoricalVaccine: async () => {},
        })
      );
      expect(adultMaleHtml).toContain('Adult / Other');
      expect(adultMaleHtml).toContain('Tetanus Toxoid / Td / Tdap Booster');
      expect(adultMaleHtml).toContain('Anti-Rabies Vaccine (PVRV / PCECV)');
      expect(adultMaleHtml).toContain('Seasonal Influenza Vaccine (Adult)');
      expect(adultMaleHtml).toContain('Hepatitis B Vaccine (Adult)');
      expect(adultMaleHtml).toContain('COVID-19 Vaccine');
      expect(adultMaleHtml).toContain('Custom / Unlisted Vaccine');
      expect(adultMaleHtml).toContain('Other / Unlisted Vaccine (Specify name)');
    });

    test('supports BE vaccine resolution and custom / unlisted vaccine validation in both dialogs', () => {
      const adminHtml = renderToStaticMarkup(
        React.createElement(AdministerVaccineModal, {
          visible: true,
          onClose: () => {},
          demographics: { age: 32, sex: 'Male' } as PatientDemographics,
          onAdministerVaccine: async () => {},
        })
      );
      expect(adminHtml).toContain('Adult / Other');
      expect(adminHtml).toContain('Custom / Unlisted Vaccine');
      expect(adminHtml).toContain('Other / Unlisted Vaccine (Specify name)');

      const mockBeVaccines = [
        { code: 'O01', name: 'Tetanus Toxoid / Td / Tdap Booster', philHealthLibrary: 'OtherImm' },
      ];

      // Valid BE vaccine selection resolves from availableVaccines passed from BE hook
      const validBackendChoice = resolveVaccineSelection({
        cohort: 'OtherImm',
        vaccineCode: 'O01',
        customVaccineName: '',
        availableVaccines: mockBeVaccines,
      });
      expect(validBackendChoice).toEqual({
        valid: true,
        philHealthLibrary: 'OtherImm',
        philHealthCode: 'O01',
        vaccineName: 'Tetanus Toxoid / Td / Tdap Booster',
      });

      // Unknown code when BE list is empty is rejected cleanly
      const missingChoice = resolveVaccineSelection({
        cohort: 'OtherImm',
        vaccineCode: 'O01',
        customVaccineName: '',
        availableVaccines: [],
      });
      expect(missingChoice.valid).toBe(false);

      // Empty custom name is rejected
      const invalidCustom = resolveVaccineSelection({
        cohort: 'lib_immchild',
        vaccineCode: CUSTOM_VACCINE_CODE,
        customVaccineName: '   ',
        availableVaccines: mockBeVaccines,
      });
      expect(invalidCustom.valid).toBe(false);

      // Populated custom name resolves to OtherImm + OTH + trimmed vaccine name
      const validCustom = resolveVaccineSelection({
        cohort: 'lib_immchild',
        vaccineCode: CUSTOM_VACCINE_CODE,
        customVaccineName: '  Japanese Encephalitis Vaccine  ',
        availableVaccines: [],
      });
      expect(validCustom).toEqual({
        valid: true,
        philHealthLibrary: 'OtherImm',
        philHealthCode: 'OTH',
        vaccineName: 'Japanese Encephalitis Vaccine',
      });
    });
  });

  describe('Feature 14: Chart Modal Integration Contracts', () => {
    test('callback handlers pass data to parent chart without crashing', async () => {
      let administeredPayload: AdministerImmunizationPayload | null = null;
      let historicalPayload: RecordHistoricalImmunizationPayload | null = null;

      const handleAdminister = async (p: AdministerImmunizationPayload) => {
        administeredPayload = p;
      };

      const handleHistorical = async (p: RecordHistoricalImmunizationPayload) => {
        historicalPayload = p;
      };

      const sampleAdmin: AdministerImmunizationPayload = {
        philHealthLibrary: 'lib_immchild',
        philHealthCode: 'C01',
        vaccineName: 'BCG',
        lotBatchNumber: 'LOT-999',
        expirationDate: '2028-12-31',
        doseSequence: 1,
        route: 'Intradermal',
        injectionSite: 'Right Deltoid',
        administeredAtUtc: new Date().toISOString(),
        administeredByStaffName: 'Nurse Joy',
      };

      const sampleHist: RecordHistoricalImmunizationPayload = {
        philHealthLibrary: 'lib_immchild',
        philHealthCode: 'C09',
        vaccineName: 'Hepatitis B1',
        administeredDate: '2025-01-01',
        historicalFacilityName: 'Cebu Doctors',
        doseSequence: 1,
        isSeriesCompleted: true,
      };

      await handleAdminister(sampleAdmin);
      await handleHistorical(sampleHist);

      expect(administeredPayload).toEqual(sampleAdmin);
      expect(historicalPayload).toEqual(sampleHist);
    });
  });
});
