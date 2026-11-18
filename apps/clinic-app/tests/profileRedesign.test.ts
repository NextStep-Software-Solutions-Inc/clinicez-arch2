import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AuthUser } from '../services/authSession';
import type { StaffMember } from '../services/clinicService';

(globalThis as any).__DEV__ = true;

const pressHandlersByTestId = new Map<string, () => void>();

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    placeholder,
    value,
    onPress,
    title,
    source,
    style,
    contentContainerStyle,
    testID,
  }: any) => {
    if (testID && typeof onPress === 'function') {
      pressHandlersByTestId.set(testID, onPress);
    }
    const resolvedStyle = typeof style === 'function' ? style({ hovered: false, pressed: false }) : style;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(accessibilityState?.selected !== undefined
          ? { 'aria-selected': String(accessibilityState.selected) }
          : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(value !== undefined ? { 'data-value': String(value) } : {}),
        ...(title ? { 'data-title': title } : {}),
        ...(source?.uri ? { 'data-src': source.uri } : {}),
        ...(resolvedStyle ? { 'data-style': JSON.stringify(resolvedStyle) } : {}),
        ...(contentContainerStyle
          ? { 'data-content-style': JSON.stringify(contentContainerStyle) }
          : {}),
        onClick: onPress,
      },
      title,
      children,
    );
  };
  Comp.displayName = name;
  return Comp;
};

let lastNavigateArgs: any[] = [];
let lastSetParamsArgs: any = null;
let mockRouteParams: Record<string, any> = {};

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
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
  PanResponder: { create: (config: any) => ({ panHandlers: {}, ...config }) },
  RefreshControl: createMockComponent('RefreshControl'),
  processColor: (c: any) => c,
  Vibration: { vibrate: () => {}, cancel: () => {} },
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
  Polyline: 'Polyline',
  Polygon: 'Polygon',
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
    navigate: (...args: any[]) => {
      lastNavigateArgs = args;
    },
    setParams: (params: any) => {
      lastSetParamsArgs = params;
    },
    goBack: () => {},
  }),
  useRoute: () => ({ params: mockRouteParams }),
}));

const defaultAuthMock = {
  state: 'signedOut' as const,
  user: null,
  permissions: [] as string[],
  offline: false,
  notice: null,
  login: async () => null,
  bootstrap: async () => null,
  changePassword: async () => null,
  completeUnlock: () => {},
  useDifferentAccount: async () => {},
  logout: async () => {},
  retry: () => {},
  can: () => false,
};

const authContextMockFactory = () => ({
  useAuth: () => (globalThis as any).__mockAuthContext ?? defaultAuthMock,
  usePermission: () => true,
  AuthProvider: ({ children }: any) => children,
});

const staffContextMockFactory = () => ({
  useStaff: () =>
    (globalThis as any).__mockStaffContext ?? {
      staff: [],
      current: null,
      currentName: '',
      loading: false,
      error: null,
      reload: async () => {},
    },
  formatStaffName: (s?: any) => {
    if (!s) return '';
    return [s.title, s.firstName, s.lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  },
  staffInitials: (s?: any) => {
    if (!s) return '?';
    return `${s.firstName?.[0] ?? ''}${s.lastName?.[0] ?? ''}`.toUpperCase() || '?';
  },
  StaffProvider: ({ children }: any) => children,
});

mock.module('../context/AuthContext', authContextMockFactory);
mock.module('@context/AuthContext', authContextMockFactory);
mock.module('../context/StaffContext', staffContextMockFactory);
mock.module('@context/StaffContext', staffContextMockFactory);

const { default: UserMenu } = await import('../components/layout/UserMenu');
const { default: ClinicHeaderBar } = await import('../components/layout/ClinicHeaderBar');
const {
  default: ProfileScreen,
  resolveProfileCredentialVisibility,
  resolveProfileTabIntent,
  getVisibleProfileTabs,
  serializeAudioPreferences,
  PROFILE_TAB_CATALOG,
} = await import('../navigation/screens/Profile.screen');
const {
  ProfileTabBar,
  ProfileContactTab,
  ProfileCredentialsTab,
  PhysicianStampSpecimenCard,
  ProfilePreferencesTab,
  ProfileSecurityTab,
  validatePersonalAccentHex,
} = await import('../components/profile');
const {
  ThemeModeProvider,
  useThemeMode,
  THEME_MODE_OPTIONS,
  THEME_MODE_STORAGE_KEY,
  USER_ACCENT_COLOR_STORAGE_KEY,
  resolveEffectiveColorScheme,
} = await import('../context/ThemeModeContext');
const {
  BRAND_COLOR_PRESETS,
  DEFAULT_CLINIC_BRAND_COLOR,
  deriveBrandPalette,
} = await import('../constants/color');
const { getActiveThemeState, syncActiveTheme } = await import('../constants/theme');
const { getDeviceItem, setDeviceItem } = await import('../utils/deviceStorage');
const { setActiveAudioPreferences } = await import('../utils/alertSounds');

describe('Profile & Workstation Preferences Modular Redesign', () => {
  const doctorUser: AuthUser = {
    id: 'staff-doc-001',
    name: 'Carlo Bernardo',
    email: 'carlo.bernardo@clinicez.ph',
    role: 'Doctor',
    roleName: 'Attending Physician',
    clinicId: 'clinic-main',
    tenantId: 'tenant-main',
    clinicName: 'St. Luke Primary Care',
    permissions: ['consultations:read', 'consultations:write'],
    mustChangePassword: false,
  };

  const doctorStaff: StaffMember = {
    id: 'staff-doc-001',
    tenantId: 'tenant-main',
    clinicId: 'clinic-main',
    roleName: 'Attending Physician',
    title: 'Dr.',
    firstName: 'Carlo',
    lastName: 'Bernardo',
    middleName: 'V.',
    role: 'Doctor',
    email: 'carlo.bernardo@clinicez.ph',
    phoneNumber: '0917-800-1122',
    prcLicenseNumber: '0129481',
    ptrNumber: 'PTR-9928172',
    philHealthPan: '1200-9876543-2',
    s2LicenseNumber: 'S2-8812-A',
    specialty: 'Internal Medicine',
    isActive: true,
    createdAt: '2026-10-01T00:00:00Z',
  };

  const setMockSession = (user: AuthUser, staffMember: StaffMember | null) => {
    (globalThis as any).__mockClinicContext = {
      facilityName: 'St. Luke Primary Care',
      planTier: 'Pro',
      clinicLogo: null,
    };
    (globalThis as any).__mockStaffContext = {
      staff: staffMember ? [staffMember] : [],
      current: staffMember,
      currentName: staffMember ? `${staffMember.title || ''} ${staffMember.firstName} ${staffMember.lastName}`.trim() : user.name,
      loading: false,
      error: null,
      reload: async () => {},
    };
    (globalThis as any).__mockAuthContext = {
      state: 'signedIn',
      user,
      permissions: user.permissions,
      offline: false,
      notice: null,
      login: async () => null,
      bootstrap: async () => null,
      changePassword: async () => null,
      completeUnlock: () => {},
      useDifferentAccount: async () => {},
      logout: async () => {},
      retry: () => {},
      can: () => true,
    };
  };

  beforeEach(() => {
    lastNavigateArgs = [];
    lastSetParamsArgs = null;
    mockRouteParams = {};
    pressHandlersByTestId.clear();
    setDeviceItem(THEME_MODE_STORAGE_KEY, 'light');
    setDeviceItem(USER_ACCENT_COLOR_STORAGE_KEY, null);
    syncActiveTheme({
      brandColorHex: DEFAULT_CLINIC_BRAND_COLOR,
      userBrandColorHex: null,
      scheme: 'light',
    });
    setActiveAudioPreferences({
      soundTheme: 'gentleBell',
      isMuted: false,
      themeMode: 'light',
      userBrandColorHex: null,
    });
    setMockSession(doctorUser, doctorStaff);
  });

  afterEach(() => {
    setDeviceItem(THEME_MODE_STORAGE_KEY, 'light');
    setDeviceItem(USER_ACCENT_COLOR_STORAGE_KEY, null);
    syncActiveTheme({
      brandColorHex: DEFAULT_CLINIC_BRAND_COLOR,
      userBrandColorHex: null,
      scheme: 'light',
    });
    delete (globalThis as any).__mockClinicContext;
    delete (globalThis as any).__mockStaffContext;
    delete (globalThis as any).__mockAuthContext;
  });

  describe('1. UserMenu Direct Profile Navigation & Plain-Language Label', () => {
    test('renders My Profile & Preferences copy, quick Dark Mode toggle, and zero unicode emojis', () => {
      const cardMarkup = renderToStaticMarkup(
        React.createElement(UserMenu, { variant: 'card', currentRoute: 'Dashboard' }),
      );
      expect(cardMarkup).toContain('Dr. Carlo Bernardo');
      expect(cardMarkup).toContain('My Profile &amp; Preferences');
      expect(cardMarkup).toContain('Switch to Dark Mode');
      expect(cardMarkup).not.toContain('Workstation Preferences');
      expect(cardMarkup).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    });

    test('renders compact mode tooltip with My Profile & Preferences, navigates to Profile on press, and toggles Dark Mode in one click', () => {
      const compactMarkup = renderToStaticMarkup(
        React.createElement(UserMenu, { compact: true, currentRoute: 'Profile' }),
      );
      expect(compactMarkup).toContain('My Profile &amp; Preferences');
      expect(compactMarkup).toContain('Switch to Dark Mode');
      expect(compactMarkup).toContain('aria-selected="true"');

      let customNavTarget = '';
      pressHandlersByTestId.clear();
      renderToStaticMarkup(
        React.createElement(UserMenu, {
          variant: 'card',
          onNavigate: (route: string) => {
            customNavTarget = route;
          },
        }),
      );
      const profileBtnCard = pressHandlersByTestId.get('user-menu-profile-button');
      expect(profileBtnCard).toBeDefined();
      profileBtnCard!();
      expect(customNavTarget).toBe('Profile');

      pressHandlersByTestId.clear();
      renderToStaticMarkup(React.createElement(UserMenu, { variant: 'pill' }));
      const profileBtnPill = pressHandlersByTestId.get('user-menu-profile-button');
      expect(profileBtnPill).toBeDefined();
      profileBtnPill!();
      expect(lastNavigateArgs).toEqual(['Profile']);

      // One-click quick toggle flips Dark Mode and updates UserMenu label to Switch to Light Mode
      const quickToggleBtn = pressHandlersByTestId.get('user-menu-theme-toggle');
      expect(quickToggleBtn).toBeDefined();
      quickToggleBtn!();
      expect(getDeviceItem(THEME_MODE_STORAGE_KEY)).toBe('dark');
      expect(getActiveThemeState().scheme).toBe('dark');

      const darkPillMarkup = renderToStaticMarkup(
        React.createElement(UserMenu, { variant: 'pill', currentRoute: 'Dashboard' }),
      );
      expect(darkPillMarkup).toContain('Switch to Light Mode');
    });
  });

  describe('2. Role-Aware Credential Visibility (`resolveProfileCredentialVisibility`)', () => {
    test('Doctor archetype shows full credentials tab, PRC requirement, PTR/PAN, S2, and Physician Stamp', () => {
      const vis = resolveProfileCredentialVisibility('Doctor', null);
      expect(vis.tier).toBe('physician');
      expect(vis.showCredentialsTab).toBe(true);
      expect(vis.isPhysician).toBe(true);
      expect(vis.requirePrc).toBe(true);
      expect(vis.showPtrAndPan).toBe(true);
      expect(vis.showS2).toBe(true);
      expect(vis.showPhysicianStamp).toBe(true);
      const tabs = getVisibleProfileTabs(vis);
      expect(tabs.find((t) => t.key === 'credentials')?.label).toBe('Licenses & Signature');
    });

    test('Nurse / Allied Health archetype shows streamlined Licenses tab without Physician Stamp or S2 clutter', () => {
      const nurseVis = resolveProfileCredentialVisibility('Nurse', null);
      expect(nurseVis.tier).toBe('allied');
      expect(nurseVis.showCredentialsTab).toBe(true);
      expect(nurseVis.isAlliedHealth).toBe(true);
      expect(nurseVis.showPrc).toBe(true);
      expect(nurseVis.requirePrc).toBe(false);
      expect(nurseVis.showS2).toBe(false);
      expect(nurseVis.showPhysicianStamp).toBe(false);
      const tabs = getVisibleProfileTabs(nurseVis);
      expect(tabs.find((t) => t.key === 'credentials')?.label).toBe('Licenses');
    });

    test('Receptionist, Cashier, and non-clinical Admin hide credentials tab by default', () => {
      for (const role of ['Receptionist', 'Cashier', 'Admin']) {
        const vis = resolveProfileCredentialVisibility(role, {});
        expect(vis.tier).toBe('hidden');
        expect(vis.showCredentialsTab).toBe(false);
        expect(vis.showPhysicianStamp).toBe(false);
        const tabs = getVisibleProfileTabs(vis);
        expect(tabs.map((t) => t.key)).toEqual(['profile', 'preferences', 'security']);
      }
    });

    test('Non-clinical staff with pre-existing saved PRC/PTR/PAN keeps Licenses tab visible without Physician Stamp', () => {
      const vis = resolveProfileCredentialVisibility('Admin', {
        prcLicenseNumber: '0098123',
        philHealthPan: '1200-5555555-1',
      });
      expect(vis.tier).toBe('saved_only');
      expect(vis.showCredentialsTab).toBe(true);
      expect(vis.showPrc).toBe(true);
      expect(vis.showPtrAndPan).toBe(true);
      expect(vis.showPhysicianStamp).toBe(false);
      expect(getVisibleProfileTabs(vis).find((t) => t.key === 'credentials')?.label).toBe('Licenses');
    });
  });

  describe('3. URL `?tab=` Sync & Single-Row `nowrap` Sub-Tabs', () => {
    test('resolves active tab from route params and web URLSearchParams fallback', () => {
      expect(resolveProfileTabIntent({ tab: 'preferences' }, null, true)).toBe('preferences');
      expect(resolveProfileTabIntent({ tab: 'security' }, null, true)).toBe('security');
      expect(resolveProfileTabIntent({}, '?tab=preferences', true)).toBe('preferences');
      expect(resolveProfileTabIntent(undefined, 'tab=credentials', true)).toBe('credentials');
      // Disallowed credentials tab for Receptionist falls back safely to profile
      expect(resolveProfileTabIntent({ tab: 'credentials' }, null, false)).toBe('profile');
      expect(resolveProfileTabIntent({ tab: 'unknown' }, null, true)).toBe('profile');
    });

    test('ProfileTabBar enforces single-row nowrap native scroll with zero chevron buttons and zero scrollTo bounce-back', async () => {
      const markup = renderToStaticMarkup(
        React.createElement(ProfileTabBar, {
          tabs: [...PROFILE_TAB_CATALOG],
          activeTab: 'preferences',
          onSelectTab: () => {},
        }),
      );
      expect(markup).toContain('&quot;flexWrap&quot;:&quot;nowrap&quot;');
      expect(markup).toContain('&quot;whiteSpace&quot;:&quot;nowrap&quot;');
      expect(markup).toContain('&quot;overscrollBehaviorX&quot;:&quot;none&quot;');
      expect(markup).not.toContain('Scroll profile tabs left');
      expect(markup).not.toContain('Scroll profile tabs right');
      expect(markup).toContain('Personal Info');
      expect(markup).toContain('Licenses &amp; Signature');
      expect(markup).toContain('Display &amp; Sound');
      expect(markup).toContain('Password &amp; Account');

      const fs = await import('fs');
      const path = await import('path');
      const tabBarSource = fs.readFileSync(
        path.resolve(__dirname, '../components/profile/ProfileTabBar.tsx'),
        'utf8',
      );
      expect(tabBarSource).toContain('bounces={false}');
      expect(tabBarSource).toContain('alwaysBounceHorizontal={false}');
      expect(tabBarSource).toContain('overScrollMode="never"');
      expect(tabBarSource).not.toContain('chevronLeft');
      expect(tabBarSource).not.toContain('chevronRight');
      expect(tabBarSource).not.toContain('scrollTo');
      expect(tabBarSource).not.toContain('scrollX');
    });

    test('Anti-flicker & anti-jitter (#84): lagging route params never snap activeTab backward, scrollbarGutter is stable, vertical scroll resets, and tab font-weight is constant', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const { clinicService } = await import('../services/clinicService');
      const origGetMyProfile = clinicService.getMyProfile;
      clinicService.getMyProfile = async () => [doctorStaff, null];

      try {
        setMockSession(doctorUser, doctorStaff);
        // Simulate starting at /profile?tab=profile where navigation.setParams lags behind by 1+ renders
        mockRouteParams = { tab: 'profile' };

        const stateSlots: any[] = [];
        const effectSlots: Array<{ fn: () => any; cleanup?: any; deps?: any[]; changed: boolean }> = [];
        const refSlots: Array<{ current: any }> = [];
        const memoSlots: Array<{ val: any; deps?: any[] }> = [];
        const callbackSlots: Array<{ fn: any; deps?: any[] }> = [];

        let slotIdx = 0;
        let effectIdx = 0;
        let refIdx = 0;
        let memoIdx = 0;
        let callbackIdx = 0;
        let isRendering = false;
        let queuedRender = false;
        let latestTree: any = null;
        const committedActiveTabs: string[] = [];
        const scrollToCalls: any[] = [];

        const depsChanged = (prevDeps?: any[], nextDeps?: any[]) => {
          if (!prevDeps || !nextDeps || prevDeps.length !== nextDeps.length) return true;
          return nextDeps.some((d, i) => !Object.is(d, prevDeps[i]));
        };

        const findElementByType = (node: any, targetType: any): any => {
          if (!node || typeof node !== 'object') return null;
          if (node.type === targetType) return node;
          const children = node.props?.children;
          if (Array.isArray(children)) {
            for (const child of children) {
              const found = findElementByType(child, targetType);
              if (found) return found;
            }
          } else if (children) {
            return findElementByType(children, targetType);
          }
          return null;
        };

        const dispatcher = {
          useState: (initial: any) => {
            const idx = slotIdx++;
            if (stateSlots.length <= idx) {
              stateSlots.push(typeof initial === 'function' ? initial() : initial);
            }
            const setter = (updater: any) => {
              const nextVal = typeof updater === 'function' ? updater(stateSlots[idx]) : updater;
              if (!Object.is(stateSlots[idx], nextVal)) {
                stateSlots[idx] = nextVal;
                if (isRendering) {
                  queuedRender = true;
                } else {
                  flushRenderAndEffects();
                }
              }
            };
            return [stateSlots[idx], setter];
          },
          useRef: (initial: any) => {
            const idx = refIdx++;
            if (refSlots.length <= idx) {
              refSlots.push({ current: initial });
            }
            return refSlots[idx];
          },
          useMemo: (factory: () => any, deps?: any[]) => {
            const idx = memoIdx++;
            const prev = memoSlots[idx];
            if (!prev || depsChanged(prev.deps, deps)) {
              memoSlots[idx] = { val: factory(), deps };
            }
            return memoSlots[idx].val;
          },
          useCallback: (fn: any, deps?: any[]) => {
            const idx = callbackIdx++;
            const prev = callbackSlots[idx];
            if (!prev || depsChanged(prev.deps, deps)) {
              callbackSlots[idx] = { fn, deps };
            }
            return callbackSlots[idx].fn;
          },
          useEffect: (fn: () => any, deps?: any[]) => {
            const idx = effectIdx++;
            const prev = effectSlots[idx];
            const changed = !prev || depsChanged(prev.deps, deps);
            effectSlots[idx] = { fn, deps, changed, cleanup: prev?.cleanup };
          },
          useContext: (ctx: any) => ctx?._currentValue ?? ctx?._currentValue2 ?? null,
        };

        const flushRenderAndEffects = () => {
          do {
            queuedRender = false;
            isRendering = true;
            slotIdx = 0;
            effectIdx = 0;
            refIdx = 0;
            memoIdx = 0;
            callbackIdx = 0;

            const internals = (React as any)
              .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
            const prevDispatcher = internals ? internals.H : null;
            if (internals) internals.H = dispatcher;
            try {
              latestTree = (ProfileScreen as any)({});
            } finally {
              if (internals) internals.H = prevDispatcher;
              isRendering = false;
            }

            const tabBarEl = findElementByType(latestTree, ProfileTabBar);
            if (tabBarEl?.props?.activeTab) {
              committedActiveTabs.push(tabBarEl.props.activeTab);
            }
          } while (queuedRender);

          for (const eff of effectSlots) {
            if (eff.changed) {
              eff.changed = false;
              if (typeof eff.cleanup === 'function') eff.cleanup();
              eff.cleanup = eff.fn();
            }
          }
        };

        // 1. Initial mount at ?tab=profile with mock window.sessionStorage
        const prevWindow = (globalThis as any).window;
        const sessionMap = new Map<string, string>();
        (globalThis as any).window = {
          ...(prevWindow ?? {}),
          sessionStorage: {
            getItem: (k: string) => (sessionMap.has(k) ? sessionMap.get(k)! : null),
            setItem: (k: string, v: string) => {
              sessionMap.set(k, String(v));
            },
            removeItem: (k: string) => {
              sessionMap.delete(k);
            },
          },
        };

        try {
          flushRenderAndEffects();
          expect(committedActiveTabs).toEqual(['profile']);

          // Wire mock scrollTo onto the outer ScrollView ref to verify scroll reset & persistence
          const scrollViewChildren = latestTree?.props?.children;
          const scrollRef = scrollViewChildren?.props?.ref;
          expect(scrollViewChildren?.props?.scrollEventThrottle).toBe(100);
          expect(typeof scrollViewChildren?.props?.onScroll).toBe('function');
          expect(typeof scrollViewChildren?.props?.onContentSizeChange).toBe('function');
          if (scrollRef && typeof scrollRef === 'object') {
            scrollRef.current = {
              scrollTo: (opts: any) => scrollToCalls.push(opts),
            };
          }

          // 2. Click Display & Sound ('preferences') while mockRouteParams.tab STILL lags at 'profile'
          let tabBarEl = findElementByType(latestTree, ProfileTabBar);
          tabBarEl.props.onSelectTab('preferences');
          expect(lastSetParamsArgs).toEqual({ tab: 'preferences' });
          expect(committedActiveTabs).toEqual(['profile', 'preferences']);
          expect(scrollToCalls).toEqual([{ y: 0, animated: false }]);
          expect(sessionMap.get('clinicez.scroll.profile.preferences')).toBe('0');

          // User scrolls down on Display & Sound -> persisted in sessionStorage (#91)
          latestTree?.props?.children?.props?.onScroll?.({
            nativeEvent: { contentOffset: { y: 340 } },
          });
          expect(sessionMap.get('clinicez.scroll.profile.preferences')).toBe('340');

          // 3. Click Password & Account ('security') while mockRouteParams.tab STILL lags at 'profile'
          tabBarEl = findElementByType(latestTree, ProfileTabBar);
          tabBarEl.props.onSelectTab('security');
          expect(lastSetParamsArgs).toEqual({ tab: 'security' });
          expect(committedActiveTabs).toEqual(['profile', 'preferences', 'security']);
          expect(scrollToCalls.length).toBe(2);
          expect(sessionMap.get('clinicez.scroll.profile.security')).toBe('0');

          // 4. Route params finally catch up to 'security' on a subsequent render — zero extra flicker
          mockRouteParams = { tab: 'security' };
          flushRenderAndEffects();
          tabBarEl = findElementByType(latestTree, ProfileTabBar);
          expect(tabBarEl.props.activeTab).toBe('security');

          // 5. Genuine external navigation (e.g. Cmd+K search palette -> ?tab=profile) updates activeTab cleanly
          mockRouteParams = { tab: 'profile' };
          flushRenderAndEffects();
          tabBarEl = findElementByType(latestTree, ProfileTabBar);
          expect(tabBarEl.props.activeTab).toBe('profile');

          for (const eff of effectSlots) {
            if (typeof eff.cleanup === 'function') eff.cleanup();
          }
        } finally {
          if (prevWindow === undefined) {
            delete (globalThis as any).window;
          } else {
            (globalThis as any).window = prevWindow;
          }
        }
      } finally {
        clinicService.getMyProfile = origGetMyProfile;
      }

      // Verify scrollbarGutter: 'stable' + usePersistedScrollPosition wiring on Profile.screen.tsx
      const screenSource = fs.readFileSync(
        path.resolve(__dirname, '../navigation/screens/Profile.screen.tsx'),
        'utf8',
      );
      expect(screenSource).toContain("scrollbarGutter: 'stable'");
      expect(screenSource).toContain('usePersistedScrollPosition');
      expect(screenSource).toContain('clinicez.scroll.profile.${activeTab}');
      expect(screenSource).toContain('ready: !showProfileSkeletons');
      expect(screenSource).toContain('scrollEventThrottle={100}');
      const screenMarkup = renderToStaticMarkup(React.createElement(ProfileScreen));
      expect(screenMarkup).toContain('&quot;scrollbarGutter&quot;:&quot;stable&quot;');

      // Verify constant fontWeight ('smallBold' / '600') on ProfileTabBar labels so width never jitters
      const tabBarSource = fs.readFileSync(
        path.resolve(__dirname, '../components/profile/ProfileTabBar.tsx'),
        'utf8',
      );
      expect(tabBarSource).toContain('variant="smallBold"');
      expect(tabBarSource).not.toContain("isActive ? 'smallBold' : 'small'");
    });
  });

  describe('4. Tab-Specific Rendering, Plain-Language Copy & Persistent Sign Out Footer', () => {
    test('Tab 1 (`profile`) hides Save/Discard when clean and renders Save Profile + dirty bar only when modified', () => {
      const baseContactProps = {
        title: 'Dr.',
        firstName: 'Carlo',
        middleName: 'V.',
        lastName: 'Bernardo',
        accountEmail: 'carlo.bernardo@clinicez.ph',
        phone: '0917-800-1122',
        specialty: 'Cardiology',
        isPhysician: true,
        saving: false,
        offline: false,
        onChangeTitle: () => {},
        onChangeFirstName: () => {},
        onChangeMiddleName: () => {},
        onChangeLastName: () => {},
        onChangePhone: () => {},
        onChangeSpecialty: () => {},
        onSave: () => {},
        onReset: () => {},
      };

      const cleanContactMarkup = renderToStaticMarkup(
        React.createElement(ProfileContactTab, {
          ...baseContactProps,
          isDirty: false,
        }),
      );
      expect(cleanContactMarkup).toContain('Personal Information');
      expect(cleanContactMarkup).not.toContain('Save Profile');
      expect(cleanContactMarkup).not.toContain('Discard');
      expect(cleanContactMarkup).not.toContain('Unsaved Changes');

      const dirtyContactMarkup = renderToStaticMarkup(
        React.createElement(ProfileContactTab, {
          ...baseContactProps,
          isDirty: true,
        }),
      );
      expect(dirtyContactMarkup).toContain('Personal Information');
      expect(dirtyContactMarkup).toContain('Unsaved Changes');
      expect(dirtyContactMarkup).toContain('Save Profile');
      expect(dirtyContactMarkup).toContain('Discard');
    });

    test('Receptionist rendering ProfileScreen hides Credentials tab and never renders Prescription Stamp', () => {
      const receptionistUser: AuthUser = {
        ...doctorUser,
        id: 'staff-rec-01',
        name: 'Ana Lopez',
        email: 'ana.lopez@clinicez.ph',
        role: 'Receptionist',
        roleName: 'Front Desk Receptionist',
      };
      const receptionistStaff: StaffMember = {
        id: 'staff-rec-01',
        tenantId: 'tenant-main',
        clinicId: 'clinic-main',
        roleName: 'Front Desk Receptionist',
        firstName: 'Ana',
        lastName: 'Lopez',
        role: 'Receptionist',
        email: 'ana.lopez@clinicez.ph',
        isActive: true,
        createdAt: '2026-10-01T00:00:00Z',
      };
      setMockSession(receptionistUser, receptionistStaff);

      const markup = renderToStaticMarkup(React.createElement(ProfileScreen));
      expect(markup).toContain('Ana Lopez');
      expect(markup).toContain('Front Desk Receptionist');
      expect(markup).not.toContain('Licenses &amp; Signature');
      expect(markup).not.toContain('Prescription Stamp &amp; Signature');
      expect(markup).not.toContain('Required for Prescriptions');
      expect(markup).toContain('Signed-In Account');
      expect(markup).toContain('Sign Out');
    });

    test('Nurse rendering Credentials tab sees streamlined PRC card without Prescription Stamp or PDEA S2, Doctor sees Prescription Stamp & Signature without Specimen jargon, and Save buttons appear only when dirty', () => {
      const nurseVis = resolveProfileCredentialVisibility('Nurse', null);
      const baseNurseProps = {
        visibility: nurseVis,
        title: 'RN',
        firstName: 'Maria',
        lastName: 'Santos',
        specialty: 'Triage Nursing',
        prc: '0991122',
        ptr: '',
        pan: '',
        s2: '',
        signatureSpecimen: null,
        defaultSignatureMode: 'ESignatureSpecimen' as const,
        saving: false,
        offline: false,
        onChangePrc: () => {},
        onChangePtr: () => {},
        onChangePan: () => {},
        onChangeS2: () => {},
        onChangeSignature: () => {},
        onChangeSignatureMode: () => {},
        onSave: () => {},
        onReset: () => {},
      };

      const cleanNurseMarkup = renderToStaticMarkup(
        React.createElement(ProfileCredentialsTab, {
          ...baseNurseProps,
          isDirty: false,
        }),
      );
      expect(cleanNurseMarkup).toContain('Professional License');
      expect(cleanNurseMarkup).toContain('PRC / Professional License Number');
      expect(cleanNurseMarkup).not.toContain('Save Licenses');
      expect(cleanNurseMarkup).not.toContain('Discard');
      expect(cleanNurseMarkup).not.toContain('Prescription Stamp &amp; Signature');
      expect(cleanNurseMarkup).not.toContain('PDEA S2');

      const dirtyNurseMarkup = renderToStaticMarkup(
        React.createElement(ProfileCredentialsTab, {
          ...baseNurseProps,
          isDirty: true,
        }),
      );
      expect(dirtyNurseMarkup).toContain('Save Licenses');
      expect(dirtyNurseMarkup).toContain('Discard');

      const docMarkup = renderToStaticMarkup(
        React.createElement(ProfileScreen, { route: { params: { tab: 'credentials' } } }),
      );
      expect(docMarkup).toContain('Prescription Stamp &amp; Signature');
      expect(docMarkup).not.toContain('Save Licenses &amp; Signature');
      expect(docMarkup).not.toContain('Save Profile');
      expect(docMarkup).not.toContain('Specimen');
      expect(docMarkup).not.toContain('specimen');

      const dirtyStampMarkup = renderToStaticMarkup(
        React.createElement(PhysicianStampSpecimenCard, {
          title: 'Dr.',
          firstName: 'Carlo',
          lastName: 'Bernardo',
          specialty: 'Internal Medicine',
          prc: '0129481',
          ptr: 'PTR-9928172',
          s2: 'S2-8812-A',
          signatureSpecimen: null,
          defaultSignatureMode: 'ESignatureSpecimen',
          isDirty: true,
          saving: false,
          offline: false,
          onChangeSignature: () => {},
          onChangeSignatureMode: () => {},
          onSave: () => {},
          onReset: () => {},
        }),
      );
      expect(dirtyStampMarkup).toContain('Save Licenses &amp; Signature');
      expect(dirtyStampMarkup).toContain('Discard');
    });

    test('Tab 3 (`preferences`) renders Appearance, Text Size & Screen Layout with Color Theme & Dark Mode, Screen Spacing, How Patient Charts Open, Notification Sounds + Saved/Try Again states', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ProfileScreen, { route: { params: { tab: 'preferences' } } }),
      );
      expect(markup).toContain('Appearance, Text Size &amp; Screen Layout');
      expect(markup).toContain(
        'Choose light or dark mode, adjust text size and spacing, and pick how patient charts open',
      );
      expect(markup).toContain('COLOR THEME &amp; DARK MODE');
      expect(markup).toContain('Dark Mode');
      expect(markup).toContain('Light');
      expect(markup).toContain('Dark');
      expect(markup).toContain('Match Device');
      expect(markup).toContain('Light Mode');
      expect(markup).toContain('SCREEN SPACING');
      expect(markup).toContain('Standard (100%)');
      expect(markup).toContain('Compact (85%)');
      expect(markup).toContain('Ultra Compact (70%)');
      expect(markup).toContain('HOW PATIENT CHARTS OPEN');
      expect(markup).toContain('Use Clinic Default');
      expect(markup).toContain('Side-by-Side');
      expect(markup).toContain('Pop-up Window');
      expect(markup).toContain('Side Panel');
      expect(markup).toContain('SAMPLE PREVIEW');
      expect(markup).toContain('Notification Sounds');
      expect(markup).toContain('Choose alert sounds for patient queue calls and messages.');
      expect(markup).toContain('Test Sound');
      expect(markup).toContain('Saved');
      expect(markup).toContain('Signed-In Account');
      expect(markup).toContain('Sign Out');
      expect(markup).not.toContain('UI Layout Density');
      expect(markup).not.toContain('Ergonomics');
      expect(markup).not.toContain('Specimen');
      expect(markup).not.toContain('triage call chimes');
      expect(markup).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);

      // Verify fallback Try Again button when syncState === 'error'
      const errorPrefsMarkup = renderToStaticMarkup(
        React.createElement(ProfilePreferencesTab, {
          density: 'standard',
          scale: 1,
          textPreset: 'standard',
          personalChartLayout: 'split',
          soundTheme: 'gentleBell',
          isAlertMuted: false,
          customAudioDataUri: null,
          customAudioFileName: null,
          audioUploadError: null,
          syncState: 'error',
          syncErrorMessage: 'Network timeout saving preferences.',
          onSelectDensity: () => {},
          onSelectTextPreset: () => {},
          onStepScaleDown: () => {},
          onStepScaleUp: () => {},
          onSelectChartLayout: () => {},
          onToggleAlertMute: () => {},
          onSelectSoundTheme: () => {},
          onPreviewTone: () => {},
          onSelectCustomAudio: () => {},
          onRetrySync: () => {},
        }),
      );
      expect(errorPrefsMarkup).toContain('Save Failed');
      expect(errorPrefsMarkup).toContain('Try Again');
      expect(errorPrefsMarkup).toContain('Network timeout saving preferences.');
    });

    test('Tab 4 (`security`) renders Change Password + Server Connection without Web Offline PIN/OTA stubs, hides Update Password until typed, and renders Persistent Sign Out Footer', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ProfileScreen, { route: { params: { tab: 'security' } } }),
      );
      expect(markup).toContain('Change Password');
      expect(markup).not.toContain('Update Password');
      expect(markup).toContain('Server Connection');
      expect(markup).toContain('Signed-In Account');
      expect(markup).toContain('Sign Out');
      expect(markup).not.toContain('Workstation Password');
      expect(markup).not.toContain('Active Server Node');
      expect(markup).not.toContain('Session Transport');
      expect(markup).not.toContain('Offline PIN');
      expect(markup).not.toContain('Biometric');
      expect(markup).not.toContain('App Updates');
      expect(markup).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);

      const dirtySecurityMarkup = renderToStaticMarkup(
        React.createElement(ProfileSecurityTab, {
          currentPassword: 'old-password-123',
          newPassword: '',
          confirmPassword: '',
          savingPassword: false,
          passwordError: null,
          offline: false,
          serverLabel: 'St. Luke Cloud Node',
          serverUrl: 'https://api.clinicez.ph',
          facilityName: 'St. Luke Primary Care',
          planTier: 'Pro',
          onChangeCurrentPassword: () => {},
          onChangeNewPassword: () => {},
          onChangeConfirmPassword: () => {},
          onUpdatePassword: () => {},
        }),
      );
      expect(dirtySecurityMarkup).toContain('Update Password');
    });

    test('Profile screen and all sub-tab containers stretch fluidly to 100% canvas width with zero maxWidth 960 caps', async () => {
      const fs = await import('fs');
      const path = await import('path');

      const screenSource = fs.readFileSync(
        path.resolve(__dirname, '../navigation/screens/Profile.screen.tsx'),
        'utf8',
      );
      expect(screenSource).not.toMatch(/maxWidth\s*:\s*960/);
      expect(screenSource).toContain("width: '100%'");
      expect(screenSource).toContain("alignSelf: 'stretch'");

      const profileDir = path.resolve(__dirname, '../components/profile');
      const componentFiles = fs.readdirSync(profileDir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));
      expect(componentFiles.length).toBeGreaterThanOrEqual(8);

      for (const file of componentFiles) {
        const src = fs.readFileSync(path.join(profileDir, file), 'utf8');
        expect(src).not.toMatch(/maxWidth\s*:\s*960/);
      }

      const markup = renderToStaticMarkup(React.createElement(ProfileScreen));
      expect(markup).toContain('&quot;width&quot;:&quot;100%&quot;');
      expect(markup).toContain('&quot;alignSelf&quot;:&quot;stretch&quot;');
      expect(markup).not.toContain('&quot;maxWidth&quot;:960');
    });
  });

  describe('5. Skeleton Loading States & Zero Hardcoded Fallback Values', () => {
    test('UserMenu renders Skeleton bars while auth/staff identity is loading instead of hardcoded Staff/User text', () => {
      (globalThis as any).__mockAuthContext = {
        ...defaultAuthMock,
        state: 'booting',
        user: null,
      };
      (globalThis as any).__mockStaffContext = {
        staff: [],
        current: null,
        currentName: '',
        loading: true,
        error: null,
        reload: async () => {},
      };

      const loadingCardMarkup = renderToStaticMarkup(
        React.createElement(UserMenu, { variant: 'card', currentRoute: 'Dashboard' }),
      );
      expect(loadingCardMarkup).toContain('role="progressbar"');
      expect(loadingCardMarkup).not.toContain('Staff');
      expect(loadingCardMarkup).not.toContain('?');
    });

    test('ProfileScreen renders Skeleton loaders across tabs while staff/clinic data is loading and never flashes Clinic EZ, Local Clinic Server, or DR. FIRST LAST', () => {
      (globalThis as any).__mockClinicContext = {
        facilityName: '',
        planTier: '',
        clinicLogo: null,
        loading: true,
      };
      (globalThis as any).__mockStaffContext = {
        staff: [],
        current: null,
        currentName: '',
        loading: true,
        error: null,
        reload: async () => {},
      };
      (globalThis as any).__mockAuthContext = {
        ...defaultAuthMock,
        state: 'signedIn',
        user: {
          ...doctorUser,
          name: '',
          clinicName: undefined,
        },
        permissions: doctorUser.permissions,
      };

      for (const tab of ['profile', 'credentials', 'preferences', 'security'] as const) {
        const fullMarkup = renderToStaticMarkup(
          React.createElement(ProfileScreen, { route: { params: { tab } } }),
        );
        // Slice after the page header so we inspect the Profile screen body (excluding the app Sidebar logo wordmark)
        const profileCanvasMarkup = fullMarkup.split('My Profile &amp; Preferences').slice(-1)[0];
        expect(profileCanvasMarkup).toContain('role="progressbar"');
        expect(profileCanvasMarkup).not.toContain('Clinic EZ');
        expect(profileCanvasMarkup).not.toContain('Local Clinic Server');
        expect(profileCanvasMarkup).not.toContain('DR. FIRST LAST');
      }
    });

    test('Source audit confirms zero hardcoded Clinic EZ, Local Clinic Server, Dr. injection, or fake sample placeholders across UserMenu and Profile modules', async () => {
      const fs = await import('fs');
      const path = await import('path');

      const filesToAudit = [
        path.resolve(__dirname, '../components/layout/UserMenu.tsx'),
        path.resolve(__dirname, '../navigation/screens/Profile.screen.tsx'),
        ...fs
          .readdirSync(path.resolve(__dirname, '../components/profile'))
          .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
          .map((f) => path.resolve(__dirname, '../components/profile', f)),
      ];

      for (const filePath of filesToAudit) {
        const src = fs.readFileSync(filePath, 'utf8');
        expect(src).not.toContain("|| 'Clinic EZ'");
        expect(src).not.toContain("|| 'Local Clinic Server'");
        expect(src).not.toContain('Clinic EZ Workstation');
        expect(src).not.toContain("user?.role === 'Doctor' ? 'Dr.'");
        expect(src).not.toContain("user.role === 'Doctor' ? 'Dr.'");
        expect(src).not.toContain('staff@clinic.com');
        expect(src).not.toContain('0917-123-4567');
        expect(src).not.toContain('0108924');
        expect(src).not.toContain('8941203');
        expect(src).not.toContain('1200-9876543-2');
        expect(src).not.toContain('0918-99214-A1');
      }
    });
  });

  describe('6. ThemeModeContext, Dark Mode Appearance Controls & Brand Token Coverage', () => {
    test('THEME_MODE_OPTIONS defines Light (sun), Dark (moon), and Match Device (monitor) and syncs active theme scheme', () => {
      expect(THEME_MODE_OPTIONS.map((o) => ({ mode: o.mode, label: o.label, icon: o.icon }))).toEqual([
        { mode: 'light', label: 'Light', icon: 'sun' },
        { mode: 'dark', label: 'Dark', icon: 'moon' },
        { mode: 'system', label: 'Match Device', icon: 'monitor' },
      ]);

      expect(resolveEffectiveColorScheme('light', 'dark')).toBe('light');
      expect(resolveEffectiveColorScheme('dark', 'light')).toBe('dark');
      expect(resolveEffectiveColorScheme('system', 'dark')).toBe('dark');
      expect(resolveEffectiveColorScheme('system', 'light')).toBe('light');

      let capturedCtx: ReturnType<typeof useThemeMode> | null = null;
      function Probe() {
        capturedCtx = useThemeMode();
        return React.createElement('span', null, `${capturedCtx.themeMode}:${capturedCtx.colorScheme}`);
      }

      setDeviceItem(THEME_MODE_STORAGE_KEY, 'dark');
      const html = renderToStaticMarkup(
        React.createElement(ThemeModeProvider, { children: React.createElement(Probe) }),
      );
      expect(html).toContain('dark:dark');
      expect(getActiveThemeState().scheme).toBe('dark');
      expect(capturedCtx?.isDark).toBe(true);
    });

    test('ProfilePreferencesTab reflects Dark Mode and Match Device badges in Sample Preview and ProfileTabBar exposes dark/light/appearance search keywords + brand tokens', async () => {
      const fs = await import('fs');
      const path = await import('path');

      const darkPrefsMarkup = renderToStaticMarkup(
        React.createElement(ProfilePreferencesTab, {
          density: 'standard',
          scale: 1,
          textPreset: 'standard',
          personalChartLayout: 'default',
          themeMode: 'dark',
          isDark: true,
          soundTheme: 'gentleBell',
          isAlertMuted: false,
          customAudioDataUri: null,
          customAudioFileName: null,
          audioUploadError: null,
          syncState: 'synced',
          onSelectThemeMode: () => {},
          onSelectDensity: () => {},
          onSelectTextPreset: () => {},
          onStepScaleDown: () => {},
          onStepScaleUp: () => {},
          onSelectChartLayout: () => {},
          onToggleAlertMute: () => {},
          onSelectSoundTheme: () => {},
          onPreviewTone: () => {},
          onSelectCustomAudio: () => {},
          onRetrySync: () => {},
        }),
      );
      expect(darkPrefsMarkup).toContain('Dark Mode');
      expect(darkPrefsMarkup).toContain('On');

      const prefsCatalogEntry = PROFILE_TAB_CATALOG.find((t) => t.key === 'preferences');
      expect(prefsCatalogEntry?.keywords).toContain('dark mode');
      expect(prefsCatalogEntry?.keywords).toContain('light mode');
      expect(prefsCatalogEntry?.keywords).toContain('theme');
      expect(prefsCatalogEntry?.keywords).toContain('appearance');

      const tabBarSource = fs.readFileSync(
        path.resolve(__dirname, '../components/profile/ProfileTabBar.tsx'),
        'utf8',
      );
      expect(tabBarSource).toContain('theme.colors.primary');
      expect(tabBarSource).toContain('theme.colors.primarySubtle');
      expect(tabBarSource).toContain('theme.colors.primaryBorder');
      expect(tabBarSource).toContain('dark mode');
      expect(tabBarSource).toContain('light mode');
      expect(tabBarSource).toContain('appearance');
    });
  });

  describe('7. Personal Accent Color Override (#54) & Brand-Tinted Shadows (#60)', () => {
    test('Personal Accent Color renders presets, validates custom color contrast, selects/resets overrides, and persists to deviceStorage + preferencesJson', () => {
      const clinicSkyHex = BRAND_COLOR_PRESETS[1].color;
      const personalRosePreset = BRAND_COLOR_PRESETS[4];
      const personalIndigoPreset = BRAND_COLOR_PRESETS[3];

      // 1. Validate custom hex contrast rules
      const validWithoutHash = validatePersonalAccentHex(personalIndigoPreset.color.slice(1));
      expect(validWithoutHash).toEqual({ valid: true, hex: personalIndigoPreset.color });

      const invalidSyntax = validatePersonalAccentHex('not-a-color');
      expect(invalidSyntax.valid).toBe(false);

      const lowContrastNearWhite = validatePersonalAccentHex(['#', 'FFFFFE'].join(''));
      expect(lowContrastNearWhite.valid).toBe(false);
      if (!lowContrastNearWhite.valid) {
        expect(lowContrastNearWhite.error).toContain('contrast');
      }

      // 2. Default state ("Using Clinic Color") hides reset button and lists all presets
      pressHandlersByTestId.clear();
      const defaultAccentMarkup = renderToStaticMarkup(
        React.createElement(ProfilePreferencesTab, {
          density: 'standard',
          scale: 1,
          textPreset: 'standard',
          personalChartLayout: 'default',
          themeMode: 'light',
          isDark: false,
          userBrandColorHex: null,
          clinicPrimaryColorHex: clinicSkyHex,
          soundTheme: 'gentleBell',
          isAlertMuted: false,
          customAudioDataUri: null,
          customAudioFileName: null,
          audioUploadError: null,
          syncState: 'synced',
          onSelectDensity: () => {},
          onSelectTextPreset: () => {},
          onStepScaleDown: () => {},
          onStepScaleUp: () => {},
          onSelectChartLayout: () => {},
          onToggleAlertMute: () => {},
          onSelectSoundTheme: () => {},
          onPreviewTone: () => {},
          onSelectCustomAudio: () => {},
          onRetrySync: () => {},
        }),
      );
      expect(defaultAccentMarkup).toContain('PERSONAL ACCENT COLOR');
      expect(defaultAccentMarkup).toContain('Personal Accent Color');
      expect(defaultAccentMarkup).toContain('Using Clinic Color');
      expect(defaultAccentMarkup).toContain('Custom Color Code');
      expect(defaultAccentMarkup).toContain('Apply Custom Color');
      expect(pressHandlersByTestId.has('reset-user-accent-color')).toBe(false);
      for (const preset of BRAND_COLOR_PRESETS) {
        expect(defaultAccentMarkup).toContain(preset.label);
        expect(pressHandlersByTestId.has(`user-accent-preset-${preset.color}`)).toBe(true);
      }

      // 3. Active Personal Color state renders "Personal Color Active" + "Use Clinic Default" reset button
      let selectedColorEvents: Array<{ hex: string | null; label?: string }> = [];
      pressHandlersByTestId.clear();
      const activeAccentMarkup = renderToStaticMarkup(
        React.createElement(ProfilePreferencesTab, {
          density: 'standard',
          scale: 1,
          textPreset: 'standard',
          personalChartLayout: 'default',
          themeMode: 'light',
          isDark: false,
          userBrandColorHex: personalRosePreset.color,
          clinicPrimaryColorHex: clinicSkyHex,
          soundTheme: 'gentleBell',
          isAlertMuted: false,
          customAudioDataUri: null,
          customAudioFileName: null,
          audioUploadError: null,
          syncState: 'synced',
          onSelectUserBrandColor: (hex, label) => {
            selectedColorEvents.push({ hex, label });
          },
          onSelectDensity: () => {},
          onSelectTextPreset: () => {},
          onStepScaleDown: () => {},
          onStepScaleUp: () => {},
          onSelectChartLayout: () => {},
          onToggleAlertMute: () => {},
          onSelectSoundTheme: () => {},
          onPreviewTone: () => {},
          onSelectCustomAudio: () => {},
          onRetrySync: () => {},
        }),
      );
      expect(activeAccentMarkup).toContain('Personal Color Active');
      expect(activeAccentMarkup).toContain('Personal Color');
      expect(pressHandlersByTestId.has('reset-user-accent-color')).toBe(true);

      pressHandlersByTestId.get(`user-accent-preset-${personalIndigoPreset.color}`)?.();
      pressHandlersByTestId.get('reset-user-accent-color')?.();
      expect(selectedColorEvents).toEqual([
        { hex: personalIndigoPreset.color, label: personalIndigoPreset.label },
        { hex: null, label: 'Clinic Default' },
      ]);

      // 4. Verify syncActiveTheme precedence, hue-matched shadow updates, deviceStorage & preferencesJson serialization
      syncActiveTheme({ brandColorHex: clinicSkyHex, userBrandColorHex: null, scheme: 'light' });
      expect(getActiveThemeState().brandColorHex).toBe(clinicSkyHex);
      expect(getActiveThemeState().userBrandColorHex).toBeNull();
      expect(getActiveThemeState().resolvedColors.primaryShadowSubtle).toBe(
        deriveBrandPalette(clinicSkyHex, 'light').primaryShadowSubtle,
      );

      setDeviceItem(USER_ACCENT_COLOR_STORAGE_KEY, personalRosePreset.color);
      renderToStaticMarkup(
        React.createElement(ThemeModeProvider, { children: React.createElement('div') }),
      );
      expect(getDeviceItem(USER_ACCENT_COLOR_STORAGE_KEY)).toBe(personalRosePreset.color);
      expect(getActiveThemeState().brandColorHex).toBe(personalRosePreset.color);
      expect(getActiveThemeState().clinicBrandColorHex).toBe(clinicSkyHex);
      expect(getActiveThemeState().userBrandColorHex).toBe(personalRosePreset.color);
      expect(getActiveThemeState().resolvedColors.primaryShadowSubtle).toBe(
        deriveBrandPalette(personalRosePreset.color, 'light').primaryShadowSubtle,
      );
      expect(getActiveThemeState().resolvedColors.primaryShadowSm).toBe(
        deriveBrandPalette(personalRosePreset.color, 'light').primaryShadowSm,
      );

      const serialized = serializeAudioPreferences({
        soundTheme: 'gentleBell',
        isMuted: false,
        themeMode: 'dark',
        userBrandColorHex: personalRosePreset.color,
      });
      expect(JSON.parse(serialized).userBrandColorHex).toBe(personalRosePreset.color);

      // Resetting userBrandColorHex to null restores clinic brand color & shadows immediately
      syncActiveTheme({ userBrandColorHex: null });
      expect(getActiveThemeState().brandColorHex).toBe(clinicSkyHex);
      expect(getActiveThemeState().userBrandColorHex).toBeNull();
      expect(getActiveThemeState().resolvedColors.primaryShadowSubtle).toBe(
        deriveBrandPalette(clinicSkyHex, 'light').primaryShadowSubtle,
      );
    });

    test('Active Profile tabs, active tiles, navigation items, and ClinicHeaderBar apply brand-tinted tokens & shadows (#60 & #72)', async () => {
      const fs = await import('fs');
      const path = await import('path');

      const prefsCatalogEntry = PROFILE_TAB_CATALOG.find((t) => t.key === 'preferences');
      for (const kw of ['color', 'accent', 'branding', 'palette']) {
        expect(prefsCatalogEntry?.keywords).toContain(kw);
      }

      const shadowTargetFiles = [
        '../components/profile/ProfileTabBar.tsx',
        '../components/profile/DisplayErgonomicsCard.tsx',
        '../components/profile/AlertChimesCard.tsx',
        '../components/layout/UserMenu.tsx',
        '../components/layout/WorkstationSidebar.tsx',
        '../components/layout/MobileBottomTabBar.tsx',
        '../components/layout/ClinicHeaderBar.tsx',
        '../components/consultation/PlanManagementCard.tsx',
        '../components/PhilHealthProfileModal.tsx',
      ];
      for (const rel of shadowTargetFiles) {
        const src = fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
        expect(src).toContain('theme.shadows.brandSubtle');
      }

      // Verify ClinicHeaderBar (#72): subscribes to subscribeActiveTheme, tints Header Title ONLY (not subtitle),
      // and tints Search Bar + Message & Bell icons with brand shadows
      const headerSrc = fs.readFileSync(
        path.resolve(__dirname, '../components/layout/ClinicHeaderBar.tsx'),
        'utf8',
      );
      expect(headerSrc).toContain('subscribeActiveTheme');
      expect(headerSrc).toContain('theme.shadows.brandSm');
      expect(headerSrc).toContain('theme.shadows.dangerSm');

      // Verify DisplayErgonomicsCard (#81): Custom Color Code label sits above customColorRow,
      // customColorRow uses alignItems: 'center', Apply Custom Color uses size="md" matching Input height,
      // and helper/error text sits below customColorRow
      const ergonomicsSrc = fs.readFileSync(
        path.resolve(__dirname, '../components/profile/DisplayErgonomicsCard.tsx'),
        'utf8',
      );
      expect(ergonomicsSrc).toMatch(/customColorRow:\s*\{[^}]*alignItems:\s*'center'/);
      expect(ergonomicsSrc).toMatch(
        /title="Apply Custom Color"[\s\S]{0,120}variant="secondary"[\s\S]{0,60}size="md"/,
      );
      expect(ergonomicsSrc).not.toMatch(/<Input[\s\S]{0,120}label="Custom Color Code"/);

      const rosePreset = BRAND_COLOR_PRESETS[4];
      syncActiveTheme({ userBrandColorHex: rosePreset.color, scheme: 'light' });
      const headerMarkup = renderToStaticMarkup(
        React.createElement(ClinicHeaderBar, {
          title: 'My Profile & Preferences',
          subtitle: 'Subtitle stays neutral',
          onOpenSearch: () => {},
        }),
      );
      expect(headerMarkup).toContain('My Profile &amp; Preferences');
      expect(headerMarkup).toContain('Subtitle stays neutral');
      expect(headerMarkup).toContain('Search records...');
      expect(headerMarkup).toContain(rosePreset.color);
      expect(headerMarkup).toContain(getActiveThemeState().resolvedColors.textMuted);
    });
  });
});
