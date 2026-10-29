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

let currentWindowWidth = 1280;
let currentWindowHeight = 800;

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
    get: () => ({ width: currentWindowWidth, height: currentWindowHeight }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: currentWindowWidth, height: currentWindowHeight }),
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
  CHART_LAYOUT_OPTIONS,
} = await import('../components/chart');
const { default: HealthProfilesTab } = await import('../components/chart/HealthProfilesTab');
const { getSessionItem, setSessionItem } = await import('../utils/deviceStorage');
import type { ClinicPatient, PatientChart } from '../services/clinicService';

describe('PatientChartModal — Workstation Sizing & Responsive Longitudinal EHR', () => {
  const mockPatient: ClinicPatient = {
    id: 'pat-001',
    clinicId: 'clinic-1',
    tenantId: 'tenant-ustp',
    patientCode: 'PAT-2026-00001',
    fullName: 'Maria DB',
    firstName: 'Maria',
    lastName: 'DB',
    dateOfBirth: '2000-01-01',
    age: 26,
    gender: 'Male',
    civilStatus: 'Single',
    contactNumber: '09171234567',
    verificationStatus: 'Verified',
    bloodType: 'O+',
    allergies: 'Paracetamol',
    chronicConditions: 'Hypertension',
    totalVisits: 1,
    createdAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: '2026-01-01T00:00:00Z',
  };

  const mockChart: PatientChart = {
    patientId: 'pat-001',
    patientName: 'Maria DB',
    totalVisits: 1,
    demographics: {
      patientId: 'pat-001',
      patientCode: 'PAT-2026-00001',
      patientName: 'Maria DB',
      dateOfBirth: '2000-01-01',
      age: 26,
      gender: 'Male',
      bloodType: 'O+',
      verificationStatus: 'Verified',
      contactNumber: '09171234567',
    },
    vitalsHistory: [
      {
        id: 'vit-1',
        patientId: 'pat-001',
        consultationId: 'c-1',
        systolicBp: 120,
        diastolicBp: 80,
        heartRateBpm: 72,
        respiratoryRateBreathsPerMin: 18,
        temperatureCelsius: 36.6,
        oxygenSaturationPercent: 99,
        recordedAt: '2026-10-12T08:00:00Z',
      },
    ],
    consultations: [
      {
        id: 'c-1',
        clinicId: 'clinic-1',
        patientId: 'pat-001',
        consultationDate: '2026-10-12',
        encounterDate: '2026-10-12T08:00:00Z',
        doctorName: 'Dr. Jane Santos',
        chiefComplaint: 'Routine checkup',
        assessment: 'Well adult',
        prescriptions: [
          {
            id: 'rx-1',
            consultationId: 'c-1',
            genericName: 'Paracetamol',
            brandName: 'Biogesic',
            dosage: '500 mg',
            sig: '1 TID',
          },
        ],
      },
    ],
    labOrdersHistory: [],
    proceduresHistory: [],
    immunizations: [],
    surgicalHistories: [],
    socialHistory: null,
    reproductiveHistory: null,
    latestNcdAssessment: null,
    attachments: [],
    problems: [
      {
        id: 'p-1',
        patientId: 'pat-001',
        icd10Code: 'I10',
        problemTitle: 'Essential Hypertension',
        status: 'Active',
        isChronicNcd: true,
      },
    ],
    allergies: [
      {
        id: 'a-1',
        patientId: 'pat-001',
        allergen: 'Paracetamol',
        category: 'Medication',
        severity: 'Moderate',
        isAnaphylactic: false,
      },
    ],
  };

  test('1. CHART_TABS exports canonical 8 longitudinal sections without truncation', () => {
    expect(CHART_TABS.length).toBe(8);
    const tabValues = CHART_TABS.map((t) => t.value);
    expect(tabValues).toEqual([
      'summary',
      'encounters',
      'diagnostics',
      'procedures',
      'immunizations',
      'profiles',
      'vault',
      'documents',
    ]);

    const tabLabels = CHART_TABS.map((t) => t.label);
    expect(tabLabels).toContain('Doc Vault');
    expect(tabLabels).toContain('Admin Vault');
    expect(tabLabels).toContain('Vaccines');
    expect(tabLabels).toContain('Health Profiles');
  });

  test('2. Renders patient demographic banner and action controls in workstation mode', () => {
    let refreshTriggered = false;
    let closeTriggered = false;

    const markup = renderToStaticMarkup(
      React.createElement(PatientChartModal, {
        visible: true,
        patient: mockPatient,
        patientChart: mockChart,
        loadingChart: false,
        onClose: () => { closeTriggered = true; },
        onRefreshChart: () => { refreshTriggered = true; },
      })
    );

    // Header title and patient name
    expect(markup).toContain('Patient Chart');
    expect(markup).toContain('Maria DB');
    expect(markup).toContain('PAT-2026-00001');
    expect(markup).toContain('26 yrs');
    expect(markup).toContain('Male');
    expect(markup).toContain('DOB: 2000-01-01');
    expect(markup).toContain('Verified');
    expect(markup).toContain('O+');

    // Accessibility labels for controls
    expect(markup).toContain('Refresh patient chart');
    expect(markup).toContain('Maximize chart window');
    expect(markup).toContain('Close medical chart');

    // Accessibility label
    expect(markup).toContain('Medical Chart for Maria DB');
  });

  test('3. Renders Executive Summary by default with quick stats and clinical quadrants', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PatientChartModal, {
        visible: true,
        patient: mockPatient,
        patientChart: mockChart,
        loadingChart: false,
        initialTab: 'summary',
        onClose: () => {},
      })
    );

    // Executive summary quick stats
    expect(markup).toContain('Total Visits');
    expect(markup).toContain('Active Problems');
    expect(markup).toContain('Allergies');
    expect(markup).toContain('Active Regimens');

    // ICD-10 Chronic Problem & Allergy
    expect(markup).toContain('Essential Hypertension');
    expect(markup).toContain('Paracetamol');
  });

  test('4. Renders Encounters Timeline tab when activeTab is set to encounters', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PatientChartModal, {
        visible: true,
        patient: mockPatient,
        patientChart: mockChart,
        activeTab: 'encounters',
        onClose: () => {},
      })
    );

    expect(markup).toContain('Search encounters by diagnosis, notes, doctor, case #...');
    expect(markup).toContain('Dr. Jane Santos');
    expect(markup).toContain('All Encounters');
  });

  test('5. Renders Diagnostics & Lab tab with filter controls and slip action wiring', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PatientChartModal, {
        visible: true,
        patient: mockPatient,
        patientChart: mockChart,
        activeTab: 'diagnostics',
        onClose: () => {},
      })
    );

    expect(markup).toContain('All Orders');
    expect(markup).toContain('Pending');
    expect(markup).toContain('Completed');
  });

  test('6. Renders Statutory Immunizations tab with clinical documentation status banner', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PatientChartModal, {
        visible: true,
        patient: mockPatient,
        patientChart: mockChart,
        activeTab: 'immunizations',
        onClose: () => {},
      })
    );

    expect(markup).toContain('Immunization Documentation Status');
    expect(markup).toContain('No immunizations are currently documented for this patient');
    expect(markup).not.toContain('PhilHealth Konsulta Statutory Coverage');
    expect(markup).not.toContain('Fallback Code 999');
  });

  test('7. Renders External Document Vault tab with category filters and upload button', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PatientChartModal, {
        visible: true,
        patient: mockPatient,
        patientChart: mockChart,
        activeTab: 'vault',
        onClose: () => {},
      })
    );

    expect(markup).toContain('All Records');
    expect(markup).toContain('Outside Chest X-Ray');
    expect(markup).toContain('Cert of Registration (COR)');
  });

  test('8. Handles loading state by rendering SkeletonList', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PatientChartModal, {
        visible: true,
        patient: mockPatient,
        patientChart: null,
        loadingChart: true,
        onClose: () => {},
      })
    );

    expect(markup).toContain('Patient Chart');
    // Tab body skeleton indicators
    expect(markup).not.toContain('Total Visits');
  });

  test('9. Handles error state by rendering ErrorState with retry callback', () => {
    let retryCalled = false;
    const markup = renderToStaticMarkup(
      React.createElement(PatientChartModal, {
        visible: true,
        patient: mockPatient,
        patientChart: null,
        loadingChart: false,
        chartError: 'Database connection failed',
        onClose: () => {},
        onRefreshChart: () => { retryCalled = true; },
      })
    );

    expect(markup).toContain('Unable to load the chart');
    expect(markup).toContain('Database connection failed');
  });

  test('10. Tolerates null patient without crashing', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PatientChartModal, {
        visible: true,
        patient: null,
        patientChart: null,
        loadingChart: false,
        onClose: () => {},
      })
    );

    expect(markup).toContain('Patient Chart');
  });

  test('11. Removes Edit Demographics button from summary spine and preserves header pencil button', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PatientChartModal, {
        visible: true,
        patient: mockPatient,
        patientChart: mockChart,
        loadingChart: false,
        onClose: () => {},
      })
    );

    // Header pencil button exists with accessibility label
    expect(markup).toContain('aria-label="Edit Demographics"');
    // Spine text button "Edit Demographics" is not rendered
    expect(markup).not.toContain('>Edit Demographics<');
  });

  test('12. HealthProfilesTab renders horizontally scrollable sub-tabs with all sections', () => {
    const markup = renderToStaticMarkup(
      React.createElement(HealthProfilesTab, {
        patient: mockPatient,
      })
    );

    // Rendered inside ScrollView
    expect(markup).toContain('data-component="ScrollView"');
    expect(markup).toContain('Surgical &amp; Clinical');
    expect(markup).toContain('Lifestyle &amp; Social');
    expect(markup).toContain('Reproductive / OB-GYN');
    expect(markup).toContain('Cardiometabolic &amp; NCD');
  });

  test('13. Storage helpers persist and retrieve active chart tab and sub-tab', () => {
    setSessionItem('clinicez_active_chart_tab', 'profiles');
    expect(getSessionItem('clinicez_active_chart_tab')).toBe('profiles');

    setSessionItem('clinicez_health_profiles_active_subtab', 'lifestyle');
    expect(getSessionItem('clinicez_health_profiles_active_subtab')).toBe('lifestyle');

    setSessionItem('clinicez_active_chart_tab', null);
    expect(getSessionItem('clinicez_active_chart_tab')).toBeNull();

    setSessionItem('clinicez_health_profiles_active_subtab', null);
    expect(getSessionItem('clinicez_health_profiles_active_subtab')).toBeNull();
  });

  test('14. CHART_LAYOUT_OPTIONS exports canonical 3 layout configurations', () => {
    expect(CHART_LAYOUT_OPTIONS).toHaveLength(3);
    const ids = CHART_LAYOUT_OPTIONS.map((o) => o.id);
    expect(ids).toEqual(['modal', 'split', 'drawer']);

    const modalOpt = CHART_LAYOUT_OPTIONS.find((o) => o.id === 'modal');
    expect(modalOpt?.label).toBe('Centered Workstation Modal');
    expect(modalOpt?.icon).toBe('layoutModal');

    const splitOpt = CHART_LAYOUT_OPTIONS.find((o) => o.id === 'split');
    expect(splitOpt?.label).toBe('Split-Pane Clinical Workstation');
    expect(splitOpt?.icon).toBe('layoutSplit');

    const drawerOpt = CHART_LAYOUT_OPTIONS.find((o) => o.id === 'drawer');
    expect(drawerOpt?.label).toBe('Slide-Over Focus Drawer');
    expect(drawerOpt?.icon).toBe('layoutDrawer');
  });

  test('15. CenteredModalChartLayout renders floating workstation dialog with maximize action', () => {
    const markup = renderToStaticMarkup(
      React.createElement(CenteredModalChartLayout, {
        patient: mockPatient,
        patientChart: mockChart,
        activeTab: 'summary',
        onTabChange: () => {},
        onClose: () => {},
        onEditDemographics: () => {},
        currentLayout: 'modal',
        onSwitchLayout: () => {},
      })
    );

    expect(markup).toContain('aria-label="Medical Chart for Maria DB"');
    expect(markup).toContain('aria-label="Maximize chart window"');
    expect(markup).toContain('aria-label="Chart Layout Selector"');
    expect(markup).toContain('Summary');
    expect(markup).toContain('Doc Vault');
  });

  test('16. SplitPaneChartLayout renders persistent left sidebar rail with clinical alerts and vertical nav', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SplitPaneChartLayout, {
        patient: mockPatient,
        patientChart: mockChart,
        activeTab: 'summary',
        onTabChange: () => {},
        onClose: () => {},
        onEditDemographics: () => {},
        currentLayout: 'split',
        onSwitchLayout: () => {},
      })
    );

    expect(markup).toContain('aria-label="Clinical Workstation for Maria DB"');
    expect(markup).toContain('CLINICAL ALERTS');
    expect(markup).toContain('ALLERGY: Paracetamol');
    expect(markup).toContain('LATEST VITALS');
    expect(markup).toContain('CHART NAVIGATION');
    expect(markup).toContain('Executive Summary');
    expect(markup).toContain('Encounters Timeline');
    expect(markup).toContain('Diagnostic Labs');
  });

  test('17. SlideOverDrawerChartLayout renders right-docked offcanvas drawer and backdrop dismiss', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SlideOverDrawerChartLayout, {
        patient: mockPatient,
        patientChart: mockChart,
        activeTab: 'summary',
        onTabChange: () => {},
        onClose: () => {},
        onEditDemographics: () => {},
        currentLayout: 'drawer',
        onSwitchLayout: () => {},
      })
    );

    expect(markup).toContain('aria-label="Medical Chart Drawer for Maria DB"');
    expect(markup).toContain('aria-label="Dismiss drawer and return to queue"');
    expect(markup).toContain('Click to close &amp; return to queue');
    expect(markup).toContain('aria-label="Chart Layout Selector"');
  });

  test('18. PatientChartModal dispatches to preferredLayout prop', () => {
    // Split pane layout dispatch
    const splitMarkup = renderToStaticMarkup(
      React.createElement(PatientChartModal, {
        visible: true,
        patient: mockPatient,
        patientChart: mockChart,
        preferredLayout: 'split',
        onClose: () => {},
      })
    );
    expect(splitMarkup).toContain('aria-label="Clinical Workstation for Maria DB"');
    expect(splitMarkup).toContain('CLINICAL ALERTS');

    // Drawer layout dispatch
    const drawerMarkup = renderToStaticMarkup(
      React.createElement(PatientChartModal, {
        visible: true,
        patient: mockPatient,
        patientChart: mockChart,
        preferredLayout: 'drawer',
        onClose: () => {},
      })
    );
    expect(drawerMarkup).toContain('aria-label="Medical Chart Drawer for Maria DB"');
    expect(drawerMarkup).toContain('Click to close &amp; return to queue');

    // Centered modal layout dispatch
    const modalMarkup = renderToStaticMarkup(
      React.createElement(PatientChartModal, {
        visible: true,
        patient: mockPatient,
        patientChart: mockChart,
        preferredLayout: 'modal',
        onClose: () => {},
      })
    );
    expect(modalMarkup).toContain('aria-label="Medical Chart for Maria DB"');
    expect(modalMarkup).toContain('aria-label="Maximize chart window"');
  });

  test('19. SplitPaneChartLayout stacks MRN, demographics, and PHIC into non-breaking key-value rows', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SplitPaneChartLayout, {
        patient: {
          ...mockPatient,
          philHealthNumber: '12-345678901-2',
        },
        patientChart: mockChart,
        activeTab: 'summary',
        onTabChange: () => {},
        onClose: () => {},
        onEditDemographics: () => {},
        currentLayout: 'split',
        onSwitchLayout: () => {},
      })
    );

    expect(markup).toContain('MRN:');
    expect(markup).toContain('PAT-2026-00001');
    expect(markup).toContain('Demographics:');
    expect(markup).toContain('PHIC:');
    expect(markup).toContain('12-345678901-2');
  });

  test('20. StatutoryImmunizationsTab renders action buttons without duplicate plus prefix', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PatientChartModal, {
        visible: true,
        patient: mockPatient,
        patientChart: mockChart,
        activeTab: 'immunizations',
        onClose: () => {},
      })
    );

    expect(markup).toContain('Administer Vaccine');
    expect(markup).toContain('Add Historical Vaccine');
    expect(markup).not.toContain('+ +');
    expect(markup).not.toContain('+ Administer Vaccine');
    expect(markup).not.toContain('+ Add Historical Vaccine');
  });

  test('21. PatientChartModal renders all 7 longitudinal tabs seamlessly across all 3 workstation layouts', () => {
    const layouts: ('modal' | 'split' | 'drawer')[] = ['modal', 'split', 'drawer'];
    const tabs: any[] = ['summary', 'encounters', 'diagnostics', 'procedures', 'immunizations', 'profiles', 'vault'];

    for (const layout of layouts) {
      for (const tab of tabs) {
        const markup = renderToStaticMarkup(
          React.createElement(PatientChartModal, {
            visible: true,
            patient: mockPatient,
            patientChart: mockChart,
            preferredLayout: layout,
            activeTab: tab,
            onClose: () => {},
          })
        );
        expect(markup.length).toBeGreaterThan(0);
        if (layout === 'split') {
          expect(markup).toContain('aria-label="Clinical Workstation for Maria DB"');
        } else if (layout === 'drawer') {
          expect(markup).toContain('aria-label="Medical Chart Drawer for Maria DB"');
        } else {
          expect(markup).toContain('aria-label="Medical Chart for Maria DB"');
        }
      }
    }
  }, 30000);

  test('22. In-app navigation deep link with activeTab="dental" and focusToothNumber in Centered Modal auto-focuses tooth', () => {
    const dentalChartData: PatientChart = {
      ...mockChart,
      dentalTeeth: [
        {
          id: 'dt-1',
          tenantId: 'tenant-ustp',
          clinicId: 'clinic-1',
          patientId: 'pat-001',
          toothNumber: 16,
          status: 'Decayed',
          surface: 'MOD',
          notes: 'Deep occlusal decay',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        },
      ],
    };

    const markup = renderToStaticMarkup(
      React.createElement(PatientChartModal, {
        visible: true,
        patient: mockPatient,
        patientChart: dentalChartData,
        preferredLayout: 'modal',
        activeTab: 'dental',
        focusToothNumber: 16,
        onClose: () => {},
      })
    );

    expect(markup).toContain('Odontogram Visualizer');
    expect(markup).toContain('Tooth #16');
    expect(markup).toContain('Upper Right First Molar');
    expect(markup).toContain('Decayed');
    expect(markup).toContain('MOD');
  });

  test('23. In-app navigation deep link with preferredLayout="split", activeTab="dental", and focusToothNumber={16}', () => {
    const dentalChartData: PatientChart = {
      ...mockChart,
      dentalTeeth: [
        {
          id: 'dt-1',
          tenantId: 'tenant-ustp',
          clinicId: 'clinic-1',
          patientId: 'pat-001',
          toothNumber: 16,
          status: 'Decayed',
          surface: 'MOD',
          notes: 'Deep occlusal decay',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        },
      ],
    };

    const markup = renderToStaticMarkup(
      React.createElement(PatientChartModal, {
        visible: true,
        patient: mockPatient,
        patientChart: dentalChartData,
        preferredLayout: 'split',
        activeTab: 'dental',
        focusToothNumber: 16,
        onClose: () => {},
      })
    );

    expect(markup).toContain('aria-label="Clinical Workstation for Maria DB"');
    expect(markup).toContain('Dental Chart');
    expect(markup).toContain('Tooth #16');
    expect(markup).toContain('Upper Right First Molar');
    expect(markup).toContain('Decayed');
  });

  test('24. In-app navigation deep link with preferredLayout="drawer", activeTab="dental", and child tooth focusToothNumber={54}', () => {
    const dentalChartData: PatientChart = {
      ...mockChart,
      dentalTeeth: [
        {
          id: 'dt-child',
          tenantId: 'tenant-ustp',
          clinicId: 'clinic-1',
          patientId: 'pat-001',
          toothNumber: 54,
          status: 'Healthy',
          surface: '',
          notes: '',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        },
      ],
    };

    const markup = renderToStaticMarkup(
      React.createElement(PatientChartModal, {
        visible: true,
        patient: mockPatient,
        patientChart: dentalChartData,
        preferredLayout: 'drawer',
        activeTab: 'dental',
        focusToothNumber: 54,
        onClose: () => {},
      })
    );

    expect(markup).toContain('aria-label="Medical Chart Drawer for Maria DB"');
    expect(markup).toContain('Dental Chart');
    expect(markup).toContain('Tooth #54');
    expect(markup).toContain('Upper Right Primary First Molar');
    expect(markup).toContain('Q5 • Upper Right');
  });

  test('25. PatientChartModal auto-resolves dental tab and includes DENTAL_CHART_TAB when focusToothNumber is provided without explicit activeTab', () => {
    const dentalChartData: PatientChart = {
      ...mockChart,
      dentalTeeth: [
        {
          id: 'dt-1',
          tenantId: 'tenant-ustp',
          clinicId: 'clinic-1',
          patientId: 'pat-001',
          toothNumber: 16,
          status: 'Decayed',
          surface: 'MOD',
          notes: 'Deep occlusal decay',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        },
      ],
    };

    const markup = renderToStaticMarkup(
      React.createElement(PatientChartModal, {
        visible: true,
        patient: mockPatient,
        patientChart: dentalChartData,
        focusToothNumber: 16,
        onClose: () => {},
      })
    );

    expect(markup).toContain('Odontogram Visualizer');
    expect(markup).toContain('Dental Chart');
    expect(markup).toContain('Tooth #16');
    expect(markup).toContain('Upper Right First Molar');
  });

  test('26. PatientChartModal renders spinning refresh buttons when loadingChart is true', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PatientChartModal, {
        visible: true,
        patient: mockPatient,
        patientChart: mockChart,
        loadingChart: true,
        onClose: () => {},
        onRefreshChart: () => {},
      })
    );

    // Refresh buttons have refresh icon and image role for spinning glyph
    expect(markup).toContain('aria-label="Refresh patient chart"');
    expect(markup).toContain('lucide-refresh-cw');
    expect(markup).toContain('role="image"');
  });
});
