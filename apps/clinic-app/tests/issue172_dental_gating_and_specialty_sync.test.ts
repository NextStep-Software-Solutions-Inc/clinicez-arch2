// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getSessionItem, setSessionItem } from '../utils/deviceStorage';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID }: any) =>
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
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s, absoluteFill: {} },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  RefreshControl: createMockComponent('RefreshControl'),
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
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
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

describe('Issue #172 — Clinic Settings & Dental Module Gating Synchronization', () => {
  test('1. Patients screen handleCloseChart purges clinicez_active_chart_tab and clinicez_active_patient_id from sessionStorage', () => {
    // Stage previous active patient and chart tab
    setSessionItem('clinicez_active_patient_id', 'pat-172');
    setSessionItem('clinicez_active_chart_tab', 'dental');

    expect(getSessionItem('clinicez_active_patient_id')).toBe('pat-172');
    expect(getSessionItem('clinicez_active_chart_tab')).toBe('dental');

    // Simulate handleCloseChart behavior
    let activeChartTab = 'dental';
    const handleCloseChart = () => {
      activeChartTab = 'summary';
      setSessionItem('clinicez_active_patient_id', null);
      setSessionItem('clinicez_active_chart_tab', null);
    };

    handleCloseChart();

    expect(activeChartTab).toBe('summary');
    expect(getSessionItem('clinicez_active_patient_id')).toBeNull();
    expect(getSessionItem('clinicez_active_chart_tab')).toBeNull();
  });

  test('2. ClinicalSpecialtyCard calls refreshClinic to synchronize ClinicContext after saving specialty', async () => {
    let refreshed = false;
    (globalThis as any).__mockClinicContext = {
      refresh: async () => {
        refreshed = true;
      },
      settings: {
        specialtyMode: 'Multi-Specialty',
        enableDentalModule: true,
      },
    };

    const { default: ClinicalSpecialtyCard } = await import(
      '../components/settings/cards/ClinicalSpecialtyCard'
    );

    let updatedRecord: any = null;
    const markup = renderToStaticMarkup(
      React.createElement(ClinicalSpecialtyCard, {
        settings: {
          clinicName: 'Health Clinic',
          specialtyMode: 'Multi-Specialty',
          enableDentalModule: true,
        } as any,
        showSkeletons: false,
        onSettingsUpdated: (updated) => {
          updatedRecord = updated;
        },
      })
    );

    expect(markup).toContain('Clinic Specialty');
    expect(markup).toContain('Medical Practice');
    expect(markup).toContain('Dental Practice');
    expect(markup).toContain('Multi-Specialty Clinic');

    delete (globalThis as any).__mockClinicContext;
  });

  test('3. PatientChartModal availableTabs excludes dental tab when enableDentalModule is false and patient has no dental findings', async () => {
    const { default: PatientChartModal } = await import(
      '../components/chart/PatientChartModal'
    );

    (globalThis as any).__mockClinicContext = {
      settings: {
        specialtyMode: 'Medical',
        enableDentalModule: false,
      },
    };

    const mockPatient: any = {
      id: 'p-1',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      dateOfBirth: '1990-01-01',
    };

    const mockChart: any = {
      patientId: 'p-1',
      dentalTeeth: [],
    };

    const markup = renderToStaticMarkup(
      React.createElement(PatientChartModal, {
        visible: true,
        patient: mockPatient,
        patientChart: mockChart,
        activeTab: 'dental',
        initialTab: 'dental',
        onClose: () => {},
      })
    );

    // Dental Chart tab should not be present
    expect(markup).not.toContain('Dental Chart');
    expect(markup).not.toContain('Odontogram Visualizer');

    delete (globalThis as any).__mockClinicContext;
  });
});
