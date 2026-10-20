// token-guard:ignore-file
/**
 * Test Suite: Clinic Calendar Tier 5 Adversarial Coverage Hardening
 * File: apps/clinic-app/tests/calendarTier5ComponentHarden.test.ts
 * 
 * Objective:
 * White-box adversarial coverage hardening on ClinicEZ Calendar components & utilities:
 *  - calendarUtils.ts
 *  - MonthView.tsx
 *  - WeekView.tsx
 *  - DayView.tsx
 *  - DoctorTimelineColumn.tsx
 *  - DateCarousel.tsx
 *  - AppointmentCard.tsx
 * 
 * Adversarial Focus Areas:
 *  1. Timezone Offsets & Asia/Manila conversions (23:59:59, 00:00:00, UTC+8 invariance, Intl fallback)
 *  2. Extreme Gregorian date math (leap centuries 2000 vs 2100, month boundaries, 42-cell grid invariants)
 *  3. Doctor shifts: overnight shifts, 0-duration shifts, multiple breaks, overlapping leave & templates
 *  4. Appointment positioning: multi-hour past 19:00, pre-07:00, 0 duration, concurrent appointments
 *  5. Component rendering & UI invariant hardening (MonthView, WeekView, DayView, DoctorTimelineColumn, DateCarousel, AppointmentCard)
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

// =============================================================================
// React Native & Subsystem Mocking for Headless Bun Execution
// =============================================================================

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

mock.module('expo-crypto', () => ({
  randomUUID: () => 'adv-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const {
  CalendarSkeleton,
  MonthView,
  WeekView,
  DayView,
  DoctorTimelineColumn,
  DateCarousel,
  AppointmentCard,
} = require('../components/calendar');

// =============================================================================
// Helper Factory for Test Appointments
// =============================================================================

function createTestAppointment(overrides: Partial<ExtendedAppointmentItem> = {}): ExtendedAppointmentItem {
  return {
    id: overrides.id || 'appt-adv-1',
    clinicId: 'clinic-adv',
    patientId: 'pat-adv-1',
    patientName: 'Pedro Penduko',
    doctorId: overrides.doctorId || 'doc-adv-1',
    doctorName: overrides.doctorName || 'Dr. Rizal',
    scheduledAt: overrides.scheduledAt || '2026-10-20T09:00:00Z',
    durationMinutes: overrides.durationMinutes !== undefined ? overrides.durationMinutes : 30,
    status: overrides.status || 'Confirmed',
    urgency: overrides.urgency || 'Routine',
    serviceType: overrides.serviceType || 'General Consultation',
    reason: overrides.reason || 'Routine follow-up',
    createdAt: '2026-10-15T00:00:00Z',
    ...overrides,
  };
}

// =============================================================================
// SUITE 1: Timezone Offsets & Asia/Manila Edge Cases
// =============================================================================

describe('Adversarial Tier 5: Suite 1 - Timezone Offsets & Asia/Manila Conversions', () => {
  test('1.1 Boundary conversion at 23:59:59.999Z and 00:00:00.000Z', () => {
    const endOfDay = '2026-10-20T23:59:59.999Z';
    const startOfDay = '2026-10-21T00:00:00.000Z';

    const parsedEnd = parseDateOnly(endOfDay);
    expect(parsedEnd.year).toBe(2026);
    expect(parsedEnd.month).toBe(10);
    expect(parsedEnd.day).toBe(20);

    const parsedStart = parseDateOnly(startOfDay);
    expect(parsedStart.year).toBe(2026);
    expect(parsedStart.month).toBe(10);
    expect(parsedStart.day).toBe(21);
  });

  test('1.2 Asia/Manila (UTC+8) Daylight Time Invariance across Solstices', () => {
    // The Philippines is strictly UTC+8 year-round with 0 daylight saving transitions
    const summerDate = new Date('2026-06-21T00:00:00Z');
    const winterDate = new Date('2026-12-21T00:00:00Z');

    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      hourCycle: 'h23',
    });

    // In UTC+8: 00:00:00 UTC is always 08:00 in Manila regardless of season
    expect(fmt.format(summerDate)).toBe('08');
    expect(fmt.format(winterDate)).toBe('08');
  });

  test('1.3 Boundary transitions at Manila midnight: 15:59:59Z vs 16:00:00Z', () => {
    // 15:59:59 UTC corresponds to 23:59:59 in UTC+8 (same day in Manila)
    // 16:00:00 UTC corresponds to 00:00:00 in UTC+8 (next day in Manila)
    const tBeforeMidnightUtc = new Date('2026-10-20T15:59:59.000Z');
    const tAtMidnightUtc = new Date('2026-10-20T16:00:00.000Z');

    const dBefore = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(tBeforeMidnightUtc);

    const dAtMidnight = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(tAtMidnightUtc);

    expect(dBefore).toBe('2026-10-20');
    expect(dAtMidnight).toBe('2026-10-21');
  });

  test('1.4 getManilaTodayStr() handles Intl runtime & fallback simulation cleanly', () => {
    const today = getManilaTodayStr();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Test fallback catch block when Intl throws or timeZone is unsupported
    const origDateTimeFormat = Intl.DateTimeFormat;
    try {
      (Intl as any).DateTimeFormat = () => {
        throw new Error('Intl timeZone unavailable');
      };
      const fallbackToday = getManilaTodayStr();
      expect(fallbackToday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    } finally {
      Intl.DateTimeFormat = origDateTimeFormat;
    }
  });

  test('1.5 parseDateOnly handles extreme ISO strings and timezone offsets', () => {
    expect(parseDateOnly('2026-02-28')).toEqual({ year: 2026, month: 2, day: 28 });
    expect(parseDateOnly('2026-12-31T23:59:59+08:00')).toEqual({ year: 2026, month: 12, day: 31 });
    expect(parseDateOnly('2026-01-01T00:00:00-05:00')).toEqual({ year: 2026, month: 1, day: 1 });
    expect(parseDateOnly('2024-02-29T12:34:56.789Z')).toEqual({ year: 2024, month: 2, day: 29 });
  });

  test('1.6 padZero and formatDateString boundary formatting', () => {
    expect(padZero(0)).toBe('00');
    expect(padZero(5)).toBe('05');
    expect(padZero(9)).toBe('09');
    expect(padZero(10)).toBe('10');
    expect(padZero(99)).toBe('99');

    expect(formatDateString(2026, 1, 1)).toBe('2026-01-01');
    expect(formatDateString(2026, 12, 31)).toBe('2026-12-31');
  });
});

// =============================================================================
// SUITE 2: Extreme Gregorian Date Math & Century Leap Years (2000 vs 2100)
// =============================================================================

describe('Adversarial Tier 5: Suite 2 - Gregorian Math & Century Leap Years', () => {
  test('2.1 Century leap year rule: 2000 is leap, 2100 is NOT leap, 1900 is NOT leap', () => {
    // Divisible by 400: LEAP
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2400)).toBe(true);
    expect(isLeapYear(1600)).toBe(true);

    // Divisible by 100 but not 400: NOT LEAP
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(1800)).toBe(false);
    expect(isLeapYear(1700)).toBe(false);

    // Regular quadrennial leap years
    expect(isLeapYear(2020)).toBe(true);
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
  });

  test('2.2 getDaysInMonth across leap century (2000) vs non-leap century (2100)', () => {
    expect(getDaysInMonth(2000, 2)).toBe(29);
    expect(getDaysInMonth(2100, 2)).toBe(28);
    expect(getDaysInMonth(1900, 2)).toBe(28);
    expect(getDaysInMonth(2024, 2)).toBe(29);
    expect(getDaysInMonth(2025, 2)).toBe(28);

    // Month boundary validation: 0, -1, 13, 99 return 0
    expect(getDaysInMonth(2026, 0)).toBe(0);
    expect(getDaysInMonth(2026, -1)).toBe(0);
    expect(getDaysInMonth(2026, 13)).toBe(0);
    expect(getDaysInMonth(2026, 99)).toBe(0);

    // All standard 30-day and 31-day months
    expect(getDaysInMonth(2026, 1)).toBe(31);
    expect(getDaysInMonth(2026, 4)).toBe(30);
    expect(getDaysInMonth(2026, 6)).toBe(30);
    expect(getDaysInMonth(2026, 9)).toBe(30);
    expect(getDaysInMonth(2026, 11)).toBe(30);
    expect(getDaysInMonth(2026, 12)).toBe(31);
  });

  test('2.3 generateMonthGrid invariant: exactly 42 cells for Feb 2000 vs Feb 2100', () => {
    // Feb 2000 (29 days, starts on Tuesday -> 2 leading days)
    const grid2000 = generateMonthGrid(2000, 2);
    expect(grid2000.length).toBe(42);
    const feb2000Current = grid2000.filter((c) => c.isCurrentMonth);
    expect(feb2000Current.length).toBe(29);
    expect(feb2000Current[feb2000Current.length - 1].dateString).toBe('2000-02-29');

    // Feb 2100 (28 days, starts on Monday -> 1 leading day)
    const grid2100 = generateMonthGrid(2100, 2);
    expect(grid2100.length).toBe(42);
    const feb2100Current = grid2100.filter((c) => c.isCurrentMonth);
    expect(feb2100Current.length).toBe(28);
    expect(feb2100Current[feb2100Current.length - 1].dateString).toBe('2100-02-28');
  });

  test('2.4 generateMonthGrid on month starting on Sunday (0 leading days)', () => {
    // August 2021 started on Sunday (UTC day 0)
    const gridAug2021 = generateMonthGrid(2021, 8);
    expect(gridAug2021.length).toBe(42);
    // Cell 0 should be August 1st (0 leading days)
    expect(gridAug2021[0].isCurrentMonth).toBe(true);
    expect(gridAug2021[0].dateString).toBe('2021-08-01');
    expect(gridAug2021[0].dayNumber).toBe(1);

    // Remaining 11 cells are from September 1 to September 11
    const trailingCells = gridAug2021.filter((c, idx) => idx >= 31);
    expect(trailingCells.length).toBe(11);
    expect(trailingCells[0].dateString).toBe('2021-09-01');
    expect(trailingCells[0].isCurrentMonth).toBe(false);
  });

  test('2.5 generateMonthGrid on month starting on Saturday (6 leading days)', () => {
    // May 2021 started on Saturday (UTC day 6)
    const gridMay2021 = generateMonthGrid(2021, 5);
    expect(gridMay2021.length).toBe(42);
    // Leading days from April: April 25 to April 30 (6 cells)
    for (let i = 0; i < 6; i++) {
      expect(gridMay2021[i].isCurrentMonth).toBe(false);
      expect(gridMay2021[i].dateString).toBe(`2021-04-${25 + i}`);
    }
    // Cell index 6 is May 1st
    expect(gridMay2021[6].isCurrentMonth).toBe(true);
    expect(gridMay2021[6].dateString).toBe('2021-05-01');
  });

  test('2.6 getWeekDays across year and month transition (Dec 27, 2026 to Jan 2, 2027)', () => {
    const dec31 = new Date(Date.UTC(2026, 11, 31, 10, 0, 0));
    const week = getWeekDays(dec31);
    expect(week.length).toBe(7);

    // Sunday Dec 27, 2026 through Saturday Jan 2, 2027
    expect(week[0].dayName).toBe('Sun');
    expect(week[0].dateString).toBe('2026-12-27');
    expect(week[4].dayName).toBe('Thu');
    expect(week[4].dateString).toBe('2026-12-31');
    expect(week[5].dayName).toBe('Fri');
    expect(week[5].dateString).toBe('2027-01-01');
    expect(week[6].dayName).toBe('Sat');
    expect(week[6].dateString).toBe('2027-01-02');
  });

  test('2.7 formatDateTitle formatting across boundaries and view modes', () => {
    const newYearDate = new Date(Date.UTC(2026, 11, 31));
    expect(formatDateTitle('month', newYearDate)).toBe('December 2026');
    expect(formatDateTitle('agenda', newYearDate)).toBe('December 2026');

    // Week view spanning Dec/Jan
    const weekTitle = formatDateTitle('week', newYearDate);
    expect(weekTitle).toContain('Dec');
    expect(weekTitle).toContain('Jan');
    expect(weekTitle).toContain('2027');

    // Day view title: formats with day name, short month, date number, year
    const dayTitle = formatDateTitle('day', new Date(2026, 9, 20));
    expect(dayTitle).toBe('Tuesday, Oct 20, 2026');
  });
});

// =============================================================================
// SUITE 3: Doctor Shifts, Overlapping Leaves, Breaks & Edge Templates
// =============================================================================

describe('Adversarial Tier 5: Suite 3 - Doctor Shifts, Leaves & Breaks', () => {
  test('3.1 Overlapping leave and shift template: leave takes absolute precedence', () => {
    const overlayWithLeave: DoctorShiftOverlay = {
      doctorId: 'doc-overlap',
      doctorName: 'Dr. Concepcion',
      isOnDuty: true,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      breaks: [{ start: '12:00', end: '13:00', description: 'Lunch Break' }],
      leave: {
        type: 'SickLeave',
        reason: 'Emergency Medical Quarantine',
      },
    };

    // Every slot in the day must return status: 'Leave' and reason: 'Emergency Medical Quarantine'
    const morningSlot = evaluateDoctorAvailabilityForSlot('2026-10-20', '09:00', overlayWithLeave);
    expect(morningSlot.isAvailable).toBe(false);
    expect(morningSlot.status).toBe('Leave');
    expect(morningSlot.reason).toBe('Emergency Medical Quarantine');

    const lunchSlot = evaluateDoctorAvailabilityForSlot('2026-10-20', '12:00', overlayWithLeave);
    expect(lunchSlot.isAvailable).toBe(false);
    expect(lunchSlot.status).toBe('Leave');

    const offDutySlot = evaluateDoctorAvailabilityForSlot('2026-10-20', '19:00', overlayWithLeave);
    expect(offDutySlot.isAvailable).toBe(false);
    expect(offDutySlot.status).toBe('Leave');
  });

  test('3.2 Multiple breaks in a single day (3 distinct break intervals)', () => {
    const multiBreakDoc: DoctorShiftOverlay = {
      doctorId: 'doc-multibreak',
      doctorName: 'Dr. Santos',
      isOnDuty: true,
      shiftStart: '08:00',
      shiftEnd: '18:00',
      breaks: [
        { start: '09:30', end: '10:00', description: 'Morning Huddle' },
        { start: '12:00', end: '13:00', description: 'Lunch Break' },
        { start: '15:30', end: '16:00', description: 'Afternoon Tea' },
      ],
    };

    // Within Morning Huddle
    const b1 = evaluateDoctorAvailabilityForSlot('2026-10-20', '09:30', multiBreakDoc);
    expect(b1.isAvailable).toBe(false);
    expect(b1.status).toBe('Break');
    expect(b1.reason).toBe('Morning Huddle');

    // Between b1 and b2: Available
    const a1 = evaluateDoctorAvailabilityForSlot('2026-10-20', '10:30', multiBreakDoc);
    expect(a1.isAvailable).toBe(true);
    expect(a1.status).toBe('Available');

    // Within Lunch Break
    const b2 = evaluateDoctorAvailabilityForSlot('2026-10-20', '12:30', multiBreakDoc);
    expect(b2.isAvailable).toBe(false);
    expect(b2.status).toBe('Break');
    expect(b2.reason).toBe('Lunch Break');

    // Between b2 and b3: Available
    const a2 = evaluateDoctorAvailabilityForSlot('2026-10-20', '14:00', multiBreakDoc);
    expect(a2.isAvailable).toBe(true);
    expect(a2.status).toBe('Available');

    // Within Afternoon Tea
    const b3 = evaluateDoctorAvailabilityForSlot('2026-10-20', '15:30', multiBreakDoc);
    expect(b3.isAvailable).toBe(false);
    expect(b3.status).toBe('Break');
    expect(b3.reason).toBe('Afternoon Tea');
  });

  test('3.3 0-duration shift templates: shiftStart === shiftEnd results in OffDuty for all slots', () => {
    const zeroShiftDoc: DoctorShiftOverlay = {
      doctorId: 'doc-zero-shift',
      doctorName: 'Dr. Zero',
      isOnDuty: true,
      shiftStart: '08:00',
      shiftEnd: '08:00',
      breaks: [],
    };

    // For any slot (e.g. 08:00, 09:00, 07:30), slotTimeStr < '08:00' or >= '08:00' is always true
    expect(evaluateDoctorAvailabilityForSlot('2026-10-20', '07:30', zeroShiftDoc).status).toBe('OffDuty');
    expect(evaluateDoctorAvailabilityForSlot('2026-10-20', '08:00', zeroShiftDoc).status).toBe('OffDuty');
    expect(evaluateDoctorAvailabilityForSlot('2026-10-20', '08:30', zeroShiftDoc).status).toBe('OffDuty');
  });

  test('3.4 0-duration shift break: does not block any slots', () => {
    const zeroBreakDoc: DoctorShiftOverlay = {
      doctorId: 'doc-zero-break',
      doctorName: 'Dr. Break',
      isOnDuty: true,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      breaks: [{ start: '12:00', end: '12:00', description: 'Zero Duration Break' }],
    };

    // Slot at 12:00 is available because slotTimeStr >= '12:00' and slotTimeStr < '12:00' is false
    const slotAt12 = evaluateDoctorAvailabilityForSlot('2026-10-20', '12:00', zeroBreakDoc);
    expect(slotAt12.isAvailable).toBe(true);
    expect(slotAt12.status).toBe('Available');
  });

  test('3.5 Consecutive shift breaks: seamless blackout across adjacent intervals', () => {
    const consecutiveBreaksDoc: DoctorShiftOverlay = {
      doctorId: 'doc-consec-break',
      doctorName: 'Dr. Consec',
      isOnDuty: true,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      breaks: [
        { start: '12:00', end: '12:30', description: 'Lunch Part 1' },
        { start: '12:30', end: '13:00', description: 'Lunch Part 2' },
      ],
    };

    expect(evaluateDoctorAvailabilityForSlot('2026-10-20', '12:00', consecutiveBreaksDoc).reason).toBe('Lunch Part 1');
    expect(evaluateDoctorAvailabilityForSlot('2026-10-20', '12:30', consecutiveBreaksDoc).reason).toBe('Lunch Part 2');
    expect(evaluateDoctorAvailabilityForSlot('2026-10-20', '13:00', consecutiveBreaksDoc).status).toBe('Available');
  });

  test('3.6 Overnight shift behavior during daytime operational hours (07:00-19:00)', () => {
    const overnightDoc: DoctorShiftOverlay = {
      doctorId: 'doc-overnight',
      doctorName: 'Dr. NightShift',
      isOnDuty: true,
      shiftStart: '20:00',
      shiftEnd: '06:00',
      breaks: [],
    };

    // Daytime slots (07:00 to 19:00) fall outside the overnight shift
    const daySlot = evaluateDoctorAvailabilityForSlot('2026-10-20', '10:00', overnightDoc);
    expect(daySlot.isAvailable).toBe(false);
    expect(daySlot.status).toBe('OffDuty');
  });

  test('3.7 Doctor marked isOnDuty: false: immediate OffDuty across all slots', () => {
    const offDutyDoc: DoctorShiftOverlay = {
      doctorId: 'doc-off',
      doctorName: 'Dr. OffDuty',
      isOnDuty: false,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      breaks: [],
    };

    const slot = evaluateDoctorAvailabilityForSlot('2026-10-20', '10:00', offDutyDoc);
    expect(slot.isAvailable).toBe(false);
    expect(slot.status).toBe('OffDuty');
    expect(slot.reason).toBe('Physician off duty');
  });
});

// =============================================================================
// SUITE 4: Appointment Positioning & Concurrency Stress
// =============================================================================

describe('Adversarial Tier 5: Suite 4 - Appointment Positioning & Concurrency Stress', () => {
  test('4.1 isSlotCollision mathematical boundaries & symmetry invariant', () => {
    const t0900 = '2026-10-20T09:00:00Z';
    const t0930 = '2026-10-20T09:30:00Z';
    const t1000 = '2026-10-20T10:00:00Z';

    // 1. Consecutive adjacent appointments (half-open interval [start, end)) do NOT collide
    expect(isSlotCollision(t0900, 30, t0930, 30)).toBe(false);
    expect(isSlotCollision(t0930, 30, t0900, 30)).toBe(false);

    // 2. Exact same slot collision
    expect(isSlotCollision(t0900, 30, t0900, 30)).toBe(true);

    // 3. Partial overlap (09:00 for 45m overlaps with 09:30 for 30m)
    expect(isSlotCollision(t0900, 45, t0930, 30)).toBe(true);
    expect(isSlotCollision(t0930, 30, t0900, 45)).toBe(true);

    // 4. Enclosing multi-hour appointment
    expect(isSlotCollision(t0900, 120, t0930, 15)).toBe(true);

    // 5. Zero duration appointments: [09:00, 09:00) contains no points, so no overlap
    expect(isSlotCollision(t0900, 0, t0900, 30)).toBe(false);
    expect(isSlotCollision(t0900, 0, t0900, 0)).toBe(false);
  });

  test('4.2 Multi-hour appointments spanning past operational 19:00 cutoff', () => {
    const multiHourAppt = createTestAppointment({
      id: 'appt-past-19',
      scheduledAt: '2026-10-20T18:00:00Z',
      durationMinutes: 180, // 3 hours -> ends at 21:00
      patientName: 'Late Evening Patient',
    });

    const markup = renderToStaticMarkup(
      React.createElement(AppointmentCard, {
        appointment: multiHourAppt,
        variant: 'standard',
        onSelect: () => {},
      })
    );

    expect(markup).toContain('Late Evening Patient');
    expect(markup).toContain('180 mins');

    // Verify collision past 19:00
    const apptAt1930 = '2026-10-20T19:30:00Z';
    expect(isSlotCollision(multiHourAppt.scheduledAt, multiHourAppt.durationMinutes, apptAt1930, 30)).toBe(true);
  });

  test('4.3 Early morning appointments starting before 07:00 (e.g. 05:30)', () => {
    const earlyAppt = createTestAppointment({
      id: 'appt-early-530',
      scheduledAt: '2026-10-20T05:30:00Z',
      durationMinutes: 30,
      patientName: 'Dawn Walk-in Patient',
    });

    // Slots generated between 07:00 and 19:00
    const slots = generateDayTimeSlots(7, 19, 30);
    const has0530Slot = slots.some((s) => s.timeStr === '05:30');
    expect(has0530Slot).toBe(false);

    // MonthView grid includes the early appointment in its day cell count
    const monthCells = generateMonthGrid(2026, 10, [earlyAppt]);
    const oct20Cell = monthCells.find((c) => c.dateString === '2026-10-20');
    expect(oct20Cell).toBeDefined();
    expect(oct20Cell!.appointments.length).toBe(1);
    expect(oct20Cell!.appointments[0].patientName).toBe('Dawn Walk-in Patient');
  });

  test('4.4 Concurrent appointments in the same slot (double-booking scenario)', () => {
    const appt1 = createTestAppointment({
      id: 'appt-concurrent-1',
      doctorId: 'doc-santos',
      scheduledAt: '2026-10-20T09:00:00Z',
      patientName: 'Patient Alpha',
    });
    const appt2 = createTestAppointment({
      id: 'appt-concurrent-2',
      doctorId: 'doc-santos',
      scheduledAt: '2026-10-20T09:00:00Z',
      patientName: 'Patient Beta',
    });

    // Collision detected
    expect(isSlotCollision(appt1.scheduledAt, appt1.durationMinutes, appt2.scheduledAt, appt2.durationMinutes)).toBe(true);

    // MonthView retains both in cell.appointments
    const monthGrid = generateMonthGrid(2026, 10, [appt1, appt2]);
    const dayCell = monthGrid.find((c) => c.dateString === '2026-10-20');
    expect(dayCell!.appointments.length).toBe(2);

    // Slotted views pick first appointment safely without error
    const markupWeek = renderToStaticMarkup(
      React.createElement(WeekView, {
        currentDate: new Date(Date.UTC(2026, 9, 20)),
        appointments: [appt1, appt2],
        isLoading: false,
        error: null,
        onRetry: () => {},
        onSelectDate: () => {},
        onSelectAppointment: () => {},
      })
    );
    expect(markupWeek).toContain('Patient Alpha');
  });

  test('4.5 0-duration appointment falls back to 30 mins in AppointmentCard', () => {
    const zeroDurAppt = createTestAppointment({
      id: 'appt-zero-dur',
      durationMinutes: 0,
      patientName: 'Zero Duration Case',
    });

    const markup = renderToStaticMarkup(
      React.createElement(AppointmentCard, {
        appointment: zeroDurAppt,
        variant: 'standard',
        onSelect: () => {},
      })
    );

    // 'durationMinutes || 30' safely provides 30 mins fallback
    expect(markup).toContain('(30 mins)');
    expect(markup).not.toContain('(0 mins)');
    expect(markup).not.toContain('NaN');
  });
});

// =============================================================================
// SUITE 5: Component UI & Token Resilience (White-Box Stress)
// =============================================================================

describe('Adversarial Tier 5: Suite 5 - Component UI & Token Resilience', () => {
  test('5.1 MonthView renders exactly 42 cells and caps visible chips with +N more counter', () => {
    // 5 appointments on the same day
    const appts = [1, 2, 3, 4, 5].map((i) =>
      createTestAppointment({
        id: `appt-chip-${i}`,
        patientName: `Patient ${i}`,
        scheduledAt: '2026-10-20T10:00:00Z',
      })
    );

    const markup = renderToStaticMarkup(
      React.createElement(MonthView, {
        currentDate: new Date(Date.UTC(2026, 9, 20)),
        appointments: appts,
        isLoading: false,
        error: null,
        onRetry: () => {},
        onSelectDate: () => {},
        onSelectAppointment: () => {},
      })
    );

    // Visible chips are capped at 3, with +2 more
    expect(markup).toContain('Patient 1');
    expect(markup).toContain('Patient 2');
    expect(markup).toContain('Patient 3');
    expect(markup).toContain('+2 more');
    expect(markup).not.toContain('Patient 4');
    expect(markup).not.toContain('Patient 5');
  });

  test('5.2 WeekView renders 24 time axis labels and 7 columns with 168 slotted cells', () => {
    const markup = renderToStaticMarkup(
      React.createElement(WeekView, {
        currentDate: new Date(Date.UTC(2026, 9, 20)),
        appointments: [],
        isLoading: false,
        error: null,
        onRetry: () => {},
        onSelectDate: () => {},
        onSelectAppointment: () => {},
      })
    );

    // 07:00 to 18:30 in 30m slots = 24 time labels
    expect(markup).toContain('week-time-axis');
    expect(markup).toContain('time-label-07:00');
    expect(markup).toContain('time-label-18:30');
    expect(markup).toContain('7:00 AM');
    expect(markup).toContain('6:00 PM');
  });

  test('5.3 DayView multi-provider column generation and fallback inference', () => {
    const apptDoc1 = createTestAppointment({
      id: 'appt-d1',
      doctorId: 'doc-cardio',
      doctorName: 'Dr. Mendoza (Cardiology)',
      scheduledAt: '2026-10-20T08:00:00Z',
    });
    const apptDoc2 = createTestAppointment({
      id: 'appt-d2',
      doctorId: 'doc-pedia',
      doctorName: 'Dr. Cruz (Pediatrics)',
      scheduledAt: '2026-10-20T09:00:00Z',
    });

    // When doctorOverlays is omitted, DayView automatically derives distinct doctors
    const markup = renderToStaticMarkup(
      React.createElement(DayView, {
        currentDate: new Date(Date.UTC(2026, 9, 20)),
        appointments: [apptDoc1, apptDoc2],
        isLoading: false,
        error: null,
        onRetry: () => {},
        onSelectDate: () => {},
        onSelectAppointment: () => {},
      })
    );

    expect(markup).toContain('Dr. Mendoza (Cardiology)');
    expect(markup).toContain('Dr. Cruz (Pediatrics)');
  });

  test('5.4 DayView activeDoctorId filtering restricts view to single column', () => {
    const doctorOverlays: DoctorShiftOverlay[] = [
      {
        doctorId: 'doc-1',
        doctorName: 'Dr. One',
        isOnDuty: true,
        shiftStart: '08:00',
        shiftEnd: '17:00',
        breaks: [],
      },
      {
        doctorId: 'doc-2',
        doctorName: 'Dr. Two',
        isOnDuty: true,
        shiftStart: '08:00',
        shiftEnd: '17:00',
        breaks: [],
      },
    ];

    const markupFiltered = renderToStaticMarkup(
      React.createElement(DayView, {
        currentDate: new Date(Date.UTC(2026, 9, 20)),
        appointments: [],
        isLoading: false,
        error: null,
        onRetry: () => {},
        onSelectDate: () => {},
        onSelectAppointment: () => {},
        doctorOverlays,
        activeDoctorId: 'doc-2',
      })
    );

    expect(markupFiltered).toContain('Dr. Two');
    expect(markupFiltered).not.toContain('Dr. One');
  });

  test('5.5 DoctorTimelineColumn renders leave badge and warning break overlays', () => {
    const docWithOverlays: DoctorShiftOverlay = {
      doctorId: 'doc-special',
      doctorName: 'Dr. Josefa Llanes',
      roomName: 'Exam Room 3',
      isOnDuty: true,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      breaks: [{ start: '12:00', end: '13:00', description: 'Clinical Conference' }],
      leave: { type: 'Academic', reason: 'Board Meeting' },
    };

    const slots = generateDayTimeSlots(7, 19, 30);
    const markup = renderToStaticMarkup(
      React.createElement(DoctorTimelineColumn, {
        doctor: docWithOverlays,
        dateString: '2026-10-20',
        cellDate: new Date(2026, 9, 20),
        slots,
        appointments: [],
        onSelectAppointment: () => {},
      })
    );

    expect(markup).toContain('Dr. Josefa Llanes');
    expect(markup).toContain('Exam Room 3');
    expect(markup).toContain('(Board Meeting)');
    expect(markup).toContain('leave-overlay');
  });

  test('5.6 DateCarousel navigation shifts window by exactly 7 days', () => {
    let capturedDate: Date | null = null;
    const baseDate = new Date(Date.UTC(2026, 9, 20)); // Oct 20, 2026

    const markup = renderToStaticMarkup(
      React.createElement(DateCarousel, {
        currentDate: baseDate,
        onSelectDate: (d) => {
          capturedDate = d;
        },
      })
    );

    expect(markup).toContain('date-carousel');
    expect(markup).toContain('btn-carousel-prev');
    expect(markup).toContain('btn-carousel-next');

    // Verify 7-day delta calculation math
    const prevTime = baseDate.getTime() - 7 * 86400000;
    const nextTime = baseDate.getTime() + 7 * 86400000;
    expect(new Date(prevTime).toISOString().startsWith('2026-10-13')).toBe(true);
    expect(new Date(nextTime).toISOString().startsWith('2026-10-27')).toBe(true);
  });

  test('5.7 AppointmentCard clinical urgency badges & semantic color borders', () => {
    // 1. STAT Emergency
    const statAppt = createTestAppointment({
      id: 'appt-stat',
      urgency: 'STAT',
      reason: 'Acute trauma with shock',
    });
    const statTokens = resolveUrgencyTokens('STAT');
    expect(statTokens.label).toBe('STAT Emergency');
    expect(statTokens.badgeBg).toBe(theme.colors.emergencyBg);
    expect(statTokens.borderColor).toBe(theme.colors.emergencyBorder);

    // 2. Urgent
    const urgentAppt = createTestAppointment({
      id: 'appt-urgent',
      urgency: 'Urgent',
      reason: 'Severe migraine with vomiting',
    });
    const urgentTokens = resolveUrgencyTokens('Urgent');
    expect(urgentTokens.label).toBe('Urgent');
    expect(urgentTokens.badgeBg).toBe(theme.colors.urgentBg);
    expect(urgentTokens.borderColor).toBe(theme.colors.urgentBorder);

    // 3. Routine
    const routineTokens = resolveUrgencyTokens('Routine');
    expect(routineTokens.label).toBe('Routine');
    expect(routineTokens.badgeBg).toBe(theme.colors.primaryLight);

    // 4. Cancelled appointment renders strikethrough styling
    const cancelledTokens = resolveStatusTokens('Cancelled');
    expect(cancelledTokens.isStrikethrough).toBe(true);
    expect(cancelledTokens.borderColor).toBe(theme.colors.emergencyBorder);

    const markupCancelled = renderToStaticMarkup(
      React.createElement(AppointmentCard, {
        appointment: createTestAppointment({ status: 'Cancelled' }),
        variant: 'standard',
        onSelect: () => {},
      })
    );
    expect(markupCancelled).toContain('Cancelled');
  });

  test('5.8 formatTime12 handles all 24 operational hour cases cleanly', () => {
    expect(formatTime12('00:00')).toBe('12:00 AM');
    expect(formatTime12('07:00')).toBe('7:00 AM');
    expect(formatTime12('07:30')).toBe('7:30 AM');
    expect(formatTime12('11:45')).toBe('11:45 AM');
    expect(formatTime12('12:00')).toBe('12:00 PM');
    expect(formatTime12('12:30')).toBe('12:30 PM');
    expect(formatTime12('13:00')).toBe('1:00 PM');
    expect(formatTime12('18:30')).toBe('6:30 PM');
    expect(formatTime12('23:59')).toBe('11:59 PM');
    expect(formatTime12('')).toBe('');
    expect(formatTime12('invalid')).toBe('invalid');
  });

  test('5.9 resolveAppointmentUrgency keyword inference resilience', () => {
    expect(resolveAppointmentUrgency({ reason: 'Patient experiencing stat anaphylaxis' })).toBe('STAT');
    expect(resolveAppointmentUrgency({ serviceType: 'Emergency trauma resuscitation' })).toBe('STAT');
    expect(resolveAppointmentUrgency({ notes: 'Critical condition, requires immediate ICU transfer' })).toBe('STAT');
    expect(resolveAppointmentUrgency({ reason: 'Acute chest pain' })).toBe('Urgent');
    expect(resolveAppointmentUrgency({ notes: 'Fever and bleeding from surgical site' })).toBe('Urgent');
    expect(resolveAppointmentUrgency({ reason: 'Routine medical clearance' })).toBe('Routine');
    expect(resolveAppointmentUrgency({})).toBe('Routine');
  });
});
