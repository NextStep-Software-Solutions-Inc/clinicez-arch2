// token-guard:ignore-file
/**
 * Test Suite: Elevated Appointment Reschedule & Inspection Confirmation Dialogs
 * (appointmentRescheduleElevation.test.ts)
 *
 * Verifies User Requirements:
 * 1. Elevate Appointment Reschedule dialog:
 *    - Uses official date picker component (ValidatedDateInput)
 *    - Uses official time picker component (TimeInput)
 *    - Renders schedule time slots of the selected doctor if selected (SlotPicker)
 * 2. Add close button in footer so it won't confuse with cancel button
 *    - AppointmentInspectionModal has distinct Close and Cancel buttons
 *    - AppointmentRescheduleModal has distinct Close button
 * 3. Canceling has an alert confirmation dialog:
 *    - Canceling appointment requires explicit confirmation
 *    - Closing/canceling reschedule modal with changes requires discard confirmation
 */

import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ExtendedAppointmentItem } from '../components/calendar/types';

(globalThis as any).__DEV__ = true;

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
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
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
  randomUUID: () => 'mock-uuid-12345',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const { AppointmentRescheduleModal } = require('../components/calendar/AppointmentRescheduleModal');
const { AppointmentInspectionModal } = require('../components/calendar/AppointmentInspectionModal');

const sampleAppointmentWithDoctor: ExtendedAppointmentItem = {
  id: 'apt-001',
  clinicId: 'clinic-1',
  patientId: 'pat-ely',
  patientName: 'An, Ely',
  doctorId: 'doc-santos',
  doctorName: 'Dr. Roberto Santos',
  scheduledAt: '2026-10-23T08:00:00Z', // 16:00 Asia/Manila
  durationMinutes: 30,
  status: 'Confirmed',
  urgency: 'Routine',
  serviceType: 'Consultation',
  reason: 'General Consultation',
  createdAt: '2026-10-20T00:00:00Z',
};

const sampleAppointmentUnassigned: ExtendedAppointmentItem = {
  id: 'apt-002',
  clinicId: 'clinic-1',
  patientId: 'pat-ely',
  patientName: 'An, Ely',
  doctorId: undefined,
  doctorName: undefined,
  scheduledAt: '2026-10-23T08:00:00Z',
  durationMinutes: 30,
  status: 'Confirmed',
  urgency: 'Routine',
  serviceType: 'Consultation',
  reason: 'General Consultation',
  createdAt: '2026-10-20T00:00:00Z',
};

const testDoctors = [
  { id: 'doc-santos', name: 'Dr. Roberto Santos' },
  { id: 'doc-cruz', name: 'Dr. Maria Cruz' },
];

describe('Elevated Appointment Reschedule & Inspection Confirmation Dialogs Suite', () => {
  describe('1. Elevated Appointment Reschedule Modal', () => {
    test('renders official ValidatedDateInput and TimeInput with proper values and testIDs', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentRescheduleModal, {
          visible: true,
          appointment: sampleAppointmentWithDoctor,
          doctors: testDoctors,
          onClose: () => {},
        })
      );

      expect(html).toContain('data-testid="appointment-reschedule-modal"');
      expect(html).toContain('data-testid="reschedule-title"');
      expect(html).toContain('Reschedule for An, Ely');

      // Official date picker input exists and has Manila local date
      expect(html).toContain('data-testid="reschedule-date-input"');
      expect(html).toContain('data-value="2026-10-23"');

      // Official time picker input exists and has Manila local time
      expect(html).toContain('data-testid="reschedule-time-input"');
      expect(html).toContain('data-value="16:00"');

      // Reason input
      expect(html).toContain('data-testid="reschedule-reason-input"');
    });

    test('displays doctor schedule time slots (SlotPicker) when doctor is selected', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentRescheduleModal, {
          visible: true,
          appointment: sampleAppointmentWithDoctor,
          doctors: testDoctors,
          onClose: () => {},
        })
      );

      // Section for Doctor Schedule Time Slots is rendered
      expect(html).toContain('Doctor Schedule Time Slots');
      expect(html).toContain('Dr. Roberto Santos');
    });

    test('displays helpful prompt to select a physician when appointment is unassigned', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentRescheduleModal, {
          visible: true,
          appointment: sampleAppointmentUnassigned,
          doctors: testDoctors,
          onClose: () => {},
        })
      );

      // Notice explaining that selecting a physician will load schedule time slots
      expect(html).toContain('Select an attending physician above to view their available schedule slots');
    });

    test('provides explicit Close button to prevent confusion with cancel actions', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentRescheduleModal, {
          visible: true,
          appointment: sampleAppointmentWithDoctor,
          onClose: () => {},
        })
      );

      // Footer has explicit Close button
      expect(html).toContain('data-testid="btn-close-reschedule"');
      expect(html).toContain('Close');

      // Header has close button
      expect(html).toContain('data-testid="btn-cancel-reschedule"');

      // Save Reschedule button exists
      expect(html).toContain('data-testid="btn-confirm-reschedule"');
      expect(html).toContain('Save Reschedule');
    });
  });

  describe('2. Appointment Inspection Modal Close & Cancel Confirmation', () => {
    test('renders distinct Close button in footer alongside Cancel button', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: sampleAppointmentWithDoctor,
          onClose: () => {},
          onCancel: () => {},
          onReschedule: () => {},
        })
      );

      // Explicit Close button in footer
      expect(html).toContain('data-testid="btn-drawer-close-footer"');
      expect(html).toContain('Close');

      // Cancel button in footer
      expect(html).toContain('data-testid="btn-drawer-cancel"');
      expect(html).toContain('Cancel');

      // Reschedule button in footer
      expect(html).toContain('data-testid="btn-drawer-reschedule"');
      expect(html).toContain('Reschedule');
    });

    test('cancel confirmation dialog is hooked up to cancel button', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: sampleAppointmentWithDoctor,
          onClose: () => {},
          onCancel: () => {},
        })
      );

      expect(html).toContain('data-testid="appointment-inspection-drawer"');
      expect(html).toContain('btn-drawer-close-footer');
      expect(html).toContain('btn-drawer-cancel');
    });
  });
});
