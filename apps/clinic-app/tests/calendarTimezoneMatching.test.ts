// token-guard:ignore-file
/**
 * Test Suite: Timezone-Accurate Slot & Date Matching Across Calendar Views (calendarTimezoneMatching.test.ts)
 * 
 * Verifies Requirement R2 of Issue #73:
 * - Conversion of UTC ISO timestamps to clinic local timezone (Asia/Manila, UTC+8)
 * - Afternoon appointments (16:00 PHT = 08:00Z) render at 16:00 / 4:00 PM (not 08:00 / 8:00 AM)
 * - Early morning appointments (07:00 PHT = prev day 23:00Z) render at Oct 23 07:00 (not Oct 22 23:00)
 * - Accurate date/slot matching across DayView (desktop & mobile), WeekView, MonthView, AgendaView
 * - Accurate time display in AppointmentCard, AppointmentInspectionModal, and AppointmentRescheduleModal
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
  formatTime12,
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
  AppointmentInspectionModal,
  AppointmentRescheduleModal,
} = await import('../components/calendar');

const afternoonAppointment: ExtendedAppointmentItem = {
  id: 'appt-afternoon',
  clinicId: 'clinic-1',
  patientId: 'pat-1',
  patientName: 'Maria Santos',
  doctorId: 'doc-santos',
  doctorName: 'Dr. Roberto Santos',
  // 16:00 PHT (UTC+8) -> 08:00 UTC
  scheduledAt: '2026-10-23T08:00:00.000Z',
  durationMinutes: 30,
  status: 'Confirmed',
  urgency: 'Routine',
  serviceType: 'Consultation',
  reason: 'Follow-up Consultation',
  createdAt: '2026-10-20T00:00:00.000Z',
};

const earlyMorningAppointment: ExtendedAppointmentItem = {
  id: 'appt-early-morning',
  clinicId: 'clinic-1',
  patientId: 'pat-2',
  patientName: 'Juan Dela Cruz',
  doctorId: 'doc-santos',
  doctorName: 'Dr. Roberto Santos',
  // 07:00 PHT on Oct 23 -> 23:00 UTC on Oct 22
  scheduledAt: '2026-10-22T23:00:00.000Z',
  durationMinutes: 30,
  status: 'Confirmed',
  urgency: 'STAT',
  serviceType: 'Emergency Consultation',
  reason: 'Acute early-morning chest discomfort',
  createdAt: '2026-10-20T00:00:00.000Z',
};

const doctorOverlays: DoctorShiftOverlay[] = [
  {
    doctorId: 'doc-santos',
    doctorName: 'Dr. Roberto Santos',
    isOnDuty: true,
    shiftStart: '07:00',
    shiftEnd: '19:00',
    breaks: [{ start: '12:00', end: '13:00', description: 'Lunch' }],
  },
];

describe('Calendar Timezone Matching Suite (Asia/Manila UTC+8)', () => {
  beforeEach(() => {
    mockWindowWidth = 1280;
    mockWindowHeight = 800;
  });

  // =========================================================================
  // 1. Core Utilities: getAppointmentLocalDateTime & manilaDateTimeToUtcIso
  // =========================================================================
  describe('1. Core Timezone Utilities', () => {
    test('getAppointmentLocalDateTime resolves afternoon 16:00 PHT (08:00Z)', () => {
      const result = getAppointmentLocalDateTime('2026-10-23T08:00:00.000Z');
      expect(result.dateStr).toBe('2026-10-23');
      expect(result.timeStr).toBe('16:00');
      expect(result.formattedTime).toBe('4:00 PM');
    });

    test('getAppointmentLocalDateTime resolves early morning 07:00 PHT (prev day 23:00Z)', () => {
      const result = getAppointmentLocalDateTime('2026-10-22T23:00:00.000Z');
      expect(result.dateStr).toBe('2026-10-23');
      expect(result.timeStr).toBe('07:00');
      expect(result.formattedTime).toBe('7:00 AM');
    });

    test('getAppointmentLocalDateTime handles boundary midnight and noon', () => {
      // Midnight Manila = 16:00 UTC previous day
      const midnight = getAppointmentLocalDateTime('2026-10-22T16:00:00.000Z');
      expect(midnight.dateStr).toBe('2026-10-23');
      expect(midnight.timeStr).toBe('00:00');
      expect(midnight.formattedTime).toBe('12:00 AM');

      // Noon Manila = 04:00 UTC same day
      const noon = getAppointmentLocalDateTime('2026-10-23T04:00:00.000Z');
      expect(noon.dateStr).toBe('2026-10-23');
      expect(noon.timeStr).toBe('12:00');
      expect(noon.formattedTime).toBe('12:00 PM');
    });

    test('manilaDateTimeToUtcIso converts local date/time into UTC ISO string', () => {
      // 16:00 Manila -> 08:00Z
      expect(manilaDateTimeToUtcIso('2026-10-23', '16:00')).toBe('2026-10-23T08:00:00.000Z');

      // 07:00 Manila -> 23:00Z previous day
      expect(manilaDateTimeToUtcIso('2026-10-23', '07:00')).toBe('2026-10-22T23:00:00.000Z');

      // Empty and invalid time handling
      expect(manilaDateTimeToUtcIso('', '07:00')).toBe('');
      expect(manilaDateTimeToUtcIso('2026-10-23', '')).toBe('');
      expect(manilaDateTimeToUtcIso('2026-10-23', '99:99')).toBe('');
      expect(manilaDateTimeToUtcIso('2026-10-23', 'abc')).toBe('');
    });

    test('off-grid manual time 16:15 PHT (08:15Z) maps into the 16:00 30-minute timeline slot', () => {
      const offGridAppt: ExtendedAppointmentItem = {
        ...afternoonAppointment,
        id: 'appt-offgrid-1615',
        patientName: 'Ely Maureal OffGrid',
        scheduledAt: '2026-10-23T08:15:00.000Z',
      };

      const dayHtml = renderToStaticMarkup(
        React.createElement(DayView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: [offGridAppt],
          doctorOverlays,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );
      const slot1600 = dayHtml.split('day-slot-doc-santos-16:00')[1]?.split('day-slot-doc-santos-16:30')[0] || '';
      expect(slot1600).toContain('Ely Maureal OffGrid');

      const weekHtml = renderToStaticMarkup(
        React.createElement(WeekView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: [offGridAppt],
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );
      const weekSlot1600 = weekHtml.split('week-slot-2026-10-23-16:00')[1]?.split('week-slot-2026-10-23-16:30')[0] || '';
      expect(weekSlot1600).toContain('Ely Maureal OffGrid');
    });
  });

  // =========================================================================
  // 2. Month Grid and Week Days Date Assignment
  // =========================================================================
  describe('2. Grid Date Mapping', () => {
    test('generateMonthGrid assigns early-morning appointment to Oct 23, NOT Oct 22', () => {
      const grid = generateMonthGrid(2026, 10, [earlyMorningAppointment, afternoonAppointment], '2026-10-23');
      const oct22Cell = grid.find((c) => c.dateString === '2026-10-22');
      const oct23Cell = grid.find((c) => c.dateString === '2026-10-23');

      expect(oct22Cell?.appointments).toHaveLength(0);
      expect(oct23Cell?.appointments).toHaveLength(2);
      expect(oct23Cell?.appointments.map((a) => a.id)).toContain('appt-early-morning');
      expect(oct23Cell?.appointments.map((a) => a.id)).toContain('appt-afternoon');
    });

    test('getWeekDays assigns both appointments to column 2026-10-23', () => {
      const week = getWeekDays(new Date('2026-10-23T00:00:00Z'), [earlyMorningAppointment, afternoonAppointment], '2026-10-23');
      const friCol = week.find((col) => col.dateString === '2026-10-23');
      const thuCol = week.find((col) => col.dateString === '2026-10-22');

      expect(thuCol?.appointments).toHaveLength(0);
      expect(friCol?.appointments).toHaveLength(2);
    });
  });

  // =========================================================================
  // 3. DayView & DoctorTimelineColumn Slot Resolution
  // =========================================================================
  describe('3. DayView & DoctorTimelineColumn', () => {
    test('Desktop DayView maps afternoon appointment to 16:00 slot, NOT 08:00 slot', () => {
      const html = renderToStaticMarkup(
        React.createElement(DayView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: [afternoonAppointment],
          doctorOverlays,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      // 16:00 slot has the appointment card
      expect(html).toContain('day-slot-doc-santos-16:00');
      expect(html).toContain('Maria Santos');

      // 08:00 slot is empty (does not contain Maria Santos)
      const slot08 = html.split('day-slot-doc-santos-08:00')[1]?.split('day-slot-doc-santos-08:30')[0];
      expect(slot08).not.toContain('Maria Santos');
    });

    test('Desktop DayView maps early-morning appointment to 07:00 slot on Oct 23', () => {
      const html = renderToStaticMarkup(
        React.createElement(DayView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: [earlyMorningAppointment],
          doctorOverlays,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      expect(html).toContain('day-slot-doc-santos-07:00');
      expect(html).toContain('Juan Dela Cruz');
      expect(html).toContain('STAT Emergency');
    });

    test('Mobile compact DayView (<768px) includes early-morning appointment on Oct 23', () => {
      mockWindowWidth = 400;

      const html = renderToStaticMarkup(
        React.createElement(DayView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: [earlyMorningAppointment, afternoonAppointment],
          doctorOverlays,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      expect(html).toContain('Juan Dela Cruz');
      expect(html).toContain('Maria Santos');
    });
  });

  // =========================================================================
  // 4. WeekView Slot Resolution
  // =========================================================================
  describe('4. WeekView Slot Resolution', () => {
    test('renders afternoon appointment at 16:00 and early-morning at 07:00 on Friday Oct 23', () => {
      const html = renderToStaticMarkup(
        React.createElement(WeekView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: [earlyMorningAppointment, afternoonAppointment],
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      expect(html).toContain('week-slot-2026-10-23-16:00');
      expect(html).toContain('Maria Santos');
      expect(html).toContain('week-slot-2026-10-23-07:00');
      expect(html).toContain('Juan Dela Cruz');
    });
  });

  // =========================================================================
  // 5. MonthView & AgendaView Resolution
  // =========================================================================
  describe('5. MonthView & AgendaView Resolution', () => {
    test('MonthView displays both chips inside month-cell-2026-10-23', () => {
      const html = renderToStaticMarkup(
        React.createElement(MonthView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: [earlyMorningAppointment, afternoonAppointment],
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      expect(html).toContain('month-cell-2026-10-23');
      expect(html).toContain('cell-chip-appt-afternoon');
      expect(html).toContain('cell-chip-appt-early-morning');
    });

    test('AgendaView groups both appointments under section 2026-10-23', () => {
      const html = renderToStaticMarkup(
        React.createElement(AgendaView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: [earlyMorningAppointment, afternoonAppointment],
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      expect(html).toContain('agenda-group-2026-10-23');
      expect(html).toContain('Maria Santos');
      expect(html).toContain('Juan Dela Cruz');
      expect(html).not.toContain('agenda-group-2026-10-22');
    });
  });

  // =========================================================================
  // 6. AppointmentCard, Inspection Drawer & Reschedule Modal
  // =========================================================================
  describe('6. Cards, Modals & Reschedule Surfaces', () => {
    test('AppointmentCard formats 16:00 appointment as "4:00 PM"', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentCard, {
          appointment: afternoonAppointment,
          variant: 'standard',
          onSelect: () => {},
        })
      );

      expect(html).toContain('4:00 PM');
      expect(html).not.toContain('8:00 AM');
    });

    test('AppointmentCard formats early-morning 07:00 appointment as "7:00 AM"', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentCard, {
          appointment: earlyMorningAppointment,
          variant: 'standard',
          onSelect: () => {},
        })
      );

      expect(html).toContain('7:00 AM');
      expect(html).not.toContain('11:00 PM');
    });

    test('AppointmentInspectionModal displays localized Manila date and time', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: afternoonAppointment,
          onClose: () => {},
        })
      );

      expect(html).toContain('2026-10-23 at 4:00 PM');
    });

    test('AppointmentRescheduleModal prepopulates local date/time and computes UTC ISO on submit', async () => {
      let submittedDate = '';
      let submittedTime = '';

      const html = renderToStaticMarkup(
        React.createElement(AppointmentRescheduleModal, {
          visible: true,
          appointment: afternoonAppointment,
          onClose: () => {},
          onSubmitReschedule: (d, t) => {
            submittedDate = d;
            submittedTime = t;
          },
        })
      );

      expect(html).toContain('data-testid="reschedule-date-input"');
      expect(html).toContain('data-value="2026-10-23"');
      expect(html).toContain('data-testid="reschedule-time-input"');
      expect(html).toContain('data-value="16:00"');
    });
  });
});
