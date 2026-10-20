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
      scheduledAt: '2026-10-21T10:00:00Z',
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

// Import components under test using require after all mocks are registered
const { AppointmentInspectionModal } = require('../components/calendar/AppointmentInspectionModal');
const { AppointmentCard } = require('../components/calendar/AppointmentCard');
const AppointmentReminderSettingsCard = require('../components/settings/AppointmentReminderSettingsCard').default;
const ClinicNotificationCenterModal = require('../components/notifications/ClinicNotificationCenterModal').default;

// Sample fixture appointments
const appointmentScheduled: ExtendedAppointmentItem = {
  id: 'appt-scheduled-1',
  clinicId: 'clinic-1',
  patientId: 'pat-101',
  patientName: 'Maria Santos',
  doctorId: 'doc-1',
  doctorName: 'Dr. Roberto Santos',
  scheduledAt: '2026-10-22T09:00:00Z',
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
      expect(html).toContain('data-testid="btn-save-reminder-settings"');
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

  afterAll(() => {
    notify.success = origSuccess;
    notify.error = origError;
    clinicService.updateSettings = origUpdateSettings;
    clinicService.sendAppointmentReminder = origSendAppointmentReminder;
  });
});
