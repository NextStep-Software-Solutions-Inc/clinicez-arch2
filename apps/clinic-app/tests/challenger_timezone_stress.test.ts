// token-guard:ignore-file
/**
 * Test Suite: Adversarial Timezone Stress & High-Density Calendar Harness (challenger_timezone_stress.test.ts)
 * 
 * Challenger 1 Adversarial Suite for Issue #73:
 * 1. Corner case timestamps: 00:00:00Z, 15:59:59Z, 16:00:00Z, 23:59:59Z, 23:00:00Z.
 * 2. Leap day boundaries (2028-02-29T16:00:00.000Z -> 2028-03-01 00:00, 2028-02-28T16:00:00.000Z -> 2028-02-29 00:00, Feb 29 midday).
 * 3. Year transitions (2026-12-31T20:00:00.000Z -> 2027-01-01 04:00, 2026-12-31T15:59:59.000Z -> 2026-12-31 23:59).
 * 4. High-density slots: 50+ appointments packed across Manila slots (count badges, "+N more", full agenda rendering).
 * 5. Multiple unassigned appointments in the same slot (no bleed, desktop & mobile timeline stability).
 * 6. Slot matching robustness across DoctorTimelineColumn, DayView, WeekView, MonthView, and AgendaView.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { theme } from '../constants/theme';
import type {
  ExtendedAppointmentItem,
  DoctorShiftOverlay,
} from '../components/calendar/types';
import {
  getAppointmentLocalDateTime,
  manilaDateTimeToUtcIso,
  generateMonthGrid,
  getWeekDays,
  formatDateTitle,
  isSlotCollision,
  getDaysInMonth,
  isLeapYear,
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
    defaultValue,
    value,
    showsHorizontalScrollIndicator,
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
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(visible !== undefined ? { 'data-visible': String(visible) } : {}),
        ...(defaultValue !== undefined ? { 'data-default-value': defaultValue } : {}),
        ...(value !== undefined ? { 'data-value': value } : {}),
        ...(showsHorizontalScrollIndicator !== undefined
          ? { 'data-shows-horizontal-scroll-indicator': String(showsHorizontalScrollIndicator) }
          : {}),
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

const mockBreakpoint = () => ({
  width: mockWindowWidth,
  height: mockWindowHeight,
  isCompact: mockWindowWidth < 768,
  isWorkstation: mockWindowWidth >= 768,
  isDesktop: mockWindowWidth >= 1024,
  isWide: mockWindowWidth >= 1280,
});

mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: mockBreakpoint,
}));

mock.module('../../utils/useBreakpoint', () => ({
  useBreakpoint: mockBreakpoint,
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const {
  AppointmentCard,
  MonthView,
  WeekView,
  DayView,
  AgendaView,
  DoctorTimelineColumn,
  UNASSIGNED_DOCTOR_ID,
  UNASSIGNED_OVERLAY,
} = await import('../components/calendar');

const mockDoctorOverlays: DoctorShiftOverlay[] = [
  {
    doctorId: 'doc-santos',
    doctorName: 'Dr. Roberto Santos',
    isOnDuty: true,
    shiftStart: '07:00',
    shiftEnd: '19:00',
    breaks: [{ start: '12:00', end: '13:00', description: 'Lunch Break' }],
  },
];

describe('Challenger 1: Adversarial Timezone & High-Density Calendar Stress Suite', () => {
  beforeEach(() => {
    mockWindowWidth = 1280;
    mockWindowHeight = 800;
  });

  // =========================================================================
  // SECTION 1: Exact Corner Case Timestamps
  // =========================================================================
  describe('1. Rigorous Corner Case Timestamps', () => {
    test('00:00:00Z maps to 08:00 PHT on the same calendar day', () => {
      const res = getAppointmentLocalDateTime('2026-10-23T00:00:00Z');
      expect(res.dateStr).toBe('2026-10-23');
      expect(res.timeStr).toBe('08:00');
      expect(res.formattedTime).toBe('8:00 AM');

      // Roundtrip confirmation
      expect(manilaDateTimeToUtcIso('2026-10-23', '08:00')).toBe('2026-10-23T00:00:00.000Z');
    });

    test('15:59:59Z remains on the same calendar day in Manila (23:59 PHT)', () => {
      const res = getAppointmentLocalDateTime('2026-10-23T15:59:59.000Z');
      expect(res.dateStr).toBe('2026-10-23');
      expect(res.timeStr).toBe('23:59');
      expect(res.formattedTime).toBe('11:59 PM');

      // MonthView must bucket this in Oct 23 cell, NOT Oct 24
      const grid = generateMonthGrid(2026, 10, [
        {
          id: 'appt-1559',
          clinicId: 'c1',
          patientId: 'p1',
          patientName: 'Late Patient',
          scheduledAt: '2026-10-23T15:59:59.000Z',
          durationMinutes: 1,
          status: 'Confirmed',
          urgency: 'Routine',
          createdAt: '2026-10-20T00:00:00.000Z',
        },
      ]);
      const oct23 = grid.find((c) => c.dateString === '2026-10-23');
      const oct24 = grid.find((c) => c.dateString === '2026-10-24');
      expect(oct23?.appointments).toHaveLength(1);
      expect(oct24?.appointments).toHaveLength(0);
    });

    test('16:00:00Z crosses midnight and advances to 00:00 PHT on NEXT day', () => {
      const res = getAppointmentLocalDateTime('2026-10-23T16:00:00.000Z');
      expect(res.dateStr).toBe('2026-10-24');
      expect(res.timeStr).toBe('00:00');
      expect(res.formattedTime).toBe('12:00 AM');

      // MonthView must bucket this in Oct 24 cell, strictly absent from Oct 23
      const grid = generateMonthGrid(2026, 10, [
        {
          id: 'appt-1600',
          clinicId: 'c1',
          patientId: 'p1',
          patientName: 'Midnight Patient',
          scheduledAt: '2026-10-23T16:00:00.000Z',
          durationMinutes: 30,
          status: 'Confirmed',
          urgency: 'Routine',
          createdAt: '2026-10-20T00:00:00.000Z',
        },
      ]);
      const oct23 = grid.find((c) => c.dateString === '2026-10-23');
      const oct24 = grid.find((c) => c.dateString === '2026-10-24');
      expect(oct23?.appointments).toHaveLength(0);
      expect(oct24?.appointments).toHaveLength(1);

      // Roundtrip confirmation
      expect(manilaDateTimeToUtcIso('2026-10-24', '00:00')).toBe('2026-10-23T16:00:00.000Z');
    });

    test('23:59:59Z maps to 07:59 PHT on next day', () => {
      const res = getAppointmentLocalDateTime('2026-10-23T23:59:59.000Z');
      expect(res.dateStr).toBe('2026-10-24');
      expect(res.timeStr).toBe('07:59');
      expect(res.formattedTime).toBe('7:59 AM');
    });

    test('23:00:00Z previous day maps to exactly clinic opening (07:00 PHT) on next day', () => {
      const res = getAppointmentLocalDateTime('2026-10-22T23:00:00.000Z');
      expect(res.dateStr).toBe('2026-10-23');
      expect(res.timeStr).toBe('07:00');
      expect(res.formattedTime).toBe('7:00 AM');

      // Roundtrip confirmation
      expect(manilaDateTimeToUtcIso('2026-10-23', '07:00')).toBe('2026-10-22T23:00:00.000Z');
    });
  });

  // =========================================================================
  // SECTION 2: Leap Day Boundaries
  // =========================================================================
  describe('2. Leap Day Boundaries & Rollovers', () => {
    test('isLeapYear handles 2028 (leap), 2027 (non-leap), 2000 (leap), 2100 (non-leap)', () => {
      expect(isLeapYear(2028)).toBe(true);
      expect(isLeapYear(2027)).toBe(false);
      expect(isLeapYear(2000)).toBe(true);
      expect(isLeapYear(2100)).toBe(false);
      expect(getDaysInMonth(2028, 2)).toBe(29);
      expect(getDaysInMonth(2027, 2)).toBe(28);
    });

    test('2028-02-29T16:00:00.000Z rolls over from leap day to March 1 (2028-03-01 00:00)', () => {
      const res = getAppointmentLocalDateTime('2028-02-29T16:00:00.000Z');
      expect(res.dateStr).toBe('2028-03-01');
      expect(res.timeStr).toBe('00:00');
      expect(res.formattedTime).toBe('12:00 AM');

      // MonthView in March 2028: Appt is in cell 2028-03-01
      const marchGrid = generateMonthGrid(2028, 3, [
        {
          id: 'appt-leap-roll',
          clinicId: 'c1',
          patientId: 'p1',
          patientName: 'March 1 Baby',
          scheduledAt: '2028-02-29T16:00:00.000Z',
          durationMinutes: 30,
          status: 'Confirmed',
          urgency: 'Routine',
          createdAt: '2028-02-01T00:00:00.000Z',
        },
      ]);
      const mar1Cell = marchGrid.find((c) => c.dateString === '2028-03-01');
      const feb29Cell = marchGrid.find((c) => c.dateString === '2028-02-29');
      expect(mar1Cell?.appointments).toHaveLength(1);
      expect(feb29Cell?.appointments).toHaveLength(0);

      // Roundtrip confirmation
      expect(manilaDateTimeToUtcIso('2028-03-01', '00:00')).toBe('2028-02-29T16:00:00.000Z');
    });

    test('2028-02-28T16:00:00.000Z rolls over into leap day Feb 29 (2028-02-29 00:00)', () => {
      const res = getAppointmentLocalDateTime('2028-02-28T16:00:00.000Z');
      expect(res.dateStr).toBe('2028-02-29');
      expect(res.timeStr).toBe('00:00');
      expect(res.formattedTime).toBe('12:00 AM');

      const febGrid = generateMonthGrid(2028, 2, [
        {
          id: 'appt-leap-day',
          clinicId: 'c1',
          patientId: 'p1',
          patientName: 'Leap Day Child',
          scheduledAt: '2028-02-28T16:00:00.000Z',
          durationMinutes: 30,
          status: 'Confirmed',
          urgency: 'Routine',
          createdAt: '2028-02-01T00:00:00.000Z',
        },
      ]);
      const feb28Cell = febGrid.find((c) => c.dateString === '2028-02-28');
      const feb29Cell = febGrid.find((c) => c.dateString === '2028-02-29');
      expect(feb28Cell?.appointments).toHaveLength(0);
      expect(feb29Cell?.appointments).toHaveLength(1);

      // Roundtrip confirmation
      expect(manilaDateTimeToUtcIso('2028-02-29', '00:00')).toBe('2028-02-28T16:00:00.000Z');
    });

    test('Midday leap day appointment (2028-02-29T02:30:00.000Z -> 10:30 PHT) renders in timeline', () => {
      const appt: ExtendedAppointmentItem = {
        id: 'appt-leap-midday',
        clinicId: 'c1',
        patientId: 'p1',
        patientName: 'Leap Midday Patient',
        doctorId: 'doc-santos',
        doctorName: 'Dr. Roberto Santos',
        scheduledAt: '2028-02-29T02:30:00.000Z', // 10:30 PHT
        durationMinutes: 30,
        status: 'Confirmed',
        urgency: 'Routine',
        createdAt: '2028-02-01T00:00:00.000Z',
      };

      const html = renderToStaticMarkup(
        React.createElement(DayView, {
          currentDate: new Date('2028-02-29T12:00:00+08:00'),
          appointments: [appt],
          doctorOverlays: mockDoctorOverlays,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      expect(html).toContain('day-slot-doc-santos-10:30');
      expect(html).toContain('Leap Midday Patient');
    });

    test('Non-leap year (2027) Feb 28 16:00:00Z rolls straight to March 1 (2027-03-01 00:00)', () => {
      const res = getAppointmentLocalDateTime('2027-02-28T16:00:00.000Z');
      expect(res.dateStr).toBe('2027-03-01');
      expect(res.timeStr).toBe('00:00');

      expect(manilaDateTimeToUtcIso('2027-03-01', '00:00')).toBe('2027-02-28T16:00:00.000Z');
    });
  });

  // =========================================================================
  // SECTION 3: Year Transitions
  // =========================================================================
  describe('3. Year Transitions (2026 -> 2027)', () => {
    test('2026-12-31T20:00:00.000Z rolls over to New Year 2027-01-01 04:00', () => {
      const res = getAppointmentLocalDateTime('2026-12-31T20:00:00.000Z');
      expect(res.dateStr).toBe('2027-01-01');
      expect(res.timeStr).toBe('04:00');
      expect(res.formattedTime).toBe('4:00 AM');

      // Roundtrip confirmation
      expect(manilaDateTimeToUtcIso('2027-01-01', '04:00')).toBe('2026-12-31T20:00:00.000Z');
    });

    test('2026-12-31T15:59:59.000Z stays in 2026 (2026-12-31 23:59 PHT)', () => {
      const res = getAppointmentLocalDateTime('2026-12-31T15:59:59.000Z');
      expect(res.dateStr).toBe('2026-12-31');
      expect(res.timeStr).toBe('23:59');
      expect(res.formattedTime).toBe('11:59 PM');
    });

    test('December 2026 MonthView trailing days correctly place 2027-01-01 appointment', () => {
      const appt: ExtendedAppointmentItem = {
        id: 'appt-ny-2027',
        clinicId: 'c1',
        patientId: 'p1',
        patientName: 'New Year Patient',
        scheduledAt: '2026-12-31T20:00:00.000Z', // Jan 1 04:00 PHT
        durationMinutes: 30,
        status: 'Confirmed',
        urgency: 'Routine',
        createdAt: '2026-12-01T00:00:00.000Z',
      };

      const decGrid = generateMonthGrid(2026, 12, [appt]);
      const jan1Cell = decGrid.find((c) => c.dateString === '2027-01-01');
      const dec31Cell = decGrid.find((c) => c.dateString === '2026-12-31');

      expect(dec31Cell?.appointments).toHaveLength(0);
      expect(jan1Cell).toBeDefined();
      expect(jan1Cell?.isCurrentMonth).toBe(false);
      expect(jan1Cell?.appointments).toHaveLength(1);
      expect(jan1Cell?.appointments[0].id).toBe('appt-ny-2027');
    });

    test('January 2027 MonthView places 2027-01-01 appointment in currentMonth cell', () => {
      const appt: ExtendedAppointmentItem = {
        id: 'appt-ny-2027',
        clinicId: 'c1',
        patientId: 'p1',
        patientName: 'New Year Patient',
        scheduledAt: '2026-12-31T20:00:00.000Z', // Jan 1 04:00 PHT
        durationMinutes: 30,
        status: 'Confirmed',
        urgency: 'Routine',
        createdAt: '2026-12-01T00:00:00.000Z',
      };

      const janGrid = generateMonthGrid(2027, 1, [appt]);
      const jan1Cell = janGrid.find((c) => c.dateString === '2027-01-01');

      expect(jan1Cell).toBeDefined();
      expect(jan1Cell?.isCurrentMonth).toBe(true);
      expect(jan1Cell?.appointments).toHaveLength(1);
    });

    test('AgendaView renders year transition under section 2027-01-01', () => {
      const appt: ExtendedAppointmentItem = {
        id: 'appt-ny-2027',
        clinicId: 'c1',
        patientId: 'p1',
        patientName: 'New Year Patient',
        scheduledAt: '2026-12-31T20:00:00.000Z',
        durationMinutes: 30,
        status: 'Confirmed',
        urgency: 'STAT',
        createdAt: '2026-12-01T00:00:00.000Z',
      };

      const html = renderToStaticMarkup(
        React.createElement(AgendaView, {
          currentDate: new Date('2027-01-01T00:00:00Z'),
          appointments: [appt],
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      expect(html).toContain('agenda-group-2027-01-01');
      expect(html).toContain('New Year Patient');
      expect(html).toContain('STAT Emergency');
      expect(html).not.toContain('agenda-group-2026-12-31');
    });
  });

  // =========================================================================
  // SECTION 4: High-Density Slots & High Volume (50+ Appointments & Unassigned Multi-Booking)
  // =========================================================================
  describe('4. High-Density Slots & High Volume Stress', () => {
    // Generate 52 distinct appointments packed across 24 operational slots (07:00 to 18:30)
    const generate52Appointments = (): ExtendedAppointmentItem[] => {
      const list: ExtendedAppointmentItem[] = [];
      const slots = [
        '07:00', '07:30', '08:00', '08:30', '09:00', '09:30',
        '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
        '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
        '16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
      ];

      for (let i = 0; i < 52; i++) {
        const slotTime = slots[i % slots.length];
        const isUnassigned = i % 4 === 0;
        const scheduledAt = manilaDateTimeToUtcIso('2026-10-23', slotTime);
        list.push({
          id: `appt-density-${i + 1}`,
          clinicId: 'clinic-1',
          patientId: `pat-${i + 1}`,
          patientName: `Patient Density ${i + 1}`,
          doctorId: isUnassigned ? undefined : 'doc-santos',
          doctorName: isUnassigned ? undefined : 'Dr. Roberto Santos',
          scheduledAt,
          durationMinutes: 30,
          status: i % 5 === 0 ? 'CheckedIn' : 'Confirmed',
          urgency: i % 10 === 0 ? 'STAT' : i % 3 === 0 ? 'Urgent' : 'Routine',
          serviceType: 'Consultation',
          reason: `Checkup slot ${slotTime}`,
          createdAt: '2026-10-01T00:00:00.000Z',
        });
      }
      return list;
    };

    test('MonthView with 52 appointments on 2026-10-23 renders count badge 52 and "+49 more"', () => {
      const denseAppts = generate52Appointments();
      expect(denseAppts).toHaveLength(52);

      const html = renderToStaticMarkup(
        React.createElement(MonthView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: denseAppts,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      // Verify cell exists
      expect(html).toContain('month-cell-2026-10-23');
      // Count badge shows exactly 52
      expect(html).toContain('data-testid="cell-count-badge"');
      expect(html).toContain('>52<');
      // Chips capped at 3 with +49 more
      expect(html).toContain('+49 more');
    });

    test('AgendaView with 52 appointments on 2026-10-23 renders all 52 appointment cards', () => {
      const denseAppts = generate52Appointments();

      const html = renderToStaticMarkup(
        React.createElement(AgendaView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: denseAppts,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      expect(html).toContain('agenda-group-2026-10-23');
      expect(html).toContain('52 appointments');

      // Check first, middle, and last appointment cards rendered
      expect(html).toContain('Patient Density 1');
      expect(html).toContain('Patient Density 26');
      expect(html).toContain('Patient Density 52');
    });

    test('Multiple unassigned appointments in the SAME slot (10:00 PHT) render stably without crashing', () => {
      // 5 unassigned appointments booked at identical slot: 10:00 PHT (02:00Z)
      const slotTime = '10:00';
      const scheduledAt = manilaDateTimeToUtcIso('2026-10-23', slotTime);
      const multiUnassigned: ExtendedAppointmentItem[] = [
        {
          id: 'unassigned-1',
          clinicId: 'c1',
          patientId: 'p1',
          patientName: 'Unassigned Patient Alpha',
          doctorId: undefined,
          scheduledAt,
          durationMinutes: 30,
          status: 'Confirmed',
          urgency: 'Routine',
          createdAt: '2026-10-01T00:00:00.000Z',
        },
        {
          id: 'unassigned-2',
          clinicId: 'c1',
          patientId: 'p2',
          patientName: 'Unassigned Patient Beta',
          doctorId: null as any,
          scheduledAt,
          durationMinutes: 30,
          status: 'Confirmed',
          urgency: 'Urgent',
          createdAt: '2026-10-01T00:00:00.000Z',
        },
        {
          id: 'unassigned-3',
          clinicId: 'c1',
          patientId: 'p3',
          patientName: 'Unassigned Patient Gamma',
          doctorId: 'unassigned',
          scheduledAt,
          durationMinutes: 30,
          status: 'CheckedIn',
          urgency: 'STAT',
          createdAt: '2026-10-01T00:00:00.000Z',
        },
        {
          id: 'unassigned-4',
          clinicId: 'c1',
          patientId: 'p4',
          patientName: 'Unassigned Patient Delta',
          doctorId: undefined,
          scheduledAt,
          durationMinutes: 30,
          status: 'Confirmed',
          urgency: 'Routine',
          createdAt: '2026-10-01T00:00:00.000Z',
        },
        {
          id: 'unassigned-5',
          clinicId: 'c1',
          patientId: 'p5',
          patientName: 'Unassigned Patient Epsilon',
          doctorId: null as any,
          scheduledAt,
          durationMinutes: 30,
          status: 'Confirmed',
          urgency: 'Routine',
          createdAt: '2026-10-01T00:00:00.000Z',
        },
      ];

      // 1. Desktop DayView DoctorTimelineColumn: Renders slot and matches unassigned without error
      const desktopHtml = renderToStaticMarkup(
        React.createElement(DayView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: multiUnassigned,
          doctorOverlays: mockDoctorOverlays,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      // Unassigned column contains the 10:00 slot
      expect(desktopHtml).toContain('data-testid="day-slot-unassigned-10:00"');
      // Doctor Santos column does NOT contain any unassigned appointment
      const santosSlot10 = desktopHtml.split('day-slot-doc-santos-10:00')[1]?.split('day-slot-doc-santos-10:30')[0];
      expect(santosSlot10).not.toContain('Unassigned Patient');

      // 2. Mobile DayView: Renders ALL 5 unassigned appointments
      mockWindowWidth = 400;
      const mobileHtml = renderToStaticMarkup(
        React.createElement(DayView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: multiUnassigned,
          doctorOverlays: mockDoctorOverlays,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      expect(mobileHtml).toContain('Unassigned Patient Alpha');
      expect(mobileHtml).toContain('Unassigned Patient Beta');
      expect(mobileHtml).toContain('Unassigned Patient Gamma');
      expect(mobileHtml).toContain('Unassigned Patient Delta');
      expect(mobileHtml).toContain('Unassigned Patient Epsilon');

      // 3. AgendaView: Renders all 5 in the list
      const agendaHtml = renderToStaticMarkup(
        React.createElement(AgendaView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: multiUnassigned,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      expect(agendaHtml).toContain('5 appointments');
      expect(agendaHtml).toContain('Unassigned Patient Alpha');
      expect(agendaHtml).toContain('Unassigned Patient Epsilon');
    });
  });

  // =========================================================================
  // SECTION 5: Slot Collision & Cross-Boundary Interval Robustness
  // =========================================================================
  describe('5. Slot Collision & Interval Arithmetic', () => {
    test('isSlotCollision accurately detects collisions across UTC day boundaries', () => {
      // 07:00 PHT on Oct 23 = 23:00 UTC on Oct 22
      const slot1 = '2026-10-22T23:00:00.000Z'; // 07:00-07:30
      const slot2Overlapping = '2026-10-22T23:15:00.000Z'; // 07:15-07:45
      const slot3Adjacent = '2026-10-22T23:30:00.000Z'; // 07:30-08:00
      const slot4DifferentDay = '2026-10-23T23:00:00.000Z'; // 07:00 Oct 24

      expect(isSlotCollision(slot1, 30, slot2Overlapping, 30)).toBe(true);
      expect(isSlotCollision(slot1, 30, slot3Adjacent, 30)).toBe(false);
      expect(isSlotCollision(slot1, 30, slot4DifferentDay, 30)).toBe(false);
    });
  });

  // =========================================================================
  // SECTION 6: Title Formatting & Header Robustness
  // =========================================================================
  describe('6. Title Formatting Across Boundaries', () => {
    test('formatDateTitle formats leap day accurately', () => {
      const d = new Date(2028, 1, 29); // Feb 29, 2028
      expect(formatDateTitle('day', d)).toContain('Feb 29, 2028');
      expect(formatDateTitle('month', d)).toBe('February 2028');
    });

    test('formatDateTitle formats week bridging year transition', () => {
      // Dec 31, 2026 (Thursday) -> week spans Dec 27, 2026 to Jan 2, 2027
      const d = new Date(2026, 11, 31);
      const title = formatDateTitle('week', d);
      expect(title).toContain('Dec 27');
      expect(title).toContain('Jan 2, 2027');
    });
  });
});
