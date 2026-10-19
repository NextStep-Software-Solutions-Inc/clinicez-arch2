// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID, onPress, ...props }: any) =>
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
  RefreshControl: createMockComponent('RefreshControl'),
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
  Alert: { alert: () => {} },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  PanResponder: { create: () => ({ panHandlers: {} }) },
  processColor: (c: any) => c,
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('expo-document-picker', () => ({
  getDocumentAsync: () => Promise.resolve({ canceled: true, assets: null }),
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('svg'),
  Path: createMockComponent('path'),
  Circle: createMockComponent('circle'),
  Rect: createMockComponent('rect'),
  Line: createMockComponent('line'),
  default: createMockComponent('svg'),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));

mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
}));

mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: () => ({
    width: 1280,
    height: 800,
    isCompact: false,
    isWorkstation: true,
    isDesktop: true,
    isWide: false,
  }),
}));

import type {
  ClinicPatient,
  PatientChart,
  DentalToothRecord,
  ClinicalProcedureRecord,
  ClinicSpecialtyMode,
} from '../services/clinicService';

const {
  default: DentalChartTab,
  getPlainEnglishToothName,
  getStatusBadgeVariant,
  getToothStatusColor,
} = await import('../components/chart/DentalChartTab');

const {
  default: GeneralSettingsTab,
  CLINIC_SPECIALTY_OPTIONS,
} = await import('../components/settings/GeneralSettingsTab');

const {
  CHART_TABS,
  DENTAL_CHART_TAB,
  getAvailableChartTabs,
} = await import('../components/chart/types');

const { default: ChartTabContentView } = await import('../components/chart/ChartTabContentView');
const {
  CenteredModalChartLayout,
  SplitPaneChartLayout,
  SlideOverDrawerChartLayout,
} = await import('../components/chart/layouts');

const { default: PatientChartModal } = await import('../components/chart/PatientChartModal');

// =============================================================================
// MOCK DATA GENERATORS
// =============================================================================

const createMockPatient = (overrides?: Partial<ClinicPatient>): ClinicPatient => ({
  id: 'pt-stress-001',
  clinicId: 'cl-stress-001',
  patientCode: 'PX-STRESS-01',
  fullName: 'Maria Dela Cruz',
  firstName: 'Maria',
  lastName: 'Dela Cruz',
  gender: 'Female',
  dateOfBirth: '2018-04-12',
  age: 8,
  bloodType: 'A+',
  verificationStatus: 'Verified',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('Challenger MC-2 Empirical Stress Suite', () => {
  // ===========================================================================
  // SUITE 1: DEEP-LINKING EDGE CASES
  // ===========================================================================
  describe('1. Deep-Linking Edge Cases (Deciduous Tooth & Boundary / Invalid Numbers)', () => {
    test('1.1 Deep link with child tooth #55 auto-switches dentition to Child and renders primary tooth details', () => {
      const patient = createMockPatient();
      const chart: PatientChart = {
        patientId: patient.id,
        dentalTeeth: [
          {
            id: 'dt-55',
            tenantId: 'tn-01',
            clinicId: 'cl-001',
            patientId: patient.id,
            toothNumber: 55,
            status: 'Decay',
            surface: 'MOD',
            notes: 'Deciduous molar caries requiring pulpotomy evaluation',
            createdAt: '2026-04-01T00:00:00Z',
            updatedAt: '2026-04-01T00:00:00Z',
          },
        ],
      };

      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          patient,
          chart,
          focusToothNumber: 55,
        })
      );

      // Must auto-switch to Child mode (Quadrant 5 visible)
      expect(html).toContain('Q5 • Upper Right');
      expect(html).toContain('Q6 • Upper Left');
      expect(html).toContain('Q7 • Lower Left');
      expect(html).toContain('Q8 • Lower Right');
      expect(html).toContain('data-testid="tooth-cell-55"');

      // Inspector must display plain-English tooth name and details
      expect(html).toContain('Tooth #55');
      expect(html).toContain('Upper Right Primary Second Molar');
      expect(html).toContain('Decay');
      expect(html).toContain('MOD');
      expect(html).toContain('Deciduous molar caries requiring pulpotomy evaluation');
    });

    test('1.2 Deep link with lower deciduous boundary tooth #85 auto-switches dentition to Child', () => {
      const patient = createMockPatient();
      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          patient,
          chart: { patientId: patient.id },
          focusToothNumber: 85,
        })
      );

      expect(html).toContain('Q8 • Lower Right');
      expect(html).toContain('data-testid="tooth-cell-85"');
      expect(html).toContain('Tooth #85');
      expect(html).toContain('Lower Right Primary Second Molar');
      expect(html).toContain('Healthy');
    });

    test('1.3 Deep link with upper deciduous boundary tooth #51 auto-switches dentition to Child', () => {
      const patient = createMockPatient();
      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          patient,
          chart: { patientId: patient.id },
          focusToothNumber: 51,
        })
      );

      expect(html).toContain('Q5 • Upper Right');
      expect(html).toContain('data-testid="tooth-cell-51"');
      expect(html).toContain('Tooth #51');
      expect(html).toContain('Upper Right Primary Central Incisor');
    });

    test('1.4 Deep link with non-existent tooth #99 handles gracefully without exception', () => {
      const patient = createMockPatient();
      // Should not throw or crash
      let html = '';
      expect(() => {
        html = renderToStaticMarkup(
          React.createElement(DentalChartTab, {
            patient,
            chart: { patientId: patient.id },
            focusToothNumber: 99,
          })
        );
      }).not.toThrow();

      // Defaults to Adult mode because 99 is not between 51 and 85
      expect(html).toContain('MAXILLARY ARCH (UPPER)');
      expect(html).toContain('MANDIBULAR ARCH (LOWER)');
      expect(html).toContain('Q1 • Upper Right');

      // Inspector renders gracefully with fallback plain-English tooth name
      expect(html).toContain('Tooth #99');
      expect(html).toContain('Healthy');
      expect(html).toContain('None / Intact');
      expect(html).toContain('No remarks recorded.');
      expect(html).toContain('No clinical procedures on record for this tooth.');
    });

    test('1.5 getPlainEnglishToothName returns robust fallback strings for non-standard / invalid teeth', () => {
      expect(getPlainEnglishToothName(99)).toBe('Tooth #99');
      expect(getPlainEnglishToothName(0)).toBe('Tooth #0');
      expect(getPlainEnglishToothName(-1)).toBe('Tooth #-1');
      expect(getPlainEnglishToothName(100)).toBe('Tooth #100');
      expect(getPlainEnglishToothName(50)).toBe('Tooth #50');
      expect(getPlainEnglishToothName(86)).toBe('Tooth #86');
    });

    test('1.6 Deep link with tooth #0 (falsy) renders EmptyState prompt without selecting invalid tooth', () => {
      const patient = createMockPatient();
      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          patient,
          chart: { patientId: patient.id },
          focusToothNumber: 0,
        })
      );

      expect(html).toContain('data-testid="tooth-inspector-prompt"');
      expect(html).toContain('Select a Tooth');
      expect(html).toContain('Tap any tooth on the odontogram above');
    });

    test('1.7 Deep link with negative tooth number #-5 handles gracefully without crashing', () => {
      const patient = createMockPatient();
      let html = '';
      expect(() => {
        html = renderToStaticMarkup(
          React.createElement(DentalChartTab, {
            patient,
            chart: { patientId: patient.id },
            focusToothNumber: -5,
          })
        );
      }).not.toThrow();

      expect(html).toContain('Tooth #-5');
      expect(html).toContain('Healthy');
    });

    test('1.8 Deep link with teeth just outside child range (50 and 86) defaults to Adult mode', () => {
      const patient = createMockPatient();

      const html50 = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          patient,
          chart: { patientId: patient.id },
          focusToothNumber: 50,
        })
      );
      expect(html50).toContain('Q1 • Upper Right');
      expect(html50).toContain('Tooth #50');

      const html86 = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          patient,
          chart: { patientId: patient.id },
          focusToothNumber: 86,
        })
      );
      expect(html86).toContain('Q1 • Upper Right');
      expect(html86).toContain('Tooth #86');
    });
  });

  // ===========================================================================
  // SUITE 2: HISTORICAL PROCEDURE DEDUPLICATION STRESS TESTING
  // ===========================================================================
  describe('2. Historical Procedure Deduplication Stress Testing', () => {
    test('2.1 Identical procedure present in BOTH dentalProcedures and proceduresHistory is deduplicated to 1 entry', () => {
      const patient = createMockPatient();
      const sharedProcedure: ClinicalProcedureRecord = {
        id: 'proc-dup-001',
        tenantId: 'tn-01',
        clinicId: 'cl-001',
        patientId: patient.id,
        patientName: patient.fullName,
        procedureCode: 'D2391',
        procedureName: 'Resin-Based Composite - One Surface',
        category: 'Procedure',
        scheduledAt: '2026-03-15T09:00:00Z',
        performedAt: '2026-03-15T09:30:00Z',
        status: 'Completed',
        orderedByDoctorName: 'Dr. Santos',
        clinicalNotes: 'Occlusal restoration completed.',
        toothNumber: 14,
        toothSurface: 'O',
      };

      const chart: PatientChart = {
        patientId: patient.id,
        // Same procedure listed in both arrays (e.g. backend aggregate overlap)
        dentalProcedures: [sharedProcedure],
        proceduresHistory: [sharedProcedure],
      };

      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          patient,
          chart,
          focusToothNumber: 14,
        })
      );

      // Should show count (1), NOT (2)
      expect(html).toContain('PROCEDURE HISTORY FOR TOOTH #14 (1)');
      expect(html).toContain('Resin-Based Composite - One Surface');
      expect(html).toContain('Occlusal restoration completed.');
    });

    test('2.2 Triple duplicate entries within dentalProcedures are collapsed to exactly 1 entry', () => {
      const patient = createMockPatient();
      const duplicateProc: ClinicalProcedureRecord = {
        id: 'proc-dup-triple',
        tenantId: 'tn-01',
        clinicId: 'cl-001',
        patientId: patient.id,
        procedureCode: 'D7140',
        procedureName: 'Extraction, Erupted Tooth',
        category: 'Procedure',
        scheduledAt: '2026-02-10T10:00:00Z',
        performedAt: '2026-02-10T10:20:00Z',
        status: 'Completed',
        orderedByDoctorName: 'Dr. Reyes',
        clinicalNotes: 'Routine simple extraction under local anesthesia.',
        toothNumber: 48,
      };

      const chart: PatientChart = {
        patientId: patient.id,
        dentalProcedures: [duplicateProc, duplicateProc, duplicateProc],
        proceduresHistory: [],
      };

      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          patient,
          chart,
          focusToothNumber: 48,
        })
      );

      expect(html).toContain('PROCEDURE HISTORY FOR TOOTH #48 (1)');
      expect(html).toContain('Extraction, Erupted Tooth');
    });

    test('2.3 Duplicate procedures WITHOUT id fallback to name-timestamp composite key and deduplicate correctly', () => {
      const patient = createMockPatient();
      const procWithoutIdA: ClinicalProcedureRecord = {
        id: undefined as any,
        tenantId: 'tn-01',
        clinicId: 'cl-001',
        patientId: patient.id,
        procedureCode: 'D1110',
        procedureName: 'Dental Prophylaxis - Adult',
        category: 'Procedure',
        scheduledAt: '2026-01-05T08:00:00Z',
        performedAt: '2026-01-05T08:45:00Z',
        status: 'Completed',
        clinicalNotes: 'Full mouth scaling and polishing.',
        toothNumber: 31,
      };
      const procWithoutIdB: ClinicalProcedureRecord = {
        id: '',
        tenantId: 'tn-01',
        clinicId: 'cl-001',
        patientId: patient.id,
        procedureCode: 'D1110',
        procedureName: 'Dental Prophylaxis - Adult',
        category: 'Procedure',
        scheduledAt: '2026-01-05T08:00:00Z',
        performedAt: '2026-01-05T08:45:00Z',
        status: 'Completed',
        clinicalNotes: 'Full mouth scaling and polishing.',
        toothNumber: 31,
      };

      const chart: PatientChart = {
        patientId: patient.id,
        dentalProcedures: [procWithoutIdA],
        proceduresHistory: [procWithoutIdB],
      };

      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          patient,
          chart,
          focusToothNumber: 31,
        })
      );

      expect(html).toContain('PROCEDURE HISTORY FOR TOOTH #31 (1)');
      expect(html).toContain('Dental Prophylaxis - Adult');
    });

    test('2.4 Multiple DISTINCT procedures on the same tooth are all preserved without false deduplication', () => {
      const patient = createMockPatient();
      const proc1: ClinicalProcedureRecord = {
        id: 'proc-root-canal',
        patientId: patient.id,
        procedureCode: 'D3330',
        procedureName: 'Endodontic Therapy - Molar',
        scheduledAt: '2026-01-10T10:00:00Z',
        performedAt: '2026-01-10T11:30:00Z',
        status: 'Completed',
        toothNumber: 16,
      };
      const proc2: ClinicalProcedureRecord = {
        id: 'proc-core-buildup',
        patientId: patient.id,
        procedureCode: 'D2950',
        procedureName: 'Core Buildup, Including Pins',
        scheduledAt: '2026-01-17T10:00:00Z',
        performedAt: '2026-01-17T10:45:00Z',
        status: 'Completed',
        toothNumber: 16,
      };
      const proc3: ClinicalProcedureRecord = {
        id: 'proc-crown-prep',
        patientId: patient.id,
        procedureCode: 'D2740',
        procedureName: 'Crown - Porcelain/Ceramic',
        scheduledAt: '2026-01-24T14:00:00Z',
        performedAt: '2026-01-24T15:00:00Z',
        status: 'Completed',
        toothNumber: 16,
      };

      const chart: PatientChart = {
        patientId: patient.id,
        dentalProcedures: [proc1, proc2, proc3],
      };

      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          patient,
          chart,
          focusToothNumber: 16,
        })
      );

      expect(html).toContain('PROCEDURE HISTORY FOR TOOTH #16 (3)');
      expect(html).toContain('Endodontic Therapy - Molar');
      expect(html).toContain('Core Buildup, Including Pins');
      expect(html).toContain('Crown - Porcelain/Ceramic');
    });

    test('2.5 Procedures belonging to other teeth are strictly filtered out', () => {
      const patient = createMockPatient();
      const procTooth16: ClinicalProcedureRecord = {
        id: 'proc-16',
        patientId: patient.id,
        procedureName: 'Molar Restoration',
        toothNumber: 16,
      };
      const procTooth21: ClinicalProcedureRecord = {
        id: 'proc-21',
        patientId: patient.id,
        procedureName: 'Incisor Veneer',
        toothNumber: 21,
      };

      const chart: PatientChart = {
        patientId: patient.id,
        dentalProcedures: [procTooth16, procTooth21],
      };

      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          patient,
          chart,
          focusToothNumber: 16,
        })
      );

      expect(html).toContain('PROCEDURE HISTORY FOR TOOTH #16 (1)');
      expect(html).toContain('Molar Restoration');
      expect(html).not.toContain('Incisor Veneer');
    });

    test('2.6 Null or undefined procedure arrays handle gracefully without runtime exceptions', () => {
      const patient = createMockPatient();
      const chart: PatientChart = {
        patientId: patient.id,
        dentalProcedures: undefined,
        proceduresHistory: undefined,
      };

      let html = '';
      expect(() => {
        html = renderToStaticMarkup(
          React.createElement(DentalChartTab, {
            patient,
            chart,
            focusToothNumber: 11,
          })
        );
      }).not.toThrow();

      expect(html).toContain('PROCEDURE HISTORY FOR TOOTH #11 (0)');
      expect(html).toContain('No clinical procedures on record for this tooth.');
    });
  });

  // ===========================================================================
  // SUITE 3: SETTINGS SPECIALTY MODE TRANSITIONS
  // ===========================================================================
  describe('3. Settings Specialty Mode Transitions (Medical -> Dental -> Multi-Specialty -> Medical)', () => {
    test('3.1 Initial state in Medical mode displays Inactive dental module with disabled toggle', () => {
      const html = renderToStaticMarkup(
        React.createElement(GeneralSettingsTab, {
          clinicName: 'San Juan Medical Clinic',
          setClinicName: () => {},
          accreditationNumber: 'PH-MED-01',
          setAccreditationNumber: () => {},
          operatingHours: '8am-5pm',
          setOperatingHours: () => {},
          slotDuration: '30',
          setSlotDuration: () => {},
          consultationFee: '500',
          setConsultationFee: () => {},
          letterheadHeader: 'Header',
          setLetterheadHeader: () => {},
          letterheadAddress: 'Address',
          setLetterheadAddress: () => {},
          letterheadContact: 'Contact',
          setLetterheadContact: () => {},
          savingSettings: false,
          onSavePreferences: async () => {},
          showSkeletons: false,
          settingsLoadError: null,
          specialtyMode: 'Medical',
          enableDentalModule: false,
          settings: {
            specialtyMode: 'Medical',
            enableDentalModule: false,
          } as any,
          eodReport: null,
          eodLoadError: null,
          onRefreshEod: async () => {},
          formatPeso: (v) => `₱${v}`,
        })
      );

      expect(html).toContain('Medical Practice');
      expect(html).toContain('Inactive in Medical Mode');
      expect(html).toContain('Select Dental or Multi-Specialty to activate dental charting');
    });

    test('3.2 Transition Medical -> Dental auto-activates dental module and locks toggle to permanently active', () => {
      const specialtyCalls: ClinicSpecialtyMode[] = [];
      const dentalToggleCalls: boolean[] = [];

      const setSpecialtyMode = (mode: ClinicSpecialtyMode) => specialtyCalls.push(mode);
      const setEnableDentalModule = (val: boolean) => dentalToggleCalls.push(val);

      // Render in Dental mode
      const html = renderToStaticMarkup(
        React.createElement(GeneralSettingsTab, {
          clinicName: 'Smile Dental Specialist',
          setClinicName: () => {},
          accreditationNumber: 'PH-DENT-01',
          setAccreditationNumber: () => {},
          operatingHours: '9am-6pm',
          setOperatingHours: () => {},
          slotDuration: '45',
          setSlotDuration: () => {},
          consultationFee: '800',
          setConsultationFee: () => {},
          letterheadHeader: 'Dental Header',
          setLetterheadHeader: () => {},
          letterheadAddress: 'Dental Address',
          setLetterheadAddress: () => {},
          letterheadContact: 'Dental Contact',
          setLetterheadContact: () => {},
          savingSettings: false,
          onSavePreferences: async () => {},
          showSkeletons: false,
          settingsLoadError: null,
          specialtyMode: 'Dental',
          setSpecialtyMode,
          enableDentalModule: true,
          setEnableDentalModule,
          settings: {
            specialtyMode: 'Dental',
            enableDentalModule: true,
          } as any,
          eodReport: null,
          eodLoadError: null,
          onRefreshEod: async () => {},
          formatPeso: (v) => `₱${v}`,
        })
      );

      expect(html).toContain('Dental Practice');
      expect(html).toContain('Permanently Active (Dental Practice)');
      expect(html).toContain('The FDI odontogram, tooth surface tracking, and dental procedure catalog are permanently active');
    });

    test('3.3 Transition Dental -> Multi-Specialty unlocks interactive dental module toggle', () => {
      const html = renderToStaticMarkup(
        React.createElement(GeneralSettingsTab, {
          clinicName: 'Apex Multi-Specialty Hospital',
          setClinicName: () => {},
          accreditationNumber: 'PH-MULTI-01',
          setAccreditationNumber: () => {},
          operatingHours: '24/7',
          setOperatingHours: () => {},
          slotDuration: '30',
          setSlotDuration: () => {},
          consultationFee: '600',
          setConsultationFee: () => {},
          letterheadHeader: 'Apex',
          setLetterheadHeader: () => {},
          letterheadAddress: 'Apex Road',
          setLetterheadAddress: () => {},
          letterheadContact: '0917-000-0000',
          setLetterheadContact: () => {},
          savingSettings: false,
          onSavePreferences: async () => {},
          showSkeletons: false,
          settingsLoadError: null,
          specialtyMode: 'Multi-Specialty',
          enableDentalModule: true,
          settings: {
            specialtyMode: 'Multi-Specialty',
            enableDentalModule: true,
          } as any,
          eodReport: null,
          eodLoadError: null,
          onRefreshEod: async () => {},
          formatPeso: (v) => `₱${v}`,
        })
      );

      expect(html).toContain('Multi-Specialty Clinic');
      expect(html).toContain('Active');
      expect(html).toContain('Enables adult (11–48) and child (51–85) FDI odontograms');
    });

    test('3.4 Transition Multi-Specialty -> Medical returns dental module to inactive state', () => {
      const html = renderToStaticMarkup(
        React.createElement(GeneralSettingsTab, {
          clinicName: 'Returned to Medical Clinic',
          setClinicName: () => {},
          accreditationNumber: 'PH-MED-02',
          setAccreditationNumber: () => {},
          operatingHours: '8am-5pm',
          setOperatingHours: () => {},
          slotDuration: '30',
          setSlotDuration: () => {},
          consultationFee: '500',
          setConsultationFee: () => {},
          letterheadHeader: 'Med',
          setLetterheadHeader: () => {},
          letterheadAddress: 'Med Ave',
          setLetterheadAddress: () => {},
          letterheadContact: '0917-111-2222',
          setLetterheadContact: () => {},
          savingSettings: false,
          onSavePreferences: async () => {},
          showSkeletons: false,
          settingsLoadError: null,
          specialtyMode: 'Medical',
          enableDentalModule: false,
          settings: {
            specialtyMode: 'Medical',
            enableDentalModule: false,
          } as any,
          eodReport: null,
          eodLoadError: null,
          onRefreshEod: async () => {},
          formatPeso: (v) => `₱${v}`,
        })
      );

      expect(html).toContain('Inactive in Medical Mode');
    });

    test('3.5 Backend un-hyphenated "MultiSpecialty" value is gracefully parsed and rendered as Multi-Specialty', () => {
      const html = renderToStaticMarkup(
        React.createElement(GeneralSettingsTab, {
          clinicName: 'Backend Seed Clinic',
          setClinicName: () => {},
          accreditationNumber: 'PH-SEED-01',
          setAccreditationNumber: () => {},
          operatingHours: '8am-5pm',
          setOperatingHours: () => {},
          slotDuration: '30',
          setSlotDuration: () => {},
          consultationFee: '500',
          setConsultationFee: () => {},
          letterheadHeader: 'Seed',
          setLetterheadHeader: () => {},
          letterheadAddress: 'Seed Address',
          setLetterheadAddress: () => {},
          letterheadContact: '0917-333-4444',
          setLetterheadContact: () => {},
          savingSettings: false,
          onSavePreferences: async () => {},
          showSkeletons: false,
          settingsLoadError: null,
          // Notice backend returns "MultiSpecialty" without hyphen
          settings: {
            specialtyMode: 'MultiSpecialty',
            enableDentalModule: true,
          } as any,
          eodReport: null,
          eodLoadError: null,
          onRefreshEod: async () => {},
          formatPeso: (v) => `₱${v}`,
        })
      );

      expect(html).toContain('Multi-Specialty Clinic');
      expect(html).toContain('Active');
    });
  });

  // ===========================================================================
  // SUITE 4: LAYOUT MODE STRESS TESTING (Centered Modal, Slide-Over, Split-Pane)
  // ===========================================================================
  describe('4. Layout Mode Stress Testing (Modal, Drawer, Split-Pane)', () => {
    const patient = createMockPatient();
    const mockChart: PatientChart = {
      patientId: patient.id,
      demographics: {
        fullName: patient.fullName,
        gender: patient.gender,
        dateOfBirth: patient.dateOfBirth,
      },
      dentalTeeth: [
        {
          id: 'dt-stress-11',
          tenantId: 'tn-01',
          clinicId: 'cl-001',
          patientId: patient.id,
          toothNumber: 11,
          status: 'Crown',
          surface: 'L',
          notes: 'Ceramic veneer / crown intact',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        },
      ],
      dentalProcedures: [
        {
          id: 'proc-stress-crown',
          patientId: patient.id,
          procedureName: 'Porcelain Crown Cementation',
          toothNumber: 11,
          status: 'Completed',
          scheduledAt: '2026-03-01T10:00:00Z',
          performedAt: '2026-03-01T11:00:00Z',
        },
      ],
    };

    const availableTabs = getAvailableChartTabs(true);

    test('4.1 Centered Modal layout correctly renders Dental Tab and Odontogram visualizer', () => {
      const html = renderToStaticMarkup(
        React.createElement(CenteredModalChartLayout, {
          patient,
          patientChart: mockChart,
          activeTab: 'dental',
          availableTabs,
          onTabChange: () => {},
          onClose: () => {},
          onEditDemographics: () => {},
          currentLayout: 'modal',
          onSwitchLayout: () => {},
          focusToothNumber: 11,
        })
      );

      expect(html).toContain('Dental Chart');
      expect(html).toContain('Odontogram Visualizer');
      expect(html).toContain('MAXILLARY ARCH (UPPER)');
      expect(html).toContain('data-testid="tooth-cell-11"');
      expect(html).toContain('Tooth #11');
      expect(html).toContain('Upper Right Central Incisor');
      expect(html).toContain('Porcelain Crown Cementation');
    });

    test('4.2 Slide-Over Drawer layout correctly renders Dental Tab and Odontogram visualizer', () => {
      const html = renderToStaticMarkup(
        React.createElement(SlideOverDrawerChartLayout, {
          patient,
          patientChart: mockChart,
          activeTab: 'dental',
          availableTabs,
          onTabChange: () => {},
          onClose: () => {},
          onEditDemographics: () => {},
          currentLayout: 'drawer',
          onSwitchLayout: () => {},
          focusToothNumber: 11,
        })
      );

      expect(html).toContain('Dental Chart');
      expect(html).toContain('Odontogram Visualizer');
      expect(html).toContain('MANDIBULAR ARCH (LOWER)');
      expect(html).toContain('data-testid="tooth-cell-11"');
      expect(html).toContain('Tooth #11');
      expect(html).toContain('Porcelain Crown Cementation');
    });

    test('4.3 Split-Pane Clinical Workstation layout renders summary on left and Dental Tab on right', () => {
      const html = renderToStaticMarkup(
        React.createElement(SplitPaneChartLayout, {
          patient,
          patientChart: mockChart,
          activeTab: 'dental',
          availableTabs,
          onTabChange: () => {},
          onClose: () => {},
          onEditDemographics: () => {},
          currentLayout: 'split',
          onSwitchLayout: () => {},
          focusToothNumber: 11,
        })
      );

      expect(html).toContain('Dental Chart');
      expect(html).toContain('Odontogram Visualizer');
      expect(html).toContain('data-testid="tooth-cell-11"');
      expect(html).toContain('Tooth #11');
      expect(html).toContain('Porcelain Crown Cementation');
    });

    test('4.4 PatientChartModal root modal renders seamlessly with configuredLayout="modal"', () => {
      const html = renderToStaticMarkup(
        React.createElement(PatientChartModal, {
          visible: true,
          patient,
          patientChart: mockChart,
          activeTab: 'dental',
          preferredLayout: 'modal',
          onClose: () => {},
          focusToothNumber: 11,
        })
      );

      expect(html).toContain('Dental Chart');
      expect(html).toContain('Odontogram Visualizer');
      expect(html).toContain('Tooth #11');
    });

    test('4.5 PatientChartModal root modal renders seamlessly with configuredLayout="drawer"', () => {
      const html = renderToStaticMarkup(
        React.createElement(PatientChartModal, {
          visible: true,
          patient,
          patientChart: mockChart,
          activeTab: 'dental',
          preferredLayout: 'drawer',
          onClose: () => {},
          focusToothNumber: 11,
        })
      );

      expect(html).toContain('Dental Chart');
      expect(html).toContain('Odontogram Visualizer');
      expect(html).toContain('Tooth #11');
    });

    test('4.6 PatientChartModal root modal renders seamlessly with configuredLayout="split"', () => {
      const html = renderToStaticMarkup(
        React.createElement(PatientChartModal, {
          visible: true,
          patient,
          patientChart: mockChart,
          activeTab: 'dental',
          preferredLayout: 'split',
          onClose: () => {},
          focusToothNumber: 11,
        })
      );

      expect(html).toContain('Dental Chart');
      expect(html).toContain('Odontogram Visualizer');
      expect(html).toContain('Tooth #11');
    });

    test('4.7 ChartTabContentView renders loading skeleton when loadingChart=true and error state when chartError exists', () => {
      // Loading state
      const loadingHtml = renderToStaticMarkup(
        React.createElement(ChartTabContentView, {
          patient,
          patientChart: null,
          loadingChart: true,
          activeTab: 'dental',
          onTabChange: () => {},
          onClose: () => {},
          onEditDemographics: () => {},
          currentLayout: 'modal',
          onSwitchLayout: () => {},
        })
      );
      expect(loadingHtml).toContain('aria-label="Loading"');
      expect(loadingHtml).toContain('role="progressbar"');

      // Error state
      const errorHtml = renderToStaticMarkup(
        React.createElement(ChartTabContentView, {
          patient,
          patientChart: null,
          loadingChart: false,
          chartError: 'Failed to retrieve dental chart from clinic-api',
          activeTab: 'dental',
          onTabChange: () => {},
          onClose: () => {},
          onEditDemographics: () => {},
          currentLayout: 'modal',
          onSwitchLayout: () => {},
        })
      );
      expect(errorHtml).toContain('Unable to load the chart');
      expect(errorHtml).toContain('Failed to retrieve dental chart from clinic-api');
    });
  });
});
