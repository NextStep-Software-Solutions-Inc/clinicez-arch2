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

const {
  CenteredModalChartLayout,
  SplitPaneChartLayout,
  SlideOverDrawerChartLayout,
} = await import('../components/chart/layouts');

const { default: PatientChartModal } = await import('../components/chart/PatientChartModal');

// Helper to create test patient
const createTestPatient = (overrides?: Partial<ClinicPatient>): ClinicPatient => ({
  id: 'pt-adversarial-01',
  clinicId: 'cl-adversarial-01',
  patientCode: 'PX-ADV-001',
  fullName: 'Juan Batumbakal',
  firstName: 'Juan',
  lastName: 'Batumbakal',
  gender: 'Male',
  dateOfBirth: '2015-05-20',
  age: 11,
  bloodType: 'O+',
  verificationStatus: 'Verified',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('Adversarial Challenger Deep Stress Test Harness (Milestone MC Iteration 2)', () => {
  // =========================================================================
  // SECTION 1: Deep Link Dentition Auto-Switching & Boundaries
  // =========================================================================
  describe('1. Dentition Auto-Switching & Boundary Fuzzing', () => {
    test('All 20 primary child teeth (51-55, 61-65, 71-75, 81-85) auto-switch to Child dentition', () => {
      const patient = createTestPatient();
      const childTeeth = [
        51, 52, 53, 54, 55,
        61, 62, 63, 64, 65,
        71, 72, 73, 74, 75,
        81, 82, 83, 84, 85,
      ];

      for (const toothNum of childTeeth) {
        const html = renderToStaticMarkup(
          React.createElement(DentalChartTab, {
            patient,
            chart: { patientId: patient.id },
            focusToothNumber: toothNum,
          })
        );
        // Must contain child quadrants Q5..Q8
        expect(html).toContain('Q5 • Upper Right');
        expect(html).toContain('Q6 • Upper Left');
        expect(html).toContain('Q7 • Lower Left');
        expect(html).toContain('Q8 • Lower Right');
        expect(html).toContain(`data-testid="tooth-cell-${toothNum}"`);
        expect(html).toContain(`Tooth #${toothNum}`);
      }
    });

    test('All 32 permanent adult teeth (11-18, 21-28, 31-38, 41-48) remain in Adult dentition', () => {
      const patient = createTestPatient();
      const adultTeeth = [
        11, 12, 13, 14, 15, 16, 17, 18,
        21, 22, 23, 24, 25, 26, 27, 28,
        31, 32, 33, 34, 35, 36, 37, 38,
        41, 42, 43, 44, 45, 46, 47, 48,
      ];

      for (const toothNum of adultTeeth) {
        const html = renderToStaticMarkup(
          React.createElement(DentalChartTab, {
            patient,
            chart: { patientId: patient.id },
            focusToothNumber: toothNum,
          })
        );
        // Must contain adult quadrants Q1..Q4
        expect(html).toContain('Q1 • Upper Right');
        expect(html).toContain('Q2 • Upper Left');
        expect(html).toContain('Q3 • Lower Left');
        expect(html).toContain('Q4 • Lower Right');
        expect(html).toContain(`data-testid="tooth-cell-${toothNum}"`);
        expect(html).toContain(`Tooth #${toothNum}`);
      }
    });

    test('Deep link with non-existent / boundary teeth (99, 100, 50, 86, -1, 0) does not throw and renders gracefully', () => {
      const patient = createTestPatient();
      const edgeTeeth = [99, 100, 50, 86, -1, 0, 999];

      for (const toothNum of edgeTeeth) {
        let html = '';
        expect(() => {
          html = renderToStaticMarkup(
            React.createElement(DentalChartTab, {
              patient,
              chart: { patientId: patient.id },
              focusToothNumber: toothNum,
            })
          );
        }).not.toThrow();

        expect(html.length).toBeGreaterThan(0);
        expect(html).toContain('Odontogram Visualizer');
        if (toothNum !== 0) {
          // In JavaScript, any non-zero number (positive or negative) is truthy, so Inspector renders fallback tooth
          expect(html).toContain(`Tooth #${toothNum}`);
        } else {
          // toothNum === 0 is falsy, inspector shows empty state
          expect(html).toContain('Select a Tooth');
        }
      }
    });
  });

  // =========================================================================
  // SECTION 2: Historical Procedure Deduplication Stress Testing
  // =========================================================================
  describe('2. Historical Procedure Deduplication Stress Testing', () => {
    test('100 duplicate procedure entries across both arrays are deduplicated to exactly 1 entry without performance degradation', () => {
      const patient = createTestPatient();
      const baseProc: ClinicalProcedureRecord = {
        id: 'proc-mass-dup-01',
        patientId: patient.id,
        procedureCode: 'D2140',
        procedureName: 'Amalgam - One Surface, Primary or Permanent',
        scheduledAt: '2026-02-14T08:00:00Z',
        performedAt: '2026-02-14T08:30:00Z',
        status: 'Completed',
        toothNumber: 15,
        toothSurface: 'O',
      };

      const dentalProcedures = Array(50).fill(baseProc);
      const proceduresHistory = Array(50).fill(baseProc);

      const t0 = performance.now();
      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          patient,
          chart: {
            patientId: patient.id,
            dentalProcedures,
            proceduresHistory,
          },
          focusToothNumber: 15,
        })
      );
      const t1 = performance.now();

      expect(t1 - t0).toBeLessThan(200); // Must be fast
      expect(html).toContain('PROCEDURE HISTORY FOR TOOTH #15 (1)');
      expect(html).toContain('Amalgam - One Surface, Primary or Permanent');
    });

    test('Procedures without ID: identical timestamps and name deduplicate, but different timestamps or names do NOT deduplicate', () => {
      const patient = createTestPatient();

      const procA1: ClinicalProcedureRecord = {
        procedureName: 'Fluoride Application',
        scheduledAt: '2026-01-10T10:00:00Z',
        performedAt: '2026-01-10T10:15:00Z',
        toothNumber: 21,
      };
      const procA2: ClinicalProcedureRecord = {
        procedureName: 'Fluoride Application',
        scheduledAt: '2026-01-10T10:00:00Z',
        performedAt: '2026-01-10T10:15:00Z',
        toothNumber: 21,
      };

      // Different timestamps (separate visit)
      const procB: ClinicalProcedureRecord = {
        procedureName: 'Fluoride Application',
        scheduledAt: '2026-04-10T10:00:00Z',
        performedAt: '2026-04-10T10:15:00Z',
        toothNumber: 21,
      };

      // Different procedure name
      const procC: ClinicalProcedureRecord = {
        procedureName: 'Composite Polish',
        scheduledAt: '2026-01-10T10:00:00Z',
        performedAt: '2026-01-10T10:15:00Z',
        toothNumber: 21,
      };

      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          patient,
          chart: {
            patientId: patient.id,
            dentalProcedures: [procA1, procA2, procB, procC],
          },
          focusToothNumber: 21,
        })
      );

      // Total distinct procedures on tooth 21 should be 3 (procA deduplicated to 1, procB, procC)
      expect(html).toContain('PROCEDURE HISTORY FOR TOOTH #21 (3)');
      expect(html).toContain('Fluoride Application');
      expect(html).toContain('Composite Polish');
    });
  });

  // =========================================================================
  // SECTION 3: Settings Specialty Mode State Transitions
  // =========================================================================
  describe('3. Settings Specialty Mode State Machine Transitions', () => {
    test('Full transition cycle: Medical -> Dental -> Multi-Specialty -> Medical', () => {
      let currentSpecialty: ClinicSpecialtyMode = 'Medical';
      let currentDentalEnabled = false;

      const setSpecialtyMode = (mode: ClinicSpecialtyMode) => {
        currentSpecialty = mode;
      };
      const setEnableDentalModule = (val: boolean) => {
        currentDentalEnabled = val;
      };

      // 1. Initial Medical Mode
      const html1 = renderToStaticMarkup(
        React.createElement(GeneralSettingsTab, {
          clinicName: 'Test Clinic',
          setClinicName: () => {},
          accreditationNumber: 'ACC-01',
          setAccreditationNumber: () => {},
          operatingHours: '8-5',
          setOperatingHours: () => {},
          slotDuration: '30',
          setSlotDuration: () => {},
          consultationFee: '500',
          setConsultationFee: () => {},
          letterheadHeader: 'H',
          setLetterheadHeader: () => {},
          letterheadAddress: 'A',
          setLetterheadAddress: () => {},
          letterheadContact: 'C',
          setLetterheadContact: () => {},
          savingSettings: false,
          onSavePreferences: async () => {},
          showSkeletons: false,
          settingsLoadError: null,
          specialtyMode: 'Medical',
          setSpecialtyMode,
          enableDentalModule: false,
          setEnableDentalModule,
          settings: { specialtyMode: 'Medical', enableDentalModule: false } as any,
          eodReport: null,
          eodLoadError: null,
          onRefreshEod: async () => {},
          formatPeso: (v) => `₱${v}`,
        })
      );
      expect(html1).toContain('Medical Practice');
      expect(html1).toContain('Inactive in Medical Mode');

      // 2. Transition to Dental Mode
      const html2 = renderToStaticMarkup(
        React.createElement(GeneralSettingsTab, {
          clinicName: 'Test Clinic',
          setClinicName: () => {},
          accreditationNumber: 'ACC-01',
          setAccreditationNumber: () => {},
          operatingHours: '8-5',
          setOperatingHours: () => {},
          slotDuration: '30',
          setSlotDuration: () => {},
          consultationFee: '500',
          setConsultationFee: () => {},
          letterheadHeader: 'H',
          setLetterheadHeader: () => {},
          letterheadAddress: 'A',
          setLetterheadAddress: () => {},
          letterheadContact: 'C',
          setLetterheadContact: () => {},
          savingSettings: false,
          onSavePreferences: async () => {},
          showSkeletons: false,
          settingsLoadError: null,
          specialtyMode: 'Dental',
          setSpecialtyMode,
          enableDentalModule: true,
          setEnableDentalModule,
          settings: { specialtyMode: 'Dental', enableDentalModule: true } as any,
          eodReport: null,
          eodLoadError: null,
          onRefreshEod: async () => {},
          formatPeso: (v) => `₱${v}`,
        })
      );
      expect(html2).toContain('Dental Practice');
      expect(html2).toContain('Permanently Active (Dental Practice)');

      // 3. Transition to Multi-Specialty Mode
      const html3 = renderToStaticMarkup(
        React.createElement(GeneralSettingsTab, {
          clinicName: 'Test Clinic',
          setClinicName: () => {},
          accreditationNumber: 'ACC-01',
          setAccreditationNumber: () => {},
          operatingHours: '8-5',
          setOperatingHours: () => {},
          slotDuration: '30',
          setSlotDuration: () => {},
          consultationFee: '500',
          setConsultationFee: () => {},
          letterheadHeader: 'H',
          setLetterheadHeader: () => {},
          letterheadAddress: 'A',
          setLetterheadAddress: () => {},
          letterheadContact: 'C',
          setLetterheadContact: () => {},
          savingSettings: false,
          onSavePreferences: async () => {},
          showSkeletons: false,
          settingsLoadError: null,
          specialtyMode: 'Multi-Specialty',
          setSpecialtyMode,
          enableDentalModule: true,
          setEnableDentalModule,
          settings: { specialtyMode: 'Multi-Specialty', enableDentalModule: true } as any,
          eodReport: null,
          eodLoadError: null,
          onRefreshEod: async () => {},
          formatPeso: (v) => `₱${v}`,
        })
      );
      expect(html3).toContain('Multi-Specialty Clinic');
      expect(html3).toContain('Active');

      // 4. Transition back to Medical Mode
      const html4 = renderToStaticMarkup(
        React.createElement(GeneralSettingsTab, {
          clinicName: 'Test Clinic',
          setClinicName: () => {},
          accreditationNumber: 'ACC-01',
          setAccreditationNumber: () => {},
          operatingHours: '8-5',
          setOperatingHours: () => {},
          slotDuration: '30',
          setSlotDuration: () => {},
          consultationFee: '500',
          setConsultationFee: () => {},
          letterheadHeader: 'H',
          setLetterheadHeader: () => {},
          letterheadAddress: 'A',
          setLetterheadAddress: () => {},
          letterheadContact: 'C',
          setLetterheadContact: () => {},
          savingSettings: false,
          onSavePreferences: async () => {},
          showSkeletons: false,
          settingsLoadError: null,
          specialtyMode: 'Medical',
          setSpecialtyMode,
          enableDentalModule: false,
          setEnableDentalModule,
          settings: { specialtyMode: 'Medical', enableDentalModule: false } as any,
          eodReport: null,
          eodLoadError: null,
          onRefreshEod: async () => {},
          formatPeso: (v) => `₱${v}`,
        })
      );
      expect(html4).toContain('Medical Practice');
      expect(html4).toContain('Inactive in Medical Mode');
    });
  });

  // =========================================================================
  // SECTION 4: Layout Mode Stress Testing (Modal, Split, Drawer)
  // =========================================================================
  describe('4. Layout Mode Stress Testing Across All Layout Configurations', () => {
    const patient = createTestPatient();
    const chart: PatientChart = {
      patientId: patient.id,
      dentalTeeth: [
        {
          id: 'dt-adv-55',
          toothNumber: 55,
          status: 'Decay',
          surface: 'MOD',
          notes: 'Deep decay on primary molar',
        },
      ],
      dentalProcedures: [
        {
          id: 'proc-adv-55',
          procedureName: 'Pulpotomy - Primary Tooth',
          toothNumber: 55,
          status: 'Completed',
        },
      ],
    };

    const layouts: ('modal' | 'split' | 'drawer')[] = ['modal', 'split', 'drawer'];

    for (const layout of layouts) {
      test(`Layout "${layout}" renders Dental tab seamlessly with child tooth deep link (focusToothNumber=55)`, () => {
        const html = renderToStaticMarkup(
          React.createElement(PatientChartModal, {
            visible: true,
            patient,
            patientChart: chart,
            preferredLayout: layout,
            activeTab: 'dental',
            focusToothNumber: 55,
            onClose: () => {},
          })
        );

        expect(html).toContain('Dental Chart');
        expect(html).toContain('Odontogram Visualizer');
        expect(html).toContain('Tooth #55');
        expect(html).toContain('Upper Right Primary Second Molar');
        expect(html).toContain('Decay');
        expect(html).toContain('MOD');
        expect(html).toContain('Pulpotomy - Primary Tooth');

        if (layout === 'split') {
          expect(html).toContain('aria-label="Clinical Workstation for Juan Batumbakal"');
        } else if (layout === 'drawer') {
          expect(html).toContain('aria-label="Medical Chart Drawer for Juan Batumbakal"');
        } else {
          expect(html).toContain('aria-label="Medical Chart for Juan Batumbakal"');
        }
      });
    }

    test('PatientChartModal with focusToothNumber auto-includes dental in availableTabs even when enableDentalModule is not explicitly passed in settings', () => {
      const html = renderToStaticMarkup(
        React.createElement(PatientChartModal, {
          visible: true,
          patient,
          patientChart: { patientId: patient.id },
          focusToothNumber: 36,
          onClose: () => {},
        })
      );

      expect(html).toContain('Dental Chart');
      expect(html).toContain('Tooth #36');
      expect(html).toContain('Lower Left First Molar');
    });
  });
});
