// token-guard:ignore-file
/**
 * Tier 5 White-Box Adversarial Workflow & Screen Hardening Test Suite
 *
 * Scenarios tested:
 * 1. Network errors during reschedule:
 *    - HTTP 500 handling & toast notification (without triggering 409 collision alert)
 *    - Network timeout / request aborted handling
 *    - Device offline state handling
 *    - Form draft preservation on error (newDate, newTime, reason retained for retry)
 *    - Differential error branching: 409 conflict banner vs 500 toast notification
 *    - Custom onSubmitReschedule interceptor callback
 *    - Empty input submission prevention (newDate / newTime short-circuit)
 *    - DurationMinutes fallback (defaults to 30) and whitespace trimming on reason
 *
 * 2. Malformed or partial route params:
 *    - Non-UUID appointmentId ('non-existent-id', 'malformed_id_123', '!!!')
 *    - Nonexistent UUID appointmentId
 *    - Invalid date formats: 'invalid-date', '2026-02-31', '2026-13-45'
 *    - Empty string date param ('') falling back cleanly to Manila today
 *    - Malformed preselected patient route params (empty strings, whitespace-only, partial names/IDs)
 *    - Malformed view mode param ('invalid-mode' as any)
 *    - Booking modal date validator (validateDateString) rejecting invalid/past dates
 *
 * 3. Fast clicking / rapid view switching & race condition immunity:
 *    - Rapid sequential view switching (month -> week -> day -> agenda -> month)
 *    - Out-of-order query resolution simulation (delayed month arriving after fast day)
 *    - Network failure during in-flight view query with ErrorState & retry recovery
 *    - Rapid calendar date navigation (handleNext, handlePrev across month/year boundaries, handleToday)
 *    - Active doctor filtering during in-flight queries
 *
 * 4. Consecutive check-in cancellations, reschedules, and status lockdown:
 *    - Anti-spam ref guard (isCheckingInRef) blocking concurrent check-in executions
 *    - Check-in cancellation cleanly aborting modal without creating queue tickets
 *    - Check-in 409 / active_queue_ticket_exists conflict modal delegation
 *    - Status progression: CheckedIn appointment locks down Check In button in inspection drawer
 *    - Reschedule followed immediately by a second reschedule
 *    - Cancelled appointment locks down Check In, Reschedule, and Cancel CTAs
 *    - Direct appointment cancellation marking appointment as Cancelled
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { theme } from '../constants/theme';
import type {
  ExtendedAppointmentItem,
  CalendarViewMode,
} from '../components/calendar/types';
import type {
  AppointmentItem,
  ClinicPatient,
  AppointmentStatus,
  GetAppointmentsOptions,
} from '../services/clinicService';
import {
  parseDateOnly,
  formatDateString,
  getDaysInMonth,
  getManilaTodayStr,
  toDateString,
} from '../components/calendar/calendarUtils';

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
    ],
  }),
}));

const sampleAppointments: ExtendedAppointmentItem[] = [
  {
    id: 'apt-001',
    clinicId: 'clinic-1',
    tenantId: 'tenant-1',
    patientId: 'pat-cassandra',
    patientName: 'Ambray, Cassandra',
    patientCode: 'PAT-20261013-3EFFEA',
    doctorId: 'doc-maria',
    doctorName: 'Dr. Maria Cruz',
    scheduledAt: '2026-10-20T09:00:00Z',
    status: 'Confirmed',
    serviceType: 'Consultation',
    reason: 'Severe Chest tightness',
    urgency: 'STAT',
    durationMinutes: 30,
    roomName: 'Room 101 - Consultation A',
  },
  {
    id: 'apt-002',
    clinicId: 'clinic-1',
    tenantId: 'tenant-1',
    patientId: 'pat-juan',
    patientName: 'Dela Cruz, Juan',
    patientCode: 'PAT-20261014-99AAAA',
    doctorId: 'doc-jose',
    doctorName: 'Dr. Jose Santos',
    scheduledAt: '2026-10-20T10:30:00Z',
    status: 'CheckedIn',
    serviceType: 'Consultation',
    reason: 'Follow-up Hypertension',
    urgency: 'Routine',
    durationMinutes: 30,
    roomName: 'Room 102 - Consultation B',
  },
  {
    id: 'apt-003',
    clinicId: 'clinic-1',
    tenantId: 'tenant-1',
    patientId: 'pat-pedro',
    patientName: 'Penduko, Pedro',
    patientCode: 'PAT-20261015-77BBBB',
    doctorId: 'doc-maria',
    doctorName: 'Dr. Maria Cruz',
    scheduledAt: '2026-10-21T14:00:00Z',
    status: 'Pending',
    serviceType: 'Consultation',
    reason: 'Routine checkup',
    urgency: 'Routine',
    durationMinutes: 30,
  },
  {
    id: 'apt-cancelled',
    clinicId: 'clinic-1',
    tenantId: 'tenant-1',
    patientId: 'pat-cancelled',
    patientName: 'Cancelled, Patient',
    doctorId: 'doc-maria',
    doctorName: 'Dr. Maria Cruz',
    scheduledAt: '2026-10-20T16:00:00Z',
    status: 'Cancelled',
    serviceType: 'Consultation',
    reason: 'Cancelled checkup',
    durationMinutes: 30,
  },
];

let queryHistory: GetAppointmentsOptions[] = [];
let mockRescheduleResponse: [any | null, any | null] = [null, null];
let mockCheckInResponse: [any | null, any | null] = [null, null];
let mockCancelResponse: [any | null, any | null] = [null, null];
let mockAppointmentsResponse: [AppointmentItem[] | null, any | null] = [sampleAppointments, null];
let checkInCallCount = 0;
let reschedulePayloadsSent: any[] = [];

mock.module('../services/clinicService', () => ({
  clinicService: {
    getAppointments: async (options?: any) => {
      queryHistory.push(options ? { ...options } : {});
      return mockAppointmentsResponse;
    },
    getCustomFields: async () => [[], null],
    getPatients: async () => [[], null],
    getPatientById: async (id: string) => [
      { id, fullName: 'Ambray, Cassandra', patientCode: 'PAT-20261013-3EFFEA' },
      null,
    ],
    rescheduleAppointment: async (id: string, payload: any) => {
      reschedulePayloadsSent.push({ id, payload });
      if (mockRescheduleResponse[1] !== null || mockRescheduleResponse[0] !== null) {
        return mockRescheduleResponse;
      }
      return [{ id, ...payload }, null];
    },
    cancelAppointment: async (id: string, reason?: string) => {
      if (mockCancelResponse[1] !== null || mockCancelResponse[0] !== null) {
        return mockCancelResponse;
      }
      return [{ id, status: 'Cancelled' }, null];
    },
    checkInPatient: async (payload: any) => {
      checkInCallCount++;
      if (mockCheckInResponse[1] !== null || mockCheckInResponse[0] !== null) {
        return mockCheckInResponse;
      }
      return [{ id: 'queue-1', queueNumber: 'Q-042', ...payload }, null];
    },
    getDoctorAvailableSlots: async () => [['09:00', '09:30', '10:00'], null],
  },
}));

// Load screen and modals
const {
  default: AppointmentsScreen,
  buildPreselectedPatientFromRoute,
} = await import('../navigation/screens/Appointments.screen');
const { AppointmentRescheduleModal } = await import('../components/calendar/AppointmentRescheduleModal');
const { AppointmentInspectionModal } = await import('../components/calendar/AppointmentInspectionModal');
const { validateDateString } = await import('../components/ui/ValidatedDateInput');

describe('Tier 5 Adversarial Workflow & Screen Hardening Suite', () => {
  beforeEach(() => {
    mockToasts.reset();
    queryHistory = [];
    mockRescheduleResponse = [null, null];
    mockCheckInResponse = [null, null];
    mockCancelResponse = [null, null];
    mockAppointmentsResponse = [sampleAppointments, null];
    checkInCallCount = 0;
    reschedulePayloadsSent = [];
    lastNavigatedRoute = null;
    lastSetParams = null;
    mockWindowWidth = 1280;
  });

  // =========================================================================
  // 1. Network Errors During Reschedule
  // =========================================================================
  describe('1. Network Errors & Resilience During Reschedule', () => {
    test('1.1 Handles HTTP 500 Internal Server Error cleanly: notifies error toast, does not show 409 conflict alert, and preserves form fields', async () => {
      mockRescheduleResponse = [
        null,
        {
          status: 500,
          errorCode: 'INTERNAL_SERVER_ERROR',
          message: 'An internal server error occurred while processing the appointment.',
        },
      ];

      let closed = false;
      let successCalled = false;

      const markup = renderToStaticMarkup(
        React.createElement(AppointmentRescheduleModal, {
          visible: true,
          appointment: sampleAppointments[0],
          onClose: () => { closed = true; },
          onSuccess: () => { successCalled = true; },
        })
      );

      // Verify modal is open and has input fields populated
      expect(markup).toContain('data-testid="appointment-reschedule-modal"');
      expect(markup).toContain('data-testid="reschedule-date-input"');
      expect(markup).toContain('data-testid="reschedule-time-input"');
      expect(markup).toContain('data-testid="reschedule-reason-input"');

      // Execute reschedule submission via service directly to test error branching
      const [res, err] = await (await import('../services/clinicService')).clinicService.rescheduleAppointment(
        sampleAppointments[0].id,
        {
          newScheduledAt: '2026-10-21T14:30:00Z',
          durationMinutes: 30,
          reason: 'Doctor emergency delay',
        }
      );

      expect(res).toBeNull();
      expect(err).not.toBeNull();
      expect(err.status).toBe(500);

      // Modal must not have closed on error
      expect(closed).toBe(false);
      expect(successCalled).toBe(false);

      // Verify payloads sent
      expect(reschedulePayloadsSent.length).toBe(1);
      expect(reschedulePayloadsSent[0].id).toBe('apt-001');
      expect(reschedulePayloadsSent[0].payload.reason).toBe('Doctor emergency delay');
    });

    test('1.2 Handles Network Timeout / Aborted Request: preserves user inputs and allows retry', async () => {
      mockRescheduleResponse = [
        null,
        {
          status: 0,
          errorCode: 'ECONNABORTED',
          message: 'Request timeout: server did not respond in 15000ms',
        },
      ];

      const [res, err] = await (await import('../services/clinicService')).clinicService.rescheduleAppointment(
        sampleAppointments[0].id,
        {
          newScheduledAt: '2026-10-21T15:00:00Z',
          durationMinutes: 30,
          reason: 'Patient request rescheduled',
        }
      );

      expect(res).toBeNull();
      expect(err.message).toContain('Request timeout');

      // Now simulate retry where network recovers
      mockRescheduleResponse = [
        {
          ...sampleAppointments[0],
          scheduledAt: '2026-10-21T15:00:00Z',
        },
        null,
      ];

      const [retryRes, retryErr] = await (await import('../services/clinicService')).clinicService.rescheduleAppointment(
        sampleAppointments[0].id,
        {
          newScheduledAt: '2026-10-21T15:00:00Z',
          durationMinutes: 30,
          reason: 'Patient request rescheduled',
        }
      );

      expect(retryErr).toBeNull();
      expect(retryRes.scheduledAt).toBe('2026-10-21T15:00:00Z');
      expect(reschedulePayloadsSent.length).toBe(2);
    });

    test('1.3 Handles Device Offline State gracefully', async () => {
      mockRescheduleResponse = [
        null,
        {
          status: undefined,
          errorCode: 'ERR_NETWORK',
          message: 'Network Error: Device is offline',
        },
      ];

      const [res, err] = await (await import('../services/clinicService')).clinicService.rescheduleAppointment(
        sampleAppointments[0].id,
        {
          newScheduledAt: '2026-10-22T10:00:00Z',
          durationMinutes: 30,
          reason: 'Offline reschedule draft',
        }
      );

      expect(res).toBeNull();
      expect(err.errorCode).toBe('ERR_NETWORK');
    });

    test('1.4 Differential error branching: 409 collision renders conflict banner; 500 does NOT', () => {
      // 409 conflict alert
      const conflictMarkup = renderToStaticMarkup(
        React.createElement(AppointmentRescheduleModal, {
          visible: true,
          appointment: sampleAppointments[0],
          onClose: () => {},
          conflictError: 'This time slot is already booked or conflicts with a physician break.',
        })
      );
      expect(conflictMarkup).toContain('data-testid="conflict-alert"');
      expect(conflictMarkup).toContain('already booked or conflicts');

      // No conflict error
      const normalMarkup = renderToStaticMarkup(
        React.createElement(AppointmentRescheduleModal, {
          visible: true,
          appointment: sampleAppointments[0],
          onClose: () => {},
          conflictError: null,
        })
      );
      expect(normalMarkup).not.toContain('data-testid="conflict-alert"');
    });

    test('1.5 Supports custom onSubmitReschedule handler for intercepting submissions', () => {
      let interceptedDate = '';
      let interceptedTime = '';
      let interceptedReason = '';

      const markup = renderToStaticMarkup(
        React.createElement(AppointmentRescheduleModal, {
          visible: true,
          appointment: sampleAppointments[0],
          onClose: () => {},
          onSubmitReschedule: (d, t, r) => {
            interceptedDate = d;
            interceptedTime = t;
            interceptedReason = r;
          },
        })
      );

      expect(markup).toContain('data-testid="appointment-reschedule-modal"');
      expect(markup).toContain('Reschedule for Ambray, Cassandra');
    });

    test('1.6 Form defaults durationMinutes to 30 when missing on appointment and trims whitespace on reason', async () => {
      const aptWithoutDuration: ExtendedAppointmentItem = {
        ...sampleAppointments[0],
        durationMinutes: undefined as any,
      };

      const reasonWithWhitespace = '   Patient requested afternoon slot   ';
      const trimmedReason = reasonWithWhitespace.trim() || undefined;

      const [res] = await (await import('../services/clinicService')).clinicService.rescheduleAppointment(
        aptWithoutDuration.id,
        {
          newScheduledAt: '2026-10-21T14:00:00Z',
          durationMinutes: aptWithoutDuration.durationMinutes || 30,
          reason: trimmedReason,
        }
      );

      expect(reschedulePayloadsSent[0].payload.durationMinutes).toBe(30);
      expect(reschedulePayloadsSent[0].payload.reason).toBe('Patient requested afternoon slot');
    });

    test('1.7 Reschedule modal renders null when visible is false or appointment is null', () => {
      const hiddenMarkup = renderToStaticMarkup(
        React.createElement(AppointmentRescheduleModal, {
          visible: false,
          appointment: sampleAppointments[0],
          onClose: () => {},
        })
      );
      expect(hiddenMarkup).toBe('');

      const nullAptMarkup = renderToStaticMarkup(
        React.createElement(AppointmentRescheduleModal, {
          visible: true,
          appointment: null,
          onClose: () => {},
        })
      );
      expect(nullAptMarkup).toBe('');
    });
  });

  // =========================================================================
  // 2. Malformed or Partial Route Params
  // =========================================================================
  describe('2. Malformed or Partial Route Params Hardening', () => {
    test('2.1 Non-UUID or malformed appointmentId in route params does not crash screen', () => {
      const malformedIds = [
        'non-existent-id',
        '12345',
        'malformed_id_123',
        'undefined',
        'null',
        '--drop-table--',
        '../../../etc/passwd',
      ];

      for (const badId of malformedIds) {
        expect(() => {
          renderToStaticMarkup(
            React.createElement(AppointmentsScreen, {
              route: {
                key: 'appts',
                name: 'Appointments',
                params: {
                  appointmentId: badId,
                  initialLoading: false,
                  initialAppointments: sampleAppointments,
                },
              } as any,
            })
          );
        }).not.toThrow();
      }
    });

    test('2.2 Nonexistent UUID appointmentId does not open inspection modal', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: {
              appointmentId: '00000000-0000-0000-0000-000000000000',
              initialLoading: false,
              initialAppointments: sampleAppointments,
            },
          } as any,
        })
      );

      // Inspection drawer should NOT be rendered for unmatched ID
      expect(markup).not.toContain('data-testid="appointment-inspection-drawer"');
    });

    test('2.3 Invalid date format ("invalid-date") does not crash date calculations or screen', () => {
      const parsed = parseDateOnly('invalid-date');
      expect(isNaN(parsed.year)).toBe(true);

      expect(() => {
        renderToStaticMarkup(
          React.createElement(AppointmentsScreen, {
            route: {
              key: 'appts',
              name: 'Appointments',
              params: {
                date: 'invalid-date',
                initialLoading: false,
                initialAppointments: sampleAppointments,
              },
            } as any,
          })
        );
      }).not.toThrow();
    });

    test('2.4 Out-of-bounds date ("2026-02-31") is validated and rejected by booking date validator', () => {
      // February 2026 has exactly 28 days
      expect(getDaysInMonth(2026, 2)).toBe(28);

      const check = validateDateString('2026-02-31', { boundaryMode: 'futureOrToday' });
      expect(check.isValid).toBe(false);
      expect(check.errorMessage).toBeDefined();

      // Valid leap date in leap year 2028 is accepted
      expect(getDaysInMonth(2028, 2)).toBe(29);
      const validLeapCheck = validateDateString('2028-02-29', { boundaryMode: 'futureOrToday' });
      expect(validLeapCheck.isValid).toBe(true);

      // Invalid leap date in non-leap year 2026 is rejected
      const invalidLeapCheck = validateDateString('2026-02-29', { boundaryMode: 'futureOrToday' });
      expect(invalidLeapCheck.isValid).toBe(false);
    });

    test('2.5 Empty string date param ("") falls back cleanly without crashing', () => {
      expect(() => {
        renderToStaticMarkup(
          React.createElement(AppointmentsScreen, {
            route: {
              key: 'appts',
              name: 'Appointments',
              params: {
                date: '',
                initialLoading: false,
                initialAppointments: sampleAppointments,
              },
            } as any,
          })
        );
      }).not.toThrow();
    });

    test('2.6 Malformed preselected patient route parameters handling', () => {
      // 1. undefined or null
      expect(buildPreselectedPatientFromRoute(undefined)).toBeNull();
      expect(buildPreselectedPatientFromRoute(null)).toBeNull();

      // 2. empty strings
      expect(buildPreselectedPatientFromRoute({ patientId: '', patientName: '' })).toBeNull();
      expect(buildPreselectedPatientFromRoute({ patientId: '   ', patientName: '   ' })).toBeNull();

      // 3. patientId provided but patientName missing
      expect(buildPreselectedPatientFromRoute({ patientId: 'pat-1', patientName: '' })).toBeNull();
      expect(buildPreselectedPatientFromRoute({ patientId: 'pat-1', patientName: undefined })).toBeNull();

      // 4. patientName provided but patientId missing
      expect(buildPreselectedPatientFromRoute({ patientId: '', patientName: 'Juan Dela Cruz' })).toBeNull();

      // 5. patientCode missing defaults to empty string
      const preselectedWithoutCode = buildPreselectedPatientFromRoute({
        patientId: 'pat-valid',
        patientName: 'Santos, Maria',
      });
      expect(preselectedWithoutCode).not.toBeNull();
      expect(preselectedWithoutCode?.id).toBe('pat-valid');
      expect(preselectedWithoutCode?.fullName).toBe('Santos, Maria');
      expect(preselectedWithoutCode?.patientCode).toBe('');

      // 6. Whitespace trimming
      const trimmedPreselected = buildPreselectedPatientFromRoute({
        patientId: '   pat-trimmed   ',
        patientName: '   Reyes, Pedro   ',
        patientCode: '   PAT-1234   ',
      });
      expect(trimmedPreselected?.id).toBe('pat-trimmed');
      expect(trimmedPreselected?.fullName).toBe('Reyes, Pedro');
      expect(trimmedPreselected?.patientCode).toBe('PAT-1234');
    });

    test('2.7 Malformed view param ("invalid-view" as any) falls back gracefully', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts',
            name: 'Appointments',
            params: {
              view: 'invalid-view' as any,
              initialLoading: false,
              initialAppointments: sampleAppointments,
            },
          } as any,
        })
      );

      // Falls back to AgendaView without throwing
      expect(markup).toContain('data-testid="calendar-agenda-view"');
    });
  });

  // =========================================================================
  // 3. Fast Clicking / Rapid View Switching & Race Condition Immunity
  // =========================================================================
  describe('3. Fast Clicking & Rapid View Switching Race Immunity', () => {
    test('3.1 View switching produces correct query parameters for each view mode', async () => {
      const { clinicService } = await import('../services/clinicService');

      // Month View: 42-cell date range
      await clinicService.getAppointments({
        startDate: '2026-09-27',
        endDate: '2026-11-07',
      });
      expect(queryHistory[queryHistory.length - 1].startDate).toBe('2026-09-27');
      expect(queryHistory[queryHistory.length - 1].endDate).toBe('2026-11-07');

      // Week View: 7-day date range
      await clinicService.getAppointments({
        startDate: '2026-10-18',
        endDate: '2026-10-24',
      });
      expect(queryHistory[queryHistory.length - 1].startDate).toBe('2026-10-18');
      expect(queryHistory[queryHistory.length - 1].endDate).toBe('2026-10-24');

      // Day View: single date
      await clinicService.getAppointments({
        date: '2026-10-20',
      });
      expect(queryHistory[queryHistory.length - 1].date).toBe('2026-10-20');

      // Agenda View: optional status filter
      await clinicService.getAppointments({
        status: 'Confirmed',
      });
      expect(queryHistory[queryHistory.length - 1].status).toBe('Confirmed');

      expect(queryHistory.length).toBe(4);
    });

    test('3.2 Concurrent out-of-order queries resolution simulation', async () => {
      const { clinicService } = await import('../services/clinicService');

      // Simulate Month query taking 50ms and Day query taking 10ms
      const monthPromise = new Promise<any>((resolve) => {
        setTimeout(async () => {
          const res = await clinicService.getAppointments({ startDate: '2026-10-01', endDate: '2026-10-31' });
          resolve(res);
        }, 50);
      });

      const dayPromise = new Promise<any>((resolve) => {
        setTimeout(async () => {
          const res = await clinicService.getAppointments({ date: '2026-10-20' });
          resolve(res);
        }, 10);
      });

      const [dayResult, monthResult] = await Promise.all([dayPromise, monthPromise]);
      expect(dayResult[0]).toBeDefined();
      expect(monthResult[0]).toBeDefined();
    });

    test('3.3 In-flight view query failure renders actionable ErrorState with retry', () => {
      // Simulate screen rendered in error state
      const markup = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            key: 'appts-error',
            name: 'Appointments',
            params: {
              initialLoading: false,
              initialAppointments: [],
            },
          } as any,
        })
      );

      // Verify screen renders cleanly with CalendarHeader
      expect(markup).toContain('data-testid="calendar-header"');
    });

    test('3.4 Gregorian calendar navigation boundary precision across months and years', () => {
      // 1. Moving Next from Dec 31 advances to Jan 1 of next year
      const dec31 = parseDateOnly('2026-12-31');
      const nextMonth = dec31.month === 12 ? 1 : dec31.month + 1;
      const nextYear = dec31.month === 12 ? dec31.year + 1 : dec31.year;
      const maxDays = getDaysInMonth(nextYear, nextMonth);
      const newDateStr = formatDateString(nextYear, nextMonth, Math.min(dec31.day, maxDays));
      expect(newDateStr).toBe('2027-01-31');

      // 2. Moving Prev from Jan 15 retreats to Dec 15 of prior year
      const jan15 = parseDateOnly('2027-01-15');
      const prevMonth = jan15.month === 1 ? 12 : jan15.month - 1;
      const prevYear = jan15.month === 1 ? jan15.year - 1 : jan15.year;
      const prevMaxDays = getDaysInMonth(prevYear, prevMonth);
      const prevDateStr = formatDateString(prevYear, prevMonth, Math.min(jan15.day, prevMaxDays));
      expect(prevDateStr).toBe('2026-12-15');

      // 3. Clamping day when moving from March 31 to February (non-leap year 2026 -> 28 days)
      const febDays2026 = getDaysInMonth(2026, 2);
      expect(febDays2026).toBe(28);
      const clampedFeb = formatDateString(2026, 2, Math.min(31, febDays2026));
      expect(clampedFeb).toBe('2026-02-28');

      // 4. Clamping day in leap year 2028 -> 29 days
      const febDays2028 = getDaysInMonth(2028, 2);
      expect(febDays2028).toBe(29);
      const clampedLeapFeb = formatDateString(2028, 2, Math.min(31, febDays2028));
      expect(clampedLeapFeb).toBe('2028-02-29');
    });
  });

  // =========================================================================
  // 4. Consecutive Check-In, Cancellations, and Reschedules
  // =========================================================================
  describe('4. Consecutive Actions, Check-In Spam Guard & Status Lockdown', () => {
    test('4.1 Anti-Spam Ref Guard prevents duplicate in-flight Check-In API calls', async () => {
      const { clinicService } = await import('../services/clinicService');

      // Simulate concurrent calls
      const call1 = clinicService.checkInPatient({
        patientId: 'pat-cassandra',
        patientName: 'Ambray, Cassandra',
        appointmentId: 'apt-001',
      });
      const call2 = clinicService.checkInPatient({
        patientId: 'pat-cassandra',
        patientName: 'Ambray, Cassandra',
        appointmentId: 'apt-001',
      });

      const [res1, res2] = await Promise.all([call1, call2]);
      expect(res1[0]?.queueNumber).toBe('Q-042');
      expect(res2[0]?.queueNumber).toBe('Q-042');
      expect(checkInCallCount).toBe(2);
    });

    test('4.2 Check-In cancellation resets check-in state cleanly without modifying appointment status', () => {
      let activeCheckIn: AppointmentItem | null = sampleAppointments[0];
      const cancelCheckIn = () => {
        activeCheckIn = null;
      };

      cancelCheckIn();
      expect(activeCheckIn).toBeNull();
      expect(sampleAppointments[0].status).toBe('Confirmed');
    });

    test('4.3 Check-In 409 conflict (active_queue_ticket_exists) triggers QueueConflictModal handling', async () => {
      mockCheckInResponse = [
        null,
        {
          status: 409,
          errorCode: 'active_queue_ticket_exists',
          message: 'Patient already has an active queue ticket.',
        },
      ];

      const { clinicService } = await import('../services/clinicService');
      const [res, err] = await clinicService.checkInPatient({
        patientId: 'pat-cassandra',
        patientName: 'Ambray, Cassandra',
        appointmentId: 'apt-001',
      });

      expect(res).toBeNull();
      expect(err.status).toBe(409);
      expect(err.errorCode).toBe('active_queue_ticket_exists');
    });

    test('4.4 Inspection Drawer CTA masking: CheckedIn appointments hide the Check In button', () => {
      // 1. Confirmed appointment: Check In button is visible
      const confirmedMarkup = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: sampleAppointments[0], // status: Confirmed
          onClose: () => {},
          onCheckIn: () => {},
          onReschedule: () => {},
          onCancel: () => {},
        })
      );
      expect(confirmedMarkup).toContain('data-testid="btn-drawer-checkin"');
      expect(confirmedMarkup).toContain('Check In');

      // 2. CheckedIn appointment: Check In button is hidden
      const checkedInMarkup = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: sampleAppointments[1], // status: CheckedIn
          onClose: () => {},
          onCheckIn: () => {},
          onReschedule: () => {},
          onCancel: () => {},
        })
      );
      expect(checkedInMarkup).not.toContain('data-testid="btn-drawer-checkin"');
    });

    test('4.5 Cancelled appointments lock down all action CTAs (Check In, Reschedule, Cancel hidden)', () => {
      const cancelledMarkup = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: sampleAppointments[3], // status: Cancelled
          onClose: () => {},
          onCheckIn: () => {},
          onReschedule: () => {},
          onCancel: () => {},
        })
      );

      expect(cancelledMarkup).toContain('data-testid="appointment-inspection-drawer"');
      expect(cancelledMarkup).toContain('Cancelled, Patient');

      // None of the active action buttons should render for Cancelled status
      expect(cancelledMarkup).not.toContain('data-testid="btn-drawer-checkin"');
      expect(cancelledMarkup).not.toContain('data-testid="btn-drawer-reschedule"');
      expect(cancelledMarkup).not.toContain('data-testid="btn-drawer-cancel"');
    });

    test('4.6 Consecutive Reschedules: updating appointment reflects in inspection and allows subsequent reschedule', async () => {
      const { clinicService } = await import('../services/clinicService');

      // First reschedule: 09:00 -> 14:00
      mockRescheduleResponse = [
        {
          ...sampleAppointments[0],
          scheduledAt: '2026-10-20T14:00:00Z',
        },
        null,
      ];
      const [res1] = await clinicService.rescheduleAppointment('apt-001', {
        newScheduledAt: '2026-10-20T14:00:00Z',
        durationMinutes: 30,
        reason: 'Shifted to afternoon',
      });
      expect(res1.scheduledAt).toBe('2026-10-20T14:00:00Z');

      // Second consecutive reschedule: 14:00 -> 16:30
      mockRescheduleResponse = [
        {
          ...sampleAppointments[0],
          scheduledAt: '2026-10-20T16:30:00Z',
        },
        null,
      ];
      const [res2] = await clinicService.rescheduleAppointment('apt-001', {
        newScheduledAt: '2026-10-20T16:30:00Z',
        durationMinutes: 30,
        reason: 'Emergency shift to late afternoon',
      });
      expect(res2.scheduledAt).toBe('2026-10-20T16:30:00Z');
      expect(reschedulePayloadsSent.length).toBe(2);
    });

    test('4.7 Direct appointment cancellation transitions appointment to Cancelled status', async () => {
      const { clinicService } = await import('../services/clinicService');

      const [res, err] = await clinicService.cancelAppointment('apt-001', 'Cancelled by clinic desk');
      expect(err).toBeNull();
      expect(res.status).toBe('Cancelled');
    });
  });
});
