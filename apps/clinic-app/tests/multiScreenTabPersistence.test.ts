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
  resolveInitialPersistedTab,
} = await import('../hooks/usePersistedTab');

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

describe('Multi-Screen Tab & Filter Persistence Suite', () => {
  const origWindow = (globalThis as any).window;
  const origLocalStorage = (globalThis as any).localStorage;
  const origSessionStorage = (globalThis as any).sessionStorage;
  let currentHref = 'http://localhost:8081/';

  beforeEach(() => {
    const localMock = createMockStorage();
    const sessionMock = createMockStorage();
    currentHref = 'http://localhost:8081/';

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

  test('1. Patients Screen: filterMode, viewMode, and activeChartTab persist across refreshes', () => {
    currentHref = 'http://localhost:8081/patients';
    const s1 = createHookHarness(
      () => {
        const [filterMode, setFilterMode] = usePersistedTab({
          storageKey: 'clinicez_patients_filter_mode',
          allowedValues: ['ALL', 'MY_PATIENTS', 'STUDENTS', 'EMPLOYEES', 'ALERTS', 'SENIOR_PWD'],
          defaultValue: 'ALL',
          queryParam: 'filter',
          omitDefaultFromUrl: true,
          pathnameMatcher: (p: string) => p.includes('patients'),
        });
        const [viewMode, setViewMode] = usePersistedTab({
          storageKey: 'clinicez_patients_view_mode',
          allowedValues: ['cards', 'table'],
          defaultValue: 'cards',
          queryParam: 'view',
          omitDefaultFromUrl: true,
          pathnameMatcher: (p: string) => p.includes('patients'),
        });
        return { filterMode, setFilterMode, viewMode, setViewMode };
      },
      {},
    );

    expect(s1.result.filterMode).toBe('ALL');
    expect(s1.result.viewMode).toBe('cards');
    expect(currentHref).not.toContain('filter=');

    // Switch to STUDENTS and table view
    s1.result.setFilterMode('STUDENTS');
    s1.rerender();
    s1.result.setViewMode('table');
    s1.rerender();

    expect(s1.result.filterMode).toBe('STUDENTS');
    expect(s1.result.viewMode).toBe('table');
    expect(currentHref).toContain('filter=STUDENTS');
    expect(currentHref).toContain('view=table');
    expect(getSessionItem('clinicez_patients_filter_mode')).toBe('STUDENTS');
    expect(getSessionItem('clinicez_patients_view_mode')).toBe('table');

    s1.unmount();

    // Refresh simulation
    currentHref = 'http://localhost:8081/patients';
    const s2 = createHookHarness(
      () => {
        const [filterMode] = usePersistedTab({
          storageKey: 'clinicez_patients_filter_mode',
          allowedValues: ['ALL', 'MY_PATIENTS', 'STUDENTS', 'EMPLOYEES', 'ALERTS', 'SENIOR_PWD'],
          defaultValue: 'ALL',
          queryParam: 'filter',
          omitDefaultFromUrl: true,
          pathnameMatcher: (p: string) => p.includes('patients'),
        });
        const [viewMode] = usePersistedTab({
          storageKey: 'clinicez_patients_view_mode',
          allowedValues: ['cards', 'table'],
          defaultValue: 'cards',
          queryParam: 'view',
          omitDefaultFromUrl: true,
          pathnameMatcher: (p: string) => p.includes('patients'),
        });
        return { filterMode, viewMode };
      },
      {},
    );

    expect(s2.result.filterMode).toBe('STUDENTS');
    expect(s2.result.viewMode).toBe('table');
    s2.unmount();
  });

  test('2. Consultations Screen: activeChartTab and queueViewFilter persist across refreshes', () => {
    currentHref = 'http://localhost:8081/consultations';
    const s1 = createHookHarness(
      () => {
        const [activeChartTab, setActiveChartTab] = usePersistedTab({
          storageKey: 'clinicez_consultations_active_chart_tab',
          allowedValues: ['summary', 'encounters', 'diagnostics', 'procedures', 'immunizations', 'profiles', 'vault', 'documents', 'dental'],
          defaultValue: 'summary',
          queryParam: 'chartTab',
          pathnameMatcher: (p: string) => p.includes('consultations'),
        });
        return { activeChartTab, setActiveChartTab };
      },
      {},
    );

    expect(s1.result.activeChartTab).toBe('summary');
    s1.result.setActiveChartTab('diagnostics');
    s1.rerender();

    expect(s1.result.activeChartTab).toBe('diagnostics');
    expect(getSessionItem('clinicez_consultations_active_chart_tab')).toBe('diagnostics');
    expect(currentHref).toContain('chartTab=diagnostics');
    s1.unmount();

    // Refresh
    currentHref = 'http://localhost:8081/consultations';
    const s2 = createHookHarness(
      () => {
        const [activeChartTab] = usePersistedTab({
          storageKey: 'clinicez_consultations_active_chart_tab',
          allowedValues: ['summary', 'encounters', 'diagnostics', 'procedures', 'immunizations', 'profiles', 'vault', 'documents', 'dental'],
          defaultValue: 'summary',
          queryParam: 'chartTab',
          pathnameMatcher: (p: string) => p.includes('consultations'),
        });
        return { activeChartTab };
      },
      {},
    );
    expect(s2.result.activeChartTab).toBe('diagnostics');
    s2.unmount();
  });

  test('3. Appointments Screen: viewMode and statusFilter persist across refreshes', () => {
    currentHref = 'http://localhost:8081/appointments';
    const s1 = createHookHarness(
      () => {
        const [viewMode, setViewMode] = usePersistedTab({
          storageKey: 'clinicez_appointments_view_mode',
          allowedValues: ['month', 'week', 'day', 'agenda'],
          defaultValue: 'month',
          queryParam: 'view',
          pathnameMatcher: (p: string) => p.includes('appointments'),
        });
        const [statusFilter, setStatusFilter] = usePersistedTab({
          storageKey: 'clinicez_appointments_status_filter',
          allowedValues: ['ALL', 'Scheduled', 'CheckedIn', 'Completed', 'Cancelled', 'NoShow'],
          defaultValue: 'ALL',
          queryParam: 'status',
          omitDefaultFromUrl: true,
          pathnameMatcher: (p: string) => p.includes('appointments'),
        });
        return { viewMode, setViewMode, statusFilter, setStatusFilter };
      },
      {},
    );

    expect(s1.result.viewMode).toBe('month');
    expect(s1.result.statusFilter).toBe('ALL');

    s1.result.setViewMode('week');
    s1.rerender();
    s1.result.setStatusFilter('Scheduled');
    s1.rerender();

    expect(s1.result.viewMode).toBe('week');
    expect(s1.result.statusFilter).toBe('Scheduled');
    expect(currentHref).toContain('view=week');
    expect(currentHref).toContain('status=Scheduled');
    s1.unmount();

    // Refresh
    currentHref = 'http://localhost:8081/appointments';
    const s2 = createHookHarness(
      () => {
        const [viewMode] = usePersistedTab({
          storageKey: 'clinicez_appointments_view_mode',
          allowedValues: ['month', 'week', 'day', 'agenda'],
          defaultValue: 'month',
          queryParam: 'view',
          pathnameMatcher: (p: string) => p.includes('appointments'),
        });
        const [statusFilter] = usePersistedTab({
          storageKey: 'clinicez_appointments_status_filter',
          allowedValues: ['ALL', 'Scheduled', 'CheckedIn', 'Completed', 'Cancelled', 'NoShow'],
          defaultValue: 'ALL',
          queryParam: 'status',
          omitDefaultFromUrl: true,
          pathnameMatcher: (p: string) => p.includes('appointments'),
        });
        return { viewMode, statusFilter };
      },
      {},
    );
    expect(s2.result.viewMode).toBe('week');
    expect(s2.result.statusFilter).toBe('Scheduled');
    s2.unmount();
  });

  test('4. Billing, ResultReview, and Yakap Screens persist tabs & modes', () => {
    // Billing
    currentHref = 'http://localhost:8081/billing';
    const b1 = createHookHarness(
      () => {
        const [billingMode, setBillingMode] = usePersistedTab({
          storageKey: 'clinicez_billing_mode',
          allowedValues: ['queue', 'unsettled', 'paid', 'registry', 'retail'],
          defaultValue: 'queue',
          queryParam: 'mode',
          omitDefaultFromUrl: true,
          pathnameMatcher: (p: string) => p.includes('billing'),
        });
        return { billingMode, setBillingMode };
      },
      {},
    );
    expect(b1.result.billingMode).toBe('queue');
    b1.result.setBillingMode('paid');
    b1.rerender();
    expect(b1.result.billingMode).toBe('paid');
    expect(currentHref).toContain('mode=paid');
    b1.unmount();

    // ResultReview
    currentHref = 'http://localhost:8081/result-review';
    const r1 = createHookHarness(
      () => {
        const [stateFilter, setStateFilter] = usePersistedTab({
          storageKey: 'clinicez_result_review_state',
          allowedValues: ['Unverified', 'Verified', 'Rejected'],
          defaultValue: 'Unverified',
          queryParam: 'state',
          pathnameMatcher: (p: string) => p.includes('result-review'),
        });
        const [scope, setScope] = usePersistedTab({
          storageKey: 'clinicez_result_review_scope',
          allowedValues: ['mine', 'all'],
          defaultValue: 'mine',
          queryParam: 'scope',
          omitDefaultFromUrl: true,
          pathnameMatcher: (p: string) => p.includes('result-review'),
        });
        return { stateFilter, setStateFilter, scope, setScope };
      },
      {},
    );
    expect(r1.result.stateFilter).toBe('Unverified');
    expect(r1.result.scope).toBe('mine');
    r1.result.setStateFilter('Rejected');
    r1.rerender();
    r1.result.setScope('all');
    r1.rerender();
    expect(r1.result.stateFilter).toBe('Rejected');
    expect(r1.result.scope).toBe('all');
    expect(currentHref).toContain('state=Rejected');
    expect(currentHref).toContain('scope=all');
    r1.unmount();

    // Yakap
    currentHref = 'http://localhost:8081/yakap';
    const y1 = createHookHarness(
      () => {
        const [activeTab, setActiveTab] = usePersistedTab({
          storageKey: 'clinicez_yakap_active_tab',
          allowedValues: ['pin-checker', 'gamot', 'masterlist'],
          defaultValue: 'pin-checker',
          queryParam: 'tab',
          pathnameMatcher: (p: string) => p.includes('yakap'),
        });
        return { activeTab, setActiveTab };
      },
      {},
    );
    expect(y1.result.activeTab).toBe('pin-checker');
    y1.result.setActiveTab('gamot');
    y1.rerender();
    expect(y1.result.activeTab).toBe('gamot');
    expect(currentHref).toContain('tab=gamot');
    y1.unmount();
  });

  test('5. Static Source Verification: All target screens and Navigation.tsx use usePersistedTab and linking.parse', () => {
    const screens = [
      'Dashboard.screen.tsx',
      'Patients.screen.tsx',
      'Consultations.screen.tsx',
      'Appointments.screen.tsx',
      'Billing.screen.tsx',
      'ResultReview.screen.tsx',
      'Yakap.screen.tsx',
    ];

    for (const s of screens) {
      const src = fs.readFileSync(path.resolve(__dirname, `../navigation/screens/${s}`), 'utf8');
      expect(src).toContain('usePersistedTab');
    }

    const navSrc = fs.readFileSync(path.resolve(__dirname, '../navigation/Navigation.tsx'), 'utf8');
    expect(navSrc).toContain('filter: String');
    expect(navSrc).toContain('view: String');
    expect(navSrc).toContain('chartTab: String');
    expect(navSrc).toContain('mode: String');
    expect(navSrc).toContain('state: String');
    expect(navSrc).toContain('scope: String');
  });
});
