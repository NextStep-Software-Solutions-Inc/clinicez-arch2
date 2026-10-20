// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, ...props }: any) => React.createElement('div', { 'data-component': name, ...props }, children);
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
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
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
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
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid',
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  default: 'Svg',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const { clinicService } = await import('../services/clinicService');
const { clinicApiClient } = await import('../services/apiClient');
import type { GetAppointmentsOptions, RescheduleAppointmentRequest, AppointmentStatus } from '../services/clinicService';

describe('Challenger M1-2 Empirical Stress Suite', () => {
  let capturedUrl: string | null = null;

  beforeEach(() => {
    capturedUrl = null;
    clinicApiClient.get = mock(async (url: string) => {
      capturedUrl = url;
      return [[], null] as any;
    });
    clinicApiClient.put = mock(async (url: string, payload: any) => {
      capturedUrl = url;
      return [{ id: 'appt-1', ...payload }, null] as any;
    });
  });

  describe('1. TypeScript Overloads & Call-Site Typing Compatibility', () => {
    test('1.1 Zero arguments call: clinicService.getAppointments()', async () => {
      const [res, err] = await clinicService.getAppointments();
      expect(err).toBeNull();
      expect(capturedUrl).toBe('/appointments');
    });

    test('1.2 String date only: clinicService.getAppointments("2026-10-20")', async () => {
      const [res, err] = await clinicService.getAppointments('2026-10-20');
      expect(err).toBeNull();
      expect(capturedUrl).toBe('/appointments?date=2026-10-20');
    });

    test('1.3 String date + status: clinicService.getAppointments("2026-10-20", "Confirmed")', async () => {
      const [res, err] = await clinicService.getAppointments('2026-10-20', 'Confirmed');
      expect(err).toBeNull();
      expect(capturedUrl).toBe('/appointments?date=2026-10-20&status=Confirmed');
    });

    test('1.4 Options object with single date: clinicService.getAppointments({ date: "2026-10-20" })', async () => {
      const opts: GetAppointmentsOptions = { date: '2026-10-20' };
      const [res, err] = await clinicService.getAppointments(opts);
      expect(err).toBeNull();
      expect(capturedUrl).toBe('/appointments?date=2026-10-20');
    });

    test('1.5 Options object with date range: startDate & endDate', async () => {
      const opts: GetAppointmentsOptions = {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      };
      const [res, err] = await clinicService.getAppointments(opts);
      expect(err).toBeNull();
      expect(capturedUrl).toBe('/appointments?startDate=2026-10-01&endDate=2026-10-31');
    });

    test('1.6 Options object with date range and doctorId', async () => {
      const opts: GetAppointmentsOptions = {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        doctorId: 'doc-guid-1234',
      };
      const [res, err] = await clinicService.getAppointments(opts);
      expect(err).toBeNull();
      expect(capturedUrl).toBe('/appointments?startDate=2026-10-01&endDate=2026-10-31&doctorId=doc-guid-1234');
    });

    test('1.7 Options object with date range, doctorId, and status', async () => {
      const opts: GetAppointmentsOptions = {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        doctorId: 'doc-guid-1234',
        status: 'CheckedIn',
      };
      const [res, err] = await clinicService.getAppointments(opts);
      expect(err).toBeNull();
      expect(capturedUrl).toBe('/appointments?startDate=2026-10-01&endDate=2026-10-31&doctorId=doc-guid-1234&status=CheckedIn');
    });

    test('1.8 Options object status precedence over 2nd positional argument', async () => {
      const opts: GetAppointmentsOptions = {
        status: 'Confirmed',
      };
      const [res, err] = await clinicService.getAppointments(opts, 'Pending');
      expect(err).toBeNull();
      expect(capturedUrl).toBe('/appointments?status=Confirmed');
    });

    test('1.9 Undefined 1st argument with 2nd positional status', async () => {
      const [res, err] = await clinicService.getAppointments(undefined, 'Completed');
      expect(err).toBeNull();
      expect(capturedUrl).toBe('/appointments?status=Completed');
    });

    test('1.10 RescheduleAppointmentRequest typing and call', async () => {
      const payload: RescheduleAppointmentRequest = {
        newScheduledAt: '2026-10-25T14:00:00Z',
        durationMinutes: 45,
        reason: 'Patient conflict',
      };
      const [res, err] = await clinicService.rescheduleAppointment('appt-100', payload);
      expect(err).toBeNull();
      expect(capturedUrl).toBe('/appointments/appt-100/reschedule');
    });
  });

  describe('2. Timezone and Calendar Boundary Math (Asia/Manila UTC+8 vs UTC)', () => {
    test('2.1 Month boundary: Oct 1 to Oct 31 in UTC+8 maps deterministically', () => {
      const manilaOffsetHours = 8;
      const localStart = new Date(Date.UTC(2026, 9, 1, 0 - manilaOffsetHours, 0, 0));
      expect(localStart.toISOString()).toBe('2026-09-30T16:00:00.000Z');

      const localEnd = new Date(Date.UTC(2026, 9, 31, 23 - manilaOffsetHours, 59, 59));
      expect(localEnd.toISOString()).toBe('2026-10-31T15:59:59.000Z');
    });

    test('2.2 Leap year boundary: 2024-02-28 to 2024-03-01 contains 2024-02-29', () => {
      const leapDay = new Date(Date.UTC(2024, 1, 29, 0, 0, 0));
      expect(leapDay.getUTCFullYear()).toBe(2024);
      expect(leapDay.getUTCMonth()).toBe(1); // 0-indexed Feb
      expect(leapDay.getUTCDate()).toBe(29);

      const nonLeapRoll = new Date(Date.UTC(2026, 1, 29, 0, 0, 0));
      expect(nonLeapRoll.getUTCMonth()).toBe(2); // March
      expect(nonLeapRoll.getUTCDate()).toBe(1);
    });

    test('2.3 Year boundary transition: 2026-12-31 to 2027-01-01', () => {
      const yearEnd = new Date(Date.UTC(2026, 11, 31, 23, 59, 59));
      const yearStart = new Date(Date.UTC(2027, 0, 1, 0, 0, 0));

      expect(yearEnd.getUTCFullYear()).toBe(2026);
      expect(yearStart.getUTCFullYear()).toBe(2027);
      expect(yearStart.getTime() - yearEnd.getTime()).toBe(1000); // exactly 1 second
    });
  });
});
