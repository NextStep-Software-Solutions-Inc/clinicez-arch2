// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

let mockWindowWidth = 1440;
let lastSetParamsCall: any = null;

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    testID,
    title,
    placeholder,
    style,
    disabled,
    bounces,
    alwaysBounceHorizontal,
    overScrollMode,
  }: any) => {
    const resolvedStyle =
      typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(accessibilityState
          ? { 'data-accessibility-state': JSON.stringify(accessibilityState) }
          : {}),
        ...(title ? { title } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(disabled !== undefined ? { 'data-disabled': String(disabled) } : {}),
        ...(bounces !== undefined ? { 'data-bounces': String(bounces) } : {}),
        ...(alwaysBounceHorizontal !== undefined
          ? { 'data-always-bounce-horizontal': String(alwaysBounceHorizontal) }
          : {}),
        ...(overScrollMode !== undefined ? { 'data-over-scroll-mode': overScrollMode } : {}),
        ...(resolvedStyle ? { 'data-style': JSON.stringify(resolvedStyle) } : {}),
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
    get: () => ({ width: mockWindowWidth, height: 900 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: mockWindowWidth, height: 900 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  NativeEventEmitter: class {
    addListener() { return { remove: () => {} }; }
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
      toJSON() {
        return this.val;
      }
    },
    timing: () => ({ start: (cb?: any) => cb && cb({ finished: true }) }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
  Alert: { alert: () => {} },
}));

mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
  SafeAreaView: createMockComponent('SafeAreaView'),
}));

mock.module('expo-document-picker', () => ({
  getDocumentAsync: () => Promise.resolve({ canceled: true, assets: null }),
}));

mock.module('expo-local-authentication', () => ({
  hasHardwareAsync: () => Promise.resolve(false),
  isEnrolledAsync: () => Promise.resolve(false),
  authenticateAsync: () => Promise.resolve({ success: false }),
}));

mock.module('expo-secure-store', () => ({
  getItemAsync: () => Promise.resolve(null),
  setItemAsync: () => Promise.resolve(),
  deleteItemAsync: () => Promise.resolve(),
}));

mock.module('expo-updates', () => ({
  isEnabled: false,
  checkForUpdateAsync: () => Promise.resolve({ isAvailable: false }),
  fetchUpdateAsync: () => Promise.resolve(),
  reloadAsync: () => Promise.resolve(),
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-1234',
}));

mock.module('@dnd-kit/core', () => ({
  DndContext: ({ children }: any) => children,
  closestCenter: () => null,
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor: () => ({}),
  useSensors: () => [],
}));

mock.module('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) => children,
  verticalListSortingStrategy: {},
  sortableKeyboardCoordinates: () => ({}),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  arrayMove: (arr: any[]) => arr,
}));

mock.module('@dnd-kit/modifiers', () => ({
  restrictToVerticalAxis: {},
}));

mock.module('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
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

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('@layout', () => ({
  ResponsiveLayout: ({ children, headerTitle }: any) =>
    React.createElement('div', { 'data-testid': 'responsive-layout', 'data-header': headerTitle }, children),
}));

mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: () => {},
    setParams: (params: any) => {
      lastSetParamsCall = params;
    },
  }),
  useRoute: () => ({ key: 'Settings', name: 'Settings', params: undefined }),
  createStaticNavigation: (nav: any) => nav,
  DefaultTheme: { colors: {} },
}));

mock.module('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: (cfg: any) => cfg,
}));

const { setDeviceItem } = await import('../utils/deviceStorage');
const { ICONS } = await import('../components/ui/Icon');
const {
  SETTINGS_TAB_KEYS,
  SETTINGS_SECTION_CATALOG,
  SETTINGS_SECTIONS_FLAT,
  SETTINGS_NAV_MODE_STORAGE_KEY,
  SETTINGS_VERTICAL_RAIL_MIN_WIDTH,
  filterSettingsTabs,
  matchesSettingsFilter,
  resolveSettingsRouteIntent,
  resolveEffectiveSettingsNavMode,
  readInitialSettingsTabFromSearch,
  buildSyncedSettingsRouteParams,
} = await import('../components/settings/types');
const {
  default: SettingsTabBar,
  COLLAPSED_FILTER_WIDTH,
  EXPANDED_FILTER_WIDTH,
  FILTER_ANIMATION_DURATION_MS,
} = await import('../components/settings/SettingsTabBar');
const {
  default: SettingsVerticalRail,
  SETTINGS_VERTICAL_RAIL_WIDTH,
} = await import('../components/settings/SettingsVerticalRail');
const {
  default: SettingsScreen,
  readInitialSettingsTabFromUrl,
} = await import('../navigation/screens/Settings.screen');
const { default: WorkstationNodeDevSection } = await import(
  '../components/settings/cards/WorkstationNodeDevSection'
);
const { default: WaitingAreaTvSettingsCard } = await import(
  '../components/settings/WaitingAreaTvSettingsCard'
);

const allTabs = SETTINGS_SECTIONS_FLAT.map((s) => ({
  key: s.key,
  label: s.label,
  icon: s.icon,
  groupKey: s.groupKey,
  groupLabel: s.groupLabel,
  description: s.description,
  keywords: s.keywords,
  badge: s.key === 'services' ? 12 : s.key === 'staff' ? '4/10' : undefined,
}));

describe('Settings Dual-Mode Navigation Redesign & Issue #163 Regression Suite', () => {
  test('1. Icon registry exposes both panelTop and layoutSplit Lucide icons', () => {
    expect(ICONS.panelTop).toBeDefined();
    expect(ICONS.layoutSplit).toBeDefined();
  });

  test('2. SETTINGS_SECTION_CATALOG maps all 14 sections across 5 logical groups', () => {
    expect(SETTINGS_TAB_KEYS.length).toBe(14);
    expect(SETTINGS_SECTION_CATALOG.length).toBe(5);
    expect(SETTINGS_SECTIONS_FLAT.length).toBe(14);

    const groupLabels = SETTINGS_SECTION_CATALOG.map((g) => g.label);
    expect(groupLabels).toEqual([
      'Overview',
      'Identity & Branding',
      'Clinical & Front Desk',
      'Billing & Claims',
      'Team & Account',
    ]);

    const expectedByGroup: Record<string, string[]> = {
      overview: ['readiness'],
      identity: ['general', 'branding', 'documents'],
      clinical: ['clinical', 'fields', 'queue-tv', 'notifications'],
      billing: ['services', 'billing-policy', 'philhealth'],
      team: ['staff', 'rbac', 'license'],
    };

    for (const group of SETTINGS_SECTION_CATALOG) {
      expect(group.sections.map((s) => s.key)).toEqual(expectedByGroup[group.key]);
    }
  });

  test('3. Instant keyword filtering matches nested control keywords across all sections', () => {
    const keywordExpectations: Array<[string, string]> = [
      ['qr', 'queue-tv'],
      ['passcode', 'queue-tv'],
      ['tv', 'queue-tv'],
      ['timezone', 'general'],
      ['dental', 'clinical'],
      ['odontogram', 'clinical'],
      ['yakap', 'philhealth'],
      ['cashier', 'billing-policy'],
      ['eod', 'billing-policy'],
      ['seed', 'license'],
      ['edge', 'license'],
      ['logo', 'branding'],
      ['color', 'branding'],
    ];

    for (const [kw, expectedKey] of keywordExpectations) {
      const matched = filterSettingsTabs(allTabs, kw);
      expect(matched.some((t) => t.key === expectedKey)).toBe(true);
    }

    expect(matchesSettingsFilter(allTabs[0], '')).toBe(true);
    expect(filterSettingsTabs(allTabs, 'zzzz-nonexistent-keyword')).toEqual([]);
  });

  test('4. resolveSettingsRouteIntent preserves 100% backward compatibility and rejects invalid tabs', () => {
    expect(resolveSettingsRouteIntent(undefined)).toEqual({
      targetTab: null,
      shouldOpenAddStaff: false,
    });
    expect(resolveSettingsRouteIntent(null)).toEqual({
      targetTab: null,
      shouldOpenAddStaff: false,
    });
    expect(resolveSettingsRouteIntent({ openAddStaff: true })).toEqual({
      targetTab: 'staff',
      shouldOpenAddStaff: true,
    });
    expect(resolveSettingsRouteIntent({ tab: 'staff', openAddStaff: true })).toEqual({
      targetTab: 'staff',
      shouldOpenAddStaff: true,
    });
    expect(resolveSettingsRouteIntent({ tab: 'queue-tv' })).toEqual({
      targetTab: 'queue-tv',
      shouldOpenAddStaff: false,
    });
    expect(resolveSettingsRouteIntent({ tab: 'billing-policy' })).toEqual({
      targetTab: 'billing-policy',
      shouldOpenAddStaff: false,
    });
    expect(resolveSettingsRouteIntent({ tab: 'unknown-tab' })).toEqual({
      targetTab: null,
      shouldOpenAddStaff: false,
    });
    expect(resolveSettingsRouteIntent({ tab: '' })).toEqual({
      targetTab: null,
      shouldOpenAddStaff: false,
    });
  });

  test('5. GitHub Issue #163: URL query param ?tab=<key> persists across reloads and never resets to undefined', () => {
    expect(readInitialSettingsTabFromSearch('?tab=philhealth')).toBe('philhealth');
    expect(readInitialSettingsTabFromUrl('?tab=queue-tv')).toBe('queue-tv');
    expect(readInitialSettingsTabFromUrl('?tab=invalid')).toBeNull();
    expect(readInitialSettingsTabFromUrl('')).toBeNull();

    const synced = buildSyncedSettingsRouteParams('branding');
    expect(synced).toEqual({
      tab: 'branding',
      openAddStaff: undefined,
    });
    expect(synced.tab).not.toBeUndefined();
  });

  test('6. Responsive navMode persistence & <1180px auto-horizontal fallback', () => {
    expect(SETTINGS_NAV_MODE_STORAGE_KEY).toBe('clinicez_settings_nav_mode');
    expect(SETTINGS_VERTICAL_RAIL_MIN_WIDTH).toBe(1180);

    expect(resolveEffectiveSettingsNavMode('vertical', 1440)).toBe('vertical');
    expect(resolveEffectiveSettingsNavMode('horizontal', 1440)).toBe('horizontal');
    expect(resolveEffectiveSettingsNavMode('vertical', 1179)).toBe('horizontal');
    expect(resolveEffectiveSettingsNavMode('vertical', 768)).toBe('horizontal');
  });

  test('7. SettingsTabBar (Mode B): single-row nowrap, native bounce-free horizontal ScrollView (zero chevron buttons & zero scrollTo snap-back), compact 36px -> 220px animated filter, and icon-only mode switcher', () => {
    expect(COLLAPSED_FILTER_WIDTH).toBe(36);
    expect(EXPANDED_FILTER_WIDTH).toBe(220);
    expect(FILTER_ANIMATION_DURATION_MS).toBe(220);

    const tabBarSource = readFileSync(
      resolve(import.meta.dir, '../components/settings/SettingsTabBar.tsx'),
      'utf8'
    );
    expect(tabBarSource).not.toContain('chevronLeft');
    expect(tabBarSource).not.toContain('chevronRight');
    expect(tabBarSource).not.toContain('scrollTo');
    expect(tabBarSource).not.toContain('scrollActiveTabIntoView');

    const collapsedMarkup = renderToStaticMarkup(
      React.createElement(SettingsTabBar, {
        tabs: allTabs,
        activeTab: 'general',
        onSelectTab: () => {},
        filterQuery: '',
        onChangeFilterQuery: () => {},
        navMode: 'horizontal',
        onChangeNavMode: () => {},
        canSwitchNavMode: true,
      })
    );

    expect(collapsedMarkup).toContain('data-testid="settings-horizontal-tab-bar"');
    expect(collapsedMarkup).toContain('flexWrap&quot;:&quot;nowrap&quot;');
    expect(collapsedMarkup).toContain('data-testid="settings-filter-trigger"');
    expect(collapsedMarkup).toContain('&quot;width&quot;:36');
    expect(collapsedMarkup).not.toContain('data-testid="settings-filter-input"');
    expect(collapsedMarkup).not.toContain('data-testid="settings-tabs-scroll-left"');
    expect(collapsedMarkup).not.toContain('data-testid="settings-tabs-scroll-right"');
    expect(collapsedMarkup).toContain('data-testid="settings-tabs-scroll-view"');
    expect(collapsedMarkup).toContain('data-bounces="false"');
    expect(collapsedMarkup).toContain('data-always-bounce-horizontal="false"');
    expect(collapsedMarkup).toContain('data-over-scroll-mode="never"');
    expect(collapsedMarkup).toContain('overscrollBehaviorX&quot;:&quot;none&quot;');

    // Mode switcher is anchored on the LEFT right beside the compact Search filter (before scrollable tabs)
    const switcherIdx = collapsedMarkup.indexOf('data-testid="settings-nav-mode-switcher"');
    const filterIdx = collapsedMarkup.indexOf('data-testid="settings-filter-animated-shell"');
    const scrollIdx = collapsedMarkup.indexOf('data-testid="settings-tabs-scroll-view"');
    expect(switcherIdx).toBeGreaterThan(-1);
    expect(filterIdx).toBeGreaterThan(switcherIdx);
    expect(scrollIdx).toBeGreaterThan(filterIdx);

    // Icon-only layout switcher has accessible labels + tooltips and ZERO visible text labels
    expect(collapsedMarkup).toContain('data-testid="nav-mode-horizontal"');
    expect(collapsedMarkup).toContain('data-testid="nav-mode-vertical"');
    expect(collapsedMarkup).toContain('aria-label="Top tab bar"');
    expect(collapsedMarkup).toContain('aria-label="Left sidebar menu"');
    expect(collapsedMarkup).toContain('title="Top tab bar"');
    expect(collapsedMarkup).toContain('title="Left sidebar menu"');

    const expandedMarkup = renderToStaticMarkup(
      React.createElement(SettingsTabBar, {
        tabs: allTabs,
        activeTab: 'queue-tv',
        onSelectTab: () => {},
        filterQuery: 'passcode',
        onChangeFilterQuery: () => {},
        navMode: 'horizontal',
        onChangeNavMode: () => {},
        canSwitchNavMode: true,
      })
    );

    expect(expandedMarkup).toContain('&quot;width&quot;:220');
    expect(expandedMarkup).toContain('data-testid="settings-filter-input"');
    expect(expandedMarkup).toContain('data-testid="settings-filter-clear"');
    expect(expandedMarkup).toContain('Rooms, Queue &amp; TV');
    expect(expandedMarkup).not.toContain('Clinic Info &amp; Hours');
  });

  test('8. SettingsVerticalRail (Mode A): 216px rail with 5 group headers, badges, full-width filter, and icon-only switcher', () => {
    expect(SETTINGS_VERTICAL_RAIL_WIDTH).toBe(216);

    const railMarkup = renderToStaticMarkup(
      React.createElement(SettingsVerticalRail, {
        tabs: allTabs,
        activeTab: 'services',
        onSelectTab: () => {},
        filterQuery: '',
        onChangeFilterQuery: () => {},
        navMode: 'vertical',
        onChangeNavMode: () => {},
      })
    );

    expect(railMarkup).toContain('data-testid="settings-vertical-rail"');
    expect(railMarkup).toContain('&quot;width&quot;:216');
    expect(railMarkup).toContain('OVERVIEW');
    expect(railMarkup).toContain('IDENTITY &amp; BRANDING');
    expect(railMarkup).toContain('CLINICAL &amp; FRONT DESK');
    expect(railMarkup).toContain('BILLING &amp; CLAIMS');
    expect(railMarkup).toContain('TEAM &amp; ACCOUNT');
    expect(railMarkup).toContain('data-testid="rail-filter-input"');
    expect(railMarkup).toContain('data-testid="nav-mode-horizontal"');
    expect(railMarkup).toContain('data-testid="nav-mode-vertical"');
    // Top-left anchor matches Horizontal mode (mode switcher left, SECTIONS pushed right via space-between)
    expect(railMarkup).toContain('justifyContent&quot;:&quot;space-between&quot;');
    expect(railMarkup.indexOf('data-testid="settings-nav-mode-switcher"')).toBeLessThan(
      railMarkup.indexOf('SECTIONS')
    );
    expect(railMarkup.indexOf('data-testid="settings-nav-mode-switcher"')).toBeLessThan(
      railMarkup.indexOf('data-testid="rail-filter-input"')
    );
    expect(railMarkup).toContain('4/10');
    expect(railMarkup).toContain('12');

    const emptyRailMarkup = renderToStaticMarkup(
      React.createElement(SettingsVerticalRail, {
        tabs: allTabs,
        activeTab: 'services',
        onSelectTab: () => {},
        filterQuery: 'nonexistent-xyz',
        onChangeFilterQuery: () => {},
        navMode: 'vertical',
        onChangeNavMode: () => {},
      })
    );
    expect(emptyRailMarkup).toContain('data-testid="rail-filter-empty"');
    expect(emptyRailMarkup).toContain('Clear filter');
  });

  test('9. SettingsScreen renders Vertical Rail on >=1180px, Horizontal Bar on <1180px, honours ?tab= route param, and omits Web-dead stubs', () => {
    (globalThis as any).__mockAuthContext = {
      state: 'signedIn',
      user: { id: 'u1', email: 'admin@clinic.ph', role: 'Admin', permissions: ['settings:manage', 'staff:manage', 'roles:manage', 'billing:read'] },
      permissions: ['settings:manage', 'staff:manage', 'roles:manage', 'billing:read'],
      offline: false,
      notice: null,
      can: () => true,
    };

    // Desktop >=1180px defaults to Vertical Rail
    mockWindowWidth = 1440;
    setDeviceItem(SETTINGS_NAV_MODE_STORAGE_KEY, null);
    lastSetParamsCall = null;

    const desktopHtml = renderToStaticMarkup(
      React.createElement(SettingsScreen, {
        route: { key: 'Settings', name: 'Settings', params: { tab: 'license' } } as any,
      })
    );
    expect(desktopHtml).toContain('data-testid="settings-vertical-rail"');
    // During initial load (showSkeletons === true), license tab renders SkeletonList instead of flashing fallback values or 0 badges
    expect(desktopHtml).toContain('data-testid="license-tab-skeleton"');
    expect(desktopHtml).toContain('role="progressbar"');
    expect(desktopHtml).not.toContain('Setup Needed');
    // Web must NOT render SecuritySection (Offline PIN) or AppUpdatesSettingsCard (OTA)
    expect(desktopHtml).not.toContain('Offline PIN');
    expect(desktopHtml).not.toContain('Over-the-air');

    const philhealthLoadingHtml = renderToStaticMarkup(
      React.createElement(SettingsScreen, {
        route: { key: 'Settings', name: 'Settings', params: { tab: 'philhealth' } } as any,
      })
    );
    expect(philhealthLoadingHtml).toContain('data-testid="philhealth-tab-skeleton"');
    expect(philhealthLoadingHtml).toContain('role="progressbar"');

    // Tablet/compact <1180px auto-switches to Horizontal Top Bar
    mockWindowWidth = 1024;
    const tabletHtml = renderToStaticMarkup(
      React.createElement(SettingsScreen, {
        route: { key: 'Settings', name: 'Settings', params: { tab: 'clinical' } } as any,
      })
    );
    expect(tabletHtml).toContain('data-testid="settings-horizontal-tab-bar"');
    expect(tabletHtml).toContain('data-testid="clinical-specialty-card"');

    // Stored 'horizontal' preference on desktop renders Horizontal Top Bar with mode switcher
    mockWindowWidth = 1440;
    setDeviceItem(SETTINGS_NAV_MODE_STORAGE_KEY, 'horizontal');
    const desktopHorizontalHtml = renderToStaticMarkup(
      React.createElement(SettingsScreen, {
        route: { key: 'Settings', name: 'Settings', params: { tab: 'branding' } } as any,
      })
    );
    expect(desktopHorizontalHtml).toContain('data-testid="settings-horizontal-tab-bar"');
    expect(desktopHorizontalHtml).toContain('data-testid="settings-nav-mode-switcher"');
    expect(desktopHorizontalHtml).toContain('data-testid="clinic-logo-specimen-card"');

    setDeviceItem(SETTINGS_NAV_MODE_STORAGE_KEY, null);
    delete (globalThis as any).__mockAuthContext;

    // Fluid full-width canvas: zero maxWidth: 960 caps in Settings shell or GeneralSettingsTab
    const generalTabSource = readFileSync(
      resolve(import.meta.dir, '../components/settings/GeneralSettingsTab.tsx'),
      'utf8'
    );
    const settingsScreenSource = readFileSync(
      resolve(import.meta.dir, '../navigation/screens/Settings.screen.tsx'),
      'utf8'
    );
    expect(generalTabSource).not.toContain('960');
    expect(generalTabSource).not.toContain('SETTINGS_FORM_MAX_WIDTH');
    expect(settingsScreenSource).not.toContain('960');
  });

  test('10. WorkstationNodeDevSection collapses advanced tools by default on License tab with plain clinic copy', () => {
    const collapsedHtml = renderToStaticMarkup(
      React.createElement(WorkstationNodeDevSection, {
        filterQuery: '',
      })
    );
    expect(collapsedHtml).toContain('Server Connection &amp; Sample Data');
    expect(collapsedHtml).toContain('Check server connection or load sample patients for testing.');
    expect(collapsedHtml).toContain('data-testid="toggle-workstation-node-dev"');
    expect(collapsedHtml).not.toContain('Edge server &amp; API connectivity');
  });

  test('11. Anti-flicker & anti-jitter parity: constant smallBold tab labels, scrollbarGutter stable, and lastIncomingTabRef lag guard', () => {
    const tabBarSource = readFileSync(
      resolve(import.meta.dir, '../components/settings/SettingsTabBar.tsx'),
      'utf8'
    );
    const railSource = readFileSync(
      resolve(import.meta.dir, '../components/settings/SettingsVerticalRail.tsx'),
      'utf8'
    );
    const settingsScreenSource = readFileSync(
      resolve(import.meta.dir, '../navigation/screens/Settings.screen.tsx'),
      'utf8'
    );

    // 1. Constant fontWeight ('smallBold') on both active and inactive tab labels (zero 400 <-> 600 width jitter)
    expect(tabBarSource).not.toContain("variant={isActive ? 'smallBold' : 'small'}");
    expect(railSource).not.toContain("variant={isActive ? 'smallBold' : 'small'}");

    const tabBarHtml = renderToStaticMarkup(
      React.createElement(SettingsTabBar, {
        tabs: allTabs.slice(0, 3),
        activeTab: 'general',
        onSelectTab: () => {},
        filterQuery: '',
        onChangeFilterQuery: () => {},
        navMode: 'horizontal',
      })
    );
    const inactiveReadinessIdx = tabBarHtml.indexOf('data-testid="settings-tab-readiness"');
    const activeGeneralIdx = tabBarHtml.indexOf('data-testid="settings-tab-general"');
    expect(inactiveReadinessIdx).toBeGreaterThan(-1);
    expect(activeGeneralIdx).toBeGreaterThan(-1);
    const readinessSlice = tabBarHtml.slice(inactiveReadinessIdx, activeGeneralIdx);
    expect(readinessSlice).toContain('fontWeight&quot;:&quot;600&quot;');

    // 2. Main ScrollView container reserves stable scrollbar gutter on Web (zero 15px horizontal shift)
    mockWindowWidth = 1440;
    setDeviceItem(SETTINGS_NAV_MODE_STORAGE_KEY, null);
    const screenHtml = renderToStaticMarkup(
      React.createElement(SettingsScreen, {
        route: { key: 'Settings', name: 'Settings', params: { tab: 'general' } } as any,
      })
    );
    expect(screenHtml).toContain('scrollbarGutter&quot;:&quot;stable&quot;');

    // 3. Incoming route sync effect omits activeTab from deps and guards via lastIncomingTabRef
    expect(settingsScreenSource).toContain('lastIncomingTabRef');
    expect(settingsScreenSource).toContain('}, [incomingTab, incomingOpenAddStaff]);');
    expect(settingsScreenSource).not.toContain('[incomingTab, incomingOpenAddStaff, activeTab');

    // 4. SettingsTabBar & SettingsVerticalRail containers apply subtle floating elevation (...theme.shadows.sm)
    expect(tabBarSource).toContain('...theme.shadows.sm');
    expect(railSource).toContain('...theme.shadows.sm');

    // 5. SettingsScreen wires usePersistedScrollPosition across browser refreshes with resetScrollPosition on tab change
    expect(settingsScreenSource).toContain('usePersistedScrollPosition');
    expect(settingsScreenSource).toContain('`clinicez.scroll.settings.${activeTab}`');
    expect(settingsScreenSource).toContain('ready: !loading');
    expect(settingsScreenSource).toContain('scrollEventThrottle={100}');
    expect(settingsScreenSource).toContain('resetScrollPosition(`clinicez.scroll.settings.${nextTab}`)');

    // 6. WaitingAreaTvSettingsCard URL boxes prevent overflow and render inline icon-only Copy buttons
    const tvHtml = renderToStaticMarkup(
      React.createElement(WaitingAreaTvSettingsCard, {
        settings: {
          clinicName: 'ClinicEZ Medical Center',
          tvDisplayMaskPatientNames: true,
          tvDisplayPin: '123456',
        } as any,
      })
    );
    expect(tvHtml).toContain('data-testid="copy-portal-tv-link-btn"');
    expect(tvHtml).toContain('data-testid="copy-lan-tv-link-btn"');
    expect(tvHtml).toContain('wordBreak&quot;:&quot;break-all&quot;');
  });
});
