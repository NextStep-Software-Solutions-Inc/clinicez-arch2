// token-guard:ignore-file
import { describe, expect, it, beforeEach, mock } from 'bun:test';

mock.module('react-native', () => ({
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
  },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: {
    OS: 'android',
    Version: 34,
  },
  Share: {
    share: async () => ({ action: 'sharedAction' }),
    dismissedAction: 'dismissedAction',
  },
}));

const {
  clearLastCrashReport,
  formatCrashReport,
  getLastCrashReport,
  initGlobalErrorHandlers,
  recordCrash,
  shareCrashReport,
  subscribeCrash,
} = await import('../services/crashReporter');

describe('CrashReporter & Error Diagnostics Service', () => {
  beforeEach(() => {
    clearLastCrashReport();
  });

  it('records, structures, and persists a crash report', () => {
    const report = recordCrash({
      source: 'ErrorBoundary',
      name: 'TypeError',
      message: 'Cannot read properties of undefined (reading "title")',
      stack: 'TypeError: Cannot read properties of undefined\n    at WorkstationSidebar (WorkstationSidebar.tsx:142)',
      componentStack: 'in WorkstationSidebar\n    in ResponsiveLayout\n    in DashboardScreen',
      isFatal: true,
    });

    expect(report.id).toBeDefined();
    expect(report.source).toBe('ErrorBoundary');
    expect(report.name).toBe('TypeError');
    expect(report.message).toContain('Cannot read properties of undefined');
    expect(report.stack).toContain('WorkstationSidebar.tsx:142');
    expect(report.componentStack).toContain('ResponsiveLayout');
    expect(report.isFatal).toBe(true);
    expect(report.platform).toBe('android');
    expect(report.formattedTime).toBeDefined();
    expect(report.windowDimensions).toEqual({ width: 1280, height: 800 });

    // Verify it was persisted to storage
    const stored = getLastCrashReport();
    expect(stored).not.toBeNull();
    expect(stored?.id).toBe(report.id);
    expect(stored?.message).toBe(report.message);
  });

  it('clears persisted crash report on demand', () => {
    recordCrash({
      source: 'GlobalError',
      name: 'NetworkError',
      message: 'Failed to reach clinic server',
    });

    expect(getLastCrashReport()).not.toBeNull();
    clearLastCrashReport();
    expect(getLastCrashReport()).toBeNull();
  });

  it('formats crash report into clean markdown diagnostics for developers and support', () => {
    const sampleReport = {
      id: 'crash-12345',
      timestamp: '2026-10-16T04:30:00.000Z',
      formattedTime: '10/16/2026, 12:30:00 PM PST',
      source: 'ErrorBoundary' as const,
      name: 'ReferenceError',
      message: 'variable is not defined',
      stack: 'ReferenceError: variable is not defined\n    at Screen.tsx:42',
      componentStack: 'in Screen\n    in App',
      platform: 'android',
      osVersion: '14',
      windowDimensions: { width: 1280, height: 800 },
      workspace: 'nextstep',
      clinicId: 'clinic-xyz',
      serverUrl: 'http://192.168.1.100:5245',
      isFatal: true,
    };

    const formatted = formatCrashReport(sampleReport);

    expect(formatted).toContain('CLINIC EZ - CRASH / ERROR REPORT');
    expect(formatted).toContain('Report ID:    crash-12345');
    expect(formatted).toContain('Workspace:    nextstep');
    expect(formatted).toContain('Platform:     android (OS 14)');
    expect(formatted).toContain('Type:    ReferenceError');
    expect(formatted).toContain('Message: variable is not defined');
    expect(formatted).toContain('CALL STACK TRACE');
    expect(formatted).toContain('Screen.tsx:42');
    expect(formatted).toContain('REACT COMPONENT STACK');
    expect(formatted).toContain('in Screen');
  });

  it('notifies active crash listeners when a crash is recorded', () => {
    let notifiedReport: any = null;
    const unsubscribe = subscribeCrash((report) => {
      notifiedReport = report;
    });

    recordCrash({
      source: 'UnhandledPromiseRejection',
      name: 'PromiseRejection',
      message: 'Unhandled async failure',
    });

    expect(notifiedReport).not.toBeNull();
    expect(notifiedReport?.message).toBe('Unhandled async failure');

    unsubscribe();
  });

  it('initializes global error handlers idempotently and returns cleanup', () => {
    const cleanup1 = initGlobalErrorHandlers();
    const cleanup2 = initGlobalErrorHandlers();

    expect(typeof cleanup1).toBe('function');
    expect(typeof cleanup2).toBe('function');

    cleanup1();
    cleanup2();
  });

  it('shares crash report via platform share', async () => {
    const sample = recordCrash({
      source: 'GlobalError',
      name: 'TestError',
      message: 'Something crashed',
    });

    const mockShare = async (opts: { title: string; message: string }) => {
      expect(opts.title).toContain('TestError');
      expect(opts.message).toContain('Something crashed');
      return { action: 'sharedAction' };
    };

    const success = await shareCrashReport(sample, mockShare);
    expect(success).toBe(true);
  });
});
