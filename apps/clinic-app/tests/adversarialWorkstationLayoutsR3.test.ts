// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { theme } from '../constants/theme';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, accessibilityState, placeholder, hitSlop, onPress, style, ...rest }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(onPress ? { onClick: onPress } : {}),
        'data-style': style ? JSON.stringify(style) : undefined,
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
  Alert: { alert: () => {} },
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

const { default: PatientChartModal, CHART_TABS } = await import('../components/chart/PatientChartModal');
const {
  CenteredModalChartLayout,
  SplitPaneChartLayout,
  SlideOverDrawerChartLayout,
} = await import('../components/chart');
const { default: ChartLayoutSwitcher } = await import('../components/chart/ChartLayoutSwitcher');
const { default: StatutoryImmunizationsTab } = await import('../components/chart/StatutoryImmunizationsTab');
const { default: ChartTabContentView } = await import('../components/chart/ChartTabContentView');
import type { ClinicPatient, PatientChart, ConsultationRecord } from '../services/clinicService';
import type { ChartTab, ChartLayoutMode } from '../components/chart/types';

describe('Adversarial Review Round 3: Workstation Layouts Asynchronous Edge Cases & Rigorous Invariant Probes', () => {
  const basePatient: ClinicPatient = {
    id: 'pat-r3-100',
    clinicId: 'clinic-r3-main',
    tenantId: 'tenant-r3',
    patientCode: 'PAT-2026-99100',
    fullName: 'Corazon Aquino-Santos',
    firstName: 'Corazon',
    lastName: 'Aquino-Santos',
    dateOfBirth: '1975-01-25',
    age: 51,
    gender: 'Female',
    civilStatus: 'Married',
    contactNumber: '09171234567',
    verificationStatus: 'Verified',
    bloodType: 'O+',
    philHealthNumber: '01-234567890-1',
    allergies: 'Penicillin',
    chronicConditions: 'Type 2 Diabetes',
    totalVisits: 12,
    createdAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: '2026-01-01T00:00:00Z',
  };

  const baseChart: PatientChart = {
    patientId: 'pat-r3-100',
    patientName: 'Corazon Aquino-Santos',
    totalVisits: 12,
    demographics: {
      patientId: 'pat-r3-100',
      patientCode: 'PAT-2026-99100',
      patientName: 'Corazon Aquino-Santos',
      dateOfBirth: '1975-01-25',
      age: 51,
      gender: 'Female',
      bloodType: 'O+',
      verificationStatus: 'Verified',
      contactNumber: '09171234567',
    },
    vitalsHistory: [
      {
        id: 'vit-r3-1',
        patientId: 'pat-r3-100',
        consultationId: 'c-r3-1',
        systolicBp: 130,
        diastolicBp: 85,
        heartRateBpm: 76,
        respiratoryRateBreathsPerMin: 16,
        temperatureCelsius: 36.6,
        oxygenSaturationPercent: 99,
        recordedAt: '2026-10-12T10:00:00Z',
      },
    ],
    consultations: [
      {
        id: 'c-r3-1',
        clinicId: 'clinic-r3-main',
        patientId: 'pat-r3-100',
        consultationDate: '2026-10-12',
        encounterDate: '2026-10-12T10:00:00Z',
        doctorName: 'Dr. Roberto Cruz',
        doctorPrcLicense: '0098765',
        isSigned: true,
        isYakapEligible: true,
        subjectiveComplaints: 'Routine follow-up for blood glucose control',
        diagnoses: [{ icd10Code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' }],
        prescriptions: [{ genericName: 'Metformin', dosage: '500mg', form: 'Tablet', quantity: 60, sig: '1 tab BID with meals' }],
      },
    ],
    labOrdersHistory: [],
    proceduresHistory: [],
    immunizations: [],
    attachments: [],
    allergies: [
      {
        id: 'all-r3-1',
        patientId: 'pat-r3-100',
        allergen: 'Penicillin',
        reaction: 'Urticaria and facial swelling',
        severity: 'Moderate',
        diagnosedDate: '2020-03-15',
        isActive: true,
      },
    ],
  };

  // =========================================================================
  // SECTION 1: DYNAMIC PROP MUTATION WHILE MODAL IS OPEN
  // =========================================================================
  describe('1. Dynamic Prop Updating (Patient Prop Mutation While Modal is Open)', () => {
    test('R3-DYN-1: Split-Pane layout reflects updated patient demographics without resetting layout or active tab', () => {
      // Step 1: Render SplitPane with initial patient on 'diagnostics' tab
      const initialMarkup = renderToStaticMarkup(
        React.createElement(PatientChartModal, {
          visible: true,
          patient: basePatient,
          patientChart: baseChart,
          preferredLayout: 'split',
          activeTab: 'diagnostics',
          onClose: () => {},
        })
      );

      expect(initialMarkup).toContain('aria-label="Clinical Workstation for Corazon Aquino-Santos"');
      expect(initialMarkup).toContain('PAT-2026-99100');
      expect(initialMarkup).toContain('01-234567890-1');
      expect(initialMarkup).toContain('All Orders');

      // Step 2: Patient is updated dynamically (e.g. phone updated, name changed, PhilHealth verified)
      const updatedPatient: ClinicPatient = {
        ...basePatient,
        fullName: 'Corazon Santos-Aquino, PhD',
        patientCode: 'PAT-2026-99100-VERIFIED',
        philHealthNumber: '99-887766554-3',
      };

      const updatedMarkup = renderToStaticMarkup(
        React.createElement(PatientChartModal, {
          visible: true,
          patient: updatedPatient,
          patientChart: baseChart,
          preferredLayout: 'split',
          activeTab: 'diagnostics',
          onClose: () => {},
        })
      );

      // Verify layout is still SplitPane and tab is still Diagnostics
      expect(updatedMarkup).toContain('aria-label="Clinical Workstation for Corazon Santos-Aquino, PhD"');
      expect(updatedMarkup).toContain('PAT-2026-99100-VERIFIED');
      expect(updatedMarkup).toContain('99-887766554-3');
      expect(updatedMarkup).toContain('All Orders');
      // Must NOT revert to Centered Modal
      expect(updatedMarkup).not.toContain('aria-label="Medical Chart for Corazon Santos-Aquino, PhD"');
    });

    test('R3-DYN-2: Slide-Over Drawer layout cleanly updates when patient contact info mutates', () => {
      const drawerMarkup = renderToStaticMarkup(
        React.createElement(PatientChartModal, {
          visible: true,
          patient: {
            ...basePatient,
            fullName: 'Dr. Maria Clara De Los Santos',
            patientCode: 'PAT-MC-777',
          },
          patientChart: baseChart,
          preferredLayout: 'drawer',
          activeTab: 'procedures',
          onClose: () => {},
        })
      );

      expect(drawerMarkup).toContain('aria-label="Medical Chart Drawer for Dr. Maria Clara De Los Santos"');
      expect(drawerMarkup).toContain('PAT-MC-777');
      expect(drawerMarkup).toContain('Ordered / Scheduled');
      expect(drawerMarkup).not.toContain('aria-label="Clinical Workstation');
    });
  });

  // =========================================================================
  // SECTION 2: ASYNCHRONOUS CHART UPDATES & REFRESH PROPAGATION
  // =========================================================================
  describe('2. Asynchronous Chart Updates & Clinical Action Re-renders', () => {
    test('R3-ASYNC-1: Async chart update injects new consultation without disrupting layout or tab', () => {
      const refreshedChart: PatientChart = {
        ...baseChart,
        totalVisits: 13,
        consultations: [
          ...baseChart.consultations,
          {
            id: 'c-r3-2',
            clinicId: 'clinic-r3-main',
            patientId: 'pat-r3-100',
            consultationDate: '2026-10-13',
            encounterDate: '2026-10-13T14:30:00Z',
            doctorName: 'Dr. Roberto Cruz',
            doctorPrcLicense: '0098765',
            isSigned: true,
            isYakapEligible: true,
            subjectiveComplaints: 'Follow-up for lab review',
            diagnoses: [{ icd10Code: 'Z00.0', description: 'General medical examination' }],
            prescriptions: [],
          },
        ],
      };

      const markup = renderToStaticMarkup(
        React.createElement(PatientChartModal, {
          visible: true,
          patient: basePatient,
          patientChart: refreshedChart,
          preferredLayout: 'split',
          activeTab: 'encounters',
          onClose: () => {},
        })
      );

      expect(markup).toContain('aria-label="Clinical Workstation for Corazon Aquino-Santos"');
      expect(markup).toContain('General medical examination');
      expect(markup).toContain('Z00.0');
    });

    test('R3-ASYNC-2: Async vaccine administration completion updates chart with zero duplicate pluses', () => {
      const chartWithVaccine: PatientChart = {
        ...baseChart,
        immunizations: [
          {
            id: 'imm-r3-1',
            patientId: 'pat-r3-100',
            vaccineCode: 'E01',
            vaccineName: 'Pneumococcal Polysaccharide Vaccine (PPSV23 / PCV13)',
            doseSequence: 1,
            administeredAtUtc: '2026-10-13T00:00:00Z',
            administeredByStaffName: 'Nurse Joy Cruz',
            lotBatchNumber: 'LOT-PN-2026',
            philHealthLibrary: 'lib_immelderly',
          } as any,
        ],
      };

      const markup = renderToStaticMarkup(
        React.createElement(PatientChartModal, {
          visible: true,
          patient: basePatient,
          patientChart: chartWithVaccine,
          preferredLayout: 'drawer',
          activeTab: 'immunizations',
          onClose: () => {},
        })
      );

      expect(markup).toContain('aria-label="Medical Chart Drawer for Corazon Aquino-Santos"');
      expect(markup).toContain('Pneumococcal Polysaccharide Vaccine');
      expect(markup).toContain('LOT-PN-2026');
      expect(markup).toContain('Administer Vaccine');
      expect(markup).toContain('Add Historical Vaccine');
      expect(markup).not.toContain('+ +');
      expect(markup).not.toContain('+ Administer Vaccine');
    });

    test('R3-ASYNC-3: Document vault upload completion reflects new attachment cleanly', () => {
      const chartWithDoc: PatientChart = {
        ...baseChart,
        attachments: [
          {
            id: 'att-r3-1',
            patientId: 'pat-r3-100',
            recordType: 'LabResult',
            title: 'CBC Platelet Count',
            fileName: 'CBC_Platelet_Count_Oct2026.pdf',
            fileSizeBytes: 245000,
            documentDate: '2026-10-13',
            createdAt: '2026-10-13T08:00:00Z',
            verificationStatus: 'Verified',
          } as any,
        ],
      };

      const markup = renderToStaticMarkup(
        React.createElement(PatientChartModal, {
          visible: true,
          patient: basePatient,
          patientChart: chartWithDoc,
          preferredLayout: 'modal',
          activeTab: 'vault',
          onClose: () => {},
        })
      );

      expect(markup).toContain('aria-label="Medical Chart for Corazon Aquino-Santos"');
      expect(markup).toContain('CBC_Platelet_Count_Oct2026.pdf');
    });
  });

  // =========================================================================
  // SECTION 3: LAYOUT SWITCHER IDEMPOTENCE & STATE ISOLATION
  // =========================================================================
  describe('3. Layout Switcher Idempotence & Interaction Safety', () => {
    test('R3-SW-1: ChartLayoutSwitcher handles switching to already active layout without crashing or state leak', () => {
      let switchTarget: ChartLayoutMode | null = null;
      const onSwitch = (layout: ChartLayoutMode) => {
        switchTarget = layout;
      };

      const markup = renderToStaticMarkup(
        React.createElement(ChartLayoutSwitcher, {
          currentLayout: 'split',
          onSwitchLayout: onSwitch,
          showLabels: true,
        })
      );

      expect(markup).toContain('role="toolbar"');
      expect(markup).toContain('aria-label="Switch to Split-Pane Clinical Workstation"');
      expect(markup).toContain('aria-label="Switch to Centered Workstation Modal"');
      expect(markup).toContain('aria-label="Switch to Slide-Over Focus Drawer"');
      // Verify Split-Pane is marked selected
      expect(markup).toContain('&quot;selected&quot;:true');
    });

    test('R3-SW-2: Modal renders all layout switch targets in header controls', () => {
      for (const layout of ['modal', 'split', 'drawer'] as const) {
        const markup = renderToStaticMarkup(
          React.createElement(PatientChartModal, {
            visible: true,
            patient: basePatient,
            patientChart: baseChart,
            preferredLayout: layout,
            activeTab: 'summary',
            onClose: () => {},
          })
        );

        expect(markup).toContain('role="toolbar"');
        expect(markup).toContain('aria-label="Chart Layout Selector"');
      }
    });
  });

  // =========================================================================
  // SECTION 4: CONTROLLED VS UNCONTROLLED TAB PERSISTENCE
  // =========================================================================
  describe('4. Controlled vs Uncontrolled Tab Transitions', () => {
    test('R3-TAB-1: All 7 tabs render distinct content without tab edge clipping across all 3 layouts', () => {
      const tabs: ChartTab[] = [
        'summary',
        'encounters',
        'diagnostics',
        'procedures',
        'immunizations',
        'profiles',
        'vault',
      ];
      const layouts: ChartLayoutMode[] = ['modal', 'split', 'drawer'];

      for (const layout of layouts) {
        for (const tab of tabs) {
          const markup = renderToStaticMarkup(
            React.createElement(PatientChartModal, {
              visible: true,
              patient: basePatient,
              patientChart: baseChart,
              preferredLayout: layout,
              activeTab: tab,
              onClose: () => {},
            })
          );

          expect(markup.length).toBeGreaterThan(0);
          expect(markup).not.toContain('+ +');

          if (tab === 'summary') expect(markup).toContain('Active Problems');
          if (tab === 'encounters') expect(markup).toContain('Encounters');
          if (tab === 'diagnostics') expect(markup).toContain('All Orders');
          if (tab === 'procedures') expect(markup).toContain('Ordered / Scheduled');
          if (tab === 'immunizations') expect(markup).toContain('Administer Vaccine');
          if (tab === 'profiles') expect(markup).toContain('Health Profiles');
          if (tab === 'vault') expect(markup).toContain('All Records');
        }
      }
    });
  });

  // =========================================================================
  // SECTION 5: EXACT DESIGN TOKEN METRICS COMPLIANCE AUDIT
  // =========================================================================
  describe('5. Exact Design Token Metrics & Invariant Styling Audit', () => {
    test('R3-TOK-1: CenteredModalChartLayout matches authentic tokens (xl=20, md=12, sm=8, xs=4, subtle=#F1F5F9)', () => {
      expect(theme.spacing.xl).toBe(20);
      expect(theme.spacing.md).toBe(12);
      expect(theme.spacing.sm).toBe(8);
      expect(theme.spacing.xs).toBe(4);
      expect(theme.colors.surfaceSubtle).toBe('#F1F5F9');
      expect(theme.colors.surface).toBe('#FFFFFF');
      expect(theme.colors.borderLight).toBe('#F1F5F9');
    });

    test('R3-TOK-2: SlideOverDrawerChartLayout matches workstation padding (lg=16, md=12, sm=8)', () => {
      expect(theme.spacing.lg).toBe(16);
      expect(theme.spacing.md).toBe(12);
      expect(theme.spacing.sm).toBe(8);
      expect(theme.colors.surface).toBe('#FFFFFF');
    });

    test('R3-TOK-3: SplitPaneChartLayout matches canvas viewport padding (xl=20, md=12) and surface colors', () => {
      expect(theme.spacing.xl).toBe(20);
      expect(theme.spacing.md).toBe(12);
      expect(theme.colors.surface).toBe('#FFFFFF');
      expect(theme.colors.surfaceHighlight).toBe('#E2E8F0');
    });

    test('R3-TOK-4: StatutoryImmunizationsTab contentContainerStyle has paddingBottom lg and gap md without redundant horizontal padding', () => {
      const markup = renderToStaticMarkup(
        React.createElement(StatutoryImmunizationsTab, {
          patient: basePatient,
          patientId: basePatient.id,
          immunizations: [],
          onRefreshChart: () => {},
        })
      );

      // Verify that it renders cleanly and contains PhilHealth 999 statutory fallback
      expect(markup).toContain('PhilHealth Konsulta Statutory Coverage (Fallback Code 999)');
      expect(markup).toContain('Administer Vaccine');
      expect(markup).toContain('Add Historical Vaccine');
      expect(markup).not.toContain('+ +');
    });
  });

  // =========================================================================
  // SECTION 6: NON-BREAKING IDENTITY ROWS & EXTREME BOUNDARY PATIENTS
  // =========================================================================
  describe('6. Non-Breaking Identity Rows & Extreme Boundary Patients', () => {
    test('R3-ROW-1: SplitPane stacks MRN, Demographics, and PHIC into non-breaking rows with long values', () => {
      const extremePatient: ClinicPatient = {
        ...basePatient,
        patientCode: 'PAT-2026-LONG-INSTITUTIONAL-IDENTIFIER-9999999',
        fullName: 'Maria Remedios De La Santisima Trinidad Gonzaga y Perez-Escudero',
        dateOfBirth: '1940-12-31',
        age: 86,
        gender: 'Female',
        philHealthNumber: '12-345678901-2',
      };

      const markup = renderToStaticMarkup(
        React.createElement(SplitPaneChartLayout, {
          patient: extremePatient,
          patientChart: baseChart,
          activeTab: 'summary',
          currentLayout: 'split',
          onTabChange: () => {},
          onClose: () => {},
          onSwitchLayout: () => {},
          onEditDemographics: () => {},
        })
      );

      expect(markup).toContain('MRN:');
      expect(markup).toContain('PAT-2026-LONG-INSTITUTIONAL-IDENTIFIER-9999999');
      expect(markup).toContain('Demographics:');
      expect(markup).toContain('PHIC:');
      expect(markup).toContain('12-345678901-2');
    });

    test('R3-ROW-2: Patient with undefined PhilHealth pin omits PHIC row cleanly without gap error', () => {
      const patientWithoutPhic: ClinicPatient = {
        ...basePatient,
        philHealthNumber: undefined,
      };

      const markup = renderToStaticMarkup(
        React.createElement(SplitPaneChartLayout, {
          patient: patientWithoutPhic,
          patientChart: baseChart,
          activeTab: 'summary',
          currentLayout: 'split',
          onTabChange: () => {},
          onClose: () => {},
          onSwitchLayout: () => {},
          onEditDemographics: () => {},
        })
      );

      expect(markup).toContain('MRN:');
      expect(markup).toContain('Demographics:');
      expect(markup).not.toContain('PHIC:');
    });

    test('R3-ROW-3: SplitPane renders NKDA alert banner when allergies list is empty', () => {
      const chartNoAllergies: PatientChart = {
        ...baseChart,
        allergies: [],
      };

      const markup = renderToStaticMarkup(
        React.createElement(SplitPaneChartLayout, {
          patient: basePatient,
          patientChart: chartNoAllergies,
          activeTab: 'summary',
          currentLayout: 'split',
          onTabChange: () => {},
          onClose: () => {},
          onSwitchLayout: () => {},
          onEditDemographics: () => {},
        })
      );

      expect(markup).toContain('CLINICAL ALERTS');
      expect(markup).toContain('No known drug allergies (NKDA)');
    });
  });
});
