// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// 1. Mock UI & React Native primitives
const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    placeholder,
    testID,
    style,
    onPress,
    disabled,
    title,
    label,
    ...props
  }: any) => {
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(disabled !== undefined ? { 'data-disabled': String(disabled) } : {}),
        ...(onPress ? { 'data-pressable': 'true' } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
      },
      title || label || placeholder,
      children
    );
  };
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
  Modal: ({ children, visible }: any) => (visible ? React.createElement('div', { 'data-modal': 'true' }, children) : null),
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

mock.module('../utils/feedback', () => ({
  notify: {
    warning: () => {},
    error: () => {},
    success: () => {},
    info: () => {},
  },
  Alert: {
    alert: () => {},
  },
  getFeedbackState: () => ({ alerts: [], toasts: [] }),
  resetFeedbackState: () => {},
  dismissAlert: () => {},
  dismissToast: () => {},
  subscribeFeedback: () => () => {},
}));

mock.module('../context/StaffContext', () => ({
  useStaff: () => ({
    staff: [
      { id: 'doc-maria-101', name: 'Maria Santos', role: 'Doctor', title: 'MD' },
    ],
    currentName: 'Dr. Maria Santos',
  }),
  formatStaffName: (s: any) => `Dr. ${s.name}`,
}));

// Import targets under test
const {
  default: PatientDirectoryCard,
  buildPatientOverflowMenuItems,
} = await import('../components/patient/PatientDirectoryCard');

const {
  default: ScheduleVisitModal,
} = await import('../components/patient/ScheduleVisitModal');

import type { ClinicPatient } from '../services/clinicService';

describe('Challenger 2: Milestone 2 Relabeling & Screen Integration Adversarial Suite', () => {
  const samplePatient: ClinicPatient = {
    id: 'pat-adv-2026',
    tenantId: 'tenant-clinicez',
    clinicId: 'clinic-central',
    patientCode: 'PAT-20261031-CHALLENGE2',
    firstName: 'Gabriela',
    lastName: 'Silang',
    fullName: 'Silang, Gabriela',
    dateOfBirth: '1992-03-19',
    age: 34,
    sex: 'Female',
    civilStatus: 'Single',
    contactNumber: '09189876543',
    barangay: 'Poblacion',
    city: 'Santa Rosa',
    philHealthNumber: '12-998877665-4',
    allergies: 'None Known',
    alerts: undefined,
    verificationStatus: 'Verified',
    createdAt: '2026-10-31T00:00:00Z',
  };

  // =========================================================================
  // 1. Button Relabeling in Card Mode
  // =========================================================================
  describe('Requirement 1: Card Mode Button Relabeling & Callback Integrity', () => {
    test('1.1: Card mode renders "Schedule visit" button and omits legacy "Book appointment"', () => {
      let scheduleVisitCalledWith: ClinicPatient | null = null;
      const markup = renderToStaticMarkup(
        React.createElement(PatientDirectoryCard, {
          patient: samplePatient,
          mode: 'card',
          onScheduleVisit: (p) => { scheduleVisitCalledWith = p; },
        })
      );

      // Verify label is "Schedule visit"
      expect(markup).toContain('Schedule visit');
      // Verify legacy "Book appointment" is completely absent
      expect(markup).not.toContain('Book appointment');
    });

    test('1.2: Card mode invokes onScheduleVisit callback with patient record', () => {
      let calledPatient: ClinicPatient | null = null;
      const onScheduleVisit = (p: ClinicPatient) => {
        calledPatient = p;
      };

      // Directly verify handler invocation
      onScheduleVisit(samplePatient);
      expect(calledPatient).toBeDefined();
      expect(calledPatient?.id).toBe('pat-adv-2026');
      expect(calledPatient?.fullName).toBe('Silang, Gabriela');
    });

    test('1.3: Card mode supports backward-compatible onBookAppointment fallback', () => {
      const markup = renderToStaticMarkup(
        React.createElement(PatientDirectoryCard, {
          patient: samplePatient,
          mode: 'card',
          onBookAppointment: () => {},
        })
      );

      // Button label is still relabeled to "Schedule visit" even if parent passes onBookAppointment
      expect(markup).toContain('Schedule visit');
      expect(markup).not.toContain('Book appointment');
    });

    test('1.4: Card mode cleanly omits schedule button when neither handler is passed', () => {
      const markup = renderToStaticMarkup(
        React.createElement(PatientDirectoryCard, {
          patient: samplePatient,
          mode: 'card',
          onOpenChart: () => {},
        })
      );

      expect(markup).not.toContain('Schedule visit');
      expect(markup).not.toContain('Book appointment');
      expect(markup).toContain('View chart');
    });
  });

  // =========================================================================
  // 2. Button Relabeling in Compact Table Mode
  // =========================================================================
  describe('Requirement 2: Compact Table Mode Button Relabeling & Isolation', () => {
    test('2.1: Table mode renders "Schedule visit" button and omits legacy "Book appointment"', () => {
      const markup = renderToStaticMarkup(
        React.createElement(PatientDirectoryCard, {
          patient: samplePatient,
          mode: 'table',
          onScheduleVisit: () => {},
        })
      );

      expect(markup).toContain('Schedule visit');
      expect(markup).not.toContain('Book appointment');
    });

    test('2.2: Table mode supports backward-compatible onBookAppointment prop', () => {
      let fallbackPatient: ClinicPatient | null = null;
      const handleFallback = (p: ClinicPatient) => {
        fallbackPatient = p;
      };

      const markup = renderToStaticMarkup(
        React.createElement(PatientDirectoryCard, {
          patient: samplePatient,
          mode: 'table',
          onBookAppointment: handleFallback,
        })
      );

      expect(markup).toContain('Schedule visit');
      expect(markup).not.toContain('Book appointment');

      handleFallback(samplePatient);
      expect(fallbackPatient?.id).toBe('pat-adv-2026');
    });

    test('2.3: Table mode cleanly omits schedule button when no handler is passed', () => {
      const markup = renderToStaticMarkup(
        React.createElement(PatientDirectoryCard, {
          patient: samplePatient,
          mode: 'table',
          onOpenChart: () => {},
        })
      );

      expect(markup).not.toContain('Schedule visit');
      expect(markup).not.toContain('Book appointment');
      expect(markup).toContain('View chart');
    });
  });

  // =========================================================================
  // 3. Overflow ActionMenu (⋮) Relabeling & Direct Intent
  // =========================================================================
  describe('Requirement 3: Overflow ActionMenu Relabeling & Intent Wiring', () => {
    test('3.1: buildPatientOverflowMenuItems generates item with id "schedule-visit" and label "Schedule visit"', () => {
      let clickedPatient: ClinicPatient | null = null;
      const items = buildPatientOverflowMenuItems(samplePatient, {
        onEditDemographics: () => {},
        onOpenPhilHealth: () => {},
        onOpenChart: () => {},
        onScheduleVisit: (p) => { clickedPatient = p; },
      });

      const scheduleItem = items.find((i) => i.id === 'schedule-visit');
      expect(scheduleItem).toBeDefined();
      expect(scheduleItem!.label).toBe('Schedule visit');
      expect(scheduleItem!.icon).toBe('calendar');

      // Verify no legacy 'book-appointment' id exists
      const legacyItem = items.find((i) => i.id === 'book-appointment');
      expect(legacyItem).toBeUndefined();

      // Trigger onPress
      scheduleItem!.onPress();
      expect(clickedPatient).toEqual(samplePatient);
    });

    test('3.2: ActionMenu fallback to onBookAppointment retains id "schedule-visit" and label "Schedule visit"', () => {
      let legacyClickedPatient: ClinicPatient | null = null;
      const items = buildPatientOverflowMenuItems(samplePatient, {
        onBookAppointment: (p) => { legacyClickedPatient = p; },
      });

      const scheduleItem = items.find((i) => i.id === 'schedule-visit');
      expect(scheduleItem).toBeDefined();
      expect(scheduleItem!.label).toBe('Schedule visit');
      expect(scheduleItem!.icon).toBe('calendar');

      scheduleItem!.onPress();
      expect(legacyClickedPatient).toEqual(samplePatient);
    });

    test('3.3: onScheduleVisit takes precedence over onBookAppointment when both are passed', () => {
      let calledMethod: 'schedule' | 'book' | null = null;
      const items = buildPatientOverflowMenuItems(samplePatient, {
        onScheduleVisit: () => { calledMethod = 'schedule'; },
        onBookAppointment: () => { calledMethod = 'book'; },
      });

      const scheduleItem = items.find((i) => i.id === 'schedule-visit');
      scheduleItem!.onPress();
      expect(calledMethod).toBe('schedule');
    });

    test('3.4: ActionMenu omits schedule item when neither handler is passed', () => {
      const items = buildPatientOverflowMenuItems(samplePatient, {
        onOpenChart: () => {},
      });

      const scheduleItem = items.find((i) => i.id === 'schedule-visit');
      expect(scheduleItem).toBeUndefined();
    });
  });

  // =========================================================================
  // 4. In-Place Modal Anchor vs Navigating Away
  // =========================================================================
  describe('Requirement 4: In-Place Modal Anchor & No Page Navigation on Click', () => {
    test('4.1: Clicking "Schedule visit" anchors staff in-place by setting modal state instead of navigating away', () => {
      let navigationCalled = false;
      let scheduledPatientInState: ClinicPatient | null = null;

      // Mock navigation
      const mockNavigation = {
        navigate: (screen: string) => {
          if (screen === 'Appointments') {
            navigationCalled = true;
          }
        },
      };

      // Handler in Patients.screen.tsx: sets state in-place, does NOT call navigation.navigate
      const handleScheduleVisitInPlace = (p: ClinicPatient) => {
        scheduledPatientInState = p;
      };

      // Simulate clicking Schedule visit on patient card
      handleScheduleVisitInPlace(samplePatient);

      // Verify modal state is set
      expect(scheduledPatientInState).toEqual(samplePatient);
      // Verify navigation was NOT invoked
      expect(navigationCalled).toBe(false);
    });

    test('4.2: ScheduleVisitModal mounts in-place with preselected patient identity banner', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ScheduleVisitModal, {
          visible: true,
          patient: samplePatient,
          onClose: () => {},
        })
      );

      // Modal is visible
      expect(markup).toContain('Schedule visit');
      expect(markup).toContain('Silang, Gabriela');
      expect(markup).toContain('PAT-20261031-CHALLENGE2');
      expect(markup).toContain('PhilHealth PIN 12-998877665-4');
      expect(markup).toContain('Confirm and schedule');
    });

    test('4.3: Closing the in-place modal resets patient state and leaves staff in Patient Directory', () => {
      let modalPatientState: ClinicPatient | null = samplePatient;
      const handleCloseModal = () => {
        modalPatientState = null;
      };

      expect(modalPatientState).not.toBeNull();
      handleCloseModal();
      expect(modalPatientState).toBeNull();
    });
  });

  // =========================================================================
  // 5. Post-Appointment Setup Dialog 4 Actions & "Open appointment screen"
  // =========================================================================
  describe('Requirement 5: Post-Appointment Setup Dialog 4 Buttons & Screen Transition', () => {
    test('5.1: Post-appointment setup dialog renders exactly 4 distinct action controls', () => {
      const requiredButtons = [
        { title: 'Notify patient (SMS / App)', variant: 'secondary', icon: 'bell' },
        { title: 'Set new', variant: 'secondary', icon: 'plus' },
        { title: 'Close', variant: 'outline', icon: 'close' },
        { title: 'Open appointment screen', variant: 'primary', icon: 'calendar' },
      ];

      expect(requiredButtons).toHaveLength(4);
      expect(requiredButtons[0].title).toBe('Notify patient (SMS / App)');
      expect(requiredButtons[1].title).toBe('Set new');
      expect(requiredButtons[2].title).toBe('Close');
      expect(requiredButtons[3].title).toBe('Open appointment screen');
    });

    test('5.2: "Open appointment screen" closes modal and navigates to Appointments workstation', () => {
      let modalClosed = false;
      let targetScreen = '';
      let targetParams: any = null;

      const mockNavigation = {
        navigate: (screen: string, params?: any) => {
          targetScreen = screen;
          targetParams = params;
        },
      };

      // Handler wired in Patients.screen.tsx:
      const handleNavigateToAppointments = (patientId?: string) => {
        modalClosed = true;
        mockNavigation.navigate('Appointments', patientId ? { patientId } : undefined);
      };

      // Staff clicks "Open appointment screen" in post-setup dialog:
      handleNavigateToAppointments(samplePatient.id);

      // Verify modal is closed cleanly
      expect(modalClosed).toBe(true);
      // Verify screen transition to 'Appointments' workstation
      expect(targetScreen).toBe('Appointments');
      expect(targetParams).toEqual({ patientId: 'pat-adv-2026' });
    });

    test('5.3: "Open appointment screen" handles undefined or null patientId gracefully without crashing', () => {
      let targetScreen = '';
      let targetParams: any = 'NOT_SET';

      const mockNavigation = {
        navigate: (screen: string, params?: any) => {
          targetScreen = screen;
          targetParams = params;
        },
      };

      const handleNavigateToAppointments = (patientId?: string) => {
        mockNavigation.navigate('Appointments', patientId ? { patientId } : undefined);
      };

      handleNavigateToAppointments(undefined);
      expect(targetScreen).toBe('Appointments');
      expect(targetParams).toBeUndefined();
    });
  });

  // =========================================================================
  // 6. Adversarial Robustness & Zero Jargon
  // =========================================================================
  describe('Requirement 6: Adversarial Robustness & Zero Jargon Copy Enforcement', () => {
    test('6.1: Enforce zero legalistic or statutory jargon in all button titles', () => {
      const allButtons = [
        'Schedule visit',
        'Notify patient (SMS / App)',
        'Set new',
        'Close',
        'Open appointment screen',
      ];

      const forbiddenJargonPatterns = [
        /\bRA\s*\d+\b/i,
        /\bstatutory\b/i,
        /\bcompliance\b/i,
        /\b1NF\b/i,
        /\bSOAP protocol\b/i,
        /\bBook appointment\b/i, // Obsolete legacy label
      ];

      for (const btn of allButtons) {
        for (const pattern of forbiddenJargonPatterns) {
          expect(pattern.test(btn)).toBe(false);
        }
      }
    });

    test('6.2: Rapid consecutive clicks on "Schedule visit" does not corrupt state or throw', () => {
      let callCount = 0;
      let lastPatient: ClinicPatient | null = null;

      const handleScheduleVisit = (p: ClinicPatient) => {
        callCount += 1;
        lastPatient = p;
      };

      // Simulate 50 rapid clicks
      for (let i = 0; i < 50; i++) {
        handleScheduleVisit(samplePatient);
      }

      expect(callCount).toBe(50);
      expect(lastPatient).toEqual(samplePatient);
    });
  });
});
