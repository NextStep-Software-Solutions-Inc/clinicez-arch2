import { describe, expect, mock, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApiError } from '@shared/safe';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    placeholder,
    testID,
    visible,
    value,
    disabled,
  }: any) => {
    if (name === 'Modal' && visible === false) {
      return null;
    }
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(value !== undefined ? { 'data-value': String(value) } : {}),
        ...(disabled !== undefined ? { 'data-disabled': String(Boolean(disabled)) } : {}),
      },
      placeholder,
      children,
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
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  NativeEventEmitter: class {
    addListener() {
      return { remove: () => {} };
    }
    removeAllListeners() {}
  },
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) {
        this.val = val;
      }
      interpolate() {
        return this;
      }
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

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-216',
}));

mock.module('../components/layout', () => ({
  ResponsiveLayout: ({ headerTitle, rightAction, children }: any) =>
    React.createElement('div', { 'data-layout': headerTitle }, rightAction, children),
}));

mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, setParams: () => {} }),
  useRoute: () => ({ key: 'Appointments', name: 'Appointments', params: undefined }),
  DefaultTheme: { colors: {} },
  createStaticNavigation: () => () => null,
}));

mock.module('../context/StaffContext', () => ({
  useStaff: () => ({
    staff: [
      {
        id: 'doc-1',
        firstName: 'Maria',
        lastName: 'Santos',
        role: 'Doctor',
        isActive: true,
      },
    ],
    current: null,
    currentName: 'Admin',
    loading: false,
    error: null,
    reload: async () => {},
  }),
  formatStaffName: (s?: any) => (s ? `Dr. ${s.firstName} ${s.lastName}` : ''),
}));

mock.module('../context/ClinicContext', () => ({
  useClinic: () => ({
    facilityName: 'St. Jude Clinic',
    settings: { isWorkspaceTeleconsultEntitled: false, enableTeleconsultation: false },
    rooms: [],
    refreshRooms: async () => {},
  }),
}));

const { clinicService } = await import('../services/clinicService');
const {
  PAST_APPOINTMENT_GRACE_MINUTES,
  extractAppointmentScheduleError,
  getManilaTimeParts,
  getManilaTodayStr,
  isPastManilaDateTime,
  manilaDateTimeToUtcIso,
  toDateString,
  validateFutureManilaDateTime,
} = await import('../components/calendar/calendarUtils');
const { MonthView } = await import('../components/calendar/MonthView');
const { AppointmentRescheduleModal } = await import(
  '../components/calendar/AppointmentRescheduleModal'
);
const { defaultSlot } = await import('../navigation/screens/Appointments.screen');
const {
  default: ScheduleVisitModal,
  createStandardSlot,
  getRelativeIsoDate,
  getTodayIsoDate,
  markPastScheduleSlots,
  normalizeDoctorAvailableSlots,
  normalizeSlotTimeToHhMm,
} = await import('../components/patient/ScheduleVisitModal');

function createLocalHookHarness<Result, Props = any>(
  hookFn: (props: Props) => Result,
  initialProps?: Props,
) {
  const stateSlots: any[] = [];
  const effectSlots: Array<{ fn: () => any; cleanup?: any; deps: any[]; hasChanged: boolean }> = [];
  const refSlots: Array<{ current: any }> = [];
  const memoSlots: Array<{ value: any; deps: any[] }> = [];
  let slotIndex = 0;
  let effectIndex = 0;
  let refIndex = 0;
  let memoIndex = 0;
  let currentProps = initialProps as Props;
  let result!: Result;
  let isRendering = false;
  let hasPendingRender = false;

  const mockHooks: any = {
    useState: (initial: any) => {
      const idx = slotIndex++;
      if (stateSlots.length <= idx) {
        stateSlots.push(typeof initial === 'function' ? initial() : initial);
      }
      const setState = (newVal: any) => {
        const nextVal = typeof newVal === 'function' ? newVal(stateSlots[idx]) : newVal;
        if (stateSlots[idx] !== nextVal) {
          stateSlots[idx] = nextVal;
          scheduleRender();
        }
      };
      return [stateSlots[idx], setState];
    },
    useRef: (initial: any) => {
      const idx = refIndex++;
      if (refSlots.length <= idx) refSlots.push({ current: initial });
      return refSlots[idx];
    },
    useCallback: (fn: any, deps: any[]) => mockHooks.useMemo(() => fn, deps),
    useMemo: (fn: any, deps: any[]) => {
      const idx = memoIndex++;
      const prev = memoSlots[idx];
      const changed = !prev || !deps || deps.some((d, i) => d !== prev.deps[i]);
      if (changed) {
        const value = fn();
        memoSlots[idx] = { value, deps };
        return value;
      }
      return prev.value;
    },
    useEffect: (fn: any, deps: any[]) => {
      const idx = effectIndex++;
      const prev = effectSlots[idx];
      const hasChanged = !prev || !deps || deps.some((d, i) => d !== prev?.deps[i]);
      effectSlots[idx] = { fn, deps, hasChanged, cleanup: prev?.cleanup };
    },
    useContext: (context: React.Context<any>) => (context as any)._currentValue,
    useSyncExternalStore: (_sub: any, getSnap: () => any) => getSnap(),
  };

  function scheduleRender() {
    if (isRendering) {
      hasPendingRender = true;
      return;
    }
    render();
  }

  function render() {
    if (isRendering) return;
    isRendering = true;
    try {
      do {
        hasPendingRender = false;
        slotIndex = 0;
        effectIndex = 0;
        refIndex = 0;
        memoIndex = 0;
        const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
        const prevDispatcher = internals ? internals.H : null;
        if (internals) internals.H = mockHooks;
        try {
          result = hookFn(currentProps);
        } finally {
          if (internals) internals.H = prevDispatcher;
        }
        for (const eff of effectSlots) {
          if (eff.hasChanged) {
            eff.hasChanged = false;
            if (typeof eff.cleanup === 'function') eff.cleanup();
            eff.cleanup = eff.fn();
          }
        }
      } while (hasPendingRender);
    } finally {
      isRendering = false;
    }
  }

  render();

  return {
    get result() {
      return { current: result };
    },
    unmount: () => {
      for (const eff of effectSlots) {
        if (typeof eff.cleanup === 'function') eff.cleanup();
      }
    },
  };
}

function findNode(node: any, predicate: (el: any) => boolean): any {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (predicate(node)) return node;
  if (node?.props?.visible === false) return null;
  const props = node.props;
  if (!props || typeof props !== 'object') return null;
  for (const key of ['children', 'footer', 'rightAction', 'header', 'leftAction']) {
    if (props[key]) {
      const found = findNode(props[key], predicate);
      if (found) return found;
    }
  }
  return null;
}

describe('Issue 216 — Reject Past Same-Day Appointment Times (Asia/Manila + 5m grace)', () => {
  test('1. calendarUtils Manila time, format hardening, and 5-minute grace boundary checks', () => {
    expect(PAST_APPOINTMENT_GRACE_MINUTES).toBe(5);

    // 2026-11-19T16:30:00Z === 2026-11-20 00:30 Asia/Manila
    const midnightRolloverNow = new Date('2026-11-19T16:30:00Z');
    expect(getManilaTodayStr(midnightRolloverNow)).toBe('2026-11-20');
    expect(getManilaTimeParts(midnightRolloverNow)).toEqual({
      dateStr: '2026-11-20',
      timeStr: '00:30',
      hour: 0,
      minute: 30,
    });

    // Reject malformed inputs instead of silent coercion/rollover
    expect(manilaDateTimeToUtcIso('2026-11-19', ':00')).toBe('');
    expect(manilaDateTimeToUtcIso('2026-11-19', '9:00')).toBe('');
    expect(manilaDateTimeToUtcIso('2026-11-19', '09:00:60')).toBe('');
    expect(manilaDateTimeToUtcIso('2026-11-19', '09:00:5')).toBe('');
    expect(manilaDateTimeToUtcIso('2026-02-30', '09:00')).toBe('');
    expect(manilaDateTimeToUtcIso('2026-11-19', '25:00')).toBe('');
    expect(manilaDateTimeToUtcIso('2026-11-19', '12:60')).toBe('');
    expect(manilaDateTimeToUtcIso('', '09:00')).toBe('');
    expect(manilaDateTimeToUtcIso('2026-11-20', '09:30')).toBe('2026-11-20T01:30:00.000Z');
    expect(manilaDateTimeToUtcIso('2026-11-19', '15:00:00')).toBe('2026-11-19T07:00:00.000Z');

    // 14:15:00 Manila = 06:15:00 UTC
    const now1415 = new Date('2026-11-19T06:15:00Z');
    expect(isPastManilaDateTime('2026-11-19', '9:00', now1415)).toBe(false);
    expect(
      validateFutureManilaDateTime('2026-11-19', '9:00', { now: now1415, mode: 'create' }).isValid,
    ).toBe(false);

    // Future same-day (14:20) -> allowed
    expect(isPastManilaDateTime('2026-11-19', '14:20', now1415)).toBe(false);
    expect(
      validateFutureManilaDateTime('2026-11-19', '14:20', { now: now1415, mode: 'create' }),
    ).toEqual({
      isValid: true,
      isPast: false,
      utcIso: '2026-11-19T06:20:00.000Z',
    });

    // Within 5m grace (14:14 -> -1m) -> allowed
    expect(isPastManilaDateTime('2026-11-19', '14:14', now1415)).toBe(false);
    // Exact 5m boundary (14:10 -> -5m00s) -> allowed (strict `<` matches backend)
    expect(isPastManilaDateTime('2026-11-19', '14:10', now1415)).toBe(false);
    expect(
      validateFutureManilaDateTime('2026-11-19', '14:10', { now: now1415, mode: 'create' }).isValid,
    ).toBe(true);

    // 1 second past grace (14:15:01 Manila vs 14:10) -> rejected
    const now141501 = new Date('2026-11-19T06:15:01Z');
    expect(isPastManilaDateTime('2026-11-19', '14:10', now141501)).toBe(true);

    // Clearly past same-day (14:09 -> -6m) -> rejected with exact backend parity messages
    const createPast = validateFutureManilaDateTime('2026-11-19', '14:09', {
      now: now1415,
      mode: 'create',
    });
    expect(createPast.isValid).toBe(false);
    expect(createPast.isPast).toBe(true);
    expect(createPast.errorMessage).toBe(
      'Cannot schedule an appointment for a time that has already passed.',
    );

    const reschedulePast = validateFutureManilaDateTime('2026-11-19', '14:09', {
      now: now1415,
      mode: 'reschedule',
    });
    expect(reschedulePast.isValid).toBe(false);
    expect(reschedulePast.isPast).toBe(true);
    expect(reschedulePast.errorMessage).toBe(
      'Cannot reschedule an appointment to a time that has already passed.',
    );

    // Future date (tomorrow) -> allowed
    expect(
      validateFutureManilaDateTime('2026-11-20', '00:00', { now: now1415, mode: 'create' }).isValid,
    ).toBe(true);
    // Past date (yesterday) -> rejected
    expect(
      validateFutureManilaDateTime('2026-11-18', '23:59', { now: now1415, mode: 'reschedule' }).isPast,
    ).toBe(true);
    // Incomplete/malformed input -> isPast: false, isValid: false
    expect(isPastManilaDateTime('2026-11-19', ':00', now1415)).toBe(false);
    expect(
      validateFutureManilaDateTime('2026-11-19', ':00', { now: now1415 }).isValid,
    ).toBe(false);
  });

  test('2. extractAppointmentScheduleError parses 400 VALIDATION_ERROR from ApiError and plain objects', () => {
    const apiErr = new ApiError(
      'Validation failed',
      400,
      [
        {
          field: 'NewScheduledAt',
          code: 'VALIDATION_ERROR',
          message: 'Cannot reschedule an appointment to a time that has already passed.',
        },
      ],
      'VALIDATION_ERROR',
    );
    expect(extractAppointmentScheduleError(apiErr, ['NewScheduledAt', 'ScheduledAt'])).toBe(
      'Cannot reschedule an appointment to a time that has already passed.',
    );

    const plainErr = {
      status: 400,
      errorCode: 'VALIDATION_ERROR',
      message: 'One or more validation errors occurred.',
      errors: [
        {
          field: '$.scheduledAt',
          message: 'Cannot schedule an appointment for a time that has already passed.',
        },
      ],
    };
    expect(extractAppointmentScheduleError(plainErr, ['ScheduledAt'])).toBe(
      'Cannot schedule an appointment for a time that has already passed.',
    );
  });

  test('3. Appointments.screen defaultSlot(now) computes both date and hour in Asia/Manila', () => {
    // 02:00 UTC = 10:00 Manila -> +2h = 12:00 Manila same day
    expect(defaultSlot(new Date('2026-11-19T02:00:00Z'))).toEqual({
      date: '2026-11-19',
      time: '12:00',
    });

    // 15:00 UTC = 23:00 Manila -> +2h = 01:00 Manila next day
    expect(defaultSlot(new Date('2026-11-19T15:00:00Z'))).toEqual({
      date: '2026-11-20',
      time: '01:00',
    });
  });

  test('4. AppointmentRescheduleModal shows inline error and disables submit for past same-day times', () => {
    // 2 hours before current instant, on today's Manila date when possible (or safely handle midnight edge)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const todayManila = getManilaTodayStr();
    const pastParts = getManilaTimeParts(twoHoursAgo);

    if (pastParts.dateStr === todayManila) {
      const pastSameDayAppt = {
        id: 'apt-past-same-day',
        patientId: 'pat-1',
        patientName: 'Juan Dela Cruz',
        doctorId: 'doc-1',
        doctorName: 'Dr. Maria Santos',
        scheduledAt: twoHoursAgo.toISOString(),
        durationMinutes: 30,
        status: 'Confirmed' as const,
      };

      const pastMarkup = renderToStaticMarkup(
        React.createElement(AppointmentRescheduleModal, {
          visible: true,
          appointment: pastSameDayAppt as any,
          onClose: () => {},
        }),
      );

      expect(pastMarkup).toContain(
        'Cannot reschedule an appointment to a time that has already passed.',
      );
      expect(pastMarkup).toContain('data-testid="btn-confirm-reschedule"');
      expect(pastMarkup).toMatch(/data-testid="btn-confirm-reschedule"[^>]*data-disabled="true"/);
    }

    // Future appointment tomorrow -> valid, no past error, confirm button enabled
    const tomorrow = new Date(Date.now() + 26 * 60 * 60 * 1000);
    const futureAppt = {
      id: 'apt-future',
      patientId: 'pat-1',
      patientName: 'Maria Clara',
      doctorId: 'doc-1',
      doctorName: 'Dr. Maria Santos',
      scheduledAt: tomorrow.toISOString(),
      durationMinutes: 30,
      status: 'Confirmed' as const,
    };

    const futureMarkup = renderToStaticMarkup(
      React.createElement(AppointmentRescheduleModal, {
        visible: true,
        appointment: futureAppt as any,
        onClose: () => {},
      }),
    );

    expect(futureMarkup).not.toContain(
      'Cannot reschedule an appointment to a time that has already passed.',
    );
    expect(futureMarkup).toMatch(/data-testid="btn-confirm-reschedule"[^>]*data-disabled="false"/);
  });

  test('5. ScheduleVisitModal uses Manila dates and disables past same-day slots', () => {
    expect(getTodayIsoDate()).toBe(getManilaTodayStr());
    const tomorrow = getRelativeIsoDate(1);
    expect(tomorrow).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(tomorrow >= getTodayIsoDate()).toBe(true);

    // 14:00 Manila = 06:00 UTC
    const now1400 = new Date('2026-11-19T06:00:00Z');
    const pastSlot = createStandardSlot('09:00', '2026-11-19', now1400);
    expect(pastSlot.isAvailable).toBe(false);
    expect(pastSlot.available).toBe(false);
    expect(pastSlot.status).toBe('Past');
    expect(pastSlot.reason).toBe('Past');
    expect(pastSlot.slotStartUtc).toBe('2026-11-19T01:00:00.000Z');

    const futureSlot = createStandardSlot('15:00', '2026-11-19', now1400);
    expect(futureSlot.isAvailable).toBe(true);
    expect(futureSlot.available).toBe(true);
    expect(futureSlot.status).toBe('Available');
    expect(futureSlot.slotStartUtc).toBe('2026-11-19T07:00:00.000Z');

    const marked = markPastScheduleSlots(
      [
        {
          startTime: '10:00',
          endTime: '10:30',
          slotStartUtc: '2026-11-19T02:00:00Z',
          slotEndUtc: '2026-11-19T02:30:00Z',
          isAvailable: true,
          status: 'Available',
        },
        {
          startTime: '16:00',
          endTime: '16:30',
          slotStartUtc: '2026-11-19T08:00:00Z',
          slotEndUtc: '2026-11-19T08:30:00Z',
          isAvailable: true,
          status: 'Available',
        },
      ],
      '2026-11-19',
      now1400,
    );
    expect(marked[0].isAvailable).toBe(false);
    expect(marked[0].status).toBe('Past');
    expect(marked[1].isAvailable).toBe(true);
    expect(marked[1].status).toBe('Available');

    // Source verification for Appointments.screen and ScheduleVisitModal
    const appRoot = resolve(__dirname, '..');
    const apptsSrc = readFileSync(
      resolve(appRoot, 'navigation/screens/Appointments.screen.tsx'),
      'utf8',
    );
    const scheduleSrc = readFileSync(
      resolve(appRoot, 'components/patient/ScheduleVisitModal.tsx'),
      'utf8',
    );
    expect(apptsSrc).toContain('validateFutureManilaDateTime');
    expect(apptsSrc).toContain('book-appointment-error-alert');
    expect(apptsSrc).toContain('error={bookingTimeError}');
    expect(scheduleSrc).toContain('validateFutureManilaDateTime');
    expect(scheduleSrc).toContain('scheduleCheck.utcIso');
    expect(scheduleSrc).toContain('schedule-visit-error-alert');
  });

  test('6. ScheduleVisitModal normalizes backend TimeOnly HH:MM:SS slots so future slots pass validation and createAppointment', async () => {
    expect(normalizeSlotTimeToHhMm('15:00:00')).toBe('15:00');
    expect(normalizeSlotTimeToHhMm('9:00:00')).toBe('09:00');
    expect(normalizeSlotTimeToHhMm('08:30')).toBe('08:30');

    const now1400 = new Date('2026-11-19T06:00:00Z');
    const normalizedSlots = normalizeDoctorAvailableSlots(
      [
        {
          startTime: '09:00:00',
          endTime: '09:30:00',
          isAvailable: true,
          status: 'Available',
        },
        {
          startTime: '15:00:00',
          endTime: '15:30:00',
          isAvailable: true,
          status: 'Available',
        },
      ],
      '2026-11-19',
      now1400,
    );
    expect(normalizedSlots[0].startTime).toBe('09:00');
    expect(normalizedSlots[0].isAvailable).toBe(false);
    expect(normalizedSlots[0].status).toBe('Past');
    expect(normalizedSlots[1].startTime).toBe('15:00');
    expect(normalizedSlots[1].time).toBe('15:00');
    expect(normalizedSlots[1].endTime).toBe('15:30');
    expect(
      validateFutureManilaDateTime('2026-11-19', normalizedSlots[1].startTime, {
        now: now1400,
        mode: 'create',
      }).isValid,
    ).toBe(true);

    const origGetSlots = clinicService.getDoctorAvailableSlots;
    const origCreateAppt = clinicService.createAppointment;

    try {
      const createdPayloads: any[] = [];
      clinicService.getDoctorAvailableSlots = (async () => [
        {
          isOnDuty: true,
          slots: [
            {
              startTime: '15:00:00',
              endTime: '15:30:00',
              isAvailable: true,
              status: 'Available',
            },
          ],
        },
        null,
      ]) as any;
      clinicService.createAppointment = (async (payload: any) => {
        createdPayloads.push(payload);
        return [{ id: 'apt-new-1', confirmationCode: 'APT-001', status: 'Confirmed' }, null];
      }) as any;

      const harness = createLocalHookHarness((props: any) => ScheduleVisitModal(props), {
        visible: true,
        patient: { id: 'pat-1', fullName: 'Juan Dela Cruz' } as any,
        onClose: () => {},
        initialDoctorId: 'doc-1',
      });

      // Switch to Tomorrow so slot 15:00:00 is unconditionally in the future regardless of wall clock
      const tomorrowBtn = findNode(
        harness.result.current,
        (el) => el?.props?.accessibilityLabel === 'Tomorrow' && typeof el?.props?.onPress === 'function',
      );
      expect(tomorrowBtn).not.toBeNull();
      tomorrowBtn.props.onPress();

      await Promise.resolve();
      await Promise.resolve();

      const slotBtn = findNode(
        harness.result.current,
        (el) =>
          el?.props?.accessibilityLabel === 'Time slot 15:00' &&
          typeof el?.props?.onPress === 'function',
      );
      expect(slotBtn).not.toBeNull();
      slotBtn.props.onPress();

      const confirmBtn = findNode(
        harness.result.current,
        (el) => el?.props?.title === 'Confirm and schedule' && typeof el?.props?.onPress === 'function',
      );
      expect(confirmBtn).not.toBeNull();
      await confirmBtn.props.onPress();

      expect(createdPayloads).toHaveLength(1);
      expect(createdPayloads[0].scheduledAt).toBe(
        manilaDateTimeToUtcIso(getRelativeIsoDate(1), '15:00'),
      );
      harness.unmount();
    } finally {
      clinicService.getDoctorAvailableSlots = origGetSlots;
      clinicService.createAppointment = origCreateAppt;
    }
  });

  function withProcessTimezone<T>(timeZone: string, fn: () => T): T {
    const initialTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const prevTz = process.env.TZ;
    process.env.TZ = timeZone;
    const restore = () => {
      // Assign the prior timezone before deleting TZ so runtimes whose tzset() ignores delete reset Date offsets.
      process.env.TZ = prevTz ?? initialTz;
      if (prevTz === undefined) delete process.env.TZ;
    };
    try {
      const result = fn();
      if (result && typeof (result as any).finally === 'function') {
        return (result as any).finally(restore);
      }
      restore();
      return result;
    } catch (err) {
      restore();
      throw err;
    }
  }

  test('7. MonthView + toDateString resolves 2026-11-01 (not 2026-10-31) when clicking Day 1 under TZ=America/New_York', () =>
    withProcessTimezone('America/New_York', () => {
      const selectedDates: string[] = [];
      const harness = createLocalHookHarness((props: any) => MonthView(props), {
        currentDate: new Date(2026, 10, 1, 12, 0, 0),
        appointments: [],
        isLoading: false,
        error: null,
        onRetry: () => {},
        onSelectDate: (d: Date) => {
          // Mirrors Appointments.screen.tsx handleSelectDate: setCurrentDate(toDateString(d))
          selectedDates.push(toDateString(d));
        },
        onSelectAppointment: () => {},
      });

      const nov1Cell = findNode(
        harness.result.current,
        (el) => el?.props?.testID === 'month-cell-2026-11-01' && typeof el?.props?.onPress === 'function',
      );
      expect(nov1Cell).not.toBeNull();
      nov1Cell.props.onPress();

      const nov15Cell = findNode(
        harness.result.current,
        (el) => el?.props?.testID === 'month-cell-2026-11-15' && typeof el?.props?.onPress === 'function',
      );
      expect(nov15Cell).not.toBeNull();
      nov15Cell.props.onPress();

      expect(selectedDates).toEqual(['2026-11-01', '2026-11-15']);
      harness.unmount();
    }));

  test('8. Runtime AppointmentRescheduleModal, ScheduleVisitModal & defaultSlot at 23:30 PHT enforce Issue 216 under TZ=America/New_York', async () =>
    withProcessTimezone('America/New_York', async () => {
      const origReschedule = clinicService.rescheduleAppointment;
      const origGetSlots = clinicService.getDoctorAvailableSlots;
      const origCreateAppt = clinicService.createAppointment;

      try {
      // A) Appointments.screen.defaultSlot at 23:30 PHT (2026-11-20T15:30:00Z -> 2026-11-21 01:00 PHT)
      expect(defaultSlot(new Date('2026-11-20T15:30:00Z'))).toEqual({
        date: '2026-11-21',
        time: '01:00',
      });

      // B) AppointmentRescheduleModal runtime interaction under TZ=America/New_York
      const manilaNow = getManilaTimeParts();
      const todayManila = manilaNow.dateStr;
      const tomorrowManila = getRelativeIsoDate(1);
      const canUseTodayMidnight = manilaNow.hour > 0 || manilaNow.minute >= 6;
      const pastDateForTest = canUseTodayMidnight ? todayManila : getRelativeIsoDate(-1);
      const pastTimeForTest = '00:00';

      let rescheduleCallCount = 0;
      let shouldReturn400 = true;
      clinicService.rescheduleAppointment = (async (_id: string, payload: any) => {
        rescheduleCallCount += 1;
        if (shouldReturn400) {
          return [
            null,
            new ApiError(
              'Validation failed',
              400,
              [
                {
                  field: 'NewScheduledAt',
                  code: 'VALIDATION_ERROR',
                  message: 'Cannot reschedule an appointment to a time that has already passed.',
                },
              ],
              'VALIDATION_ERROR',
            ),
          ];
        }
        return [{ id: 'apt-ny-1', scheduledAt: payload.newScheduledAt, status: 'Confirmed' }, null];
      }) as any;

      let successCount = 0;
      let closeCount = 0;

      const rescheduleHarness = createLocalHookHarness(
        (props: any) => AppointmentRescheduleModal(props),
        {
          visible: true,
          appointment: {
            id: 'apt-ny-1',
            patientId: 'pat-1',
            patientName: 'Juan Dela Cruz',
            doctorId: 'doc-1',
            doctorName: 'Dr. Maria Santos',
            scheduledAt: manilaDateTimeToUtcIso(tomorrowManila, '10:00'),
            durationMinutes: 30,
            status: 'Confirmed',
          } as any,
          onClose: () => {
            closeCount += 1;
          },
          onSuccess: () => {
            successCount += 1;
          },
        },
      );

      // Set past time today -> inline error blocks submit
      const dateInput = findNode(
        rescheduleHarness.result.current,
        (el) => el?.props?.inputTestID === 'reschedule-date-input',
      );
      const timeInput = findNode(
        rescheduleHarness.result.current,
        (el) => el?.props?.inputTestID === 'reschedule-time-input',
      );
      expect(dateInput).not.toBeNull();
      expect(timeInput).not.toBeNull();

      dateInput.props.onChangeText(pastDateForTest);
      timeInput.props.onChangeText(pastTimeForTest);

      if (canUseTodayMidnight) {
        const timeInputAfterPast = findNode(
          rescheduleHarness.result.current,
          (el) => el?.props?.inputTestID === 'reschedule-time-input',
        );
        expect(timeInputAfterPast.props.error).toBe(
          'Cannot reschedule an appointment to a time that has already passed.',
        );
      }
      const confirmDisabledBtn = findNode(
        rescheduleHarness.result.current,
        (el) => el?.props?.testID === 'btn-confirm-reschedule',
      );
      expect(confirmDisabledBtn.props.disabled).toBe(true);
      await confirmDisabledBtn.props.onPress();
      expect(rescheduleCallCount).toBe(0);

      // Switch date to tomorrow -> error clears & submit enabled
      findNode(
        rescheduleHarness.result.current,
        (el) => el?.props?.inputTestID === 'reschedule-date-input',
      ).props.onChangeText(tomorrowManila);
      findNode(
        rescheduleHarness.result.current,
        (el) => el?.props?.inputTestID === 'reschedule-time-input',
      ).props.onChangeText('14:30');

      const timeInputCleared = findNode(
        rescheduleHarness.result.current,
        (el) => el?.props?.inputTestID === 'reschedule-time-input',
      );
      expect(timeInputCleared.props.error).toBeUndefined();
      const confirmEnabledBtn = findNode(
        rescheduleHarness.result.current,
        (el) => el?.props?.testID === 'btn-confirm-reschedule',
      );
      expect(confirmEnabledBtn.props.disabled).toBe(false);

      // Submit -> backend 400 VALIDATION_ERROR surfaces in conflict-alert & time error
      await confirmEnabledBtn.props.onPress();
      expect(rescheduleCallCount).toBe(1);
      const conflictBanner = findNode(
        rescheduleHarness.result.current,
        (el) => el?.props?.testID === 'conflict-alert',
      );
      expect(conflictBanner).not.toBeNull();
      expect(renderToStaticMarkup(conflictBanner)).toContain(
        'Cannot reschedule an appointment to a time that has already passed.',
      );

      // Retry with valid 200 -> succeeds and closes
      shouldReturn400 = false;
      await findNode(
        rescheduleHarness.result.current,
        (el) => el?.props?.testID === 'btn-confirm-reschedule',
      ).props.onPress();
      expect(rescheduleCallCount).toBe(2);
      expect(successCount).toBe(1);
      expect(closeCount).toBe(1);
      rescheduleHarness.unmount();

      // C) ScheduleVisitModal under TZ=America/New_York: Past slot badge + 400 VALIDATION_ERROR
      clinicService.getDoctorAvailableSlots = (async (_docId: string, date: string) => [
        {
          isOnDuty: true,
          slots:
            date === todayManila
              ? [
                  {
                    startTime: '00:00:00',
                    endTime: '00:30:00',
                    isAvailable: true,
                    status: 'Available',
                  },
                ]
              : [
                  {
                    startTime: '15:00:00',
                    endTime: '15:30:00',
                    isAvailable: true,
                    status: 'Available',
                  },
                ],
        },
        null,
      ]) as any;

      clinicService.createAppointment = (async () => [
        null,
        new ApiError(
          'Validation failed',
          400,
          [
            {
              field: 'ScheduledAt',
              code: 'VALIDATION_ERROR',
              message: 'Cannot schedule an appointment for a time that has already passed.',
            },
          ],
          'VALIDATION_ERROR',
        ),
      ]) as any;

      const scheduleHarness = createLocalHookHarness((props: any) => ScheduleVisitModal(props), {
        visible: true,
        patient: { id: 'pat-1', fullName: 'Juan Dela Cruz' } as any,
        onClose: () => {},
        initialDoctorId: 'doc-1',
      });
      await Promise.resolve();
      await Promise.resolve();

      if (canUseTodayMidnight) {
        const todaySlotBtn = findNode(
          scheduleHarness.result.current,
          (el) => el?.props?.accessibilityLabel === 'Time slot 00:00 - Unavailable',
        );
        expect(todaySlotBtn).not.toBeNull();
        expect(todaySlotBtn.props.disabled).toBe(true);
        expect(renderToStaticMarkup(todaySlotBtn)).toContain('Past');
      }

      // Switch to Tomorrow -> select 15:00 -> submit -> 400 VALIDATION_ERROR surfaces in schedule-visit-error-alert
      findNode(
        scheduleHarness.result.current,
        (el) => el?.props?.accessibilityLabel === 'Tomorrow' && typeof el?.props?.onPress === 'function',
      ).props.onPress();
      await Promise.resolve();
      await Promise.resolve();

      findNode(
        scheduleHarness.result.current,
        (el) =>
          el?.props?.accessibilityLabel === 'Time slot 15:00' &&
          typeof el?.props?.onPress === 'function',
      ).props.onPress();

      await findNode(
        scheduleHarness.result.current,
        (el) => el?.props?.title === 'Confirm and schedule' && typeof el?.props?.onPress === 'function',
      ).props.onPress();

      const scheduleAlert = findNode(
        scheduleHarness.result.current,
        (el) => el?.props?.testID === 'schedule-visit-error-alert',
      );
      expect(scheduleAlert).not.toBeNull();
      expect(renderToStaticMarkup(scheduleAlert)).toContain(
        'Cannot schedule an appointment for a time that has already passed.',
      );
      scheduleHarness.unmount();
      } finally {
        clinicService.rescheduleAppointment = origReschedule;
        clinicService.getDoctorAvailableSlots = origGetSlots;
        clinicService.createAppointment = origCreateAppt;
      }
    }));
});
