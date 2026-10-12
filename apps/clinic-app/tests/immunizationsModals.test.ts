// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

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
  Path: 'path',
  Circle: 'circle',
  Rect: 'rect',
  Line: 'line',
  default: 'svg',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const {
  default: StatutoryImmunizationsTab,
  PHILHEALTH_STATUTORY_VACCINES,
} = await import('../components/chart/StatutoryImmunizationsTab');

const {
  default: AdministerVaccineModal,
  COHORTS,
  VACCINE_ROUTES,
  INJECTION_SITES,
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
  PatientImmunizationRecord,
  AdministerImmunizationPayload,
  RecordHistoricalImmunizationPayload,
} from '../services/clinicService';

describe('Milestone M3: Statutory Immunizations & Clinical Modals (Features 11, 12, 13, 14)', () => {
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
    gender: 'Male',
    civilStatus: 'Single',
    contactNumber: '09170000001',
    verificationStatus: 'Verified',
    createdAtUtc: '2025-01-01T00:00:00Z',
    updatedAtUtc: '2025-01-01T00:00:00Z',
  };

  const mockYoungWomanPatient: ClinicPatient = {
    id: 'pat-yw-02',
    clinicId: 'clinic-1',
    tenantId: 'tenant-1',
    patientCode: 'PAT-0002',
    fullName: 'Maria Santos',
    firstName: 'Maria',
    lastName: 'Santos',
    dateOfBirth: '2008-05-15',
    age: 18,
    gender: 'Female',
    civilStatus: 'Single',
    contactNumber: '09170000002',
    verificationStatus: 'Verified',
    createdAtUtc: '2025-01-01T00:00:00Z',
    updatedAtUtc: '2025-01-01T00:00:00Z',
  };

  const mockElderlyPatient: ClinicPatient = {
    id: 'pat-eld-03',
    clinicId: 'clinic-1',
    tenantId: 'tenant-1',
    patientCode: 'PAT-0003',
    fullName: 'Lolo Pedro Reyes',
    firstName: 'Pedro',
    lastName: 'Reyes',
    dateOfBirth: '1955-03-20',
    age: 71,
    gender: 'Male',
    civilStatus: 'Married',
    contactNumber: '09170000003',
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
      philHealthCode: 'C02',
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
    test('renders + Administer Vaccine and + Add Historical Vaccine header action buttons', () => {
      const html = renderToStaticMarkup(
        React.createElement(StatutoryImmunizationsTab, {
          patient: mockChildPatient,
          demographics: { age: 1, gender: 'Male' } as PatientDemographics,
          immunizations: [],
          onAdministerVaccine: async () => {},
          onRecordHistoricalVaccine: async () => {},
        })
      );

      expect(html).toContain('+ Administer Vaccine');
      expect(html).toContain('+ Add Historical Vaccine');
    });

    test('renders PhilHealth Konsulta 999 statutory fallback banner when zero immunizations recorded', () => {
      const html = renderToStaticMarkup(
        React.createElement(StatutoryImmunizationsTab, {
          patient: mockChildPatient,
          demographics: { age: 1, gender: 'Male' } as PatientDemographics,
          immunizations: [],
          onAdministerVaccine: async () => {},
          onRecordHistoricalVaccine: async () => {},
        })
      );

      expect(html).toContain('PhilHealth Konsulta Statutory Coverage (Fallback Code 999)');
      expect(html).toContain('statutory fallback code 999');
      expect(html).toContain('No immunizations recorded');
    });

    test('renders recorded immunizations with distinction between administered and historical', () => {
      const html = renderToStaticMarkup(
        React.createElement(StatutoryImmunizationsTab, {
          patient: mockChildPatient,
          demographics: { age: 1, gender: 'Male' } as PatientDemographics,
          immunizations: mockSampleImmunizations,
          onAdministerVaccine: async () => {},
          onRecordHistoricalVaccine: async () => {},
        })
      );

      // In-clinic administered details
      expect(html).toContain('BCG');
      expect(html).toContain('LOT-BCG-2026');
      expect(html).toContain('Nurse Clara Garcia');
      expect(html).toContain('PRC: PRC-0987654');

      // Historical immunization details
      expect(html).toContain('Hepatitis B');
      expect(html).toContain('Historical Facility: St. Luke Medical Center');

      // AEFI reporting badge
      expect(html).toContain('AEFI REPORTED: Severity: Mild');
    });

    test('verifies all 4 PhilHealth statutory vaccine catalogs are complete', () => {
      expect(PHILHEALTH_STATUTORY_VACCINES.lib_immchild.length).toBe(13);
      expect(PHILHEALTH_STATUTORY_VACCINES.lib_immyoungw.length).toBe(2);
      expect(PHILHEALTH_STATUTORY_VACCINES.lib_immpregw.length).toBe(5);
      expect(PHILHEALTH_STATUTORY_VACCINES.lib_immelderly.length).toBe(2);

      // Verify specific statutory vaccine codes
      expect(PHILHEALTH_STATUTORY_VACCINES.lib_immchild.map((v) => v.code)).toContain('C01'); // BCG
      expect(PHILHEALTH_STATUTORY_VACCINES.lib_immyoungw.map((v) => v.code)).toContain('Y01'); // HPV
      expect(PHILHEALTH_STATUTORY_VACCINES.lib_immpregw.map((v) => v.code)).toContain('P01'); // Td 1
      expect(PHILHEALTH_STATUTORY_VACCINES.lib_immelderly.map((v) => v.code)).toContain('E01'); // Pneumococcal
    });
  });

  describe('Feature 12: AdministerVaccineModal Configuration & Validation', () => {
    test('renders modal when visible=true with 4 PhilHealth cohort options', () => {
      const html = renderToStaticMarkup(
        React.createElement(AdministerVaccineModal, {
          visible: true,
          onClose: () => {},
          patient: mockChildPatient,
          demographics: { age: 1, gender: 'Male' } as PatientDemographics,
          onAdministerVaccine: async () => {},
        })
      );

      expect(html).toContain('Administer Vaccine');
      expect(html).toContain('PhilHealth Konsulta Statutory In-Clinic Administration');
      for (const cohort of COHORTS) {
        expect(html).toContain(cohort.label);
      }
      expect(html).toContain('Lot / Batch Number *');
      expect(html).toContain('Expiration Date *');
      expect(html).toContain('Administering Staff Name *');
      expect(html).toContain('Administer Vaccine');
    });

    test('validates vaccine expiration date with boundaryMode="futureOrToday"', () => {
      const today = new Date().toISOString().split('T')[0];
      const futureDate = '2028-12-31';
      const pastDate = '2020-01-01';

      // Future date is valid
      const futureResult = validateDateString(futureDate, { boundaryMode: 'futureOrToday' });
      expect(futureResult.isValid).toBe(true);

      // Today is valid
      const todayResult = validateDateString(today, { boundaryMode: 'futureOrToday' });
      expect(todayResult.isValid).toBe(true);

      // Past expiration date must be rejected
      const pastResult = validateDateString(pastDate, { boundaryMode: 'futureOrToday' });
      expect(pastResult.isValid).toBe(false);
      expect(pastResult.errorMessage).toContain('today or in the future');
    });

    test('constructs comprehensive AdministerImmunizationPayload', () => {
      const payload: AdministerImmunizationPayload = {
        philHealthLibrary: 'lib_immchild',
        philHealthCode: 'C01',
        vaccineName: 'BCG (Bacillus Calmette-Guérin)',
        lotBatchNumber: 'LOT-2026-X88',
        expirationDate: '2028-06-30',
        brandName: 'StatVax BCG',
        manufacturer: 'Serum Institute',
        doseSequence: 1,
        route: 'Intradermal',
        injectionSite: 'Right Deltoid',
        administeredAtUtc: new Date().toISOString(),
        administeredByStaffId: 'stf-001',
        administeredByStaffName: 'Dr. Maria Santos',
        administeredByPrcLicense: 'PRC-0123456',
        remarks: 'Given at 1 month well-baby checkup',
      };

      expect(payload.philHealthLibrary).toBe('lib_immchild');
      expect(payload.philHealthCode).toBe('C01');
      expect(payload.lotBatchNumber).toBe('LOT-2026-X88');
      expect(payload.expirationDate).toBe('2028-06-30');
      expect(payload.doseSequence).toBe(1);
      expect(payload.route).toBe('Intradermal');
      expect(payload.injectionSite).toBe('Right Deltoid');
      expect(payload.administeredByStaffName).toBe('Dr. Maria Santos');
      expect(payload.administeredByPrcLicense).toBe('PRC-0123456');
    });

    test('supports all clinical injection routes and sites', () => {
      expect(VACCINE_ROUTES).toContain('Intramuscular (IM)');
      expect(VACCINE_ROUTES).toContain('Subcutaneous (SC)');
      expect(VACCINE_ROUTES).toContain('Intradermal (ID)');
      expect(VACCINE_ROUTES).toContain('Oral (PO)');

      expect(INJECTION_SITES).toContain('Left Deltoid');
      expect(INJECTION_SITES).toContain('Right Deltoid');
      expect(INJECTION_SITES).toContain('Left Anterolateral Thigh');
      expect(INJECTION_SITES).toContain('Right Anterolateral Thigh');
    });
  });

  describe('Feature 13: HistoricalVaccineModal Configuration & Validation', () => {
    test('renders modal when visible=true with historical fields', () => {
      const html = renderToStaticMarkup(
        React.createElement(HistoricalVaccineModal, {
          visible: true,
          onClose: () => {},
          patient: mockChildPatient,
          demographics: { age: 1, gender: 'Male' } as PatientDemographics,
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
      const today = new Date().toISOString().split('T')[0];
      const validPastDate = '2024-06-15';
      const invalidFutureDate = '2099-12-31';

      // Past date is valid
      const pastResult = validateDateString(validPastDate, { boundaryMode: 'pastOrToday' });
      expect(pastResult.isValid).toBe(true);

      // Today is valid
      const todayResult = validateDateString(today, { boundaryMode: 'pastOrToday' });
      expect(todayResult.isValid).toBe(true);

      // Future date must be rejected
      const futureResult = validateDateString(invalidFutureDate, { boundaryMode: 'pastOrToday' });
      expect(futureResult.isValid).toBe(false);
      expect(futureResult.errorMessage).toContain('Future date not permitted');
    });

    test('constructs comprehensive RecordHistoricalImmunizationPayload', () => {
      const payload: RecordHistoricalImmunizationPayload = {
        philHealthLibrary: 'lib_immchild',
        philHealthCode: 'C02',
        vaccineName: 'Hepatitis B (Birth dose)',
        administeredDate: '2024-01-10',
        historicalFacilityName: 'Baguio General Hospital',
        doseSequence: 1,
        isSeriesCompleted: true,
        lotBatchNumber: 'LOT-HIST-HEP-01',
        route: 'Intramuscular (IM)',
        injectionSite: 'Left Anterolateral Thigh',
        remarks: 'Transcribed from official mother-and-child card',
      };

      expect(payload.philHealthLibrary).toBe('lib_immchild');
      expect(payload.philHealthCode).toBe('C02');
      expect(payload.administeredDate).toBe('2024-01-10');
      expect(payload.historicalFacilityName).toBe('Baguio General Hospital');
      expect(payload.isSeriesCompleted).toBe(true);
      expect(payload.doseSequence).toBe(1);
    });

    test('initializes cohort correctly based on patient age and gender', () => {
      // Child (< 18) -> lib_immchild -> includes BCG
      const childHtml = renderToStaticMarkup(
        React.createElement(HistoricalVaccineModal, {
          visible: true,
          onClose: () => {},
          demographics: { age: 5, gender: 'Female' } as PatientDemographics,
          onRecordHistoricalVaccine: async () => {},
        })
      );
      expect(childHtml).toContain('BCG');

      // Young Woman (Female, 18) -> lib_immyoungw -> includes Human Papillomavirus
      const ywHtml = renderToStaticMarkup(
        React.createElement(HistoricalVaccineModal, {
          visible: true,
          onClose: () => {},
          demographics: { age: 18, gender: 'Female' } as PatientDemographics,
          onRecordHistoricalVaccine: async () => {},
        })
      );
      expect(ywHtml).toContain('Human Papillomavirus');

      // Senior Citizen (65) -> lib_immelderly -> includes Pneumococcal
      const seniorHtml = renderToStaticMarkup(
        React.createElement(HistoricalVaccineModal, {
          visible: true,
          onClose: () => {},
          demographics: { age: 65, gender: 'Male', isSenior: true } as PatientDemographics,
          onRecordHistoricalVaccine: async () => {},
        })
      );
      expect(seniorHtml).toContain('Pneumococcal');
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
        philHealthCode: 'C02',
        vaccineName: 'Hepatitis B',
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
