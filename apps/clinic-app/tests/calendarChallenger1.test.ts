// token-guard:ignore-file
/**
 * Empirical Challenger 1 Verification Suite (calendarChallenger1.test.ts)
 * 
 * Comprehensive stress-test suite challenging:
 * 1. Gregorian grid math across 100+ years and all 12 months (28, 29, 30, 31 days)
 * 2. Leap year edge cases (2024, 2028 vs 2025, 2026, 2027, 2000, 1900, 2100)
 * 3. Interval collision calculations (abutting, overlapping, disjoint, sub-millisecond, commutativity)
 * 4. Slot interval generation (07:00 to 19:00 with 30-minute intervals, custom bounds, boundaries)
 * 5. Clinical urgency and appointment status token resolution (explicit, inferred, full status enum)
 * 6. Doctor timeline availability and shift template overlays (working hours, breaks, leaves, off-duty)
 * 7. 4 UX States (Skeleton, Empty, Error, Active) across all 4 Calendar views
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
import type { AppointmentStatus } from '../services/clinicService';
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

// React Native mock for headless test runner
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

describe('Challenger 1 Empirical Stress Test Suite', () => {
  beforeEach(() => {
    mockWindowWidth = 1280;
    mockWindowHeight = 800;
    mockToasts.reset();
  });

  // =========================================================================
  // 1. Gregorian Grid Math Across Multiple Years & Months (28, 29, 30, 31 Days)
  // =========================================================================
  describe('1. Gregorian Grid Math Across Multiple Years & Months', () => {
    test('100-Year Exhaustive Sweep (1970–2070 = 1,212 months): 42 cells, strict consecutive dates, exact Sunday-to-Saturday column alignment', () => {
      let totalMonths = 0;

      for (let y = 1970; y <= 2070; y++) {
        for (let m = 1; m <= 12; m++) {
          totalMonths++;
          const grid = generateMonthGrid(y, m);
          expect(grid.length).toBe(42);

          const daysInM = getDaysInMonth(y, m);
          const currentCells = grid.filter((c) => c.isCurrentMonth);
          expect(currentCells.length).toBe(daysInM);
          expect(currentCells[0].dayNumber).toBe(1);
          expect(currentCells[currentCells.length - 1].dayNumber).toBe(daysInM);

          // Invariant: every cell must have day-of-week matching (i % 7) (0 = Sunday, 6 = Saturday)
          for (let i = 0; i < 42; i++) {
            const cell = grid[i];
            const [cy, cm, cd] = cell.dateString.split('-').map(Number);
            const dow = new Date(Date.UTC(cy, cm - 1, cd)).getUTCDay();
            expect(dow).toBe(i % 7);

            // Invariant: strictly consecutive days
            if (i > 0) {
              const prev = grid[i - 1];
              const [py, pm, pd] = prev.dateString.split('-').map(Number);
              const prevTime = Date.UTC(py, pm - 1, pd);
              const currTime = Date.UTC(cy, cm - 1, cd);
              expect(currTime - prevTime).toBe(86400000);
            }
          }
        }
      }

      expect(totalMonths).toBe(1212);
    });

    test('Short month (28 days): February 2026 starts on Sunday, exactly 0 leading days, 14 trailing days', () => {
      const grid = generateMonthGrid(2026, 2);
      expect(grid.length).toBe(42);
      expect(grid[0].dateString).toBe('2026-02-01');
      expect(grid[0].isCurrentMonth).toBe(true);
      expect(grid[0].dayNumber).toBe(1);

      // 28 days of February
      expect(grid[27].dateString).toBe('2026-02-28');
      expect(grid[27].isCurrentMonth).toBe(true);

      // Exactly 14 trailing days (March 1 to March 14)
      expect(grid[28].dateString).toBe('2026-03-01');
      expect(grid[28].isCurrentMonth).toBe(false);
      expect(grid[41].dateString).toBe('2026-03-14');
      expect(grid[41].isCurrentMonth).toBe(false);
    });

    test('30-Day months: April, June, September, November produce exactly 30 current-month cells', () => {
      const thirtyDayMonths = [4, 6, 9, 11];
      for (const m of thirtyDayMonths) {
        const grid = generateMonthGrid(2026, m);
        expect(grid.length).toBe(42);
        const currentCells = grid.filter((c) => c.isCurrentMonth);
        expect(currentCells.length).toBe(30);
        expect(currentCells[29].dayNumber).toBe(30);
      }
    });

    test('31-Day months: January, March, May, July, August, October, December produce exactly 31 current-month cells', () => {
      const thirtyOneDayMonths = [1, 3, 5, 7, 8, 10, 12];
      for (const m of thirtyOneDayMonths) {
        const grid = generateMonthGrid(2026, m);
        expect(grid.length).toBe(42);
        const currentCells = grid.filter((c) => c.isCurrentMonth);
        expect(currentCells.length).toBe(31);
        expect(currentCells[30].dayNumber).toBe(31);
      }
    });

    test('Year boundary crossover: January wraps leading days to December of prior year, December wraps trailing days to January of next year', () => {
      // January 2026: Jan 1 is Thursday -> 4 leading days from December 2025
      const janGrid = generateMonthGrid(2026, 1);
      expect(janGrid[0].dateString).toBe('2025-12-28');
      expect(janGrid[0].dayNumber).toBe(28);
      expect(janGrid[0].isCurrentMonth).toBe(false);
      expect(janGrid[3].dateString).toBe('2025-12-31');
      expect(janGrid[4].dateString).toBe('2026-01-01');
      expect(janGrid[4].isCurrentMonth).toBe(true);

      // December 2026: Dec 31 is Thursday -> 2 trailing days in January 2027
      const decGrid = generateMonthGrid(2026, 12);
      const dec31 = decGrid.find((c) => c.dateString === '2026-12-31');
      expect(dec31).toBeDefined();
      expect(dec31?.isCurrentMonth).toBe(true);
      expect(decGrid[decGrid.length - 1].dateString).toBe('2027-01-09');
      expect(decGrid[decGrid.length - 1].isCurrentMonth).toBe(false);
    });

    test('Month start on all 7 days of the week', () => {
      // Sun: Feb 2026 (firstDay = 0, leading = 0)
      const sunGrid = generateMonthGrid(2026, 2);
      expect(sunGrid[0].isCurrentMonth).toBe(true);

      // Mon: Feb 2027 (firstDay = 1, leading = 1)
      const monGrid = generateMonthGrid(2027, 2);
      expect(monGrid[0].isCurrentMonth).toBe(false);
      expect(monGrid[1].isCurrentMonth).toBe(true);

      // Tue: Dec 2026 (firstDay = 2, leading = 2)
      const tueGrid = generateMonthGrid(2026, 12);
      expect(tueGrid[1].isCurrentMonth).toBe(false);
      expect(tueGrid[2].isCurrentMonth).toBe(true);

      // Wed: Jul 2026 (firstDay = 3, leading = 3)
      const wedGrid = generateMonthGrid(2026, 7);
      expect(wedGrid[2].isCurrentMonth).toBe(false);
      expect(wedGrid[3].isCurrentMonth).toBe(true);

      // Thu: Oct 2026 (firstDay = 4, leading = 4)
      const thuGrid = generateMonthGrid(2026, 10);
      expect(thuGrid[3].isCurrentMonth).toBe(false);
      expect(thuGrid[4].isCurrentMonth).toBe(true);

      // Fri: May 2026 (firstDay = 5, leading = 5)
      const friGrid = generateMonthGrid(2026, 5);
      expect(friGrid[4].isCurrentMonth).toBe(false);
      expect(friGrid[5].isCurrentMonth).toBe(true);

      // Sat: Aug 2026 (firstDay = 6, leading = 6)
      const satGrid = generateMonthGrid(2026, 8);
      expect(satGrid[5].isCurrentMonth).toBe(false);
      expect(satGrid[6].isCurrentMonth).toBe(true);
    });
  });

  // =========================================================================
  // 2. Leap Year Edge Cases (2024, 2028 vs Non-Leap 2025, 2026, 2027, Centuries)
  // =========================================================================
  describe('2. Leap Year Edge Cases', () => {
    test('isLeapYear: standard leap years, standard non-leap years, and 400-year century exceptions', () => {
      // Leap years
      expect(isLeapYear(2020)).toBe(true);
      expect(isLeapYear(2024)).toBe(true);
      expect(isLeapYear(2028)).toBe(true);
      expect(isLeapYear(2032)).toBe(true);
      expect(isLeapYear(1600)).toBe(true); // divisible by 400
      expect(isLeapYear(2000)).toBe(true); // divisible by 400
      expect(isLeapYear(2400)).toBe(true); // divisible by 400

      // Non-leap years
      expect(isLeapYear(2021)).toBe(false);
      expect(isLeapYear(2022)).toBe(false);
      expect(isLeapYear(2023)).toBe(false);
      expect(isLeapYear(2025)).toBe(false);
      expect(isLeapYear(2026)).toBe(false);
      expect(isLeapYear(2027)).toBe(false);
      expect(isLeapYear(1700)).toBe(false); // divisible by 100, not 400
      expect(isLeapYear(1800)).toBe(false);
      expect(isLeapYear(1900)).toBe(false);
      expect(isLeapYear(2100)).toBe(false);
    });

    test('getDaysInMonth(year, 2): returns 29 for leap years and 28 for non-leap years', () => {
      expect(getDaysInMonth(2024, 2)).toBe(29);
      expect(getDaysInMonth(2028, 2)).toBe(29);
      expect(getDaysInMonth(2000, 2)).toBe(29);
      expect(getDaysInMonth(2025, 2)).toBe(28);
      expect(getDaysInMonth(2026, 2)).toBe(28);
      expect(getDaysInMonth(2027, 2)).toBe(28);
      expect(getDaysInMonth(2100, 2)).toBe(28);

      // Invalid months
      expect(getDaysInMonth(2026, 0)).toBe(0);
      expect(getDaysInMonth(2026, 13)).toBe(0);
      expect(getDaysInMonth(2026, -1)).toBe(0);
    });

    test('February 29 in leap year 2024 & 2028: correctly generates cell for Feb 29 and links appointments', () => {
      const feb29Appt: ExtendedAppointmentItem = {
        id: 'appt-leap-1',
        clinicId: 'clinic-1',
        patientId: 'pat-leap',
        patientName: 'Leap Patient',
        doctorId: 'doc-santos',
        scheduledAt: '2024-02-29T10:00:00Z',
        durationMinutes: 30,
        status: 'Confirmed',
        urgency: 'Urgent',
        createdAt: '2024-02-01T00:00:00Z',
      };

      const grid2024 = generateMonthGrid(2024, 2, [feb29Appt]);
      expect(grid2024.length).toBe(42);

      const cell29 = grid2024.find((c) => c.dateString === '2024-02-29');
      expect(cell29).toBeDefined();
      expect(cell29?.isCurrentMonth).toBe(true);
      expect(cell29?.dayNumber).toBe(29);
      expect(cell29?.appointments.length).toBe(1);
      expect(cell29?.appointments[0].patientName).toBe('Leap Patient');

      // In 2028: Feb 29 exists as Tuesday
      const grid2028 = generateMonthGrid(2028, 2);
      const cell29_2028 = grid2028.find((c) => c.dateString === '2028-02-29');
      expect(cell29_2028).toBeDefined();
      expect(cell29_2028?.isCurrentMonth).toBe(true);
    });

    test('Non-leap February 2026 does NOT include Feb 29', () => {
      const grid2026 = generateMonthGrid(2026, 2);
      const cell29 = grid2026.find((c) => c.dateString === '2026-02-29');
      expect(cell29).toBeUndefined();
    });
  });

  // =========================================================================
  // 3. Interval Collision Calculations (Abutting, Overlapping, Disjoint Slots)
  // =========================================================================
  describe('3. Interval Collision Calculations', () => {
    test('Exact match collision: two slots starting at same time collide', () => {
      expect(isSlotCollision('2026-10-20T09:00:00Z', 30, '2026-10-20T09:00:00Z', 30)).toBe(true);
    });

    test('Full containment: slot A contains slot B', () => {
      expect(isSlotCollision('2026-10-20T09:00:00Z', 60, '2026-10-20T09:15:00Z', 30)).toBe(true);
      expect(isSlotCollision('2026-10-20T09:15:00Z', 30, '2026-10-20T09:00:00Z', 60)).toBe(true);
    });

    test('Partial overlap: slot A starts earlier and overlaps slot B', () => {
      expect(isSlotCollision('2026-10-20T09:00:00Z', 30, '2026-10-20T09:15:00Z', 30)).toBe(true);
      expect(isSlotCollision('2026-10-20T09:15:00Z', 30, '2026-10-20T09:00:00Z', 30)).toBe(true);
    });

    test('Abutting boundary (end == start): abutting slots do NOT collide (09:00-09:30 and 09:30-10:00)', () => {
      // Slot 1: [09:00, 09:30) vs Slot 2: [09:30, 10:00)
      expect(isSlotCollision('2026-10-20T09:00:00Z', 30, '2026-10-20T09:30:00Z', 30)).toBe(false);
      // Commutative check
      expect(isSlotCollision('2026-10-20T09:30:00Z', 30, '2026-10-20T09:00:00Z', 30)).toBe(false);
    });

    test('Disjoint slots with positive gap do NOT collide', () => {
      expect(isSlotCollision('2026-10-20T08:00:00Z', 30, '2026-10-20T10:00:00Z', 30)).toBe(false);
      expect(isSlotCollision('2026-10-20T10:00:00Z', 30, '2026-10-20T08:00:00Z', 30)).toBe(false);
    });

    test('Disjoint slots across different calendar days do NOT collide', () => {
      expect(isSlotCollision('2026-10-20T09:00:00Z', 30, '2026-10-21T09:00:00Z', 30)).toBe(false);
    });

    test('Sub-millisecond boundary precision', () => {
      // 1 millisecond overlap: [09:00, 09:30:00.000) vs [09:29:59.999, 09:59:59.999) -> Collides!
      const t1 = '2026-10-20T09:00:00.000Z';
      const t2 = '2026-10-20T09:29:59.999Z';
      expect(isSlotCollision(t1, 30, t2, 30)).toBe(true);

      // 1 millisecond gap: [09:00, 09:30:00.000) vs [09:30:00.001, 10:00:00.001) -> Does not collide!
      const t3 = '2026-10-20T09:30:00.001Z';
      expect(isSlotCollision(t1, 30, t3, 30)).toBe(false);
    });

    test('Mathematical commutativity invariant: isSlotCollision(A, B) === isSlotCollision(B, A)', () => {
      const baseEpoch = 1792483200000; // 2026-10-20T08:00:00Z
      const offsets = [0, 15, 30, 45, 60, 90, 120];
      const durations = [15, 30, 45, 60];

      for (const off1 of offsets) {
        for (const dur1 of durations) {
          for (const off2 of offsets) {
            for (const dur2 of durations) {
              const start1 = new Date(baseEpoch + off1 * 60000);
              const start2 = new Date(baseEpoch + off2 * 60000);
              const ab = isSlotCollision(start1, dur1, start2, dur2);
              const ba = isSlotCollision(start2, dur2, start1, dur1);
              expect(ab).toBe(ba);
            }
          }
        }
      }
    });
  });

  // =========================================================================
  // 4. Slot Interval Generation (07:00 to 19:00 with 30-Minute Intervals)
  // =========================================================================
  describe('4. Slot Interval Generation', () => {
    test('Default operating bounds: exactly 24 30-minute intervals from 07:00 to 18:30 (covering 07:00–19:00)', () => {
      const slots = generateDayTimeSlots();
      expect(slots.length).toBe(24);

      // First slot
      expect(slots[0].timeStr).toBe('07:00');
      expect(slots[0].hour).toBe(7);
      expect(slots[0].minute).toBe(0);

      // Second slot
      expect(slots[1].timeStr).toBe('07:30');
      expect(slots[1].hour).toBe(7);
      expect(slots[1].minute).toBe(30);

      // Midday slot
      const slot12 = slots.find((s) => s.timeStr === '12:00');
      expect(slot12).toBeDefined();
      expect(slot12?.hour).toBe(12);
      expect(slot12?.minute).toBe(0);

      // Final slot covers 18:30 to 19:00
      expect(slots[slots.length - 1].timeStr).toBe('18:30');
      expect(slots[slots.length - 1].hour).toBe(18);
      expect(slots[slots.length - 1].minute).toBe(30);

      // 19:00 is end-of-day boundary (not a starting slot)
      expect(slots.find((s) => s.timeStr === '19:00')).toBeUndefined();
    });

    test('Slots are strictly ascending by exactly 30 minutes with correct zero-padding', () => {
      const slots = generateDayTimeSlots(7, 19, 30);
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        expect(slot.timeStr).toMatch(/^\d{2}:\d{2}$/);
        expect(slot.timeStr).toBe(`${padZero(slot.hour)}:${padZero(slot.minute)}`);

        if (i > 0) {
          const prev = slots[i - 1];
          const prevMin = prev.hour * 60 + prev.minute;
          const currMin = slot.hour * 60 + slot.minute;
          expect(currMin - prevMin).toBe(30);
        }
      }
    });

    test('Custom parameters: 15-minute intervals from 08:00 to 12:00 produce 16 slots', () => {
      const slots = generateDayTimeSlots(8, 12, 15);
      expect(slots.length).toBe(16);
      expect(slots[0].timeStr).toBe('08:00');
      expect(slots[1].timeStr).toBe('08:15');
      expect(slots[2].timeStr).toBe('08:30');
      expect(slots[3].timeStr).toBe('08:45');
      expect(slots[slots.length - 1].timeStr).toBe('11:45');
    });

    test('Degenerate bounds: startHour >= endHour returns empty array without crashing', () => {
      expect(generateDayTimeSlots(10, 10, 30)).toEqual([]);
      expect(generateDayTimeSlots(15, 10, 30)).toEqual([]);
    });
  });

  // =========================================================================
  // 5. Urgency Token Resolution for All Urgency and Status Values
  // =========================================================================
  describe('5. Urgency & Status Token Resolution', () => {
    test('Explicit clinical urgency: STAT, Urgent, Routine resolve exact theme tokens', () => {
      const stat = resolveUrgencyTokens('STAT');
      expect(stat.badgeBg).toBe(theme.colors.emergencyBg);
      expect(stat.badgeText).toBe(theme.colors.emergencyText);
      expect(stat.borderColor).toBe(theme.colors.emergencyBorder);
      expect(stat.label).toBe('STAT Emergency');

      const urgent = resolveUrgencyTokens('Urgent');
      expect(urgent.badgeBg).toBe(theme.colors.urgentBg);
      expect(urgent.badgeText).toBe(theme.colors.urgentText);
      expect(urgent.borderColor).toBe(theme.colors.urgentBorder);
      expect(urgent.label).toBe('Urgent');

      const routine = resolveUrgencyTokens('Routine');
      expect(routine.badgeBg).toBe(theme.colors.primaryLight);
      expect(routine.badgeText).toBe(theme.colors.primary);
      expect(routine.borderColor).toBe(theme.colors.primary);
      expect(routine.label).toBe('Routine');
    });

    test('Inferred clinical urgency: detects STAT keywords (stat, emergency, critical, anaphylaxis, trauma)', () => {
      expect(resolveAppointmentUrgency({ reason: 'Critical dyspnea' })).toBe('STAT');
      expect(resolveAppointmentUrgency({ notes: 'Severe anaphylaxis after injection' })).toBe('STAT');
      expect(resolveAppointmentUrgency({ serviceType: 'Emergency Consultation' })).toBe('STAT');
      expect(resolveAppointmentUrgency({ reason: 'Blunt trauma evaluation' })).toBe('STAT');
    });

    test('Inferred clinical urgency: detects Urgent keywords (urgent, acute, chest, pain, fever, bleeding)', () => {
      expect(resolveAppointmentUrgency({ reason: 'Acute bronchitis' })).toBe('Urgent');
      expect(resolveAppointmentUrgency({ reason: 'Unexplained chest discomfort' })).toBe('Urgent');
      expect(resolveAppointmentUrgency({ reason: 'High grade fever for 3 days' })).toBe('Urgent');
      expect(resolveAppointmentUrgency({ reason: 'Severe joint pain' })).toBe('Urgent');
      expect(resolveAppointmentUrgency({ reason: 'Active bleeding gums' })).toBe('Urgent');
    });

    test('Inferred clinical urgency: defaults to Routine for regular appointments or empty text', () => {
      expect(resolveAppointmentUrgency({ reason: 'Regular hypertension follow-up' })).toBe('Routine');
      expect(resolveAppointmentUrgency({ reason: 'Annual physical exam' })).toBe('Routine');
      expect(resolveAppointmentUrgency({})).toBe('Routine');
    });

    test('Exhaustive AppointmentStatus token mapping: covers all 6 domain statuses with exact tokens', () => {
      const statuses: AppointmentStatus[] = [
        'Confirmed',
        'CheckedIn',
        'InConsultation',
        'Pending',
        'Completed',
        'Cancelled',
      ];

      for (const s of statuses) {
        const tokens = resolveStatusTokens(s);
        expect(tokens.badgeBg).toBeDefined();
        expect(tokens.badgeText).toBeDefined();
        expect(tokens.borderColor).toBeDefined();
        expect(tokens.label).toBeDefined();
        expect(typeof tokens.isStrikethrough).toBe('boolean');

        if (s === 'Cancelled') {
          expect(tokens.isStrikethrough).toBe(true);
          expect(tokens.borderColor).toBe(theme.colors.emergencyBorder);
        } else {
          expect(tokens.isStrikethrough).toBe(false);
        }

        if (s === 'CheckedIn') {
          expect(tokens.badgeBg).toBe(theme.colors.successBg);
        }
        if (s === 'InConsultation') {
          expect(tokens.badgeBg).toBe(theme.colors.purpleBg);
        }
        if (s === 'Pending') {
          expect(tokens.badgeBg).toBe(theme.colors.warningBg);
        }
        if (s === 'Completed') {
          expect(tokens.badgeBg).toBe(theme.colors.surfaceMuted);
        }
      }
    });

    test('Graceful fallback: unknown status string maps safely to Confirmed tokens without throwing', () => {
      const unknownTokens = resolveStatusTokens('UnknownStatus' as any);
      expect(unknownTokens.badgeBg).toBe(theme.colors.primaryLight);
      expect(unknownTokens.label).toBe('Confirmed');
      expect(unknownTokens.isStrikethrough).toBe(false);
    });
  });

  // =========================================================================
  // 6. Doctor Timeline Availability & Shift Overlays
  // =========================================================================
  describe('6. Doctor Timeline Availability & Shift Overlays', () => {
    const doctorOverlay: DoctorShiftOverlay = {
      doctorId: 'doc-santos',
      doctorName: 'Dr. Roberto Santos',
      isOnDuty: true,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      breaks: [
        { start: '12:00', end: '13:00', description: 'Lunch Break' },
        { start: '15:00', end: '15:15', description: 'Coffee Break' },
      ],
      roomName: 'Exam Room 1',
    };

    test('Doctor shift boundaries: on-duty vs off-duty slots', () => {
      // Prior to shift start -> OffDuty
      expect(evaluateDoctorAvailabilityForSlot('2026-10-20', '07:30', doctorOverlay).status).toBe('OffDuty');
      // At shift start (08:00) -> Available
      expect(evaluateDoctorAvailabilityForSlot('2026-10-20', '08:00', doctorOverlay).status).toBe('Available');
      // Normal slot during shift -> Available
      expect(evaluateDoctorAvailabilityForSlot('2026-10-20', '10:30', doctorOverlay).status).toBe('Available');
      // At shift end (17:00) -> OffDuty
      expect(evaluateDoctorAvailabilityForSlot('2026-10-20', '17:00', doctorOverlay).status).toBe('OffDuty');
      // After shift end -> OffDuty
      expect(evaluateDoctorAvailabilityForSlot('2026-10-20', '18:00', doctorOverlay).status).toBe('OffDuty');
    });

    test('Shift break intervals: marks slots during breaks with description and blocks booking', () => {
      // 12:00 is during lunch break
      const lunch12 = evaluateDoctorAvailabilityForSlot('2026-10-20', '12:00', doctorOverlay);
      expect(lunch12.status).toBe('Break');
      expect(lunch12.isAvailable).toBe(false);
      expect(lunch12.reason).toBe('Lunch Break');

      // 12:30 is during lunch break
      const lunch1230 = evaluateDoctorAvailabilityForSlot('2026-10-20', '12:30', doctorOverlay);
      expect(lunch1230.status).toBe('Break');
      expect(lunch1230.isAvailable).toBe(false);

      // 13:00 is abutting the end of lunch -> Available
      const postLunch = evaluateDoctorAvailabilityForSlot('2026-10-20', '13:00', doctorOverlay);
      expect(postLunch.status).toBe('Available');
      expect(postLunch.isAvailable).toBe(true);
    });

    test('Doctor on Leave: all slots marked as Leave with approved reason', () => {
      const leaveOverlay: DoctorShiftOverlay = {
        doctorId: 'doc-tan',
        doctorName: 'Dr. Jose Tan',
        isOnDuty: false,
        shiftStart: '08:00',
        shiftEnd: '17:00',
        breaks: [],
        leave: { type: 'CME', reason: 'Annual Medical Convention' },
      };

      const result = evaluateDoctorAvailabilityForSlot('2026-10-20', '10:00', leaveOverlay);
      expect(result.status).toBe('Leave');
      expect(result.isAvailable).toBe(false);
      expect(result.reason).toBe('Annual Medical Convention');
    });

    test('Physician marked off duty: returns OffDuty for any slot', () => {
      const offDutyOverlay: DoctorShiftOverlay = {
        ...doctorOverlay,
        isOnDuty: false,
      };

      const result = evaluateDoctorAvailabilityForSlot('2026-10-20', '10:00', offDutyOverlay);
      expect(result.status).toBe('OffDuty');
      expect(result.isAvailable).toBe(false);
    });
  });

  // =========================================================================
  // 7. 4 UX States (Skeleton, Empty, Error, Active) Across All Calendar Views
  // =========================================================================
  describe('7. 4 UX Interaction States Across Calendar Views', () => {
    test('State 1 (Skeleton Loading): MonthView, WeekView, DayView, AgendaView all render structural skeleton when isLoading=true', () => {
      const monthSkeleton = renderToStaticMarkup(
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
      expect(monthSkeleton).toContain('data-testid="calendar-skeleton"');
      expect(monthSkeleton).toContain('data-testid="skeleton-grid"');

      const weekSkeleton = renderToStaticMarkup(
        React.createElement(WeekView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: [],
          isLoading: true,
          error: null,
          onRetry: () => {},
          onSelectSlot: () => {},
          onSelectAppointment: () => {},
        })
      );
      expect(weekSkeleton).toContain('data-testid="calendar-skeleton"');

      const daySkeleton = renderToStaticMarkup(
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
      expect(daySkeleton).toContain('data-testid="calendar-skeleton"');

      const agendaSkeleton = renderToStaticMarkup(
        React.createElement(AgendaView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: [],
          isLoading: true,
          error: null,
          onRetry: () => {},
          onSelectSlot: () => {},
          onSelectAppointment: () => {},
        })
      );
      expect(agendaSkeleton).toContain('data-testid="calendar-skeleton"');
    });

    test('State 2 (Contextual Empty State): AgendaView renders EmptyState with action CTA when no appointments match', () => {
      let slotSelected = false;
      const html = renderToStaticMarkup(
        React.createElement(AgendaView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: [],
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectSlot: () => { slotSelected = true; },
          onSelectAppointment: () => {},
        })
      );

      expect(html).toContain('No appointments scheduled');
      expect(html).toContain('Book appointment');
    });

    test('State 3 (Actionable Error State): MonthView, WeekView, DayView, AgendaView all render ErrorState with retry trigger', () => {
      const err = new Error('Database connection failed');
      const views = [MonthView, WeekView, DayView, AgendaView];

      for (const ViewComponent of views) {
        let retryCalled = false;
        const html = renderToStaticMarkup(
          React.createElement(ViewComponent, {
            currentDate: new Date('2026-10-20T00:00:00Z'),
            appointments: [],
            isLoading: false,
            error: err,
            onRetry: () => { retryCalled = true; },
            onSelectDate: () => {},
            onSelectSlot: () => {},
            onSelectAppointment: () => {},
          })
        );

        expect(html).toContain('data-testid="calendar-error-state"');
        expect(html).toContain('Failed to load clinic calendar');
        expect(html).toContain('Database connection failed');
        expect(html).toContain('Retry');
      }
    });

    test('State 4 (Active State): Views display interactive appointment chips and doctor data', () => {
      const monthHtml = renderToStaticMarkup(
        React.createElement(MonthView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: sampleAppointments,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );
      expect(monthHtml).toContain('Juan Dela Cruz');
      expect(monthHtml).toContain('Maria Santos');

      const weekHtml = renderToStaticMarkup(
        React.createElement(WeekView, {
          currentDate: new Date('2026-10-20T00:00:00Z'),
          appointments: sampleAppointments,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectSlot: () => {},
          onSelectAppointment: () => {},
        })
      );
      expect(weekHtml).toContain('data-testid="week-slot-2026-10-20-08:30"');
      expect(weekHtml).toContain('Juan Dela Cruz');

      const dayHtml = renderToStaticMarkup(
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
      expect(dayHtml).toContain('Dr. Roberto Santos');
      expect(dayHtml).toContain('Dr. Elena Reyes');
      expect(dayHtml).toContain('Dr. Jose Tan');
    });
  });

  // =========================================================================
  // 8. Timezone & Title Formatting
  // =========================================================================
  describe('8. Timezone & Title Formatting', () => {
    test('formatTime12 formats standard 24h operational strings to 12h AM/PM strings', () => {
      expect(formatTime12('07:00')).toBe('7:00 AM');
      expect(formatTime12('08:30')).toBe('8:30 AM');
      expect(formatTime12('12:00')).toBe('12:00 PM');
      expect(formatTime12('12:30')).toBe('12:30 PM');
      expect(formatTime12('13:00')).toBe('1:00 PM');
      expect(formatTime12('18:30')).toBe('6:30 PM');
      expect(formatTime12('00:00')).toBe('12:00 AM');
      expect(formatTime12('')).toBe('');
    });

    test('formatDateTitle handles Month, Day, Week, and Agenda view modes correctly', () => {
      const d = new Date(Date.UTC(2026, 9, 20)); // Oct 20, 2026
      expect(formatDateTitle('month', d)).toBe('October 2026');
      expect(formatDateTitle('agenda', d)).toBe('October 2026');
      expect(formatDateTitle('day', d)).toContain('Oct 20, 2026');

      // Week view spanning within same month
      const weekTitle = formatDateTitle('week', d);
      expect(weekTitle).toContain('Oct');
      expect(weekTitle).toContain('2026');
    });
  });
});
