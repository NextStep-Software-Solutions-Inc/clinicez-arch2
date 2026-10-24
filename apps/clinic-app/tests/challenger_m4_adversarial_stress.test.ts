// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID, ...props }: any) =>
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
  Dimensions: {
    get: () => ({ width: 1440, height: 900 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1440, height: 900 }),
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
    },
    timing: () => ({ start: (cb?: any) => cb?.() }),
    spring: () => ({ start: (cb?: any) => cb?.() }),
    sequence: () => ({ start: (cb?: any) => cb?.() }),
    parallel: () => ({ start: (cb?: any) => cb?.() }),
    decay: () => ({ start: (cb?: any) => cb?.() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  NativeEventEmitter: class {
    addListener() { return { remove: () => {} }; }
    removeAllListeners() {}
  },
  Alert: { alert: () => {} },
  PixelRatio: {
    get: () => 1,
    getFontScale: () => 1,
    getPixelSizeForLayoutSize: (size: number) => size,
    roundToNearestPixel: (size: number) => size,
  },
  I18nManager: { isRTL: false, allowRTL: () => {}, forceRTL: () => {} },
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  Polygon: 'Polygon',
  G: 'G',
  default: 'Svg',
  Polyline: 'Polyline',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  Text: ({ children }: any) => children,
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: () => {},
    goBack: () => {},
    setOptions: () => {},
    addListener: () => () => {},
  }),
  useRoute: () => ({ params: {} }),
  useIsFocused: () => true,
}));

const defaultMockClinicContext = {
  facilityName: 'ClinicEZ Test Center',
  accreditationNumber: 'ACC-12345',
  taxIdentificationNumber: '123-456-789',
  planTier: 'Enterprise',
  preferredChartLayout: 'modal',
  settings: {
    enableDentalModule: true,
    specialtyMode: 'Dental',
  },
  rooms: [
    { id: 'room-1', name: 'Dental Chair 1', type: 'Treatment', isActive: true },
    { id: 'room-2', name: 'Dental Chair 2', type: 'Treatment', isActive: true },
  ],
};

mock.module('../context/StaffContext', () => ({
  useStaff: () =>
    (globalThis as any).__mockStaffContext ?? {
      current: { id: 'staff-1', name: 'Dr. Jane Dela Cruz', role: 'Doctor' },
      staff: [],
      reload: () => {},
    },
  formatStaffName: (s: any) => s?.name || [s?.title, s?.firstName, s?.lastName].filter(Boolean).join(' ').trim() || 'Staff',
  staffInitials: (s: any) => `${s?.firstName?.[0] ?? ''}${s?.lastName?.[0] ?? ''}`.toUpperCase() || '?',
  StaffProvider: ({ children }: any) => children,
}));

const { default: CenteredModalChartLayout } = await import('../components/chart/layouts/CenteredModalChartLayout');
const { default: SlideOverDrawerChartLayout } = await import('../components/chart/layouts/SlideOverDrawerChartLayout');
const { default: SplitPaneChartLayout } = await import('../components/chart/layouts/SplitPaneChartLayout');
const { default: EncountersTimelineTab } = await import('../components/chart/EncountersTimelineTab');
const { getAvailableChartTabs, CHART_TABS, DENTAL_CHART_TAB } = await import('../components/chart/types');
import type { ClinicPatient, PatientChart, ConsultationRecord } from '../services/clinicService';

const mockPatient: ClinicPatient = {
  id: 'pat-adv-1',
  clinicId: 'clinic-1',
  patientCode: 'PAT-ADV-001',
  fullName: 'Adversarial Test Patient',
  gender: 'Female',
  dateOfBirth: '1995-05-15',
  isVerified: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockChart: PatientChart = {
  patientId: 'pat-adv-1',
  patientName: 'Adversarial Test Patient',
  totalVisits: 1,
  allergies: [],
  vitalsHistory: [],
  consultations: [],
  dentalTeeth: [],
};

describe('Adversarial Reviewer Stress Suite — Milestone 4 (Layout & Dental Sync)', () => {
  beforeEach(() => {
    (globalThis as any).__mockClinicContext = defaultMockClinicContext;
  });

  afterAll(() => {
    delete (globalThis as any).__mockClinicContext;
  });
  // =========================================================================
  // Dimension 1: Encounters Timeline Dental Findings Boundary Stress
  // =========================================================================
  describe('Dimension 1: Encounters Timeline Dental Findings Boundary Stress', () => {
    test('1.1 Renders dental summary when encounter only has procedures tagged with toothNumber and no dentalFindings', () => {
      const encounterOnlyProcedures: ConsultationRecord = {
        id: 'enc-proc-only',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        patientId: 'pat-adv-1',
        patientName: 'Adversarial Test Patient',
        doctorId: 'doc-1',
        doctorName: 'Dr. Test Dentist',
        encounterDate: '2026-10-20T08:00:00Z',
        subjective: 'Follow up',
        objective: 'Post-op inspection',
        assessment: 'Healing well',
        plan: 'Fluoride application',
        isSigned: true,
        diagnoses: [],
        prescriptions: [],
      };
      (encounterOnlyProcedures as any).dentalFindings = undefined;
      (encounterOnlyProcedures as any).procedures = [
        {
          id: 'proc-tooth-only',
          toothNumber: 21,
          toothSurface: 'B',
          procedureName: 'Direct Composite Veneer',
          status: 'Completed',
        },
        {
          id: 'proc-general-non-tooth',
          toothNumber: null,
          procedureName: 'Vital Signs Monitoring',
          status: 'Completed',
        },
      ];

      const markup = renderToStaticMarkup(
        React.createElement(EncountersTimelineTab, {
          patient: mockPatient,
          patientId: mockPatient.id,
          consultations: [encounterOnlyProcedures],
        })
      );

      expect(markup).toContain('DENTAL FINDINGS &amp; PROCEDURES');
      expect(markup).toContain('Tooth #21 (B)');
      expect(markup).toContain('Direct Composite Veneer');
      // Non-tooth procedure must NOT be in dental summary
      expect(markup).not.toContain('Vital Signs Monitoring');
    });

    test('1.2 Renders dental findings with missing surfaces, missing notes, and doctor title normalization', () => {
      const encounterVariedFindings: ConsultationRecord = {
        id: 'enc-varied-findings',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        patientId: 'pat-adv-1',
        patientName: 'Adversarial Test Patient',
        doctorId: 'doc-1',
        doctorName: 'Dr. Test Dentist',
        encounterDate: '2026-10-20T08:00:00Z',
        subjective: 'Checkup',
        objective: 'Exam',
        assessment: 'Healthy',
        plan: 'Recall in 6 months',
        isSigned: true,
        diagnoses: [],
        prescriptions: [],
      };
      (encounterVariedFindings as any).dentalFindings = [
        {
          id: 'df-clean-healthy',
          toothNumber: 11,
          status: 'Healthy',
          surface: '', // empty surface
          notes: '', // empty notes
          recordedBy: 'Dr. John Doe', // already has Dr. prefix
        },
        {
          id: 'df-decay-no-title',
          toothNumber: 12,
          status: 'Decayed',
          surface: 'MOD',
          notes: 'Cavity detected',
          recordedBy: 'Jane Smith', // lacks Dr. prefix
        },
      ];

      const markup = renderToStaticMarkup(
        React.createElement(EncountersTimelineTab, {
          patient: mockPatient,
          patientId: mockPatient.id,
          consultations: [encounterVariedFindings],
        })
      );

      expect(markup).toContain('DENTAL FINDINGS &amp; PROCEDURES');
      // Tooth #11 without surface
      expect(markup).toContain('Tooth #11 - Healthy');
      // Tooth #12 with surface
      expect(markup).toContain('Tooth #12 (MOD) - Decay');
      // Doctor normalization: Dr. John Doe should not become Dr. Dr. John Doe
      expect(markup).toContain('Dr. John Doe');
      expect(markup).not.toContain('Dr. Dr. John Doe');
      // Doctor normalization: Jane Smith should become Dr. Jane Smith
      expect(markup).toContain('Dr. Jane Smith');
    });

    test('1.3 Completely empty consultations array renders empty state without crashing', () => {
      const markup = renderToStaticMarkup(
        React.createElement(EncountersTimelineTab, {
          patient: mockPatient,
          patientId: mockPatient.id,
          consultations: [],
        })
      );

      expect(markup).toContain('No encounters found');
      expect(markup).toContain('Zero longitudinal SOAP encounter records documented for this patient.');
      expect(markup).not.toContain('DENTAL FINDINGS &amp; PROCEDURES');
    });
  });

  // =========================================================================
  // Dimension 2: Non-Dental Clinic & Tab Concealment
  // =========================================================================
  describe('Dimension 2: Non-Dental Clinic & Tab Concealment', () => {
    test('2.1 getAvailableChartTabs conceals dental tab when dental module is disabled and no dental records exist', () => {
      const tabs = getAvailableChartTabs(false, false);
      expect(tabs).toHaveLength(8);
      expect(tabs.map((t) => t.value)).not.toContain('dental');
    });

    test('2.2 getAvailableChartTabs reveals dental tab when dental module is enabled', () => {
      const tabs = getAvailableChartTabs(true, false);
      expect(tabs).toHaveLength(9);
      expect(tabs.map((t) => t.value)).toContain('dental');
      expect(tabs[8]).toEqual(DENTAL_CHART_TAB);
    });

    test('2.3 getAvailableChartTabs reveals dental tab when dental module is disabled but patient has dental records', () => {
      const tabs = getAvailableChartTabs(false, true);
      expect(tabs).toHaveLength(9);
      expect(tabs.map((t) => t.value)).toContain('dental');
    });
  });

  // =========================================================================
  // Dimension 3: Generic "Patient Chart" Labeling Across All Layouts
  // =========================================================================
  describe('Dimension 3: Generic "Patient Chart" Labeling Across All Layouts', () => {
    test('3.1 CenteredModalChartLayout displays "Patient Chart" and no "Medical chart"', () => {
      const markup = renderToStaticMarkup(
        React.createElement(CenteredModalChartLayout, {
          patient: mockPatient,
          patientChart: mockChart,
          activeTab: 'summary',
          currentLayout: 'modal',
          onTabChange: () => {},
          onClose: () => {},
          onSwitchLayout: () => {},
          onEditDemographics: () => {},
        })
      );

      expect(markup).toContain('Patient Chart');
      expect(markup).not.toContain('>Medical chart<');
      expect(markup).not.toContain('>Medical Chart<');
    });

    test('3.2 SlideOverDrawerChartLayout displays "Patient Chart" and no "Medical chart"', () => {
      const markup = renderToStaticMarkup(
        React.createElement(SlideOverDrawerChartLayout, {
          patient: mockPatient,
          patientChart: mockChart,
          activeTab: 'summary',
          currentLayout: 'drawer',
          onTabChange: () => {},
          onClose: () => {},
          onSwitchLayout: () => {},
          onEditDemographics: () => {},
        })
      );

      expect(markup).toContain('Patient Chart');
      expect(markup).not.toContain('>Medical chart<');
      expect(markup).not.toContain('>Medical Chart<');
    });

    test('3.3 SplitPaneChartLayout displays "Patient Chart" and has accessibilityLabel "Close Patient Chart"', () => {
      const markup = renderToStaticMarkup(
        React.createElement(SplitPaneChartLayout, {
          patient: mockPatient,
          patientChart: mockChart,
          activeTab: 'summary',
          currentLayout: 'split',
          onTabChange: () => {},
          onClose: () => {},
          onSwitchLayout: () => {},
          onEditDemographics: () => {},
        })
      );

      expect(markup).toContain('Patient Chart');
      expect(markup).toContain('aria-label="Close Patient Chart"');
      expect(markup).not.toContain('>Medical chart<');
      expect(markup).not.toContain('>Medical Chart<');
    });
  });

  // =========================================================================
  // Dimension 4: Full-Width Layout Screen Styles Verification
  // =========================================================================
  describe('Dimension 4: Full-Width Layout Screen Styles Verification', () => {
    test('4.1 Consultations, Patients, and Dashboard screens do not have maxWidth on content container', async () => {
      const fs = await import('fs');
      const path = await import('path');

      const screens = [
        'navigation/screens/Consultations.screen.tsx',
        'navigation/screens/Patients.screen.tsx',
        'navigation/screens/Dashboard.screen.tsx',
      ];

      for (const screenPath of screens) {
        const fullPath = path.resolve(__dirname, '..', screenPath);
        const fileContent = fs.readFileSync(fullPath, 'utf8');

        // Extract the content style object
        const contentMatch = fileContent.match(/content:\s*\{[\s\S]*?\n\s*\},/);
        expect(contentMatch).not.toBeNull();
        const contentStyle = contentMatch![0];

        // Must have width: '100%'
        expect(contentStyle).toContain("width: '100%'");
        // Must NOT have maxWidth
        expect(contentStyle).not.toContain('maxWidth: theme.sizes.contentMaxWidth');
        expect(contentStyle).not.toContain("alignSelf: 'center'");
      }
    });
  });
});
