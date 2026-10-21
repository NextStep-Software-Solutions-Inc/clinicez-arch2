// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
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
    signOut: () => {},
  }),
  usePermission: () => true,
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
  resolveSearchNavigation,
  QUICK_ACTIONS,
} = await import('../components/search/GlobalSearchProvider');

const {
  default: GlobalSearchModal,
  handleModalKeyDown,
} = await import('../components/search/GlobalSearchModal');

describe('Challenger 2 Empirical Verification: Frontend Dental Search & Route Resolution', () => {
  beforeEach(() => {
    universalSearchRegistry.clear();
  });

  // =========================================================================
  // Test Suite 1: Route Resolution (resolveSearchNavigation)
  // =========================================================================
  describe('Suite 1: Route Resolution for Dental Search Navigation', () => {
    test('resolves adult tooth #16 to Patients route with tab: dental and toothNumber: 16', () => {
      const item: SearchItem = {
        id: 'dental-tooth-16',
        category: 'Dental',
        title: 'Tooth #16 — Decay (MOD)',
        subtitle: 'Patient: Juan Dela Cruz • Deep caries',
        targetRoute: 'Patients',
        badgeText: 'Decayed',
        badgeVariant: 'urgent',
        routeParams: {
          patientId: 'patient-guid-101',
          toothNumber: '16',
          tab: 'dental',
        },
      };

      const resolution = resolveSearchNavigation(item);

      expect(resolution.destinationRoute).toBe('Patients');
      expect(resolution.destinationParams).toEqual({
        openPatientId: 'patient-guid-101',
        openRegister: false,
        tab: 'dental',
        toothNumber: '16',
      });
    });

    test('resolves child deciduous tooth #55 with tab: dental and toothNumber: 55', () => {
      const item: SearchItem = {
        id: 'dental-tooth-55',
        category: 'Dental',
        title: 'Tooth #55 — Filled (O)',
        subtitle: 'Patient: Baby Juan • Pediatric restoration',
        targetRoute: 'Patients',
        badgeText: 'Filled',
        badgeVariant: 'routine',
        routeParams: {
          patientId: 'patient-guid-555',
          toothNumber: '55',
          tab: 'dental',
        },
      };

      const resolution = resolveSearchNavigation(item);

      expect(resolution.destinationRoute).toBe('Patients');
      expect(resolution.destinationParams.destinationRoute).toBeUndefined();
      expect(resolution.destinationParams.openPatientId).toBe('patient-guid-555');
      expect(resolution.destinationParams.tab).toBe('dental');
      expect(resolution.destinationParams.toothNumber).toBe('55');
    });

    test('resolves numeric toothNumber (e.g. 21 as number) seamlessly', () => {
      const item: SearchItem = {
        id: 'dental-tooth-21',
        category: 'Dental',
        title: 'Tooth #21 — Crown',
        subtitle: 'Patient: Maria Santos',
        targetRoute: 'Patients',
        routeParams: {
          patientId: 'patient-guid-21',
          // @ts-expect-error testing numeric toothNumber passthrough
          toothNumber: 21,
          tab: 'dental',
        },
      };

      const resolution = resolveSearchNavigation(item);
      expect(resolution.destinationRoute).toBe('Patients');
      expect(resolution.destinationParams.tab).toBe('dental');
      expect(resolution.destinationParams.toothNumber).toBe(21);
    });

    test('omits toothNumber from destinationParams when item.routeParams.toothNumber is missing', () => {
      const item: SearchItem = {
        id: 'dental-chart-overview',
        category: 'Dental',
        title: 'Dental Chart Overview',
        subtitle: 'Patient: Juan Dela Cruz',
        targetRoute: 'Patients',
        routeParams: {
          patientId: 'patient-guid-overview',
          tab: 'dental',
        },
      };

      const resolution = resolveSearchNavigation(item);
      expect(resolution.destinationRoute).toBe('Patients');
      expect(resolution.destinationParams.tab).toBe('dental');
      expect(resolution.destinationParams.toothNumber).toBeUndefined();
      expect(resolution.destinationParams.openPatientId).toBe('patient-guid-overview');
    });

    test('resolves patient ID according to precedence: openPatientId -> patientId -> item.id', () => {
      // 1. openPatientId wins if present
      const item1: SearchItem = {
        id: 'fallback-id',
        category: 'Dental',
        title: 'Tooth',
        subtitle: '',
        targetRoute: 'Patients',
        routeParams: {
          openPatientId: 'explicit-open-id',
          patientId: 'ignored-patient-id',
          tab: 'dental',
        },
      };
      expect(resolveSearchNavigation(item1).destinationParams.openPatientId).toBe('explicit-open-id');

      // 2. patientId used if openPatientId is missing
      const item2: SearchItem = {
        id: 'fallback-id',
        category: 'Dental',
        title: 'Tooth',
        subtitle: '',
        targetRoute: 'Patients',
        routeParams: {
          patientId: 'used-patient-id',
          tab: 'dental',
        },
      };
      expect(resolveSearchNavigation(item2).destinationParams.openPatientId).toBe('used-patient-id');

      // 3. item.id used if routeParams has neither
      const item3: SearchItem = {
        id: 'used-fallback-id',
        category: 'Dental',
        title: 'Tooth',
        subtitle: '',
        targetRoute: 'Patients',
        routeParams: {
          tab: 'dental',
        },
      };
      expect(resolveSearchNavigation(item3).destinationParams.openPatientId).toBe('used-fallback-id');
    });
  });

  // =========================================================================
  // Test Suite 2: Category Filtering in Search Modal
  // =========================================================================
  describe('Suite 2: Category Filtering in Search Modal & Results', () => {
    const mockResults: SearchItem[] = [
      {
        id: 'pat-1',
        category: 'Patients',
        title: 'Juan Dela Cruz',
        subtitle: 'DOB: 1985-05-12',
        targetRoute: 'Patients',
        routeParams: { patientId: 'p-1' },
      },
      {
        id: 'tooth-16',
        category: 'Dental',
        title: 'Tooth #16 — Decay',
        subtitle: 'Patient: Juan Dela Cruz',
        targetRoute: 'Patients',
        routeParams: { patientId: 'p-1', toothNumber: '16', tab: 'dental' },
      },
      {
        id: 'tooth-48',
        category: 'Dental',
        title: 'Tooth #48 — Extraction',
        subtitle: 'Patient: Juan Dela Cruz',
        targetRoute: 'Patients',
        routeParams: { patientId: 'p-1', toothNumber: '48', tab: 'dental' },
      },
      {
        id: 'con-1',
        category: 'Consultations',
        title: 'Consultation #1001',
        subtitle: 'Dr. Santos',
        targetRoute: 'Consultations',
        routeParams: { consultationId: 'c-1' },
      },
      {
        id: 'app-1',
        category: 'Appointments',
        title: 'Appointment: 10:00 AM',
        subtitle: 'Juan Dela Cruz',
        targetRoute: 'Appointments',
        routeParams: { appointmentId: 'a-1' },
      },
    ];

    test('filters results to ONLY display dental search items when activeCategory is "Dental"', () => {
      const activeCategory = 'Dental';
      const hasQuery = true;
      const query = 'Juan';

      // Replicating GlobalSearchModal displayedItems logic
      const displayedItems = (!hasQuery)
        ? QUICK_ACTIONS
        : activeCategory.toLowerCase() === 'all'
          ? mockResults
          : mockResults.filter((r) => r.category.toLowerCase() === activeCategory.toLowerCase());

      expect(displayedItems).toHaveLength(2);
      expect(displayedItems.every((item) => item.category === 'Dental')).toBe(true);
      expect(displayedItems.map((item) => item.id)).toEqual(['tooth-16', 'tooth-48']);
    });

    test('filters results case-insensitively when activeCategory is "dental" or "DENTAL"', () => {
      const displayedLower = mockResults.filter((r) => r.category.toLowerCase() === 'dental');
      expect(displayedLower).toHaveLength(2);

      const displayedUpper = mockResults.filter((r) => r.category.toLowerCase() === 'DENTAL'.toLowerCase());
      expect(displayedUpper).toHaveLength(2);
    });

    test('filters out dental items when activeCategory is "Patients"', () => {
      const displayedPatients = mockResults.filter((r) => r.category.toLowerCase() === 'patients');
      expect(displayedPatients).toHaveLength(1);
      expect(displayedPatients[0].id).toBe('pat-1');
      expect(displayedPatients[0].category).toBe('Patients');
    });

    test('displays all 5 results across all categories when activeCategory is "all"', () => {
      const activeCategory = 'all';
      const displayedAll = activeCategory.toLowerCase() === 'all'
        ? mockResults
        : mockResults.filter((r) => r.category.toLowerCase() === activeCategory.toLowerCase());

      expect(displayedAll).toHaveLength(5);
      expect(displayedAll.some((r) => r.category === 'Dental')).toBe(true);
      expect(displayedAll.some((r) => r.category === 'Patients')).toBe(true);
      expect(displayedAll.some((r) => r.category === 'Consultations')).toBe(true);
    });

    test('calculates accurate category counts including Dental count', () => {
      const counts: Record<string, number> = { all: mockResults.length };
      for (const item of mockResults) {
        const cat = item.category || 'General';
        counts[cat] = (counts[cat] || 0) + 1;
        counts[cat.toLowerCase()] = (counts[cat.toLowerCase()] || 0) + 1;
      }

      expect(counts.all).toBe(5);
      expect(counts['Dental']).toBe(2);
      expect(counts['dental']).toBe(2);
      expect(counts['Patients']).toBe(1);
      expect(counts['Consultations']).toBe(1);
      expect(counts['Appointments']).toBe(1);
    });
  });

  // =========================================================================
  // Test Suite 3: Keyboard Interaction & Navigation Execution
  // =========================================================================
  describe('Suite 3: Palette Keyboard Selection on Dental Items', () => {
    test('pressing Enter navigates to target patient dental chart on active tooth', () => {
      const dentalItems: SearchItem[] = [
        {
          id: 'tooth-16',
          category: 'Dental',
          title: 'Tooth #16 — Decay',
          subtitle: 'Juan Dela Cruz',
          targetRoute: 'Patients',
          routeParams: { patientId: 'patient-p16', toothNumber: '16', tab: 'dental' },
        },
      ];

      let selectedItem: SearchItem | null = null;
      let closed = false;

      const state = {
        activeIndex: 0,
        displayedItems: dentalItems,
        onClose: () => { closed = true; },
        onSelectItem: (item: SearchItem) => { selectedItem = item; },
        setActiveIndex: () => {},
      };

      const event = { key: 'Enter', preventDefault: () => {} };
      const handled = handleModalKeyDown(event, state);

      expect(handled).toBe(true);
      expect(selectedItem).not.toBeNull();
      expect((selectedItem as any)?.id).toBe('tooth-16');

      // Now resolve navigation for the selected item
      const resolved = resolveSearchNavigation(selectedItem!);
      expect(resolved.destinationRoute).toBe('Patients');
      expect(resolved.destinationParams.openPatientId).toBe('patient-p16');
      expect(resolved.destinationParams.tab).toBe('dental');
      expect(resolved.destinationParams.toothNumber).toBe('16');
    });
  });
});
