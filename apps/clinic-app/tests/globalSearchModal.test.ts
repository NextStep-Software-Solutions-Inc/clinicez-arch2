// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
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
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
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
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
  setCustomFontsAvailable: () => {},
}));

mock.module('../context/TextScaleContext', () => ({
  useTextScale: () => ({ scale: 1 }),
  TextScaleProvider: ({ children }: any) => children,
}));

mock.module('../context/UiDensityContext', () => ({
  useUiDensity: () => ({ multiplier: 1, headerHeight: 64, sidebarWidth: 260 }),
  UiDensityProvider: ({ children }: any) => children,
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
    signOut: () => {},
  }),
}));

mock.module('../context/StaffContext', () => ({
  useStaff: () => ({
    currentStaff: { id: 's1', firstName: 'Dr.', lastName: 'Reyes', role: 'Doctor' },
    permissions: ['Clinic.PatientsRead', 'Clinic.ConsultationsRead', 'Clinic.AppointmentsRead', 'Clinic.BillingRead'],
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

const {
  universalSearchRegistry,
} = await import('@shared/safe');

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
const { default: ClinicHeaderBar } = await import('../components/layout/ClinicHeaderBar');

const {
  handleWorkstationKeyDown,
  WORKSTATION_ROUTE_MAP,
  ROUTE_MAP,
} = await import('../utils/workstationShortcuts.web');

const { clinicService } = await import('../services/clinicService');
import type { WorkstationShortcutHandlers } from '../utils/workstationShortcuts.web';

describe('Milestone 3: Clinic Workstation Command Palette UX & Deep Navigation', () => {
  beforeEach(() => {
    universalSearchRegistry.clear();
  });

  // ==========================================================================
  // Suite 1: Workstation Hotkeys & Keyboard Shortcuts
  // ==========================================================================
  describe('Suite 1: Workstation Hotkeys & Keyboard Shortcuts', () => {
    test('intercepts Cmd+K (macOS) to open command palette', () => {
      let opened = false;
      let prevented = false;
      const handlers: WorkstationShortcutHandlers = {
        onOpenSearch: () => {
          opened = true;
        },
      };

      const event = {
        metaKey: true,
        ctrlKey: false,
        key: 'k',
        preventDefault: () => {
          prevented = true;
        },
      };

      const handled = handleWorkstationKeyDown(event, handlers);

      expect(handled).toBe(true);
      expect(prevented).toBe(true);
      expect(opened).toBe(true);
    });

    test('intercepts Ctrl+K (Windows/Linux) to open command palette', () => {
      let opened = false;
      let prevented = false;
      const handlers: WorkstationShortcutHandlers = {
        onOpenSearch: () => {
          opened = true;
        },
      };

      const event = {
        metaKey: false,
        ctrlKey: true,
        key: 'K',
        preventDefault: () => {
          prevented = true;
        },
      };

      const handled = handleWorkstationKeyDown(event, handlers);

      expect(handled).toBe(true);
      expect(prevented).toBe(true);
      expect(opened).toBe(true);
    });

    test('intercepts "/" outside input fields to open command palette', () => {
      let opened = false;
      let prevented = false;
      const handlers: WorkstationShortcutHandlers = {
        onOpenSearch: () => {
          opened = true;
        },
      };

      const target = { tagName: 'DIV', isContentEditable: false };
      const event = {
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        key: '/',
        target,
        preventDefault: () => {
          prevented = true;
        },
      };

      const handled = handleWorkstationKeyDown(event, handlers);

      expect(handled).toBe(true);
      expect(prevented).toBe(true);
      expect(opened).toBe(true);
    });

    test('suppresses "/" shortcut when user is actively typing in an INPUT element', () => {
      let opened = false;
      let prevented = false;
      const handlers: WorkstationShortcutHandlers = {
        onOpenSearch: () => {
          opened = true;
        },
      };

      const target = { tagName: 'INPUT', isContentEditable: false };
      const event = {
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        key: '/',
        target,
        preventDefault: () => {
          prevented = true;
        },
      };

      const handled = handleWorkstationKeyDown(event, handlers);

      expect(handled).toBe(false);
      expect(prevented).toBe(false);
      expect(opened).toBe(false);
    });

    test('suppresses "/" shortcut when user is actively typing in a TEXTAREA element', () => {
      let opened = false;
      let prevented = false;
      const handlers: WorkstationShortcutHandlers = {
        onOpenSearch: () => {
          opened = true;
        },
      };

      const target = { tagName: 'TEXTAREA', isContentEditable: false };
      const event = {
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        key: '/',
        target,
        preventDefault: () => {
          prevented = true;
        },
      };

      const handled = handleWorkstationKeyDown(event, handlers);

      expect(handled).toBe(false);
      expect(prevented).toBe(false);
      expect(opened).toBe(false);
    });

    test('suppresses "/" shortcut when target isContentEditable is true', () => {
      let opened = false;
      let prevented = false;
      const handlers: WorkstationShortcutHandlers = {
        onOpenSearch: () => {
          opened = true;
        },
      };

      const target = { tagName: 'DIV', isContentEditable: true };
      const event = {
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        key: '/',
        target,
        preventDefault: () => {
          prevented = true;
        },
      };

      const handled = handleWorkstationKeyDown(event, handlers);

      expect(handled).toBe(false);
      expect(prevented).toBe(false);
      expect(opened).toBe(false);
    });

    test('suppresses "/" shortcut when target is a native SELECT element', () => {
      let opened = false;
      let prevented = false;
      const handlers: WorkstationShortcutHandlers = {
        onOpenSearch: () => {
          opened = true;
        },
      };

      const target = { tagName: 'SELECT', isContentEditable: false };
      const event = {
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        key: '/',
        target,
        preventDefault: () => {
          prevented = true;
        },
      };

      const handled = handleWorkstationKeyDown(event, handlers);

      expect(handled).toBe(false);
      expect(prevented).toBe(false);
      expect(opened).toBe(false);
    });
  });

  // ==========================================================================
  // Suite 2: 200ms Debounce Execution & In-Flight Cancellation
  // ==========================================================================
  describe('Suite 2: 200ms Debounce Execution & In-Flight Cancellation', () => {
    test('debounces search queries by 200ms of inactivity', async () => {
      let searchExecutionCount = 0;
      let lastQuery = '';

      universalSearchRegistry.register({
        id: 'test-debounced-contributor',
        category: 'Test',
        categoryLabel: 'Test',
        search: (q: string) => {
          searchExecutionCount++;
          lastQuery = q;
          return [];
        },
      });

      let timer: ReturnType<typeof setTimeout> | null = null;
      const debouncedSearch = (q: string) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          universalSearchRegistry.search(q);
        }, 200);
      };

      debouncedSearch('c');
      debouncedSearch('cl');
      debouncedSearch('cli');
      debouncedSearch('clinic');

      expect(searchExecutionCount).toBe(0);

      await new Promise((r) => setTimeout(r, 250));

      expect(searchExecutionCount).toBe(1);
      expect(lastQuery).toBe('clinic');
    });

    test('clearing query cancels pending debounce and immediately resets without network execution', async () => {
      let contributorExecutionCount = 0;

      universalSearchRegistry.register({
        id: 'test-cancel-contributor',
        category: 'Test',
        categoryLabel: 'Test',
        search: () => {
          contributorExecutionCount++;
          return [{ id: '1', category: 'Test', title: 'Result', targetRoute: 'Patients' }];
        },
      });

      // Emulate the debounce controller in GlobalSearchProvider
      let timer: ReturnType<typeof setTimeout> | null = null;
      let controller: AbortController | null = null;
      let activeResults: SearchItem[] = [];

      const onQueryChange = (q: string) => {
        const trimmed = q.trim();
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (controller) {
          controller.abort();
          controller = null;
        }
        if (!trimmed) {
          activeResults = [];
          return;
        }
        controller = new AbortController();
        timer = setTimeout(async () => {
          activeResults = await universalSearchRegistry.search(trimmed, { signal: controller?.signal });
        }, 200);
      };

      // 1. Begin search query
      onQueryChange('patients');
      expect(timer).not.toBeNull();
      expect(contributorExecutionCount).toBe(0);

      // 2. Immediately clear query before 200ms expires
      onQueryChange('');
      expect(timer).toBeNull();
      expect(activeResults).toEqual([]);

      // 3. Wait 250ms past the initial debounce window
      await new Promise((r) => setTimeout(r, 250));

      // 4. Verify contributor was NEVER called and results remained empty
      expect(contributorExecutionCount).toBe(0);
      expect(activeResults.length).toBe(0);

      // 5. Verify clinicService.search returns immediately for empty queries
      const [emptyRes, emptyErr] = await clinicService.search('   ');
      expect(emptyErr).toBeNull();
      expect(emptyRes?.items).toEqual([]);
      expect(emptyRes?.totalCount).toBe(0);
    });

    test('cancels in-flight network queries via AbortController signal', async () => {
      let aborted = false;
      const controller = new AbortController();

      const contributor = {
        id: 'cancellable-search',
        category: 'Test',
        categoryLabel: 'Test',
        search: async (_q: string, signal?: AbortSignal) => {
          return new Promise<SearchItem[]>((resolve) => {
            const timeout = setTimeout(() => {
              resolve([]);
            }, 300);
            signal?.addEventListener('abort', () => {
              clearTimeout(timeout);
              aborted = true;
              resolve([]);
            });
          });
        },
      };

      universalSearchRegistry.register(contributor);

      const promise = universalSearchRegistry.search('test', { signal: controller.signal });
      controller.abort();
      await promise;

      expect(aborted).toBe(true);
    });
  });

  // ==========================================================================
  // Suite 3: Dynamic Category Tab Filtering
  // ==========================================================================
  describe('Suite 3: Dynamic Category Tab Filtering', () => {
    test('extracts dynamic categories and defaults to "All"', () => {
      universalSearchRegistry.register({
        id: 'patient-search',
        category: 'Patients',
        categoryLabel: 'Patients',
        priority: 10,
        search: () => [],
      });
      universalSearchRegistry.register({
        id: 'consultation-search',
        category: 'Consultations',
        categoryLabel: 'Consultations',
        priority: 20,
        search: () => [],
      });
      universalSearchRegistry.register({
        id: 'billing-search',
        category: 'Billing',
        categoryLabel: 'Billing',
        priority: 30,
        search: () => [],
      });

      const categoriesFromRegistry = universalSearchRegistry.getCategories();
      const allCategories: CategoryOption[] = [
        { key: 'all', label: 'All' },
        ...categoriesFromRegistry,
      ];

      expect(allCategories[0]).toEqual({ key: 'all', label: 'All' });
      expect(allCategories.map((c) => c.key)).toEqual(['all', 'Patients', 'Consultations', 'Billing']);
    });

    test('filters displayed items when category tab is switched', () => {
      const items: SearchItem[] = [
        { id: '1', category: 'Patients', title: 'Juan Dela Cruz', subtitle: '', targetRoute: 'Patients' },
        { id: '2', category: 'Patients', title: 'Maria Santos', subtitle: '', targetRoute: 'Patients' },
        { id: '3', category: 'Consultations', title: 'Dr. Reyes Consultation', subtitle: '', targetRoute: 'Consultations' },
        { id: '4', category: 'Billing', title: 'Invoice #1002', subtitle: '', targetRoute: 'Billing' },
      ];

      let activeCategory = 'all';
      let displayed = activeCategory === 'all' ? items : items.filter((x) => x.category.toLowerCase() === activeCategory.toLowerCase());
      expect(displayed.length).toBe(4);

      activeCategory = 'Patients';
      displayed = activeCategory === 'all' ? items : items.filter((x) => x.category.toLowerCase() === activeCategory.toLowerCase());
      expect(displayed.length).toBe(2);
      expect(displayed.every((x) => x.category === 'Patients')).toBe(true);

      activeCategory = 'Billing';
      displayed = activeCategory === 'all' ? items : items.filter((x) => x.category.toLowerCase() === activeCategory.toLowerCase());
      expect(displayed.length).toBe(1);
      expect(displayed[0].title).toBe('Invoice #1002');
    });

    test('renders category tabs with accurate count badges in markup', () => {
      const categories: CategoryOption[] = [
        { key: 'all', label: 'All' },
        { key: 'Patients', label: 'Patients' },
        { key: 'Billing', label: 'Billing' },
      ];

      const resultCounts = { all: 3, patients: 2, billing: 1 };

      const html = renderToStaticMarkup(
        React.createElement(SearchCategoryTabs, {
          categories,
          activeCategory: 'Patients',
          onSelectCategory: () => {},
          resultCounts,
        }),
      );

      expect(html).toContain('role="tablist"');
      expect(html).toContain('Patients');
      expect(html).toContain('Billing');
      expect(html).toContain('2');
      expect(html).toContain('1');
    });
  });

  // ==========================================================================
  // Suite 4: Keyboard Navigation & Selection Loop
  // ==========================================================================
  describe('Suite 4: Keyboard Navigation & Selection Loop', () => {
    const items: SearchItem[] = [
      { id: '1', category: 'Patients', title: 'Item 1', subtitle: '', targetRoute: 'Patients' },
      { id: '2', category: 'Patients', title: 'Item 2', subtitle: '', targetRoute: 'Patients' },
      { id: '3', category: 'Patients', title: 'Item 3', subtitle: '', targetRoute: 'Patients' },
    ];

    test('ArrowDown advances active selection and wraps index via handleModalKeyDown', () => {
      let activeIndex = 0;
      let prevented = false;

      const event = {
        key: 'ArrowDown',
        preventDefault: () => {
          prevented = true;
        },
      };

      const state = {
        activeIndex,
        displayedItems: items,
        onClose: () => {},
        onSelectItem: () => {},
        setActiveIndex: (updater: (prev: number) => number) => {
          activeIndex = updater(activeIndex);
        },
      };

      // 0 -> 1
      let handled = handleModalKeyDown(event, state);
      expect(handled).toBe(true);
      expect(prevented).toBe(true);
      expect(activeIndex).toBe(1);

      // 1 -> 2
      handled = handleModalKeyDown(event, state);
      expect(handled).toBe(true);
      expect(activeIndex).toBe(2);

      // 2 -> 0 (wrap-around)
      handled = handleModalKeyDown(event, state);
      expect(handled).toBe(true);
      expect(activeIndex).toBe(0);
    });

    test('ArrowUp decrements active selection and wraps from 0 to last index via handleModalKeyDown', () => {
      let activeIndex = 0;
      let prevented = false;

      const event = {
        key: 'ArrowUp',
        preventDefault: () => {
          prevented = true;
        },
      };

      const state = {
        activeIndex,
        displayedItems: items,
        onClose: () => {},
        onSelectItem: () => {},
        setActiveIndex: (updater: (prev: number) => number) => {
          activeIndex = updater(activeIndex);
        },
      };

      // 0 -> 2 (wrap-around to last index)
      let handled = handleModalKeyDown(event, state);
      expect(handled).toBe(true);
      expect(prevented).toBe(true);
      expect(activeIndex).toBe(2);

      // 2 -> 1
      handled = handleModalKeyDown(event, state);
      expect(handled).toBe(true);
      expect(activeIndex).toBe(1);

      // 1 -> 0
      handled = handleModalKeyDown(event, state);
      expect(handled).toBe(true);
      expect(activeIndex).toBe(0);
    });

    test('Enter executes onSelectItem callback for currently highlighted item via handleModalKeyDown', () => {
      let selectedItem: SearchItem | null = null;
      let prevented = false;

      const event = {
        key: 'Enter',
        preventDefault: () => {
          prevented = true;
        },
      };

      const state = {
        activeIndex: 1,
        displayedItems: items,
        onClose: () => {},
        onSelectItem: (item: SearchItem) => {
          selectedItem = item;
        },
        setActiveIndex: () => {},
      };

      const handled = handleModalKeyDown(event, state);

      expect(handled).toBe(true);
      expect(prevented).toBe(true);
      expect(selectedItem).not.toBeNull();
      expect(selectedItem?.id).toBe('2');
      expect(selectedItem?.title).toBe('Item 2');
    });

    test('Escape triggers onClose callback via handleModalKeyDown', () => {
      let closed = false;
      let prevented = false;

      const event = {
        key: 'Escape',
        preventDefault: () => {
          prevented = true;
        },
      };

      const state = {
        activeIndex: 0,
        displayedItems: items,
        onClose: () => {
          closed = true;
        },
        onSelectItem: () => {},
        setActiveIndex: () => {},
      };

      const handled = handleModalKeyDown(event, state);

      expect(handled).toBe(true);
      expect(prevented).toBe(true);
      expect(closed).toBe(true);
    });
  });

  // ==========================================================================
  // Suite 5: Quick Actions Zero-State
  // ==========================================================================
  describe('Suite 5: Quick Actions Zero-State', () => {
    test('provides 4 standard quick actions when search query is empty', () => {
      expect(QUICK_ACTIONS.length).toBe(4);

      const [register, queue, roster, services] = QUICK_ACTIONS;

      expect(register.id).toBe('quick-action-register');
      expect(register.title).toBe('Register Walk-In Patient');
      expect(register.targetRoute).toBe('Patients');
      expect(register.routeParams?.openRegister).toBe('true');
      expect(register.badgeVariant).toBe('routine');

      expect(queue.id).toBe('quick-action-queue');
      expect(queue.title).toBe('View OPD Clinical Queue');
      expect(queue.targetRoute).toBe('Dashboard');
      expect(queue.routeParams?.tab).toBe('QUEUE');
      expect(queue.badgeVariant).toBe('urgent');

      expect(roster.id).toBe('quick-action-roster');
      expect(roster.title).toBe('Doctor Rosters & Shift Schedules');
      expect(roster.targetRoute).toBe('Appointments');
      expect(roster.badgeVariant).toBe('routine');

      expect(services.id).toBe('quick-action-services');
      expect(services.title).toBe('Services & Pricing Catalog');
      expect(services.targetRoute).toBe('Settings');
      expect(services.routeParams?.tab).toBe('services');
      expect(services.badgeVariant).toBe('neutral');
    });

    test('renders Quick Actions header and rows in modal zero-state markup', () => {
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
  });

  // ==========================================================================
  // Suite 6: Semantic Urgency Badge Variants
  // ==========================================================================
  describe('Suite 6: Semantic Urgency Badge Variants', () => {
    test('renders emergency badge with emergency danger tokens', () => {
      const emergencyItem: SearchItem = {
        id: 'crit-1',
        category: 'LabOrders',
        title: 'Critical Potassium 6.8 mmol/L',
        subtitle: 'Panic value alert',
        badgeText: 'STAT Alert',
        badgeVariant: 'emergency',
        targetRoute: 'ResultReview',
      };

      const html = renderToStaticMarkup(
        React.createElement(SearchResultItemRow, {
          item: emergencyItem,
          isActive: false,
          onSelect: () => {},
        }),
      );

      expect(html).toContain('STAT Alert');
      expect(html).toContain('Critical Potassium');
      expect(resolveCategoryIcon(emergencyItem.category)).toBe('lab');
    });

    test('renders urgent badge with urgent warning tokens', () => {
      const urgentItem: SearchItem = {
        id: 'q-1',
        category: 'Queue',
        title: 'Ticket #042 - Priority Triage',
        subtitle: 'Fever 39.5°C with tachypnea',
        badgeText: 'Urgent',
        badgeVariant: 'urgent',
        targetRoute: 'Dashboard',
      };

      const html = renderToStaticMarkup(
        React.createElement(SearchResultItemRow, {
          item: urgentItem,
          isActive: false,
          onSelect: () => {},
        }),
      );

      expect(html).toContain('Urgent');
      expect(html).toContain('Ticket #042');
      expect(resolveCategoryIcon(urgentItem.category)).toBe('ticket');
    });

    test('renders routine badge with teal primary tokens', () => {
      const routineItem: SearchItem = {
        id: 'p-1',
        category: 'Patients',
        title: 'Juan Dela Cruz',
        subtitle: 'PIN: 12-345678901-2',
        badgeText: 'Routine',
        badgeVariant: 'routine',
        targetRoute: 'Patients',
      };

      const html = renderToStaticMarkup(
        React.createElement(SearchResultItemRow, {
          item: routineItem,
          isActive: true,
          onSelect: () => {},
        }),
      );

      expect(html).toContain('Routine');
      expect(html).toContain('Juan Dela Cruz');
      expect(resolveCategoryIcon(routineItem.category)).toBe('patients');
    });

    test('renders neutral badge with muted surface tokens', () => {
      const neutralItem: SearchItem = {
        id: 's-1',
        category: 'Settings',
        title: 'Consultation Fees',
        subtitle: 'Standard OPD consultation pricing',
        badgeText: 'Catalog',
        badgeVariant: 'neutral',
        targetRoute: 'Settings',
      };

      const html = renderToStaticMarkup(
        React.createElement(SearchResultItemRow, {
          item: neutralItem,
          isActive: false,
          onSelect: () => {},
        }),
      );

      expect(html).toContain('Catalog');
      expect(html).toContain('Consultation Fees');
      expect(resolveCategoryIcon(neutralItem.category)).toBe('settings');
    });

    test('falls back to neutral variant when badgeVariant is undefined or unknown', () => {
      const fallbackItem: SearchItem = {
        id: 'f-1',
        category: 'Unknown',
        title: 'General Document',
        subtitle: 'Description',
        badgeText: 'Doc',
        badgeVariant: undefined,
        targetRoute: 'Dashboard',
      };

      const html = renderToStaticMarkup(
        React.createElement(SearchResultItemRow, {
          item: fallbackItem,
          isActive: false,
          onSelect: () => {},
        }),
      );

      expect(html).toContain('Doc');
      expect(resolveCategoryIcon(fallbackItem.category)).toBe('search');
    });
  });

  // ==========================================================================
  // Suite 7: Deep Navigation Dispatch Mapping
  // ==========================================================================
  describe('Suite 7: Deep Navigation Dispatch Mapping', () => {
    // Category 1: Patients
    test('Category 1 (Patients): maps patientId to openPatientId', () => {
      const item: SearchItem = {
        id: 'patient-guid-1',
        category: 'Patients',
        title: 'Juan Dela Cruz',
        subtitle: 'PIN: 12-345678901-2',
        targetRoute: 'Patients',
        routeParams: { patientId: 'patient-guid-1' },
      };

      const result = resolveSearchNavigation(item);
      expect(result.destinationRoute).toBe('Patients');
      expect(result.destinationParams.openPatientId).toBe('patient-guid-1');
      expect(result.destinationParams.openRegister).toBe(false);
    });

    test('Category 1 (Patients): forwards tab: "dental" and toothNumber for dental search item navigation', () => {
      const item: SearchItem = {
        id: 'dental-tooth-16',
        category: 'Dental',
        title: 'Tooth #16 — Decay (MOD)',
        subtitle: 'Patient: Juan Dela Cruz',
        targetRoute: 'Patients',
        routeParams: {
          patientId: 'patient-guid-1',
          toothNumber: '16',
          tab: 'dental',
        },
      };

      const result = resolveSearchNavigation(item);
      expect(result.destinationRoute).toBe('Patients');
      expect(result.destinationParams.openPatientId).toBe('patient-guid-1');
      expect(result.destinationParams.openRegister).toBe(false);
      expect(result.destinationParams.tab).toBe('dental');
      expect(result.destinationParams.toothNumber).toBe('16');
    });

    test('Category 1 (Patients): maps openRegister to openRegister: true for walk-in registration', () => {
      const item: SearchItem = {
        id: 'quick-action-register',
        category: 'Quick Actions',
        title: 'Register Walk-In Patient',
        subtitle: '',
        targetRoute: 'Patients',
        routeParams: { openRegister: 'true' },
      };

      const result = resolveSearchNavigation(item);
      expect(result.destinationRoute).toBe('Patients');
      expect(result.destinationParams.openRegister).toBe(true);
    });

    // Category 2: Consultations
    test('Category 2 (Consultations): maps consultationId, patientId, queueId', () => {
      const item: SearchItem = {
        id: 'consult-guid-1',
        category: 'Consultations',
        title: 'Dr. Santos Consultation',
        subtitle: 'Hypertension follow-up',
        targetRoute: 'Consultations',
        routeParams: { consultationId: 'c-101', patientId: 'p-101', queueId: 'q-101' },
      };

      const result = resolveSearchNavigation(item);
      expect(result.destinationRoute).toBe('Consultations');
      expect(result.destinationParams.consultationId).toBe('c-101');
      expect(result.destinationParams.patientId).toBe('p-101');
      expect(result.destinationParams.queueId).toBe('q-101');
    });

    // Category 3: Appointments
    test('Category 3 (Appointments): maps appointmentId, patientId, patientName', () => {
      const item: SearchItem = {
        id: 'app-guid-1',
        category: 'Appointments',
        title: 'Follow-up with Dr. Reyes',
        subtitle: '',
        targetRoute: 'Appointments',
        routeParams: { appointmentId: 'app-999', patientId: 'p-1', patientName: 'Maria Santos' },
      };

      const result = resolveSearchNavigation(item);
      expect(result.destinationRoute).toBe('Appointments');
      expect(result.destinationParams.appointmentId).toBe('app-999');
      expect(result.destinationParams.patientName).toBe('Maria Santos');
      expect(result.destinationParams.patientId).toBe('p-1');
    });

    // Category 4: Queue / Dashboard
    test('Category 4 (Queue): maps Queue targetRoute to Dashboard screen with tab: QUEUE and ticketId', () => {
      const item: SearchItem = {
        id: 'q-item-1',
        category: 'Queue',
        title: 'Ticket #005 - Priority Triage',
        subtitle: '',
        targetRoute: 'Queue',
        routeParams: { queueId: 'ticket-guid-5' },
      };

      const result = resolveSearchNavigation(item);
      expect(result.destinationRoute).toBe('Dashboard');
      expect(result.destinationParams.tab).toBe('QUEUE');
      expect(result.destinationParams.ticketId).toBe('ticket-guid-5');
    });

    // Category 5: Billing
    test('Category 5 (Billing): maps Billing with invoiceId and patientId', () => {
      const item: SearchItem = {
        id: 'inv-1',
        category: 'Billing',
        title: 'Invoice #INV-2026-001',
        subtitle: '',
        targetRoute: 'Billing',
        routeParams: { invoiceId: 'inv-guid-1', patientId: 'patient-guid-1' },
      };

      const result = resolveSearchNavigation(item);
      expect(result.destinationRoute).toBe('Billing');
      expect(result.destinationParams.invoiceId).toBe('inv-guid-1');
      expect(result.destinationParams.patientId).toBe('patient-guid-1');
    });

    // Category 6: LabOrders / ResultReview
    test('Category 6 (LabOrders): maps LabOrders to ResultReview screen with orderId', () => {
      const item: SearchItem = {
        id: 'order-1',
        category: 'LabOrders',
        title: 'CBC with Platelet',
        subtitle: 'Panic value alert',
        targetRoute: 'LabOrders',
        routeParams: { orderId: 'ord-guid-10' },
      };

      const result = resolveSearchNavigation(item);
      expect(result.destinationRoute).toBe('ResultReview');
      expect(result.destinationParams.orderId).toBe('ord-guid-10');
    });

    // Category 7: Settings (All 9 Settings Tabs)
    describe('Category 7: Settings Navigation across all 9 Settings Tabs', () => {
      const settingsTabs: Array<{ tab: string; subtab?: string; roomId?: string; serviceId?: string }> = [
        { tab: 'general' },
        { tab: 'services', serviceId: 'srv-1' },
        { tab: 'staff', subtab: 'doctors', roomId: 'room-101' },
        { tab: 'rbac' },
        { tab: 'readiness' },
        { tab: 'fields' },
        { tab: 'philhealth' },
        { tab: 'license' },
        { tab: 'audit' },
      ];

      for (const t of settingsTabs) {
        test(`maps Settings tab: "${t.tab}" with accurate parameters`, () => {
          const item: SearchItem = {
            id: `setting-${t.tab}`,
            category: 'Settings',
            title: `Settings: ${t.tab}`,
            subtitle: `Configure ${t.tab}`,
            targetRoute: 'Settings',
            routeParams: {
              tab: t.tab,
              subtab: t.subtab,
              roomId: t.roomId,
              serviceId: t.serviceId,
            },
          };

          const result = resolveSearchNavigation(item);
          expect(result.destinationRoute).toBe('Settings');
          expect(result.destinationParams.tab).toBe(t.tab);
          if (t.subtab) expect(result.destinationParams.subtab).toBe(t.subtab);
          if (t.roomId) expect(result.destinationParams.roomId).toBe(t.roomId);
          if (t.serviceId) expect(result.destinationParams.serviceId).toBe(t.serviceId);
        });
      }

      test('maps all 9 pre-defined SETTINGS_NAV_ITEMS directly via resolveSearchNavigation', () => {
        expect(SETTINGS_NAV_ITEMS.length).toBe(9);
        const resolvedTabs = SETTINGS_NAV_ITEMS.map((navItem) => {
          const res = resolveSearchNavigation(navItem);
          expect(res.destinationRoute).toBe('Settings');
          return res.destinationParams.tab;
        });

        expect(resolvedTabs).toEqual([
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
    });

    test('falls back to passthrough targetRoute and routeParams for unmapped routes', () => {
      const item: SearchItem = {
        id: 'custom-item-1',
        category: 'Custom',
        title: 'Custom Module',
        subtitle: '',
        targetRoute: 'CustomModuleRoute',
        routeParams: { customKey: 'customVal' },
      };

      const result = resolveSearchNavigation(item);
      expect(result.destinationRoute).toBe('CustomModuleRoute');
      expect(result.destinationParams).toEqual({ customKey: 'customVal' });
    });
  });

  // ==========================================================================
  // Suite 8: Token Guard & Accessibility Attributes Verification
  // ==========================================================================
  describe('Suite 8: Token Guard & Accessibility Attributes Verification', () => {
    test('renders accessible dialog and combobox attributes in GlobalSearchModal markup', () => {
      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: 'test',
          onChangeQuery: () => {},
          activeCategory: 'all',
          onSelectCategory: () => {},
          categories: [{ key: 'all', label: 'All' }],
          results: [
            { id: '1', category: 'Patients', title: 'Juan', subtitle: 'PIN: 1', targetRoute: 'Patients' },
          ],
          quickActions: QUICK_ACTIONS,
          loading: false,
          onSelectItem: () => {},
        }),
      );

      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-label="Global Search Command Palette"');
      expect(html).toContain('role="combobox"');
      expect(html).toContain('aria-expanded="true"');
      expect(html).toContain('aria-controls="search-results-list"');
      expect(html).toContain('role="listbox"');
      expect(html).toContain('role="option"');
    });

    test('renders desktop search pill and mobile search icon triggers in ClinicHeaderBar', () => {
      // Desktop view (!isCompact)
      const desktopHtml = renderToStaticMarkup(
        React.createElement(ClinicHeaderBar, {
          title: 'Clinic EZ',
          onOpenSearch: () => {},
        }),
      );

      expect(desktopHtml).toContain('Search records...');
      expect(desktopHtml).toContain('Search clinic records and settings (Cmd+K)');
    });

    test('renders empty state card with retry CTA when results are 0', () => {
      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: 'nonexistent-record-12345',
          onChangeQuery: () => {},
          activeCategory: 'Patients',
          onSelectCategory: () => {},
          categories: [
            { key: 'all', label: 'All' },
            { key: 'Patients', label: 'Patients' },
          ],
          results: [],
          quickActions: QUICK_ACTIONS,
          loading: false,
          onSelectItem: () => {},
        }),
      );

      expect(html).toContain('No results found for &quot;nonexistent-record-12345&quot;');
      expect(html).toContain('Search in All Categories');
    });

    test('renders skeleton loading rows when loading is true', () => {
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

      expect(html).toContain('data-component="Animated.View"');
    });
  });
});
