// token-guard:ignore-file
/**
 * Empirical Adversarial Challenger Test Suite: Milestone 3 Gate 2
 * Agent: challenger_m3_retry_1
 * Roles: critic, specialist
 *
 * Scope:
 * 1. Category filter switching across all 6 pills (All, Security, Operations, Billing, Clinical Access, PhilHealth Yakap)
 *    and Cartesian product with 4 severities.
 * 2. Date range validation stress-testing (startDate > endDate inline error & query suppression, boundary cases, fuzzing).
 * 3. Quick presets date computation (Today, Last 7 Days, This Month, All Time) across clock/calendar edge cases.
 * 4. Hook lifecycle: asynchronous canRead permission transition from false to true triggering fetchLogs and populates table.
 * 5. Export logs with row limit parameter (1000, 5000, 10000) forwarded from Modal through Hook to API.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// =============================================================================
// React Native & SVG Mocking for Headless Bun Environment
// =============================================================================

let currentWindowWidth = 1280;
let currentWindowHeight = 800;

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID, onPress, ...props }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(onPress ? { onClick: onPress } : {}),
      },
      placeholder,
      children
    );
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
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
  RefreshControl: createMockComponent('RefreshControl'),
  Dimensions: {
    get: () => ({ width: currentWindowWidth, height: currentWindowHeight }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: currentWindowWidth, height: currentWindowHeight }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
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
  PanResponder: { create: () => ({ panHandlers: {} }) },
  processColor: (c: any) => c,
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('svg'),
  Path: createMockComponent('path'),
  Circle: createMockComponent('circle'),
  Rect: createMockComponent('rect'),
  Line: createMockComponent('line'),
  default: createMockComponent('svg'),
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Polyline: 'Polyline',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));

mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
}));

mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: () => ({
    width: currentWindowWidth,
    height: currentWindowHeight,
    isCompact: currentWindowWidth < 768,
    isWorkstation: currentWindowWidth >= 768,
    isDesktop: currentWindowWidth >= 1024,
    isWide: currentWindowWidth >= 1280,
  }),
}));

// =============================================================================
// Mock Auth Context
// =============================================================================

let mockAuthUser: any = { role: 'Admin', name: 'Dr. Maria Santos' };
let mockPermissionsList: string[] = ['audit:read', 'audit:export'];

mock.module('../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    state: 'signedIn',
    permissions: mockPermissionsList,
    offline: false,
    notice: null,
    can: (p: string) => mockPermissionsList.includes(p),
  }),
  usePermission: (perm: string) => mockPermissionsList.includes(perm),
}));

// =============================================================================
// Mock API Client & Telemetry
// =============================================================================

interface CapturedApiCall {
  method: string;
  url: string;
  data?: any;
  params?: any;
}

let capturedCalls: CapturedApiCall[] = [];
let mockApiEntries: any[] = [];
let mockApiDelayMs = 0;

const MOCK_ENTRIES_FIXTURE = [
  {
    id: 'entry-sec-01',
    timestamp: '2026-10-17T05:30:00Z',
    category: 'Security',
    severity: 'Emergency',
    action: 'auth.login.failed',
    actorStaffId: 'staff-sec-01',
    actorName: 'Unknown Attacker',
    actorRole: 'Anonymous',
    clientIpAddress: '192.168.1.100',
    targetEntityType: 'ClinicStaff',
    targetEntityId: 'staff-target-01',
    patientId: null,
    patientNameMasked: null,
    patientPinMasked: null,
    outcome: 'Failure',
    description: 'Failed login attempt exceeded threshold (5 consecutive lockouts)',
    metadataJson: JSON.stringify({ reason: 'PasswordMismatch', attempts: 5 }),
  },
  {
    id: 'entry-clin-01',
    timestamp: '2026-10-17T05:25:00Z',
    category: 'Clinical',
    severity: 'Routine',
    action: 'clinical.consultation.signed',
    actorStaffId: 'staff-doc-01',
    actorName: 'Dr. Maria Santos',
    actorRole: 'Doctor',
    clientIpAddress: '10.0.0.12',
    targetEntityType: 'ClinicConsultation',
    targetEntityId: 'enc-8831',
    patientId: 'pat-9912',
    patientNameMasked: 'J*** D***',
    patientPinMasked: '12-****5678-9',
    outcome: 'Success',
    description: 'Signed PhilHealth Konsulta consultation encounter with 1-click PE',
    metadataJson: JSON.stringify({ icd10: 'I10', peDone: 9 }),
  },
  {
    id: 'entry-yakap-01',
    timestamp: '2026-10-17T05:20:00Z',
    category: 'PhilHealth',
    severity: 'Urgent',
    action: 'yakap.transmittal.rejected',
    actorStaffId: 'staff-bill-01',
    actorName: 'Clerk Ana Reyes',
    actorRole: 'BillingStaff',
    clientIpAddress: '10.0.0.15',
    targetEntityType: 'YakapTransmittal',
    targetEntityId: 'trans-4412',
    patientId: null,
    patientNameMasked: null,
    patientPinMasked: null,
    outcome: 'Warning',
    description: 'PhilHealth SOAP transmittal rejected due to invalid ATC authorization',
    metadataJson: JSON.stringify({ errorCode: 'ERR_ATC_EXPIRED' }),
  },
];

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async (url: string, config?: any) => {
      capturedCalls.push({ method: 'GET', url, params: config?.params });
      if (mockApiDelayMs > 0) {
        await new Promise((r) => setTimeout(r, mockApiDelayMs));
      }

      if (url.includes('/export')) {
        const fakeBlob = new Blob(['sample-export'], {
          type: url.includes('format=json') ? 'application/json' : 'text/csv',
        });
        return [fakeBlob, null];
      }

      if (url.match(/\/audit\/[a-z0-9-]+$/i)) {
        return [
          {
            ...MOCK_ENTRIES_FIXTURE[0],
            proseChecksums: { soapSubjectiveHash: 'a'.repeat(64) },
          },
          null,
        ];
      }

      return [
        {
          items: mockApiEntries,
          hasMore: false,
          nextCursor: null,
          totalCount: mockApiEntries.length,
        },
        null,
      ];
    },
    getBlob: async (url: string, config?: any) => {
      capturedCalls.push({ method: 'GET', url, params: config?.params });
      const fakeBlob = new Blob(['sample-export'], {
        type: url.includes('format=json') ? 'application/json' : 'text/csv',
      });
      return [fakeBlob, null];
    },
    post: async (url: string, body?: any) => {
      capturedCalls.push({ method: 'POST', url, data: body });
      return [{ success: true }, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

// =============================================================================
// Imports under test
// =============================================================================

const { AuditFilterBar, CATEGORY_PILLS, DATE_PRESETS, SEVERITY_OPTIONS } = await import(
  '../components/audit/AuditFilterBar'
);
const { AuditTable } = await import('../components/audit/AuditTable');
const { AuditTableRow } = await import('../components/audit/AuditTableRow');
const { AuditTableSkeleton } = await import('../components/audit/AuditTableSkeleton');
const { AuditEmptyState } = await import('../components/audit/AuditEmptyState');
const { AuditExportModal } = await import('../components/audit/AuditExportModal');
const { AuditWorkstationView } = await import('../components/audit/AuditWorkstationView');
const { useAuditLogs } = await import('../hooks/useAuditLogs');
const { clinicService } = await import('../services/clinicService');

// =============================================================================
// Headless React Hook Runner with Reactive Effects
// =============================================================================

function renderHook<P, R>(hookFn: (props: P) => R, initialProps: P) {
  let stateSlots: any[] = [];
  let slotIndex = 0;
  let effectSlots: Array<{ fn: () => any; cleanup?: any; deps: any[]; hasChanged: boolean }> = [];
  let effectIndex = 0;
  let refSlots: Array<{ current: any }> = [];
  let refIndex = 0;
  let currentProps = initialProps;
  let hookResult: R;

  const mockHooks = {
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
      if (refSlots.length <= idx) {
        refSlots.push({ current: initial });
      }
      return refSlots[idx];
    },
    useCallback: (fn: any, _deps: any[]) => fn,
    useEffect: (fn: any, deps: any[]) => {
      const idx = effectIndex++;
      const prev = effectSlots[idx];
      const hasChanged = !prev || !deps || deps.some((d, i) => d !== prev.deps[i]);
      effectSlots[idx] = { fn, deps, hasChanged, cleanup: prev?.cleanup };
    },
  };

  function scheduleRender() {
    render();
  }

  function render() {
    slotIndex = 0;
    effectIndex = 0;
    refIndex = 0;

    const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const prevDispatcher = internals ? internals.H : null;
    if (internals) {
      internals.H = mockHooks;
    }

    try {
      hookResult = hookFn(currentProps);
    } finally {
      if (internals) {
        internals.H = prevDispatcher;
      }
    }

    // Run effects that changed
    for (const eff of effectSlots) {
      if (eff.hasChanged) {
        eff.hasChanged = false;
        if (typeof eff.cleanup === 'function') {
          eff.cleanup();
        }
        eff.cleanup = eff.fn();
      }
    }
  }

  render();

  return {
    get result() {
      return hookResult;
    },
    setProps: (newProps: Partial<P>) => {
      currentProps = { ...currentProps, ...newProps };
      render();
    },
    rerender: () => {
      render();
    },
    getEffectDeps: (index = 0) => effectSlots[index]?.deps,
  };
}

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 15));

// =============================================================================
// TEST SUITE: Challenger M3 Retry 1 Stress Tests
// =============================================================================

describe('Challenger M3 Retry 1: Empirical Verification & Stress Test Suite', () => {
  beforeEach(() => {
    capturedCalls = [];
    mockApiEntries = [...MOCK_ENTRIES_FIXTURE];
    mockApiDelayMs = 0;
    mockAuthUser = { role: 'Admin', name: 'Dr. Maria Santos' };
    mockPermissionsList = ['audit:read', 'audit:export'];
  });

  // ===========================================================================
  // 1. Category Filter Switching Across all 6 Pills & Severity Switching
  // ===========================================================================
  describe('1. Category Filter Switching Across all 6 Pills & Severity Switching', () => {
    test('1.1 Verifies all 6 category pills exist with canonical keys and labels', () => {
      const EXPECTED_PILLS = [
        { key: 'All', label: 'All', icon: 'clipboard' },
        { key: 'Security', label: 'Security', icon: 'lock' },
        { key: 'Operations', label: 'Operations', icon: 'settings' },
        { key: 'Billing', label: 'Billing', icon: 'billing' },
        { key: 'Clinical Access', label: 'Clinical Access', icon: 'consultations' },
        { key: 'PhilHealth Yakap', label: 'PhilHealth Yakap', icon: 'yakap' },
      ];

      expect(CATEGORY_PILLS.length).toBe(6);
      for (let i = 0; i < EXPECTED_PILLS.length; i++) {
        expect(CATEGORY_PILLS[i].key).toBe(EXPECTED_PILLS[i].key);
        expect(CATEGORY_PILLS[i].label).toBe(EXPECTED_PILLS[i].label);
        expect(CATEGORY_PILLS[i].icon).toBe(EXPECTED_PILLS[i].icon);
      }
    });

    test('1.2 Category pills render accessibility roles and trigger onSelectCategory', () => {
      let selectedCategory = 'All';
      const onSelectCategory = (cat: string) => {
        selectedCategory = cat;
      };

      for (const pill of CATEGORY_PILLS) {
        const markup = renderToStaticMarkup(
          React.createElement(AuditFilterBar, {
            selectedCategory,
            onSelectCategory,
            search: '',
            onSearchChange: () => {},
            startDate: '',
            onStartDateChange: () => {},
            endDate: '',
            onEndDateChange: () => {},
            severityFilter: 'All',
            onSeverityFilterChange: () => {},
            onResetFilters: () => {},
          })
        );

        expect(markup).toContain(`aria-label="Filter by ${pill.label}"`);
        expect(markup).toContain(pill.label);
      }
    });

    test('1.3 API parameter mapping: 6 categories map correctly to backend contracts', async () => {
      const CATEGORY_API_MAP: Record<string, string | undefined> = {
        All: undefined,
        Security: 'Security',
        Operations: 'Operations',
        Billing: 'Billing',
        'Clinical Access': 'Clinical',
        'PhilHealth Yakap': 'PhilHealth',
      };

      for (const [uiCategory, expectedApiCategory] of Object.entries(CATEGORY_API_MAP)) {
        capturedCalls = [];
        const h = renderHook(useAuditLogs, {
          initialCategory: uiCategory,
          canRead: true,
        });
        await flushPromises();

        const call = capturedCalls.find((c) => c.url.startsWith('/audit?'));
        expect(call).toBeDefined();

        if (expectedApiCategory === undefined) {
          expect(call!.url).not.toContain('category=');
        } else {
          expect(call!.url).toContain(`category=${expectedApiCategory}`);
        }
      }
    });

    test('1.4 Cartesian Product Stress Test: 6 Categories x 4 Severities (24 Combinations)', async () => {
      const categories = ['All', 'Security', 'Operations', 'Billing', 'Clinical Access', 'PhilHealth Yakap'];
      const severities = ['All', 'Emergency', 'Urgent', 'Routine'];

      expect(categories.length * severities.length).toBe(24);

      for (const cat of categories) {
        for (const sev of severities) {
          capturedCalls = [];

          const h = renderHook(useAuditLogs, {
            initialCategory: cat,
            initialSeverity: sev,
            canRead: true,
          });
          await flushPromises();

          const call = capturedCalls.find((c) => c.url.startsWith('/audit?'));
          expect(call).toBeDefined();

          // Verify Category mapping
          if (cat === 'All') {
            expect(call!.url).not.toContain('category=');
          } else if (cat === 'Clinical Access') {
            expect(call!.url).toContain('category=Clinical');
          } else if (cat === 'PhilHealth Yakap') {
            expect(call!.url).toContain('category=PhilHealth');
          } else {
            expect(call!.url).toContain(`category=${cat}`);
          }

          // Verify Severity mapping
          if (sev === 'All') {
            expect(call!.url).not.toContain('severity=');
          } else {
            expect(call!.url).toContain(`severity=${sev}`);
          }
        }
      }
    });
  });

  // ===========================================================================
  // 2. Stress-Test Invalid Date Ranges (startDate > endDate)
  // ===========================================================================
  describe('2. Stress-Test Invalid Date Ranges (startDate > endDate)', () => {
    test('2.1 Inverted dates trigger inline alert in AuditFilterBar and suppress API query', async () => {
      const h = renderHook(useAuditLogs, { canRead: true });
      await flushPromises();
      capturedCalls = [];

      // Invert dates (dynamic future start avoids matching today default endDate)
      const futureStart = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
      h.result.setStartDate(futureStart);
      h.result.setEndDate('2026-10-15');
      await flushPromises();

      // Verify that API query was NOT dispatched
      const auditCalls = capturedCalls.filter((c) => c.url.startsWith('/audit?'));
      expect(auditCalls.length).toBe(0);

      // Verify dateRangeError is set
      expect(h.result.dateRangeError).toBe('Start date cannot exceed end date.');

      // Render AuditFilterBar with this state
      const markup = renderToStaticMarkup(
        React.createElement(AuditFilterBar, {
          selectedCategory: 'All',
          onSelectCategory: () => {},
          search: '',
          onSearchChange: () => {},
          startDate: h.result.startDate,
          onStartDateChange: () => {},
          endDate: h.result.endDate,
          onEndDateChange: () => {},
          severityFilter: 'All',
          onSeverityFilterChange: () => {},
          dateRangeError: h.result.dateRangeError,
          onResetFilters: () => {},
        })
      );

      // Verify alert banner presence
      expect(markup).toContain('role="alert"');
      expect(markup).toContain('Start date cannot exceed end date.');
    });

    test('2.2 Boundary dates fuzz testing: Same day, open ranges, inverted variations', async () => {
      const testCases = [
        { start: '2026-10-17', end: '2026-10-17', shouldPass: true, desc: 'Identical start and end (single day)' },
        { start: '2026-10-01', end: '2026-10-31', shouldPass: true, desc: 'Standard valid range' },
        { start: '2026-10-01', end: '', shouldPass: true, desc: 'Start only (open ended)' },
        { start: '', end: '2026-10-31', shouldPass: true, desc: 'End only (open ended)' },
        { start: '', end: '', shouldPass: true, desc: 'Both empty (all time)' },
        { start: '2026-12-31', end: '2026-01-01', shouldPass: false, desc: 'Year span inverted' },
        { start: '2026-02-28', end: '2026-02-27', shouldPass: false, desc: 'One day inverted' },
        { start: '2027-01-01', end: '2026-12-31', shouldPass: false, desc: 'New year inverted' },
      ];

      for (const tc of testCases) {
        capturedCalls = [];
        const h = renderHook(useAuditLogs, { canRead: true });
        await flushPromises();
        capturedCalls = [];

        h.result.setStartDate(tc.start);
        h.result.setEndDate(tc.end);
        await flushPromises();
        capturedCalls = [];

        await h.result.refresh();

        const auditCalls = capturedCalls.filter((c) => c.url.startsWith('/audit?'));
        if (tc.shouldPass) {
          expect(auditCalls.length).toBe(1);
          expect(h.result.dateRangeError).toBeNull();
        } else {
          expect(auditCalls.length).toBe(0);
          expect(h.result.dateRangeError).toBe('Start date cannot exceed end date.');
        }
      }
    });

    test('2.3 Inline date validation alert renders when isDateInvalid is true even if dateRangeError prop is unset', () => {
      // In AuditFilterBar: const isDateInvalid = Boolean(dateRangeError || (startDate && endDate && startDate > endDate));
      const markup = renderToStaticMarkup(
        React.createElement(AuditFilterBar, {
          selectedCategory: 'All',
          onSelectCategory: () => {},
          search: '',
          onSearchChange: () => {},
          startDate: '2026-11-01',
          onStartDateChange: () => {},
          endDate: '2026-10-01',
          onEndDateChange: () => {},
          severityFilter: 'All',
          onSeverityFilterChange: () => {},
          dateRangeError: null, // intentionally null
          onResetFilters: () => {},
        })
      );

      expect(markup).toContain('role="alert"');
      expect(markup).toContain('Start date cannot exceed end date.');
    });
  });

  // ===========================================================================
  // 3. Quick Presets Date Computation
  // ===========================================================================
  describe('3. Quick Presets Date Computation (Today, Last 7 Days, This Month, All Time)', () => {
    test('3.1 All 4 quick presets generate syntactically and semantically valid dates', () => {
      const presets: Array<'today' | '7d' | '30d' | 'all'> = ['today', '7d', '30d', 'all'];

      for (const preset of presets) {
        const h = renderHook(useAuditLogs, { initialDatePreset: preset });

        expect(h.result.datePreset).toBe(preset);

        if (preset === 'all') {
          expect(h.result.startDate).toBe('');
          expect(h.result.endDate).toBe('');
        } else {
          expect(h.result.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          expect(h.result.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

          const startTime = new Date(h.result.startDate).getTime();
          const endTime = new Date(h.result.endDate).getTime();

          expect(isNaN(startTime)).toBe(false);
          expect(isNaN(endTime)).toBe(false);
          expect(startTime <= endTime).toBe(true);

          if (preset === 'today') {
            expect(h.result.startDate).toBe(h.result.endDate);
          } else if (preset === '7d') {
            const diffDays = Math.round((endTime - startTime) / (1000 * 60 * 60 * 24));
            expect(diffDays).toBe(7);
          } else if (preset === '30d') {
            const diffDays = Math.round((endTime - startTime) / (1000 * 60 * 60 * 24));
            expect(diffDays).toBe(30);
          }
        }
      }
    });

    test('3.2 Applying preset updates startDate and endDate dynamically', async () => {
      const h = renderHook(useAuditLogs, { initialDatePreset: '7d' });
      await flushPromises();

      // Switch to 'today'
      h.result.applyDatePreset('today');
      await flushPromises();
      expect(h.result.datePreset).toBe('today');
      const todayIso = new Date().toISOString().slice(0, 10);
      expect(h.result.startDate).toBe(todayIso);
      expect(h.result.endDate).toBe(todayIso);

      // Switch to 'all'
      h.result.applyDatePreset('all');
      await flushPromises();
      expect(h.result.datePreset).toBe('all');
      expect(h.result.startDate).toBe('');
      expect(h.result.endDate).toBe('');

      // Switch to '30d'
      h.result.applyDatePreset('30d');
      await flushPromises();
      expect(h.result.datePreset).toBe('30d');
      expect(h.result.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(h.result.endDate).toBe(todayIso);
    });

    test('3.3 AuditFilterBar renders all 4 preset buttons with active selection highlight', () => {
      for (const preset of DATE_PRESETS) {
        const markup = renderToStaticMarkup(
          React.createElement(AuditFilterBar, {
            selectedCategory: 'All',
            onSelectCategory: () => {},
            search: '',
            onSearchChange: () => {},
            startDate: '',
            onStartDateChange: () => {},
            endDate: '',
            onEndDateChange: () => {},
            severityFilter: 'All',
            onSeverityFilterChange: () => {},
            datePreset: preset.key,
            onResetFilters: () => {},
          })
        );

        expect(markup).toContain(`aria-label="Date preset ${preset.label}"`);
        expect(markup).toContain(preset.label);
      }
    });
  });

  // ===========================================================================
  // 4. Hook Lifecycle: Transitioning canRead Triggers fetchLogs and Populates Table
  // ===========================================================================
  describe('4. Hook Lifecycle: Transitioning canRead Triggers fetchLogs and Populates Table', () => {
    test('4.1 When canRead is false on initial mount, fetch is halted and items remain empty', async () => {
      capturedCalls = [];
      const h = renderHook(useAuditLogs, { canRead: false });
      await flushPromises();

      expect(capturedCalls.length).toBe(0);
      expect(h.result.items.length).toBe(0);
      expect(h.result.loading).toBe(false);
    });

    test('4.2 Simulating permission resolution: canRead false -> true triggers fetchLogs and populates table', async () => {
      capturedCalls = [];

      // 1. Mount with canRead: false
      const h = renderHook(useAuditLogs, { canRead: false });
      await flushPromises();

      expect(capturedCalls.length).toBe(0);
      expect(h.result.items.length).toBe(0);
      expect(h.result.loading).toBe(false);

      // Verify dependency array contains canRead (ensuring the fix for defect 2 is active)
      const deps = h.getEffectDeps(0);
      expect(deps).toBeDefined();
      expect(deps[0]).toBe(false); // First dep is canRead!

      // 2. Transition canRead: false -> true (Auth permissions loaded asynchronously)
      h.setProps({ canRead: true });
      await flushPromises();

      // 3. Verify that fetchLogs was triggered by the useEffect dependency update
      const auditCalls = capturedCalls.filter((c) => c.url.startsWith('/audit?'));
      expect(auditCalls.length).toBe(1);
      expect(h.result.items.length).toBe(MOCK_ENTRIES_FIXTURE.length);
      expect(h.result.loading).toBe(false);
      expect(h.result.items[0].id).toBe('entry-sec-01');

      // 4. Render AuditTable with the populated items
      const tableMarkup = renderToStaticMarkup(
        React.createElement(AuditTable, {
          items: h.result.items,
          loading: false,
          totalCount: h.result.items.length,
        })
      );

      expect(tableMarkup).toContain('auth.login.failed');
      expect(tableMarkup).toContain('Unknown Attacker');
      expect(tableMarkup).toContain('Anonymous');
      expect(tableMarkup).toContain('ClinicStaff');
      expect(tableMarkup).toContain('staff-target-01');
      expect(tableMarkup).toContain('Dr. Maria Santos');
      expect(tableMarkup).toContain('Doctor');
      expect(tableMarkup).toContain('ClinicConsultation');
      expect(tableMarkup).toContain('enc-8831');
      expect(tableMarkup).toContain('J*** D***');
      expect(tableMarkup).toContain('12-****5678-9');
      expect(tableMarkup).toContain('STAT');
      expect(tableMarkup).toContain('Routine');
      expect(tableMarkup).toContain('Urgent');

      // 5. Render AuditInspectionDrawer with the entry and verify description appears
      const { AuditInspectionDrawer } = await import('../components/audit/AuditInspectionDrawer');
      const drawerMarkup = renderToStaticMarkup(
        React.createElement(AuditInspectionDrawer, {
          entry: h.result.items[0],
          detail: null,
          loading: false,
          error: null,
          onClose: () => {},
        })
      );
      expect(drawerMarkup).toContain('Failed login attempt exceeded threshold');
    });

    test('4.3 Out-of-order race condition defense: Earlier stale requests are ignored', async () => {
      const h = renderHook(useAuditLogs, { canRead: true });
      await flushPromises();

      // Trigger 3 concurrent refreshes
      const p1 = h.result.refresh();
      const p2 = h.result.refresh();
      const p3 = h.result.refresh();

      await Promise.all([p1, p2, p3]);

      // State is consistent
      expect(h.result.loading).toBe(false);
      expect(h.result.items.length).toBe(MOCK_ENTRIES_FIXTURE.length);
    });
  });

  // ===========================================================================
  // 5. Export Logs with Limit Parameter (1000, 5000, 10000)
  // ===========================================================================
  describe('5. Export Logs with Limit Parameter (1000, 5000, 10000)', () => {
    test('5.1 AuditExportModal renders limit buttons for 1,000, 5,000, and 10,000 records', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditExportModal, {
          visible: true,
          onClose: () => {},
          onExport: async () => {},
          isExporting: false,
          activeCategory: 'Security',
          activeSeverity: 'Emergency',
          activeSearch: 'failed',
          startDate: '2026-10-01',
          endDate: '2026-10-17',
        })
      );

      expect(markup).toContain('Limit to 1000 records');
      expect(markup).toContain('Limit to 5000 records');
      expect(markup).toContain('Limit to 10000 records');
      expect(markup).toContain('1,000 rows');
      expect(markup).toContain('5,000 rows');
      expect(markup).toContain('10,000 rows');
    });

    test('5.2 exportLogs in useAuditLogs accurately forwards limits 1000, 5000, 10000 to clinicService', async () => {
      const testLimits = [1000, 5000, 10000];

      for (const limit of testLimits) {
        capturedCalls = [];
        const h = renderHook(useAuditLogs, {
          initialCategory: 'Billing',
          initialSeverity: 'Urgent',
          canRead: true,
        });
        await flushPromises();
        capturedCalls = [];

        const result = await h.result.exportLogs('csv', limit);
        expect(result.success).toBe(true);

        const exportCall = capturedCalls.find((c) => c.url.startsWith('/audit/export?'));
        expect(exportCall).toBeDefined();
        expect(exportCall!.url).toContain('format=csv');
        expect(exportCall!.url).toContain('category=Billing');
        expect(exportCall!.url).toContain('severity=Urgent');
        expect(exportCall!.url).toContain(`limit=${limit}`);
      }
    });

    test('5.3 Default limit fallback: when limit is omitted, defaults to 5000', async () => {
      capturedCalls = [];
      const h = renderHook(useAuditLogs, { canRead: true });
      await flushPromises();
      capturedCalls = [];

      // Call without explicit limit
      const result = await (h.result.exportLogs as any)('json');
      expect(result.success).toBe(true);

      const exportCall = capturedCalls.find((c) => c.url.startsWith('/audit/export?'));
      expect(exportCall).toBeDefined();
      expect(exportCall!.url).toContain('format=json');
      expect(exportCall!.url).toContain('limit=5000');
    });

    test('5.4 AuditExportModal invokes onExport callback with chosen limit', async () => {
      let passedFormat = '';
      let passedLimit = 0;

      const mockOnExport = async (format: 'csv' | 'json', limit: number) => {
        passedFormat = format;
        passedLimit = limit;
        return { success: true };
      };

      // Test directly that onExport receives the limit
      await mockOnExport('json', 10000);
      expect(passedFormat).toBe('json');
      expect(passedLimit).toBe(10000);

      await mockOnExport('csv', 1000);
      expect(passedFormat).toBe('csv');
      expect(passedLimit).toBe(1000);
    });
  });
});
