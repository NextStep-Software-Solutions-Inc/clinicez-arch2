// token-guard:ignore-file
/**
 * Empirical Challenger 2 Verification Suite
 * Stress-testing Calendar Component Suite & 4 UX States
 *
 * Requirements tested:
 * 1. MonthView: 42 cells consistently across leap years, centuries, and month starts; empty slot clicks.
 * 2. WeekView: 7 days and 24 time intervals per day (168 slots total); slot click vs appointment click.
 * 3. DayView: Multi-provider columns on desktop (>=1024px) vs adaptive single timeline on mobile (<768px).
 * 4. AppointmentCard: Urgency badges (explicit & inferred), status badges, check-in/reschedule/cancel triggers.
 * 5. 4 UX States: Skeleton loading, Empty state, Error state with retry, Active state across all views.
 * 6. Doctor timeline overlays: Break, Leave, Available, OffDuty slot click blocking.
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

const testAppointments: ExtendedAppointmentItem[] = [
  {
    id: 'appt-stat',
    clinicId: 'clinic-test',
    patientId: 'pat-101',
    patientName: 'Adversarial STAT Patient',
    doctorId: 'doc-alpha',
    doctorName: 'Dr. Alpha Ramos',
    scheduledAt: '2026-10-20T08:00:00Z',
    durationMinutes: 30,
    status: 'Confirmed',
    urgency: 'STAT',
    serviceType: 'Emergency Triage',
    reason: 'Acute respiratory failure',
    notes: 'Require immediate oxygenation',
    createdAt: '2026-10-19T00:00:00Z',
  },
  {
    id: 'appt-urgent',
    clinicId: 'clinic-test',
    patientId: 'pat-102',
    patientName: 'Adversarial Urgent Patient',
    doctorId: 'doc-alpha',
    doctorName: 'Dr. Alpha Ramos',
    scheduledAt: '2026-10-20T09:30:00Z',
    durationMinutes: 30,
    status: 'Pending',
    urgency: 'Urgent',
    serviceType: 'Urgent Care',
    reason: 'Deep laceration forearm',
    notes: 'Bleeding controlled with pressure',
    createdAt: '2026-10-19T00:00:00Z',
  },
  {
    id: 'appt-routine',
    clinicId: 'clinic-test',
    patientId: 'pat-103',
    patientName: 'Adversarial Routine Patient',
    doctorId: 'doc-beta',
    doctorName: 'Dr. Beta Gomez',
    scheduledAt: '2026-10-20T10:00:00Z',
    durationMinutes: 30,
    status: 'CheckedIn',
    urgency: 'Routine',
    serviceType: 'Consultation',
    reason: 'Routine hypertension follow-up',
    notes: 'BP maintenance refill',
    createdAt: '2026-10-18T00:00:00Z',
  },
  {
    id: 'appt-completed',
    clinicId: 'clinic-test',
    patientId: 'pat-104',
    patientName: 'Adversarial Completed Patient',
    doctorId: 'doc-beta',
    doctorName: 'Dr. Beta Gomez',
    scheduledAt: '2026-10-20T11:00:00Z',
    durationMinutes: 30,
    status: 'Completed',
    urgency: 'Routine',
    serviceType: 'Consultation',
    reason: 'General clearance',
    notes: 'Cleared for employment',
    createdAt: '2026-10-18T00:00:00Z',
  },
  {
    id: 'appt-cancelled',
    clinicId: 'clinic-test',
    patientId: 'pat-105',
    patientName: 'Adversarial Cancelled Patient',
    doctorId: 'doc-gamma',
    doctorName: 'Dr. Gamma Cruz',
    scheduledAt: '2026-10-20T14:00:00Z',
    durationMinutes: 30,
    status: 'Cancelled',
    urgency: 'Routine',
    serviceType: 'Consultation',
    reason: 'Patient unable to travel',
    notes: 'Rescheduling requested for next week',
    createdAt: '2026-10-18T00:00:00Z',
  },
];

const testDoctorOverlays: DoctorShiftOverlay[] = [
  {
    doctorId: 'doc-alpha',
    doctorName: 'Dr. Alpha Ramos',
    isOnDuty: true,
    shiftStart: '08:00',
    shiftEnd: '17:00',
    breaks: [{ start: '12:00', end: '13:00', description: 'Lunch Break' }],
    roomName: 'Consultation Bay 1',
  },
  {
    doctorId: 'doc-beta',
    doctorName: 'Dr. Beta Gomez',
    isOnDuty: true,
    shiftStart: '07:30',
    shiftEnd: '16:00',
    breaks: [{ start: '11:30', end: '12:30', description: 'Midday Recess' }],
    roomName: 'Consultation Bay 2',
  },
  {
    doctorId: 'doc-gamma',
    doctorName: 'Dr. Gamma Cruz',
    isOnDuty: false,
    shiftStart: '08:00',
    shiftEnd: '17:00',
    breaks: [],
    leave: { type: 'Emergency', reason: 'Personal Emergency' },
    roomName: 'Treatment Bay A',
  },
];

/** Helper to render a component within React dispatcher and capture its element tree */
function renderWithCapture(element: React.ReactElement): any {
  let captured: any = null;
  function Wrapper() {
    captured = element.type(element.props);
    return captured;
  }
  renderToStaticMarkup(React.createElement(Wrapper));
  return captured;
}

describe('Challenger 2 Empirical Stress Test Suite', () => {
  beforeEach(() => {
    mockWindowWidth = 1280;
    mockWindowHeight = 800;
    mockToasts.reset();
  });

  // =========================================================================
  // REQUIREMENT 1: MonthView 42 Cells Consistency & Empty Slot Clicks
  // =========================================================================
  describe('MonthView: 42 Cells Consistency & Interactions', () => {
    test('Stress Test: generateMonthGrid produces EXACTLY 42 cells for all 12 months across leap & non-leap years', () => {
      const testYears = [2000, 2023, 2024, 2025, 2026, 2028, 2096, 2100];
      for (const yr of testYears) {
        for (let m = 1; m <= 12; m++) {
          const grid = generateMonthGrid(yr, m, [], '2026-10-20');
          expect(grid.length).toBe(42);

          // Verify all cells have valid YYYY-MM-DD
          for (const cell of grid) {
            expect(cell.dateString).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(cell.dayNumber).toBeGreaterThanOrEqual(1);
            expect(cell.dayNumber).toBeLessThanOrEqual(31);
          }

          // Verify contiguous date ordering (no date gaps or backward steps)
          for (let i = 1; i < grid.length; i++) {
            const prev = new Date(grid[i - 1].dateString + 'T00:00:00Z').getTime();
            const curr = new Date(grid[i].dateString + 'T00:00:00Z').getTime();
            const diffDays = Math.round((curr - prev) / 86400000);
            expect(diffDays).toBe(1);
          }
        }
      }
    });

    test('MonthView UI renders 42 cells and properly attributes current month and today badges', () => {
      const html = renderToStaticMarkup(
        React.createElement(MonthView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: testAppointments,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      // Verify grid container exists
      expect(html).toContain('data-testid="calendar-month-grid"');

      // Count month cells rendered in HTML
      const cellMatches = html.match(/data-testid="month-cell-\d{4}-\d{2}-\d{2}"/g);
      expect(cellMatches).not.toBeNull();
      expect(cellMatches!.length).toBe(42);

      // Verify current-month and today attributes
      expect(html).toContain('data-testid="month-cell-2026-10-20"');
      expect(html).toContain('data-is-current-month="true"');
      expect(html).toContain('data-is-today="true"');
    });

    test('MonthView interaction: clicking cell triggers onSelectDate with valid Date', () => {
      let selectedDate: Date | null = null;
      let selectedAppt: ExtendedAppointmentItem | null = null;

      const comp = renderWithCapture(
        React.createElement(MonthView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: testAppointments,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: (d: Date) => { selectedDate = d; },
          onSelectAppointment: (a: ExtendedAppointmentItem) => { selectedAppt = a; },
        })
      );

      const gridWrapper = comp.props.children;
      const [headerRow, monthGrid] = gridWrapper.props.children;
      const cellNodes = monthGrid.props.children;
      const node25 = cellNodes.find((n: any) => n.key === '2026-10-25');
      expect(node25).toBeDefined();

      node25.props.onPress();
      expect(selectedDate).not.toBeNull();
      expect(selectedDate!.toISOString().startsWith('2026-10-25')).toBe(true);
      expect(selectedAppt).toBeNull();
    });

    test('MonthView interaction: clicking appointment chip calls onSelectAppointment with stopPropagation', () => {
      let selectedDate: Date | null = null;
      let selectedAppt: ExtendedAppointmentItem | null = null;

      const comp = renderWithCapture(
        React.createElement(MonthView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: testAppointments,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: (d: Date) => { selectedDate = d; },
          onSelectAppointment: (a: ExtendedAppointmentItem) => { selectedAppt = a; },
        })
      );

      const gridWrapper = comp.props.children;
      const [headerRow, monthGrid] = gridWrapper.props.children;
      const cellNodes = monthGrid.props.children;
      const oct20Node = cellNodes.find((n: any) => n.key === '2026-10-20');
      expect(oct20Node).toBeDefined();

      const chipContainer = oct20Node.props.children[1];
      const chipNodes = chipContainer.props.children[0];
      expect(chipNodes.length).toBeGreaterThan(0);

      let propagationStopped = false;
      const mockEvent = {
        stopPropagation: () => { propagationStopped = true; },
      };

      chipNodes[0].props.onPress(mockEvent);
      expect(propagationStopped).toBe(true);
      expect(selectedAppt).not.toBeNull();
      expect(selectedAppt!.id).toBe('appt-stat');
      expect(selectedDate).toBeNull();
    });

    test('MonthView overflow badge: renders "+N more" text when cell has > 3 appointments', () => {
      const busyDayAppointments: ExtendedAppointmentItem[] = Array.from({ length: 6 }).map((_, i) => ({
        id: `busy-appt-${i}`,
        clinicId: 'clinic-test',
        patientId: `pat-${i}`,
        patientName: `Patient Number ${i}`,
        doctorId: 'doc-alpha',
        doctorName: 'Dr. Alpha Ramos',
        scheduledAt: `2026-10-20T0${8 + i}:00:00Z`,
        durationMinutes: 30,
        status: 'Confirmed',
        urgency: 'Routine',
        serviceType: 'Consultation',
        reason: 'General visit',
        createdAt: '2026-10-18T00:00:00Z',
      }));

      const html = renderToStaticMarkup(
        React.createElement(MonthView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: busyDayAppointments,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      expect(html).toContain('data-testid="cell-count-badge"');
      expect(html).toContain('>6<');
      expect(html).toContain('+3 more');
    });
  });

  // =========================================================================
  // REQUIREMENT 2: WeekView 7 Days & 24 Intervals Per Day
  // =========================================================================
  describe('WeekView: 7 Days & 24 Time Intervals Per Day', () => {
    test('WeekView renders 7 distinct day columns and exactly 24 time axis labels (07:00 to 18:30)', () => {
      const html = renderToStaticMarkup(
        React.createElement(WeekView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: testAppointments,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectSlot: () => {},
          onSelectAppointment: () => {},
        })
      );

      const weekCols = html.match(/data-testid="week-col-\d{4}-\d{2}-\d{2}"/g);
      expect(weekCols).not.toBeNull();
      expect(weekCols!.length).toBe(7);

      const timeLabels = html.match(/data-testid="time-label-\d{2}:\d{2}"/g);
      expect(timeLabels).not.toBeNull();
      expect(timeLabels!.length).toBe(24);

      expect(html).toContain('data-testid="time-label-07:00"');
      expect(html).toContain('data-testid="time-label-18:30"');

      const slotCells = html.match(/data-testid="week-slot-\d{4}-\d{2}-\d{2}-\d{2}:\d{2}"/g);
      expect(slotCells).not.toBeNull();
      expect(slotCells!.length).toBe(168);
    });

    test('WeekView interaction: clicking empty slot dispatches onSelectSlot with date and timeStr', () => {
      let selectedSlotDate: Date | null = null;
      let selectedSlotTime: string | null = null;
      let selectedAppt: ExtendedAppointmentItem | null = null;

      const comp = renderWithCapture(
        React.createElement(WeekView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: testAppointments,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectSlot: (d: Date, t: string) => {
            selectedSlotDate = d;
            selectedSlotTime = t;
          },
          onSelectAppointment: (a: ExtendedAppointmentItem) => {
            selectedAppt = a;
          },
        })
      );

      const matrixContainer = comp.props.children;
      const dayColumns = matrixContainer.props.children[1];
      const oct20Col = dayColumns.find((c: any) => c.key === '2026-10-20');
      expect(oct20Col).toBeDefined();

      const slots = oct20Col.props.children[1];
      const slot1500 = slots.find((s: any) => s.key === '15:00');
      expect(slot1500).toBeDefined();

      slot1500.props.onPress();
      expect(selectedSlotDate).not.toBeNull();
      expect(selectedSlotTime).toBe('15:00');
      expect(selectedAppt).toBeNull();
    });

    test('WeekView interaction: clicking scheduled slot invokes onSelectAppointment', () => {
      let selectedSlotTime: string | null = null;
      let selectedAppt: ExtendedAppointmentItem | null = null;

      const comp = renderWithCapture(
        React.createElement(WeekView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: testAppointments,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectSlot: (_: Date, t: string) => { selectedSlotTime = t; },
          onSelectAppointment: (a: ExtendedAppointmentItem) => { selectedAppt = a; },
        })
      );

      const matrixContainer = comp.props.children;
      const dayColumns = matrixContainer.props.children[1];
      const oct20Col = dayColumns.find((c: any) => c.key === '2026-10-20');
      const slots = oct20Col.props.children[1];
      const slot0800 = slots.find((s: any) => s.key === '08:00');
      expect(slot0800).toBeDefined();

      slot0800.props.onPress();
      expect(selectedAppt).not.toBeNull();
      expect(selectedAppt!.id).toBe('appt-stat');
      expect(selectedSlotTime).toBeNull();
    });
  });

  // =========================================================================
  // REQUIREMENT 3: DayView Desktop Multi-Provider vs Mobile Adaptive Timeline
  // =========================================================================
  describe('DayView: Multi-Provider Desktop vs Mobile Adaptive Timeline', () => {
    test('DayView on desktop (>=1024px) renders multi-provider side-by-side columns and time axis', () => {
      mockWindowWidth = 1280;

      const html = renderToStaticMarkup(
        React.createElement(DayView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: testAppointments,
          doctorOverlays: testDoctorOverlays,
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

      expect(html).toContain('data-testid="doctor-col-doc-alpha"');
      expect(html).toContain('data-testid="doctor-col-doc-beta"');
      expect(html).toContain('data-testid="doctor-col-doc-gamma"');

      expect(html).toContain('Consultation Bay 1');
      expect(html).toContain('Consultation Bay 2');
      expect(html).toContain('Treatment Bay A');

      expect(html).toContain('data-testid="break-overlay"');
      expect(html).toContain('Lunch Break');
      expect(html).toContain('data-testid="leave-overlay"');
      expect(html).toContain('Personal Emergency');
      expect(html).toContain('data-testid="doctor-leave-badge"');

      expect(html).not.toContain('data-testid="date-carousel"');
    });

    test('DayView on mobile (<768px) switches to adaptive single timeline paired with DateCarousel', () => {
      mockWindowWidth = 375;

      const html = renderToStaticMarkup(
        React.createElement(DayView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: testAppointments,
          doctorOverlays: testDoctorOverlays,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      expect(html).toContain('data-testid="date-carousel"');
      expect(html).toContain('data-testid="carousel-day-2026-10-20"');

      expect(html).toContain('Adversarial STAT Patient');
      expect(html).toContain('Adversarial Urgent Patient');
      expect(html).toContain('Adversarial Routine Patient');

      expect(html).not.toContain('data-testid="calendar-day-multi-provider"');
    });

    test('DoctorTimelineColumn blocks slot booking during Break and Leave intervals', () => {
      let selectedSlotTime: string | null = null;
      let selectedDoctorId: string | null = null;

      const comp = renderWithCapture(
        React.createElement(DoctorTimelineColumn, {
          doctor: testDoctorOverlays[0],
          dateString: '2026-10-20',
          cellDate: new Date('2026-10-20T00:00:00Z'),
          slots: generateDayTimeSlots(7, 19, 30),
          appointments: testAppointments,
          onSelectSlot: (_: Date, t: string, d: string) => {
            selectedSlotTime = t;
            selectedDoctorId = d;
          },
          onSelectAppointment: () => {},
        })
      );

      const slotNodes = comp.props.children[1];

      // 1. Click during break (12:30)
      const breakSlot = slotNodes.find((s: any) => s.key === '12:30');
      expect(breakSlot).toBeDefined();
      expect(breakSlot.props['data-slot-status']).toBe('Break');
      breakSlot.props.onPress();
      expect(selectedSlotTime).toBeNull();

      // 2. Click available slot (14:30)
      const availSlot = slotNodes.find((s: any) => s.key === '14:30');
      expect(availSlot).toBeDefined();
      expect(availSlot.props['data-slot-status']).toBe('Available');
      availSlot.props.onPress();
      expect(selectedSlotTime).toBe('14:30');
      expect(selectedDoctorId).toBe('doc-alpha');
    });

    test('DoctorTimelineColumn blocks slot booking when physician is on Leave', () => {
      let selectedSlotTime: string | null = null;

      const comp = renderWithCapture(
        React.createElement(DoctorTimelineColumn, {
          doctor: testDoctorOverlays[2],
          dateString: '2026-10-20',
          cellDate: new Date('2026-10-20T00:00:00Z'),
          slots: generateDayTimeSlots(7, 19, 30),
          appointments: testAppointments,
          onSelectSlot: (_: Date, t: string) => {
            selectedSlotTime = t;
          },
          onSelectAppointment: () => {},
        })
      );

      const slotNodes = comp.props.children[1];
      const slot = slotNodes.find((s: any) => s.key === '09:00');
      expect(slot).toBeDefined();
      expect(slot.props['data-slot-status']).toBe('Leave');
      slot.props.onPress();
      expect(selectedSlotTime).toBeNull();
    });
  });

  // =========================================================================
  // REQUIREMENT 4: AppointmentCard Urgency Badges & Quick Action Triggers
  // =========================================================================
  describe('AppointmentCard: Clinical Urgency Badges & Quick Actions', () => {
    test('renders correct semantic badges and colors for STAT, Urgent, and Routine', () => {
      const statCardHtml = renderToStaticMarkup(
        React.createElement(AppointmentCard, {
          appointment: testAppointments[0], // STAT
          variant: 'standard',
          onSelect: () => {},
        })
      );
      expect(statCardHtml).toContain('STAT Emergency');
      expect(statCardHtml).toContain(theme.colors.emergencyBg);

      const urgentCardHtml = renderToStaticMarkup(
        React.createElement(AppointmentCard, {
          appointment: testAppointments[1], // Urgent
          variant: 'standard',
          onSelect: () => {},
        })
      );
      expect(urgentCardHtml).toContain('Urgent');
      expect(urgentCardHtml).toContain(theme.colors.urgentBg);

      const routineCardHtml = renderToStaticMarkup(
        React.createElement(AppointmentCard, {
          appointment: testAppointments[2], // Routine
          variant: 'standard',
          onSelect: () => {},
        })
      );
      expect(routineCardHtml).toContain('Routine');
      expect(routineCardHtml).toContain(theme.colors.primaryLight);
    });

    test('infers clinical urgency from symptoms/reason when urgency field is missing', () => {
      const statInferred = resolveAppointmentUrgency({ reason: 'Severe anaphylaxis and shock' });
      expect(statInferred).toBe('STAT');

      const urgentInferred = resolveAppointmentUrgency({ notes: 'Patient has acute fever and bleeding' });
      expect(urgentInferred).toBe('Urgent');

      const routineInferred = resolveAppointmentUrgency({ serviceType: 'Dental checkup' });
      expect(routineInferred).toBe('Routine');
    });

    test('Check-In trigger: renders on Confirmed and Pending, calls onCheckIn with stopPropagation', () => {
      let checkInTriggered = false;
      let cardSelectTriggered = false;
      let stopPropagationCalled = false;

      const comp = renderWithCapture(
        React.createElement(AppointmentCard, {
          appointment: testAppointments[0], // Confirmed, has reason
          variant: 'standard',
          onSelect: () => { cardSelectTriggered = true; },
          onCheckIn: () => { checkInTriggered = true; },
        })
      );

      // In AppointmentCard standard variant:
      // children = [topRow (0), metaRow (1), reasonText (2), actionsRow (3)]
      const children = comp.props.children;
      const actionsRow = children[children.length - 1]; // last child
      expect(actionsRow).toBeDefined();

      const checkInBtn = actionsRow.props.children[0];
      expect(checkInBtn).not.toBeNull();

      checkInBtn.props.onPress({
        stopPropagation: () => { stopPropagationCalled = true; },
      });

      expect(stopPropagationCalled).toBe(true);
      expect(checkInTriggered).toBe(true);
      expect(cardSelectTriggered).toBe(false);
    });

    test('Check-In trigger is NOT rendered when appointment is already CheckedIn, Completed, or Cancelled', () => {
      // 1. CheckedIn status
      const checkedInComp = renderWithCapture(
        React.createElement(AppointmentCard, {
          appointment: testAppointments[2], // CheckedIn
          variant: 'standard',
          onSelect: () => {},
          onCheckIn: () => {},
        })
      );
      const checkedInActions = checkedInComp.props.children[checkedInComp.props.children.length - 1];
      expect(checkedInActions.props.children[0]).toBeNull();

      // 2. Completed status
      const completedComp = renderWithCapture(
        React.createElement(AppointmentCard, {
          appointment: testAppointments[3], // Completed
          variant: 'standard',
          onSelect: () => {},
          onCheckIn: () => {},
        })
      );
      const completedActions = completedComp.props.children[completedComp.props.children.length - 1];
      expect(completedActions.props.children[0]).toBeNull();

      // 3. Cancelled status
      const cancelledComp = renderWithCapture(
        React.createElement(AppointmentCard, {
          appointment: testAppointments[4], // Cancelled
          variant: 'standard',
          onSelect: () => {},
          onCheckIn: () => {},
        })
      );
      const cancelledActions = cancelledComp.props.children[cancelledComp.props.children.length - 1];
      expect(cancelledActions.props.children[0]).toBeNull();
    });

    test('Reschedule trigger: renders on active appointments and calls onReschedule', () => {
      let rescheduleTriggered = false;
      let stopPropagationCalled = false;

      const comp = renderWithCapture(
        React.createElement(AppointmentCard, {
          appointment: testAppointments[0],
          variant: 'standard',
          onSelect: () => {},
          onReschedule: () => { rescheduleTriggered = true; },
        })
      );

      const children = comp.props.children;
      const actionsRow = children[children.length - 1];
      const rescheduleBtn = actionsRow.props.children[1];
      expect(rescheduleBtn).not.toBeNull();

      rescheduleBtn.props.onPress({
        stopPropagation: () => { stopPropagationCalled = true; },
      });

      expect(stopPropagationCalled).toBe(true);
      expect(rescheduleTriggered).toBe(true);
    });

    test('Reschedule and Cancel triggers are hidden on Cancelled appointments', () => {
      const comp = renderWithCapture(
        React.createElement(AppointmentCard, {
          appointment: testAppointments[4], // Cancelled
          variant: 'standard',
          onSelect: () => {},
          onReschedule: () => {},
          onCancel: () => {},
        })
      );

      const children = comp.props.children;
      const actionsRow = children[children.length - 1];
      expect(actionsRow.props.children[1]).toBeNull(); // Reschedule hidden
      expect(actionsRow.props.children[2]).toBeNull(); // Cancel hidden
    });
  });

  // =========================================================================
  // REQUIREMENT 5: 4 Core UI/UX States Across All Views
  // =========================================================================
  describe('4 UI/UX Interaction States Across Calendar Suite', () => {
    test('State 1 (Loading Skeleton): All views render CalendarSkeleton when isLoading=true', () => {
      const monthLoading = renderToStaticMarkup(
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
      expect(monthLoading).toContain('data-testid="calendar-skeleton"');
      expect(monthLoading).toContain('aria-busy="true"');

      const weekLoading = renderToStaticMarkup(
        React.createElement(WeekView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: [],
          isLoading: true,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );
      expect(weekLoading).toContain('data-testid="calendar-skeleton"');

      const dayLoading = renderToStaticMarkup(
        React.createElement(DayView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: [],
          isLoading: true,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );
      expect(dayLoading).toContain('data-testid="calendar-skeleton"');

      const agendaLoading = renderToStaticMarkup(
        React.createElement(AgendaView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: [],
          isLoading: true,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );
      expect(agendaLoading).toContain('data-testid="calendar-skeleton"');
    });

    test('State 2 (Contextual Empty State): AgendaView renders empty state with CTA', () => {
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

    test('State 3 (Actionable Error State): All views render ErrorState with retry trigger', () => {
      let retryCount = 0;
      const testError = new Error('Database connection failed');

      const monthComp = renderWithCapture(
        React.createElement(MonthView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: [],
          isLoading: false,
          error: testError,
          onRetry: () => { retryCount++; },
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      expect(monthComp.props['data-testid']).toBe('calendar-error-state');
      const errorStateChild = monthComp.props.children;
      errorStateChild.props.onRetry();
      expect(retryCount).toBe(1);

      const weekComp = renderWithCapture(
        React.createElement(WeekView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: [],
          isLoading: false,
          error: testError,
          onRetry: () => { retryCount++; },
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );
      expect(weekComp.props['data-testid']).toBe('calendar-error-state');

      const dayComp = renderWithCapture(
        React.createElement(DayView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: [],
          isLoading: false,
          error: testError,
          onRetry: () => { retryCount++; },
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );
      expect(dayComp.props['data-testid']).toBe('calendar-error-state');

      const agendaComp = renderWithCapture(
        React.createElement(AgendaView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: [],
          isLoading: false,
          error: testError,
          onRetry: () => { retryCount++; },
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );
      expect(agendaComp.props['data-testid']).toBe('calendar-error-state');
    });

    test('State 4 (Active State): Views render interactive appointment data', () => {
      const monthHtml = renderToStaticMarkup(
        React.createElement(MonthView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: testAppointments,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );
      expect(monthHtml).toContain('Adversarial STAT Patient');

      const weekHtml = renderToStaticMarkup(
        React.createElement(WeekView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: testAppointments,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );
      expect(weekHtml).toContain('Adversarial STAT Patient');
    });
  });

  // =========================================================================
  // REQUIREMENT 6: AppointmentInspectionModal Comprehensive CTAs
  // =========================================================================
  describe('AppointmentInspectionModal Verification', () => {
    test('renders complete clinical drawer metadata, urgency, and action triggers', () => {
      let closed = false;
      let checkedIn = false;
      let rescheduled = false;
      let cancelled = false;

      const appt = testAppointments[0];
      const comp = renderWithCapture(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: appt,
          onClose: () => { closed = true; },
          onCheckIn: (a: ExtendedAppointmentItem) => {
            expect(a.id).toBe(appt.id);
            checkedIn = true;
          },
          onReschedule: (a: ExtendedAppointmentItem) => {
            expect(a.id).toBe(appt.id);
            rescheduled = true;
          },
          onCancel: (a: ExtendedAppointmentItem) => {
            expect(a.id).toBe(appt.id);
            cancelled = true;
          },
        })
      );

      expect(comp).not.toBeNull();
      const overlay = comp.props.children;
      const drawerCard = overlay.props.children[1];

      // Verify header and close CTA
      const header = drawerCard.props.children[0];
      const closeBtn = header.props.children[1];
      closeBtn.props.onPress();
      expect(closed).toBe(true);

      // Verify footer action CTAs
      const footer = drawerCard.props.children[2];
      const [checkInBtn, rescheduleBtn, cancelBtn] = footer.props.children;

      checkInBtn.props.onPress();
      expect(checkedIn).toBe(true);

      rescheduleBtn.props.onPress();
      expect(rescheduled).toBe(true);

      cancelBtn.props.onPress();
      expect(cancelled).toBe(true);
    });

    test('returns null when visible=false or appointment is null', () => {
      const hiddenComp = renderWithCapture(
        React.createElement(AppointmentInspectionModal, {
          visible: false,
          appointment: testAppointments[0],
          onClose: () => {},
        })
      );
      expect(hiddenComp).toBeNull();

      const nullApptComp = renderWithCapture(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: null,
          onClose: () => {},
        })
      );
      expect(nullApptComp).toBeNull();
    });
  });

  // =========================================================================
  // REQUIREMENT 7: Additional Adversarial Edge Cases
  // =========================================================================
  describe('Adversarial Boundary & Collision Edge Cases', () => {
    test('WeekView multi-doctor simultaneous slot behavior: renders first matching appointment for single-slot cell', () => {
      // Two appointments at the EXACT same date and time (09:00), but for different doctors
      const collidingAppointments: ExtendedAppointmentItem[] = [
        {
          id: 'appt-doc1',
          clinicId: 'clinic-1',
          patientId: 'pat-1',
          patientName: 'Doctor 1 Patient',
          doctorId: 'doc-alpha',
          scheduledAt: '2026-10-20T09:00:00Z',
          durationMinutes: 30,
          status: 'Confirmed',
          urgency: 'Routine',
          createdAt: '2026-10-18T00:00:00Z',
        },
        {
          id: 'appt-doc2',
          clinicId: 'clinic-1',
          patientId: 'pat-2',
          patientName: 'Doctor 2 Patient',
          doctorId: 'doc-beta',
          scheduledAt: '2026-10-20T09:00:00Z',
          durationMinutes: 30,
          status: 'Confirmed',
          urgency: 'Urgent',
          createdAt: '2026-10-18T00:00:00Z',
        },
      ];

      const html = renderToStaticMarkup(
        React.createElement(WeekView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: collidingAppointments,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectSlot: () => {},
          onSelectAppointment: () => {},
        })
      );

      // Verify that the first appointment is rendered in the week slot
      expect(html).toContain('Doctor 1 Patient');
      // The second appointment at the same slot in the single week column is omitted by find()
      expect(html).not.toContain('Doctor 2 Patient');
    });

    test('CalendarSkeleton Month View: empirically verifies 35 cells in current implementation', () => {
      const html = renderToStaticMarkup(
        React.createElement(CalendarSkeleton, { viewMode: 'month' })
      );

      // Extract all animated views in grid
      // Note: CalendarSkeleton uses Array.from({ length: 35 }) for month
      const comp = renderWithCapture(
        React.createElement(CalendarSkeleton, { viewMode: 'month' })
      );
      const gridContainer = comp.props.children[1];
      const monthGrid = gridContainer.props.children[0];
      const cells = monthGrid.props.children;
      expect(cells.length).toBe(35); // 5 weeks (35 cells) in skeleton vs 6 weeks (42 cells) in MonthView
    });

    test('isSlotCollision: comprehensive interval overlap and boundary testing', () => {
      const base = '2026-10-20T09:00:00Z';
      // Identical intervals: collide
      expect(isSlotCollision(base, 30, base, 30)).toBe(true);
      // Interval 2 starts during Interval 1: collide
      expect(isSlotCollision(base, 60, '2026-10-20T09:30:00Z', 30)).toBe(true);
      // Interval 1 encloses Interval 2: collide
      expect(isSlotCollision(base, 120, '2026-10-20T09:30:00Z', 30)).toBe(true);
      // Abutting intervals: do NOT collide
      expect(isSlotCollision(base, 30, '2026-10-20T09:30:00Z', 30)).toBe(false);
      // Disjoint intervals: do NOT collide
      expect(isSlotCollision(base, 30, '2026-10-20T10:00:00Z', 30)).toBe(false);
    });

    test('AppointmentRescheduleModal: displays external conflict error banner when passed conflictError prop', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentRescheduleModal, {
          visible: true,
          appointment: testAppointments[0],
          onClose: () => {},
          conflictError: 'Double booking conflict detected on selected doctor schedule.',
        })
      );

      expect(html).toContain('data-testid="conflict-alert"');
      expect(html).toContain('Double booking conflict detected on selected doctor schedule.');
    });
  });
});
