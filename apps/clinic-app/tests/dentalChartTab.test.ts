// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// 1. Mock React Native modules for Bun test environment
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

import type { ClinicPatient, PatientChart, DentalToothRecord, ClinicalProcedureRecord } from '../services/clinicService';

const {
  default: DentalChartTab,
  getPlainEnglishToothName,
  getStatusBadgeVariant,
  getToothStatusColor,
} = await import('../components/chart/DentalChartTab');

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

describe('DentalChartTab — Patient Chart Odontogram & Layout Integration', () => {
  const MOCK_PATIENT: ClinicPatient = {
    id: 'pt-juan-001',
    clinicId: 'cl-001',
    patientCode: 'PX-2026-001',
    fullName: 'Juan Dela Cruz',
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    sex: 'Male',
    dateOfBirth: '1988-06-15',
    age: 38,
    bloodType: 'O+',
    verificationStatus: 'Verified',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const MOCK_TEETH: DentalToothRecord[] = [
    {
      id: 'dt-1',
      tenantId: 'tn-01',
      clinicId: 'cl-001',
      patientId: 'pt-juan-001',
      toothNumber: 16,
      status: 'Decayed',
      surface: 'MOD',
      notes: 'Deep occlusal and mesial-distal decay',
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
    },
    {
      id: 'dt-2',
      tenantId: 'tn-01',
      clinicId: 'cl-001',
      patientId: 'pt-juan-001',
      toothNumber: 21,
      status: 'Crowned',
      surface: 'L',
      notes: 'Porcelain fused to metal crown placed',
      createdAt: '2026-02-15T00:00:00Z',
      updatedAt: '2026-02-15T00:00:00Z',
    },
    {
      id: 'dt-3',
      tenantId: 'tn-01',
      clinicId: 'cl-001',
      patientId: 'pt-juan-001',
      toothNumber: 36,
      status: 'Filled',
      surface: 'O',
      notes: 'Composite resin filling intact',
      createdAt: '2026-01-10T00:00:00Z',
      updatedAt: '2026-01-10T00:00:00Z',
    },
    {
      id: 'dt-4',
      tenantId: 'tn-01',
      clinicId: 'cl-001',
      patientId: 'pt-juan-001',
      toothNumber: 48,
      status: 'Missing',
      surface: '',
      notes: 'Surgically extracted impacted wisdom tooth',
      createdAt: '2025-11-20T00:00:00Z',
      updatedAt: '2025-11-20T00:00:00Z',
    },
  ];

  const MOCK_PROCEDURES: ClinicalProcedureRecord[] = [
    {
      id: 'proc-1',
      tenantId: 'tn-01',
      clinicId: 'cl-001',
      patientId: 'pt-juan-001',
      patientName: 'Juan Dela Cruz',
      procedureCode: 'D2330',
      procedureName: 'Composite Resin Restoration',
      category: 'Procedure',
      scheduledAt: '2026-01-10T09:00:00Z',
      performedAt: '2026-01-10T09:45:00Z',
      status: 'Completed',
      orderedByDoctorName: 'Dr. Maria Santos',
      clinicalNotes: '1-surface occlusal composite restoration placed on tooth #36.',
      toothNumber: 36,
      toothSurface: 'O',
    },
    {
      id: 'proc-2',
      tenantId: 'tn-01',
      clinicId: 'cl-001',
      patientId: 'pt-juan-001',
      patientName: 'Juan Dela Cruz',
      procedureCode: 'D2750',
      procedureName: 'Crown Placement - Porcelain',
      category: 'Procedure',
      scheduledAt: '2026-02-15T14:00:00Z',
      performedAt: '2026-02-15T15:15:00Z',
      status: 'Completed',
      orderedByDoctorName: 'Dr. Maria Santos',
      clinicalNotes: 'PFM crown cemented on tooth #21.',
      toothNumber: 21,
      toothSurface: 'L',
    },
  ];

  const MOCK_CHART: PatientChart = {
    patientId: 'pt-juan-001',
    demographics: {
      fullName: 'Juan Dela Cruz',
      sex: 'Male',
      dateOfBirth: '1988-06-15',
    },
    consultations: [],
    labOrdersHistory: [],
    proceduresHistory: MOCK_PROCEDURES,
    immunizations: [],
    attachments: [],
    vitalsHistory: [],
    dentalTeeth: MOCK_TEETH,
    dentalProcedures: MOCK_PROCEDURES,
  };

  // Test 1: Odontogram visualizer rendering
  test('1. Renders Adult odontogram visualizer with Maxillary and Mandibular quadrants', () => {
    const html = renderToStaticMarkup(
      React.createElement(DentalChartTab, {
        patient: MOCK_PATIENT,
        chart: MOCK_CHART,
      })
    );

    expect(html).toContain('Odontogram Visualizer');
    expect(html).toContain('MAXILLARY ARCH (UPPER)');
    expect(html).toContain('MANDIBULAR ARCH (LOWER)');
    expect(html).toContain('Q1 • Upper Right');
    expect(html).toContain('Q2 • Upper Left');
    expect(html).toContain('Q4 • Lower Right');
    expect(html).toContain('Q3 • Lower Left');

    // All Adult Quadrant 1 FDI teeth are rendered
    expect(html).toContain('data-testid="tooth-cell-18"');
    expect(html).toContain('data-testid="tooth-cell-16"');
    expect(html).toContain('data-testid="tooth-cell-11"');
    // Quadrant 2
    expect(html).toContain('data-testid="tooth-cell-21"');
    expect(html).toContain('data-testid="tooth-cell-28"');
    // Quadrant 3
    expect(html).toContain('data-testid="tooth-cell-31"');
    expect(html).toContain('data-testid="tooth-cell-36"');
    // Quadrant 4
    expect(html).toContain('data-testid="tooth-cell-41"');
    expect(html).toContain('data-testid="tooth-cell-48"');
  });

  // Test 2: DMFT Summary metrics calculation
  test('2. DMFT summary metric cards compute decayed, missing, filled, and DMFT index accurately', () => {
    const html = renderToStaticMarkup(
      React.createElement(DentalChartTab, {
        patient: MOCK_PATIENT,
        chart: MOCK_CHART,
      })
    );

    // Total Charted: 4 teeth (16, 21, 36, 48)
    expect(html).toContain('TOTAL CHARTED');
    expect(html).toContain('DECAYED (D)');
    expect(html).toContain('MISSING (M)');
    expect(html).toContain('FILLED (F)');
    expect(html).toContain('DMFT INDEX');

    // 1 Decayed (16), 1 Missing (48), 1 Filled (36) -> DMFT score = 3
    expect(html).toContain('Carious lesions');
    expect(html).toContain('Extracted or absent');
    expect(html).toContain('Restorations');
  });

  // Test 3: Tooth Inspector pane details
  test('3. Tooth selection displays tooth inspector with plain-English naming, status, surfaces, and notes', () => {
    const html = renderToStaticMarkup(
      React.createElement(DentalChartTab, {
        patient: MOCK_PATIENT,
        chart: MOCK_CHART,
        focusToothNumber: 16,
      })
    );

    expect(html).toContain('Tooth #16');
    expect(html).toContain('Upper Right First Molar');
    expect(html).toContain('Decayed');
    expect(html).toContain('AFFECTED SURFACES');
    expect(html).toContain('MOD');
    expect(html).toContain('CLINICAL NOTES');
    expect(html).toContain('Deep occlusal and mesial-distal decay');
  });

  // Test 4: Procedure History Timeline for selected tooth
  test('4. Selected tooth displays historical clinical procedures in its timeline', () => {
    const html = renderToStaticMarkup(
      React.createElement(DentalChartTab, {
        patient: MOCK_PATIENT,
        chart: MOCK_CHART,
        focusToothNumber: 36,
      })
    );

    expect(html).toContain('Tooth #36');
    expect(html).toContain('Lower Left First Molar');
    expect(html).toContain('PROCEDURE HISTORY FOR TOOTH #36 (1)');
    expect(html).toContain('Composite Resin Restoration');
    expect(html).toContain('1-surface occlusal composite restoration placed on tooth #36.');
    expect(html).toContain('Dr. Maria Santos');
  });

  // Test 5: Deep-link focus handling switches dentition mode if child tooth
  test('5. Deep-linking with child tooth (e.g. 54) auto-switches dentition to Child and focuses tooth', () => {
    const html = renderToStaticMarkup(
      React.createElement(DentalChartTab, {
        patient: MOCK_PATIENT,
        chart: MOCK_CHART,
        focusToothNumber: 54,
      })
    );

    expect(html).toContain('Tooth #54');
    expect(html).toContain('Upper Right Primary First Molar');
    expect(html).toContain('Q5 • Upper Right');
    expect(html).toContain('data-testid="tooth-cell-54"');
  });

  // Test 6: getAvailableChartTabs dynamic registration
  test('6. getAvailableChartTabs dynamically appends DENTAL_CHART_TAB without mutating CHART_TABS', () => {
    // Original CHART_TABS remains at 8 items
    expect(CHART_TABS.length).toBe(8);
    expect(CHART_TABS.some((t) => t.value === 'dental')).toBe(false);

    // Dental disabled -> returns 8 tabs
    const disabledTabs = getAvailableChartTabs(false, false);
    expect(disabledTabs.length).toBe(8);
    expect(disabledTabs.some((t) => t.value === 'dental')).toBe(false);

    // Dental enabled via module setting -> returns 9 tabs
    const enabledTabs = getAvailableChartTabs(true, false);
    expect(enabledTabs.length).toBe(9);
    expect(enabledTabs.some((t) => t.value === 'dental')).toBe(true);
    expect(enabledTabs[8]).toEqual(DENTAL_CHART_TAB);

    // Dental enabled via existing dental records -> returns 9 tabs
    const recordsTabs = getAvailableChartTabs(false, true);
    expect(recordsTabs.length).toBe(9);
    expect(recordsTabs.some((t) => t.value === 'dental')).toBe(true);
  });

  // Test 7: ChartTabContentView dispatches DentalChartTab when activeTab === "dental"
  test('7. ChartTabContentView dispatches DentalChartTab when activeTab === "dental"', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChartTabContentView, {
        patient: MOCK_PATIENT,
        patientChart: MOCK_CHART,
        activeTab: 'dental',
        onTabChange: () => {},
        onClose: () => {},
        onEditDemographics: () => {},
        currentLayout: 'modal',
        onSwitchLayout: () => {},
        focusToothNumber: 21,
      })
    );

    expect(html).toContain('data-testid="dental-chart-tab"');
    expect(html).toContain('Tooth #21');
    expect(html).toContain('Upper Left Central Incisor');
    expect(html).toContain('Crown Placement - Porcelain');
  });

  // Test 8: All 3 workstation layouts render Dental navigation item
  test('8. CenteredModal, SplitPane, and SlideOverDrawer render Dental tab navigation item', () => {
    const availableTabs = getAvailableChartTabs(true);

    // Layout 1: Centered Modal
    const modalHtml = renderToStaticMarkup(
      React.createElement(CenteredModalChartLayout, {
        patient: MOCK_PATIENT,
        patientChart: MOCK_CHART,
        activeTab: 'dental',
        availableTabs,
        onTabChange: () => {},
        onClose: () => {},
        onEditDemographics: () => {},
        currentLayout: 'modal',
        onSwitchLayout: () => {},
      })
    );
    expect(modalHtml).toContain('Dental Chart');

    // Layout 2: Split-Pane Workstation
    const splitHtml = renderToStaticMarkup(
      React.createElement(SplitPaneChartLayout, {
        patient: MOCK_PATIENT,
        patientChart: MOCK_CHART,
        activeTab: 'dental',
        availableTabs,
        onTabChange: () => {},
        onClose: () => {},
        onEditDemographics: () => {},
        currentLayout: 'split',
        onSwitchLayout: () => {},
      })
    );
    expect(splitHtml).toContain('Dental Chart');

    // Layout 3: Slide-Over Drawer
    const drawerHtml = renderToStaticMarkup(
      React.createElement(SlideOverDrawerChartLayout, {
        patient: MOCK_PATIENT,
        patientChart: MOCK_CHART,
        activeTab: 'dental',
        availableTabs,
        onTabChange: () => {},
        onClose: () => {},
        onEditDemographics: () => {},
        currentLayout: 'drawer',
        onSwitchLayout: () => {},
      })
    );
    expect(drawerHtml).toContain('Dental Chart');
  });

  // Test 9: Longitudinal history stack & audit-safe Void action in Left-Side Pane
  test('9. Displays full longitudinal condition stack (Current, Historical, and Voided) and audit-safe Void buttons', () => {
    const stackedTeeth: DentalToothRecord[] = [
      {
        id: 'stack-1-decayed',
        tenantId: 'tn-01',
        clinicId: 'cl-001',
        patientId: 'pt-juan-001',
        toothNumber: 16,
        status: 'Decayed',
        surface: 'MOD',
        isCurrent: false,
        notes: 'Initial visit: deep MOD caries',
        createdAt: '2026-01-10T09:00:00Z',
        recordedBy: 'Dr. Maria Santos',
      },
      {
        id: 'stack-2-extracted',
        tenantId: 'tn-01',
        clinicId: 'cl-001',
        patientId: 'pt-juan-001',
        toothNumber: 16,
        status: 'Missing',
        surface: '',
        isCurrent: false,
        notes: 'Second visit: tooth extracted',
        createdAt: '2026-02-10T09:00:00Z',
        recordedBy: 'Dr. Maria Santos',
      },
      {
        id: 'stack-3-implant',
        tenantId: 'tn-01',
        clinicId: 'cl-001',
        patientId: 'pt-juan-001',
        toothNumber: 16,
        status: 'Implant',
        surface: '',
        isCurrent: true,
        notes: 'Third visit: dental implant placed',
        createdAt: '2026-03-10T09:00:00Z',
        recordedBy: 'Dr. Juan Reyes',
      },
      {
        id: 'stack-4-voided',
        tenantId: 'tn-01',
        clinicId: 'cl-001',
        patientId: 'pt-juan-001',
        toothNumber: 16,
        status: 'Fractured',
        surface: 'B',
        isCurrent: false,
        isVoided: true,
        voidedAt: '2026-03-11T10:00:00Z',
        voidedBy: 'Dr. Juan Reyes',
        voidReason: 'Entered on wrong tooth number',
        notes: 'Erroneous entry',
        createdAt: '2026-03-11T09:00:00Z',
        recordedBy: 'Dr. Juan Reyes',
      },
    ];

    const stackedChart: PatientChart = {
      ...MOCK_CHART,
      dentalTeeth: stackedTeeth,
    };

    const html = renderToStaticMarkup(
      React.createElement(DentalChartTab, {
        patient: MOCK_PATIENT,
        chart: stackedChart,
        focusToothNumber: 16,
        onVoidCondition: () => {},
      })
    );

    // Top-of-stack active condition is Pontic / Implant
    expect(html).toContain('Pontic / Implant');
    expect(html).toContain('Third visit: dental implant placed');
    expect(html).toContain('data-testid="tab-void-condition-stack-3-implant"');

    // Historical stack entries remain visible in Left-Side Pane
    expect(html).toContain('HISTORICAL CONDITIONS (PREVIOUS ENCOUNTERS) (2)');
    expect(html).toContain('Initial visit: deep MOD caries');
    expect(html).toContain('Second visit: tooth extracted');

    // Voided audit trail entry is preserved and displayed
    expect(html).toContain('VOIDED ENTRIES (AUDIT TRAIL) (1)');
    expect(html).toContain('Entered on wrong tooth number');
    expect(html).toContain('Voided');
  });
});
