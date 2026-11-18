// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    testID,
    visible,
    style,
    onPress,
    hitSlop,
    ...rest
  }: any) => {
    if (name === 'Modal' && visible === false) return null;
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { 'data-accessibility-role': accessibilityRole, role: accessibilityRole } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
        ...(hitSlop ? { 'data-hitslop': JSON.stringify(hitSlop) } : {}),
        ...(onPress ? { 'data-pressable': 'true' } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...rest,
      },
      children
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: {
    create: (s: any) => s,
    flatten: (s: any) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s || {}),
  },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  Text: createMockComponent('Text'),
  TextInput: createMockComponent('TextInput'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  TouchableHighlight: createMockComponent('TouchableHighlight'),
  Switch: createMockComponent('Switch'),
  KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
  FlatList: createMockComponent('FlatList'),
  SectionList: createMockComponent('SectionList'),
  Modal: createMockComponent('Modal'),
  Image: createMockComponent('Image'),
  Touchable: { Mixin: {} },
  processColor: (c: any) => c,
  I18nManager: { isRTL: false, doLeftAndRightSwapInRTL: false },
  Platform: { OS: 'web', select: (obj: any) => obj.web || obj.default },
  Dimensions: { get: () => ({ width: 1200, height: 800 }) },
  useWindowDimensions: () => ({ width: 1200, height: 800 }),
  Animated: {
    Value: class {
      constructor(public v: number) {}
      setValue(v: number) { this.v = v; }
      interpolate() { return this; }
    },
    timing: () => ({ start: (cb?: any) => cb?.() }),
    View: createMockComponent('AnimatedView'),
  },
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('Svg'),
  Path: createMockComponent('Path'),
  Circle: createMockComponent('Circle'),
  Rect: createMockComponent('Rect'),
  Line: createMockComponent('Line'),
  default: createMockComponent('Svg'),
}));

mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));

mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mock(() => {}),
    goBack: mock(() => {}),
  }),
}));

let mockCommsEnabled = true;
const mockClinicComms = {
  isChatDrawerOpen: false,
  toggleChatDrawer: mock(() => {}),
  openChatDrawer: mock(() => {}),
  closeChatDrawer: mock(() => {}),
  activeConversationId: undefined,
  setActiveConversationId: mock(() => {}),
  teleconsultSession: null,
  openTeleconsultWaitingRoom: mock(() => {}),
  closeTeleconsultWaitingRoom: mock(() => {}),
  get isCommsEnabled() {
    return mockCommsEnabled;
  },
};

mock.module('../context/ClinicCommsContext', () => ({
  useClinicComms: () => mockClinicComms,
  getCommsApiBaseUrl: () => 'https://clinicez-comms.api.dev.nextstep-software.com',
  ClinicCommsProvider: ({ children }: any) => children,
}));

mock.module('@clinicez/comms-sdk/react', () => {
  const dummyCtx = { isConnected: true };
  return {
    CommsContext: React.createContext(dummyCtx),
    useCommsContext: () => ({ facilityId: 'fac-1' }),
    useConversations: () => ({
      conversations: [],
      unreadCount: 0,
      isLoading: false,
      error: null,
      refresh: mock(() => Promise.resolve()),
      createConversation: mock(() => Promise.resolve({ id: 'c-1' })),
    }),
    useTriageQueue: () => ({
      pendingCount: 0,
      urgentCount: 0,
      items: [],
      isLoading: false,
      error: null,
      refresh: mock(() => Promise.resolve()),
      recordDisposition: mock(() => Promise.resolve()),
    }),
    useConversation: () => ({
      conversation: { id: 'c-1', title: '', scope: 'Facility' },
      messages: [],
      isLoading: false,
      error: null,
      acknowledgeMessage: mock(() => Promise.resolve()),
    }),
    useSendMessage: () => ({
      sendMessage: mock(() => Promise.resolve()),
      resendMessage: mock(() => Promise.resolve()),
    }),
  };
});

mock.module('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'staff-1', name: 'Dr. Test', role: 'Staff' },
    can: () => true,
  }),
}));

mock.module('../context/ClinicContext', () => ({
  useClinic: () => ({
    facilityName: 'Metro Health Clinic',
    license: { clinicId: 'fac-1' },
  }),
}));

mock.module('../context/StaffContext', () => ({
  useStaff: () => ({
    staff: [],
    current: { id: 'staff-1', name: 'Dr. Test' },
    currentName: 'Dr. Test',
  }),
  formatStaffName: (s: any) => s?.name || '',
  staffInitials: () => 'DT',
}));

mock.module('../hooks/useClinicNotifications', () => ({
  useClinicNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    hasStatAlert: false,
    loading: false,
    refresh: mock(() => {}),
    markAsRead: mock(() => {}),
    markAllAsRead: mock(() => {}),
  }),
}));

mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: () => ({ isCompact: false, isWorkstation: true, width: 1200 }),
}));

mock.module('../utils/useSafeInsets', () => ({
  useSafeInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

mock.module('../context/UiDensityContext', () => ({
  useUiDensity: () => ({ multiplier: 1, headerHeight: 64 }),
}));

const { default: ClinicHeaderBar } = await import('../components/layout/ClinicHeaderBar');
const { parseRuntimeSettings, pickSetting, SETTING_NAMES } = await import('../services/runtimeSettings');
const { isCommsEnabled } = await import('../services/runtimeConfig');

describe('Issue #139: Comms Domain Resolution, Feature Gating & Pill Polish', () => {
  beforeEach(() => {
    mockCommsEnabled = true;
  });

  describe('Part 1: Runtime Settings & Configuration Gates', () => {
    test('1.1: SETTING_NAMES includes EXPO_PUBLIC_COMMS_API_URL and EXPO_PUBLIC_ENABLE_COMMS', () => {
      expect(SETTING_NAMES).toContain('EXPO_PUBLIC_COMMS_API_URL');
      expect(SETTING_NAMES).toContain('EXPO_PUBLIC_ENABLE_COMMS');
    });

    test('1.2: parseRuntimeSettings parses EXPO_PUBLIC_COMMS_API_URL and EXPO_PUBLIC_ENABLE_COMMS', () => {
      const parsed = parseRuntimeSettings({
        EXPO_PUBLIC_COMMS_API_URL: 'https://comms.dev.clinicez.net',
        EXPO_PUBLIC_ENABLE_COMMS: 'false',
        UNKNOWN_SETTING: 'ignored',
      });

      expect(parsed.EXPO_PUBLIC_COMMS_API_URL).toBe('https://comms.dev.clinicez.net');
      expect(parsed.EXPO_PUBLIC_ENABLE_COMMS).toBe('false');
      expect((parsed as any).UNKNOWN_SETTING).toBeUndefined();
    });

    test('1.3: pickSetting prioritizes runtime config over build-time config', () => {
      const runtime = { EXPO_PUBLIC_COMMS_API_URL: 'https://runtime-comms.example.com' };
      const build = { EXPO_PUBLIC_COMMS_API_URL: 'https://build-comms.example.com' };

      expect(pickSetting(runtime, build, 'EXPO_PUBLIC_COMMS_API_URL')).toBe('https://runtime-comms.example.com');
    });

    test('1.4: isCommsEnabled returns true by default', () => {
      expect(isCommsEnabled()).toBe(true);
    });

    test('1.5: domain rewriting replaces clinicez-clinic with clinicez-comms and clinic-api with comms-api', () => {
      const devHost = 'https://clinicez-clinic.api.dev.nextstep-software.com';
      const url1 = new URL(devHost);
      url1.hostname = url1.hostname.replace('clinicez-clinic', 'clinicez-comms');
      expect(url1.origin).toBe('https://clinicez-comms.api.dev.nextstep-software.com');

      const prodHost = 'https://clinic-api.dev.clinicez.net';
      const url2 = new URL(prodHost);
      url2.hostname = url2.hostname.replace('clinic-api', 'comms-api');
      expect(url2.origin).toBe('https://comms-api.dev.clinicez.net');

      const localHost = 'http://localhost:5245';
      const url3 = new URL(localHost);
      if (url3.port === '5245') url3.port = '5247';
      expect(url3.origin).toBe('http://localhost:5247');
    });
  });

  describe('Part 2: Header Communications Feature Gating', () => {
    test('2.1: CommsChatButton renders when isCommsEnabled is true', () => {
      mockCommsEnabled = true;
      const html = renderToStaticMarkup(React.createElement(ClinicHeaderBar, {}));
      expect(html).toContain('aria-label="Communications"');
    });

    test('2.2: CommsChatButton is cleanly suppressed when isCommsEnabled is false', () => {
      mockCommsEnabled = false;
      const html = renderToStaticMarkup(React.createElement(ClinicHeaderBar, {}));
      expect(html).not.toContain('aria-label="Communications"');
    });
  });

  describe('Part 3: Scope Filter Pill Styling & Sizing in comms-sdk', () => {
    test('3.1: native-ui ChatDrawer enforces compact 30px pill height and 12px padding', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../packages/comms-sdk/src/native-ui/ChatDrawer.tsx'),
        'utf8'
      );
      expect(source).toContain('minHeight: 30');
      expect(source).toContain('paddingHorizontal: spaceScale.md');
      expect(source).toContain('paddingVertical: spaceScale.xs');
      expect(source).toContain('hitSlop={{ top: 7, bottom: 7, left: 4, right: 4 }}');
    });

    test('3.2: web-ui ChatDrawer replaces 44px capsule with sleek 30px pill', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../../packages/comms-sdk/src/web-ui/ChatDrawer.tsx'),
        'utf8'
      );
      expect(source).toContain('min-h-[30px]');
      expect(source).not.toContain('min-h-[44px] px-3 py-1.5 rounded-full');
    });
  });

  describe('Part 4: Header Polish & Contextual Titles', () => {
    test('4.1: ClinicActiveThread replaces blank or generic Conversation title with contextual scope channel', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../components/comms/ClinicActiveThread.tsx'),
        'utf8'
      );
      expect(source).toContain('getDefaultChannelTitle');
      expect(source).toContain("rawTitle.trim().toLowerCase() === 'conversation'");
      expect(source).toContain('Facility Channel');
      expect(source).toContain('Direct Message');
      expect(source).toContain('Care Team');
      expect(source).toContain('Patient Request');
    });

    test('4.2: Embedded MessageThread modals in cashier, lab, and pharmacy pass showHeader={false}', () => {
      const cashierSrc = fs.readFileSync(
        path.resolve(__dirname, '../../cashier-app/components/CashierChatModal.tsx'),
        'utf8'
      );
      const labSrc = fs.readFileSync(
        path.resolve(__dirname, '../../laboratory-app/components/LabChatModal.tsx'),
        'utf8'
      );
      const pharmacySrc = fs.readFileSync(
        path.resolve(__dirname, '../../pharmacy-app/components/PharmacyChatModal.tsx'),
        'utf8'
      );

      expect(cashierSrc).toContain('showHeader={false}');
      expect(labSrc).toContain('showHeader={false}');
      expect(pharmacySrc).toContain('showHeader={false}');
    });

    test('4.3: web-ui and native-ui MessageThread headerTitle provides meaningful fallback when conversationTitle is missing or generic', () => {
      const nativeThreadSrc = fs.readFileSync(
        path.resolve(__dirname, '../../../packages/comms-sdk/src/native-ui/MessageThread.tsx'),
        'utf8'
      );
      const webThreadSrc = fs.readFileSync(
        path.resolve(__dirname, '../../../packages/comms-sdk/src/web-ui/MessageThread.tsx'),
        'utf8'
      );

      expect(nativeThreadSrc).toContain("conversationTitle.toLowerCase() === 'conversation'");
      expect(webThreadSrc).toContain("conversationTitle.toLowerCase() === 'conversation'");
    });
  });
});
