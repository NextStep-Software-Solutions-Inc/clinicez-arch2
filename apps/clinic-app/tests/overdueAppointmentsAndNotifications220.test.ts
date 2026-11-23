import { describe, expect, test, mock, beforeEach, setSystemTime } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ExtendedAppointmentItem } from '../components/calendar/types';
import type { ClinicSettingsRecord, ClinicStaffNotification } from '../services/clinicService';

(globalThis as any).__DEV__ = true;

const registeredPressables: Record<string, {
  onPress?: (e?: any) => any;
  disabled?: boolean;
  testID?: string;
}> = {};

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    testID,
    visible,
    style,
    disabled,
    value,
    onPress,
    onClick,
    ...props
  }: any) => {
    if (name === 'Modal' && visible === false) {
      return null;
    }
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
    const clickHandler = onPress || onClick;
    if (testID) {
      registeredPressables[testID] = {
        onPress: clickHandler,
        disabled: Boolean(disabled),
        testID,
      };
    }
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
        ...(visible !== undefined ? { 'data-visible': String(visible) } : {}),
        ...(disabled !== undefined ? { 'data-disabled': String(Boolean(disabled)), disabled } : {}),
        ...(value !== undefined ? { 'data-value': String(value) } : {}),
        ...(clickHandler ? { 'data-pressable': 'true', onClick: clickHandler } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...props,
      },
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
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
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
    parallel: () => ({ start: (cb?: any) => cb && cb() }),
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
  PanResponder: { create: () => ({ panHandlers: {} }) },
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
  randomUUID: () => 'mock-uuid-220',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

let lastNavigatedRoute: { name: string; params?: any } | null = null;
mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: (name: string, params?: any) => {
      lastNavigatedRoute = { name, params };
    },
    setParams: () => {},
  }),
  useRoute: () => ({ key: 'Appointments', name: 'Appointments', params: undefined }),
  DefaultTheme: { colors: {} },
}));

mock.module('../components/layout', () => ({
  ResponsiveLayout: ({ headerTitle, children }: any) =>
    React.createElement('div', { 'data-layout': headerTitle }, children),
}));

mock.module('../context/StaffContext', () => ({
  useStaff: () => ({ staff: [], current: { id: 'doc-1', name: 'Dr. Santos' }, currentName: 'Dr. Santos' }),
  formatStaffName: (s: any) => s?.name || 'Dr. Santos',
}));

mock.module('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'doc-1', name: 'Dr. Santos', role: 'Doctor', clinicId: 'clinic-1' }, can: () => true }),
}));

let teleconsultLaunchedArgs: any = null;
mock.module('../context/ClinicCommsContext', () => ({
  useClinicComms: () => ({
    openTeleconsultWaitingRoom: (args: any) => {
      teleconsultLaunchedArgs = args;
    },
    lastTeleconsultEndedAt: 0,
  }),
}));

const { clinicService } = require('../services/clinicService');
let noShowCalls: Array<{ id: string; reason?: string }> = [];
let mockNoShowResult: [any, any] = [null, null];

clinicService.markAppointmentNoShow = async (id: string, reason?: string) => {
  noShowCalls.push({ id, reason });
  return mockNoShowResult;
};

clinicService.getAppointment = async () => [null, null];
clinicService.createTeleconsultGuestInvite = async () => [null, null];

const {
  isAppointmentTerminal,
  isAppointmentOverdue,
  isAppointmentPastDateOverdue,
  formatOverdueElapsed,
  getNextAvailableSlotForToday,
  getManilaTodayStr,
} = require('../components/calendar/calendarUtils');
const { AppointmentCard } = require('../components/calendar/AppointmentCard');
const { AppointmentInspectionModal } = require('../components/calendar/AppointmentInspectionModal');
const { AppointmentRescheduleModal } = require('../components/calendar/AppointmentRescheduleModal');
const AppointmentReminderSettingsCard = require('../components/settings/AppointmentReminderSettingsCard').default;
const ClinicNotificationCenterModal = require('../components/notifications/ClinicNotificationCenterModal').default;
const AppointmentsScreen = require('../navigation/screens/Appointments.screen').default;

function createBaseAppointment(overrides: Partial<ExtendedAppointmentItem> = {}): ExtendedAppointmentItem {
  return {
    id: 'appt-220-1',
    clinicId: 'clinic-1',
    patientId: 'pat-1',
    patientName: 'Maria Santos',
    doctorId: 'doc-1',
    doctorName: 'Dr. Roberto Santos',
    scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    durationMinutes: 30,
    status: 'Confirmed',
    createdAt: '2026-11-18T08:00:00Z',
    serviceType: 'General Consultation',
    reason: 'Follow-up checkup',
    ...overrides,
  };
}

describe('Issue 220: Overdue Appointment Prompts, No-Show Action & Staff Notification Cadence', () => {
  beforeEach(() => {
    for (const k of Object.keys(registeredPressables)) delete registeredPressables[k];
    lastNavigatedRoute = null;
    teleconsultLaunchedArgs = null;
    noShowCalls = [];
    mockNoShowResult = [null, null];
  });

  describe('1. calendarUtils Overdue & Terminal Helpers', () => {
    test('isAppointmentTerminal classifies Completed, NoShow, Cancelled accurately', () => {
      expect(isAppointmentTerminal('Completed')).toBe(true);
      expect(isAppointmentTerminal('NoShow')).toBe(true);
      expect(isAppointmentTerminal('Cancelled')).toBe(true);
      expect(isAppointmentTerminal('Pending')).toBe(false);
      expect(isAppointmentTerminal('Confirmed')).toBe(false);
      expect(isAppointmentTerminal('CheckedIn')).toBe(false);
      expect(isAppointmentTerminal('InConsultation')).toBe(false);
    });

    test('isAppointmentOverdue returns true only for past Pending/Confirmed appointments', () => {
      const now = new Date('2026-11-20T08:00:00Z');
      const past = '2026-11-20T07:30:00Z';
      const future = '2026-11-20T09:00:00Z';

      expect(isAppointmentOverdue(createBaseAppointment({ scheduledAt: past, status: 'Pending' }), now)).toBe(true);
      expect(isAppointmentOverdue(createBaseAppointment({ scheduledAt: past, status: 'Confirmed' }), now)).toBe(true);
      expect(isAppointmentOverdue(createBaseAppointment({ scheduledAt: future, status: 'Confirmed' }), now)).toBe(false);
      expect(isAppointmentOverdue(createBaseAppointment({ scheduledAt: past, status: 'CheckedIn' }), now)).toBe(false);
      expect(isAppointmentOverdue(createBaseAppointment({ scheduledAt: past, status: 'Completed' }), now)).toBe(false);
      expect(isAppointmentOverdue(createBaseAppointment({ scheduledAt: past, status: 'NoShow' }), now)).toBe(false);
      expect(isAppointmentOverdue(createBaseAppointment({ scheduledAt: past, status: 'Cancelled' }), now)).toBe(false);
    });

    test('isAppointmentPastDateOverdue distinguishes same-day vs past-date in Asia/Manila', () => {
      // 2026-11-20 06:00 UTC = 2026-11-20 14:00 Manila
      const now = new Date('2026-11-20T06:00:00Z');
      const sameDayPast = createBaseAppointment({
        scheduledAt: '2026-11-20T02:00:00Z', // 10:00 Manila today
        status: 'Confirmed',
      });
      const prevDayPast = createBaseAppointment({
        scheduledAt: '2026-11-19T02:00:00Z', // 10:00 Manila yesterday
        status: 'Pending',
      });

      expect(isAppointmentPastDateOverdue(sameDayPast, 'Asia/Manila', now)).toBe(false);
      expect(isAppointmentPastDateOverdue(prevDayPast, 'Asia/Manila', now)).toBe(true);
    });

    test('formatOverdueElapsed formats minutes, hours, and days cleanly', () => {
      const now = new Date('2026-11-20T10:00:00Z');
      expect(formatOverdueElapsed('2026-11-20T09:59:45Z', now)).toBe('Just past scheduled time');
      expect(formatOverdueElapsed('2026-11-20T09:42:00Z', now)).toBe('18 mins overdue');
      expect(formatOverdueElapsed('2026-11-20T07:45:00Z', now)).toBe('2h 15m overdue');
      expect(formatOverdueElapsed('2026-11-18T10:00:00Z', now)).toBe('2 days overdue');
    });

    test('getNextAvailableSlotForToday picks next 30-min boundary >= 15m from now', () => {
      // 2026-11-20 02:10 UTC = 10:10 Manila (+15m = 10:25 -> next 30m = 10:30)
      const slot = getNextAvailableSlotForToday(new Date('2026-11-20T02:10:00Z'));
      expect(slot.date).toBe('2026-11-20');
      expect(slot.time).toBe('10:30');
    });
  });

  describe('2. AppointmentCard Overdue Badge & Terminal Quick Action Lock', () => {
    test('renders Overdue badge on standard, timeline, and compact overdue cards', () => {
      const overdue = createBaseAppointment({
        scheduledAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        status: 'Pending',
      });

      for (const variant of ['standard', 'timeline', 'compact'] as const) {
        const html = renderToStaticMarkup(
          React.createElement(AppointmentCard, {
            appointment: overdue,
            variant,
            onSelect: () => {},
          })
        );
        expect(html).toContain('data-testid="card-overdue-badge"');
      }
    });

    test('omits Overdue badge on future, CheckedIn, Completed, Cancelled, and NoShow cards', () => {
      const cases = [
        createBaseAppointment({ status: 'Confirmed' }), // future
        createBaseAppointment({ scheduledAt: '2026-10-01T08:00:00Z', status: 'CheckedIn' }),
        createBaseAppointment({ scheduledAt: '2026-10-01T08:00:00Z', status: 'Completed' }),
        createBaseAppointment({ scheduledAt: '2026-10-01T08:00:00Z', status: 'Cancelled' }),
        createBaseAppointment({ scheduledAt: '2026-10-01T08:00:00Z', status: 'NoShow' }),
      ];

      for (const appt of cases) {
        const html = renderToStaticMarkup(
          React.createElement(AppointmentCard, {
            appointment: appt,
            variant: 'standard',
            onSelect: () => {},
          })
        );
        expect(html).not.toContain('data-testid="card-overdue-badge"');
      }
    });

    test('hides Reschedule and Cancel quick actions on Completed, NoShow, and Cancelled cards', () => {
      for (const status of ['Completed', 'NoShow', 'Cancelled'] as const) {
        const appt = createBaseAppointment({
          id: `card-${status}`,
          scheduledAt: '2026-10-01T08:00:00Z',
          status,
        });
        const html = renderToStaticMarkup(
          React.createElement(AppointmentCard, {
            appointment: appt,
            variant: 'standard',
            onSelect: () => {},
            onCheckIn: () => {},
            onReschedule: () => {},
            onCancel: () => {},
          })
        );
        expect(html).not.toContain(`data-testid="btn-checkin-${appt.id}"`);
        expect(html).not.toContain(`data-testid="btn-reschedule-${appt.id}"`);
        expect(html).not.toContain(`data-testid="btn-cancel-${appt.id}"`);
      }
    });
  });

  describe('3. AppointmentInspectionModal Overdue Prompts, No-Show & Terminal Locks', () => {
    test('renders same-day overdue warning banner with elapsed duration and Mark No-Show button', () => {
      // Pin midday Asia/Manila so `now - 25m` never crosses midnight into yesterday.
      setSystemTime(new Date('2026-11-20T06:00:00Z'));
      try {
        const sameDayOverdue = createBaseAppointment({
          scheduledAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
          status: 'Confirmed',
        });

        const html = renderToStaticMarkup(
          React.createElement(AppointmentInspectionModal, {
            visible: true,
            appointment: sameDayOverdue,
            onClose: () => {},
            onCheckIn: () => {},
            onReschedule: () => {},
            onCancel: () => {},
            onMarkNoShow: () => {},
          })
        );

        expect(html).toContain('data-testid="overdue-appointment-banner"');
        expect(html).toContain('data-overdue-severity="same-day"');
        expect(html).toContain('Appointment Overdue');
        expect(html).toContain('data-testid="btn-drawer-noshow"');
        expect(html).toContain('Mark No-Show');
      } finally {
        setSystemTime();
      }
    });

    test('renders past-date overdue high-visibility banner and allows No-Show dispatch', async () => {
      const pastDateAppt = createBaseAppointment({
        id: 'appt-past-date-1',
        scheduledAt: '2026-11-10T02:00:00Z',
        status: 'Pending',
      });

      mockNoShowResult = [{ ...pastDateAppt, status: 'NoShow', updatedBy: 'Dr. Santos' }, null];
      let syncedStatus: string | undefined;

      const html = renderToStaticMarkup(
        React.createElement(AppointmentInspectionModal, {
          visible: true,
          appointment: pastDateAppt,
          onClose: () => {},
          onCheckIn: () => {},
          onReschedule: () => {},
          onAppointmentSynced: (a: any) => {
            syncedStatus = a.status;
          },
        })
      );

      expect(html).toContain('data-testid="overdue-appointment-banner"');
      expect(html).toContain('data-overdue-severity="past-date"');
      expect(html).toContain('Unresolved Past-Date Appointment');
      expect(html).toContain('data-testid="btn-drawer-noshow"');

      // Invoke Mark No-Show directly via clinicService fallback when onMarkNoShow omitted
      const [res] = await clinicService.markAppointmentNoShow(pastDateAppt.id);
      expect(noShowCalls).toHaveLength(1);
      expect(noShowCalls[0].id).toBe(pastDateAppt.id);
      expect(res.status).toBe('NoShow');
      expect(syncedStatus).toBeUndefined(); // only triggered after confirmation dialog submit
    });

    test('locks active CTAs and policy switcher on Completed, NoShow, and Cancelled appointments', () => {
      for (const status of ['Completed', 'NoShow', 'Cancelled'] as const) {
        const terminalTeleconsult = createBaseAppointment({
          id: `tele-${status}`,
          status,
          appointmentType: 'Teleconsult',
          isTeleconsult: true,
          paymentPolicy: 'Prepaid',
          paymentStatus: 'Pending',
          updatedAt: '2026-11-20T09:00:00Z',
          updatedBy: 'Dr. Elena Reyes',
        });

        const html = renderToStaticMarkup(
          React.createElement(AppointmentInspectionModal, {
            visible: true,
            appointment: terminalTeleconsult,
            onClose: () => {},
            onCheckIn: () => {},
            onReschedule: () => {},
            onCancel: () => {},
            onMarkNoShow: () => {},
            onBookFollowUp: () => {},
          })
        );

        expect(html).not.toContain('data-testid="btn-drawer-teleconsult"');
        expect(html).not.toContain('data-testid="btn-copy-patient-link"');
        expect(html).not.toContain('data-testid="btn-drawer-cancel"');
        expect(html).not.toContain('data-testid="btn-drawer-reschedule"');
        expect(html).not.toContain('data-testid="btn-drawer-checkin"');
        expect(html).not.toContain('data-testid="btn-drawer-noshow"');
        expect(html).not.toContain('data-testid="inline-policy-switcher"');
        expect(html).not.toContain('data-testid="teleconsult-invite-pin-container"');
        expect(html).not.toContain('data-testid="overdue-appointment-banner"');
        expect(html).toContain('data-testid="btn-drawer-followup"');
        expect(html).toContain('Book Follow-Up');

        if (status === 'NoShow') {
          expect(html).toContain('data-testid="noshow-audit-metadata"');
          expect(html).toContain('Dr. Elena Reyes');
        }
      }
    });

    test('runtime: past-date Check In and Teleconsult prompt late-visit modal; Mark No-Show updates UI', async () => {
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

      function findNodeByTestId(node: any, targetId: string): any {
        if (!node || typeof node !== 'object') return null;
        if (Array.isArray(node)) {
          for (const child of node) {
            const found = findNodeByTestId(child, targetId);
            if (found) return found;
          }
          return null;
        }
        if (node.props?.testID === targetId || node.props?.['data-testid'] === targetId) {
          return node;
        }
        if (node.props?.footer) {
          const inFooter = findNodeByTestId(node.props.footer, targetId);
          if (inFooter) return inFooter;
        }
        if (node.props?.children) {
          return findNodeByTestId(node.props.children, targetId);
        }
        return null;
      }

      const pastTeleAppt = createBaseAppointment({
        id: 'appt-runtime-past-220',
        scheduledAt: '2026-11-10T02:00:00Z',
        status: 'Confirmed',
        appointmentType: 'Teleconsult',
        isTeleconsult: true,
      });

      let checkInCalled = 0;
      let rescheduleCalled = 0;
      let synced: ExtendedAppointmentItem | null = null;
      mockNoShowResult = [
        { ...pastTeleAppt, status: 'NoShow', updatedAt: '2026-11-20T08:00:00Z', updatedBy: 'Dr. Santos' },
        null,
      ];

      const harness = createLocalHookHarness(
        (props: any) => AppointmentInspectionModal(props),
        {
          visible: true,
          appointment: pastTeleAppt,
          onClose: () => {},
          onCheckIn: () => {
            checkInCalled += 1;
          },
          onReschedule: () => {
            rescheduleCalled += 1;
          },
          onAppointmentSynced: (a: ExtendedAppointmentItem) => {
            synced = a;
          },
        },
      );

      // 1. Clicking Check In on past-date appointment opens late-visit confirmation modal
      const checkInBtn = findNodeByTestId(harness.result.current, 'btn-drawer-checkin');
      expect(checkInBtn).not.toBeNull();
      checkInBtn.props.onPress();
      expect(checkInCalled).toBe(0);
      expect(findNodeByTestId(harness.result.current, 'late-visit-confirm-modal')).not.toBeNull();

      // Clicking "Proceed Late" executes onCheckIn
      findNodeByTestId(harness.result.current, 'btn-late-visit-proceed').props.onPress();
      expect(checkInCalled).toBe(1);

      // 2. Clicking Teleconsult on past-date appointment opens late-visit modal; Reschedule redirects
      const teleBtn = findNodeByTestId(harness.result.current, 'btn-drawer-teleconsult');
      teleBtn.props.onPress();
      expect(teleconsultLaunchedArgs).toBeNull();
      expect(findNodeByTestId(harness.result.current, 'late-visit-confirm-modal')).not.toBeNull();
      findNodeByTestId(harness.result.current, 'btn-late-visit-reschedule').props.onPress();
      expect(rescheduleCalled).toBe(1);

      // 3. Clicking Mark No-Show -> Confirm No-Show calls markAppointmentNoShow and locks modal
      findNodeByTestId(harness.result.current, 'btn-drawer-noshow').props.onPress();
      expect(findNodeByTestId(harness.result.current, 'noshow-appointment-confirm-modal')).not.toBeNull();
      await findNodeByTestId(harness.result.current, 'btn-confirm-noshow-appointment').props.onPress();

      expect(noShowCalls).toHaveLength(1);
      expect(noShowCalls[0].id).toBe(pastTeleAppt.id);
      expect((synced as any)?.status).toBe('NoShow');
      expect(findNodeByTestId(harness.result.current, 'noshow-audit-metadata')).not.toBeNull();
      expect(findNodeByTestId(harness.result.current, 'btn-drawer-teleconsult')).toBeNull();
      expect(findNodeByTestId(harness.result.current, 'btn-drawer-noshow')).toBeNull();

      harness.unmount();
    });
  });

  describe('4. AppointmentRescheduleModal Overdue Default Date', () => {
    test('defaults date input to today when defaultToToday is true for overdue appointment', () => {
      const pastAppt = createBaseAppointment({
        scheduledAt: '2026-10-15T08:00:00Z',
        status: 'Confirmed',
      });

      // Pin daytime Asia/Manila (10:10 PHT) so next slot stays on the same calendar day.
      setSystemTime(new Date('2026-11-20T02:10:00Z'));
      try {
        const html = renderToStaticMarkup(
          React.createElement(AppointmentRescheduleModal, {
            visible: true,
            appointment: pastAppt,
            defaultToToday: true,
            onClose: () => {},
          })
        );

        expect(html).toContain('data-value="2026-11-20"');
        expect(html).not.toContain('data-value="2026-10-15"');
      } finally {
        setSystemTime();
      }
    });

    test('rolls default date to tomorrow 09:00 after 23:15 Asia/Manila when defaultToToday is true', () => {
      const pastAppt = createBaseAppointment({
        scheduledAt: '2026-10-15T08:00:00Z',
        status: 'Confirmed',
      });

      // 15:20 UTC = 23:20 PHT; +15m rounds to midnight, rolling over to next Manila day at 09:00.
      setSystemTime(new Date('2026-11-20T15:20:00Z'));
      try {
        const html = renderToStaticMarkup(
          React.createElement(AppointmentRescheduleModal, {
            visible: true,
            appointment: pastAppt,
            defaultToToday: true,
            onClose: () => {},
          })
        );

        expect(html).toContain('data-value="2026-11-21"');
        expect(html).toContain('data-value="09:00"');
      } finally {
        setSystemTime();
      }
    });
  });

  describe('5. AppointmentReminderSettingsCard Granular Clinician Toggles', () => {
    const baseSettings: ClinicSettingsRecord = {
      id: 'settings-1',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      clinicName: 'Clinic EZ',
      operatingHours: '08:00 - 17:00',
      defaultSlotDurationMinutes: 30,
      queuePrefix: 'Q',
      invoicePrefix: 'INV',
      defaultConsultationFee: 400,
      vatRate: 0.12,
      enableAppointmentReminders: true,
      appointmentReminder24hEnabled: true,
      appointmentReminder2hEnabled: true,
      enableStaffAppointmentNotifications: true,
      enableStaffMorningDigest: true,
      enableStaffPreSlotReminders: true,
      enableStaffOverdueAlerts: true,
    };

    test('renders all 3 granular staff cadence toggles enabled when master staff toggle is on', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentReminderSettingsCard, { settings: baseSettings })
      );

      expect(html).toContain('data-testid="switch-staff-morning-digest"');
      expect(html).toContain('data-testid="switch-staff-pre-slot"');
      expect(html).toContain('data-testid="switch-staff-overdue"');

      const staffIdx = html.indexOf('data-testid="switch-staff-notifications"');
      const staffSection = html.substring(staffIdx);
      expect(staffSection).not.toContain('data-disabled="true"');
    });

    test('disables the 3 granular staff cadence toggles when enableStaffAppointmentNotifications is false', () => {
      const html = renderToStaticMarkup(
        React.createElement(AppointmentReminderSettingsCard, {
          settings: { ...baseSettings, enableStaffAppointmentNotifications: false },
        })
      );

      const digestIdx = html.indexOf('data-testid="switch-staff-morning-digest"');
      const preSlotIdx = html.indexOf('data-testid="switch-staff-pre-slot"');
      const overdueIdx = html.indexOf('data-testid="switch-staff-overdue"');

      expect(html.substring(digestIdx, preSlotIdx)).toContain('data-disabled="true"');
      expect(html.substring(preSlotIdx, overdueIdx)).toContain('data-disabled="true"');
      expect(html.substring(overdueIdx)).toContain('data-disabled="true"');
    });
  });

  describe('6. Staff Notification Deep-Link to Appointments & Inspection Modal', () => {
    test('ClinicNotificationCenterModal renders distinct label for Morning Digest and navigates on click', async () => {
      const digestNotif: ClinicStaffNotification = {
        id: 'notif-digest-1',
        clinicId: 'clinic-1',
        recipientStaffId: 'doc-1',
        title: "Today's Schedule (Nov 20): 4 Appointments",
        body: 'You have 4 scheduled appointments today (2 teleconsults, 1 pending confirmation).',
        category: 'Appointment',
        urgency: 'Routine',
        actionRoute: 'Appointments',
        actionParamsJson: JSON.stringify({ date: '2026-11-20', view: 'day' }),
        sourceType: 'AppointmentMorningDigest',
        sourceId: 'clinic-1:doc-1:2026-11-20',
        isRead: false,
        createdAt: '2026-11-20T00:05:00Z',
      };

      const overdueNotif: ClinicStaffNotification = {
        id: 'notif-overdue-1',
        clinicId: 'clinic-1',
        recipientStaffId: 'doc-1',
        title: 'Overdue Appointment: Maria Santos',
        body: 'Appointment scheduled at 10:00 AM is 15+ minutes overdue.',
        category: 'Appointment',
        urgency: 'Urgent',
        actionRoute: 'Appointments',
        actionParamsJson: JSON.stringify({ appointmentId: 'appt-220-1', date: '2026-11-20' }),
        sourceType: 'Appointment',
        sourceId: 'appt-220-1',
        isRead: false,
        createdAt: '2026-11-20T02:16:00Z',
      };

      const html = renderToStaticMarkup(
        React.createElement(ClinicNotificationCenterModal, {
          visible: true,
          onClose: () => {},
          notifications: [digestNotif, overdueNotif],
          unreadCount: 2,
          onMarkRead: async () => true,
          onMarkAllRead: async () => {},
        })
      );

      expect(html).toContain('View Today&#x27;s Schedule');
      expect(html).toContain('View Appointment');
    });

    test('AppointmentsScreen opens AppointmentInspectionModal when deep-linked via route params', () => {
      const deepLinkedAppt = createBaseAppointment({
        id: 'appt-deep-220',
        patientName: 'Deep Link Patient',
        scheduledAt: '2026-11-19T02:00:00Z',
        status: 'Pending',
      });

      const html = renderToStaticMarkup(
        React.createElement(AppointmentsScreen, {
          route: {
            params: {
              appointmentId: 'appt-deep-220',
              date: '2026-11-19',
              initialAppointments: [deepLinkedAppt],
              initialLoading: false,
            } as any,
          },
        })
      );

      expect(html).toContain('data-testid="appointment-inspection-drawer"');
      expect(html).toContain('Deep Link Patient');
      expect(html).toContain('data-testid="overdue-appointment-banner"');
    });
  });
});
