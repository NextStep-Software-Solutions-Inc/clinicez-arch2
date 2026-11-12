// token-guard:ignore-file
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import React from 'react';
import fs from 'fs';
import path from 'path';

mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: 'View',
  ScrollView: 'ScrollView',
}));

const { clearSessionStorage, clearDeviceStorage, getSessionItem, setSessionItem } = await import(
  '../utils/deviceStorage'
);
const {
  usePersistedTab,
  normalizePersistedTabValue,
  readPersistedTabFromSearch,
  resolveInitialPersistedTab,
} = await import('../hooks/usePersistedTab');

const DASHBOARD_TABS = ['QUEUE', 'ANALYTICS', 'REPORTS'] as const;
type DashboardTab = (typeof DASHBOARD_TABS)[number];

const REPORT_TYPES = [
  'DAILY_EOD',
  'CENSUS',
  'DISPENSING_LEDGER',
  'MORBIDITY',
  'TAX_DISCOUNT',
  'DOCTOR_SHARES',
] as const;
type ReportType = (typeof REPORT_TYPES)[number];

const DASHBOARD_ACTIVE_TAB_STORAGE_KEY = 'clinicez_dashboard_active_tab';
const DASHBOARD_REPORT_TYPE_STORAGE_KEY = 'clinicez_dashboard_report_type';

function isDashboardPathname(pathname?: string | null): boolean {
  const clean = (pathname || '').trim().toLowerCase().replace(/\/+$/, '');
  return clean === '' || clean === '/dashboard' || clean.endsWith('/dashboard');
}

function createMockStorage() {
  const map = new Map<string, string>();
  return {
    map,
    storage: {
      getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
      setItem: (key: string, val: string) => {
        map.set(key, String(val));
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
      clear: () => {
        map.clear();
      },
      key: (i: number) => Array.from(map.keys())[i] ?? null,
      get length() {
        return map.size;
      },
    } as Storage,
  };
}

function createHookHarness<P, R>(hookFn: (props: P) => R, initialProps: P) {
  const states: Array<{ value: any }> = [];
  const refs: Array<{ current: any }> = [];
  const effects: Array<{
    deps?: unknown[];
    cleanup?: () => void;
    create: () => void | (() => void);
  }> = [];
  const memos: Array<{ deps?: unknown[]; value: any }> = [];
  let currentProps = initialProps;
  let lastResult!: R;

  function runRender() {
    let stateIdx = 0;
    let refIdx = 0;
    let effectIdx = 0;
    let memoIdx = 0;
    const pendingEffects: Array<{
      slot: number;
      create: () => void | (() => void);
      deps?: unknown[];
    }> = [];

    const dispatcher = {
      useState: (init: any) => {
        const slot = stateIdx++;
        if (!states[slot]) {
          states[slot] = { value: typeof init === 'function' ? init() : init };
        }
        const setter = (updater: any) => {
          const prev = states[slot].value;
          states[slot].value = typeof updater === 'function' ? updater(prev) : updater;
        };
        return [states[slot].value, setter];
      },
      useRef: (init: any) => {
        if (!refs[refIdx]) {
          refs[refIdx] = { current: init };
        }
        return refs[refIdx++];
      },
      useCallback: (fn: any, deps?: unknown[]) => {
        const prev = memos[memoIdx];
        const unchanged =
          prev &&
          deps &&
          prev.deps &&
          deps.length === prev.deps.length &&
          deps.every((d, i) => Object.is(d, prev.deps![i]));
        if (unchanged) {
          memoIdx++;
          return prev.value;
        }
        memos[memoIdx++] = { deps, value: fn };
        return fn;
      },
      useEffect: (create: () => void | (() => void), deps?: unknown[]) => {
        const slot = effectIdx++;
        const prev = effects[slot];
        const unchanged =
          prev &&
          deps &&
          prev.deps &&
          deps.length === prev.deps.length &&
          deps.every((d, i) => Object.is(d, prev.deps![i]));
        if (!unchanged) {
          pendingEffects.push({ slot, create, deps });
        }
      },
    };

    const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const prevDispatcher = internals ? internals.H : null;
    if (internals) internals.H = dispatcher;
    try {
      lastResult = hookFn(currentProps);
    } finally {
      if (internals) internals.H = prevDispatcher;
    }

    for (const eff of pendingEffects) {
      effects[eff.slot]?.cleanup?.();
      const cleanup = eff.create();
      effects[eff.slot] = {
        deps: eff.deps,
        create: eff.create,
        cleanup: typeof cleanup === 'function' ? cleanup : undefined,
      };
    }

    return lastResult;
  }

  runRender();

  return {
    get result() {
      return lastResult;
    },
    rerender(nextProps?: P) {
      if (nextProps !== undefined) {
        currentProps = nextProps;
      }
      return runRender();
    },
    unmount() {
      for (const eff of effects) {
        eff?.cleanup?.();
      }
    },
  };
}

describe('Dashboard activeTab & Reports reportType persistence across page refreshes', () => {
  const origWindow = (globalThis as any).window;
  const origLocalStorage = (globalThis as any).localStorage;
  const origSessionStorage = (globalThis as any).sessionStorage;
  let currentHref = 'http://localhost:8081/dashboard';

  beforeEach(() => {
    const localMock = createMockStorage();
    const sessionMock = createMockStorage();
    currentHref = 'http://localhost:8081/dashboard';

    const mockWin: any = {
      localStorage: localMock.storage,
      sessionStorage: sessionMock.storage,
      location: {
        get href() {
          return currentHref;
        },
        get pathname() {
          return new URL(currentHref).pathname;
        },
        get search() {
          return new URL(currentHref).search;
        },
        origin: 'http://localhost:8081',
      },
      history: {
        state: null,
        replaceState: (_state: any, _title: string, nextUrl: string) => {
          currentHref = nextUrl;
        },
      },
    };

    (globalThis as any).window = mockWin;
    (globalThis as any).localStorage = localMock.storage;
    (globalThis as any).sessionStorage = sessionMock.storage;
    clearSessionStorage();
    clearDeviceStorage();
  });

  afterEach(() => {
    clearSessionStorage();
    clearDeviceStorage();
    (globalThis as any).window = origWindow;
    (globalThis as any).localStorage = origLocalStorage;
    (globalThis as any).sessionStorage = origSessionStorage;
  });

  test('1. Preserves REPORTS + CENSUS across full page refresh without flashing QUEUE', () => {
    // Mount 1: User starts on default Live Queue
    const session1 = createHookHarness(
      () => {
        const [activeTab, setActiveTab] = usePersistedTab<DashboardTab>({
          storageKey: DASHBOARD_ACTIVE_TAB_STORAGE_KEY,
          allowedValues: DASHBOARD_TABS,
          defaultValue: 'QUEUE',
          queryParam: 'tab',
          pathnameMatcher: isDashboardPathname,
        });
        const [reportType, setReportType] = usePersistedTab<ReportType>({
          storageKey: DASHBOARD_REPORT_TYPE_STORAGE_KEY,
          allowedValues: REPORT_TYPES,
          defaultValue: 'DAILY_EOD',
          queryParam: 'report',
          queryParamAliases: ['subTab', 'reportType'],
          pathnameMatcher: isDashboardPathname,
          syncUrl: activeTab === 'REPORTS',
        });
        return { activeTab, setActiveTab, reportType, setReportType };
      },
      {},
    );

    expect(session1.result.activeTab).toBe('QUEUE');
    expect(session1.result.reportType).toBe('DAILY_EOD');

    // User switches to Reports -> Clinic Census
    session1.result.setActiveTab('REPORTS');
    session1.rerender();
    session1.result.setReportType('CENSUS');
    session1.rerender();

    expect(session1.result.activeTab).toBe('REPORTS');
    expect(session1.result.reportType).toBe('CENSUS');
    expect(getSessionItem(DASHBOARD_ACTIVE_TAB_STORAGE_KEY)).toBe('REPORTS');
    expect(getSessionItem(DASHBOARD_REPORT_TYPE_STORAGE_KEY)).toBe('CENSUS');
    expect(currentHref).toContain('tab=REPORTS');
    expect(currentHref).toContain('report=CENSUS');

    session1.unmount();

    // Simulate browser refresh (Cmd+R) — even if URL is bare `/` OR `?tab=REPORTS&report=CENSUS`
    currentHref = 'http://localhost:8081/';
    const session2 = createHookHarness(
      () => {
        const [activeTab] = usePersistedTab<DashboardTab>({
          storageKey: DASHBOARD_ACTIVE_TAB_STORAGE_KEY,
          allowedValues: DASHBOARD_TABS,
          defaultValue: 'QUEUE',
          queryParam: 'tab',
          pathnameMatcher: isDashboardPathname,
        });
        const [reportType] = usePersistedTab<ReportType>({
          storageKey: DASHBOARD_REPORT_TYPE_STORAGE_KEY,
          allowedValues: REPORT_TYPES,
          defaultValue: 'DAILY_EOD',
          queryParam: 'report',
          queryParamAliases: ['subTab', 'reportType'],
          pathnameMatcher: isDashboardPathname,
          syncUrl: activeTab === 'REPORTS',
        });
        return { activeTab, reportType };
      },
      {},
    );

    // Synchronous initial hydration must immediately yield REPORTS + CENSUS on first render
    expect(session2.result.activeTab).toBe('REPORTS');
    expect(session2.result.reportType).toBe('CENSUS');
    session2.unmount();
  });

  test('2. Preserves ANALYTICS tab and all 6 ReportType sub-tabs across refresh', () => {
    setSessionItem(DASHBOARD_ACTIVE_TAB_STORAGE_KEY, 'ANALYTICS');
    expect(
      resolveInitialPersistedTab({
        storageKey: DASHBOARD_ACTIVE_TAB_STORAGE_KEY,
        allowedValues: DASHBOARD_TABS,
        defaultValue: 'QUEUE',
        queryParam: 'tab',
        pathnameMatcher: isDashboardPathname,
      }),
    ).toBe('ANALYTICS');

    for (const subTab of REPORT_TYPES) {
      setSessionItem(DASHBOARD_REPORT_TYPE_STORAGE_KEY, subTab);
      expect(
        resolveInitialPersistedTab({
          storageKey: DASHBOARD_REPORT_TYPE_STORAGE_KEY,
          allowedValues: REPORT_TYPES,
          defaultValue: 'DAILY_EOD',
          queryParam: 'report',
          pathnameMatcher: isDashboardPathname,
        }),
      ).toBe(subTab);
    }
  });

  test('3. URL query params take priority on deep-link load, normalize case, and ignore non-dashboard paths', () => {
    setSessionItem(DASHBOARD_ACTIVE_TAB_STORAGE_KEY, 'QUEUE');
    setSessionItem(DASHBOARD_REPORT_TYPE_STORAGE_KEY, 'DAILY_EOD');
    currentHref = 'http://localhost:8081/dashboard?tab=reports&report=dispensing_ledger';

    expect(
      resolveInitialPersistedTab({
        storageKey: DASHBOARD_ACTIVE_TAB_STORAGE_KEY,
        allowedValues: DASHBOARD_TABS,
        defaultValue: 'QUEUE',
        queryParam: 'tab',
        pathnameMatcher: isDashboardPathname,
      }),
    ).toBe('REPORTS');
    expect(
      resolveInitialPersistedTab({
        storageKey: DASHBOARD_REPORT_TYPE_STORAGE_KEY,
        allowedValues: REPORT_TYPES,
        defaultValue: 'DAILY_EOD',
        queryParam: 'report',
        pathnameMatcher: isDashboardPathname,
      }),
    ).toBe('DISPENSING_LEDGER');

    // On /settings?tab=staff, Dashboard pathnameMatcher blocks reading foreign ?tab=staff
    currentHref = 'http://localhost:8081/settings?tab=staff';
    setSessionItem(DASHBOARD_ACTIVE_TAB_STORAGE_KEY, 'ANALYTICS');
    expect(
      resolveInitialPersistedTab({
        storageKey: DASHBOARD_ACTIVE_TAB_STORAGE_KEY,
        allowedValues: DASHBOARD_TABS,
        defaultValue: 'QUEUE',
        queryParam: 'tab',
        pathnameMatcher: isDashboardPathname,
      }),
    ).toBe('ANALYTICS');

    expect(normalizePersistedTabValue('INVALID_TAB', DASHBOARD_TABS)).toBeNull();
    expect(readPersistedTabFromSearch('?subTab=morbidity', REPORT_TYPES, 'report', ['subTab'])).toBe(
      'MORBIDITY',
    );
  });

  test('4. Dashboard.screen.tsx and Navigation.tsx wire usePersistedTab and linking parse', () => {
    const dashboardSrc = fs.readFileSync(
      path.resolve(__dirname, '../navigation/screens/Dashboard.screen.tsx'),
      'utf8',
    );
    const navSrc = fs.readFileSync(
      path.resolve(__dirname, '../navigation/Navigation.tsx'),
      'utf8',
    );

    expect(dashboardSrc).toContain('usePersistedTab<DashboardTab>');
    expect(dashboardSrc).toContain('usePersistedTab<ReportType>');
    expect(dashboardSrc).toContain('DASHBOARD_ACTIVE_TAB_STORAGE_KEY');
    expect(dashboardSrc).toContain('DASHBOARD_REPORT_TYPE_STORAGE_KEY');
    expect(dashboardSrc).toContain('usePersistedScrollPosition');
    expect(navSrc).toContain("path: 'dashboard'");
    expect(navSrc).toContain('report: String');
  });
});
