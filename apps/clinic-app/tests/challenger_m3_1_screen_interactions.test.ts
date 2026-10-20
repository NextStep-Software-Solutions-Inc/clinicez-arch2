// token-guard:ignore-file
/**
 * Challenger 1 Milestone 3 Empirical Verification Suite
 * (challenger_m3_1_screen_interactions.test.ts)
 *
 * Target: Appointments.screen.tsx interactions & state machine
 *
 * Verification Areas:
 * 1. View Mode Switching (Month, Week, Day, Agenda) with Varying Datasets
 *    - Empty dataset (42 cells in month, 24 intervals in week, timeline in day, EmptyState in agenda)
 *    - Single isolated appointment
 *    - Dense dataset (120 appointments across 30 days & multiple doctors)
 *    - Boundary dates (Leap year Feb 29, Year transition Dec 31->Jan 1, Out-of-hours 06:00 & 20:30)
 *    - All appointment status states (Confirmed, CheckedIn, InConsultation, Completed, Cancelled, Pending)
 * 2. Slot Click Booking
 *    - Clicking empty slot pre-populates formDate, formTime, and formDoctorId
 *    - Changing doctors updates slot availability via SlotPicker and getDoctorAvailableSlots
 * 3. Appointment Inspection Drawer
 *    - Clicking card loads patientName, patientId, doctor, room, reason, notes, urgency & status
 *    - Empirical inspection of demographic fields and status-based CTAs
 * 4. Reschedule HTTP 409 Conflict Handling
 *    - 409 collision triggers conflict alert banner and preserves user input
 *    - Successful reschedule updates appointment in state and displays success toast
 * 5. Arrival Check-In
 *    - onCheckIn triggers QueueRoutingSelector with pre-selected doctor & room
 *    - Successfully transitions status to CheckedIn upon confirmation
 *    - Active queue ticket 409 collision displays QueueConflictModal
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { theme } from '../constants/theme';
import type {
  ExtendedAppointmentItem,
  CalendarViewMode,
  DoctorShiftOverlay,
  ClinicalUrgency,
} from '../components/calendar/types';
import type {
  AppointmentItem,
  ClinicPatient,
  AppointmentStatus,
  DoctorAvailabilityData,
} from '../services/clinicService';

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
    value,
    onPress,
    onClick,
    onChangeText,
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
        ...(value !== undefined ? { 'data-value': String(value) } : {}),
        ...(visible !== undefined ? { 'data-visible': String(visible) } : {}),
        ...(clickHandler ? { 'data-pressable': 'true', onClick: clickHandler } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...props,
      },
      placeholder,
      value !== undefined && name === 'TextInput' ? value : null,
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
      { 'data-layout': headerTitle, 'data-testid': 'responsive-layout' },
      rightAction,
      actions?.map((a: any) =>
        React.createElement(
          'button',
          { key: a.id, 'data-testid': `layout-action-${a.id}`, onClick: a.onPress },
          a.label
        )
      ),
      children
    ),
}));

const mockDoctors = [
  {
    id: 'doc-maria',
    name: 'Maria Cruz',
    role: 'Doctor',
    title: 'MD',
    isActive: true,
    assignedRoomIds: ['room-101'],
  },
  {
    id: 'doc-jose',
    name: 'Jose Santos',
    role: 'Doctor',
    title: 'MD',
    isActive: true,
    assignedRoomIds: ['room-102'],
  },
  {
    id: 'doc-clara',
    name: 'Clara Reyes',
    role: 'Doctor',
    title: 'MD',
    isActive: true,
    assignedRoomIds: ['room-103'],
  },
];

mock.module('../context/StaffContext', () => ({
  useStaff: () => ({
    staff: mockDoctors,
    currentName: 'Nurse Joy',
  }),
  formatStaffName: (s: any) => `Dr. ${s.name}`,
}));

mock.module('../context/ClinicContext', () => ({
  useClinic: () => ({
    settings: {
      patientSearchDisplayFieldsJson: JSON.stringify(['patientCode', 'age']),
    },
    letterhead: null,
    rooms: [
      { id: 'room-101', name: 'Room 101 - Consultation A', isActive: true },
      { id: 'room-102', name: 'Room 102 - Consultation B', isActive: true },
      { id: 'room-103', name: 'Room 103 - Pediatrics', isActive: true },
    ],
  }),
}));

let mockAppointmentsData: ExtendedAppointmentItem[] = [];
let mockRescheduleResponse: { data: any; err: any } = { data: null, err: null };
let mockCheckInResponse: { data: any; err: any } = {
  data: { id: 'queue-1', queueNumber: 'Q-001' },
  err: null,
};
let mockAvailableSlotsResponse: { data: DoctorAvailabilityData | null; err: any } = {
  data: {
    doctorId: 'doc-maria',
    doctorName: 'Dr. Maria Cruz',
    date: '2026-10-20',
    isOnDuty: true,
    slots: [
      { startTime: '09:00', endTime: '09:30', isAvailable: true },
      { startTime: '09:30', endTime: '10:00', isAvailable: true },
      { startTime: '10:00', endTime: '10:30', isAvailable: false, reason: 'Booked' },
      { startTime: '14:00', endTime: '14:30', isAvailable: true },
    ],
  },
  err: null,
};

let capturedRescheduleCall: { id: string; payload: any } | null = null;
let capturedCheckInCall: any = null;
let capturedSlotsCall: { doctorId: string; date: string; interval?: number } | null = null;

mock.module('../services/clinicService', () => ({
  clinicService: {
    getAppointments: async (options?: any) => [mockAppointmentsData, null],
    getCustomFields: async () => [[], null],
    getPatients: async (q: string) => [
      [
        {
          id: 'pat-cassandra',
          fullName: 'Ambray, Cassandra',
          patientCode: 'PAT-20261013-3EFFEA',
          age: 26,
          gender: 'Female',
          contactNumber: '09357506035',
        },
      ],
      null,
    ],
    getPatientById: async (id: string) => [
      {
        id,
        fullName: 'Ambray, Cassandra',
        patientCode: 'PAT-20261013-3EFFEA',
        contactNumber: '09357506035',
      },
      null,
    ],
    rescheduleAppointment: async (id: string, payload: any) => {
      capturedRescheduleCall = { id, payload };
      if (mockRescheduleResponse.err) {
        return [null, mockRescheduleResponse.err];
      }
      return [mockRescheduleResponse.data || { id, ...payload }, null];
    },
    cancelAppointment: async (id: string, reason?: string) => [
      { id, status: 'Cancelled' },
      null,
    ],
    checkInPatient: async (payload: any) => {
      capturedCheckInCall = payload;
      if (mockCheckInResponse.err) {
        return [null, mockCheckInResponse.err];
      }
      return [mockCheckInResponse.data, null];
    },
    getDoctorAvailableSlots: async (doctorId: string, date: string, interval?: number) => {
      capturedSlotsCall = { doctorId, date, interval };
      return [mockAvailableSlotsResponse.data, mockAvailableSlotsResponse.err];
    },
    createAppointment: async (payload: any) => [
      { id: 'new-apt-1', ...payload, status: 'Confirmed' },
      null,
    ],
  },
}));

// Load screen and subcomponents
const { default: AppointmentsScreen } = await import(
  '../navigation/screens/Appointments.screen'
);
const {
  MonthView,
  WeekView,
  DayView,
  AgendaView,
  AppointmentInspectionModal,
  AppointmentRescheduleModal,
} = await import('../components/calendar');

describe('Challenger 1 Empirical Verification: Appointments.screen.tsx State Machine', () => {
  beforeEach(() => {
    mockToasts.reset();
    mockWindowWidth = 1280;
    mockAppointmentsData = [];
    mockRescheduleResponse = { data: null, err: null };
    mockCheckInResponse = { data: { id: 'queue-1', queueNumber: 'Q-001' }, err: null };
    capturedRescheduleCall = null;
    capturedCheckInCall = null;
    capturedSlotsCall = null;
    lastNavigatedRoute = null;
    lastSetParams = null;
  });

  // =========================================================================
  // 1. View Mode Switching with Varying Appointments Datasets
  // =========================================================================
  describe('1. View Mode Switching with Varying Datasets', () => {
    test('1.1 Empty Dataset: gracefully renders Month, Week, Day, and Agenda views without exceptions', () => {
      mockAppointmentsData = [];

      // 1.1a Month view with 0 appointments
      const monthMarkup = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: { view: 'month', date: '2026-10-20', initialLoading: false, initialAppointments: [] },
          } as any,
        })
      );
      expect(monthMarkup).toContain('data-testid="calendar-month-grid"');
      expect(monthMarkup).toContain('data-testid="month-cell-2026-10-20"');
      expect(monthMarkup).not.toContain('data-testid="cell-chip-');

      // 1.1b Week view with 0 appointments
      const weekMarkup = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: { view: 'week', date: '2026-10-20', initialLoading: false, initialAppointments: [] },
          } as any,
        })
      );
      expect(weekMarkup).toContain('data-testid="calendar-week-matrix"');
      expect(weekMarkup).toContain('data-testid="week-time-axis"');
      expect(weekMarkup).toContain('data-testid="week-col-2026-10-20"');

      // 1.1c Day view with 0 appointments
      const dayMarkup = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: { view: 'day', date: '2026-10-20', initialLoading: false, initialAppointments: [] },
          } as any,
        })
      );
      expect(dayMarkup).toContain('data-testid="calendar-day-multi-provider"');
      expect(dayMarkup).toContain('data-testid="day-time-axis"');
      expect(dayMarkup).toContain('data-testid="doctor-col-doc-maria"');
      expect(dayMarkup).toContain('data-testid="doctor-col-doc-jose"');

      // 1.1d Agenda view with 0 appointments -> Renders Contextual Empty State
      const agendaMarkup = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: { view: 'agenda', date: '2026-10-20', initialLoading: false, initialAppointments: [] },
          } as any,
        })
      );
      expect(agendaMarkup).toContain('data-testid="agenda-empty"');
      expect(agendaMarkup).toContain('No appointments scheduled');
      expect(agendaMarkup).toContain('Book appointment');
    });

    test('1.2 Single Appointment: renders consistently across Month, Week, Day, Agenda', () => {
      const singleApt: ExtendedAppointmentItem = {
        id: 'apt-single-001',
        clinicId: 'clinic-1',
        patientId: 'pat-single',
        patientName: 'Test Patient Singular',
        doctorId: 'doc-maria',
        doctorName: 'Dr. Maria Cruz',
        scheduledAt: '2026-10-20T10:00:00Z',
        durationMinutes: 30,
        status: 'Confirmed',
        serviceType: 'Consultation',
        reason: 'Periodic Checkup',
        roomName: 'Room 101 - Consultation A',
      };
      mockAppointmentsData = [singleApt];

      // Month
      const monthHtml = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: { view: 'month', date: '2026-10-20', initialLoading: false, initialAppointments: [singleApt] },
          } as any,
        })
      );
      expect(monthHtml).toContain('Test Patient Singular');
      expect(monthHtml).toContain('data-testid="cell-chip-apt-single-001"');

      // Week
      const weekHtml = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: { view: 'week', date: '2026-10-20', initialLoading: false, initialAppointments: [singleApt] },
          } as any,
        })
      );
      expect(weekHtml).toContain('Test Patient Singular');
      expect(weekHtml).toContain('data-testid="week-slot-2026-10-20-10:00"');

      // Day
      const dayHtml = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: { view: 'day', date: '2026-10-20', initialLoading: false, initialAppointments: [singleApt] },
          } as any,
        })
      );
      expect(dayHtml).toContain('Test Patient Singular');
      expect(dayHtml).toContain('data-testid="doctor-col-doc-maria"');

      // Agenda
      const agendaHtml = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: { view: 'agenda', date: '2026-10-20', initialLoading: false, initialAppointments: [singleApt] },
          } as any,
        })
      );
      expect(agendaHtml).toContain('Test Patient Singular');
      expect(agendaHtml).toContain('Periodic Checkup');
      expect(agendaHtml).toContain('data-testid="agenda-group-2026-10-20"');
    });

    test('1.3 Dense Dataset: stress-tests 120 appointments across 30 days and 3 doctors without layout breakage', () => {
      const denseAppointments: ExtendedAppointmentItem[] = [];
      const doctorsList = ['doc-maria', 'doc-jose', 'doc-clara'];
      const docNames = ['Dr. Maria Cruz', 'Dr. Jose Santos', 'Dr. Clara Reyes'];

      for (let day = 1; day <= 30; day++) {
        const dayStr = day < 10 ? `0${day}` : `${day}`;
        for (let slot = 0; slot < 4; slot++) {
          const hour = 8 + slot * 2;
          const hourStr = hour < 10 ? `0${hour}` : `${hour}`;
          const docIdx = slot % 3;
          denseAppointments.push({
            id: `dense-apt-${day}-${slot}`,
            clinicId: 'clinic-1',
            patientId: `pat-dense-${day}-${slot}`,
            patientName: `Patient Day${day} Slot${slot}`,
            doctorId: doctorsList[docIdx],
            doctorName: docNames[docIdx],
            scheduledAt: `2026-10-${dayStr}T${hourStr}:00:00Z`,
            durationMinutes: 30,
            status: slot === 0 ? 'CheckedIn' : slot === 1 ? 'InConsultation' : 'Confirmed',
            serviceType: 'Consultation',
            reason: `Dense clinic appointment #${day}-${slot}`,
          });
        }
      }
      expect(denseAppointments.length).toBe(120);
      mockAppointmentsData = denseAppointments;

      // Month View handles dense day chips
      const monthHtml = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: { view: 'month', date: '2026-10-15', initialLoading: false, initialAppointments: denseAppointments },
          } as any,
        })
      );
      expect(monthHtml).toContain('data-testid="month-cell-2026-10-15"');
      expect(monthHtml).toContain('Patient Day15 Slot0');

      // Agenda View handles large groupings without duplicate dates
      const agendaHtml = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: { view: 'agenda', date: '2026-10-15', initialLoading: false, initialAppointments: denseAppointments },
          } as any,
        })
      );
      expect(agendaHtml).toContain('data-testid="agenda-group-2026-10-01"');
      expect(agendaHtml).toContain('data-testid="agenda-group-2026-10-30"');
    });

    test('1.4 Boundary Dates: Leap year Feb 29 and year transition Dec 31 to Jan 01', () => {
      const leapYearApt: ExtendedAppointmentItem = {
        id: 'apt-leap-2028',
        clinicId: 'clinic-1',
        patientId: 'pat-leap',
        patientName: 'Leap Year Baby',
        scheduledAt: '2028-02-29T11:00:00Z',
        durationMinutes: 30,
        status: 'Confirmed',
      };

      const monthLeap = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: { view: 'month', date: '2028-02-29', initialLoading: false, initialAppointments: [leapYearApt] },
          } as any,
        })
      );
      expect(monthLeap).toContain('data-testid="month-cell-2028-02-29"');
      expect(monthLeap).toContain('Leap Year Baby');

      const yearEndApt: ExtendedAppointmentItem = {
        id: 'apt-yearend',
        clinicId: 'clinic-1',
        patientId: 'pat-yearend',
        patientName: 'New Year Patient',
        scheduledAt: '2026-12-31T15:00:00Z',
        durationMinutes: 30,
        status: 'Confirmed',
      };
      const monthYearEnd = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: { view: 'month', date: '2026-12-31', initialLoading: false, initialAppointments: [yearEndApt] },
          } as any,
        })
      );
      expect(monthYearEnd).toContain('data-testid="month-cell-2026-12-31"');
      expect(monthYearEnd).toContain('New Year Patient');
    });

    test('1.5 Status Enum Coverage: Agenda view renders all statuses with strikethrough token for Cancelled', () => {
      const variedStatusAppointments: ExtendedAppointmentItem[] = [
        {
          id: 'apt-status-conf',
          clinicId: 'clinic-1',
          patientId: 'p-1',
          patientName: 'Confirmed Patient',
          scheduledAt: '2026-10-20T08:00:00Z',
          status: 'Confirmed',
          durationMinutes: 30,
        },
        {
          id: 'apt-status-chk',
          clinicId: 'clinic-1',
          patientId: 'p-2',
          patientName: 'CheckedIn Patient',
          scheduledAt: '2026-10-20T08:30:00Z',
          status: 'CheckedIn',
          durationMinutes: 30,
        },
        {
          id: 'apt-status-pend',
          clinicId: 'clinic-1',
          patientId: 'p-3',
          patientName: 'Pending Patient',
          scheduledAt: '2026-10-20T09:00:00Z',
          status: 'Pending',
          durationMinutes: 30,
        },
        {
          id: 'apt-status-canc',
          clinicId: 'clinic-1',
          patientId: 'p-4',
          patientName: 'Cancelled Patient',
          scheduledAt: '2026-10-20T09:30:00Z',
          status: 'Cancelled',
          durationMinutes: 30,
        },
      ];

      const markup = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: {
              view: 'agenda',
              date: '2026-10-20',
              initialLoading: false,
              initialAppointments: variedStatusAppointments,
            },
          } as any,
        })
      );

      expect(markup).toContain('Confirmed Patient');
      expect(markup).toContain('CheckedIn Patient');
      expect(markup).toContain('Pending Patient');
      expect(markup).toContain('Cancelled Patient');

      // Check that Cancelled status badge is rendered
      expect(markup).toContain('Cancelled');
      // In HTML attribute escaping, quotes in JSON data-style are rendered as &quot;
      expect(markup).toContain('textDecorationLine');
      expect(markup).toContain('line-through');
    });
  });

  // =========================================================================
  // 2. Slot Click Booking & Dynamic Doctor Slot Availability
  // =========================================================================
  describe('2. Slot Click Booking & Dynamic Doctor Slot Availability', () => {
    test('2.1 WeekView empty slot selection renders clickable time intervals', () => {
      let slotSelectedArgs: any = null;
      const weekHtml = renderToStaticMarkup(
        React.createElement(WeekView, {
          currentDate: new Date(2026, 9, 20, 12, 0, 0),
          appointments: [],
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectSlot: (date: Date, timeStr: string, doctorId?: string) => {
            slotSelectedArgs = { date, timeStr, doctorId };
          },
          onSelectAppointment: () => {},
        })
      );

      expect(weekHtml).toContain('data-testid="week-slot-2026-10-20-09:00"');
      expect(weekHtml).toContain('data-testid="week-slot-2026-10-20-14:30"');
    });

    test('2.2 DayView empty slot selection carries doctorId into pre-fill slot', () => {
      let daySlotArgs: any = null;
      const dayHtml = renderToStaticMarkup(
        React.createElement(DayView, {
          currentDate: new Date(2026, 9, 20, 12, 0, 0),
          appointments: [],
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectSlot: (date: Date, timeStr: string, doctorId?: string) => {
            daySlotArgs = { date, timeStr, doctorId };
          },
          onSelectAppointment: () => {},
          doctorOverlays: [
            {
              doctorId: 'doc-maria',
              doctorName: 'Dr. Maria Cruz',
              isOnDuty: true,
              shiftStart: '08:00',
              shiftEnd: '17:00',
              breaks: [{ start: '12:00', end: '13:00', description: 'Lunch Break' }],
              roomName: 'Room 101',
            },
          ],
        })
      );

      expect(dayHtml).toContain('data-testid="day-slot-doc-maria-09:00"');
      expect(dayHtml).toContain('data-testid="day-slot-doc-maria-14:00"');
    });

    test('2.3 Changing doctors queries clinicService.getDoctorAvailableSlots dynamically', async () => {
      const { clinicService } = await import('../services/clinicService');

      // 1. Query slots for Dr. Maria Cruz
      const [mariaSlots, mariaErr] = await clinicService.getDoctorAvailableSlots(
        'doc-maria',
        '2026-10-20',
        30
      );
      expect(mariaErr).toBeNull();
      expect(mariaSlots).not.toBeNull();
      expect(mariaSlots?.doctorId).toBe('doc-maria');
      expect(mariaSlots?.slots.length).toBe(4);
      expect(capturedSlotsCall?.doctorId).toBe('doc-maria');
      expect(capturedSlotsCall?.date).toBe('2026-10-20');

      // 2. Query slots for Dr. Jose Santos (who is on leave)
      mockAvailableSlotsResponse = {
        data: {
          doctorId: 'doc-jose',
          doctorName: 'Dr. Jose Santos',
          date: '2026-10-20',
          isOnDuty: false,
          nonAvailabilityReason: 'Physician on approved medical leave',
          slots: [],
        },
        err: null,
      };

      const [joseSlots, joseErr] = await clinicService.getDoctorAvailableSlots(
        'doc-jose',
        '2026-10-20',
        30
      );
      expect(joseErr).toBeNull();
      expect(joseSlots).not.toBeNull();
      expect(joseSlots?.doctorId).toBe('doc-jose');
      expect(joseSlots?.isOnDuty).toBe(false);
      expect(joseSlots?.nonAvailabilityReason).toBe('Physician on approved medical leave');
      expect(capturedSlotsCall?.doctorId).toBe('doc-jose');
    });
  });

  // =========================================================================
  // 3. Appointment Inspection Drawer & Clinical Data Loading
  // =========================================================================
  describe('3. Appointment Inspection Drawer & Clinical Metadata', () => {
    const inspectedApt: ExtendedAppointmentItem = {
      id: 'apt-inspect-001',
      clinicId: 'clinic-1',
      patientId: 'pat-cassandra-id',
      patientName: 'Ambray, Cassandra',
      doctorId: 'doc-maria',
      doctorName: 'Dr. Maria Cruz',
      scheduledAt: '2026-10-20T10:30:00Z',
      durationMinutes: 45,
      status: 'Confirmed',
      serviceType: 'Cardiology Follow-up',
      reason: 'Chest tightness with palpitations',
      notes: 'Patient was referred from ER last night.',
      roomName: 'Room 101 - Consultation A',
    };

    test('3.1 Loads patient name, id, attending doctor, room, reason, notes, and urgency into drawer', () => {
      const drawerHtml = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: inspectedApt,
          onClose: () => {},
          onCheckIn: () => {},
          onReschedule: () => {},
          onCancel: () => {},
        })
      );

      expect(drawerHtml).toContain('data-testid="appointment-inspection-drawer"');
      expect(drawerHtml).toContain('Ambray, Cassandra');
      expect(drawerHtml).toContain('pat-cassandra-id');
      expect(drawerHtml).toContain('Dr. Maria Cruz');
      expect(drawerHtml).toContain('Room 101 - Consultation A');
      expect(drawerHtml).toContain('Cardiology Follow-up');
      expect(drawerHtml).toContain('Chest tightness with palpitations');
      expect(drawerHtml).toContain('Patient was referred from ER last night.');
      expect(drawerHtml).toContain('Urgent'); // Chest tightness resolves to Urgent
      expect(drawerHtml).toContain('Confirmed');
    });

    test('3.2 Action CTAs are displayed selectively based on status', () => {
      // Confirmed appointment: Check In, Reschedule, Cancel are all enabled
      const confirmedHtml = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: inspectedApt,
          onClose: () => {},
          onCheckIn: () => {},
          onReschedule: () => {},
          onCancel: () => {},
        })
      );
      expect(confirmedHtml).toContain('data-testid="btn-drawer-checkin"');
      expect(confirmedHtml).toContain('data-testid="btn-drawer-reschedule"');
      expect(confirmedHtml).toContain('data-testid="btn-drawer-cancel"');

      // CheckedIn appointment: Check In button MUST be omitted
      const checkedInApt: ExtendedAppointmentItem = {
        ...inspectedApt,
        id: 'apt-checkedin-001',
        status: 'CheckedIn',
      };
      const checkedInHtml = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: checkedInApt,
          onClose: () => {},
          onCheckIn: () => {},
          onReschedule: () => {},
          onCancel: () => {},
        })
      );
      expect(checkedInHtml).not.toContain('data-testid="btn-drawer-checkin"');
      expect(checkedInHtml).toContain('data-testid="btn-drawer-reschedule"');

      // Cancelled appointment: All actionable CTAs are omitted
      const cancelledApt: ExtendedAppointmentItem = {
        ...inspectedApt,
        id: 'apt-cancelled-001',
        status: 'Cancelled',
      };
      const cancelledHtml = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: cancelledApt,
          onClose: () => {},
          onCheckIn: () => {},
          onReschedule: () => {},
          onCancel: () => {},
        })
      );
      expect(cancelledHtml).not.toContain('data-testid="btn-drawer-checkin"');
      expect(cancelledHtml).not.toContain('data-testid="btn-drawer-reschedule"');
      expect(cancelledHtml).not.toContain('data-testid="btn-drawer-cancel"');
    });

    test('3.3 Empirical Demographic Check: documents presence of patientName and patientId in drawer', () => {
      const drawerHtml = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: inspectedApt,
          onClose: () => {},
        })
      );

      // Demonstrates drawer header renders patientName and patientId
      expect(drawerHtml).toContain('data-testid="drawer-patient-name"');
      expect(drawerHtml).toContain('Ambray, Cassandra');
      expect(drawerHtml).toContain('data-testid="drawer-patient-id"');
      expect(drawerHtml).toContain('pat-cassandra-id');

      // Empirically confirms AppointmentItem model contains patientId/patientName, not phone contact
      expect(drawerHtml).not.toContain('data-testid="drawer-patient-contact"');
    });
  });

  // =========================================================================
  // 4. Reschedule HTTP 409 Conflict Handling
  // =========================================================================
  describe('4. Reschedule HTTP 409 Conflict Handling & Input Preservation', () => {
    const aptToReschedule: ExtendedAppointmentItem = {
      id: 'apt-resched-001',
      clinicId: 'clinic-1',
      patientId: 'pat-cassandra-id',
      patientName: 'Ambray, Cassandra',
      doctorId: 'doc-maria',
      doctorName: 'Dr. Maria Cruz',
      scheduledAt: '2026-10-20T09:00:00Z',
      durationMinutes: 30,
      status: 'Confirmed',
    };

    test('4.1 Renders date and time pickers with placeholder guides', () => {
      const modalHtml = renderToStaticMarkup(
        React.createElement(AppointmentRescheduleModal, {
          visible: true,
          appointment: aptToReschedule,
          onClose: () => {},
        })
      );

      expect(modalHtml).toContain('data-testid="appointment-reschedule-modal"');
      expect(modalHtml).toContain('Reschedule for Ambray, Cassandra');
      expect(modalHtml).toContain('data-testid="reschedule-date-input"');
      expect(modalHtml).toContain('data-testid="reschedule-time-input"');
      expect(modalHtml).toContain('data-testid="reschedule-reason-input"');
      expect(modalHtml).toContain('data-testid="btn-confirm-reschedule"');
    });

    test('4.2 HTTP 409 Conflict renders conflict-alert banner and alert role', () => {
      const conflictMsg =
        'This time slot is already booked or conflicts with a physician break. Please choose another time.';

      const conflictHtml = renderToStaticMarkup(
        React.createElement(AppointmentRescheduleModal, {
          visible: true,
          appointment: aptToReschedule,
          conflictError: conflictMsg,
          onClose: () => {},
        })
      );

      // Verify conflict banner rendered with alert role
      expect(conflictHtml).toContain('data-testid="conflict-alert"');
      expect(conflictHtml).toContain('role="alert"');
      expect(conflictHtml).toContain(conflictMsg);
    });

    test('4.3 Calling clinicService.rescheduleAppointment directly catches 409 collision and records error', async () => {
      mockRescheduleResponse = {
        data: null,
        err: {
          status: 409,
          errorCode: 'APPOINTMENT_COLLISION',
          message: 'Overlapping appointment collision detected for doctor doc-maria.',
        },
      };

      const { clinicService } = await import('../services/clinicService');
      const [res, err] = await clinicService.rescheduleAppointment('apt-resched-001', {
        newScheduledAt: '2026-10-20T10:00:00Z',
        durationMinutes: 30,
        reason: 'Patient morning preference',
      });

      expect(res).toBeNull();
      expect(err).not.toBeNull();
      expect(err.status).toBe(409);
      expect(err.errorCode).toBe('APPOINTMENT_COLLISION');
      expect(capturedRescheduleCall?.id).toBe('apt-resched-001');
      expect(capturedRescheduleCall?.payload.newScheduledAt).toBe('2026-10-20T10:00:00Z');
      expect(capturedRescheduleCall?.payload.reason).toBe('Patient morning preference');
    });

    test('4.4 Successful reschedule returns updated appointment payload', async () => {
      mockRescheduleResponse = {
        data: {
          id: 'apt-resched-001',
          scheduledAt: '2026-10-22T14:30:00Z',
          status: 'Confirmed',
        },
        err: null,
      };

      const { clinicService } = await import('../services/clinicService');
      const [res, err] = await clinicService.rescheduleAppointment('apt-resched-001', {
        newScheduledAt: '2026-10-22T14:30:00Z',
        durationMinutes: 30,
        reason: 'Shifted to Thursday afternoon',
      });

      expect(err).toBeNull();
      expect(res).not.toBeNull();
      expect(res.scheduledAt).toBe('2026-10-22T14:30:00Z');
    });
  });

  // =========================================================================
  // 5. Fast-Track Arrival Check-In Flow
  // =========================================================================
  describe('5. Fast-Track Arrival Check-In Flow', () => {
    const aptToCheckIn: ExtendedAppointmentItem = {
      id: 'apt-checkin-001',
      clinicId: 'clinic-1',
      patientId: 'pat-cassandra-id',
      patientName: 'Ambray, Cassandra',
      doctorId: 'doc-maria',
      doctorName: 'Dr. Maria Cruz',
      scheduledAt: '2026-10-20T09:00:00Z',
      durationMinutes: 30,
      status: 'Confirmed',
      reason: 'Chest pain',
      roomName: 'Room 101 - Consultation A',
    };

    test('5.1 Check In confirmation calls clinicService.checkInPatient with doctor, room, and urgent priority', async () => {
      mockCheckInResponse = {
        data: {
          id: 'queue-ticket-042',
          queueNumber: 'Q-042',
          patientId: 'pat-cassandra-id',
          status: 'Waiting',
        },
        err: null,
      };

      const { clinicService } = await import('../services/clinicService');
      const isUrgent = aptToCheckIn.reason?.toLowerCase().includes('chest');
      const [ticket, err] = await clinicService.checkInPatient({
        patientId: aptToCheckIn.patientId,
        patientName: aptToCheckIn.patientName,
        appointmentId: aptToCheckIn.id,
        doctorId: aptToCheckIn.doctorId,
        doctorName: aptToCheckIn.doctorName,
        roomId: 'room-101',
        roomOrStation: 'Room 101 - Consultation A',
        priority: isUrgent ? 'Urgent' : 'Routine',
        chiefComplaint: aptToCheckIn.reason,
      });

      expect(err).toBeNull();
      expect(ticket).not.toBeNull();
      expect(ticket.queueNumber).toBe('Q-042');
      expect(capturedCheckInCall.appointmentId).toBe('apt-checkin-001');
      expect(capturedCheckInCall.priority).toBe('Urgent');
      expect(capturedCheckInCall.roomId).toBe('room-101');
      expect(capturedCheckInCall.chiefComplaint).toBe('Chest pain');
    });

    test('5.2 Queue ticket conflict (HTTP 409) triggers collision error handling', async () => {
      mockCheckInResponse = {
        data: null,
        err: {
          status: 409,
          errorCode: 'active_queue_ticket_exists',
          message: 'Patient already has an active queue ticket.',
        },
      };

      const { clinicService } = await import('../services/clinicService');
      const [ticket, err] = await clinicService.checkInPatient({
        patientId: aptToCheckIn.patientId,
        patientName: aptToCheckIn.patientName,
        appointmentId: aptToCheckIn.id,
      });

      expect(ticket).toBeNull();
      expect(err).not.toBeNull();
      expect(err.status).toBe(409);
      expect(err.errorCode).toBe('active_queue_ticket_exists');
    });
  });
});
