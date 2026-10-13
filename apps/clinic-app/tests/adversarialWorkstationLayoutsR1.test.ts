// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { theme } from '../constants/theme';

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
const { default: StatutoryImmunizationsTab } = await import('../components/chart/StatutoryImmunizationsTab');
import type { ClinicPatient, PatientChart } from '../services/clinicService';

describe('Adversarial Medical Chart Workstation Layouts Refinement (Round 1)', () => {
  const mockPatient: ClinicPatient = {
    id: 'pat-r1-001',
    clinicId: 'clinic-1',
    tenantId: 'tenant-ustp',
    patientCode: 'PAT-2026-99123',
    fullName: 'Maria Dela Cruz',
    firstName: 'Maria',
    lastName: 'Dela Cruz',
    dateOfBirth: '1995-04-12',
    age: 31,
    gender: 'Female',
    civilStatus: 'Married',
    contactNumber: '09179998888',
    verificationStatus: 'Verified',
    bloodType: 'A+',
    philHealthNumber: '12-345678901-2',
    allergies: 'Penicillin',
    chronicConditions: 'Asthma',
    totalVisits: 3,
    createdAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: '2026-01-01T00:00:00Z',
  };

  const mockChart: PatientChart = {
    patientId: 'pat-r1-001',
    patientName: 'Maria Dela Cruz',
    totalVisits: 3,
    demographics: {
      patientId: 'pat-r1-001',
      patientCode: 'PAT-2026-99123',
      patientName: 'Maria Dela Cruz',
      dateOfBirth: '1995-04-12',
      age: 31,
      gender: 'Female',
      bloodType: 'A+',
      verificationStatus: 'Verified',
      contactNumber: '09179998888',
    },
    vitalsHistory: [
      {
        id: 'vit-1',
        patientId: 'pat-r1-001',
        consultationId: 'c-1',
        systolicBp: 118,
        diastolicBp: 78,
        heartRateBpm: 68,
        respiratoryRateBreathsPerMin: 16,
        temperatureCelsius: 36.5,
        oxygenSaturationPercent: 99,
        recordedAt: '2026-10-12T08:00:00Z',
      },
    ],
    consultations: [
      {
        id: 'c-1',
        clinicId: 'clinic-1',
        patientId: 'pat-r1-001',
        consultationDate: '2026-10-12',
        encounterDate: '2026-10-12T08:00:00Z',
        doctorName: 'Dr. Jane Doe',
        doctorPrcLicense: '0123456',
        isSigned: true,
        isYakapEligible: true,
        subjectiveComplaints: 'Follow-up for asthma',
        diagnoses: [{ icd10Code: 'J45.909', description: 'Unspecified asthma' }],
        prescriptions: [{ genericName: 'Salbutamol', dosage: '100mcg', form: 'Inhaler', quantity: 1, sig: '2 puffs prn' }],
      },
    ],
    labOrdersHistory: [],
    proceduresHistory: [],
    immunizations: [],
    attachments: [],
  };

  // =========================================================================
  // REQUIREMENT R1: DECOUPLED LAYOUT PERSISTENCE ACROSS 7 TABS
  // =========================================================================
  describe('R1: Layout Persistence & Tab Decoupling State Machine', () => {
    test('ADV-R1-1: Decoupled transition ref state machine correctly preserves active layout across tab transitions', () => {
      // Simulate the exact state machine implemented in PatientChartModal
      class ChartModalStateMachine {
        visible: boolean = false;
        configuredLayout: 'modal' | 'split' | 'drawer' = 'modal';
        activeLayout: 'modal' | 'split' | 'drawer' = 'modal';
        internalTab: string = 'summary';
        activeTabProp?: string;
        layoutVisibleRef: boolean = false;
        tabVisibleRef: boolean = false;
        prevConfiguredLayoutRef: 'modal' | 'split' | 'drawer' = 'modal';

        openModal(initialTab = 'summary', preferredLayout: 'modal' | 'split' | 'drawer' = 'modal') {
          this.visible = true;
          this.configuredLayout = preferredLayout;
          this.prevConfiguredLayoutRef = preferredLayout;
          this.activeLayout = preferredLayout;
          this.internalTab = initialTab;
          this.executeLayoutEffect();
          this.executeTabEffect(initialTab);
        }

        closeModal() {
          this.visible = false;
          this.executeLayoutEffect();
          this.executeTabEffect();
        }

        switchLayout(layout: 'modal' | 'split' | 'drawer') {
          this.activeLayout = layout;
        }

        switchTab(tab: string) {
          this.internalTab = tab;
          // Tab navigation must NOT reset activeLayout!
          this.executeLayoutEffect();
        }

        updateConfiguredPreference(newPref: 'modal' | 'split' | 'drawer') {
          this.configuredLayout = newPref;
          this.executeLayoutEffect();
        }

        private executeLayoutEffect() {
          const justOpened = this.visible && !this.layoutVisibleRef;
          const layoutPreferenceChanged = this.configuredLayout !== this.prevConfiguredLayoutRef;

          if (justOpened || (this.visible && layoutPreferenceChanged)) {
            this.activeLayout = this.configuredLayout;
          }

          this.layoutVisibleRef = this.visible;
          this.prevConfiguredLayoutRef = this.configuredLayout;
        }

        private executeTabEffect(initialTab = 'summary') {
          if (this.visible && !this.tabVisibleRef) {
            if (this.activeTabProp) {
              this.internalTab = this.activeTabProp;
            } else {
              this.internalTab = initialTab;
            }
          }
          this.tabVisibleRef = this.visible;
        }
      }

      const sm = new ChartModalStateMachine();

      // Step 1: Open modal with default 'modal' layout
      sm.openModal('summary', 'modal');
      expect(sm.activeLayout).toBe('modal');
      expect(sm.internalTab).toBe('summary');

      // Step 2: Clinician changes layout to 'split'
      sm.switchLayout('split');
      expect(sm.activeLayout).toBe('split');

      // Step 3: Clinician rapidly navigates across all 7 tabs
      const tabs = ['encounters', 'diagnostics', 'procedures', 'immunizations', 'profiles', 'vault', 'summary'];
      for (const tab of tabs) {
        sm.switchTab(tab);
        expect(sm.internalTab).toBe(tab);
        // CRITICAL: layout MUST remain 'split', NEVER reverting back to 'modal'!
        expect(sm.activeLayout).toBe('split');
      }

      // Step 4: Clinician changes layout to 'drawer'
      sm.switchLayout('drawer');
      expect(sm.activeLayout).toBe('drawer');

      // Step 5: Rapidly cycle through all tabs again
      for (const tab of tabs) {
        sm.switchTab(tab);
        expect(sm.internalTab).toBe(tab);
        expect(sm.activeLayout).toBe('drawer');
      }

      // Step 6: Close modal (consultation completed)
      sm.closeModal();
      expect(sm.visible).toBe(false);

      // Step 7: Open next patient modal -> should re-sync with configured layout ('modal')
      sm.openModal('summary', 'modal');
      expect(sm.visible).toBe(true);
      expect(sm.activeLayout).toBe('modal');

      // Step 8: Clinic admin updates preference to 'drawer' while modal is open
      sm.updateConfiguredPreference('drawer');
      expect(sm.activeLayout).toBe('drawer');
    });

    test('ADV-R1-2: PatientChartModal component renders correct layout when preferredLayout is passed', () => {
      // Centered Modal
      const modalMarkup = renderToStaticMarkup(
        React.createElement(PatientChartModal, {
          visible: true,
          patient: mockPatient,
          patientChart: mockChart,
          preferredLayout: 'modal',
          activeTab: 'summary',
          onClose: () => {},
        })
      );
      expect(modalMarkup).toContain('aria-label="Medical Chart for Maria Dela Cruz"');

      // Split-Pane Workstation
      const splitMarkup = renderToStaticMarkup(
        React.createElement(PatientChartModal, {
          visible: true,
          patient: mockPatient,
          patientChart: mockChart,
          preferredLayout: 'split',
          activeTab: 'summary',
          onClose: () => {},
        })
      );
      expect(splitMarkup).toContain('aria-label="Clinical Workstation for Maria Dela Cruz"');

      // Slide-Over Drawer
      const drawerMarkup = renderToStaticMarkup(
        React.createElement(PatientChartModal, {
          visible: true,
          patient: mockPatient,
          patientChart: mockChart,
          preferredLayout: 'drawer',
          activeTab: 'summary',
          onClose: () => {},
        })
      );
      expect(drawerMarkup).toContain('aria-label="Medical Chart Drawer for Maria Dela Cruz"');
    });
  });

  // =========================================================================
  // REQUIREMENT R2: RESTORE AUTHENTIC CENTERED MODAL STYLING
  // =========================================================================
  describe('R2: Authentic Centered Modal Layout Metrics & Styling', () => {
    test('ADV-R2-1: CenteredModalChartLayout styles match the exact design tokens and dimensions', () => {
      const markup = renderToStaticMarkup(
        React.createElement(CenteredModalChartLayout, {
          patient: mockPatient,
          patientChart: mockChart,
          activeTab: 'summary',
          currentLayout: 'modal',
          onTabChange: () => {},
          onClose: () => {},
          onSwitchLayout: () => {},
        })
      );

      expect(markup).toContain('Medical chart');
      expect(markup).toContain('Maria Dela Cruz');
      expect(markup).toContain('Code:');
      expect(markup).toContain('PAT-2026-99123');
      expect(markup).toContain('Verified');
      expect(markup).toContain('A+');
    });
  });

  // =========================================================================
  // REQUIREMENT R3: HARMONIZE SLIDE-OVER DRAWER & SPLIT-PANE VIEWPORTS
  // =========================================================================
  describe('R3: Harmonize Slide-Over Drawer & Split-Pane Viewports', () => {
    test('ADV-R3-1: SlideOverDrawerChartLayout renders header and workstation viewport', () => {
      const markup = renderToStaticMarkup(
        React.createElement(SlideOverDrawerChartLayout, {
          patient: mockPatient,
          patientChart: mockChart,
          activeTab: 'summary',
          currentLayout: 'drawer',
          onTabChange: () => {},
          onClose: () => {},
          onSwitchLayout: () => {},
        })
      );

      expect(markup).toContain('aria-label="Medical Chart Drawer for Maria Dela Cruz"');
      expect(markup).toContain('aria-label="Close Drawer"');
      expect(markup).toContain('Click to close &amp; return to queue');
    });

    test('ADV-R3-2: SplitPaneChartLayout renders canvas header and sidebar rail with quick footer', () => {
      const markup = renderToStaticMarkup(
        React.createElement(SplitPaneChartLayout, {
          patient: mockPatient,
          patientChart: mockChart,
          activeTab: 'summary',
          currentLayout: 'split',
          onTabChange: () => {},
          onClose: () => {},
          onSwitchLayout: () => {},
        })
      );

      expect(markup).toContain('aria-label="Clinical Workstation for Maria Dela Cruz"');
      expect(markup).toContain('CLINICAL ALERTS');
      expect(markup).toContain('CHART NAVIGATION');
      expect(markup).toContain('LATEST VITALS');
      expect(markup).toContain('BP');
      expect(markup).toContain('118/78');
      expect(markup).toContain('HR');
      expect(markup).toContain('68 bpm');
      expect(markup).toContain('Temp');
      expect(markup).toContain('36.5°C');
      expect(markup).toContain('SpO2');
      expect(markup).toContain('99%');
      expect(markup).toContain('Edit Demographics');
    });
  });

  // =========================================================================
  // REQUIREMENT R4 & R5: BUTTON LABELS & SPLIT-PANE LINE WRAPPING
  // =========================================================================
  describe('R4 & R5: Tab Padding, Button Labels & Identity Rows Polish', () => {
    test('ADV-R5-1: SplitPane stacks MRN, demographics, and PHIC into non-breaking key-value rows', () => {
      const markup = renderToStaticMarkup(
        React.createElement(SplitPaneChartLayout, {
          patient: mockPatient,
          patientChart: mockChart,
          activeTab: 'summary',
          currentLayout: 'split',
          onTabChange: () => {},
          onClose: () => {},
          onSwitchLayout: () => {},
        })
      );

      // Verify non-breaking key-value labels are distinct
      expect(markup).toContain('MRN:');
      expect(markup).toContain('PAT-2026-99123');
      expect(markup).toContain('Demographics:');
      expect(markup).toContain('PHIC:');
      expect(markup).toContain('12-345678901-2');
    });

    test('ADV-R5-2: SplitPane handles long, extreme, or missing MRN and PHIC without breaking layout', () => {
      const longMrnPatient: ClinicPatient = {
        ...mockPatient,
        patientCode: 'PAT-SPECIAL-FACILITY-2026-LONG-EXTENDED-CODE-000000001',
        philHealthNumber: undefined,
      };

      const markup = renderToStaticMarkup(
        React.createElement(SplitPaneChartLayout, {
          patient: longMrnPatient,
          patientChart: mockChart,
          activeTab: 'summary',
          currentLayout: 'split',
          onTabChange: () => {},
          onClose: () => {},
          onSwitchLayout: () => {},
        })
      );

      expect(markup).toContain('MRN:');
      expect(markup).toContain('PAT-SPECIAL-FACILITY-2026-LONG-EXTENDED-CODE-000000001');
      // PHIC should not render when undefined
      expect(markup).not.toContain('PHIC:');

      // Empty patient code fallback
      const emptyCodePatient: ClinicPatient = {
        ...mockPatient,
        patientCode: '',
        philHealthNumber: undefined,
      };

      const emptyMarkup = renderToStaticMarkup(
        React.createElement(SplitPaneChartLayout, {
          patient: emptyCodePatient,
          patientChart: mockChart,
          activeTab: 'summary',
          currentLayout: 'split',
          onTabChange: () => {},
          onClose: () => {},
          onSwitchLayout: () => {},
        })
      );

      expect(emptyMarkup).toContain('MRN:');
      expect(emptyMarkup).toContain('—');
    });

    test('ADV-R5-3: StatutoryImmunizationsTab removes literal "+ " prefix and renders clean button titles', () => {
      const markup = renderToStaticMarkup(
        React.createElement(StatutoryImmunizationsTab, {
          patient: mockPatient,
          immunizations: [],
        })
      );

      // Clean titles
      expect(markup).toContain('Administer Vaccine');
      expect(markup).toContain('Add Historical Vaccine');

      // No double plus or literal plus prefix
      expect(markup).not.toContain('+ +');
      expect(markup).not.toContain('+ Administer Vaccine');
      expect(markup).not.toContain('+ Add Historical Vaccine');
    });

    test('ADV-R4-1: Immunization documentation status banner renders when zero vaccines are recorded', () => {
      const markup = renderToStaticMarkup(
        React.createElement(StatutoryImmunizationsTab, {
          patient: mockPatient,
          immunizations: [],
        })
      );

      expect(markup).toContain('Immunization Documentation Status');
      expect(markup).toContain('No immunizations are currently documented for this patient');
      expect(markup).toContain('No immunizations recorded');
    });
  });

  // =========================================================================
  // CROSS-TAB RENDERING ACROSS ALL 7 TABS & 3 LAYOUT MODES
  // =========================================================================
  describe('Full Cross-Tab & Layout Matrix Verification', () => {
    const layouts: ('modal' | 'split' | 'drawer')[] = ['modal', 'split', 'drawer'];
    const tabs: any[] = ['summary', 'encounters', 'diagnostics', 'procedures', 'immunizations', 'profiles', 'vault'];

    for (const layout of layouts) {
      for (const tab of tabs) {
        test(`Cross-Tab Matrix: layout="${layout}" activeTab="${tab}" renders cleanly without crash`, () => {
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
          expect(markup).not.toContain('+ +');

          if (layout === 'split') {
            expect(markup).toContain('aria-label="Clinical Workstation for Maria Dela Cruz"');
          } else if (layout === 'drawer') {
            expect(markup).toContain('aria-label="Medical Chart Drawer for Maria Dela Cruz"');
          } else {
            expect(markup).toContain('aria-label="Medical Chart for Maria Dela Cruz"');
          }
        });
      }
    }
  });

  // =========================================================================
  // NULL & BOUNDARY SAFETY
  // =========================================================================
  describe('Boundary & Graceful Degradation', () => {
    test('ADV-BOUND-1: PatientChartModal renders with null patient without crashing', () => {
      const layouts: ('modal' | 'split' | 'drawer')[] = ['modal', 'split', 'drawer'];
      for (const layout of layouts) {
        const markup = renderToStaticMarkup(
          React.createElement(PatientChartModal, {
            visible: true,
            patient: null,
            patientChart: null,
            preferredLayout: layout,
            activeTab: 'summary',
            onClose: () => {},
          })
        );

        expect(markup.length).toBeGreaterThan(0);
        if (layout === 'split') {
          expect(markup).toContain('aria-label="Clinical Workstation for Patient"');
        } else if (layout === 'drawer') {
          expect(markup).toContain('aria-label="Medical Chart Drawer for Patient"');
        } else {
          expect(markup).toContain('aria-label="Medical Chart for Patient"');
        }
      }
    });

    test('ADV-BOUND-2: PatientChartModal returns null when visible is false', () => {
      const markup = renderToStaticMarkup(
        React.createElement(PatientChartModal, {
          visible: false,
          patient: mockPatient,
          patientChart: mockChart,
          onClose: () => {},
        })
      );

      expect(markup).toBe('');
    });
  });
});
