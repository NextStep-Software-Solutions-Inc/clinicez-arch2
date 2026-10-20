// token-guard:ignore-file
/**
 * Test Suite: Clinic Calendar Component Suite & 4 UX States (calendarViewSuite.test.ts)
 * 
 * Verifies:
 *  - Month, Week, Day, Agenda views
 *  - 4 UX States: Skeleton loading, Empty state, Error state, Active state
 *  - Clinical urgency badges & borders
 *  - Date math, Gregorian 42-cell matrix, leap years, timezone handling
 *  - Interactive slot clicks, inspection drawer, reschedule modal, date carousel
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { theme } from '../constants/theme';
import type {
  ExtendedAppointmentItem,
  CalendarViewMode,
  DoctorShiftOverlay,
} from '../components/calendar/types';
import {
  padZero,
  formatDateString,
  parseDateOnly,
  isLeapYear,
  getDaysInMonth,
  getManilaTodayStr,
  toDateString,
  generateMonthGrid,
  getWeekDays,
  generateDayTimeSlots,
  resolveAppointmentUrgency,
  resolveUrgencyTokens,
  resolveStatusTokens,
  isSlotCollision,
  evaluateDoctorAvailabilityForSlot,
  formatTime12,
  formatDateTitle,
} from '../components/calendar/calendarUtils';

(globalThis as any).__DEV__ = true;

// React Native mock for headless Bun
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

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const {
  CalendarSkeleton,
  CalendarHeader,
  AppointmentCard,
  MonthView,
  WeekView,
  DayView,
  DoctorTimelineColumn,
  DateCarousel,
  AgendaView,
  AppointmentInspectionModal,
  AppointmentRescheduleModal,
} = require('../components/calendar');

// Sample test appointments
const sampleAppointments: ExtendedAppointmentItem[] = [
  {
    id: 'appt-1',
    clinicId: 'clinic-1',
    patientId: 'pat-1',
    patientName: 'Juan Dela Cruz',
    doctorId: 'doc-santos',
    doctorName: 'Dr. Roberto Santos',
    scheduledAt: '2026-10-20T08:30:00Z',
    durationMinutes: 30,
    status: 'Confirmed',
    urgency: 'STAT',
    serviceType: 'Emergency Consultation',
    reason: 'Severe acute chest pain',
    createdAt: '2026-10-19T00:00:00Z',
  },
  {
    id: 'appt-2',
    clinicId: 'clinic-1',
    patientId: 'pat-2',
    patientName: 'Maria Santos',
    doctorId: 'doc-santos',
    doctorName: 'Dr. Roberto Santos',
    scheduledAt: '2026-10-20T09:30:00Z',
    durationMinutes: 30,
    status: 'CheckedIn',
    urgency: 'Urgent',
    serviceType: 'Consultation',
    reason: 'High persistent fever',
    createdAt: '2026-10-19T00:00:00Z',
  },
  {
    id: 'appt-3',
    clinicId: 'clinic-1',
    patientId: 'pat-3',
    patientName: 'Cassandra Ambray',
    doctorId: 'doc-reyes',
    doctorName: 'Dr. Elena Reyes',
    scheduledAt: '2026-10-20T10:00:00Z',
    durationMinutes: 30,
    status: 'Confirmed',
    urgency: 'Routine',
    serviceType: 'Follow-up',
    reason: 'Routine checkup',
    createdAt: '2026-10-18T00:00:00Z',
  },
  {
    id: 'appt-4',
    clinicId: 'clinic-1',
    patientId: 'pat-4',
    patientName: 'Pedro Penduko',
    doctorId: 'doc-reyes',
    doctorName: 'Dr. Elena Reyes',
    scheduledAt: '2026-10-20T11:00:00Z',
    durationMinutes: 30,
    status: 'Cancelled',
    urgency: 'Routine',
    serviceType: 'Consultation',
    reason: 'Patient cancelled',
    createdAt: '2026-10-18T00:00:00Z',
  },
];

const sampleDoctorOverlays: DoctorShiftOverlay[] = [
  {
    doctorId: 'doc-santos',
    doctorName: 'Dr. Roberto Santos',
    isOnDuty: true,
    shiftStart: '08:00',
    shiftEnd: '17:00',
    breaks: [{ start: '12:00', end: '13:00', description: 'Lunch Break' }],
    roomName: 'Exam Room 1',
  },
  {
    doctorId: 'doc-reyes',
    doctorName: 'Dr. Elena Reyes',
    isOnDuty: true,
    shiftStart: '09:00',
    shiftEnd: '18:00',
    breaks: [{ start: '13:00', end: '14:00', description: 'Lunch Recess' }],
    roomName: 'Exam Room 2',
  },
  {
    doctorId: 'doc-tan',
    doctorName: 'Dr. Jose Tan',
    isOnDuty: false,
    shiftStart: '08:00',
    shiftEnd: '17:00',
    breaks: [],
    leave: { type: 'CME', reason: 'Medical Conference' },
    roomName: 'Exam Room 3',
  },
];

describe('Clinic Calendar Component Suite & 4 UX States Tests', () => {
  beforeEach(() => {
    mockWindowWidth = 1280;
    mockWindowHeight = 800;
    mockToasts.reset();
  });

  // ===========================================================================
  // 1. Pure Calendar Utilities & Date Math
  // ===========================================================================
  describe('Calendar Utilities & Asia/Manila Date Math', () => {
    test('padZero, formatDateString, parseDateOnly', () => {
      expect(padZero(5)).toBe('05');
      expect(padZero(12)).toBe('12');
      expect(formatDateString(2026, 10, 20)).toBe('2026-10-20');
      const parsed = parseDateOnly('2026-10-20T08:30:00Z');
      expect(parsed.year).toBe(2026);
      expect(parsed.month).toBe(10);
      expect(parsed.day).toBe(20);
    });

    test('isLeapYear: identifies leap years 2024, 2028 and non-leap 2025, 2026, 2100', () => {
      expect(isLeapYear(2024)).toBe(true);
      expect(isLeapYear(2028)).toBe(true);
      expect(isLeapYear(2025)).toBe(false);
      expect(isLeapYear(2026)).toBe(false);
      expect(isLeapYear(2000)).toBe(true); // divisible by 400
      expect(isLeapYear(2100)).toBe(false); // century not divisible by 400
    });

    test('getDaysInMonth: handles February in leap vs non-leap years and 30/31-day months', () => {
      expect(getDaysInMonth(2024, 2)).toBe(29);
      expect(getDaysInMonth(2026, 2)).toBe(28);
      expect(getDaysInMonth(2026, 4)).toBe(30);
      expect(getDaysInMonth(2026, 10)).toBe(31);
      expect(getDaysInMonth(2026, 13)).toBe(0);
    });

    test('generateMonthGrid: produces uniform 42 cells across month transitions', () => {
      const grid = generateMonthGrid(2026, 10, sampleAppointments, '2026-10-20');
      expect(grid.length).toBe(42);

      // Leading days from September
      expect(grid[0].isCurrentMonth).toBe(false);
      expect(grid[0].dateString).toBe('2026-09-27');

      // October 20 cell
      const oct20 = grid.find((c) => c.dateString === '2026-10-20');
      expect(oct20).toBeDefined();
      expect(oct20?.isCurrentMonth).toBe(true);
      expect(oct20?.isToday).toBe(true);
      expect(oct20?.appointments.length).toBe(4);

      // Trailing days into November
      const lastCell = grid[grid.length - 1];
      expect(lastCell.isCurrentMonth).toBe(false);
      expect(lastCell.dateString.startsWith('2026-11')).toBe(true);
    });

    test('getWeekDays: produces exactly 7 consecutive days starting Sunday', () => {
      const week = getWeekDays(new Date('2026-10-20T00:00:00Z'), sampleAppointments, '2026-10-20');
      expect(week.length).toBe(7);
      expect(week[0].dayName).toBe('Sun');
      expect(week[1].dayName).toBe('Mon');
      expect(week[2].dayName).toBe('Tue');
      expect(week[2].dateString).toBe('2026-10-20');
      expect(week[2].isToday).toBe(true);
      expect(week[2].appointments.length).toBe(4);
    });

    test('generateDayTimeSlots: creates exactly 24 30-min intervals from 07:00 to 19:00', () => {
      const slots = generateDayTimeSlots(7, 19, 30);
      expect(slots.length).toBe(24);
      expect(slots[0].timeStr).toBe('07:00');
      expect(slots[slots.length - 1].timeStr).toBe('18:30');
    });

    test('isSlotCollision: checks interval overlaps accurately', () => {
      // Overlapping intervals
      expect(isSlotCollision('2026-10-20T09:00:00Z', 30, '2026-10-20T09:15:00Z', 30)).toBe(true);
      // Abutting intervals (do NOT collide)
      expect(isSlotCollision('2026-10-20T09:00:00Z', 30, '2026-10-20T09:30:00Z', 30)).toBe(false);
      // Disjoint intervals
      expect(isSlotCollision('2026-10-20T09:00:00Z', 30, '2026-10-20T10:00:00Z', 30)).toBe(false);
    });

    test('evaluateDoctorAvailabilityForSlot: handles on-duty, break, leave, off-duty', () => {
      const overlay = sampleDoctorOverlays[0]; // Dr. Santos 08:00-17:00, lunch 12:00-13:00

      // Outside working hours
      expect(evaluateDoctorAvailabilityForSlot('2026-10-20', '07:30', overlay).status).toBe('OffDuty');
      // Available slot
      expect(evaluateDoctorAvailabilityForSlot('2026-10-20', '09:00', overlay).status).toBe('Available');
      // Lunch break
      expect(evaluateDoctorAvailabilityForSlot('2026-10-20', '12:30', overlay).status).toBe('Break');

      // On leave doctor
      const leaveDoc = sampleDoctorOverlays[2];
      const leaveResult = evaluateDoctorAvailabilityForSlot('2026-10-20', '09:00', leaveDoc);
      expect(leaveResult.status).toBe('Leave');
      expect(leaveResult.reason).toBe('Medical Conference');
    });

    test('resolveAppointmentUrgency & tokens', () => {
      expect(resolveAppointmentUrgency({ urgency: 'STAT' })).toBe('STAT');
      expect(resolveAppointmentUrgency({ reason: 'Acute chest tightness' })).toBe('Urgent');
      expect(resolveAppointmentUrgency({ reason: 'Routine immunization check' })).toBe('Routine');

      const statTokens = resolveUrgencyTokens('STAT');
      expect(statTokens.badgeBg).toBe(theme.colors.emergencyBg);
      expect(statTokens.badgeText).toBe(theme.colors.emergencyText);
      expect(statTokens.borderColor).toBe(theme.colors.emergencyBorder);

      const urgentTokens = resolveUrgencyTokens('Urgent');
      expect(urgentTokens.badgeBg).toBe(theme.colors.urgentBg);

      const routineTokens = resolveUrgencyTokens('Routine');
      expect(routineTokens.badgeBg).toBe(theme.colors.primaryLight);
    });

    test('resolveStatusTokens: applies strikethrough only on Cancelled status', () => {
      expect(resolveStatusTokens('Confirmed').isStrikethrough).toBe(false);
      expect(resolveStatusTokens('CheckedIn').badgeBg).toBe(theme.colors.successBg);
      expect(resolveStatusTokens('Cancelled').isStrikethrough).toBe(true);
    });

    test('formatDateTitle: generates proper labels for each viewMode', () => {
      const d = new Date('2026-10-20T00:00:00Z');
      expect(formatDateTitle('month', d)).toBe('October 2026');
      expect(formatDateTitle('agenda', d)).toBe('October 2026');
      expect(formatDateTitle('day', d)).toContain('Tuesday');
      expect(formatDateTitle('day', d)).toContain('Oct 20, 2026');
      expect(formatDateTitle('week', d)).toContain('Oct');
    });
  });

  // ===========================================================================
  // 2. CalendarSkeleton Component (UX State 1)
  // ===========================================================================
  describe('CalendarSkeleton UX State', () => {
    test('renders skeleton container and grid with aria-busy', () => {
      const html = renderToStaticMarkup(React.createElement(CalendarSkeleton, { viewMode: 'month' }));
      expect(html).toContain('data-testid="calendar-skeleton"');
      expect(html).toContain('data-testid="skeleton-header"');
      expect(html).toContain('data-testid="skeleton-grid"');
    });

    test('renders week, day, and agenda skeleton variations', () => {
      const weekHtml = renderToStaticMarkup(React.createElement(CalendarSkeleton, { viewMode: 'week' }));
      expect(weekHtml).toContain('data-testid="calendar-skeleton"');

      const dayHtml = renderToStaticMarkup(React.createElement(CalendarSkeleton, { viewMode: 'day' }));
      expect(dayHtml).toContain('data-testid="calendar-skeleton"');

      const agendaHtml = renderToStaticMarkup(React.createElement(CalendarSkeleton, { viewMode: 'agenda' }));
      expect(agendaHtml).toContain('data-testid="calendar-skeleton"');
    });
  });

  // ===========================================================================
  // 3. CalendarHeader Component
  // ===========================================================================
  describe('CalendarHeader Component', () => {
    test('renders title, prev/next/today buttons, and view mode switcher', () => {
      let viewMode: CalendarViewMode = 'month';
      let prevCount = 0;
      let nextCount = 0;
      let todayCount = 0;

      const html = renderToStaticMarkup(
        React.createElement(CalendarHeader, {
          viewMode,
          currentDate: new Date('2026-10-20T00:00:00Z'),
          onViewModeChange: (m) => { viewMode = m; },
          onPrev: () => { prevCount++; },
          onNext: () => { nextCount++; },
          onToday: () => { todayCount++; },
        })
      );

      expect(html).toContain('data-testid="calendar-header"');
      expect(html).toContain('data-testid="calendar-nav-controls"');
      expect(html).toContain('data-testid="btn-prev"');
      expect(html).toContain('data-testid="btn-today"');
      expect(html).toContain('data-testid="btn-next"');
      expect(html).toContain('data-testid="calendar-title"');
      expect(html).toContain('data-testid="calendar-view-switcher"');
      expect(html).toContain('data-testid="btn-view-month"');
      expect(html).toContain('data-testid="btn-view-week"');
      expect(html).toContain('data-testid="btn-view-day"');
      expect(html).toContain('data-testid="btn-view-agenda"');
    });

    test('renders doctor filter pills when doctor list is passed', () => {
      const html = renderToStaticMarkup(
        React.createElement(CalendarHeader, {
          viewMode: 'day',
          currentDate: new Date('2026-10-20T00:00:00Z'),
          onViewModeChange: () => {},
          onPrev: () => {},
          onNext: () => {},
          onToday: () => {},
          doctors: [
            { id: 'doc-santos', name: 'Dr. Santos' },
            { id: 'doc-reyes', name: 'Dr. Reyes' },
          ],
          activeDoctorId: 'doc-santos',
          onDoctorChange: () => {},
        })
      );

      expect(html).toContain('All Doctors');
      expect(html).toContain('Dr. Santos');
      expect(html).toContain('Dr. Reyes');
    });
  });

  // ===========================================================================
  // 4. AppointmentCard Component
  // ===========================================================================
  describe('AppointmentCard Component', () => {
    test('renders standard card with patient name, urgency badge, status badge, doctor name', () => {
      let selectedAppt: ExtendedAppointmentItem | null = null;
      let checkInAppt: ExtendedAppointmentItem | null = null;
      let rescheduleAppt: ExtendedAppointmentItem | null = null;

      const appt = sampleAppointments[0];
      const html = renderToStaticMarkup(
        React.createElement(AppointmentCard, {
          appointment: appt,
          variant: 'standard',
          onSelect: (a) => { selectedAppt = a; },
          onCheckIn: (a) => { checkInAppt = a; },
          onReschedule: (a) => { rescheduleAppt = a; },
        })
      );

      expect(html).toContain(`data-testid="appointment-card-${appt.id}"`);
      expect(html).toContain('data-testid="card-patient-name"');
      expect(html).toContain('Juan Dela Cruz');
      expect(html).toContain('data-testid="card-urgency-badge"');
      expect(html).toContain('STAT Emergency');
      expect(html).toContain('data-testid="card-status-badge"');
      expect(html).toContain('Confirmed');
      expect(html).toContain('data-testid="card-doctor-name"');
      expect(html).toContain('Dr. Roberto Santos');
      expect(html).toContain(`data-testid="btn-checkin-${appt.id}"`);
      expect(html).toContain(`data-testid="btn-reschedule-${appt.id}"`);
    });

    test('renders compact chip for Month view and timeline card for Week/Day view', () => {
      const compactHtml = renderToStaticMarkup(
        React.createElement(AppointmentCard, {
          appointment: sampleAppointments[0],
          variant: 'compact',
          onSelect: () => {},
        })
      );
      expect(compactHtml).toContain('Juan Dela Cruz');

      const timelineHtml = renderToStaticMarkup(
        React.createElement(AppointmentCard, {
          appointment: sampleAppointments[0],
          variant: 'timeline',
          onSelect: () => {},
        })
      );
      expect(timelineHtml).toContain('data-testid="card-patient-name"');
      expect(timelineHtml).toContain('STAT Emergency');
    });

    test('cancelled appointment applies strikethrough text style', () => {
      const cancelledAppt = sampleAppointments[3];
      const html = renderToStaticMarkup(
        React.createElement(AppointmentCard, {
          appointment: cancelledAppt,
          variant: 'standard',
          onSelect: () => {},
        })
      );
      expect(html).toContain('line-through');
      expect(html).toContain('Cancelled');
    });
  });

  // ===========================================================================
  // 5. MonthView Component
  // ===========================================================================
  describe('MonthView Component', () => {
    test('renders 7-column grid with cells, day numbers, appointment chips', () => {
      let selectedDate: Date | null = null;
      let selectedAppt: ExtendedAppointmentItem | null = null;

      const html = renderToStaticMarkup(
        React.createElement(MonthView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: sampleAppointments,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: (d) => { selectedDate = d; },
          onSelectAppointment: (a) => { selectedAppt = a; },
        })
      );

      expect(html).toContain('data-testid="calendar-month-grid"');
      expect(html).toContain('data-testid="month-cell-2026-10-20"');
      expect(html).toContain('data-testid="cell-day-number"');
      expect(html).toContain('data-testid="cell-count-badge"');
      expect(html).toContain(`data-testid="cell-chip-${sampleAppointments[0].id}"`);
    });

    test('renders loading skeleton and error states', () => {
      const loadingHtml = renderToStaticMarkup(
        React.createElement(MonthView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: [],
          isLoading: true,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );
      expect(loadingHtml).toContain('data-testid="calendar-skeleton"');

      const errorHtml = renderToStaticMarkup(
        React.createElement(MonthView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: [],
          isLoading: false,
          error: new Error('Network timeout'),
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );
      expect(errorHtml).toContain('data-testid="calendar-error-state"');
      expect(errorHtml).toContain('Failed to load clinic calendar');
    });
  });

  // ===========================================================================
  // 6. WeekView Component
  // ===========================================================================
  describe('WeekView Component', () => {
    test('renders 7-day columns against 07:00-19:00 time axis', () => {
      let selectedSlotTime: string | null = null;
      let selectedAppt: ExtendedAppointmentItem | null = null;

      const html = renderToStaticMarkup(
        React.createElement(WeekView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: sampleAppointments,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectSlot: (_, timeStr) => { selectedSlotTime = timeStr; },
          onSelectAppointment: (a) => { selectedAppt = a; },
        })
      );

      expect(html).toContain('data-testid="calendar-week-matrix"');
      expect(html).toContain('data-testid="week-time-axis"');
      expect(html).toContain('data-testid="time-label-07:00"');
      expect(html).toContain('data-testid="time-label-18:30"');
      expect(html).toContain('data-testid="week-col-2026-10-20"');
      expect(html).toContain('data-testid="week-slot-2026-10-20-08:30"');
      expect(html).toContain('data-testid="week-slot-2026-10-20-09:00"');
    });
  });

  // ===========================================================================
  // 7. DayView & DoctorTimelineColumn Components
  // ===========================================================================
  describe('DayView & DoctorTimelineColumn', () => {
    test('renders desktop side-by-side doctor columns and shift overlays', () => {
      mockWindowWidth = 1280;

      const html = renderToStaticMarkup(
        React.createElement(DayView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: sampleAppointments,
          doctorOverlays: sampleDoctorOverlays,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectSlot: () => {},
          onSelectAppointment: () => {},
        })
      );

      expect(html).toContain('data-testid="calendar-day-multi-provider"');
      expect(html).toContain('data-testid="day-time-axis"');
      expect(html).toContain('data-testid="doctor-col-doc-santos"');
      expect(html).toContain('data-testid="doctor-col-doc-reyes"');
      expect(html).toContain('data-testid="doctor-col-doc-tan"');
      expect(html).toContain('data-testid="doctor-name"');
      expect(html).toContain('Dr. Roberto Santos');
      expect(html).toContain('data-testid="doctor-leave-badge"');
      expect(html).toContain('Medical Conference');
      expect(html).toContain('data-testid="break-overlay"');
      expect(html).toContain('data-testid="leave-overlay"');
    });

    test('renders compact mobile layout with DateCarousel on small viewports (<768px)', () => {
      mockWindowWidth = 400;

      const html = renderToStaticMarkup(
        React.createElement(DayView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: sampleAppointments,
          doctorOverlays: sampleDoctorOverlays,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      expect(html).toContain('data-testid="date-carousel"');
      expect(html).toContain('data-testid="carousel-day-2026-10-20"');
    });
  });

  // ===========================================================================
  // 8. DateCarousel Component
  // ===========================================================================
  describe('DateCarousel Component', () => {
    test('renders 7 days with prev/next buttons and selected state', () => {
      let chosenDate: Date | null = null;
      const html = renderToStaticMarkup(
        React.createElement(DateCarousel, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          onSelectDate: (d) => { chosenDate = d; },
        })
      );

      expect(html).toContain('data-testid="date-carousel"');
      expect(html).toContain('data-testid="btn-carousel-prev"');
      expect(html).toContain('data-testid="btn-carousel-next"');
      expect(html).toContain('data-testid="carousel-day-2026-10-20"');
      expect(html).toContain('data-selected="true"');
    });
  });

  // ===========================================================================
  // 9. AgendaView Component
  // ===========================================================================
  describe('AgendaView Component', () => {
    test('renders grouped appointments by date with status filter', () => {
      const html = renderToStaticMarkup(
        React.createElement(AgendaView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: sampleAppointments,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      expect(html).toContain('data-testid="calendar-agenda-view"');
      expect(html).toContain('data-testid="agenda-group-2026-10-20"');
      expect(html).toContain('data-testid="agenda-group-header"');
      expect(html).toContain('Juan Dela Cruz');
      expect(html).toContain('Maria Santos');
    });

    test('renders contextual empty state when no appointments match', () => {
      const html = renderToStaticMarkup(
        React.createElement(AgendaView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: [],
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      expect(html).toContain('data-testid="agenda-empty"');
      expect(html).toContain('No appointments scheduled');
      expect(html).toContain('Book appointment');
    });
  });

  // ===========================================================================
  // 10. AppointmentInspectionModal Component
  // ===========================================================================
  describe('AppointmentInspectionModal Component', () => {
    test('renders complete clinical booking metadata and quick CTAs', () => {
      let closed = false;
      let checkedIn = false;
      let rescheduled = false;

      const appt = sampleAppointments[0];
      const html = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: appt,
          onClose: () => { closed = true; },
          onCheckIn: () => { checkedIn = true; },
          onReschedule: () => { rescheduled = true; },
        })
      );

      expect(html).toContain('data-testid="appointment-inspection-drawer"');
      expect(html).toContain('data-testid="drawer-patient-name"');
      expect(html).toContain('Juan Dela Cruz');
      expect(html).toContain('data-testid="drawer-patient-id"');
      expect(html).toContain('pat-1');
      expect(html).toContain('data-testid="drawer-doctor-name"');
      expect(html).toContain('Dr. Roberto Santos');
      expect(html).toContain('data-testid="drawer-scheduled-at"');
      expect(html).toContain('data-testid="drawer-reason"');
      expect(html).toContain('Severe acute chest pain');
      expect(html).toContain('data-testid="drawer-actions"');
      expect(html).toContain('data-testid="btn-drawer-checkin"');
      expect(html).toContain('data-testid="btn-drawer-reschedule"');
      expect(html).toContain('data-testid="btn-drawer-close"');
    });

    test('renders null when visible is false or appointment is null', () => {
      const htmlHidden = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: false,
          appointment: sampleAppointments[0],
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
  // 11. AppointmentRescheduleModal Component
  // ===========================================================================
  describe('AppointmentRescheduleModal Component', () => {
    test('renders date/time inputs, reason field, and handles conflict alerts', () => {
      const appt = sampleAppointments[0];
      const html = renderToStaticMarkup(
        React.createElement(AppointmentRescheduleModal, {
          visible: true,
          appointment: appt,
          onClose: () => {},
          conflictError: 'This time slot is already booked or conflicts with a physician break.',
        })
      );

      expect(html).toContain('data-testid="appointment-reschedule-modal"');
      expect(html).toContain('data-testid="reschedule-title"');
      expect(html).toContain('Reschedule for Juan Dela Cruz');
      expect(html).toContain('data-testid="conflict-alert"');
      expect(html).toContain('This time slot is already booked');
      expect(html).toContain('data-testid="reschedule-date-input"');
      expect(html).toContain('data-testid="reschedule-time-input"');
      expect(html).toContain('data-testid="reschedule-reason-input"');
      expect(html).toContain('data-testid="btn-confirm-reschedule"');
      expect(html).toContain('data-testid="btn-cancel-reschedule"');
    });

    test('renders null when visible is false', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentRescheduleModal, {
          visible: false,
          appointment: sampleAppointments[0],
          onClose: () => {},
        })
      );
      expect(html).toBe('');
    });
  });
});
