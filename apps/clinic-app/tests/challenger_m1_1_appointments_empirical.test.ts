// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
      placeholder,
      children
    );
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
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
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
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
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

describe('Challenger M1-1 Empirical Verification Suite for clinicService', () => {
  let capturedGetUrl: string | null = null;
  let capturedPutUrl: string | null = null;
  let capturedPutPayload: any = null;
  let mockGetResponse: [any, any] = [[], null];
  let mockPutResponse: [any, any] = [{ id: 'appt-1' }, null];

  beforeEach(() => {
    capturedGetUrl = null;
    capturedPutUrl = null;
    capturedPutPayload = null;
    mockGetResponse = [[], null];
    mockPutResponse = [{ id: 'appt-1' }, null];

    clinicApiClient.get = mock(async (url: string) => {
      capturedGetUrl = url;
      return mockGetResponse as any;
    });

    clinicApiClient.put = mock(async (url: string, payload: any) => {
      capturedPutUrl = url;
      capturedPutPayload = payload;
      return mockPutResponse as any;
    });
  });

  // =========================================================================
  // 1. Parameter Combinations & Query String Serialization
  // =========================================================================

  describe('1. Parameter Combinations (startDate, endDate, doctorId, date, status)', () => {
    test('1.1 startDate without endDate', async () => {
      const opts: GetAppointmentsOptions = { startDate: '2026-10-15' };
      const [res, err] = await clinicService.getAppointments(opts);
      expect(err).toBeNull();
      expect(capturedGetUrl).toBe('/appointments?startDate=2026-10-15');
    });

    test('1.2 endDate without startDate', async () => {
      const opts: GetAppointmentsOptions = { endDate: '2026-10-25' };
      const [res, err] = await clinicService.getAppointments(opts);
      expect(err).toBeNull();
      expect(capturedGetUrl).toBe('/appointments?endDate=2026-10-25');
    });

    test('1.3 Both startDate and endDate', async () => {
      const opts: GetAppointmentsOptions = { startDate: '2026-10-01', endDate: '2026-10-31' };
      const [res, err] = await clinicService.getAppointments(opts);
      expect(err).toBeNull();
      expect(capturedGetUrl).toBe('/appointments?startDate=2026-10-01&endDate=2026-10-31');
    });

    test('1.4 doctorId alone (without dates)', async () => {
      const opts: GetAppointmentsOptions = { doctorId: 'doc-777-guid' };
      const [res, err] = await clinicService.getAppointments(opts);
      expect(err).toBeNull();
      expect(capturedGetUrl).toBe('/appointments?doctorId=doc-777-guid');
    });

    test('1.5 doctorId with date range', async () => {
      const opts: GetAppointmentsOptions = {
        startDate: '2026-10-01',
        endDate: '2026-10-07',
        doctorId: 'doc-777-guid',
      };
      const [res, err] = await clinicService.getAppointments(opts);
      expect(err).toBeNull();
      expect(capturedGetUrl).toBe('/appointments?startDate=2026-10-01&endDate=2026-10-07&doctorId=doc-777-guid');
    });

    test('1.6 doctorId with single date in options', async () => {
      const opts: GetAppointmentsOptions = {
        date: '2026-10-15',
        doctorId: 'doc-777-guid',
      };
      const [res, err] = await clinicService.getAppointments(opts);
      expect(err).toBeNull();
      expect(capturedGetUrl).toBe('/appointments?date=2026-10-15&doctorId=doc-777-guid');
    });

    test('1.7 All criteria combined: startDate, endDate, doctorId, status', async () => {
      const opts: GetAppointmentsOptions = {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        doctorId: 'doc-777-guid',
        status: 'Confirmed',
      };
      const [res, err] = await clinicService.getAppointments(opts);
      expect(err).toBeNull();
      expect(capturedGetUrl).toBe('/appointments?startDate=2026-10-01&endDate=2026-10-31&doctorId=doc-777-guid&status=Confirmed');
    });
  });

  // =========================================================================
  // 2. Falsy, Null, Undefined, and Empty Inputs
  // =========================================================================

  describe('2. Boundary & Falsy Inputs', () => {
    test('2.1 Empty options object {} produces /appointments with 0 query params', async () => {
      const [res, err] = await clinicService.getAppointments({});
      expect(err).toBeNull();
      expect(capturedGetUrl).toBe('/appointments');
    });

    test('2.2 null as any produces /appointments', async () => {
      const [res, err] = await clinicService.getAppointments(null as any);
      expect(err).toBeNull();
      expect(capturedGetUrl).toBe('/appointments');
    });

    test('2.3 undefined produces /appointments', async () => {
      const [res, err] = await clinicService.getAppointments(undefined);
      expect(err).toBeNull();
      expect(capturedGetUrl).toBe('/appointments');
    });

    test('2.4 No arguments () produces /appointments', async () => {
      const [res, err] = await clinicService.getAppointments();
      expect(err).toBeNull();
      expect(capturedGetUrl).toBe('/appointments');
    });

    test('2.5 Empty string date "" produces /appointments (does not append date=)', async () => {
      const [res, err] = await clinicService.getAppointments('');
      expect(err).toBeNull();
      expect(capturedGetUrl).toBe('/appointments');
    });

    test('2.6 Empty string date "" with secondary status produces /appointments?status=Cancelled', async () => {
      const [res, err] = await clinicService.getAppointments('', 'Cancelled');
      expect(err).toBeNull();
      expect(capturedGetUrl).toBe('/appointments?status=Cancelled');
    });

    test('2.7 null as any with secondary status produces /appointments?status=Pending', async () => {
      const [res, err] = await clinicService.getAppointments(null as any, 'Pending');
      expect(err).toBeNull();
      expect(capturedGetUrl).toBe('/appointments?status=Pending');
    });

    test('2.8 Options with empty string properties does not append empty params', async () => {
      const opts: GetAppointmentsOptions = {
        date: '',
        startDate: '',
        endDate: '',
        doctorId: '',
      };
      const [res, err] = await clinicService.getAppointments(opts);
      expect(err).toBeNull();
      expect(capturedGetUrl).toBe('/appointments');
    });

    test('2.9 Options with empty strings and valid status only appends status', async () => {
      const opts: GetAppointmentsOptions = {
        date: '',
        startDate: '',
        endDate: '',
        status: 'InConsultation',
      };
      const [res, err] = await clinicService.getAppointments(opts);
      expect(err).toBeNull();
      expect(capturedGetUrl).toBe('/appointments?status=InConsultation');
    });
  });

  // =========================================================================
  // 3. Backward Compatibility with Existing Callers
  // =========================================================================

  describe('3. Backward Compatibility', () => {
    test('3.1 Legacy single string date argument', async () => {
      const [res, err] = await clinicService.getAppointments('2026-10-18');
      expect(err).toBeNull();
      expect(capturedGetUrl).toBe('/appointments?date=2026-10-18');
    });

    test('3.2 Legacy single string date + status arguments', async () => {
      const [res, err] = await clinicService.getAppointments('2026-10-18', 'Completed');
      expect(err).toBeNull();
      expect(capturedGetUrl).toBe('/appointments?date=2026-10-18&status=Completed');
    });

    test('3.3 Secondary status fallback when options object lacks status', async () => {
      const opts: GetAppointmentsOptions = { startDate: '2026-10-01' };
      const [res, err] = await clinicService.getAppointments(opts, 'Confirmed');
      expect(err).toBeNull();
      expect(capturedGetUrl).toBe('/appointments?startDate=2026-10-01&status=Confirmed');
    });

    test('3.4 Object status takes precedence over secondary status argument', async () => {
      const opts: GetAppointmentsOptions = { status: 'CheckedIn' };
      const [res, err] = await clinicService.getAppointments(opts, 'Cancelled');
      expect(err).toBeNull();
      expect(capturedGetUrl).toBe('/appointments?status=CheckedIn');
    });
  });

  // =========================================================================
  // 4. Reschedule Appointment & Conflict Handling
  // =========================================================================

  describe('4. Reschedule Appointment', () => {
    test('4.1 rescheduleAppointment sends PUT /appointments/:id/reschedule with request payload', async () => {
      const apptId = '7f8a9b0c-1234-5678-9abc-def012345678';
      const payload: RescheduleAppointmentRequest = {
        newScheduledAt: '2026-10-22T14:30:00Z',
        durationMinutes: 45,
        reason: 'Patient doctor schedule adjustment',
      };

      mockPutResponse = [{ id: apptId, scheduledAt: payload.newScheduledAt }, null];

      const [res, err] = await clinicService.rescheduleAppointment(apptId, payload);

      expect(err).toBeNull();
      expect(capturedPutUrl).toBe(`/appointments/${apptId}/reschedule`);
      expect(capturedPutPayload).toEqual(payload);
      expect(res?.id).toBe(apptId);
    });

    test('4.2 rescheduleAppointment propagates 409 conflict error when slot is collision', async () => {
      const apptId = '7f8a9b0c-1234-5678-9abc-def012345678';
      const payload: RescheduleAppointmentRequest = {
        newScheduledAt: '2026-10-22T10:00:00Z',
      };

      const conflictError = {
        status: 409,
        errorCode: 'CONCURRENCY_CONFLICT',
        message: 'The selected slot overlaps with an existing appointment.',
      };

      mockPutResponse = [null, conflictError];

      const [res, err] = await clinicService.rescheduleAppointment(apptId, payload);

      expect(res).toBeNull();
      expect(err).not.toBeNull();
      expect(err?.status).toBe(409);
      expect(err?.errorCode).toBe('CONCURRENCY_CONFLICT');
    });

    test('4.3 getAppointments propagates network and API errors cleanly', async () => {
      const networkError = {
        status: 500,
        message: 'Internal server error',
      };
      mockGetResponse = [null, networkError];

      const [res, err] = await clinicService.getAppointments({ startDate: '2026-10-01' });

      expect(res).toBeNull();
      expect(err).not.toBeNull();
      expect(err?.status).toBe(500);
      expect(err?.message).toBe('Internal server error');
    });
  });
});
