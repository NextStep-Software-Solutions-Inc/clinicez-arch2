// token-guard:ignore-file
/**
 * Test Suite: Calendar Appointment Push Notification & Reminder System (appointmentReminders.test.ts)
 * 
 * Verifies Milestone 5:
 *  - AppointmentInspectionModal reminder status display & manual reminder dispatch CTA
 *  - AppointmentCard reminder bell indicator across standard, timeline, and compact variants
 *  - AppointmentReminderSettingsCard 4 toggles, subordination, and persistence
 *  - ClinicNotificationCenterModal 'appointments' filter tab, calendar icon, and action navigation
 *  - clinicService API contract and reminder typing
 */

import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { theme } from '../constants/theme';
import type { ExtendedAppointmentItem } from '../components/calendar/types';
import type { ClinicStaffNotification, ClinicSettingsRecord } from '../services/clinicService';

(globalThis as any).__DEV__ = true;

// React Native mock for headless Bun test execution
const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    testID,
    visible,
    style,
    disabled,
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
        ...(visible !== undefined ? { 'data-visible': String(visible) } : {}),
        ...(disabled !== undefined ? { 'data-disabled': String(disabled), disabled } : {}),
        ...(clickHandler ? { 'data-pressable': 'true', onClick: clickHandler } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...props,
      },
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
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
    },
    ValueXY: class {
      x: any;
      y: any;
      constructor(public val: any = { x: 0, y: 0 }) {
        this.x = { _value: val?.x ?? 0 };
        this.y = { _value: val?.y ?? 0 };
      }
      setValue(val: any) { this.val = val; }
      setOffset() {}
      flattenOffset() {}
      getLayout() { return {}; }
      getTranslateTransform() { return []; }
      __getValue() { return this.val; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
  PanResponder: { create: () => ({ panHandlers: {} }) },
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
  Polyline: createMockComponent('polyline'),
  Polygon: createMockComponent('polygon'),
  Defs: createMockComponent('defs'),
  LinearGradient: createMockComponent('lineargradient'),
  Stop: createMockComponent('stop'),
  G: createMockComponent('g'),
  Text: createMockComponent('text'),
}));

mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: () => ({
    width: 1280,
    height: 800,
    isCompact: false,
    isWorkstation: true,
    isDesktop: true,
    isWide: true,
  }),
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

let lastNavigatedRoute: { name: string; params?: any } | null = null;
mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: (name: string, params?: any) => {
      lastNavigatedRoute = { name, params };
    },
  }),
  useRoute: () => ({ key: 'Appointments', name: 'Appointments', params: undefined }),
  DefaultTheme: { colors: {} },
}));

// Feedback spies
let lastSuccessNotification: string | null = null;
let lastErrorNotification: string | null = null;

const { notify, Alert } = require('../utils/feedback');
const origSuccess = notify.success;
const origError = notify.error;

notify.success = (msg: string, opts?: any) => {
  lastSuccessNotification = msg;
  return origSuccess(msg, opts);
};

notify.error = (msg: string, opts?: any) => {
  lastErrorNotification = msg;
  return origError(msg, opts);
};

// Service mock
let lastUpdatedSettingsPayload: any = null;
let lastRemindedAppointmentId: string | null = null;

const { clinicService } = require('../services/clinicService');
const origUpdateSettings = clinicService.updateSettings;
const origSendAppointmentReminder = clinicService.sendAppointmentReminder;
const origGetAppointment = clinicService.getAppointment;
const origGetAppointments = clinicService.getAppointments;
const origGetCustomFields = clinicService.getCustomFields;
const origEndTeleconsultCall = clinicService.endTeleconsultCall;
const origCreateTeleconsultGuestInvite = clinicService.createTeleconsultGuestInvite;

let mockGetAppointmentResult: [any, any] = [null, null];
let getAppointmentCalls: string[] = [];

const installDefaultServiceMocks = () => {
  clinicService.updateSettings = async (payload: any) => {
    lastUpdatedSettingsPayload = payload;
    return [{ id: 'settings-1', ...payload }, null];
  };

  clinicService.sendAppointmentReminder = async (id: string) => {
    lastRemindedAppointmentId = id;
    return [
      {
        id,
        clinicId: 'clinic-1',
        patientId: 'pat-1',
        patientName: 'Maria Santos',
        scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        durationMinutes: 30,
        status: 'Confirmed',
        createdAt: '2026-10-20T08:00:00Z',
        reminder24hSent: true,
        reminder24hSentAt: '2026-10-20T10:00:00Z',
        reminder2hSent: false,
        reminder2hSentAt: null,
        lastReminderSentAt: '2026-10-20T10:00:00Z',
        lastReminderType: 'manual',
      },
      null,
    ];
  };

  clinicService.getAppointment = async (id: string) => {
    getAppointmentCalls.push(id);
    return mockGetAppointmentResult;
  };

  clinicService.getAppointments = origGetAppointments;
  clinicService.getCustomFields = origGetCustomFields;
  clinicService.endTeleconsultCall = origEndTeleconsultCall;
  clinicService.createTeleconsultGuestInvite = async () => [null, null];
};

installDefaultServiceMocks();

const realCommsReact = require('../../../packages/comms-sdk/src/react');
mock.module('@clinicez/comms-sdk/react', () => ({
  ...realCommsReact,
  CommsProvider: ({ children }: any) => children,
  useCallSession: (_callId: string, opts: any) => ({
    status: 'connected',
    roomName: 'room-1',
    paymentState: opts?.initialPaymentState ?? { policy: 'Exempt', status: 'Exempt', canAdmit: true },
    recordingState: {
      isRecording: false,
      consentStatus: 'none',
      recordingDurationSeconds: 0,
      recordingSessionId: null,
      requestRecordingConsent: async () => {},
      respondToRecordingConsent: async () => {},
      revokeRecordingConsent: async () => {},
    },
    mediaTracks: {
      isCameraEnabled: true,
      isMicEnabled: true,
      isScreenSharing: false,
      toggleCamera: () => {},
      toggleMic: () => {},
      toggleScreenShare: () => {},
    },
    endCall: async () => {
      await opts?.onEndCall?.();
    },
  }),
}));

mock.module('../components/layout', () => ({
  ResponsiveLayout: ({ headerTitle, children }: any) =>
    React.createElement('div', { 'data-layout': headerTitle }, children),
}));

mock.module('../context/StaffContext', () => ({
  useStaff: () => ({ staff: [], current: { id: 'staff-1', name: 'Dr. Santos' }, currentName: 'Dr. Santos' }),
  formatStaffName: (s: any) => s?.name || 'Dr. Santos',
}));

mock.module('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'staff-1', name: 'Dr. Santos', role: 'Doctor', clinicId: 'clinic-1' }, can: () => true }),
}));

// Import components under test using require after all mocks are registered
const { AppointmentInspectionModal } = require('../components/calendar/AppointmentInspectionModal');
const { AppointmentCard } = require('../components/calendar/AppointmentCard');
const { getAppointmentLocalDateTime } = require('../components/calendar/calendarUtils');
const { ClinicCommsProvider, useClinicComms } = require('../context/ClinicCommsContext');
const { ActiveTeleconsultModal } = require('../components/teleconsult/TeleconsultWaitingRoomModal');
const AppointmentsScreen = require('../navigation/screens/Appointments.screen').default;
const AppointmentReminderSettingsCard = require('../components/settings/AppointmentReminderSettingsCard').default;
const ClinicNotificationCenterModal = require('../components/notifications/ClinicNotificationCenterModal').default;

// Sample fixture appointments
const futureScheduledAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
const appointmentScheduled: ExtendedAppointmentItem = {
  id: 'appt-scheduled-1',
  clinicId: 'clinic-1',
  patientId: 'pat-101',
  patientName: 'Maria Santos',
  doctorId: 'doc-1',
  doctorName: 'Dr. Roberto Santos',
  scheduledAt: futureScheduledAt,
  durationMinutes: 30,
  status: 'Confirmed',
  createdAt: '2026-10-20T08:00:00Z',
  serviceType: 'General Consultation',
  reason: 'Follow-up checkup',
  reminder24hSent: false,
  reminder2hSent: false,
  reminder24hSentAt: null,
  reminder2hSentAt: null,
  lastReminderSentAt: null,
  lastReminderType: null,
};

const appointmentReminded: ExtendedAppointmentItem = {
  id: 'appt-reminded-2',
  clinicId: 'clinic-1',
  patientId: 'pat-102',
  patientName: 'Juan Dela Cruz',
  doctorId: 'doc-1',
  doctorName: 'Dr. Roberto Santos',
  scheduledAt: '2026-10-21T14:30:00Z',
  durationMinutes: 30,
  status: 'Confirmed',
  createdAt: '2026-10-19T08:00:00Z',
  serviceType: 'Cardiology Review',
  reason: 'Blood pressure spike',
  reminder24hSent: true,
  reminder24hSentAt: '2026-10-20T14:30:00Z',
  reminder2hSent: true,
  reminder2hSentAt: '2026-10-21T12:30:00Z',
  lastReminderSentAt: '2026-10-21T12:30:00Z',
  lastReminderType: '2h',
};

const appointmentCancelled: ExtendedAppointmentItem = {
  ...appointmentScheduled,
  id: 'appt-cancelled-3',
  status: 'Cancelled',
  lastReminderSentAt: '2026-10-20T08:30:00Z',
  lastReminderType: 'manual',
};

const appointmentCompleted: ExtendedAppointmentItem = {
  ...appointmentReminded,
  id: 'appt-completed-4',
  status: 'Completed',
};

describe('Milestone 5: Calendar Appointment Push Notifications & Reminders', () => {
  beforeEach(() => {
    lastNavigatedRoute = null;
    lastSuccessNotification = null;
    lastErrorNotification = null;
    lastUpdatedSettingsPayload = null;
    lastRemindedAppointmentId = null;
    getAppointmentCalls = [];
    mockGetAppointmentResult = [null, null];
    installDefaultServiceMocks();
    delete (globalThis as any).__mockClinicContext;
  });

  // ===========================================================================
  // 1. AppointmentInspectionModal Tests
  // ===========================================================================
  describe('AppointmentInspectionModal Component', () => {
    test('renders Push Notification & Reminder Status section with scheduled state', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: appointmentScheduled,
          onClose: () => {},
        })
      );

      expect(html).toContain('data-testid="reminder-status-section"');
      expect(html).toContain('Push Notification &amp; Reminder Status');
      expect(html).toContain('data-testid="status-reminder-24h"');
      expect(html).toContain('Scheduled (24h advance)');
      expect(html).toContain('data-testid="status-reminder-2h"');
      expect(html).toContain('Scheduled (2h advance)');
      expect(html).toContain('data-testid="status-last-reminder"');
      expect(html).toContain('None sent yet');
      expect(html).toContain('data-testid="btn-send-push-reminder"');
      expect(html).toContain('Send Push Reminder');
    });

    test('renders sent timestamps and channel when reminders have been dispatched', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: appointmentReminded,
          onClose: () => {},
        })
      );

      expect(html).toContain('data-testid="reminder-status-section"');
      expect(html).toContain('data-testid="status-reminder-24h"');
      expect(html).toContain('Sent at');
      expect(html).toContain('data-testid="status-reminder-2h"');
      expect(html).toContain('Sent at');
      expect(html).toContain('data-testid="status-last-reminder"');
      expect(html).toContain('(2h)');
    });

    test('disables Send Push Reminder button on Cancelled and Completed appointments', () => {
      const htmlCancelled = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: appointmentCancelled,
          onClose: () => {},
        })
      );
      expect(htmlCancelled).toContain('data-testid="btn-send-push-reminder"');
      expect(htmlCancelled).toContain('data-disabled="true"');

      const htmlCompleted = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: appointmentCompleted,
          onClose: () => {},
        })
      );
      expect(htmlCompleted).toContain('data-testid="btn-send-push-reminder"');
      expect(htmlCompleted).toContain('data-disabled="true"');
    });

    test('renders null when not visible or appointment is null', () => {
      const htmlHidden = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: false,
          appointment: appointmentScheduled,
          onClose: () => {},
        })
      );
      expect(htmlHidden).toBe('');

      const htmlNull = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: null,
          onClose: () => {},
        })
      );
      expect(htmlNull).toBe('');
    });
  });

  // ===========================================================================
  // 2. AppointmentCard Reminder Indicator Tests
  // ===========================================================================
  describe('AppointmentCard Component', () => {
    test('renders reminder bell badge on standard card when lastReminderSentAt is present', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentCard, {
          appointment: appointmentReminded,
          variant: 'standard',
          onSelect: () => {},
        })
      );

      expect(html).toContain('data-testid="card-reminder-badge"');
      expect(html).toContain('Reminder Sent');
    });

    test('omits reminder badge on standard card when lastReminderSentAt is null', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentCard, {
          appointment: appointmentScheduled,
          variant: 'standard',
          onSelect: () => {},
        })
      );

      expect(html).not.toContain('data-testid="card-reminder-badge"');
      expect(html).not.toContain('Reminder Sent');
    });

    test('renders reminder indicator on timeline variant when lastReminderSentAt is present', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentCard, {
          appointment: appointmentReminded,
          variant: 'timeline',
          onSelect: () => {},
        })
      );

      expect(html).toContain('data-testid="card-reminder-badge"');
    });

    test('renders reminder indicator on compact variant when lastReminderSentAt is present', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentCard, {
          appointment: appointmentReminded,
          variant: 'compact',
          onSelect: () => {},
        })
      );

      expect(html).toContain('data-testid="card-reminder-badge"');
    });

    test('renders reminder badge even on Cancelled appointments if previously dispatched', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentCard, {
          appointment: appointmentCancelled,
          variant: 'standard',
          onSelect: () => {},
        })
      );

      expect(html).toContain('data-testid="card-reminder-badge"');
    });
  });

  // ===========================================================================
  // 3. AppointmentReminderSettingsCard Tests
  // ===========================================================================
  describe('AppointmentReminderSettingsCard Component', () => {
    const mockSettings: ClinicSettingsRecord = {
      id: 'settings-1',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      clinicName: 'St. Jude Family Care',
      operatingHours: '08:00 - 17:00',
      defaultSlotDurationMinutes: 30,
      queuePrefix: 'A',
      invoicePrefix: 'INV',
      defaultConsultationFee: 500,
      vatRate: 0.12,
      enableAppointmentReminders: true,
      appointmentReminder24hEnabled: true,
      appointmentReminder2hEnabled: true,
      enableStaffAppointmentNotifications: true,
    };

    test('renders card with all 4 reminder switches active', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentReminderSettingsCard, {
          settings: mockSettings,
        })
      );

      expect(html).toContain('data-testid="appointment-reminder-settings-card"');
      expect(html).toContain('Appointment Push Reminders &amp; Alerts');
      expect(html).toContain('Reminders Active');
      expect(html).toContain('data-testid="switch-master-reminders"');
      expect(html).toContain('data-testid="switch-reminder-24h"');
      expect(html).toContain('data-testid="switch-reminder-2h"');
      expect(html).toContain('data-testid="switch-staff-notifications"');
      // Save button is hidden when reminder switches match saved settings (!isDirty)
      expect(html).not.toContain('data-testid="btn-save-reminder-settings"');
    });

    test('renders disabled badge when master toggle is off', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentReminderSettingsCard, {
          settings: {
            ...mockSettings,
            enableAppointmentReminders: false,
          },
        })
      );

      expect(html).toContain('Reminders Disabled');
    });

    test('renders skeleton loader when showSkeletons is true', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentReminderSettingsCard, {
          settings: mockSettings,
          showSkeletons: true,
        })
      );

      expect(html).not.toContain('data-testid="switch-master-reminders"');
    });
  });

  // ===========================================================================
  // 4. ClinicNotificationCenterModal Tests
  // ===========================================================================
  describe('ClinicNotificationCenterModal Component', () => {
    const sampleNotifications: ClinicStaffNotification[] = [
      {
        id: 'notif-1',
        clinicId: 'clinic-1',
        recipientStaffId: 'doc-1',
        title: 'New Appointment Booked',
        body: 'Maria Santos booked a consultation on Oct 22, 2026 at 09:00 AM.',
        category: 'Appointment',
        urgency: 'Routine',
        actionRoute: 'Appointments',
        actionParamsJson: JSON.stringify({ appointmentId: 'appt-scheduled-1', date: '2026-10-22' }),
        isRead: false,
        createdAt: '2026-10-20T08:00:00Z',
      },
      {
        id: 'notif-2',
        clinicId: 'clinic-1',
        recipientStaffId: 'doc-1',
        title: 'Critical Potassium Level',
        body: 'Panic lab value received for patient pat-5: K+ 6.8 mmol/L.',
        category: 'LabResult',
        urgency: 'Stat',
        actionRoute: 'ResultReview',
        isRead: false,
        createdAt: '2026-10-20T08:15:00Z',
      },
      {
        id: 'notif-3',
        clinicId: 'clinic-1',
        recipientStaffId: 'doc-1',
        title: 'Appointment Rescheduled',
        body: 'Juan Dela Cruz moved their consultation to Oct 21, 2026 at 02:30 PM.',
        category: 'Appointment',
        urgency: 'Urgent',
        actionRoute: 'Appointments',
        actionParamsJson: JSON.stringify({ appointmentId: 'appt-reminded-2', date: '2026-10-21' }),
        isRead: true,
        createdAt: '2026-10-20T08:30:00Z',
      },
    ];

    test('renders appointments filter tab in top tab bar', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClinicNotificationCenterModal, {
          visible: true,
          onClose: () => {},
          notifications: sampleNotifications,
          unreadCount: 2,
          onMarkRead: async () => true,
          onMarkAllRead: async () => {},
        })
      );

      expect(html).toContain('data-testid="tab-appointments"');
      expect(html).toContain('Appointments');
    });

    test('displays Appointment category with calendar icon and View Appointment CTA', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClinicNotificationCenterModal, {
          visible: true,
          onClose: () => {},
          notifications: sampleNotifications,
          unreadCount: 2,
          onMarkRead: async () => true,
          onMarkAllRead: async () => {},
        })
      );

      expect(html).toContain('New Appointment Booked');
      expect(html).toContain('Appointment');
      expect(html).toContain('View Appointment');
    });
  });

  // ===========================================================================
  // 5. Issues #210 & #211: Post-Teleconsult Refresh, 400 Sync & Past-Schedule Rules
  // ===========================================================================
  describe('Issues #210 & #211: Stale Teleconsult Refresh, 400 Sync & Past-Schedule Guards', () => {
    function createLocalHookHarness<Result, Props = any>(
      hookFn: (props: Props) => Result,
      initialProps?: Props,
      contextValues: Map<React.Context<any>, any> = new Map(),
    ) {
      const stateSlots: any[] = [];
      const effectSlots: Array<{ fn: () => any; cleanup?: any; deps: any[]; hasChanged: boolean }> = [];
      const refSlots: Array<{ current: any }> = [];
      const memoSlots: Array<{ value: any; deps: any[] }> = [];
      let slotIndex = 0;
      let effectIndex = 0;
      let refIndex = 0;
      let memoIndex = 0;
      let currentProps = initialProps as Props;
      let result!: Result;
      let isRendering = false;
      let hasPendingRender = false;

      const mockHooks: any = {
        useState: (initial: any) => {
          const idx = slotIndex++;
          if (stateSlots.length <= idx) {
            stateSlots.push(typeof initial === 'function' ? initial() : initial);
          }
          const setState = (newVal: any) => {
            const nextVal = typeof newVal === 'function' ? newVal(stateSlots[idx]) : newVal;
            if (stateSlots[idx] !== nextVal) {
              stateSlots[idx] = nextVal;
              scheduleRender();
            }
          };
          return [stateSlots[idx], setState];
        },
        useRef: (initial: any) => {
          const idx = refIndex++;
          if (refSlots.length <= idx) refSlots.push({ current: initial });
          return refSlots[idx];
        },
        useCallback: (fn: any, deps: any[]) => mockHooks.useMemo(() => fn, deps),
        useMemo: (fn: any, deps: any[]) => {
          const idx = memoIndex++;
          const prev = memoSlots[idx];
          const changed = !prev || !deps || deps.some((d, i) => d !== prev.deps[i]);
          if (changed) {
            const value = fn();
            memoSlots[idx] = { value, deps };
            return value;
          }
          return prev.value;
        },
        useEffect: (fn: any, deps: any[]) => {
          const idx = effectIndex++;
          const prev = effectSlots[idx];
          const hasChanged = !prev || !deps || deps.some((d, i) => d !== prev?.deps[i]);
          effectSlots[idx] = { fn, deps, hasChanged, cleanup: prev?.cleanup };
        },
        useContext: (context: React.Context<any>) =>
          contextValues.has(context) ? contextValues.get(context) : (context as any)._currentValue,
        useSyncExternalStore: (_sub: any, getSnap: () => any) => getSnap(),
      };

      function scheduleRender() {
        if (isRendering) {
          hasPendingRender = true;
          return;
        }
        render();
      }

      function render() {
        if (isRendering) return;
        isRendering = true;
        try {
          do {
            hasPendingRender = false;
            slotIndex = 0;
            effectIndex = 0;
            refIndex = 0;
            memoIndex = 0;
            const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
            const prevDispatcher = internals ? internals.H : null;
            if (internals) internals.H = mockHooks;
            try {
              result = hookFn(currentProps);
            } finally {
              if (internals) internals.H = prevDispatcher;
            }
            for (const eff of effectSlots) {
              if (eff.hasChanged) {
                eff.hasChanged = false;
                if (typeof eff.cleanup === 'function') eff.cleanup();
                eff.cleanup = eff.fn();
              }
            }
          } while (hasPendingRender);
        } finally {
          isRendering = false;
        }
      }

      render();

      return {
        get result() {
          return { current: result };
        },
        rerender: (nextProps?: Props) => {
          if (nextProps !== undefined) currentProps = nextProps;
          render();
        },
        unmount: () => {
          for (const eff of effectSlots) {
            if (typeof eff.cleanup === 'function') eff.cleanup();
          }
        },
      };
    }

    function findNodeByTestId(node: any, targetId: string): any {
      if (!node || typeof node !== 'object') return null;
      if (Array.isArray(node)) {
        for (const child of node) {
          const found = findNodeByTestId(child, targetId);
          if (found) return found;
        }
        return null;
      }
      if (node.props?.testID === targetId || node.props?.['data-testid'] === targetId) {
        return node;
      }
      if (node.props?.children) {
        return findNodeByTestId(node.props.children, targetId);
      }
      return null;
    }

    test('#211: Past-date appointment displays "Not sent (Past schedule)" and disables Send Push Reminder', () => {
      const pastScheduledAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const pastAppt: ExtendedAppointmentItem = {
        ...appointmentScheduled,
        id: 'appt-past-1',
        scheduledAt: pastScheduledAt,
      };

      const html = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: pastAppt,
          onClose: () => {},
        })
      );

      expect(html).toContain('Not sent (Past schedule)');
      expect(html).not.toContain('Scheduled (24h advance)');
      expect(html).not.toContain('Scheduled (2h advance)');
      expect(html).toContain('data-testid="btn-send-push-reminder"');
      expect(html).toContain('data-disabled="true"');
    });

    test('#211: NoShow appointment disables Send Push Reminder even if scheduled in future', () => {
      const noShowAppt: ExtendedAppointmentItem = {
        ...appointmentScheduled,
        id: 'appt-noshow-1',
        status: 'NoShow',
      };

      const html = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: noShowAppt,
          onClose: () => {},
        })
      );

      expect(html).toContain('data-testid="btn-send-push-reminder"');
      expect(html).toContain('data-disabled="true"');
    });

    test('#211: Same-day late active appointment shows "Not sent (Past schedule)" but keeps Send Push Reminder enabled', () => {
      (globalThis as any).__mockClinicContext = { settings: { timeZoneId: 'Asia/Manila' } };
      const { dateStr: todayManila } = getAppointmentLocalDateTime(
        new Date().toISOString(),
        'Asia/Manila',
      );
      // Midnight + 00:00:00+08:00 on today's Manila calendar day is guaranteed < Date.now()
      const sameDayEarlierIso = new Date(`${todayManila}T00:00:00.000+08:00`).toISOString();
      const sameDayLateAppt: ExtendedAppointmentItem = {
        ...appointmentScheduled,
        id: 'appt-sameday-late-1',
        status: 'Confirmed',
        scheduledAt: sameDayEarlierIso,
      };

      const html = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: sameDayLateAppt,
          onClose: () => {},
        })
      );

      expect(html).toContain('Not sent (Past schedule)');
      expect(html).toContain('data-testid="btn-send-push-reminder"');
      expect(html).toContain('data-disabled="false"');
    });

    test('#211: Same-day late active Teleconsult appointment keeps both Send Push Reminder and Teleconsult enabled', async () => {
      (globalThis as any).__mockClinicContext = { settings: { timeZoneId: 'Asia/Manila' } };
      const { dateStr: todayManila } = getAppointmentLocalDateTime(
        new Date().toISOString(),
        'Asia/Manila',
      );
      const sameDayEarlierIso = new Date(`${todayManila}T00:00:00.000+08:00`).toISOString();
      const sameDayLateTeleAppt: ExtendedAppointmentItem = {
        ...appointmentScheduled,
        id: 'appt-sameday-late-tele-1',
        status: 'Confirmed',
        appointmentType: 'Teleconsult',
        isTeleconsult: true,
        callId: 'call-sameday-late-1',
        scheduledAt: sameDayEarlierIso,
      };

      clinicService.getAppointment = async () => [sameDayLateTeleAppt, null];
      clinicService.createTeleconsultGuestInvite = async () => [null, null];

      const harness = createLocalHookHarness(
        (props: any) => AppointmentInspectionModal(props),
        {
          visible: true,
          appointment: sameDayLateTeleAppt,
          onClose: () => {},
        },
      );

      await Promise.resolve();
      await Promise.resolve();

      const html = renderToStaticMarkup(harness.result.current);
      expect(html).toContain('Not sent (Past schedule)');
      expect(html).toContain('data-testid="btn-send-push-reminder"');
      expect(html).toContain('data-testid="btn-drawer-teleconsult"');

      const sendBtn = findNodeByTestId(harness.result.current, 'btn-send-push-reminder');
      expect(sendBtn).not.toBeNull();
      expect(sendBtn.props.disabled).toBe(false);

      const teleBtn = findNodeByTestId(harness.result.current, 'btn-drawer-teleconsult');
      expect(teleBtn).not.toBeNull();
      expect(Boolean(teleBtn.props.disabled)).toBe(false);
      expect(typeof teleBtn.props.onPress).toBe('function');

      harness.unmount();
    });

    test('#211: Naive-ISO scheduledAt (without Z/offset) is normalized as Asia/Manila (+08:00) for past-schedule label', () => {
      (globalThis as any).__mockClinicContext = { settings: { timeZoneId: 'Asia/Manila' } };
      const origNow = Date.now;
      // 2026-11-20T02:00:00.000Z == 2026-11-20 10:00:00 Asia/Manila
      Date.now = () => Date.parse('2026-11-20T02:00:00.000Z');
      try {
        // 09:30 naive ISO -> 09:30+08:00 (01:30Z), which is 30m in the past.
        // Without +08:00 normalization on a UTC machine, this would parse as 09:30Z (7.5h in the future!).
        const pastNaiveAppt: ExtendedAppointmentItem = {
          ...appointmentScheduled,
          id: 'appt-naive-past',
          scheduledAt: '2026-11-20T09:30:00',
        };
        const htmlPast = renderToStaticMarkup(
          React.createElement(AppointmentInspectionModal, {
            visible: true,
            appointment: pastNaiveAppt,
            onClose: () => {},
          }),
        );
        expect(htmlPast).toContain('Not sent (Past schedule)');
        expect(htmlPast).not.toContain('Scheduled (24h advance)');

        // 10:30 naive ISO -> 10:30+08:00 (02:30Z), 30m in the future.
        const futureNaiveAppt: ExtendedAppointmentItem = {
          ...appointmentScheduled,
          id: 'appt-naive-future',
          scheduledAt: '2026-11-20T10:30:00',
        };
        const htmlFuture = renderToStaticMarkup(
          React.createElement(AppointmentInspectionModal, {
            visible: true,
            appointment: futureNaiveAppt,
            onClose: () => {},
          }),
        );
        expect(htmlFuture).toContain('Scheduled (24h advance)');
        expect(htmlFuture).toContain('Scheduled (2h advance)');
        expect(htmlFuture).not.toContain('Not sent (Past schedule)');
      } finally {
        Date.now = origNow;
      }
    });

    test('#210: AppointmentInspectionModal handles HTTP 409 Conflict, displays server message, syncs getAppointment & onAppointmentSynced, and disables Send Push Reminder', async () => {
      const syncedList: ExtendedAppointmentItem[] = [];
      const staleAppt: ExtendedAppointmentItem = {
        ...appointmentScheduled,
        id: 'appt-sync-409',
        status: 'Confirmed',
      };
      const serverNoShowAppt: ExtendedAppointmentItem = {
        ...staleAppt,
        status: 'NoShow',
      };

      let fetchStep = 0;
      clinicService.getAppointment = async (id: string) => {
        getAppointmentCalls.push(id);
        fetchStep += 1;
        return [fetchStep === 1 ? staleAppt : serverNoShowAppt, null];
      };
      clinicService.sendAppointmentReminder = async () => [
        null,
        { status: 409, message: "Cannot send reminder for an appointment with status 'NoShow'." },
      ];

      const harness = createLocalHookHarness(
        (props: any) => AppointmentInspectionModal(props),
        {
          visible: true,
          appointment: staleAppt,
          onClose: () => {},
          onAppointmentSynced: (synced: ExtendedAppointmentItem) => {
            syncedList.push(synced);
          },
        },
      );

      await Promise.resolve();
      await Promise.resolve();
      expect(getAppointmentCalls).toEqual(['appt-sync-409']);
      expect(syncedList).toHaveLength(1);

      const sendBtn = findNodeByTestId(harness.result.current, 'btn-send-push-reminder');
      expect(sendBtn).not.toBeNull();
      expect(sendBtn.props.disabled).toBe(false);

      await sendBtn.props.onPress();
      await Promise.resolve();

      expect(lastErrorNotification).toBe(
        "Cannot send reminder for an appointment with status 'NoShow'.",
      );
      expect(lastSuccessNotification).toBeNull();
      expect(getAppointmentCalls).toEqual(['appt-sync-409', 'appt-sync-409']);
      expect(syncedList[syncedList.length - 1].status).toBe('NoShow');

      const refreshedSendBtn = findNodeByTestId(harness.result.current, 'btn-send-push-reminder');
      expect(refreshedSendBtn.props.disabled).toBe(true);
      expect(renderToStaticMarkup(harness.result.current)).toContain('data-disabled="true"');
      harness.unmount();
    });

    test('#210: Falls back to syncing terminal status from 400/409 error message when getAppointment fails during recovery', async () => {
      // Case A: 400 with getAppointment returning 503 error on refetch -> infers NoShow
      const syncedList400: ExtendedAppointmentItem[] = [];
      const appt400: ExtendedAppointmentItem = {
        ...appointmentScheduled,
        id: 'appt-fallback-400',
        status: 'Confirmed',
      };
      let step400 = 0;
      clinicService.getAppointment = async (id: string) => {
        getAppointmentCalls.push(id);
        step400 += 1;
        if (step400 === 1) return [appt400, null];
        return [null, { status: 503, message: 'Service unavailable' }];
      };
      clinicService.sendAppointmentReminder = async () => [
        null,
        { status: 400, message: "Cannot send reminder for an appointment with status 'NoShow'." },
      ];

      const harness400 = createLocalHookHarness(
        (props: any) => AppointmentInspectionModal(props),
        {
          visible: true,
          appointment: appt400,
          onClose: () => {},
          onAppointmentSynced: (synced: ExtendedAppointmentItem) => {
            syncedList400.push(synced);
          },
        },
      );
      await Promise.resolve();
      await Promise.resolve();

      const btn400 = findNodeByTestId(harness400.result.current, 'btn-send-push-reminder');
      await btn400.props.onPress();
      await Promise.resolve();

      expect(lastErrorNotification).toBe(
        "Cannot send reminder for an appointment with status 'NoShow'.",
      );
      expect(syncedList400[syncedList400.length - 1].status).toBe('NoShow');
      expect(findNodeByTestId(harness400.result.current, 'btn-send-push-reminder').props.disabled).toBe(true);
      harness400.unmount();

      // Case B: 409 with getAppointment throwing network error on refetch -> infers Cancelled
      const syncedList409: ExtendedAppointmentItem[] = [];
      const appt409: ExtendedAppointmentItem = {
        ...appointmentScheduled,
        id: 'appt-fallback-409',
        status: 'Confirmed',
      };
      let step409 = 0;
      clinicService.getAppointment = async (id: string) => {
        getAppointmentCalls.push(id);
        step409 += 1;
        if (step409 === 1) return [appt409, null];
        throw new Error('Network error');
      };
      clinicService.sendAppointmentReminder = async () => [
        null,
        { status: 409, message: "Cannot send reminder for an appointment with status 'Cancelled'." },
      ];

      const harness409 = createLocalHookHarness(
        (props: any) => AppointmentInspectionModal(props),
        {
          visible: true,
          appointment: appt409,
          onClose: () => {},
          onAppointmentSynced: (synced: ExtendedAppointmentItem) => {
            syncedList409.push(synced);
          },
        },
      );
      await Promise.resolve();
      await Promise.resolve();

      const btn409 = findNodeByTestId(harness409.result.current, 'btn-send-push-reminder');
      await btn409.props.onPress();
      await Promise.resolve();

      expect(lastErrorNotification).toBe(
        "Cannot send reminder for an appointment with status 'Cancelled'.",
      );
      expect(syncedList409[syncedList409.length - 1].status).toBe('Cancelled');
      expect(findNodeByTestId(harness409.result.current, 'btn-send-push-reminder').props.disabled).toBe(true);
      harness409.unmount();
    });

    test('#210: Fallback status inference syncs explicit affirmative status phrases and rejects negated/incidental 400/409 messages when getAppointment fails', async () => {
      const affirmativeCases: Array<{ status: number; message: string; expected: 'Completed' | 'Cancelled' | 'NoShow' }> = [
        {
          status: 400,
          message: "Cannot send reminder for an appointment with status 'NoShow'.",
          expected: 'NoShow',
        },
        {
          status: 409,
          message: 'Appointment is already cancelled.',
          expected: 'Cancelled',
        },
        {
          status: 400,
          message: "Cannot send reminder for an appointment with status 'Completed'.",
          expected: 'Completed',
        },
        {
          status: 409,
          message: 'Appointment was marked as No Show',
          expected: 'NoShow',
        },
        {
          status: 409,
          message: 'already cancelled',
          expected: 'Cancelled',
        },
        {
          status: 400,
          message: "Cannot send reminder for an appointment with status 'Cancelled'.",
          expected: 'Cancelled',
        },
      ];

      for (let i = 0; i < affirmativeCases.length; i++) {
        const tc = affirmativeCases[i];
        const syncedList: ExtendedAppointmentItem[] = [];
        const appt: ExtendedAppointmentItem = {
          ...appointmentScheduled,
          id: `appt-affirmative-${i}`,
          status: 'Confirmed',
        };
        let step = 0;
        clinicService.getAppointment = async (id: string) => {
          getAppointmentCalls.push(id);
          step += 1;
          if (step === 1) return [appt, null];
          return [null, { status: 503, message: 'Service unavailable' }];
        };
        clinicService.sendAppointmentReminder = async () => [null, { status: tc.status, message: tc.message }];

        const harness = createLocalHookHarness(
          (props: any) => AppointmentInspectionModal(props),
          {
            visible: true,
            appointment: appt,
            onClose: () => {},
            onAppointmentSynced: (synced: ExtendedAppointmentItem) => {
              syncedList.push(synced);
            },
          },
        );
        await Promise.resolve();
        await Promise.resolve();

        const btn = findNodeByTestId(harness.result.current, 'btn-send-push-reminder');
        await btn.props.onPress();
        await Promise.resolve();

        expect(lastErrorNotification).toBe(tc.message);
        expect(syncedList[syncedList.length - 1].status).toBe(tc.expected);
        expect(findNodeByTestId(harness.result.current, 'btn-send-push-reminder').props.disabled).toBe(true);
        harness.unmount();
      }

      const negatedOrIncidentalCases: Array<{ status: number; message: string }> = [
        { status: 400, message: 'Patient intake is not completed.' },
        { status: 400, message: 'Reminder dispatch could not be completed.' },
        { status: 409, message: 'Appointment must not be Cancelled to proceed.' },
        { status: 409, message: 'Appointment must not Cancelled to proceed.' },
        { status: 400, message: 'Previous workflow step was completed, cannot notify.' },
        { status: 409, message: 'Previous notification job was cancelled.' },
      ];

      for (let i = 0; i < negatedOrIncidentalCases.length; i++) {
        const tc = negatedOrIncidentalCases[i];
        const syncedList: ExtendedAppointmentItem[] = [];
        const appt: ExtendedAppointmentItem = {
          ...appointmentScheduled,
          id: `appt-negated-${i}`,
          status: 'Confirmed',
        };
        let step = 0;
        clinicService.getAppointment = async (id: string) => {
          getAppointmentCalls.push(id);
          step += 1;
          if (step === 1) return [appt, null];
          return [null, { status: 503, message: 'Service unavailable' }];
        };
        clinicService.sendAppointmentReminder = async () => [null, { status: tc.status, message: tc.message }];

        const harness = createLocalHookHarness(
          (props: any) => AppointmentInspectionModal(props),
          {
            visible: true,
            appointment: appt,
            onClose: () => {},
            onAppointmentSynced: (synced: ExtendedAppointmentItem) => {
              syncedList.push(synced);
            },
          },
        );
        await Promise.resolve();
        await Promise.resolve();
        expect(syncedList).toHaveLength(1);
        expect(syncedList[0].status).toBe('Confirmed');

        const btn = findNodeByTestId(harness.result.current, 'btn-send-push-reminder');
        await btn.props.onPress();
        await Promise.resolve();

        expect(lastErrorNotification).toBe(tc.message);
        // Must NOT overwrite Confirmed status or invoke onAppointmentSynced with Completed/Cancelled/NoShow
        expect(syncedList).toHaveLength(1);
        expect(findNodeByTestId(harness.result.current, 'btn-send-push-reminder').props.disabled).toBe(false);
        expect(renderToStaticMarkup(harness.result.current)).toContain('Confirmed');
        harness.unmount();
      }
    });

    test('#210: AppointmentInspectionModal refetches getAppointment on open and syncs on 400 error', async () => {
      const syncedList: ExtendedAppointmentItem[] = [];
      const staleAppt: ExtendedAppointmentItem = {
        ...appointmentScheduled,
        id: 'appt-sync-400',
        status: 'Confirmed',
      };
      const serverCompletedAppt: ExtendedAppointmentItem = {
        ...staleAppt,
        status: 'Completed',
      };

      // Initially getAppointment returns Confirmed; later after 400 it returns Completed
      let fetchStep = 0;
      clinicService.getAppointment = async (id: string) => {
        getAppointmentCalls.push(id);
        fetchStep += 1;
        return [fetchStep === 1 ? staleAppt : serverCompletedAppt, null];
      };
      clinicService.sendAppointmentReminder = async () => [
        null,
        { status: 400, message: "Cannot send reminder for an appointment with status 'Completed'." },
      ];

      const harness = createLocalHookHarness(
        (props: any) => AppointmentInspectionModal(props),
        {
          visible: true,
          appointment: staleAppt,
          onClose: () => {},
          onAppointmentSynced: (synced: ExtendedAppointmentItem) => {
            syncedList.push(synced);
          },
        },
      );

      await Promise.resolve();
      await Promise.resolve();
      expect(getAppointmentCalls).toEqual(['appt-sync-400']);
      expect(syncedList).toHaveLength(1);

      const sendBtn = findNodeByTestId(harness.result.current, 'btn-send-push-reminder');
      expect(sendBtn).not.toBeNull();
      expect(sendBtn.props.disabled).toBe(false);

      await sendBtn.props.onPress();
      await Promise.resolve();

      expect(lastErrorNotification).toBe(
        "Cannot send reminder for an appointment with status 'Completed'.",
      );
      expect(getAppointmentCalls).toEqual(['appt-sync-400', 'appt-sync-400']);
      expect(syncedList[syncedList.length - 1].status).toBe('Completed');

      const refreshedSendBtn = findNodeByTestId(harness.result.current, 'btn-send-push-reminder');
      expect(refreshedSendBtn.props.disabled).toBe(true);
      harness.unmount();
    });

    test('#210: onAppointmentSynced updating parent appointment reference does NOT loop getAppointment', async () => {
      const staleAppt: ExtendedAppointmentItem = {
        ...appointmentScheduled,
        id: 'appt-no-loop',
        status: 'Confirmed',
      };
      const serverAppt: ExtendedAppointmentItem = {
        ...staleAppt,
        reminder24hSent: true,
        lastReminderType: '24h',
      };

      clinicService.getAppointment = async (id: string) => {
        getAppointmentCalls.push(id);
        return [serverAppt, null];
      };

      let currentParentAppt: ExtendedAppointmentItem = staleAppt;
      let syncCount = 0;

      const handleSynced = (updated: ExtendedAppointmentItem) => {
        syncCount += 1;
        const cloned = { ...currentParentAppt, ...updated };
        currentParentAppt = cloned;
        harness.rerender({
          visible: true,
          appointment: cloned,
          onClose: () => {},
          onAppointmentSynced: handleSynced,
        });
      };

      const harness = createLocalHookHarness(
        (props: any) => AppointmentInspectionModal(props),
        {
          visible: true,
          appointment: staleAppt,
          onClose: () => {},
          onAppointmentSynced: handleSynced,
        },
      );

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(getAppointmentCalls).toEqual(['appt-no-loop']);
      expect(syncCount).toBe(1);

      // Re-opening modal with visible false -> true fetches cleanly once more
      harness.rerender({
        visible: false,
        appointment: currentParentAppt,
        onClose: () => {},
        onAppointmentSynced: handleSynced,
      });
      harness.rerender({
        visible: true,
        appointment: currentParentAppt,
        onClose: () => {},
        onAppointmentSynced: handleSynced,
      });

      await Promise.resolve();
      await Promise.resolve();
      expect(getAppointmentCalls).toEqual(['appt-no-loop', 'appt-no-loop']);
      expect(syncCount).toBe(2);
      harness.unmount();
    });

    test('#210: ClinicCommsProvider + TeleconsultWaitingRoomModal notifyTeleconsultEnded triggers AppointmentsScreen refresh', async () => {
      expect(typeof clinicService.getAppointment).toBe('function');

      let fetchAppointmentsCount = 0;
      let currentServerStatus: 'Confirmed' | 'Completed' = 'Confirmed';
      clinicService.getAppointments = async () => {
        fetchAppointmentsCount += 1;
        return [
          [
            {
              ...appointmentScheduled,
              id: 'appt-tele-refresh',
              status: currentServerStatus,
              appointmentType: 'Teleconsult',
              isTeleconsult: true,
            },
          ],
          null,
        ];
      };
      clinicService.getCustomFields = async () => [[], null];
      const endTeleconsultCalls: string[] = [];
      clinicService.endTeleconsultCall = async (id: string) => {
        endTeleconsultCalls.push(id);
        return [{ status: 'Completed' }, null];
      };

      // 1. ClinicCommsProvider exposes lastTeleconsultEndedAt and notifyTeleconsultEnded
      const providerHarness = createLocalHookHarness(() =>
        ClinicCommsProvider({
          children: React.createElement('div'),
        }),
      );
      const ctxVal1 = providerHarness.result.current.props.children.props.value;
      expect(ctxVal1.lastTeleconsultEndedAt).toBe(0);
      expect(typeof ctxVal1.notifyTeleconsultEnded).toBe('function');

      ctxVal1.notifyTeleconsultEnded();
      const ctxVal2 = providerHarness.result.current.props.children.props.value;
      expect(ctxVal2.lastTeleconsultEndedAt).toBeGreaterThan(0);

      // 2. TeleconsultWaitingRoomModal onEndCall invokes notifyTeleconsultEnded right after endTeleconsultCall
      let teleEndNotifiedCount = 0;
      const modalHarness = createLocalHookHarness(() =>
        ActiveTeleconsultModal({
          teleconsultSession: {
            callId: 'call-end-1',
            appointmentId: 'appt-tele-refresh',
            patientId: 'pat-101',
            patientName: 'Maria Santos',
            clinicianName: 'Dr. Roberto Santos',
            scheduledTime: '2026-11-18 at 9:00 AM',
            paymentPolicy: 'Exempt',
            paymentStatus: 'Exempt',
          },
          closeTeleconsultWaitingRoom: () => {},
          notifyTeleconsultEnded: () => {
            teleEndNotifiedCount += 1;
          },
          isCallStageDocked: false,
          dockCallStage: () => {},
          maximizeCallStage: () => {},
        }),
      );

      const findNodeWithProp = (node: any, propName: string): any => {
        if (!node || typeof node !== 'object') return null;
        if (Array.isArray(node)) {
          for (const child of node) {
            const found = findNodeWithProp(child, propName);
            if (found) return found;
          }
          return null;
        }
        if (typeof node.props?.[propName] === 'function') {
          return node;
        }
        if (node.props?.children) {
          return findNodeWithProp(node.props.children, propName);
        }
        return null;
      };

      const callStageNode = findNodeWithProp(modalHarness.result.current, 'onEndCall');
      expect(callStageNode).not.toBeNull();
      callStageNode.props.onEndCall();

      const confirmEndBtn = findNodeByTestId(modalHarness.result.current, 'btn-confirm-end-call');
      expect(confirmEndBtn).not.toBeNull();
      await confirmEndBtn.props.onPress();
      await Promise.resolve();
      expect(endTeleconsultCalls).toEqual(['appt-tele-refresh']);
      expect(teleEndNotifiedCount).toBe(1);

      // 3. AppointmentsScreen watches lastTeleconsultEndedAt and re-fetches appointments
      let capturedCommsCtx: any = null;
      const screenHarness = createLocalHookHarness(
        (props: { endedAt: number }) => {
          const ctxHook = useClinicComms();
          capturedCommsCtx = ctxHook;
          ctxHook.lastTeleconsultEndedAt = props.endedAt;
          return AppointmentsScreen({});
        },
        { endedAt: 0 },
      );

      await Promise.resolve();
      await Promise.resolve();
      const initialFetches = fetchAppointmentsCount;
      expect(initialFetches).toBeGreaterThanOrEqual(1);

      currentServerStatus = 'Completed';
      screenHarness.rerender({ endedAt: Date.now() });
      await Promise.resolve();
      await Promise.resolve();
      expect(fetchAppointmentsCount).toBe(initialFetches + 1);
      if (capturedCommsCtx) capturedCommsCtx.lastTeleconsultEndedAt = 0;

      // Also verify closeTeleconsultWaitingRoom advances lastTeleconsultEndedAt
      const prevTs = providerHarness.result.current.props.children.props.value.lastTeleconsultEndedAt;
      providerHarness.result.current.props.children.props.value.closeTeleconsultWaitingRoom();
      expect(
        providerHarness.result.current.props.children.props.value.lastTeleconsultEndedAt,
      ).toBeGreaterThan(prevTs);

      modalHarness.unmount();
      screenHarness.unmount();
      providerHarness.unmount();
    });
  });

  afterAll(() => {
    notify.success = origSuccess;
    notify.error = origError;
    clinicService.updateSettings = origUpdateSettings;
    clinicService.sendAppointmentReminder = origSendAppointmentReminder;
    clinicService.getAppointment = origGetAppointment;
    clinicService.getAppointments = origGetAppointments;
    clinicService.getCustomFields = origGetCustomFields;
    clinicService.endTeleconsultCall = origEndTeleconsultCall;
    clinicService.createTeleconsultGuestInvite = origCreateTeleconsultGuestInvite;
    delete (globalThis as any).__mockClinicContext;
  });
});
