import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

interface CapturedPressable {
  testID?: string;
  accessibilityLabel?: string;
  accessibilityRole?: string;
  hitSlop?: any;
  onPress?: () => void;
  onHoverIn?: (e?: any) => void;
  onHoverOut?: () => void;
  styleFn?: (state: { pressed: boolean; hovered?: boolean }) => any;
  resolvedRestStyle?: any;
}

const capturedPressables = new Map<string, CapturedPressable>();

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    hitSlop,
    onPress,
    onHoverIn,
    onHoverOut,
    title,
    source,
    style,
    testID,
  }: any) => {
    const resolvedStyle =
      typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
    if (testID) {
      capturedPressables.set(testID, {
        testID,
        accessibilityLabel,
        accessibilityRole,
        hitSlop,
        onPress,
        onHoverIn,
        onHoverOut,
        styleFn: typeof style === 'function' ? style : undefined,
        resolvedRestStyle: resolvedStyle,
      });
    }
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(accessibilityState?.selected !== undefined
          ? { 'aria-selected': String(accessibilityState.selected) }
          : {}),
        ...(hitSlop !== undefined ? { 'data-hitslop': String(hitSlop) } : {}),
        ...(title ? { 'data-title': title } : {}),
        ...(source?.uri ? { 'data-src': source.uri } : {}),
        ...(resolvedStyle ? { 'data-style': JSON.stringify(resolvedStyle) } : {}),
        onClick: onPress,
      },
      children,
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: {
    create: (s: any) => s,
    flatten: (input: any): any => {
      const acc: Record<string, any> = {};
      const walk = (item: any) => {
        if (!item) return;
        if (Array.isArray(item)) {
          for (const sub of item) walk(sub);
        } else if (typeof item === 'object') {
          Object.assign(acc, item);
        }
      };
      walk(input);
      return acc;
    },
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
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
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

mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
  SafeAreaView: createMockComponent('SafeAreaView'),
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('Svg'),
  Path: createMockComponent('Path'),
  Circle: createMockComponent('Circle'),
  Rect: createMockComponent('Rect'),
  Line: createMockComponent('Line'),
  default: createMockComponent('Svg'),
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('../components/comms/ClinicChatDrawerHost', () => ({
  default: () => null,
}));

mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: () => {},
    setParams: () => {},
    goBack: () => {},
  }),
  useRoute: () => ({ name: 'Dashboard', params: {} }),
}));

mock.module('../context/ClinicContext', () => ({
  useClinic: () =>
    (globalThis as any).__mockClinicContext ?? {
      facilityName: 'St. Luke Primary Care Center',
      planTier: 'pro',
      clinicLogo: null,
    },
  ClinicProvider: ({ children }: any) => children,
}));

const authMockFactory = () => ({
  useAuth: () =>
    (globalThis as any).__mockAuthContext ?? {
      state: 'signedIn',
      user: {
        id: 'staff-1',
        name: 'Carlo Bernardo',
        role: 'Admin',
        roleName: 'Clinic Administrator',
      },
      can: () => true,
      offline: false,
    },
  usePermission: () => true,
  AuthProvider: ({ children }: any) => children,
});

const staffMockFactory = () => ({
  useStaff: () =>
    (globalThis as any).__mockStaffContext ?? {
      staff: [],
      current: null,
      currentName: 'Carlo Bernardo',
      loading: false,
      error: null,
      reload: async () => {},
    },
  formatStaffName: (s?: any) => (s ? `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() : ''),
  staffInitials: () => 'CB',
  StaffProvider: ({ children }: any) => children,
});

mock.module('../context/AuthContext', authMockFactory);
mock.module('@context/AuthContext', authMockFactory);
mock.module('../context/StaffContext', staffMockFactory);
mock.module('@context/StaffContext', staffMockFactory);

const { StyleSheet } = await import('react-native');
const { default: WorkstationSidebar } = await import('../components/layout/WorkstationSidebar');
const { default: ClinicHeaderBar } = await import('../components/layout/ClinicHeaderBar');
const { BRAND_COLOR_PRESETS, DEFAULT_CLINIC_BRAND_COLOR } = await import('../constants/color');
const { syncActiveTheme, theme } = await import('../constants/theme');

describe('WorkstationSidebar Brand Sync, Stacked Plan Badge & Mid-Edge Handle (Task 104)', () => {
  beforeEach(() => {
    capturedPressables.clear();
    (globalThis as any).__mockClinicContext = {
      facilityName: 'St. Luke Primary Care Center',
      planTier: 'pro',
      clinicLogo: null,
    };
    syncActiveTheme({
      brandColorHex: DEFAULT_CLINIC_BRAND_COLOR,
      userBrandColorHex: null,
      scheme: 'light',
    });
  });

  afterEach(() => {
    syncActiveTheme({
      brandColorHex: DEFAULT_CLINIC_BRAND_COLOR,
      userBrandColorHex: null,
      scheme: 'light',
    });
  });

  test('1. Syncs sidebar clinic displayName color with active brand/personal palette matching ClinicHeaderBar', () => {
    const indigoPreset = BRAND_COLOR_PRESETS[3];
    const rosePreset = BRAND_COLOR_PRESETS[4];

    syncActiveTheme({
      brandColorHex: indigoPreset.color,
      userBrandColorHex: null,
      scheme: 'light',
    });
    const indigoSidebarHtml = renderToStaticMarkup(
      React.createElement(WorkstationSidebar, {
        currentRoute: 'Dashboard',
        onNavigate: () => {},
        mode: 'open',
      }),
    );
    const indigoHeaderHtml = renderToStaticMarkup(
      React.createElement(ClinicHeaderBar, {
        title: 'Dashboard',
      }),
    );
    expect(indigoSidebarHtml).toContain('St. Luke Primary Care Center');
    expect(indigoSidebarHtml).toContain(`&quot;color&quot;:&quot;${indigoPreset.color}&quot;`);
    expect(indigoHeaderHtml).toContain(`&quot;color&quot;:&quot;${indigoPreset.color}&quot;`);

    // Personal accent color override updates both sidebar displayName and header title in lockstep
    syncActiveTheme({
      brandColorHex: indigoPreset.color,
      userBrandColorHex: rosePreset.color,
      scheme: 'light',
    });
    const roseSidebarHtml = renderToStaticMarkup(
      React.createElement(WorkstationSidebar, {
        currentRoute: 'Dashboard',
        onNavigate: () => {},
        mode: 'open',
      }),
    );
    expect(roseSidebarHtml).toContain(`&quot;color&quot;:&quot;${rosePreset.color}&quot;`);
  });

  test('2. Removes inline chevron button from brandHeader and stacks PRO badge underneath displayName', () => {
    const sidebarSource = fs.readFileSync(
      path.resolve(__dirname, '../components/layout/WorkstationSidebar.tsx'),
      'utf8',
    );

    // Inline <Button icon="chevronLeft" ... /> is gone from WorkstationSidebar
    expect(sidebarSource).toContain('subscribeActiveTheme');
    expect(sidebarSource).not.toMatch(/<Button[\s\S]{0,160}icon="chevronLeft"/);
    expect(sidebarSource).toMatch(/brandText:\s*\{[\s\S]*?flexDirection:\s*'column'/);
    expect(sidebarSource).toMatch(/brandText:\s*\{[\s\S]*?gap:\s*2/);
    expect(sidebarSource).toMatch(/planTierBadge:\s*\{[\s\S]*?alignSelf:\s*'flex-start'/);

    // Without onToggleMode, no collapse control renders in the header or edge
    const noToggleHtml = renderToStaticMarkup(
      React.createElement(WorkstationSidebar, {
        currentRoute: 'Patients',
        onNavigate: () => {},
        mode: 'open',
      }),
    );
    expect(noToggleHtml).toContain('St. Luke Primary Care Center');
    expect(noToggleHtml).toContain('PRO');
    expect(noToggleHtml).not.toContain('Collapse sidebar to icon rail');
    expect(capturedPressables.has('sidebar-edge-toggle-handle')).toBe(false);
  });

  test('3. Renders mid-edge hover-scaling collapsible handle in both open (chevronLeft) and icon (chevronRight) modes', () => {
    let toggleCalls = 0;

    // Open mode -> Collapse handle with chevronLeft
    capturedPressables.clear();
    const openHtml = renderToStaticMarkup(
      React.createElement(WorkstationSidebar, {
        currentRoute: 'Dashboard',
        onNavigate: () => {},
        mode: 'open',
        onToggleMode: () => {
          toggleCalls += 1;
        },
      }),
    );

    expect(openHtml).toContain('data-testid="sidebar-edge-toggle-handle"');
    expect(openHtml).toContain('aria-label="Collapse sidebar to icon rail"');
    expect(openHtml).toContain('&quot;overflow&quot;:&quot;visible&quot;');
    expect(openHtml).toContain('&quot;overflow&quot;:&quot;hidden&quot;');

    const openHandle = capturedPressables.get('sidebar-edge-toggle-handle');
    expect(openHandle).toBeDefined();
    expect(openHandle?.accessibilityRole).toBe('button');
    expect(openHandle?.accessibilityLabel).toBe('Collapse sidebar to icon rail');
    expect(openHandle?.hitSlop).toBe(10);

    const restFlat = StyleSheet.flatten(openHandle?.styleFn?.({ pressed: false, hovered: false }));
    expect(restFlat.position).toBe('absolute');
    expect(restFlat.right).toBe(-11);
    expect(restFlat.top).toBe('50%');
    expect(restFlat.width).toBe(22);
    expect(restFlat.height).toBe(36);
    expect(restFlat.zIndex).toBe(120);
    expect(restFlat.backgroundColor).toBe(theme.colors.surface);
    expect(restFlat.borderColor).toBe(theme.colors.border);
    expect(restFlat.transform).toEqual([{ translateY: -18 }, { scale: 1 }]);

    const hoverFlat = StyleSheet.flatten(openHandle?.styleFn?.({ pressed: false, hovered: true }));
    expect(hoverFlat.backgroundColor).toBe(theme.colors.primaryLight);
    expect(hoverFlat.borderColor).toBe(theme.colors.primaryBorder);
    expect(hoverFlat.transform).toEqual([{ translateY: -18 }, { scale: 1.25 }]);
    expect(hoverFlat.boxShadow).toBe(theme.shadows.brandSm.boxShadow);

    const pressFlat = StyleSheet.flatten(openHandle?.styleFn?.({ pressed: true, hovered: true }));
    expect(pressFlat.transform).toEqual([{ translateY: -18 }, { scale: 1.08 }]);

    openHandle?.onPress?.();
    expect(toggleCalls).toBe(1);

    // Icon mode -> Expand handle with chevronRight
    capturedPressables.clear();
    const iconHtml = renderToStaticMarkup(
      React.createElement(WorkstationSidebar, {
        currentRoute: 'Dashboard',
        onNavigate: () => {},
        mode: 'icon',
        width: 72,
        onToggleMode: () => {
          toggleCalls += 1;
        },
      }),
    );

    const iconHandle = capturedPressables.get('sidebar-edge-toggle-handle');
    expect(iconHandle).toBeDefined();
    expect(iconHandle?.accessibilityLabel).toBe('Expand sidebar');
    expect(iconHtml).toContain('data-testid="sidebar-edge-toggle-handle"');
    iconHandle?.onPress?.();
    expect(toggleCalls).toBe(2);
  });
});
