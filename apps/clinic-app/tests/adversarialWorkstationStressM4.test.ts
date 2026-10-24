// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
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
    get: () => ({ width: 1920, height: 1080 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1920, height: 1080 }),
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

mock.module('../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({
    isCompact: false,
    isMedium: false,
    isExpanded: true,
    breakpoint: 'desktop',
  }),
}));

mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: () => ({
    width: 1920,
    height: 1080,
    isCompact: false,
    isWorkstation: true,
    isDesktop: true,
    isWide: true,
  }),
}));

const defaultMockClinicContext = {
  facilityName: 'ClinicEZ Adversarial Center',
  accreditationNumber: 'ACC-ADVERSARIAL',
  taxIdentificationNumber: '999-999-999',
  planTier: 'Enterprise',
  preferredChartLayout: 'split',
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
      current: { id: 'staff-1', name: 'Dr. Maria Santos', role: 'Doctor' },
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
const { default: PatientChartModal } = await import('../components/chart/PatientChartModal');
const { default: EncountersTimelineTab } = await import('../components/chart/EncountersTimelineTab');
import type { ClinicPatient, PatientChart, ConsultationRecord } from '../services/clinicService';

const adversaryPatient: ClinicPatient = {
  id: 'pat-adversary-99',
  clinicId: 'clinic-adv',
  patientCode: 'PAT-ADV-999',
  fullName: 'Adversarial Test Patient',
  firstName: 'Adversarial',
  lastName: 'Patient',
  gender: 'Female',
  dateOfBirth: '1985-12-30',
  bloodType: 'AB+',
  isVerified: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const adversaryChart: PatientChart = {
  patientId: 'pat-adversary-99',
  patientName: 'Adversarial Test Patient',
  totalVisits: 12,
  allergies: [],
  vitalsHistory: [],
  consultations: [],
  dentalTeeth: [
    {
      id: 'dt-adv-1',
      tenantId: 'tenant-adv',
      clinicId: 'clinic-adv',
      patientId: 'pat-adversary-99',
      toothNumber: 36,
      status: 'Crowned' as any,
      surface: 'MOD',
      notes: 'Porcelain fused to metal crown',
      createdAt: '2026-09-10T08:00:00Z',
    },
  ],
};

describe('Adversarial Stress Harness: Milestone 4 Workstation & Dental Sync', () => {
  beforeEach(() => {
    (globalThis as any).__mockClinicContext = defaultMockClinicContext;
  });

  afterAll(() => {
    delete (globalThis as any).__mockClinicContext;
  });
  // =========================================================================
  // Stress Test 1: Full-Width Stylesheet Invariants
  // =========================================================================
  describe('1. Full-Width Stylesheet Invariants (R4)', () => {
    test('Consultations, Patients, and Dashboard screens do not constrain content width or center self', () => {
      const screens = [
        '../navigation/screens/Consultations.screen.tsx',
        '../navigation/screens/Patients.screen.tsx',
        '../navigation/screens/Dashboard.screen.tsx',
      ];

      for (const screenRel of screens) {
        const filePath = path.resolve(__dirname, screenRel);
        const code = fs.readFileSync(filePath, 'utf8');

        // Extract content style definition
        const contentMatch = code.match(/content:\s*\{([^}]+)\}/);
        expect(contentMatch).toBeTruthy();
        const contentBody = contentMatch![1];

        // Must NOT have contentMaxWidth
        expect(contentBody).not.toMatch(/maxWidth:\s*theme\.sizes\.contentMaxWidth/);
        expect(contentBody).not.toMatch(/alignSelf:\s*['"]center['"]/);

        // Must have width: '100%'
        expect(contentBody).toMatch(/width:\s*['"]100%['"]/);
      }
    });

    test('Zero occurrences of contentMaxWidth across all three screen files', () => {
      const screens = [
        '../navigation/screens/Consultations.screen.tsx',
        '../navigation/screens/Patients.screen.tsx',
        '../navigation/screens/Dashboard.screen.tsx',
      ];

      for (const screenRel of screens) {
        const filePath = path.resolve(__dirname, screenRel);
        const code = fs.readFileSync(filePath, 'utf8');
        expect(code).not.toContain('contentMaxWidth');
      }
    });
  });

  // =========================================================================
  // Stress Test 2: Generic "Patient Chart" Title Across Layouts & Edge Cases
  // =========================================================================
  describe('2. Generic "Patient Chart" Title Invariants (R1)', () => {
    test('CenteredModal renders "Patient Chart" and never "Medical chart" in visible title', () => {
      const markup = renderToStaticMarkup(
        React.createElement(CenteredModalChartLayout, {
          patient: adversaryPatient,
          patientChart: adversaryChart,
          activeTab: 'summary',
          currentLayout: 'modal',
          onTabChange: () => {},
          onClose: () => {},
          onSwitchLayout: () => {},
        })
      );

      expect(markup).toContain('Patient Chart');
      expect(markup).not.toMatch(/>\s*Medical [Cc]hart\s*</);
    });

    test('SlideOverDrawer renders "Patient Chart" and never "Medical chart" in visible title', () => {
      const markup = renderToStaticMarkup(
        React.createElement(SlideOverDrawerChartLayout, {
          patient: adversaryPatient,
          patientChart: adversaryChart,
          activeTab: 'summary',
          currentLayout: 'drawer',
          onTabChange: () => {},
          onClose: () => {},
          onSwitchLayout: () => {},
        })
      );

      expect(markup).toContain('Patient Chart');
      expect(markup).not.toMatch(/>\s*Medical [Cc]hart\s*</);
    });

    test('SplitPane renders "Patient Chart" in workstation header canvas', () => {
      const markup = renderToStaticMarkup(
        React.createElement(SplitPaneChartLayout, {
          patient: adversaryPatient,
          patientChart: adversaryChart,
          activeTab: 'summary',
          currentLayout: 'split',
          onTabChange: () => {},
          onClose: () => {},
          onSwitchLayout: () => {},
        })
      );

      expect(markup).toContain('Patient Chart');
      expect(markup).not.toMatch(/>\s*Medical [Cc]hart\s*</);
    });

    test('PatientChartModal with null patient renders gracefully with "Patient Chart"', () => {
      const markup = renderToStaticMarkup(
        React.createElement(PatientChartModal, {
          visible: true,
          patient: null as any,
          patientChart: null as any,
          onClose: () => {},
        })
      );

      expect(markup).toContain('Patient Chart');
    });

    test('PatientChartModal across all 3 layouts renders "Patient Chart"', () => {
      const layouts: ('modal' | 'drawer' | 'split')[] = ['modal', 'drawer', 'split'];
      for (const layout of layouts) {
        const markup = renderToStaticMarkup(
          React.createElement(PatientChartModal, {
            visible: true,
            patient: adversaryPatient,
            patientChart: adversaryChart,
            preferredLayout: layout,
            onClose: () => {},
          })
        );
        expect(markup).toContain('Patient Chart');
        expect(markup).not.toMatch(/>\s*Medical [Cc]hart\s*</);
      }
    });
  });

  // =========================================================================
  // Stress Test 3: Encounters Timeline Dental Summary Adversarial Inputs
  // =========================================================================
  describe('3. EncountersTimelineTab Dental Summary Adversarial Inputs (R1)', () => {
    test('Clean encounter (no dental findings, no tooth procedures) omits section entirely', () => {
      const cleanEncounter: ConsultationRecord = {
        id: 'enc-clean-stress',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        patientId: adversaryPatient.id,
        patientName: adversaryPatient.fullName,
        doctorId: 'doc-1',
        doctorName: 'Dr. Physician',
        encounterDate: '2026-10-18T10:00:00Z',
        subjective: 'All clear',
        objective: 'Normal vitals',
        assessment: 'Healthy',
        plan: 'Annual follow-up',
        isSigned: true,
        diagnoses: [],
        prescriptions: [],
      };

      const markup = renderToStaticMarkup(
        React.createElement(EncountersTimelineTab, {
          patient: adversaryPatient,
          patientId: adversaryPatient.id,
          consultations: [cleanEncounter],
        })
      );

      expect(markup).not.toContain('DENTAL FINDINGS');
      expect(markup).not.toContain('DENTAL FINDINGS &amp; PROCEDURES');
      expect(markup).not.toContain('encounter-dental-summary-enc-clean-stress');
    });

    test('Encounter with non-dental procedures (toothNumber is null/undefined) omits section', () => {
      const medProcEncounter: ConsultationRecord = {
        id: 'enc-med-proc',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        patientId: adversaryPatient.id,
        patientName: adversaryPatient.fullName,
        doctorId: 'doc-1',
        doctorName: 'Dr. Physician',
        encounterDate: '2026-10-18T10:00:00Z',
        subjective: 'Wound dressing needed',
        objective: 'Superficial laceration',
        assessment: 'Laceration',
        plan: 'Wound care',
        isSigned: true,
        diagnoses: [],
        prescriptions: [],
      };
      (medProcEncounter as any).procedures = [
        { id: 'proc-med-1', procedureName: 'Sterile Wound Dressing', toothNumber: null },
        { id: 'proc-med-2', procedureName: 'Suture Removal', toothNumber: undefined },
      ];

      const markup = renderToStaticMarkup(
        React.createElement(EncountersTimelineTab, {
          patient: adversaryPatient,
          patientId: adversaryPatient.id,
          consultations: [medProcEncounter],
        })
      );

      expect(markup).not.toContain('DENTAL FINDINGS');
      expect(markup).not.toContain('encounter-dental-summary-enc-med-proc');
    });

    test('Encounter with tooth-tagged procedure renders Dental Findings & Procedures even if dentalFindings is empty', () => {
      const toothProcEncounter: ConsultationRecord = {
        id: 'enc-tooth-proc-only',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        patientId: adversaryPatient.id,
        patientName: adversaryPatient.fullName,
        doctorId: 'doc-1',
        doctorName: 'Dr. Dentist',
        encounterDate: '2026-10-18T10:00:00Z',
        subjective: 'Tooth extraction',
        objective: 'Impacted wisdom tooth',
        assessment: 'Impaction',
        plan: 'Surgical extraction',
        isSigned: true,
        diagnoses: [],
        prescriptions: [],
      };
      (toothProcEncounter as any).dentalFindings = [];
      (toothProcEncounter as any).procedures = [
        {
          id: 'proc-dent-1',
          toothNumber: 38,
          toothSurface: 'Distal',
          procedureName: 'Surgical Extraction Wisdom Tooth',
          status: 'Completed',
        },
      ];

      const markup = renderToStaticMarkup(
        React.createElement(EncountersTimelineTab, {
          patient: adversaryPatient,
          patientId: adversaryPatient.id,
          consultations: [toothProcEncounter],
        })
      );

      expect(markup).toContain('DENTAL FINDINGS &amp; PROCEDURES');
      expect(markup).toContain('Tooth #38 (Distal)');
      expect(markup).toContain('Surgical Extraction Wisdom Tooth');
      expect(markup).toContain('Completed');
    });

    test('Encounter with edge-case dental findings (missing notes, pre-prefixed Dr. title, special surface) renders without crash', () => {
      const edgeDentalEncounter: ConsultationRecord = {
        id: 'enc-edge-dental',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        patientId: adversaryPatient.id,
        patientName: adversaryPatient.fullName,
        doctorId: 'doc-1',
        doctorName: 'Dr. Dentist',
        encounterDate: '2026-10-18T10:00:00Z',
        subjective: 'Multiple teeth examined',
        objective: 'Teeth charted',
        assessment: 'Exam complete',
        plan: 'Treatment plan discussed',
        isSigned: true,
        diagnoses: [],
        prescriptions: [],
      };
      (edgeDentalEncounter as any).dentalFindings = [
        {
          id: 'df-1',
          toothNumber: 11,
          status: 'Healthy',
          surface: undefined,
          notes: null,
          recordedBy: 'Dr. Jane Smith', // Already has Dr.
        },
        {
          id: 'df-2',
          toothNumber: 26,
          status: 'Filled',
          surface: 'MODBL',
          notes: 'Amalgam restoration intact',
          recordedBy: 'John Doe', // No Dr.
        },
      ];

      const markup = renderToStaticMarkup(
        React.createElement(EncountersTimelineTab, {
          patient: adversaryPatient,
          patientId: adversaryPatient.id,
          consultations: [edgeDentalEncounter],
        })
      );

      expect(markup).toContain('DENTAL FINDINGS &amp; PROCEDURES');
      expect(markup).toContain('Tooth #11 - Healthy');
      // Should normalize Dr. Jane Smith without double Dr.
      expect(markup).toContain('Dr. Jane Smith');
      expect(markup).not.toContain('Dr. Dr.');
      // Should prefix John Doe with Dr.
      expect(markup).toContain('Dr. John Doe');
      expect(markup).toContain('Tooth #26 (MODBL) - Filled');
      expect(markup).toContain('Amalgam restoration intact');
    });
  });

  // =========================================================================
  // Stress Test 4: Left-Pane Dental Tab Conditional Rules & State Transitions
  // =========================================================================
  describe('4. Left-Pane Dental Tab Conditional Logic (R1)', () => {
    test('Consultations.screen.tsx defines isDentalEnabled with all necessary feature flag checks', () => {
      const filePath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const code = fs.readFileSync(filePath, 'utf8');

      expect(code).toContain('settings?.enableDentalModule');
      expect(code).toContain("settings?.specialtyMode === 'Dental'");
      expect(code).toContain("settings?.specialtyMode === 'Multi-Specialty'");
      expect(code).toContain('patientChart?.dentalTeeth');
      expect(code).toContain('patientChart?.dentalChart');
    });

    test('Consultations.screen.tsx keeps left-pane patientChart.dentalTeeth read-only in handleDentalChartChange and updates on encounter signing', () => {
      const filePath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const code = fs.readFileSync(filePath, 'utf8');

      // Verify handleDentalChartChange only stages right-side encounter dentalChart state while unsigned
      const handlerMatch = code.match(/const handleDentalChartChange = useCallback\([\s\S]*?\n  \}, \[\]\);/);
      expect(handlerMatch).toBeTruthy();
      const handlerCode = handlerMatch![0];

      expect(handlerCode).toContain('setDentalChart');
      expect(handlerCode).not.toContain('setPatientChart');

      // Verify encounter signing updates patientChart.dentalTeeth and refreshes longitudinal chart
      expect(code).toContain('clinicService.batchSaveDentalChart');
      expect(code).toContain('dentalTeeth: syncedTeeth');
      expect(code).toContain('refreshPatientChart(selectedPatient.patientId)');
    });
  });
});
