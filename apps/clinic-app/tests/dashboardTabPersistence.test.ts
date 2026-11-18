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

const QUEUE_FILTERS = [
  'ALL',
  'Waiting',
  'Triaged',
  'InConsultation',
  'PendingProcedure',
  'OnHold',
  'NoShow',
  'Completed',
] as const;
type QueueFilter = (typeof QUEUE_FILTERS)[number];

const DASHBOARD_ACTIVE_TAB_STORAGE_KEY = 'clinicez_dashboard_active_tab';
const DASHBOARD_REPORT_TYPE_STORAGE_KEY = 'clinicez_dashboard_report_type';
const DASHBOARD_QUEUE_FILTER_STORAGE_KEY = 'clinicez_dashboard_queue_filter';

const QUEUE_FILTER_VALUE_ALIASES: Record<string, QueueFilter> = {
  all: 'ALL',
  waiting: 'Waiting',
  triage: 'Triaged',
  triaged: 'Triaged',
  in_consultation: 'InConsultation',
  'in-consultation': 'InConsultation',
  inconsultation: 'InConsultation',
  consultation: 'InConsultation',
  procedure: 'PendingProcedure',
  procedure_bay: 'PendingProcedure',
  'procedure-bay': 'PendingProcedure',
  procedurebay: 'PendingProcedure',
  pending_procedure: 'PendingProcedure',
  'pending-procedure': 'PendingProcedure',
  pendingprocedure: 'PendingProcedure',
  on_hold: 'OnHold',
  'on-hold': 'OnHold',
  onhold: 'OnHold',
  no_show: 'NoShow',
  'no-show': 'NoShow',
  noshow: 'NoShow',
  completed: 'Completed',
  done: 'Completed',
};

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

  test('1. Preserves REPORTS + CENSUS and QUEUE + QueueFilter across full page refresh without flashing defaults', () => {
    // Mount 1: User starts on default Live Queue with ALL filter
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
        const [queueFilter, setQueueFilter] = usePersistedTab<QueueFilter>({
          storageKey: DASHBOARD_QUEUE_FILTER_STORAGE_KEY,
          allowedValues: QUEUE_FILTERS,
          defaultValue: 'ALL',
          queryParam: 'status',
          queryParamAliases: ['queueStatus', 'queueFilter', 'filter'],
          valueAliases: QUEUE_FILTER_VALUE_ALIASES,
          pathnameMatcher: isDashboardPathname,
          syncUrl: activeTab === 'QUEUE',
        });
        return { activeTab, setActiveTab, reportType, setReportType, queueFilter, setQueueFilter };
      },
      {},
    );

    expect(session1.result.activeTab).toBe('QUEUE');
    expect(session1.result.reportType).toBe('DAILY_EOD');
    expect(session1.result.queueFilter).toBe('ALL');

    // User switches Queue filter to Waiting
    session1.result.setQueueFilter('Waiting');
    session1.rerender();

    expect(session1.result.queueFilter).toBe('Waiting');
    expect(getSessionItem(DASHBOARD_QUEUE_FILTER_STORAGE_KEY)).toBe('Waiting');
    expect(currentHref).toContain('status=Waiting');

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

    // Simulate browser refresh (Cmd+R) — even if URL is bare `/`
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
        const [queueFilter] = usePersistedTab<QueueFilter>({
          storageKey: DASHBOARD_QUEUE_FILTER_STORAGE_KEY,
          allowedValues: QUEUE_FILTERS,
          defaultValue: 'ALL',
          queryParam: 'status',
          queryParamAliases: ['queueStatus', 'queueFilter', 'filter'],
          valueAliases: QUEUE_FILTER_VALUE_ALIASES,
          pathnameMatcher: isDashboardPathname,
          syncUrl: activeTab === 'QUEUE',
        });
        return { activeTab, reportType, queueFilter };
      },
      {},
    );

    // Synchronous initial hydration must immediately yield REPORTS + CENSUS on first render
    expect(session2.result.activeTab).toBe('REPORTS');
    expect(session2.result.reportType).toBe('CENSUS');
    // And queueFilter in background storage also preserves Waiting!
    expect(session2.result.queueFilter).toBe('Waiting');
    session2.unmount();

    // Now test a bare refresh when user was on Live Queue with PendingProcedure (Procedure bay)
    setSessionItem(DASHBOARD_ACTIVE_TAB_STORAGE_KEY, 'QUEUE');
    setSessionItem(DASHBOARD_QUEUE_FILTER_STORAGE_KEY, 'PendingProcedure');
    currentHref = 'http://localhost:8081/';

    const session3 = createHookHarness(
      () => {
        const [activeTab] = usePersistedTab<DashboardTab>({
          storageKey: DASHBOARD_ACTIVE_TAB_STORAGE_KEY,
          allowedValues: DASHBOARD_TABS,
          defaultValue: 'QUEUE',
          queryParam: 'tab',
          pathnameMatcher: isDashboardPathname,
        });
        const [queueFilter] = usePersistedTab<QueueFilter>({
          storageKey: DASHBOARD_QUEUE_FILTER_STORAGE_KEY,
          allowedValues: QUEUE_FILTERS,
          defaultValue: 'ALL',
          queryParam: 'status',
          queryParamAliases: ['queueStatus', 'queueFilter', 'filter'],
          valueAliases: QUEUE_FILTER_VALUE_ALIASES,
          pathnameMatcher: isDashboardPathname,
          syncUrl: activeTab === 'QUEUE',
        });
        return { activeTab, queueFilter };
      },
      {},
    );

    expect(session3.result.activeTab).toBe('QUEUE');
    expect(session3.result.queueFilter).toBe('PendingProcedure');
    session3.unmount();
  });

  test('2. Preserves ANALYTICS tab, all 6 ReportType sub-tabs, and all 8 QueueFilter status tabs across refresh', () => {
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

    for (const qf of QUEUE_FILTERS) {
      setSessionItem(DASHBOARD_QUEUE_FILTER_STORAGE_KEY, qf);
      expect(
        resolveInitialPersistedTab({
          storageKey: DASHBOARD_QUEUE_FILTER_STORAGE_KEY,
          allowedValues: QUEUE_FILTERS,
          defaultValue: 'ALL',
          queryParam: 'status',
          queryParamAliases: ['queueStatus', 'queueFilter', 'filter'],
          valueAliases: QUEUE_FILTER_VALUE_ALIASES,
          pathnameMatcher: isDashboardPathname,
        }),
      ).toBe(qf);
    }
  });

  test('3. URL query params take priority on deep-link load, normalize case, and map queue status aliases', () => {
    setSessionItem(DASHBOARD_ACTIVE_TAB_STORAGE_KEY, 'QUEUE');
    setSessionItem(DASHBOARD_REPORT_TYPE_STORAGE_KEY, 'DAILY_EOD');
    setSessionItem(DASHBOARD_QUEUE_FILTER_STORAGE_KEY, 'ALL');
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

    // Queue status aliases
    expect(
      readPersistedTabFromSearch(
        '?status=waiting',
        QUEUE_FILTERS,
        'status',
        ['queueStatus', 'queueFilter', 'filter'],
        QUEUE_FILTER_VALUE_ALIASES,
      ),
    ).toBe('Waiting');
    expect(
      readPersistedTabFromSearch(
        '?queueStatus=triage',
        QUEUE_FILTERS,
        'status',
        ['queueStatus', 'queueFilter', 'filter'],
        QUEUE_FILTER_VALUE_ALIASES,
      ),
    ).toBe('Triaged');
    expect(
      readPersistedTabFromSearch(
        '?status=in-consultation',
        QUEUE_FILTERS,
        'status',
        ['queueStatus', 'queueFilter', 'filter'],
        QUEUE_FILTER_VALUE_ALIASES,
      ),
    ).toBe('InConsultation');
    expect(
      readPersistedTabFromSearch(
        '?status=procedure-bay',
        QUEUE_FILTERS,
        'status',
        ['queueStatus', 'queueFilter', 'filter'],
        QUEUE_FILTER_VALUE_ALIASES,
      ),
    ).toBe('PendingProcedure');
    expect(
      readPersistedTabFromSearch(
        '?filter=no-show',
        QUEUE_FILTERS,
        'status',
        ['queueStatus', 'queueFilter', 'filter'],
        QUEUE_FILTER_VALUE_ALIASES,
      ),
    ).toBe('NoShow');
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
    expect(dashboardSrc).toContain('usePersistedTab<QueueFilter>');
    expect(dashboardSrc).toContain('cleanupParamsByValue:');
    expect(dashboardSrc).toContain('omitDefaultFromUrl: true');
    expect(dashboardSrc).toContain('clearUrlOnInactive: true');
    expect(dashboardSrc).not.toContain('const syncDashboardRouteAndUrl =');
    expect(dashboardSrc).toContain('DASHBOARD_ACTIVE_TAB_STORAGE_KEY');
    expect(dashboardSrc).toContain('DASHBOARD_REPORT_TYPE_STORAGE_KEY');
    expect(dashboardSrc).toContain('DASHBOARD_QUEUE_FILTER_STORAGE_KEY');
    expect(dashboardSrc).toContain('usePersistedScrollPosition');
    expect(navSrc).toContain("path: 'dashboard'");
    expect(navSrc).toContain('report: String');
    expect(navSrc).toContain('status: String');
    expect(navSrc).toContain('queueStatus: String');
  });

  test('5. Automatic URL parameter cleanup across tabs and filters without manual screen logic', () => {
    const navParamsLog: Array<Record<string, any>> = [];
    const mockNavigation = {
      setParams: (p: Record<string, any>) => {
        navParamsLog.push(p);
      },
    };

    const harness = createHookHarness(
      () => {
        const [activeTab, setActiveTab] = usePersistedTab<DashboardTab>({
          storageKey: DASHBOARD_ACTIVE_TAB_STORAGE_KEY,
          allowedValues: DASHBOARD_TABS,
          defaultValue: 'QUEUE',
          queryParam: 'tab',
          pathnameMatcher: isDashboardPathname,
          navigation: mockNavigation,
          cleanupParamsByValue: {
            QUEUE: ['report', 'subTab', 'reportType'],
            REPORTS: ['status', 'queueStatus', 'queueFilter', 'filter'],
            ANALYTICS: ['status', 'queueStatus', 'queueFilter', 'filter', 'report', 'subTab', 'reportType'],
          },
        });
        const [reportType, setReportType] = usePersistedTab<ReportType>({
          storageKey: DASHBOARD_REPORT_TYPE_STORAGE_KEY,
          allowedValues: REPORT_TYPES,
          defaultValue: 'DAILY_EOD',
          queryParam: 'report',
          queryParamAliases: ['subTab', 'reportType'],
          pathnameMatcher: isDashboardPathname,
          syncUrl: activeTab === 'REPORTS',
          clearUrlOnInactive: true,
          navigation: mockNavigation,
        });
        const [queueFilter, setQueueFilter] = usePersistedTab<QueueFilter>({
          storageKey: DASHBOARD_QUEUE_FILTER_STORAGE_KEY,
          allowedValues: QUEUE_FILTERS,
          defaultValue: 'ALL',
          omitDefaultFromUrl: true,
          queryParam: 'status',
          queryParamAliases: ['queueStatus', 'queueFilter', 'filter'],
          valueAliases: QUEUE_FILTER_VALUE_ALIASES,
          pathnameMatcher: isDashboardPathname,
          syncUrl: activeTab === 'QUEUE',
          clearUrlOnInactive: true,
          navigation: mockNavigation,
        });
        return { activeTab, setActiveTab, reportType, setReportType, queueFilter, setQueueFilter };
      },
      {},
    );

    // Initial state: defaults, omitDefaultFromUrl keeps status clean
    expect(harness.result.activeTab).toBe('QUEUE');
    expect(harness.result.queueFilter).toBe('ALL');
    expect(currentHref).not.toContain('status=');
    expect(currentHref).not.toContain('report=');

    // 1. Select a non-default queue filter: status=Waiting appears in URL
    harness.result.setQueueFilter('Waiting');
    harness.rerender();
    expect(harness.result.queueFilter).toBe('Waiting');
    expect(currentHref).toContain('status=Waiting');
    expect(navParamsLog.some((p) => p.status === 'Waiting')).toBe(true);

    // 2. Switch tab to REPORTS: status must be automatically removed from URL by cleanupParamsByValue + clearUrlOnInactive
    harness.result.setActiveTab('REPORTS');
    harness.rerender();
    expect(harness.result.activeTab).toBe('REPORTS');
    expect(currentHref).toContain('tab=REPORTS');
    expect(currentHref).not.toContain('status=');
    expect(currentHref).not.toContain('Waiting');
    expect(navParamsLog.some((p) => p.status === undefined)).toBe(true);

    // 3. Set report sub-tab to CENSUS: report=CENSUS is synced
    harness.result.setReportType('CENSUS');
    harness.rerender();
    expect(harness.result.reportType).toBe('CENSUS');
    expect(currentHref).toContain('report=CENSUS');

    // 4. Switch to ANALYTICS tab: both report and status are stripped
    harness.result.setActiveTab('ANALYTICS');
    harness.rerender();
    expect(harness.result.activeTab).toBe('ANALYTICS');
    expect(currentHref).toContain('tab=ANALYTICS');
    expect(currentHref).not.toContain('report=');
    expect(currentHref).not.toContain('status=');

    // 5. Switch back to QUEUE: report is stripped, previous queue filter (Waiting) is restored to URL!
    harness.result.setActiveTab('QUEUE');
    harness.rerender();
    expect(harness.result.activeTab).toBe('QUEUE');
    expect(harness.result.queueFilter).toBe('Waiting');
    expect(currentHref).toContain('tab=QUEUE');
    expect(currentHref).toContain('status=Waiting');
    expect(currentHref).not.toContain('report=');

    // 6. Reset queue filter to ALL: omitDefaultFromUrl deletes status from URL
    harness.result.setQueueFilter('ALL');
    harness.rerender();
    expect(harness.result.queueFilter).toBe('ALL');
    expect(currentHref).not.toContain('status=');

    harness.unmount();
  });
});
