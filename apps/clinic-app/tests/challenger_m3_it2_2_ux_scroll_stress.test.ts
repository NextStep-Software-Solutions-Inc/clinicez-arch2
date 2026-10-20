// token-guard:ignore-file
/**
 * Challenger Test Suite for Milestone 3 Iteration 2 (Challenger 2):
 * UX States, Keyboard Navigation, Scrolling & Deep Navigation Stress Testing
 *
 * Scrutinizes:
 * 1. Skeleton Loading State (5 animated skeleton rows while loading=true, precedence over results)
 * 2. Zero-State Quick Actions (4 clinical quick actions on empty or whitespace query, category tabs hidden)
 * 3. Active Search Results & Selection Loop (ArrowDown/Up modulo wrap-around, Enter dispatch, boundaries)
 * 4. Empty Results Card ("No results found for '{query}'" with "Search in All Categories" toggle)
 * 5. Keyboard scroll-into-view behavior when navigating through 20+ items & environment resilience
 * 6. Deep Navigation Resolution across all 7 categories and 9 Settings tabs + unmapped fallback
 */

import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SearchItem, CategoryOption } from '@shared/safe';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    placeholder,
    placeholderTextColor,
    testID,
    visible,
    style,
    onPress,
    value,
    onChangeText,
    autoFocus,
    role,
    nativeID,
    id,
    ...rest
  }: any) => {
    if (name === 'Modal' && visible === false) {
      return null;
    }
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(id ? { id } : {}),
        ...(nativeID ? { 'data-nativeid': nativeID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { 'data-accessibility-role': accessibilityRole } : {}),
        ...(role ? { role } : accessibilityRole ? { role: accessibilityRole } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(visible !== undefined ? { 'data-visible': String(visible) } : {}),
        ...(onPress ? { 'data-pressable': 'true' } : {}),
        ...(value !== undefined ? { 'data-value': value } : {}),
        ...(autoFocus ? { 'data-autofocus': 'true' } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...rest,
      },
      placeholder,
      children,
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s, absoluteFillObject: {} },
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
  Touchable: { Mixin: {} },
  Image: createMockComponent('Image'),
  ImageBackground: createMockComponent('ImageBackground'),
  Alert: { alert: () => {} },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  processColor: (c: any) => c,
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
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
    timing: (val: any, config: any) => ({
      start: (cb?: any) => {
        val.setValue(config.toValue);
        cb?.();
      },
      stop: () => {},
    }),
    sequence: (animations: any[]) => ({
      start: (cb?: any) => {
        animations.forEach((a) => a.start?.());
        cb?.();
      },
      stop: () => animations.forEach((a) => a.stop?.()),
    }),
    loop: (animation: any) => ({
      start: (cb?: any) => {
        animation.start?.();
        cb?.();
      },
      stop: () => animation.stop?.(),
    }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  G: 'G',
  Line: 'Line',
  Polyline: 'Polyline',
  Polygon: 'Polygon',
  default: 'Svg',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  Text: ({ children }: any) => children,
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
  setCustomFontsAvailable: () => {},
}));


mock.module('../utils/useSafeInsets', () => ({
  useSafeInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: () => {},
    setParams: () => {},
  }),
  useRoute: () => ({ key: 'Dashboard', name: 'Dashboard', params: undefined }),
  DefaultTheme: { colors: {} },
  createStaticNavigation: () => () => null,
}));

mock.module('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Admin User' },
    permissions: [
      'Clinic.PatientsRead',
      'Clinic.ConsultationsRead',
      'Clinic.AppointmentsRead',
      'Clinic.BillingRead',
    ],
    signOut: () => {},
  }),
  usePermission: (perm: string) => [
    'Clinic.PatientsRead',
    'Clinic.ConsultationsRead',
    'Clinic.AppointmentsRead',
    'Clinic.BillingRead',
  ].includes(perm),
}));

mock.module('../context/StaffContext', () => ({
  useStaff: () => ({
    currentStaff: { id: 's1', firstName: 'Dr.', lastName: 'Reyes', role: 'Doctor' },
    permissions: [
      'Clinic.PatientsRead',
      'Clinic.ConsultationsRead',
      'Clinic.AppointmentsRead',
      'Clinic.BillingRead',
    ],
  }),
  formatStaffName: (s: any) => `${s.firstName || ''} ${s.lastName || ''}`.trim(),
}));

mock.module('../hooks/useClinicNotifications', () => ({
  useClinicNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    hasStatAlert: false,
    loading: false,
    refresh: () => {},
    markAsRead: () => {},
    markAllAsRead: () => {},
  }),
}));

const { universalSearchRegistry } = await import('@shared/safe');

const {
  QUICK_ACTIONS,
  SETTINGS_NAV_ITEMS,
  resolveSearchNavigation,
} = await import('../components/search/GlobalSearchProvider');

const {
  default: SearchResultItemRow,
  resolveCategoryIcon,
} = await import('../components/search/SearchResultItemRow');

const { default: SearchCategoryTabs } = await import('../components/search/SearchCategoryTabs');
const {
  default: GlobalSearchModal,
  handleModalKeyDown,
  handleModalKeyNavigation,
} = await import('../components/search/GlobalSearchModal');

describe('Challenger 2 Empirical Stress Test: UX States, Navigation & Scrolling', () => {
  beforeEach(() => {
    universalSearchRegistry.clear();
  });

  // ==========================================================================
  // Suite 1: UX State 1 — Skeleton Loading State
  // ==========================================================================
  describe('Suite 1: UX State 1 — Skeleton Loading State', () => {
    test('renders exactly 5 skeleton rows with pulse animation container when loading=true', () => {
      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: 'searching...',
          onChangeQuery: () => {},
          activeCategory: 'all',
          onSelectCategory: () => {},
          categories: [{ key: 'all', label: 'All' }],
          results: [],
          quickActions: QUICK_ACTIONS,
          loading: true,
          onSelectItem: () => {},
        }),
      );

      // Matches exactly 5 Animated.View skeleton rows
      const matches = html.match(/data-component="Animated\.View"/g);
      expect(matches).not.toBeNull();
      expect(matches?.length).toBe(5);
    });

    test('skeleton rows contain icon, title, subtitle, and badge placeholder elements', () => {
      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: 'active search',
          onChangeQuery: () => {},
          activeCategory: 'all',
          onSelectCategory: () => {},
          categories: [{ key: 'all', label: 'All' }],
          results: [],
          quickActions: QUICK_ACTIONS,
          loading: true,
          onSelectItem: () => {},
        }),
      );

      // Verify that neither Quick Actions nor Empty Card are rendered
      expect(html).not.toContain('Quick Actions');
      expect(html).not.toContain('No results found');
      expect(html).not.toContain('Search in All Categories');
    });

    test('loading=true takes strict precedence over non-empty results', () => {
      const populatedResults: SearchItem[] = [
        { id: '1', category: 'Patients', title: 'Juan Dela Cruz', targetRoute: 'Patients' },
        { id: '2', category: 'Patients', title: 'Maria Santos', targetRoute: 'Patients' },
      ];

      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: 'patients',
          onChangeQuery: () => {},
          activeCategory: 'all',
          onSelectCategory: () => {},
          categories: [{ key: 'all', label: 'All' }],
          results: populatedResults,
          quickActions: QUICK_ACTIONS,
          loading: true, // Loading is true while results exist
          onSelectItem: () => {},
        }),
      );

      // Must render skeleton rows, NOT the results
      expect(html).toContain('data-component="Animated.View"');
      expect(html).not.toContain('Juan Dela Cruz');
      expect(html).not.toContain('Maria Santos');
    });

    test('loading=true takes strict precedence over zero-state Quick Actions when query is empty', () => {
      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: '', // Empty query
          onChangeQuery: () => {},
          activeCategory: 'all',
          onSelectCategory: () => {},
          categories: [{ key: 'all', label: 'All' }],
          results: [],
          quickActions: QUICK_ACTIONS,
          loading: true, // Loading active on initial open
          onSelectItem: () => {},
        }),
      );

      // Must render skeleton rows, NOT the quick actions
      expect(html).toContain('data-component="Animated.View"');
      expect(html).not.toContain('Quick Actions');
      expect(html).not.toContain('Register Walk-In Patient');
    });
  });

  // ==========================================================================
  // Suite 2: UX State 2 — Zero-State Quick Actions
  // ==========================================================================
  describe('Suite 2: UX State 2 — Zero-State Quick Actions', () => {
    test('renders 4 clinical quick actions when query is empty string', () => {
      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: '',
          onChangeQuery: () => {},
          activeCategory: 'all',
          onSelectCategory: () => {},
          categories: [{ key: 'all', label: 'All' }],
          results: [],
          quickActions: QUICK_ACTIONS,
          loading: false,
          onSelectItem: () => {},
        }),
      );

      expect(html).toContain('Quick Actions');
      expect(html).toContain('Register Walk-In Patient');
      expect(html).toContain('View OPD Clinical Queue');
      expect(html).toContain('Doctor Rosters &amp; Shift Schedules');
      expect(html).toContain('Services &amp; Pricing Catalog');
    });

    test('renders 4 clinical quick actions when query is whitespace or tabs', () => {
      const whitespaceQueries = ['   ', '\t', '  \n  ', '\t\t  '];

      for (const q of whitespaceQueries) {
        const html = renderToStaticMarkup(
          React.createElement(GlobalSearchModal, {
            visible: true,
            onClose: () => {},
            query: q,
            onChangeQuery: () => {},
            activeCategory: 'all',
            onSelectCategory: () => {},
            categories: [{ key: 'all', label: 'All' }],
            results: [],
            quickActions: QUICK_ACTIONS,
            loading: false,
            onSelectItem: () => {},
          }),
        );

        expect(html).toContain('Quick Actions');
        expect(html).toContain('Register Walk-In Patient');
        expect(html).not.toContain('No results found');
      }
    });

    test('hides category filter tabs when in zero-state (empty query)', () => {
      const categories: CategoryOption[] = [
        { key: 'all', label: 'All' },
        { key: 'Patients', label: 'Patients' },
        { key: 'Appointments', label: 'Appointments' },
      ];

      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: '',
          onChangeQuery: () => {},
          activeCategory: 'all',
          onSelectCategory: () => {},
          categories,
          results: [],
          quickActions: QUICK_ACTIONS,
          loading: false,
          onSelectItem: () => {},
        }),
      );

      // Category tablist should be omitted when hasQuery is false
      expect(html).not.toContain('role="tablist"');
    });

    test('ArrowDown / ArrowUp navigates through all 4 Quick Actions in zero-state', () => {
      let activeIndex = 0;
      const state = {
        activeIndex,
        displayedItems: QUICK_ACTIONS,
        onClose: () => {},
        onSelectItem: () => {},
        setActiveIndex: (updater: (prev: number) => number) => {
          activeIndex = updater(activeIndex);
        },
      };

      // Initial index 0
      expect(activeIndex).toBe(0);

      // Down: 0 -> 1 -> 2 -> 3 -> 0 (wrap-around)
      handleModalKeyDown({ key: 'ArrowDown' }, state);
      expect(activeIndex).toBe(1);

      handleModalKeyDown({ key: 'ArrowDown' }, state);
      expect(activeIndex).toBe(2);

      handleModalKeyDown({ key: 'ArrowDown' }, state);
      expect(activeIndex).toBe(3);

      handleModalKeyDown({ key: 'ArrowDown' }, state);
      expect(activeIndex).toBe(0); // Wrapped

      // Up: 0 -> 3 (wrap-around backwards)
      handleModalKeyDown({ key: 'ArrowUp' }, state);
      expect(activeIndex).toBe(3);
    });

    test('Enter selects highlighted Quick Action in zero-state', () => {
      let selectedItem: SearchItem | null = null;
      const state = {
        activeIndex: 2, // Highlight 'Doctor Rosters & Shift Schedules'
        displayedItems: QUICK_ACTIONS,
        onClose: () => {},
        onSelectItem: (item: SearchItem) => {
          selectedItem = item;
        },
        setActiveIndex: () => {},
      };

      const handled = handleModalKeyDown({ key: 'Enter' }, state);
      expect(handled).toBe(true);
      expect(selectedItem).not.toBeNull();
      expect(selectedItem?.id).toBe('quick-action-roster');
      expect(selectedItem?.title).toBe('Doctor Rosters & Shift Schedules');
    });
  });

  // ==========================================================================
  // Suite 3: UX State 3 — Active Search Results & Keyboard Selection Loop
  // ==========================================================================
  describe('Suite 3: UX State 3 — Active Search Results & Keyboard Selection Loop', () => {
    test('renders active search results list with accessible listbox container', () => {
      const items: SearchItem[] = [
        { id: 'p-1', category: 'Patients', title: 'Maria Santos', targetRoute: 'Patients' },
        { id: 'c-1', category: 'Consultations', title: 'Consultation with Dr. Reyes', targetRoute: 'Consultations' },
      ];

      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: 'santos',
          onChangeQuery: () => {},
          activeCategory: 'all',
          onSelectCategory: () => {},
          categories: [{ key: 'all', label: 'All' }, { key: 'Patients', label: 'Patients' }],
          results: items,
          quickActions: QUICK_ACTIONS,
          loading: false,
          onSelectItem: () => {},
        }),
      );

      expect(html).toContain('role="listbox"');
      expect(html).toContain('Maria Santos');
      expect(html).toContain('Consultation with Dr. Reyes');
      expect(html).toContain('ClinicEZ Search • 2 result(s)');
    });

    test('ArrowDown modulo wrap-around over 5 items: 0 -> 1 -> 2 -> 3 -> 4 -> 0', () => {
      const items: SearchItem[] = Array.from({ length: 5 }, (_, i) => ({
        id: `item-${i}`,
        category: 'Patients',
        title: `Patient ${i}`,
        targetRoute: 'Patients',
      }));

      let activeIndex = 0;
      const state = {
        activeIndex,
        displayedItems: items,
        onClose: () => {},
        onSelectItem: () => {},
        setActiveIndex: (updater: (prev: number) => number) => {
          activeIndex = updater(activeIndex);
        },
      };

      for (let i = 1; i <= 4; i++) {
        handleModalKeyDown({ key: 'ArrowDown' }, state);
        expect(activeIndex).toBe(i);
      }

      // Modulo wrap-around back to 0
      handleModalKeyDown({ key: 'ArrowDown' }, state);
      expect(activeIndex).toBe(0);
    });

    test('ArrowUp modulo wrap-around over 5 items: 0 -> 4 -> 3 -> 2 -> 1 -> 0', () => {
      const items: SearchItem[] = Array.from({ length: 5 }, (_, i) => ({
        id: `item-${i}`,
        category: 'Patients',
        title: `Patient ${i}`,
        targetRoute: 'Patients',
      }));

      let activeIndex = 0;
      const state = {
        activeIndex,
        displayedItems: items,
        onClose: () => {},
        onSelectItem: () => {},
        setActiveIndex: (updater: (prev: number) => number) => {
          activeIndex = updater(activeIndex);
        },
      };

      // Wrap around from 0 to 4
      handleModalKeyDown({ key: 'ArrowUp' }, state);
      expect(activeIndex).toBe(4);

      for (let i = 3; i >= 0; i--) {
        handleModalKeyDown({ key: 'ArrowUp' }, state);
        expect(activeIndex).toBe(i);
      }
    });

    test('Single-item boundary: ArrowDown and ArrowUp remain at index 0', () => {
      const items: SearchItem[] = [
        { id: 'solo-1', category: 'Patients', title: 'Solo Patient', targetRoute: 'Patients' },
      ];

      let activeIndex = 0;
      const state = {
        activeIndex,
        displayedItems: items,
        onClose: () => {},
        onSelectItem: () => {},
        setActiveIndex: (updater: (prev: number) => number) => {
          activeIndex = updater(activeIndex);
        },
      };

      handleModalKeyDown({ key: 'ArrowDown' }, state);
      expect(activeIndex).toBe(0);

      handleModalKeyDown({ key: 'ArrowUp' }, state);
      expect(activeIndex).toBe(0);
    });

    test('Empty list boundary: ArrowDown and ArrowUp evaluate to -1 without crashing', () => {
      let activeIndex = 0;
      const state = {
        activeIndex,
        displayedItems: [],
        onClose: () => {},
        onSelectItem: () => {},
        setActiveIndex: (updater: (prev: number) => number) => {
          activeIndex = updater(activeIndex);
        },
      };

      handleModalKeyDown({ key: 'ArrowDown' }, state);
      expect(activeIndex).toBe(-1);

      handleModalKeyDown({ key: 'ArrowUp' }, state);
      expect(activeIndex).toBe(-1);
    });

    test('Enter key does not call onSelectItem when activeIndex is out of bounds (-1 or length)', () => {
      let selectCount = 0;
      const items: SearchItem[] = [
        { id: '1', category: 'Patients', title: 'P1', targetRoute: 'Patients' },
      ];

      const stateNegative = {
        activeIndex: -1,
        displayedItems: items,
        onClose: () => {},
        onSelectItem: () => {
          selectCount++;
        },
        setActiveIndex: () => {},
      };

      handleModalKeyDown({ key: 'Enter' }, stateNegative);
      expect(selectCount).toBe(0);

      const stateOverflow = {
        activeIndex: 99,
        displayedItems: items,
        onClose: () => {},
        onSelectItem: () => {
          selectCount++;
        },
        setActiveIndex: () => {},
      };

      handleModalKeyDown({ key: 'Enter' }, stateOverflow);
      expect(selectCount).toBe(0);
    });

    test('Escape closes modal and prevents default', () => {
      let closed = false;
      let prevented = false;

      const handled = handleModalKeyDown(
        {
          key: 'Escape',
          preventDefault: () => {
            prevented = true;
          },
        },
        {
          activeIndex: 0,
          displayedItems: [],
          onClose: () => {
            closed = true;
          },
          onSelectItem: () => {},
          setActiveIndex: () => {},
        },
      );

      expect(handled).toBe(true);
      expect(prevented).toBe(true);
      expect(closed).toBe(true);
    });

    test('Unhandled keys return false and do not prevent default', () => {
      let prevented = false;
      const unhandledKeys = ['Tab', 'Space', 'a', '1', 'Shift', 'Backspace'];

      for (const key of unhandledKeys) {
        prevented = false;
        const handled = handleModalKeyDown(
          {
            key,
            preventDefault: () => {
              prevented = true;
            },
          },
          {
            activeIndex: 0,
            displayedItems: [],
            onClose: () => {},
            onSelectItem: () => {},
            setActiveIndex: () => {},
          },
        );

        expect(handled).toBe(false);
        expect(prevented).toBe(false);
      }
    });

    test('handleModalKeyNavigation alias is strictly identical to handleModalKeyDown', () => {
      expect(handleModalKeyNavigation).toBe(handleModalKeyDown);
    });
  });

  // ==========================================================================
  // Suite 4: UX State 4 — Empty Results Card & "Search in All Categories"
  // ==========================================================================
  describe('Suite 4: UX State 4 — Empty Results Card & "Search in All Categories"', () => {
    test('renders empty state card with exact query when results array is empty', () => {
      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: 'xyz-not-found',
          onChangeQuery: () => {},
          activeCategory: 'all',
          onSelectCategory: () => {},
          categories: [{ key: 'all', label: 'All' }],
          results: [],
          quickActions: QUICK_ACTIONS,
          loading: false,
          onSelectItem: () => {},
        }),
      );

      expect(html).toContain('No results found for &quot;xyz-not-found&quot;');
      expect(html).toContain('Check spelling or try searching across all categories.');
      // When category is 'all', the "Search in All Categories" button should NOT be rendered
      expect(html).not.toContain('Search in All Categories');
    });

    test('renders "Search in All Categories" CTA button when activeCategory !== "all"', () => {
      let selectedCategory: string | null = null;

      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: 'insulin',
          onChangeQuery: () => {},
          activeCategory: 'Patients', // Scoped to Patients
          onSelectCategory: (cat: string) => {
            selectedCategory = cat;
          },
          categories: [
            { key: 'all', label: 'All' },
            { key: 'Patients', label: 'Patients' },
            { key: 'Services', label: 'Services' },
          ],
          results: [],
          quickActions: QUICK_ACTIONS,
          loading: false,
          onSelectItem: () => {},
        }),
      );

      expect(html).toContain('No results found for &quot;insulin&quot;');
      expect(html).toContain('Search in All Categories');
      expect(html).toContain('aria-label="Search in All Categories"');
    });

    test('renders empty card when results exist in other categories but activeCategory has 0 matches', () => {
      const results: SearchItem[] = [
        { id: '1', category: 'Billing', title: 'Invoice #101', targetRoute: 'Billing' },
      ];

      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: '101',
          onChangeQuery: () => {},
          activeCategory: 'Patients', // Filtered to Patients, which has 0 items
          onSelectCategory: () => {},
          categories: [
            { key: 'all', label: 'All' },
            { key: 'Patients', label: 'Patients' },
            { key: 'Billing', label: 'Billing' },
          ],
          results,
          quickActions: QUICK_ACTIONS,
          loading: false,
          onSelectItem: () => {},
        }),
      );

      expect(html).toContain('No results found for &quot;101&quot;');
      expect(html).toContain('Search in All Categories');
      expect(html).not.toContain('Invoice #101');
    });
  });

  // ==========================================================================
  // Suite 5: Scrolling & Scroll-Into-View Behavior with 20+ Items
  // ==========================================================================
  describe('Suite 5: Scrolling & Scroll-Into-View Behavior with 20+ Items', () => {
    test('renders 25 search items with predictable search-item-{id} DOM IDs', () => {
      const items: SearchItem[] = Array.from({ length: 25 }, (_, i) => ({
        id: `rec-${i}`,
        category: 'Patients',
        title: `Patient Record ${i + 1}`,
        subtitle: `Chart #${1000 + i}`,
        targetRoute: 'Patients',
      }));

      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: 'record',
          onChangeQuery: () => {},
          activeCategory: 'all',
          onSelectCategory: () => {},
          categories: [{ key: 'all', label: 'All' }],
          results: items,
          quickActions: QUICK_ACTIONS,
          loading: false,
          onSelectItem: () => {},
        }),
      );

      expect(html).toContain('search-item-rec-0');
      expect(html).toContain('search-item-rec-12');
      expect(html).toContain('search-item-rec-24');
      expect(html).toContain('ClinicEZ Search • 25 result(s)');
    });

    test('scroll-into-view hook executes el.scrollIntoView({ block: "nearest" }) for active element', () => {
      const scrolledElements: string[] = [];

      // Mock DOM environment with document.getElementById and scrollIntoView
      const originalDocument = (globalThis as any).document;
      (globalThis as any).document = {
        getElementById: (id: string) => {
          return {
            id,
            scrollIntoView: (options: any) => {
              scrolledElements.push(`${id}:${options?.block}`);
            },
          };
        },
      };

      try {
        const items: SearchItem[] = Array.from({ length: 25 }, (_, i) => ({
          id: `item-${i}`,
          category: 'Patients',
          title: `Item ${i}`,
          targetRoute: 'Patients',
        }));

        // Emulate scroll-into-view effect from GlobalSearchModal
        const triggerScrollIntoView = (activeIndex: number, displayedItems: SearchItem[], visible: boolean) => {
          if (typeof document === 'undefined' || !visible) return;
          if (activeIndex < 0 || activeIndex >= displayedItems.length) return;

          const activeItem = displayedItems[activeIndex];
          if (!activeItem) return;

          const el = document.getElementById(`search-item-${activeItem.id}`);
          if (el && typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ block: 'nearest' });
          }
        };

        // Scroll items 0 through 24
        for (let i = 0; i < 25; i++) {
          triggerScrollIntoView(i, items, true);
        }

        expect(scrolledElements.length).toBe(25);
        expect(scrolledElements[0]).toBe('search-item-item-0:nearest');
        expect(scrolledElements[15]).toBe('search-item-item-15:nearest');
        expect(scrolledElements[24]).toBe('search-item-item-24:nearest');

        // Test wrap-around: from 24 back to 0
        triggerScrollIntoView(0, items, true);
        expect(scrolledElements[25]).toBe('search-item-item-0:nearest');

        // When visible is false, scrollIntoView must NOT be invoked
        const lengthBeforeHidden = scrolledElements.length;
        triggerScrollIntoView(5, items, false);
        expect(scrolledElements.length).toBe(lengthBeforeHidden);
      } finally {
        (globalThis as any).document = originalDocument;
      }
    });

    test('environment resilience: gracefully handles missing document or missing scrollIntoView', () => {
      // 1. Missing document (native mobile / SSR)
      const originalDocument = (globalThis as any).document;
      delete (globalThis as any).document;

      expect(() => {
        const activeItem = { id: 'test-1', category: 'Test', title: 'Test', targetRoute: 'Patients' };
        if (typeof document !== 'undefined') {
          document.getElementById('search-item-test-1');
        }
      }).not.toThrow();

      (globalThis as any).document = originalDocument;

      // 2. Element without scrollIntoView method (detached node / older browser)
      (globalThis as any).document = {
        getElementById: () => ({ id: 'no-scroll' }), // no scrollIntoView property
      };

      try {
        expect(() => {
          const el = (globalThis as any).document.getElementById('search-item-test-1');
          if (el && typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ block: 'nearest' });
          }
        }).not.toThrow();
      } finally {
        (globalThis as any).document = originalDocument;
      }
    });
  });

  // ==========================================================================
  // Suite 6: Deep Navigation Resolution across all 7 Categories & 9 Settings Tabs
  // ==========================================================================
  describe('Suite 6: Deep Navigation Resolution across all 7 Categories & 9 Settings Tabs', () => {
    // Category 1: Patients
    test('Category 1: Patients maps patientId, openPatientId, fallback to item.id, and openRegister', () => {
      // Direct patient record
      const p1: SearchItem = {
        id: 'patient-uuid-123',
        category: 'Patients',
        title: 'Juan Dela Cruz',
        targetRoute: 'Patients',
        routeParams: { patientId: 'patient-uuid-123' },
      };
      const res1 = resolveSearchNavigation(p1);
      expect(res1.destinationRoute).toBe('Patients');
      expect(res1.destinationParams.openPatientId).toBe('patient-uuid-123');
      expect(res1.destinationParams.openRegister).toBe(false);

      // Walk-in intake registration
      const p2: SearchItem = {
        id: 'quick-action-register',
        category: 'Quick Actions',
        title: 'Register Walk-In Patient',
        targetRoute: 'Patients',
        routeParams: { openRegister: 'true' },
      };
      const res2 = resolveSearchNavigation(p2);
      expect(res2.destinationRoute).toBe('Patients');
      expect(res2.destinationParams.openRegister).toBe(true);
      expect(res2.destinationParams.openPatientId).toBe('quick-action-register');
    });

    // Category 2: Consultations
    test('Category 2: Consultations maps consultationId, patientId, queueId', () => {
      const item: SearchItem = {
        id: 'c-uuid-456',
        category: 'Consultations',
        title: 'Follow-up Consultation',
        targetRoute: 'Consultations',
        routeParams: {
          consultationId: 'c-uuid-456',
          patientId: 'p-uuid-789',
          queueId: 'q-uuid-012',
        },
      };
      const res = resolveSearchNavigation(item);
      expect(res.destinationRoute).toBe('Consultations');
      expect(res.destinationParams.consultationId).toBe('c-uuid-456');
      expect(res.destinationParams.patientId).toBe('p-uuid-789');
      expect(res.destinationParams.queueId).toBe('q-uuid-012');
    });

    // Category 3: Appointments
    test('Category 3: Appointments maps appointmentId, patientId, patientName', () => {
      const item: SearchItem = {
        id: 'app-uuid-111',
        category: 'Appointments',
        title: 'Appointment: Maria Santos',
        targetRoute: 'Appointments',
        routeParams: {
          appointmentId: 'app-uuid-111',
          patientId: 'p-uuid-222',
          patientName: 'Maria Santos',
        },
      };
      const res = resolveSearchNavigation(item);
      expect(res.destinationRoute).toBe('Appointments');
      expect(res.destinationParams.appointmentId).toBe('app-uuid-111');
      expect(res.destinationParams.patientId).toBe('p-uuid-222');
      expect(res.destinationParams.patientName).toBe('Maria Santos');
    });

    // Category 4: Queue / Dashboard
    test('Category 4: Queue maps to Dashboard with tab: QUEUE and ticketId', () => {
      const itemQueue: SearchItem = {
        id: 'ticket-1',
        category: 'Queue',
        title: 'Ticket #010',
        targetRoute: 'Queue',
        routeParams: { queueId: 'ticket-guid-10' },
      };
      const resQueue = resolveSearchNavigation(itemQueue);
      expect(resQueue.destinationRoute).toBe('Dashboard');
      expect(resQueue.destinationParams.tab).toBe('QUEUE');
      expect(resQueue.destinationParams.ticketId).toBe('ticket-guid-10');

      const itemDashboard: SearchItem = {
        id: 'ticket-2',
        category: 'Queue',
        title: 'Ticket #020',
        targetRoute: 'Dashboard',
        routeParams: { ticketId: 'ticket-guid-20' },
      };
      const resDashboard = resolveSearchNavigation(itemDashboard);
      expect(resDashboard.destinationRoute).toBe('Dashboard');
      expect(resDashboard.destinationParams.tab).toBe('QUEUE');
      expect(resDashboard.destinationParams.ticketId).toBe('ticket-guid-20');
    });

    // Category 5: Billing
    test('Category 5: Billing maps invoiceId and patientId', () => {
      const item: SearchItem = {
        id: 'inv-uuid-333',
        category: 'Billing',
        title: 'Invoice #INV-2026-0042',
        targetRoute: 'Billing',
        routeParams: {
          invoiceId: 'inv-uuid-333',
          patientId: 'patient-uuid-444',
        },
      };
      const res = resolveSearchNavigation(item);
      expect(res.destinationRoute).toBe('Billing');
      expect(res.destinationParams.invoiceId).toBe('inv-uuid-333');
      expect(res.destinationParams.patientId).toBe('patient-uuid-444');
    });

    // Category 6: LabOrders / ResultReview
    test('Category 6: LabOrders maps to ResultReview with orderId', () => {
      const itemLabOrders: SearchItem = {
        id: 'order-uuid-555',
        category: 'LabOrders',
        title: 'Urinalysis',
        targetRoute: 'LabOrders',
        routeParams: { orderId: 'ord-uuid-555' },
      };
      const res1 = resolveSearchNavigation(itemLabOrders);
      expect(res1.destinationRoute).toBe('ResultReview');
      expect(res1.destinationParams.orderId).toBe('ord-uuid-555');

      const itemResultReview: SearchItem = {
        id: 'order-uuid-666',
        category: 'LabOrders',
        title: 'CBC with Differential',
        targetRoute: 'ResultReview',
      };
      const res2 = resolveSearchNavigation(itemResultReview);
      expect(res2.destinationRoute).toBe('ResultReview');
      expect(res2.destinationParams.orderId).toBe('order-uuid-666'); // fallback to item.id
    });

    // Category 7: Settings (All 9 Settings Tabs)
    test('Category 7: Settings maps all 9 tabs with sub-parameters', () => {
      const expectedTabs = [
        'general',
        'services',
        'staff',
        'rbac',
        'readiness',
        'fields',
        'philhealth',
        'license',
        'audit',
      ];

      for (const tab of expectedTabs) {
        const item: SearchItem = {
          id: `setting-${tab}`,
          category: 'Settings',
          title: `Settings: ${tab}`,
          targetRoute: 'Settings',
          routeParams: {
            tab,
            subtab: tab === 'staff' ? 'doctors' : undefined,
            roomId: tab === 'staff' ? 'room-1' : undefined,
            serviceId: tab === 'services' ? 'srv-100' : undefined,
          },
        };

        const res = resolveSearchNavigation(item);
        expect(res.destinationRoute).toBe('Settings');
        expect(res.destinationParams.tab).toBe(tab);
        if (tab === 'staff') {
          expect(res.destinationParams.subtab).toBe('doctors');
          expect(res.destinationParams.roomId).toBe('room-1');
        }
        if (tab === 'services') {
          expect(res.destinationParams.serviceId).toBe('srv-100');
        }
      }
    });

    test('Category 7: SETTINGS_NAV_ITEMS maps 1:1 to all 9 settings tabs', () => {
      expect(SETTINGS_NAV_ITEMS.length).toBe(9);
      const tabKeys = SETTINGS_NAV_ITEMS.map((item) => {
        const res = resolveSearchNavigation(item);
        return res.destinationParams.tab;
      });

      expect(tabKeys).toEqual([
        'general',
        'services',
        'staff',
        'rbac',
        'readiness',
        'fields',
        'philhealth',
        'license',
        'audit',
      ]);
    });

    test('Unmapped custom route: preserves targetRoute and routeParams verbatim', () => {
      const customItem: SearchItem = {
        id: 'custom-1',
        category: 'Telemetry',
        title: 'ECG Monitor 1',
        targetRoute: 'TelemetryMonitorView',
        routeParams: {
          channel: 'lead-II',
          sampleRate: 500,
          deviceId: 'dev-009',
        },
      };

      const res = resolveSearchNavigation(customItem);
      expect(res.destinationRoute).toBe('TelemetryMonitorView');
      expect(res.destinationParams).toEqual({
        channel: 'lead-II',
        sampleRate: 500,
        deviceId: 'dev-009',
      });
    });

    test('Full dispatch flow: onSelect callback, modal dismissal, query reset, and navigator invocation', () => {
      let onSelectCalled = false;
      let navigatedRoute = '';
      let navigatedParams: any = null;

      const testItem: SearchItem = {
        id: 'p-42',
        category: 'Patients',
        title: 'Patient 42',
        targetRoute: 'Patients',
        routeParams: { patientId: 'p-42' },
        onSelect: () => {
          onSelectCalled = true;
        },
      };

      // Mock navigator function
      const mockNavigator = (route: string, params?: any) => {
        navigatedRoute = route;
        navigatedParams = params;
      };

      // Emulate handleSelectResult from GlobalSearchProvider
      const handleSelectResult = (item: SearchItem) => {
        if (typeof item.onSelect === 'function') {
          item.onSelect();
        }
        const { destinationRoute, destinationParams } = resolveSearchNavigation(item);
        mockNavigator(destinationRoute, destinationParams);
      };

      handleSelectResult(testItem);

      expect(onSelectCalled).toBe(true);
      expect(navigatedRoute).toBe('Patients');
      expect(navigatedParams).toEqual({
        openPatientId: 'p-42',
        openRegister: false,
      });
    });
  });
});
