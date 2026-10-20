// token-guard:ignore-file
/**
 * Challenger 2 Empirical Stress Test Suite for Milestone 3
 * Focus: Route Parameters, Backward Compatibility, and Mock Leakage Prevention
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { theme } from '../constants/theme';
import type { ExtendedAppointmentItem } from '../components/calendar/types';
import type { AppointmentItem, ClinicPatient } from '../services/clinicService';

(globalThis as any).__DEV__ = true;

let mockWindowWidth = 1280;
let mockWindowHeight = 800;

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    placeholder,
    testID,
    visible,
    style,
    onPress,
    onClick,
    ...props
  }: any) => {
    if (name === 'Modal' && visible === false) {
      return null;
    }
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
    const clickHandler = onPress || onClick;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(visible !== undefined ? { 'data-visible': String(visible) } : {}),
        ...(clickHandler ? { 'data-pressable': 'true', onClick: clickHandler } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...props,
      },
      placeholder,
      children
    );
  };
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
    get: () => ({ width: mockWindowWidth, height: mockWindowHeight }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: mockWindowWidth, height: mockWindowHeight }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
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
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('svg'),
  Path: createMockComponent('path'),
  Circle: createMockComponent('circle'),
  Rect: createMockComponent('rect'),
  Line: createMockComponent('line'),
  default: createMockComponent('svg'),
}));

mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: () => ({
    width: mockWindowWidth,
    height: mockWindowHeight,
    isCompact: mockWindowWidth < 768,
    isWorkstation: mockWindowWidth >= 768,
    isDesktop: mockWindowWidth >= 1024,
    isWide: mockWindowWidth >= 1280,
  }),
}));

const mockToasts = {
  successes: [] as string[],
  errors: [] as string[],
  reset() {
    this.successes = [];
    this.errors = [];
  },
};

mock.module('../utils/feedback', () => ({
  notify: {
    success: (msg: string) => mockToasts.successes.push(msg),
    error: (msg: string) => mockToasts.errors.push(msg),
    info: () => {},
  },
  getFeedbackState: () => ({ alerts: [], toasts: [] }),
  subscribeFeedback: () => () => {},
  dismissAlert: () => {},
  dismissToast: () => {},
  resetFeedbackState: () => {},
  Alert: { alert: () => {} },
}));

mock.module('@utils/feedback', () => ({
  notify: {
    success: (msg: string) => mockToasts.successes.push(msg),
    error: (msg: string) => mockToasts.errors.push(msg),
    info: () => {},
  },
  getFeedbackState: () => ({ alerts: [], toasts: [] }),
  subscribeFeedback: () => () => {},
  dismissAlert: () => {},
  dismissToast: () => {},
  resetFeedbackState: () => {},
  Alert: { alert: () => {} },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

let lastNavigatedRoute: { name: string; params?: any } | null = null;
let lastSetParams: Record<string, any> | null = null;

mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: (name: string, params?: any) => {
      lastNavigatedRoute = { name, params };
    },
    setParams: (params: Record<string, any>) => {
      lastSetParams = params;
    },
  }),
  useRoute: () => ({ key: 'Appointments', name: 'Appointments', params: undefined }),
  DefaultTheme: { colors: {} },
  createStaticNavigation: () => () => null,
}));

mock.module('../components/layout', () => ({
  ResponsiveLayout: ({ headerTitle, rightAction, actions, children }: any) =>
    React.createElement(
      'div',
      { 'data-component': 'ResponsiveLayout', 'data-title': headerTitle },
      React.createElement(
        'header',
        null,
        React.createElement('h1', null, headerTitle),
        actions?.map((act: any) =>
          React.createElement(
            'button',
            { key: act.id, 'data-testid': `action-${act.id}`, onClick: act.onPress },
            act.label
          )
        )
      ),
      children
    ),
}));

const mockDoctors = [
  {
    id: 'doc-maria',
    name: 'Dr. Maria Cruz',
    fullName: 'Dr. Maria Cruz',
    firstName: 'Maria',
    lastName: 'Cruz',
    role: 'Doctor',
    isActive: true,
    assignedRoomIds: ['room-101'],
  },
  {
    id: 'doc-juan',
    name: 'Dr. Juan Reyes',
    fullName: 'Dr. Juan Reyes',
    firstName: 'Juan',
    lastName: 'Reyes',
    role: 'Doctor',
    isActive: true,
    assignedRoomIds: ['room-102'],
  },
];

mock.module('../context/StaffContext', () => ({
  useStaff: () => ({
    staff: mockDoctors,
    loading: false,
    reloadStaff: () => Promise.resolve(),
  }),
  formatStaffName: (s: any) => s?.name || s?.fullName || 'Physician',
}));

const mockRooms = [
  { id: 'room-101', name: 'Room 101 - Consultation A', type: 'Consultation', isActive: true },
  { id: 'room-102', name: 'Room 102 - Consultation B', type: 'Consultation', isActive: true },
];

mock.module('../context/ClinicContext', () => ({
  useClinic: () => ({
    clinic: { id: 'clinic-cdo', name: 'ClinicEZ CDO', timezone: 'Asia/Manila' },
    settings: {
      enableDoctorRoster: true,
      patientSearchDisplayFieldsJson: JSON.stringify(['fullName', 'patientCode', 'dateOfBirth']),
    },
    rooms: mockRooms,
  }),
}));

const sampleAppointments: ExtendedAppointmentItem[] = [
  {
    id: 'apt-route-001',
    clinicId: 'clinic-cdo',
    patientId: 'pat-cassandra',
    patientName: 'Ambray, Cassandra',
    doctorId: 'doc-maria',
    doctorName: 'Dr. Maria Cruz',
    scheduledAt: '2026-10-25T09:00:00Z',
    durationMinutes: 30,
    status: 'Confirmed',
    reason: 'Hypertension follow-up and prescription refill',
    notes: 'Prior reading 140/90',
    serviceType: 'Consultation',
    urgency: 'STAT',
    roomOrStation: 'Room 101 - Consultation A',
    roomName: 'Room 101 - Consultation A',
  },
  {
    id: 'apt-route-002',
    clinicId: 'clinic-cdo',
    patientId: 'pat-pedro',
    patientName: 'Penduko, Pedro',
    doctorId: 'doc-juan',
    doctorName: 'Dr. Juan Reyes',
    scheduledAt: '2026-10-25T14:30:00Z',
    durationMinutes: 30,
    status: 'Pending',
    reason: 'Annual physical exam',
    serviceType: 'Consultation',
    urgency: 'Routine',
    roomOrStation: 'Room 102 - Consultation B',
  },
];

let mockPatientDb: Record<string, ClinicPatient> = {
  'pat-cassandra': {
    id: 'pat-cassandra',
    tenantId: 't-1',
    clinicId: 'clinic-cdo',
    patientCode: 'PAT-20261013-3EFFEA',
    firstName: 'Cassandra',
    lastName: 'Ambray',
    fullName: 'Ambray, Cassandra',
    dateOfBirth: '1990-05-15',
    age: 36,
    gender: 'Female',
    contactNumber: '09171234567',
    verificationStatus: 'Verified',
    createdAt: '2026-01-01',
  },
  'pat-fernando': {
    id: 'pat-fernando',
    tenantId: 't-1',
    clinicId: 'clinic-cdo',
    patientCode: 'PAT-20261019-8A1B2C',
    firstName: 'Fernando',
    lastName: 'Poe',
    fullName: 'Poe, Fernando',
    dateOfBirth: '1985-11-20',
    age: 40,
    gender: 'Male',
    contactNumber: '09189876543',
    verificationStatus: 'Verified',
    createdAt: '2026-01-01',
  },
};

mock.module('../services/clinicService', () => ({
  clinicService: {
    getAppointments: (options?: any) => Promise.resolve([sampleAppointments, null]),
    getPatients: (q?: string) => Promise.resolve([Object.values(mockPatientDb), null]),
    getPatientById: (id: string) => {
      const found = mockPatientDb[id];
      if (found) return Promise.resolve([found, null]);
      return Promise.resolve([null, { status: 404, message: 'Patient not found' }]);
    },
    getCustomFields: () => Promise.resolve([[], null]),
    bookAppointment: () => Promise.resolve([sampleAppointments[0], null]),
    rescheduleAppointment: () => Promise.resolve([sampleAppointments[0], null]),
    checkInPatient: () => Promise.resolve([{ queueNumber: 'Q-100', priority: 'Routine' }, null]),
    cancelAppointment: () => Promise.resolve([true, null]),
    getDoctorAvailableSlots: () => Promise.resolve([[], null]),
  },
}));

// Load screen and exports dynamically after mocks are registered
const {
  default: AppointmentsScreen,
  buildPreselectedPatientFromRoute,
  defaultSlot,
} = await import('../navigation/screens/Appointments.screen');

describe('Challenger 2: Route Parameters & Deep-Linking Empirical Suite', () => {
  beforeEach(() => {
    mockToasts.reset();
    lastNavigatedRoute = null;
    lastSetParams = null;
  });

  // =========================================================================
  // 1. Route Parameter: patientId & patientName -> Preselect Patient Modal
  // =========================================================================
  describe('1. patientId & patientName route parameters', () => {
    test('1.1 patientId and patientName immediately open book-appointment-modal pre-filled with patient details', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: {
              patientId: 'pat-cassandra',
              patientName: 'Ambray, Cassandra',
              patientCode: 'PAT-20261013-3EFFEA',
            },
          } as any,
        })
      );

      // Verify book modal is open
      expect(markup).toContain('data-testid="book-appointment-modal"');
      expect(markup).toContain('data-testid="selected-patient-summary"');
      expect(markup).toContain('Ambray, Cassandra');
      expect(markup).toContain('PAT-20261013-3EFFEA');
      expect(markup).toContain('Appointment Date');
      expect(markup).toContain('Selected Time');
      expect(markup).toContain('Confirm and schedule');
    });

    test('1.2 buildPreselectedPatientFromRoute constructs a valid ClinicPatient contract', () => {
      const patient = buildPreselectedPatientFromRoute({
        patientId: 'pat-test',
        patientName: 'Santos, Jose',
        patientCode: 'PAT-CODE-01',
      });

      expect(patient).not.toBeNull();
      expect(patient?.id).toBe('pat-test');
      expect(patient?.fullName).toBe('Santos, Jose');
      expect(patient?.patientCode).toBe('PAT-CODE-01');
      expect(patient?.verificationStatus).toBe('Verified');
    });

    test('1.3 buildPreselectedPatientFromRoute returns null for empty or whitespace-only inputs', () => {
      expect(buildPreselectedPatientFromRoute(null)).toBeNull();
      expect(buildPreselectedPatientFromRoute(undefined)).toBeNull();
      expect(buildPreselectedPatientFromRoute({})).toBeNull();
      expect(buildPreselectedPatientFromRoute({ patientId: '   ', patientName: '   ' })).toBeNull();
      expect(buildPreselectedPatientFromRoute({ patientId: 'p-1', patientName: '' })).toBeNull();
      expect(buildPreselectedPatientFromRoute({ patientId: '', patientName: 'Name' })).toBeNull();
    });
  });

  // =========================================================================
  // 2. Route Parameter: tab: 'roster' -> DoctorRosterCalendarModal Opens
  // =========================================================================
  describe('2. tab: "roster" route parameter', () => {
    test('2.1 tab: "roster" opens DoctorRosterCalendarModal', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: {
              tab: 'roster',
            },
          } as any,
        })
      );

      // Verify Doctor Roster modal is open and rendered
      expect(markup).toContain('Doctor Rostering &amp; Schedules');
      expect(markup).toContain('Select Physician:');
      expect(markup).toContain('Dr. Maria Cruz');
      expect(markup).toContain('Dr. Juan Reyes');
    });

    test('2.2 Other tab values (e.g. tab: "unknown") do not open DoctorRosterCalendarModal', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: {
              tab: 'unrelated-tab',
            },
          } as any,
        })
      );

      expect(markup).not.toContain('Doctor Rostering &amp; Schedules');
      expect(markup).not.toContain('Select Physician:');
    });
  });

  // =========================================================================
  // 3. Route Parameter: date: '2026-10-25' -> currentDate updates
  // =========================================================================
  describe('3. date route parameter', () => {
    test('3.1 date: "2026-10-25" updates currentDate in Month view title', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: {
              date: '2026-10-25',
              view: 'month',
              initialLoading: false,
              initialAppointments: sampleAppointments,
            },
          } as any,
        })
      );

      expect(markup).toContain('data-testid="calendar-title"');
      expect(markup).toContain('October 2026');
    });

    test('3.2 date: "2026-10-25" and view: "day" formats day title as Sunday, Oct 25, 2026', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: {
              date: '2026-10-25',
              view: 'day',
              initialLoading: false,
              initialAppointments: sampleAppointments,
            },
          } as any,
        })
      );

      expect(markup).toContain('data-testid="calendar-title"');
      expect(markup).toContain('Sunday, Oct 25, 2026');
    });

    test('3.3 date: "2026-12-31" updates calendar month title to December 2026', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: {
              date: '2026-12-31',
              view: 'month',
              initialLoading: false,
              initialAppointments: [],
            },
          } as any,
        })
      );

      expect(markup).toContain('December 2026');
    });
  });

  // =========================================================================
  // 4. Route Parameter: appointmentId -> Inspected Appointment Drawer Opens
  // =========================================================================
  describe('4. appointmentId route parameter', () => {
    test('4.1 appointmentId: "apt-route-001" opens AppointmentInspectionModal with clinical details', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: {
              appointmentId: 'apt-route-001',
              initialAppointments: sampleAppointments,
              initialLoading: false,
            },
          } as any,
        })
      );

      expect(markup).toContain('data-testid="appointment-inspection-drawer"');
      expect(markup).toContain('Ambray, Cassandra');
      expect(markup).toContain('Dr. Maria Cruz');
      expect(markup).toContain('Room 101 - Consultation A');
      expect(markup).toContain('Hypertension follow-up and prescription refill');
      expect(markup).toContain('Prior reading 140/90');
      expect(markup).toContain('STAT');
      expect(markup).toContain('Confirmed');
      expect(markup).toContain('data-testid="btn-drawer-checkin"');
      expect(markup).toContain('data-testid="btn-drawer-reschedule"');
      expect(markup).toContain('data-testid="btn-drawer-cancel"');
      expect(markup).toContain('data-testid="btn-drawer-close"');
    });

    test('4.2 non-matching appointmentId does not open inspection drawer and does not crash', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: {
              appointmentId: 'apt-non-existent-999',
              initialAppointments: sampleAppointments,
              initialLoading: false,
            },
          } as any,
        })
      );

      expect(markup).not.toContain('data-testid="appointment-inspection-drawer"');
    });
  });

  // =========================================================================
  // 5. No Route Parameters -> Default View & All Modals Closed
  // =========================================================================
  describe('5. No route parameters (Default View)', () => {
    test('5.1 Mount with empty params: modals remain closed and default MonthView is mounted', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: {},
          } as any,
        })
      );

      // Modals must NOT be open
      expect(markup).not.toContain('data-testid="book-appointment-modal"');
      expect(markup).not.toContain('data-testid="appointment-inspection-drawer"');
      expect(markup).not.toContain('Doctor Rostering &amp; Schedules');
      expect(markup).not.toContain('data-testid="appointment-reschedule-modal"');
      expect(markup).not.toContain('Check In Appointment');

      // Default Calendar Header and Responsive Layout must be present
      expect(markup).toContain('data-testid="calendar-header"');
      expect(markup).toContain('data-testid="calendar-nav-controls"');
      expect(markup).toContain('Appointments');
      expect(markup).toContain('Doctor Rosters');
      expect(markup).toContain('Book appointment');
    });

    test('5.2 Mount with undefined route: cleanly renders without throwing null pointer exceptions', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {})
      );

      expect(markup).toContain('data-testid="calendar-header"');
      expect(markup).not.toContain('data-testid="book-appointment-modal"');
      expect(markup).not.toContain('data-testid="appointment-inspection-drawer"');
    });
  });

  // =========================================================================
  // 6. Adversarial Edge Cases & Fallback Resiliency
  // =========================================================================
  describe('6. Adversarial Edge Cases & Fallback Resiliency', () => {
    test('6.1 Invalid view mode falls back safely to AgendaView', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: {
              view: 'invalid_mode' as any,
              initialLoading: false,
              initialAppointments: sampleAppointments,
            },
          } as any,
        })
      );

      // Agenda view renders appointment cards
      expect(markup).toContain('data-testid="calendar-agenda-view"');
      expect(markup).toContain('Ambray, Cassandra');
    });

    test('6.2 Rapid view switcher buttons render accessible labels and controls', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: { view: 'week', initialLoading: false, initialAppointments: [] },
          } as any,
        })
      );

      expect(markup).toContain('data-testid="calendar-view-switcher"');
      expect(markup).toContain('Month');
      expect(markup).toContain('Week');
      expect(markup).toContain('Day');
      expect(markup).toContain('Agenda');
    });
  });
});
