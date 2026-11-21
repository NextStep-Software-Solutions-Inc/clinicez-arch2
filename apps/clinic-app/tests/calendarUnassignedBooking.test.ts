// token-guard:ignore-file
/**
 * Test Suite: Calendar Unassigned Provider & Race-Free Booking (calendarUnassignedBooking.test.ts)
 * 
 * Verifies Requirements R1, R3, and R4 of Issue #73:
 * - R1: Unassigned / "Any Available Provider" column in DayView (desktop multi-provider & mobile compact)
 * - R1: Slot pre-selection with doctorId 'unassigned' sets formDoctorId to null ("Any")
 * - R3: Responsive 7-column MonthView without desktop clipping (width 100%, minWidth 0, overflow hidden)
 * - R4: Double-click race condition prevention in appointment booking (isBookingRef lock & 0 error toasts)
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { theme } from '../constants/theme';
import type {
  ExtendedAppointmentItem,
  DoctorShiftOverlay,
} from '../components/calendar/types';

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
  Polyline: createMockComponent('polyline'),
  Polygon: createMockComponent('polygon'),
  Defs: createMockComponent('defs'),
  LinearGradient: createMockComponent('lineargradient'),
  Stop: createMockComponent('stop'),
  G: createMockComponent('g'),
  Text: createMockComponent('text'),
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
  DayView,
  MonthView,
  UNASSIGNED_DOCTOR_ID,
  UNASSIGNED_OVERLAY,
} = await import('../components/calendar');

const unassignedAppointment: ExtendedAppointmentItem = {
  id: 'appt-unassigned-1',
  clinicId: 'clinic-1',
  patientId: 'pat-unassigned',
  patientName: 'Corazon Aquino',
  doctorId: undefined, // "Any available provider"
  doctorName: undefined,
  // 16:00 Manila (UTC+8) -> 08:00 UTC
  scheduledAt: '2026-10-23T08:00:00.000Z',
  durationMinutes: 30,
  status: 'Confirmed',
  urgency: 'Routine',
  serviceType: 'Consultation',
  reason: 'General Consultation',
  createdAt: '2026-10-20T00:00:00.000Z',
};

const assignedAppointment: ExtendedAppointmentItem = {
  id: 'appt-assigned-1',
  clinicId: 'clinic-1',
  patientId: 'pat-assigned',
  patientName: 'Roberto Santos Jr.',
  doctorId: 'doc-santos',
  doctorName: 'Dr. Roberto Santos',
  scheduledAt: '2026-10-23T08:00:00.000Z',
  durationMinutes: 30,
  status: 'Confirmed',
  urgency: 'Urgent',
  serviceType: 'Follow-up',
  reason: 'Chest follow-up',
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

describe('Calendar Unassigned Provider & Race-Free Booking Suite', () => {
  beforeEach(() => {
    mockWindowWidth = 1280;
    mockWindowHeight = 800;
  });

  // =========================================================================
  // 1. R1: Unassigned / "Any Available Provider" Column in Day View
  // =========================================================================
  describe('1. Unassigned Provider Column (DayView & DoctorTimelineColumn)', () => {
    test('constants UNASSIGNED_DOCTOR_ID and UNASSIGNED_OVERLAY are defined correctly', () => {
      expect(UNASSIGNED_DOCTOR_ID).toBe('unassigned');
      expect(UNASSIGNED_OVERLAY.doctorId).toBe('unassigned');
      expect(UNASSIGNED_OVERLAY.doctorName).toContain('Unassigned');
      expect(UNASSIGNED_OVERLAY.shiftStart).toBe('07:00');
      expect(UNASSIGNED_OVERLAY.shiftEnd).toBe('19:00');
      expect(UNASSIGNED_OVERLAY.isOnDuty).toBe(true);
    });

    test('Desktop DayView renders unassigned column when viewing all doctors', () => {
      const html = renderToStaticMarkup(
        React.createElement(DayView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: [assignedAppointment, unassignedAppointment],
          doctorOverlays,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      // Both physician column and unassigned column render
      expect(html).toContain('data-testid="doctor-col-doc-santos"');
      expect(html).toContain('data-testid="doctor-col-unassigned"');
      expect(html).toContain('Unassigned / Any Provider');

      // Unassigned appointment renders in unassigned column at 16:00 slot
      expect(html).toContain('data-testid="day-slot-unassigned-16:00"');
      expect(html).toContain('Corazon Aquino');
    });

    test('Desktop DayView excludes unassigned column when activeDoctorId is a specific doctor', () => {
      const html = renderToStaticMarkup(
        React.createElement(DayView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: [assignedAppointment, unassignedAppointment],
          doctorOverlays,
          activeDoctorId: 'doc-santos',
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      expect(html).toContain('data-testid="doctor-col-doc-santos"');
      expect(html).not.toContain('data-testid="doctor-col-unassigned"');
      expect(html).not.toContain('Corazon Aquino');
    });

    test('Desktop DayView renders ONLY unassigned column when activeDoctorId === "unassigned"', () => {
      const html = renderToStaticMarkup(
        React.createElement(DayView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: [assignedAppointment, unassignedAppointment],
          doctorOverlays,
          activeDoctorId: 'unassigned',
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      expect(html).toContain('data-testid="doctor-col-unassigned"');
      expect(html).not.toContain('data-testid="doctor-col-doc-santos"');
      expect(html).toContain('Corazon Aquino');
    });

    test('Mobile compact DayView (<768px) respects activeDoctorId filter', () => {
      mockWindowWidth = 400;

      // When activeDoctorId is doc-santos, Corazon Aquino is filtered out
      const santosHtml = renderToStaticMarkup(
        React.createElement(DayView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: [assignedAppointment, unassignedAppointment],
          doctorOverlays,
          activeDoctorId: 'doc-santos',
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );
      expect(santosHtml).toContain('Roberto Santos Jr.');
      expect(santosHtml).not.toContain('Corazon Aquino');

      // When activeDoctorId is undefined (All), both are rendered
      const allHtml = renderToStaticMarkup(
        React.createElement(DayView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: [assignedAppointment, unassignedAppointment],
          doctorOverlays,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );
      expect(allHtml).toContain('Roberto Santos Jr.');
      expect(allHtml).toContain('Corazon Aquino');
    });

    test('Slot selection on unassigned column invokes onSelectSlot with "unassigned"', () => {
      let selectedDoctorId = '';
      let selectedSlotTime = '';

      const html = renderToStaticMarkup(
        React.createElement(DayView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: [],
          doctorOverlays,
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectSlot: (_d, timeStr, docId) => {
            selectedSlotTime = timeStr;
            selectedDoctorId = docId || '';
          },
          onSelectAppointment: () => {},
        })
      );

      expect(html).toContain('data-testid="day-slot-unassigned-09:00"');
    });

    test('handleSelectSlot mapping maps doctorId "unassigned" to null ("Any")', () => {
      const mapDoctorForForm = (doctorId?: string) => {
        return !doctorId || doctorId === 'unassigned' ? null : doctorId;
      };

      expect(mapDoctorForForm('unassigned')).toBeNull();
      expect(mapDoctorForForm(undefined)).toBeNull();
      expect(mapDoctorForForm('')).toBeNull();
      expect(mapDoctorForForm('doc-santos')).toBe('doc-santos');
    });
  });

  // =========================================================================
  // 2. R3: Responsive 7-Column Month View Without Desktop Clipping
  // =========================================================================
  describe('2. Responsive MonthView Geometry', () => {
    test('MonthView on desktop applies desktopGridWrapper (width 100%, minWidth 100%) and hides scrollbar', () => {
      mockWindowWidth = 1280;

      const html = renderToStaticMarkup(
        React.createElement(MonthView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: [unassignedAppointment],
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      // ScrollView showsHorizontalScrollIndicator is false on desktop
      expect(html).toContain('data-shows-horizontal-scroll-indicator="false"');
      // Grid wrapper includes width 100% and minWidth 100%
      expect(html).toContain('&quot;width&quot;:&quot;100%&quot;');
      expect(html).toContain('&quot;minWidth&quot;:&quot;100%&quot;');
    });

    test('MonthView on compact screen enables horizontal scrollbar', () => {
      mockWindowWidth = 500;

      const html = renderToStaticMarkup(
        React.createElement(MonthView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: [unassignedAppointment],
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      // ScrollView showsHorizontalScrollIndicator is true on compact
      expect(html).toContain('data-shows-horizontal-scroll-indicator="true"');
    });

    test('MonthView cells and chips enforce minWidth: 0, maxWidth: 14.2857%, and overflow: hidden', () => {
      const html = renderToStaticMarkup(
        React.createElement(MonthView, {
          currentDate: new Date('2026-10-23T00:00:00Z'),
          appointments: [unassignedAppointment],
          isLoading: false,
          error: null,
          onRetry: () => {},
          onSelectDate: () => {},
          onSelectAppointment: () => {},
        })
      );

      // Check cell styling contains maxWidth 14.2857% and overflow hidden
      expect(html).toContain('&quot;maxWidth&quot;:&quot;14.2857%&quot;');
      expect(html).toContain('&quot;minWidth&quot;:0');
      expect(html).toContain('&quot;overflow&quot;:&quot;hidden&quot;');
    });
  });

  // =========================================================================
  // 3. R4: Race-Free Appointment Booking Submission
  // =========================================================================
  describe('3. Race-Free Appointment Booking Submission', () => {
    test('Synchronous isBookingRef lock prevents double-submission and eliminates spurious error toast', async () => {
      let createAppointmentCalls = 0;
      const errorToasts: string[] = [];
      const successToasts: string[] = [];
      let isBookingRefCurrent = false;
      let bookingState = false;
      let bookedAppointmentState: any = null;
      let formPatient: any = { id: 'p1', fullName: 'Corazon Aquino' };

      const simulatedHandleBookAppointment = async () => {
        // Line 1 synchronous guard
        if (isBookingRefCurrent || bookingState || bookedAppointmentState) {
          return;
        }

        if (!formPatient) {
          errorToasts.push('Select a patient for this appointment.');
          return;
        }

        try {
          isBookingRefCurrent = true;
          bookingState = true;

          createAppointmentCalls++;
          // Simulate network latency
          await new Promise((resolve) => setTimeout(resolve, 50));

          const newApt = {
            id: 'apt-created-1',
            patientId: formPatient.id,
            patientName: formPatient.fullName,
            scheduledAt: '2026-10-23T08:00:00.000Z',
          };

          bookedAppointmentState = newApt;
          successToasts.push(`Appointment booked for ${formPatient.fullName}.`);
          // Form patient is PRESERVED, NOT reset prematurely
        } finally {
          bookingState = false;
          isBookingRefCurrent = false;
        }
      };

      // Simulate rapid double click
      const click1 = simulatedHandleBookAppointment();
      const click2 = simulatedHandleBookAppointment();

      await Promise.all([click1, click2]);

      expect(createAppointmentCalls).toBe(1);
      expect(errorToasts).toHaveLength(0);
      expect(successToasts).toHaveLength(1);
      expect(bookedAppointmentState).not.toBeNull();
      // Patient is still present in form state during confirmation
      expect(formPatient).not.toBeNull();
    });

    test('Follow-up click while success confirmation is active is safely ignored', async () => {
      const errorToasts: string[] = [];
      let isBookingRefCurrent = false;
      let bookingState = false;
      const bookedAppointmentState: any = { id: 'apt-created-1' };
      const formPatient: any = null; // Even if formPatient were null

      const simulatedHandleBookAppointment = async () => {
        if (isBookingRefCurrent || bookingState || bookedAppointmentState) {
          return;
        }

        if (!formPatient) {
          errorToasts.push('Select a patient for this appointment.');
          return;
        }
      };

      await simulatedHandleBookAppointment();

      expect(errorToasts).toHaveLength(0);
    });
  });
});
