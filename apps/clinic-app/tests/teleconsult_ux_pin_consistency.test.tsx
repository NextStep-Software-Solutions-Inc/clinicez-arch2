// token-guard:ignore-file
import { describe, expect, it, mock, beforeEach, afterAll } from 'bun:test';
import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ExtendedAppointmentItem } from '../components/calendar/types';

(globalThis as any).__DEV__ = true;

// =============================================================================
// React Native & Context Mocks (Bun --isolate per file)
// =============================================================================

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
    onPress,
    onClick,
    name: iconName,
    size,
    color,
    ...props
  }: any) => {
    if (name === 'Modal' && visible === false) {
      return null;
    }
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
    const flattenedStyle = Array.isArray(resolvedStyle)
      ? Object.assign({}, ...resolvedStyle.filter(Boolean))
      : resolvedStyle;
    const clickHandler = onPress || onClick;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID, id: testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
        ...(visible !== undefined ? { 'data-visible': String(visible) } : {}),
        ...(disabled !== undefined ? { 'data-disabled': String(disabled), disabled } : {}),
        ...(iconName ? { 'data-icon-name': iconName } : {}),
        ...(size !== undefined ? { 'data-icon-size': String(size) } : {}),
        ...(color ? { 'data-icon-color': color } : {}),
        ...(clickHandler ? { 'data-pressable': 'true', onClick: clickHandler } : {}),
        'data-style': flattenedStyle ? JSON.stringify(flattenedStyle) : undefined,
        ...props,
      },
      children,
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: {
    create: (s: any) => s,
    flatten: (s: any) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s),
    absoluteFill: {},
  },
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
  Polyline: createMockComponent('polyline'),
  Polygon: createMockComponent('polygon'),
  Defs: createMockComponent('defs'),
  LinearGradient: createMockComponent('lineargradient'),
  Stop: createMockComponent('stop'),
  G: createMockComponent('g'),
  Text: createMockComponent('text'),
  default: createMockComponent('svg'),
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
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const MockIcon = createMockComponent('Icon');
mock.module('../components/ui/Icon', () => ({
  default: MockIcon,
  Icon: MockIcon,
  IconSlot: createMockComponent('IconSlot'),
  ICONS: {},
  resolveIconName: (v: any) => v ?? null,
}));

const openTeleconsultCalls: any[] = [];
mock.module('../context/ClinicCommsContext', () => ({
  useClinicComms: () => ({
    isChatDrawerOpen: false,
    toggleChatDrawer: () => {},
    openChatDrawer: () => {},
    closeChatDrawer: () => {},
    activeConversationId: null,
    setActiveConversationId: () => {},
    teleconsultSession: null,
    openTeleconsultWaitingRoom: (params: any) => {
      openTeleconsultCalls.push(params);
    },
    closeTeleconsultWaitingRoom: () => {},
    isCommsEnabled: true,
    isCallStageDocked: false,
    dockCallStage: () => {},
    maximizeCallStage: () => {},
    onOpenConsultationChart: null,
    setOnOpenConsultationChart: () => {},
  }),
}));

const { AppointmentInspectionModal } = require('../components/calendar/AppointmentInspectionModal');
const {
  isGuestInviteReusable,
  getCachedAppointmentInvite,
  setCachedAppointmentInvite,
  clearCachedAppointmentInvite,
  resetInMemoryAppointmentInviteCacheForTests,
} = require('../components/teleconsult/TeleconsultWaitingRoomModal');
const { clinicService } = require('../services/clinicService');
const { createHookHarness, act } = require('../../../packages/comms-sdk/tests/react/hook-test-harness');

// =============================================================================
// Helpers
// =============================================================================

function buildTeleconsultAppointment(
  overrides: Partial<ExtendedAppointmentItem> = {},
): ExtendedAppointmentItem {
  return {
    id: overrides.id ?? 'appt-ux-1',
    clinicId: 'clinic-1',
    patientId: 'pat-101',
    patientName: 'Clemente, Mark Kenneth C.',
    doctorId: 'doc-1',
    doctorName: 'Wave Ambray',
    scheduledAt: '2026-11-13T08:00:00Z',
    durationMinutes: 30,
    status: 'Confirmed',
    appointmentType: 'Teleconsult',
    isTeleconsult: true,
    serviceType: 'Teleconsult',
    callId: 'call-ux-1',
    paymentPolicy: 'Prepaid',
    paymentStatus: 'Pending',
    createdAt: '2026-11-10T08:00:00Z',
    ...overrides,
  };
}

function findElementByTestID(node: any, targetId: string): any {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElementByTestID(child, targetId);
      if (hit) return hit;
    }
    return null;
  }
  const props = node.props;
  if (props && (props.testID === targetId || props['data-testid'] === targetId)) {
    return node;
  }
  if (props?.children !== undefined) {
    return findElementByTestID(props.children, targetId);
  }
  return null;
}

function extractElementByTestIDMarkup(html: string, testId: string): string | null {
  const idx = html.indexOf(`data-testid="${testId}"`);
  if (idx === -1) return null;
  const openStart = html.lastIndexOf('<div', idx);
  if (openStart === -1) return null;
  let depth = 0;
  let cursor = openStart;
  while (cursor < html.length) {
    const nextOpen = html.indexOf('<div', cursor);
    const nextClose = html.indexOf('</div>', cursor);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      cursor = nextOpen + 4;
    } else {
      depth -= 1;
      cursor = nextClose + 6;
      if (depth === 0) {
        return html.slice(openStart, cursor);
      }
    }
  }
  return null;
}

async function flushMicrotasks(ticks = 6): Promise<void> {
  for (let i = 0; i < ticks; i += 1) {
    await Promise.resolve();
  }
}

describe('Teleconsultation UX Polish & 6-Digit PIN Consistency (Clinic App)', () => {
  const origCreateGuestInvite = clinicService.createTeleconsultGuestInvite;
  const origGetTeleconsultStatus = clinicService.getTeleconsultStatus;
  const origClipboard = (globalThis as any).navigator?.clipboard;

  beforeEach(() => {
    openTeleconsultCalls.length = 0;
    clearCachedAppointmentInvite('appt-ux-1');
    clearCachedAppointmentInvite('appt-ux-2');
    clearCachedAppointmentInvite('appt-pin-1');
    clearCachedAppointmentInvite('appt-copy-1');
  });

  afterAll(() => {
    clinicService.createTeleconsultGuestInvite = origCreateGuestInvite;
    if (origGetTeleconsultStatus) {
      clinicService.getTeleconsultStatus = origGetTeleconsultStatus;
    }
    if ((globalThis as any).navigator) {
      (globalThis as any).navigator.clipboard = origClipboard;
    }
  });

  // ===========================================================================
  // Issue 2: Redundant Payment Policy & Payment Status Badges
  // ===========================================================================
  describe('Issue 2: Badge deduplication in AppointmentInspectionModal', () => {
    const badgeMatrix: Array<{
      policy: 'Exempt' | 'Postpaid' | 'Prepaid';
      paymentStatus: 'Exempt' | 'Pending' | 'Paid' | 'Overridden';
      expectPaymentStatusBadge: boolean;
    }> = [
      { policy: 'Exempt', paymentStatus: 'Exempt', expectPaymentStatusBadge: false },
      { policy: 'Postpaid', paymentStatus: 'Pending', expectPaymentStatusBadge: false },
      { policy: 'Postpaid', paymentStatus: 'Paid', expectPaymentStatusBadge: true },
      { policy: 'Prepaid', paymentStatus: 'Pending', expectPaymentStatusBadge: true },
      { policy: 'Prepaid', paymentStatus: 'Paid', expectPaymentStatusBadge: true },
      { policy: 'Prepaid', paymentStatus: 'Overridden', expectPaymentStatusBadge: true },
    ];

    for (const row of badgeMatrix) {
      it(`(${row.policy}, ${row.paymentStatus}) -> hides badge-payment-policy and ${row.expectPaymentStatusBadge ? 'shows' : 'hides'} badge-payment-status`, () => {
        const appt = buildTeleconsultAppointment({
          id: `appt-badge-${row.policy}-${row.paymentStatus}`,
          paymentPolicy: row.policy,
          paymentStatus: row.paymentStatus,
        });

        const html = renderToStaticMarkup(
          React.createElement(AppointmentInspectionModal, {
            visible: true,
            appointment: appt,
            onClose: () => {},
          }),
        );

        expect(html).not.toContain('data-testid="badge-payment-policy"');
        if (row.expectPaymentStatusBadge) {
          expect(html).toContain('data-testid="badge-payment-status"');
        } else {
          expect(html).not.toContain('data-testid="badge-payment-status"');
        }
      });
    }
  });

  // ===========================================================================
  // Issue 3: 6-Digit PIN Consistency & Appointment Invite Cache
  // ===========================================================================
  describe('Issue 3: Active Invite Cache & initialInvite handoff to TeleconsultWaitingRoomModal', () => {
    it('isGuestInviteReusable rejects missing fields or <=60s expiry, accepts >60s expiry', () => {
      expect(isGuestInviteReusable(null)).toBe(false);
      expect(isGuestInviteReusable(undefined)).toBe(false);
      expect(
        isGuestInviteReusable({
          inviteId: 'inv-no-otp',
          inviteUrl: 'https://portal.example/join?token=abc',
          otp: '',
          expiresAtUtc: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      ).toBe(false);
      expect(
        isGuestInviteReusable({
          inviteId: 'inv-expiring',
          inviteUrl: 'https://portal.example/join?token=abc',
          otp: '123456',
          expiresAtUtc: new Date(Date.now() + 30 * 1000).toISOString(),
        }),
      ).toBe(false);
      expect(
        isGuestInviteReusable({
          inviteId: 'inv-valid',
          inviteUrl: 'https://portal.example/join?token=abc',
          otp: '123456',
          expiresAtUtc: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        }),
      ).toBe(true);
    });

    it('setCachedAppointmentInvite / getCachedAppointmentInvite / clearCachedAppointmentInvite enforce TTL boundary', () => {
      const validInvite = {
        inviteId: 'inv-cache-1',
        inviteUrl: 'https://portal.example/join?token=cache1',
        otp: '494470',
        expiresAtUtc: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      };
      setCachedAppointmentInvite('appt-ux-1', validInvite);
      expect(getCachedAppointmentInvite('appt-ux-1')?.otp).toBe('494470');

      const nearExpiryInvite = {
        inviteId: 'inv-cache-2',
        inviteUrl: 'https://portal.example/join?token=cache2',
        otp: '999999',
        expiresAtUtc: new Date(Date.now() + 30 * 1000).toISOString(),
      };
      setCachedAppointmentInvite('appt-ux-2', nearExpiryInvite);
      expect(getCachedAppointmentInvite('appt-ux-2')).toBeNull();

      clearCachedAppointmentInvite('appt-ux-1');
      expect(getCachedAppointmentInvite('appt-ux-1')).toBeNull();
    });

    it('mounts AppointmentInspectionModal, caches minted PIN, skips duplicate mint on remount, and passes initialInvite to openTeleconsultWaitingRoom', async () => {
      let mintCount = 0;
      const mintedInvite = {
        inviteId: 'inv-consistent-1',
        inviteUrl: 'https://portal.example/teleconsult/join?token=consistent-tok',
        otp: '654321',
        expiresAtUtc: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      };

      clinicService.createTeleconsultGuestInvite = async () => {
        mintCount += 1;
        return [mintedInvite, null];
      };
      clinicService.getTeleconsultStatus = async () => [null, null];

      const appt = buildTeleconsultAppointment({ id: 'appt-pin-1' });
      const harness = createHookHarness(
        (props: any) => AppointmentInspectionModal(props),
        {
          initialProps: {
            visible: true,
            appointment: appt,
            onClose: () => {},
          },
        },
      );

      await act(async () => {
        await flushMicrotasks();
      });

      expect(mintCount).toBe(1);
      expect(getCachedAppointmentInvite('appt-pin-1')?.otp).toBe('654321');

      const teleconsultBtn = findElementByTestID(harness.result.current, 'btn-drawer-teleconsult');
      expect(teleconsultBtn).not.toBeNull();

      await act(async () => {
        teleconsultBtn.props.onPress();
      });

      expect(openTeleconsultCalls.length).toBe(1);
      expect(openTeleconsultCalls[0].appointmentId).toBe('appt-pin-1');
      expect(openTeleconsultCalls[0].initialInvite).toEqual(mintedInvite);
      expect(openTeleconsultCalls[0].initialInvite.otp).toBe('654321');

      harness.unmount();

      // Re-mount for the same appointment: warm cache prevents a second mint request
      const secondHarness = createHookHarness(
        (props: any) => AppointmentInspectionModal(props),
        {
          initialProps: {
            visible: true,
            appointment: appt,
            onClose: () => {},
          },
        },
      );

      await act(async () => {
        await flushMicrotasks();
      });

      expect(mintCount).toBe(1);

      const secondBtn = findElementByTestID(secondHarness.result.current, 'btn-drawer-teleconsult');
      expect(secondBtn).not.toBeNull();

      await act(async () => {
        secondBtn.props.onPress();
      });

      expect(openTeleconsultCalls.length).toBe(2);
      expect(openTeleconsultCalls[1].initialInvite?.otp).toBe('654321');

      secondHarness.unmount();
    });
  });

  // ===========================================================================
  // Issue 4: Borderless Icon-Only Copy PIN Button
  // ===========================================================================
  describe('Issue 4: btn-inspection-copy-pin renders borderless icon-only with copy -> check feedback', () => {
    it('contains zero "Copy PIN" text, has no borderWidth/backgroundColor, and toggles icon to check when pressed', async () => {
      const copiedValues: string[] = [];
      (globalThis as any).navigator = {
        ...(globalThis as any).navigator,
        clipboard: {
          writeText: async (value: string) => {
            copiedValues.push(value);
          },
        },
      };

      const appt = buildTeleconsultAppointment({ id: 'appt-copy-1' });
      const activeInvite = {
        inviteId: 'inv-copy-1',
        inviteUrl: 'https://portal.example/teleconsult/join?token=copy-tok',
        otp: '778130',
        expiresAtUtc: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      };
      setCachedAppointmentInvite('appt-copy-1', activeInvite);

      let mintCalls = 0;
      clinicService.createTeleconsultGuestInvite = async () => {
        mintCalls += 1;
        return [activeInvite, null];
      };

      const harness = createHookHarness(
        (props: any) => AppointmentInspectionModal(props),
        {
          initialProps: {
            visible: true,
            appointment: appt,
            onClose: () => {},
          },
        },
      );

      await act(async () => {
        await flushMicrotasks();
      });

      expect(mintCalls).toBe(0);

      const initialHtml = renderToStaticMarkup(harness.result.current as any);
      const copyBtnMarkup = extractElementByTestIDMarkup(initialHtml, 'btn-inspection-copy-pin');
      expect(copyBtnMarkup).not.toBeNull();
      expect(copyBtnMarkup!).not.toContain('Copy PIN');
      expect(copyBtnMarkup!).toContain('data-icon-name="copy"');

      const styleAttrMatch = copyBtnMarkup!.match(/data-style="([^"]*)"/);
      expect(styleAttrMatch).not.toBeNull();
      const decodedStyle = JSON.parse(styleAttrMatch![1].replace(/&quot;/g, '"'));
      expect(decodedStyle.borderWidth).toBeUndefined();
      expect(decodedStyle.borderColor).toBeUndefined();
      expect(decodedStyle.backgroundColor).toBeUndefined();

      const copyBtnElement = findElementByTestID(harness.result.current, 'btn-inspection-copy-pin');
      expect(copyBtnElement).not.toBeNull();

      await act(async () => {
        await copyBtnElement.props.onPress();
        await flushMicrotasks();
      });

      expect(copiedValues).toEqual(['778130']);

      const afterClickHtml = renderToStaticMarkup(harness.result.current as any);
      const updatedMarkup = extractElementByTestIDMarkup(afterClickHtml, 'btn-inspection-copy-pin');
      expect(updatedMarkup).not.toBeNull();
      expect(updatedMarkup!).toContain('data-icon-name="check"');

      harness.unmount();
    });
  });

  describe('3. PIN & Session Persistence Across Accidental Refresh or Disconnect', () => {
    it('recovers cached 6-digit PIN from sessionStorage after clearing in-memory cache and purges on clearCachedAppointmentInvite', () => {
      const prevWindow = (globalThis as any).window;
      const store = new Map<string, string>();
      (globalThis as any).window = {
        ...(prevWindow ?? {}),
        sessionStorage: {
          getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
          setItem: (k: string, v: string) => {
            store.set(k, String(v));
          },
          removeItem: (k: string) => {
            store.delete(k);
          },
        },
      };

      try {
        const invite = {
          inviteId: 'inv-persist-1',
          inviteUrl: 'https://portal.example/teleconsult/join?token=persist-tok',
          otp: '619420',
          expiresAtUtc: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        };

        setCachedAppointmentInvite('appt-refresh-1', invite);
        expect(store.has('clinicez.teleconsult.invite.appt-refresh-1')).toBe(true);

        // Simulate browser refresh wiping in-memory Map
        resetInMemoryAppointmentInviteCacheForTests();
        const recovered = getCachedAppointmentInvite('appt-refresh-1');
        expect(recovered).not.toBeNull();
        expect(recovered?.otp).toBe('619420');
        expect(recovered?.inviteUrl).toBe(invite.inviteUrl);

        clearCachedAppointmentInvite('appt-refresh-1');
        expect(store.has('clinicez.teleconsult.invite.appt-refresh-1')).toBe(false);
        expect(getCachedAppointmentInvite('appt-refresh-1')).toBeNull();
      } finally {
        if (prevWindow === undefined) {
          delete (globalThis as any).window;
        } else {
          (globalThis as any).window = prevWindow;
        }
      }
    });

    it('handleCancelCall disconnects media without calling session.endCall (preserving patient PIN), while handleEndCall terminates session', () => {
      const modalSrc = fs.readFileSync(
        path.resolve(__dirname, '../components/teleconsult/TeleconsultWaitingRoomModal.tsx'),
        'utf-8',
      );
      const cancelStart = modalSrc.indexOf('const handleCancelCall = useCallback');
      const endStart = modalSrc.indexOf('const handleEndCall = useCallback');
      const enterStart = modalSrc.indexOf('const handleEnterCall = useCallback');
      expect(cancelStart).toBeGreaterThan(-1);
      expect(endStart).toBeGreaterThan(cancelStart);
      expect(enterStart).toBeGreaterThan(endStart);

      const cancelBody = modalSrc.slice(cancelStart, endStart);
      const endBody = modalSrc.slice(endStart, enterStart);

      expect(cancelBody).toContain('mediaAdapter.disconnect()');
      expect(cancelBody).not.toContain('session.endCall');
      expect(endBody).toContain('session.endCall()');

      const admitStart = modalSrc.indexOf('const handleAdmitFromWaitingRoom = useCallback');
      const retryStart = modalSrc.indexOf('const handleRetryVideoServer = useCallback');
      expect(admitStart).toBeGreaterThan(-1);
      expect(retryStart).toBeGreaterThan(admitStart);
      const admitBody = modalSrc.slice(admitStart, retryStart);
      expect(admitBody).toContain('hasAdmittedOnServerRef.current');
      expect(admitBody).toContain('hydratedStatus?.admittedAtUtc');
      expect(admitBody).toContain('handleEnterCall()');

      const contextSrc = fs.readFileSync(
        path.resolve(__dirname, '../context/ClinicCommsContext.tsx'),
        'utf-8',
      );
      expect(contextSrc).toContain('clinicez.teleconsult.activeSession.');
      expect(contextSrc).toContain('readPersistedTeleconsultSession');
      expect(contextSrc).toContain('writePersistedTeleconsultSession');
    });
  });
});
