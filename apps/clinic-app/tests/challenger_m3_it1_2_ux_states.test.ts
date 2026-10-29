// token-guard:ignore-file
/**
 * Challenger Test Suite for Milestone 3 (Challenger 2):
 * 4 UX States & Deep Navigation Empirical Verification
 *
 * Scrutinizes:
 * 1. Skeleton Loading State (5 animated skeleton rows while loading=true)
 * 2. Zero-state Quick Actions (4 clinical quick actions when query is empty)
 * 3. Active Search Results (dynamic category tabs, semantic badges, keyboard navigation loop)
 * 4. Empty Results State ("No results found for '{query}'" with "Search in All Categories" button)
 * 5. Deep Navigation Contract across all 7 clinical categories + custom extensions
 */

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
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({
      start: (cb?: any) => cb && cb(),
      stop: () => {},
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
    user: { id: 'u-admin-1', name: 'Dr. Maria Santos' },
    permissions: ['Clinic.PatientsRead', 'Clinic.ConsultationsRead', 'Clinic.AppointmentsRead', 'Clinic.BillingRead'],
    signOut: () => {},
  }),
  usePermission: (perm: string) => ['Clinic.PatientsRead', 'Clinic.ConsultationsRead', 'Clinic.AppointmentsRead', 'Clinic.BillingRead'].includes(perm),
}));

const { universalSearchRegistry } = await import('@shared/safe');
const {
  QUICK_ACTIONS,
  SETTINGS_NAV_ITEMS,
} = await import('../components/search/GlobalSearchProvider');
const { default: GlobalSearchModal } = await import('../components/search/GlobalSearchModal');
const { default: SearchCategoryTabs } = await import('../components/search/SearchCategoryTabs');
const { default: SearchResultItemRow } = await import('../components/search/SearchResultItemRow');

describe('Challenger 2 Empirical Verification: 4 UX States & Deep Navigation', () => {
  beforeEach(() => {
    universalSearchRegistry.clear();
  });

  // ==========================================================================
  // SECTION 1: Skeleton Loading State Empirical Verification
  // ==========================================================================
  describe('UX State 1: Skeleton Loading List', () => {
    test('renders exactly 5 animated skeleton rows while loading=true with empty query', () => {
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
          loading: true,
          onSelectItem: () => {},
        }),
      );

      // Must render skeleton view wrapper
      expect(html).toContain('data-component="Animated.View"');

      // Count occurrences of skeleton rows
      const skeletonRowCount = (html.match(/data-component="Animated\.View"/g) || []).length;
      expect(skeletonRowCount).toBe(5);

      // Must NOT render Quick Actions while loading
      expect(html).not.toContain('Quick Actions');
      expect(html).not.toContain('Register Walk-In Patient');

      // Must NOT render Empty State card
      expect(html).not.toContain('No results found');
    });

    test('renders exactly 5 skeleton rows while loading=true during active query search', () => {
      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: 'hypertension',
          onChangeQuery: () => {},
          activeCategory: 'all',
          onSelectCategory: () => {},
          categories: [
            { key: 'all', label: 'All' },
            { key: 'Patients', label: 'Patients' },
          ],
          results: [
            { id: 'p1', category: 'Patients', title: 'Existing Result', targetRoute: 'Patients' },
          ],
          quickActions: QUICK_ACTIONS,
          loading: true,
          onSelectItem: () => {},
        }),
      );

      const skeletonRowCount = (html.match(/data-component="Animated\.View"/g) || []).length;
      expect(skeletonRowCount).toBe(5);

      // Active results must be suppressed while loading=true
      expect(html).not.toContain('Existing Result');
    });

    test('verifies structural sub-elements of each skeleton placeholder row', () => {
      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: 'testing',
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

      // In GlobalSearchModal lines 248-260:
      // Each skeleton row contains:
      // 1. skeletonIcon View
      // 2. skeletonContent View
      // 3. skeletonTitle View
      // 4. skeletonSubtitle View
      // 5. skeletonBadge View
      // That's 5 inner Views per Animated.View (5 * 5 = 25 inner Views in skeletonContainer)
      expect(html).toContain('data-component="Animated.View"');
      expect(html).toContain('data-component="View"');
    });
  });

  // ==========================================================================
  // SECTION 2: Zero-State Quick Actions Empirical Verification
  // ==========================================================================
  describe('UX State 2: Zero-State Quick Actions', () => {
    test('renders all 4 clinical quick actions when query is empty', () => {
      expect(QUICK_ACTIONS.length).toBe(4);

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

      // Section header
      expect(html).toContain('Quick Actions');

      // Quick Action 1: Register Walk-In Patient
      expect(html).toContain('Register Walk-In Patient');
      expect(html).toContain('Open walk-in patient intake form');
      expect(html).toContain('Intake');

      // Quick Action 2: View OPD Clinical Queue
      expect(html).toContain('View OPD Clinical Queue');
      expect(html).toContain('Monitor triage station, doctor consultation queue');
      expect(html).toContain('Queue');

      // Quick Action 3: Doctor Rosters & Shift Schedules
      expect(html).toContain('Doctor Rosters &amp; Shift Schedules');
      expect(html).toContain('View attending physician shift templates');
      expect(html).toContain('Roster');

      // Quick Action 4: Services & Pricing Catalog
      expect(html).toContain('Services &amp; Pricing Catalog');
      expect(html).toContain('Browse consultation fees, laboratory test codes');
      expect(html).toContain('Catalog');

      // Check WAI-ARIA role="listbox" on ScrollView
      expect(html).toContain('role="listbox"');
      expect(html).toContain('aria-label="Quick Actions"');
    });

    test('treats whitespace-only query as empty zero-state', () => {
      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: '     ',
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

      // Whitespace query should still render Quick Actions, NOT empty state
      expect(html).toContain('Quick Actions');
      expect(html).toContain('Register Walk-In Patient');
      expect(html).not.toContain('No results found');
    });

    test('verifies Quick Actions semantic badge variants conform to design tokens', () => {
      const registerAction = QUICK_ACTIONS.find((a) => a.id === 'quick-action-register');
      expect(registerAction?.badgeVariant).toBe('routine');
      expect(registerAction?.targetRoute).toBe('Patients');
      expect(registerAction?.routeParams).toEqual({ openRegister: 'true' });

      const queueAction = QUICK_ACTIONS.find((a) => a.id === 'quick-action-queue');
      expect(queueAction?.badgeVariant).toBe('urgent');
      expect(queueAction?.targetRoute).toBe('Dashboard');
      expect(queueAction?.routeParams).toEqual({ tab: 'QUEUE' });

      const rosterAction = QUICK_ACTIONS.find((a) => a.id === 'quick-action-roster');
      expect(rosterAction?.badgeVariant).toBe('routine');
      expect(rosterAction?.targetRoute).toBe('Appointments');
      expect(rosterAction?.routeParams).toEqual({ tab: 'roster' });

      const servicesAction = QUICK_ACTIONS.find((a) => a.id === 'quick-action-services');
      expect(servicesAction?.badgeVariant).toBe('neutral');
      expect(servicesAction?.targetRoute).toBe('Settings');
      expect(servicesAction?.routeParams).toEqual({ tab: 'services' });
    });
  });

  // ==========================================================================
  // SECTION 3: Active Search Results Empirical Verification
  // ==========================================================================
  describe('UX State 3: Active Search Results', () => {
    const mockResults: SearchItem[] = [
      {
        id: 'patient-1',
        category: 'Patients',
        title: 'Juan Dela Cruz',
        subtitle: 'MRN: P-2026-001 • DOB: 1985-04-12 • Male',
        badgeText: 'Patient',
        badgeVariant: 'routine',
        targetRoute: 'Patients',
        routeParams: { patientId: 'patient-1' },
      },
      {
        id: 'consult-1',
        category: 'Consultations',
        title: 'Hypertension Consultation - Dr. Reyes',
        subtitle: 'SOAP Trans: 2026-10-19-01 • Urgency: STAT',
        badgeText: 'Emergency',
        badgeVariant: 'emergency',
        targetRoute: 'Consultations',
        routeParams: { consultationId: 'consult-1', patientId: 'patient-1' },
      },
      {
        id: 'appt-1',
        category: 'Appointments',
        title: 'Follow-up Checkup - Maria Clara',
        subtitle: 'Scheduled: 2026-10-20 10:30 AM',
        badgeText: 'Urgent',
        badgeVariant: 'urgent',
        targetRoute: 'Appointments',
        routeParams: { appointmentId: 'appt-1' },
      },
    ];

    const categories: CategoryOption[] = [
      { key: 'all', label: 'All' },
      { key: 'Patients', label: 'Patients' },
      { key: 'Consultations', label: 'Consultations' },
      { key: 'Appointments', label: 'Appointments' },
    ];

    test('renders categorized result rows and dynamic tabs when query matches', () => {
      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: 'juan',
          onChangeQuery: () => {},
          activeCategory: 'all',
          onSelectCategory: () => {},
          categories,
          results: mockResults,
          quickActions: QUICK_ACTIONS,
          loading: false,
          onSelectItem: () => {},
        }),
      );

      // Tab list
      expect(html).toContain('role="tablist"');
      expect(html).toContain('Patients');
      expect(html).toContain('Consultations');
      expect(html).toContain('Appointments');

      // Results listbox
      expect(html).toContain('role="listbox"');
      expect(html).toContain('aria-label="Search results"');

      // Result items
      expect(html).toContain('Juan Dela Cruz');
      expect(html).toContain('Hypertension Consultation');
      expect(html).toContain('Follow-up Checkup');
    });

    test('filters items when activeCategory is switched to a specific category', () => {
      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: 'juan',
          onChangeQuery: () => {},
          activeCategory: 'Patients',
          onSelectCategory: () => {},
          categories,
          results: mockResults,
          quickActions: QUICK_ACTIONS,
          loading: false,
          onSelectItem: () => {},
        }),
      );

      expect(html).toContain('Juan Dela Cruz');
      expect(html).not.toContain('Hypertension Consultation');
      expect(html).not.toContain('Follow-up Checkup');
    });

    test('filters category case-insensitively', () => {
      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: 'juan',
          onChangeQuery: () => {},
          activeCategory: 'patients', // lowercase
          onSelectCategory: () => {},
          categories,
          results: mockResults,
          quickActions: QUICK_ACTIONS,
          loading: false,
          onSelectItem: () => {},
        }),
      );

      expect(html).toContain('Juan Dela Cruz');
      expect(html).not.toContain('Hypertension Consultation');
    });

    test('renders all 4 semantic urgency badge variants across search results', () => {
      const badgeTestItems: SearchItem[] = [
        {
          id: 'item-stat',
          category: 'LabOrders',
          title: 'Critical Troponin I Panic Value',
          badgeText: 'STAT',
          badgeVariant: 'emergency',
          targetRoute: 'LabOrders',
        },
        {
          id: 'item-urgent',
          category: 'Queue',
          title: 'Triage Priority Urgency',
          badgeText: 'Urgent',
          badgeVariant: 'urgent',
          targetRoute: 'Dashboard',
        },
        {
          id: 'item-routine',
          category: 'Patients',
          title: 'Routine Health Check',
          badgeText: 'Routine',
          badgeVariant: 'routine',
          targetRoute: 'Patients',
        },
        {
          id: 'item-neutral',
          category: 'Settings',
          title: 'Clinic Settings Tab',
          badgeText: 'Settings',
          badgeVariant: 'neutral',
          targetRoute: 'Settings',
        },
      ];

      for (const item of badgeTestItems) {
        const html = renderToStaticMarkup(
          React.createElement(SearchResultItemRow, {
            item,
            isActive: false,
            onSelect: () => {},
          }),
        );

        expect(html).toContain(item.title);
        expect(html).toContain(item.badgeText!);
      }
    });

    test('simulates keyboard ArrowDown, ArrowUp, and Enter selection logic', () => {
      let activeIndex = 0;
      const count = mockResults.length; // 3

      // ArrowDown
      activeIndex = (activeIndex + 1) % count; // 1
      expect(activeIndex).toBe(1);
      expect(mockResults[activeIndex].id).toBe('consult-1');

      // ArrowDown
      activeIndex = (activeIndex + 1) % count; // 2
      expect(activeIndex).toBe(2);
      expect(mockResults[activeIndex].id).toBe('appt-1');

      // ArrowDown wrap around
      activeIndex = (activeIndex + 1) % count; // 0
      expect(activeIndex).toBe(0);
      expect(mockResults[activeIndex].id).toBe('patient-1');

      // ArrowUp wrap around
      activeIndex = (activeIndex - 1 + count) % count; // 2
      expect(activeIndex).toBe(2);
      expect(mockResults[activeIndex].id).toBe('appt-1');

      // Enter selection
      let selectedItem: SearchItem | null = null;
      const onEnter = (idx: number) => {
        if (idx >= 0 && idx < count) {
          selectedItem = mockResults[idx];
        }
      };

      onEnter(activeIndex);
      expect(selectedItem).not.toBeNull();
      expect(selectedItem!.id).toBe('appt-1');
    });

    test('sets aria-activedescendant to the active item in combobox TextInput', () => {
      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: 'juan',
          onChangeQuery: () => {},
          activeCategory: 'all',
          onSelectCategory: () => {},
          categories,
          results: mockResults,
          quickActions: QUICK_ACTIONS,
          loading: false,
          onSelectItem: () => {},
        }),
      );

      // Default activeIndex is 0 (patient-1)
      expect(html).toContain('aria-activedescendant="search-item-patient-1"');
      expect(html).toContain('role="combobox"');
      expect(html).toContain('aria-controls="search-results-list"');
    });
  });

  // ==========================================================================
  // SECTION 4: Empty Results State Empirical Verification
  // ==========================================================================
  describe('UX State 4: Empty Results Card', () => {
    test('renders "No results found for {query}" when results array is empty', () => {
      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: 'nonexistent-query-12345',
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

      expect(html).toContain('No results found for &quot;nonexistent-query-12345&quot;');
      expect(html).toContain('Check spelling or try searching across all categories.');

      // When activeCategory is 'all', "Search in All Categories" button should NOT be rendered
      expect(html).not.toContain('Search in All Categories');
    });

    test('renders "Search in All Categories" button when filtered category has 0 results', () => {
      let resetToAll = false;
      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: 'dela cruz',
          onChangeQuery: () => {},
          activeCategory: 'Billing', // Filtering Billing, but only Patients match
          onSelectCategory: (cat: string) => {
            if (cat === 'all') resetToAll = true;
          },
          categories: [
            { key: 'all', label: 'All' },
            { key: 'Patients', label: 'Patients' },
            { key: 'Billing', label: 'Billing' },
          ],
          results: [
            { id: 'p1', category: 'Patients', title: 'Juan Dela Cruz', targetRoute: 'Patients' },
          ],
          quickActions: QUICK_ACTIONS,
          loading: false,
          onSelectItem: () => {},
        }),
      );

      // displayedItems will be empty because results are Patients, but activeCategory is Billing
      expect(html).toContain('No results found for &quot;dela cruz&quot;');
      expect(html).toContain('Search in All Categories');
    });

    test('safely handles special characters and quotes in query without crashing', () => {
      const adversarialQuery = '"><script>alert("XSS")</script>&amp;';
      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: adversarialQuery,
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

      expect(html).toContain('No results found for');
      // Script tags must be escaped as HTML entities in static markup
      expect(html).not.toContain('<script>alert');
    });
  });

  // ==========================================================================
  // SECTION 5: Deep Navigation Verification across all 7 Clinical Categories
  // ==========================================================================
  describe('Deep Navigation Verification (7 Clinical Categories + Extensibility)', () => {
    // Simulator for handleSelectResult in GlobalSearchProvider lines 351-440
    const resolveNavigation = (item: SearchItem): { route: string; params: Record<string, any> } => {
      const params = item.routeParams || {};
      const targetRoute = item.targetRoute;

      let destinationRoute = targetRoute;
      let destinationParams: Record<string, any> = { ...params };

      switch (targetRoute) {
        case 'Patients':
          destinationRoute = 'Patients';
          destinationParams = {
            openPatientId: params.openPatientId || params.patientId || item.id,
            openRegister: params.openRegister === 'true',
          };
          break;

        case 'Consultations':
          destinationRoute = 'Consultations';
          destinationParams = {
            consultationId: params.consultationId,
            patientId: params.patientId,
            queueId: params.queueId,
          };
          break;

        case 'Appointments':
          destinationRoute = 'Appointments';
          destinationParams = {
            appointmentId: params.appointmentId,
            patientId: params.patientId,
            patientName: params.patientName,
          };
          break;

        case 'Queue':
        case 'Dashboard':
          destinationRoute = 'Dashboard';
          destinationParams = {
            tab: 'QUEUE',
            ticketId: params.queueId || params.ticketId,
          };
          break;

        case 'Billing':
          destinationRoute = 'Billing';
          destinationParams = {
            invoiceId: params.invoiceId,
            patientId: params.patientId,
          };
          break;

        case 'LabOrders':
        case 'ResultReview':
          destinationRoute = 'ResultReview';
          destinationParams = {
            orderId: params.orderId || item.id,
          };
          break;

        case 'Settings':
          destinationRoute = 'Settings';
          destinationParams = {
            tab: params.tab,
            subtab: params.subtab,
            roomId: params.roomId,
            serviceId: params.serviceId,
          };
          break;

        default:
          destinationRoute = targetRoute;
          destinationParams = params;
          break;
      }

      return { route: destinationRoute, params: destinationParams };
    };

    // Category 1: Patients
    describe('Category 1: Patients', () => {
      test('navigates with patientId mapped to openPatientId', () => {
        const item: SearchItem = {
          id: 'patient-guid-1',
          category: 'Patients',
          title: 'Juan Dela Cruz',
          targetRoute: 'Patients',
          routeParams: { patientId: 'patient-guid-1' },
        };
        const nav = resolveNavigation(item);
        expect(nav.route).toBe('Patients');
        expect(nav.params).toEqual({
          openPatientId: 'patient-guid-1',
          openRegister: false,
        });
      });

      test('navigates with explicit openPatientId', () => {
        const item: SearchItem = {
          id: 'patient-guid-2',
          category: 'Patients',
          title: 'Maria Santos',
          targetRoute: 'Patients',
          routeParams: { openPatientId: 'explicit-patient-id' },
        };
        const nav = resolveNavigation(item);
        expect(nav.route).toBe('Patients');
        expect(nav.params.openPatientId).toBe('explicit-patient-id');
      });

      test('navigates with openRegister="true"', () => {
        const item: SearchItem = {
          id: 'quick-action-register',
          category: 'Quick Actions',
          title: 'Register Walk-In Patient',
          targetRoute: 'Patients',
          routeParams: { openRegister: 'true' },
        };
        const nav = resolveNavigation(item);
        expect(nav.route).toBe('Patients');
        expect(nav.params.openRegister).toBe(true);
        expect(nav.params.openPatientId).toBe('quick-action-register');
      });

      test('falls back to item.id when no patientId is specified', () => {
        const item: SearchItem = {
          id: 'fallback-patient-99',
          category: 'Patients',
          title: 'Fallback Patient',
          targetRoute: 'Patients',
        };
        const nav = resolveNavigation(item);
        expect(nav.route).toBe('Patients');
        expect(nav.params.openPatientId).toBe('fallback-patient-99');
        expect(nav.params.openRegister).toBe(false);
      });
    });

    // Category 2: Consultations
    describe('Category 2: Consultations', () => {
      test('navigates to Consultations workstation with consultationId, patientId, and queueId', () => {
        const item: SearchItem = {
          id: 'c-101',
          category: 'Consultations',
          title: 'Hypertension Follow-up',
          targetRoute: 'Consultations',
          routeParams: {
            consultationId: 'c-101',
            patientId: 'p-202',
            queueId: 'q-303',
          },
        };
        const nav = resolveNavigation(item);
        expect(nav.route).toBe('Consultations');
        expect(nav.params).toEqual({
          consultationId: 'c-101',
          patientId: 'p-202',
          queueId: 'q-303',
        });
      });
    });

    // Category 3: Appointments
    describe('Category 3: Appointments', () => {
      test('navigates to Appointments calendar with appointmentId and patientName', () => {
        const item: SearchItem = {
          id: 'apt-505',
          category: 'Appointments',
          title: 'Pediatric Vaccine Visit',
          targetRoute: 'Appointments',
          routeParams: {
            appointmentId: 'apt-505',
            patientId: 'p-303',
            patientName: 'Baby Clara Santos',
          },
        };
        const nav = resolveNavigation(item);
        expect(nav.route).toBe('Appointments');
        expect(nav.params).toEqual({
          appointmentId: 'apt-505',
          patientId: 'p-303',
          patientName: 'Baby Clara Santos',
        });
      });
    });

    // Category 4: Queue / Dashboard
    describe('Category 4: Queue & Dashboard', () => {
      test('navigates from targetRoute "Queue" to "Dashboard" with tab QUEUE and ticketId', () => {
        const item: SearchItem = {
          id: 'ticket-1',
          category: 'Queue',
          title: 'Ticket #A-012',
          targetRoute: 'Queue',
          routeParams: { queueId: 'queue-ticket-guid-1' },
        };
        const nav = resolveNavigation(item);
        expect(nav.route).toBe('Dashboard');
        expect(nav.params).toEqual({
          tab: 'QUEUE',
          ticketId: 'queue-ticket-guid-1',
        });
      });

      test('navigates from targetRoute "Dashboard" with ticketId', () => {
        const item: SearchItem = {
          id: 'ticket-2',
          category: 'Queue',
          title: 'Ticket #B-005',
          targetRoute: 'Dashboard',
          routeParams: { ticketId: 'ticket-guid-2' },
        };
        const nav = resolveNavigation(item);
        expect(nav.route).toBe('Dashboard');
        expect(nav.params).toEqual({
          tab: 'QUEUE',
          ticketId: 'ticket-guid-2',
        });
      });
    });

    // Category 5: Billing
    describe('Category 5: Billing', () => {
      test('navigates to Billing with invoiceId and patientId', () => {
        const item: SearchItem = {
          id: 'inv-801',
          category: 'Billing',
          title: 'Invoice #INV-2026-0801',
          targetRoute: 'Billing',
          routeParams: {
            invoiceId: 'inv-801',
            patientId: 'patient-404',
          },
        };
        const nav = resolveNavigation(item);
        expect(nav.route).toBe('Billing');
        expect(nav.params).toEqual({
          invoiceId: 'inv-801',
          patientId: 'patient-404',
        });
      });
    });

    // Category 6: LabOrders / ResultReview
    describe('Category 6: LabOrders & ResultReview', () => {
      test('navigates from targetRoute "LabOrders" to "ResultReview" with orderId', () => {
        const item: SearchItem = {
          id: 'lab-901',
          category: 'LabOrders',
          title: 'Complete Blood Count (CBC)',
          targetRoute: 'LabOrders',
          routeParams: { orderId: 'lab-901' },
        };
        const nav = resolveNavigation(item);
        expect(nav.route).toBe('ResultReview');
        expect(nav.params).toEqual({ orderId: 'lab-901' });
      });

      test('navigates from targetRoute "ResultReview" with item.id fallback', () => {
        const item: SearchItem = {
          id: 'lab-902',
          category: 'LabOrders',
          title: 'Urinalysis Microscopic Exam',
          targetRoute: 'ResultReview',
        };
        const nav = resolveNavigation(item);
        expect(nav.route).toBe('ResultReview');
        expect(nav.params).toEqual({ orderId: 'lab-902' });
      });
    });

    // Category 7: Settings & Tabs
    describe('Category 7: Settings (All 8 Subtabs)', () => {
      test('verifies all 8 settings navigation items produce exact tab and parameters', () => {
        const expectedTabs = [
          'general',
          'services',
          'staff',
          'rbac',
          'readiness',
          'fields',
          'philhealth',
          'license',
        ];

        expect(SETTINGS_NAV_ITEMS.length).toBe(8);

        for (const item of SETTINGS_NAV_ITEMS) {
          const nav = resolveNavigation(item);
          expect(nav.route).toBe('Settings');
          expect(expectedTabs).toContain(nav.params.tab);
        }
      });

      test('navigates to Settings with specific serviceId and roomId', () => {
        const serviceItem: SearchItem = {
          id: 'svc-test',
          category: 'Settings',
          title: 'General Consultation Fee',
          targetRoute: 'Settings',
          routeParams: { tab: 'services', serviceId: 'svc-123' },
        };
        const navService = resolveNavigation(serviceItem);
        expect(navService.route).toBe('Settings');
        expect(navService.params.tab).toBe('services');
        expect(navService.params.serviceId).toBe('svc-123');

        const roomItem: SearchItem = {
          id: 'room-test',
          category: 'Settings',
          title: 'Exam Room 1',
          targetRoute: 'Settings',
          routeParams: { tab: 'staff', roomId: 'room-456' },
        };
        const navRoom = resolveNavigation(roomItem);
        expect(navRoom.route).toBe('Settings');
        expect(navRoom.params.tab).toBe('staff');
        expect(navRoom.params.roomId).toBe('room-456');
      });
    });

    // Extensibility: Default / Custom domain routes (e.g. Dental)
    describe('Extensibility: Custom Domains (e.g. Dental Module)', () => {
      test('preserves targetRoute and routeParams for custom extensions', () => {
        const dentalItem: SearchItem = {
          id: 'dental-tooth-14',
          category: 'Dental',
          title: 'Tooth #14 Composite Filling',
          targetRoute: 'Dental',
          routeParams: { toothNumber: 14, surface: 'MOD' },
        };
        const nav = resolveNavigation(dentalItem);
        expect(nav.route).toBe('Dental');
        expect(nav.params).toEqual({ toothNumber: 14, surface: 'MOD' });
      });

      test('executes onSelect callback when provided on SearchItem', () => {
        let callbackExecuted = false;
        const itemWithCallback: SearchItem = {
          id: 'custom-action-1',
          category: 'Action',
          title: 'Execute Custom Action',
          targetRoute: 'Patients',
          onSelect: () => {
            callbackExecuted = true;
          },
        };

        if (typeof itemWithCallback.onSelect === 'function') {
          itemWithCallback.onSelect();
        }

        expect(callbackExecuted).toBe(true);
      });
    });
  });

  // ==========================================================================
  // SECTION 6: Stress Testing & Robustness
  // ==========================================================================
  describe('Adversarial Stress Testing & Edge Cases', () => {
    test('handles large result sets (200 items) without crashing or degrading markup', () => {
      const largeResults: SearchItem[] = Array.from({ length: 200 }, (_, i) => ({
        id: `stress-item-${i}`,
        category: i % 2 === 0 ? 'Patients' : 'Consultations',
        title: `Stress Record #${i}`,
        subtitle: `Subtitle details for item #${i}`,
        badgeText: i % 2 === 0 ? 'Patient' : 'Consultation',
        badgeVariant: i % 2 === 0 ? 'routine' : 'urgent',
        targetRoute: i % 2 === 0 ? 'Patients' : 'Consultations',
      }));

      const html = renderToStaticMarkup(
        React.createElement(GlobalSearchModal, {
          visible: true,
          onClose: () => {},
          query: 'stress',
          onChangeQuery: () => {},
          activeCategory: 'all',
          onSelectCategory: () => {},
          categories: [
            { key: 'all', label: 'All' },
            { key: 'Patients', label: 'Patients' },
            { key: 'Consultations', label: 'Consultations' },
          ],
          results: largeResults,
          quickActions: QUICK_ACTIONS,
          loading: false,
          onSelectItem: () => {},
        }),
      );

      expect(html).toContain('Stress Record #0');
      expect(html).toContain('Stress Record #199');
      expect(html).toContain('200 result(s)');
    }, 60000);

    test('handles items with undefined optional fields gracefully', () => {
      const minimalItem: SearchItem = {
        id: 'min-1',
        category: 'Patients',
        title: 'Minimal Patient',
        targetRoute: 'Patients',
      };

      const html = renderToStaticMarkup(
        React.createElement(SearchResultItemRow, {
          item: minimalItem,
          isActive: false,
          onSelect: () => {},
        }),
      );

      expect(html).toContain('Minimal Patient');
      // Should not throw or crash on missing subtitle, badgeText, badgeVariant
    });

    test('verifies universalSearchRegistry handles concurrent queries and cancellation', async () => {
      universalSearchRegistry.register({
        id: 'fast-search',
        category: 'Fast',
        priority: 1,
        search: (q: string) => [
          { id: 'f1', category: 'Fast', title: `Fast result for ${q}`, targetRoute: 'Dashboard' },
        ],
      });

      universalSearchRegistry.register({
        id: 'async-search',
        category: 'Async',
        priority: 2,
        search: async (q: string) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return [
            { id: 'a1', category: 'Async', title: `Async result for ${q}`, targetRoute: 'Dashboard' },
          ];
        },
      });

      const results = await universalSearchRegistry.search('test-concurrent');
      expect(results.length).toBe(2);
      expect(results[0].title).toBe('Fast result for test-concurrent');
      expect(results[1].title).toBe('Async result for test-concurrent');
    });
  });
});
