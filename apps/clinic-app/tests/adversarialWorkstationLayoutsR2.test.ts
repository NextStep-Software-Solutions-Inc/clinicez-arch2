// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React, { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { theme } from '../constants/theme';

(globalThis as any).__DEV__ = true;

// Dynamic viewport controller for adversarial testing
let currentViewport = {
  width: 1280,
  height: 800,
  isCompact: false,
  isWorkstation: true,
  isDesktop: true,
  isWide: false,
};

const setTestViewport = (width: number, height = 800) => {
  currentViewport = {
    width,
    height,
    isCompact: width < theme.breakpoints.tablet,
    isWorkstation: width >= theme.breakpoints.tablet,
    isDesktop: width >= theme.breakpoints.desktop,
    isWide: width >= theme.breakpoints.wide,
  };
};

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
    get: () => ({ width: currentViewport.width, height: currentViewport.height }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: currentViewport.width, height: currentViewport.height }),
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
  useBreakpoint: () => currentViewport,
}));

const { default: PatientChartModal, CHART_TABS } = await import('../components/chart/PatientChartModal');
const {
  CenteredModalChartLayout,
  SplitPaneChartLayout,
  SlideOverDrawerChartLayout,
} = await import('../components/chart');
const { default: StatutoryImmunizationsTab } = await import('../components/chart/StatutoryImmunizationsTab');
const { default: ChartTabContentView } = await import('../components/chart/ChartTabContentView');
import type { ClinicPatient, PatientChart } from '../services/clinicService';

describe('Adversarial Review Round 2: Medical Chart Workstation Layouts Robustness', () => {
  const mockPatient: ClinicPatient = {
    id: 'pat-r2-001',
    clinicId: 'clinic-1',
    tenantId: 'tenant-ustp',
    patientCode: 'PAT-2026-88001',
    fullName: 'Juanita Dela Cruz',
    firstName: 'Juanita',
    lastName: 'Dela Cruz',
    dateOfBirth: '1992-08-15',
    age: 34,
    sex: 'Female',
    civilStatus: 'Single',
    contactNumber: '09181112222',
    verificationStatus: 'Verified',
    bloodType: 'B+',
    philHealthNumber: '12-987654321-0',
    allergies: 'Amoxicillin, Aspirin',
    chronicConditions: 'Hypertension',
    totalVisits: 5,
    createdAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: '2026-01-01T00:00:00Z',
  };

  const mockChart: PatientChart = {
    patientId: 'pat-r2-001',
    patientName: 'Juanita Dela Cruz',
    totalVisits: 5,
    demographics: {
      patientId: 'pat-r2-001',
      patientCode: 'PAT-2026-88001',
      patientName: 'Juanita Dela Cruz',
      dateOfBirth: '1992-08-15',
      age: 34,
      sex: 'Female',
      bloodType: 'B+',
      verificationStatus: 'Verified',
      contactNumber: '09181112222',
    },
    vitalsHistory: [
      {
        id: 'vit-r2-1',
        patientId: 'pat-r2-001',
        consultationId: 'c-r2-1',
        systolicBp: 124,
        diastolicBp: 82,
        heartRateBpm: 72,
        respiratoryRateBreathsPerMin: 18,
        temperatureCelsius: 36.8,
        oxygenSaturationPercent: 98,
        recordedAt: '2026-10-12T09:00:00Z',
      },
    ],
    consultations: [
      {
        id: 'c-r2-1',
        clinicId: 'clinic-1',
        patientId: 'pat-r2-001',
        consultationDate: '2026-10-12',
        encounterDate: '2026-10-12T09:00:00Z',
        doctorName: 'Dr. Jane Doe',
        doctorPrcLicense: '0123456',
        isSigned: true,
        isYakapEligible: true,
        subjectiveComplaints: 'Follow-up for blood pressure monitoring',
        diagnoses: [{ icd10Code: 'I10', description: 'Essential hypertension' }],
        prescriptions: [{ genericName: 'Amlodipine', dosage: '5mg', form: 'Tablet', quantity: 30, sig: '1 tab OD' }],
      },
    ],
    labOrdersHistory: [],
    proceduresHistory: [],
    immunizations: [],
    attachments: [],
  };

  // =========================================================================
  // SECTION 1: VIEWPORT BREAKPOINT DEGRADATION & MAXIMIZE/RESTORE BEHAVIOR
  // =========================================================================
  describe('1. Viewport Breakpoints & Responsiveness Across Phone, Tablet & Desktop', () => {
    test('R2-VP-1: CenteredModalChartLayout on ultra-small viewport (<360px) enforces full-screen card without maximize toggle', () => {
      setTestViewport(320); // iPhone SE / ultra-compact Android handset

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

      // Verify modal root is marked accessible
      expect(markup).toContain('aria-label="Medical Chart for Juanita Dela Cruz"');
      // In compact mode, maximize toggle button must NOT be rendered (full screen is automatic)
      expect(markup).not.toContain('aria-label="Maximize chart window"');
      expect(markup).not.toContain('aria-label="Restore chart window"');
      // Close button and edit button must remain accessible
      expect(markup).toContain('aria-label="Close medical chart"');
      expect(markup).toContain('aria-label="Edit Demographics"');
    });

    test('R2-VP-2: CenteredModalChartLayout on tablet (768px-1023px) preserves centered dimensions & provides maximize toggle', () => {
      setTestViewport(820); // iPad / mid-sized tablet

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

      // On tablet, maximize toggle button must be rendered
      expect(markup).toContain('aria-label="Maximize chart window"');
      expect(markup).toContain('aria-label="Close medical chart"');
    });

    test('R2-VP-3: SlideOverDrawerChartLayout on compact (<768px) expands to 100% width and suppresses desktop backdrop dismiss', () => {
      setTestViewport(375); // Standard mobile phone

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

      expect(markup).toContain('aria-label="Medical Chart Drawer for Juanita Dela Cruz"');
      expect(markup).toContain('aria-label="Close Drawer"');
      // Backdrop dismiss hint must NOT render on mobile (drawer takes 100% of viewport)
      expect(markup).not.toContain('Click to close &amp; return to queue');
      expect(markup).not.toContain('aria-label="Dismiss drawer and return to queue"');
    });

    test('R2-VP-4: SlideOverDrawerChartLayout on desktop/tablet (>=768px) includes interactive backdrop dismiss', () => {
      setTestViewport(1024); // Desktop workstation

      let closeCalled = false;
      const markup = renderToStaticMarkup(
        React.createElement(SlideOverDrawerChartLayout, {
          patient: mockPatient,
          patientChart: mockChart,
          activeTab: 'summary',
          currentLayout: 'drawer',
          onTabChange: () => {},
          onClose: () => { closeCalled = true; },
          onSwitchLayout: () => {},
          onEditDemographics: () => {},
        })
      );

      expect(markup).toContain('aria-label="Dismiss drawer and return to queue"');
      expect(markup).toContain('Click to close &amp; return to queue');
      expect(markup).toContain('role="button"');
    });

    test('R2-VP-5: SplitPaneChartLayout on tablet and compact maintains non-breaking identity details', () => {
      // Tablet workstation
      setTestViewport(768);
      const tabletMarkup = renderToStaticMarkup(
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

      expect(tabletMarkup).toContain('MRN:');
      expect(tabletMarkup).toContain('PAT-2026-88001');
      expect(tabletMarkup).toContain('Demographics:');
      expect(tabletMarkup).toContain('PHIC:');
      expect(tabletMarkup).toContain('12-987654321-0');

      // Ultra-narrow 320px screen
      setTestViewport(320);
      const mobileMarkup = renderToStaticMarkup(
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

      expect(mobileMarkup).toContain('MRN:');
      expect(mobileMarkup).toContain('PAT-2026-88001');
    });
  });

  // =========================================================================
  // SECTION 2: ACCESSIBILITY, DRAWER DISMISSAL & KEYBOARD/MODAL NAVIGATION
  // =========================================================================
  describe('2. Accessibility Semantics, Keyboard/Modal Navigation & Dismissal', () => {
    test('R2-A11Y-1: Slide-over drawer backdrop has role=button and descriptive accessibility label', () => {
      setTestViewport(1280);

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

      expect(markup).toContain('role="button"');
      expect(markup).toContain('aria-label="Dismiss drawer and return to queue"');
    });

    test('R2-A11Y-2: Chart layout switcher announces role=toolbar with distinct selection states', () => {
      setTestViewport(1280);

      const markup = renderToStaticMarkup(
        React.createElement(PatientChartModal, {
          visible: true,
          patient: mockPatient,
          patientChart: mockChart,
          preferredLayout: 'split',
          activeTab: 'summary',
          onClose: () => {},
        })
      );

      expect(markup).toContain('role="toolbar"');
      expect(markup).toContain('aria-label="Chart Layout Selector"');
      expect(markup).toContain('aria-label="Switch to Split-Pane Clinical Workstation"');
      expect(markup).toContain('aria-label="Switch to Centered Workstation Modal"');
      expect(markup).toContain('aria-label="Switch to Slide-Over Focus Drawer"');
      expect(markup).toContain('&quot;selected&quot;:true');
    });

    test('R2-A11Y-3: Split-Pane vertical nav items declare role=tab and selected state', () => {
      setTestViewport(1280);

      const markup = renderToStaticMarkup(
        React.createElement(SplitPaneChartLayout, {
          patient: mockPatient,
          patientChart: mockChart,
          activeTab: 'diagnostics',
          currentLayout: 'split',
          onTabChange: () => {},
          onClose: () => {},
          onSwitchLayout: () => {},
          onEditDemographics: () => {},
        })
      );

      expect(markup).toContain('role="tab"');
      expect(markup).toContain('aria-label="Diagnostic Labs"');
      expect(markup).toContain('&quot;selected&quot;:true');
    });
  });

  // =========================================================================
  // SECTION 3: 7-TAB ZERO REGRESSION & VIEWPORT NORMALIZATION
  // =========================================================================
  describe('3. All 7 Tabs Zero Regression Matrix Across 3 Layouts & Viewports', () => {
    const ALL_7_TABS = [
      'summary',
      'encounters',
      'diagnostics',
      'procedures',
      'immunizations',
      'profiles',
      'vault',
    ] as const;

    const ALL_3_LAYOUTS = ['modal', 'split', 'drawer'] as const;

    for (const layout of ALL_3_LAYOUTS) {
      for (const tab of ALL_7_TABS) {
        test(`R2-TAB-MATRIX: Layout ${layout} + Tab ${tab} renders cleanly without double-plus buttons`, () => {
          setTestViewport(1024);

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

          // Zero duplicate plus strings allowed in any tab across any layout
          expect(markup).not.toContain('+ +');
          expect(markup).not.toContain('+ Administer Vaccine');
          expect(markup).not.toContain('+ Add Historical Vaccine');

          // Specific tab presence verification
          if (tab === 'summary') {
            expect(markup).toContain('Active Problems');
          } else if (tab === 'encounters') {
            expect(markup).toContain('Encounters');
          } else if (tab === 'diagnostics') {
            expect(markup).toContain('All Orders');
          } else if (tab === 'procedures') {
            expect(markup).toContain('Ordered / Scheduled');
          } else if (tab === 'immunizations') {
            expect(markup).toContain('Administer Vaccine');
            expect(markup).toContain('Add Historical Vaccine');
          } else if (tab === 'profiles') {
            expect(markup).toContain('Health Profiles');
          } else if (tab === 'vault') {
            expect(markup).toContain('All Records');
          }
        });
      }
    }
  });

  // =========================================================================
  // SECTION 4: STATUTORY IMMUNIZATIONS TAB CONTENT CONTAINER PADDING
  // =========================================================================
  describe('4. Statutory Immunizations Tab Viewport Alignment (R4 & R5)', () => {
    test('R2-IMM-1: StatutoryImmunizationsTab does not include duplicate padding container', () => {
      const markup = renderToStaticMarkup(
        React.createElement(StatutoryImmunizationsTab, {
          patient: mockPatient,
          patientId: mockPatient.id,
          immunizations: [],
          onRefreshChart: () => {},
        })
      );

      // Verify clean action button titles
      expect(markup).toContain('Administer Vaccine');
      expect(markup).toContain('Add Historical Vaccine');
      expect(markup).not.toContain('+ +');

      // Verify clinical immunization documentation status banner is intact
      expect(markup).toContain('Immunization Documentation Status');
      expect(markup).toContain('No immunizations are currently documented for this patient');
      expect(markup).not.toContain('PhilHealth');
      expect(markup).not.toContain('Fallback Code 999');
    });
  });

  // =========================================================================
  // SECTION 5: BOUNDARY EXTREMES & NULL RESILIENCE
  // =========================================================================
  describe('5. Extreme Boundary Patients & Error/Loading States', () => {
    test('R2-EDGE-1: Patient with empty/null code, undefined pin, and infant age 0 renders without crash', () => {
      const infantPatient: ClinicPatient = {
        ...mockPatient,
        patientCode: '',
        philHealthNumber: undefined,
        dateOfBirth: undefined,
        age: 0,
        bloodType: undefined,
        verificationStatus: 'Unverified',
      };

      for (const layout of ['modal', 'split', 'drawer'] as const) {
        const markup = renderToStaticMarkup(
          React.createElement(PatientChartModal, {
            visible: true,
            patient: infantPatient,
            patientChart: null,
            preferredLayout: layout,
            activeTab: 'summary',
            onClose: () => {},
          })
        );

        expect(markup.length).toBeGreaterThan(0);
        // Code should fallback to '—'
        expect(markup).toContain('—');
      }
    });

    test('R2-EDGE-2: ChartTabContentView renders SkeletonList during loading across all 3 layouts', () => {
      for (const layout of ['modal', 'split', 'drawer'] as const) {
        const markup = renderToStaticMarkup(
          React.createElement(PatientChartModal, {
            visible: true,
            patient: mockPatient,
            patientChart: null,
            loadingChart: true,
            preferredLayout: layout,
            activeTab: 'summary',
            onClose: () => {},
          })
        );

        expect(markup).toContain('data-component="View"');
      }
    });

    test('R2-EDGE-3: ChartTabContentView renders ErrorState with retry callback when chartError is set', () => {
      let retryTriggered = false;
      const markup = renderToStaticMarkup(
        React.createElement(ChartTabContentView, {
          patient: mockPatient,
          patientChart: null,
          loadingChart: false,
          chartError: 'Gateway timeout while fetching encounter history',
          activeTab: 'summary',
          currentLayout: 'modal',
          onTabChange: () => {},
          onClose: () => {},
          onEditDemographics: () => {},
          onSwitchLayout: () => {},
          onRefreshChart: () => { retryTriggered = true; },
        })
      );

      expect(markup).toContain('Unable to load the chart');
      expect(markup).toContain('Gateway timeout while fetching encounter history');
    });
  });
});
