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

  test('2. Consultations Screen: activeChartTab, queueViewFilter, and station persist across refreshes', () => {
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
        const [queueViewFilter, setQueueViewFilter] = usePersistedTab({
          storageKey: 'clinicez:consultations:test_doctor:queueView',
          allowedValues: ['WaitingForDoctor', 'MyRoom', 'PendingProcedure', 'Completed', 'All'],
          defaultValue: 'WaitingForDoctor',
          queryParam: 'queueView',
          pathnameMatcher: (p: string) => p.includes('consultations'),
        });
        const [station, setStation] = usePersistedTab({
          storageKey: 'clinicez:consultations:test_doctor:station',
          defaultValue: 'ALL',
          queryParam: 'station',
          omitDefaultFromUrl: true,
          pathnameMatcher: (p: string) => p.includes('consultations'),
        });
        return { activeChartTab, setActiveChartTab, queueViewFilter, setQueueViewFilter, station, setStation };
      },
      {},
    );

    expect(s1.result.activeChartTab).toBe('summary');
    expect(s1.result.queueViewFilter).toBe('WaitingForDoctor');
    expect(s1.result.station).toBe('ALL');
    expect(currentHref).not.toContain('station=');

    s1.result.setActiveChartTab('diagnostics');
    s1.rerender();
    s1.result.setQueueViewFilter('MyRoom');
    s1.rerender();
    s1.result.setStation('Room 1');
    s1.rerender();

    expect(s1.result.activeChartTab).toBe('diagnostics');
    expect(s1.result.queueViewFilter).toBe('MyRoom');
    expect(s1.result.station).toBe('Room 1');
    expect(getSessionItem('clinicez_consultations_active_chart_tab')).toBe('diagnostics');
    expect(getSessionItem('clinicez:consultations:test_doctor:queueView')).toBe('MyRoom');
    expect(getSessionItem('clinicez:consultations:test_doctor:station')).toBe('Room 1');
    expect(currentHref).toContain('chartTab=diagnostics');
    expect(currentHref).toContain('queueView=MyRoom');
    expect(currentHref).toContain('station=Room+1');
    s1.unmount();

    // Refresh simulation with clean URL to test storage restoration
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
        const [queueViewFilter] = usePersistedTab({
          storageKey: 'clinicez:consultations:test_doctor:queueView',
          allowedValues: ['WaitingForDoctor', 'MyRoom', 'PendingProcedure', 'Completed', 'All'],
          defaultValue: 'WaitingForDoctor',
          queryParam: 'queueView',
          pathnameMatcher: (p: string) => p.includes('consultations'),
        });
        const [station] = usePersistedTab({
          storageKey: 'clinicez:consultations:test_doctor:station',
          defaultValue: 'ALL',
          queryParam: 'station',
          omitDefaultFromUrl: true,
          pathnameMatcher: (p: string) => p.includes('consultations'),
        });
        return { activeChartTab, queueViewFilter, station };
      },
      {},
    );
    expect(s2.result.activeChartTab).toBe('diagnostics');
    expect(s2.result.queueViewFilter).toBe('MyRoom');
    expect(s2.result.station).toBe('Room 1');
    s2.unmount();
  });

  test('3. Appointments Screen: viewMode, statusFilter, doctorId, and date persist across refreshes', () => {
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
        const [currentDate, setCurrentDate] = usePersistedTab({
          storageKey: 'clinicez_appointments_selected_date',
          defaultValue: '2026-11-13',
          queryParam: 'date',
          pathnameMatcher: (p: string) => p.includes('appointments'),
        });
        const [calendarDoctorId, setCalendarDoctorId] = usePersistedTab({
          storageKey: 'clinicez_appointments_doctor_id',
          defaultValue: 'ALL',
          queryParam: 'doctorId',
          omitDefaultFromUrl: true,
          pathnameMatcher: (p: string) => p.includes('appointments'),
        });
        return {
          viewMode,
          setViewMode,
          statusFilter,
          setStatusFilter,
          currentDate,
          setCurrentDate,
          calendarDoctorId,
          setCalendarDoctorId,
        };
      },
      {},
    );

    expect(s1.result.viewMode).toBe('month');
    expect(s1.result.statusFilter).toBe('ALL');
    expect(s1.result.calendarDoctorId).toBe('ALL');
    expect(currentHref).not.toContain('doctorId=');

    s1.result.setViewMode('week');
    s1.rerender();
    s1.result.setStatusFilter('Scheduled');
    s1.rerender();
    s1.result.setCurrentDate('2026-11-20');
    s1.rerender();
    s1.result.setCalendarDoctorId('doc_maria_123');
    s1.rerender();

    expect(s1.result.viewMode).toBe('week');
    expect(s1.result.statusFilter).toBe('Scheduled');
    expect(s1.result.currentDate).toBe('2026-11-20');
    expect(s1.result.calendarDoctorId).toBe('doc_maria_123');
    expect(currentHref).toContain('view=week');
    expect(currentHref).toContain('status=Scheduled');
    expect(currentHref).toContain('date=2026-11-20');
    expect(currentHref).toContain('doctorId=doc_maria_123');
    s1.unmount();

    // Refresh simulation
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
        const [currentDate] = usePersistedTab({
          storageKey: 'clinicez_appointments_selected_date',
          defaultValue: '2026-11-13',
          queryParam: 'date',
          pathnameMatcher: (p: string) => p.includes('appointments'),
        });
        const [calendarDoctorId] = usePersistedTab({
          storageKey: 'clinicez_appointments_doctor_id',
          defaultValue: 'ALL',
          queryParam: 'doctorId',
          omitDefaultFromUrl: true,
          pathnameMatcher: (p: string) => p.includes('appointments'),
        });
        return { viewMode, statusFilter, currentDate, calendarDoctorId };
      },
      {},
    );
    expect(s2.result.viewMode).toBe('week');
    expect(s2.result.statusFilter).toBe('Scheduled');
    expect(s2.result.currentDate).toBe('2026-11-20');
    expect(s2.result.calendarDoctorId).toBe('doc_maria_123');
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

  test('5. Dashboard Reports: reportsPreset, reportsStartDate, reportsEndDate, and eodDate persist across refreshes', () => {
    currentHref = 'http://localhost:8081/dashboard?tab=REPORTS';
    const d1 = createHookHarness(
      () => {
        const [reportType, setReportType] = usePersistedTab({
          storageKey: 'clinicez_dashboard_report_type',
          allowedValues: ['DAILY_EOD', 'CENSUS', 'DISPENSING_LEDGER', 'MORBIDITY', 'TAX_DISCOUNT', 'DOCTOR_SHARES'],
          defaultValue: 'DAILY_EOD',
          queryParam: 'report',
          pathnameMatcher: (p: string) => p.includes('dashboard'),
        });
        const [reportsPreset, setReportsPreset] = usePersistedTab({
          storageKey: 'clinicez_dashboard_reports_preset',
          allowedValues: ['today', 'yesterday', '7d', '30d', 'custom'],
          defaultValue: 'today',
          queryParam: 'repPreset',
          omitDefaultFromUrl: true,
          pathnameMatcher: (p: string) => p.includes('dashboard'),
        });
        const [reportsStartDate, setReportsStartDate] = usePersistedTab({
          storageKey: 'clinicez_dashboard_reports_start',
          defaultValue: '2026-11-13',
          queryParam: 'repStart',
          pathnameMatcher: (p: string) => p.includes('dashboard'),
        });
        const [reportsEndDate, setReportsEndDate] = usePersistedTab({
          storageKey: 'clinicez_dashboard_reports_end',
          defaultValue: '2026-11-13',
          queryParam: 'repEnd',
          pathnameMatcher: (p: string) => p.includes('dashboard'),
        });
        const [eodDate, setEodDate] = usePersistedTab({
          storageKey: 'clinicez_dashboard_eod_date',
          defaultValue: '2026-11-13',
          queryParam: 'eodDate',
          pathnameMatcher: (p: string) => p.includes('dashboard'),
        });
        return {
          reportType,
          setReportType,
          reportsPreset,
          setReportsPreset,
          reportsStartDate,
          setReportsStartDate,
          reportsEndDate,
          setReportsEndDate,
          eodDate,
          setEodDate,
        };
      },
      {},
    );

    expect(d1.result.reportType).toBe('DAILY_EOD');
    expect(d1.result.reportsPreset).toBe('today');
    expect(currentHref).not.toContain('repPreset=');

    // Switch reportType to CENSUS and preset to 30d
    d1.result.setReportType('CENSUS');
    d1.rerender();
    d1.result.setReportsPreset('30d');
    d1.rerender();
    d1.result.setReportsStartDate('2026-10-15');
    d1.rerender();
    d1.result.setReportsEndDate('2026-11-13');
    d1.rerender();
    d1.result.setEodDate('2026-11-12');
    d1.rerender();

    expect(d1.result.reportType).toBe('CENSUS');
    expect(d1.result.reportsPreset).toBe('30d');
    expect(d1.result.reportsStartDate).toBe('2026-10-15');
    expect(d1.result.reportsEndDate).toBe('2026-11-13');
    expect(d1.result.eodDate).toBe('2026-11-12');
    expect(currentHref).toContain('report=CENSUS');
    expect(currentHref).toContain('repPreset=30d');
    expect(currentHref).toContain('repStart=2026-10-15');
    expect(currentHref).toContain('repEnd=2026-11-13');
    expect(currentHref).toContain('eodDate=2026-11-12');
    d1.unmount();

    // Refresh simulation
    currentHref = 'http://localhost:8081/dashboard?tab=REPORTS';
    const d2 = createHookHarness(
      () => {
        const [reportType] = usePersistedTab({
          storageKey: 'clinicez_dashboard_report_type',
          allowedValues: ['DAILY_EOD', 'CENSUS', 'DISPENSING_LEDGER', 'MORBIDITY', 'TAX_DISCOUNT', 'DOCTOR_SHARES'],
          defaultValue: 'DAILY_EOD',
          queryParam: 'report',
          pathnameMatcher: (p: string) => p.includes('dashboard'),
        });
        const [reportsPreset] = usePersistedTab({
          storageKey: 'clinicez_dashboard_reports_preset',
          allowedValues: ['today', 'yesterday', '7d', '30d', 'custom'],
          defaultValue: 'today',
          queryParam: 'repPreset',
          omitDefaultFromUrl: true,
          pathnameMatcher: (p: string) => p.includes('dashboard'),
        });
        const [reportsStartDate] = usePersistedTab({
          storageKey: 'clinicez_dashboard_reports_start',
          defaultValue: '2026-11-13',
          queryParam: 'repStart',
          pathnameMatcher: (p: string) => p.includes('dashboard'),
        });
        const [reportsEndDate] = usePersistedTab({
          storageKey: 'clinicez_dashboard_reports_end',
          defaultValue: '2026-11-13',
          queryParam: 'repEnd',
          pathnameMatcher: (p: string) => p.includes('dashboard'),
        });
        const [eodDate] = usePersistedTab({
          storageKey: 'clinicez_dashboard_eod_date',
          defaultValue: '2026-11-13',
          queryParam: 'eodDate',
          pathnameMatcher: (p: string) => p.includes('dashboard'),
        });
        return { reportType, reportsPreset, reportsStartDate, reportsEndDate, eodDate };
      },
      {},
    );

    expect(d2.result.reportType).toBe('CENSUS');
    expect(d2.result.reportsPreset).toBe('30d');
    expect(d2.result.reportsStartDate).toBe('2026-10-15');
    expect(d2.result.reportsEndDate).toBe('2026-11-13');
    expect(d2.result.eodDate).toBe('2026-11-12');
    d2.unmount();
  });

  test('6. Audit Logs: category, severity, datePreset, custom dates, and search query persist across refreshes', () => {
    currentHref = 'http://localhost:8081/audit';
    const a1 = createHookHarness(
      () => {
        const [category, setCategory] = usePersistedTab({
          storageKey: 'clinicez_audit_category',
          allowedValues: ['All', 'Security', 'Operations', 'Billing', 'Clinical Access', 'PhilHealth Yakap'],
          defaultValue: 'All',
          queryParam: 'category',
          omitDefaultFromUrl: true,
          pathnameMatcher: (p: string) => p.includes('audit'),
        });
        const [severity, setSeverity] = usePersistedTab({
          storageKey: 'clinicez_audit_severity',
          allowedValues: ['All', 'Emergency', 'Urgent', 'Routine'],
          defaultValue: 'All',
          queryParam: 'severity',
          omitDefaultFromUrl: true,
          pathnameMatcher: (p: string) => p.includes('audit'),
        });
        const [datePreset, setDatePreset] = usePersistedTab({
          storageKey: 'clinicez_audit_date_preset',
          allowedValues: ['today', '24h', '7d', '30d', 'all', 'custom'],
          defaultValue: '7d',
          queryParam: 'preset',
          omitDefaultFromUrl: true,
          pathnameMatcher: (p: string) => p.includes('audit'),
        });
        const [search, setSearch] = usePersistedTab({
          storageKey: 'clinicez_audit_search',
          defaultValue: '',
          queryParam: 'q',
          omitDefaultFromUrl: true,
          allowEmpty: true,
          pathnameMatcher: (p: string) => p.includes('audit'),
        });
        return { category, setCategory, severity, setSeverity, datePreset, setDatePreset, search, setSearch };
      },
      {},
    );

    expect(a1.result.category).toBe('All');
    expect(a1.result.severity).toBe('All');
    expect(a1.result.datePreset).toBe('7d');
    expect(a1.result.search).toBe('');
    expect(currentHref).not.toContain('category=');
    expect(currentHref).not.toContain('severity=');
    expect(currentHref).not.toContain('preset=');
    expect(currentHref).not.toContain('q=');

    a1.result.setCategory('Security');
    a1.rerender();
    a1.result.setSeverity('Emergency');
    a1.rerender();
    a1.result.setDatePreset('30d');
    a1.rerender();
    a1.result.setSearch('auth_failure');
    a1.rerender();

    expect(a1.result.category).toBe('Security');
    expect(a1.result.severity).toBe('Emergency');
    expect(a1.result.datePreset).toBe('30d');
    expect(a1.result.search).toBe('auth_failure');
    expect(currentHref).toContain('category=Security');
    expect(currentHref).toContain('severity=Emergency');
    expect(currentHref).toContain('preset=30d');
    expect(currentHref).toContain('q=auth_failure');
    expect(getSessionItem('clinicez_audit_category')).toBe('Security');
    expect(getSessionItem('clinicez_audit_severity')).toBe('Emergency');
    expect(getSessionItem('clinicez_audit_date_preset')).toBe('30d');
    expect(getSessionItem('clinicez_audit_search')).toBe('auth_failure');
    a1.unmount();

    // Refresh simulation
    currentHref = 'http://localhost:8081/audit';
    const a2 = createHookHarness(
      () => {
        const [category] = usePersistedTab({
          storageKey: 'clinicez_audit_category',
          allowedValues: ['All', 'Security', 'Operations', 'Billing', 'Clinical Access', 'PhilHealth Yakap'],
          defaultValue: 'All',
          queryParam: 'category',
          omitDefaultFromUrl: true,
          pathnameMatcher: (p: string) => p.includes('audit'),
        });
        const [severity] = usePersistedTab({
          storageKey: 'clinicez_audit_severity',
          allowedValues: ['All', 'Emergency', 'Urgent', 'Routine'],
          defaultValue: 'All',
          queryParam: 'severity',
          omitDefaultFromUrl: true,
          pathnameMatcher: (p: string) => p.includes('audit'),
        });
        const [datePreset] = usePersistedTab({
          storageKey: 'clinicez_audit_date_preset',
          allowedValues: ['today', '24h', '7d', '30d', 'all', 'custom'],
          defaultValue: '7d',
          queryParam: 'preset',
          omitDefaultFromUrl: true,
          pathnameMatcher: (p: string) => p.includes('audit'),
        });
        const [search] = usePersistedTab({
          storageKey: 'clinicez_audit_search',
          defaultValue: '',
          queryParam: 'q',
          omitDefaultFromUrl: true,
          allowEmpty: true,
          pathnameMatcher: (p: string) => p.includes('audit'),
        });
        return { category, severity, datePreset, search };
      },
      {},
    );

    expect(a2.result.category).toBe('Security');
    expect(a2.result.severity).toBe('Emergency');
    expect(a2.result.datePreset).toBe('30d');
    expect(a2.result.search).toBe('auth_failure');
    a2.unmount();
  });

  test('7. Static Source Verification: All target screens and Navigation.tsx use usePersistedTab and linking.parse', () => {
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

    const auditSrc = fs.readFileSync(path.resolve(__dirname, '../components/audit/AuditWorkstationView.tsx'), 'utf8');
    expect(auditSrc).toContain('usePersistedTab');

    const navSrc = fs.readFileSync(path.resolve(__dirname, '../navigation/Navigation.tsx'), 'utf8');
    expect(navSrc).toContain('filter: String');
    expect(navSrc).toContain('view: String');
    expect(navSrc).toContain('chartTab: String');
    expect(navSrc).toContain('queueView: String');
    expect(navSrc).toContain('station: String');
    expect(navSrc).toContain('doctorId: String');
    expect(navSrc).toContain('date: String');
    expect(navSrc).toContain('repPreset: String');
    expect(navSrc).toContain('repStart: String');
    expect(navSrc).toContain('repEnd: String');
    expect(navSrc).toContain('eodDate: String');
    expect(navSrc).toContain('mode: String');
    expect(navSrc).toContain('state: String');
    expect(navSrc).toContain('scope: String');
  });
});
