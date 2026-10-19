import { Dimensions, Platform } from 'react-native';
import { getDeviceItem, setDeviceItem } from '../utils/deviceStorage';
import { resolveTenantContext, getStoredTenantSlug } from '@shared/safe';
import { getStoredServerUrl, getApiBaseUrl } from './runtimeConfig';

export interface CrashReport {
  id: string;
  timestamp: string;
  formattedTime: string;
  source: 'ErrorBoundary' | 'GlobalError' | 'UnhandledPromiseRejection';
  message: string;
  name: string;
  stack?: string;
  componentStack?: string;
  platform: string;
  osVersion: string | number;
  windowDimensions: { width: number; height: number };
  workspace?: string | null;
  clinicId?: string | null;
  serverUrl?: string | null;
  isFatal?: boolean;
}

const LAST_CRASH_STORAGE_KEY = 'clinicez.lastCrashReport';

type CrashListener = (report: CrashReport) => void;
const listeners = new Set<CrashListener>();

/**
 * Formats a structured crash report into a clean, human-readable text document
 * that can be directly copied or shared with developers / technical support.
 */
export function formatCrashReport(report: CrashReport): string {
  const lines: string[] = [
    '========================================',
    ' CLINIC EZ - CRASH / ERROR REPORT',
    '========================================',
    `Report ID:    ${report.id}`,
    `Timestamp:    ${report.formattedTime} (${report.timestamp})`,
    `Triggered By: ${report.source}`,
    `Severity:     ${report.isFatal ? 'FATAL' : 'NON-FATAL'}`,
    '',
    '----------------------------------------',
    ' ENVIRONMENT & CONTEXT',
    '----------------------------------------',
    `Platform:     ${report.platform} (OS ${report.osVersion})`,
    `Screen Size:  ${report.windowDimensions.width}x${report.windowDimensions.height}`,
    `Workspace:    ${report.workspace || '(none)'}`,
    `Clinic ID:    ${report.clinicId || '(none)'}`,
    `Server URL:   ${report.serverUrl || '(none)'}`,
    '',
    '----------------------------------------',
    ' ERROR SUMMARY',
    '----------------------------------------',
    `Type:    ${report.name}`,
    `Message: ${report.message}`,
  ];

  if (report.stack) {
    lines.push(
      '',
      '----------------------------------------',
      ' CALL STACK TRACE',
      '----------------------------------------',
      report.stack.trim()
    );
  }

  if (report.componentStack) {
    lines.push(
      '',
      '----------------------------------------',
      ' REACT COMPONENT STACK',
      '----------------------------------------',
      report.componentStack.trim()
    );
  }

  lines.push(
    '',
    '========================================',
    ' END OF CRASH REPORT',
    '========================================'
  );

  return lines.join('\n');
}

/**
 * Gathers system environment, current workspace, and server config snapshot.
 */
function getSystemContext() {
  let dims = { width: 0, height: 0 };
  try {
    const window = Dimensions.get('window');
    dims = { width: Math.round(window.width), height: Math.round(window.height) };
  } catch {
    // Ignore dimension resolution failures
  }

  const tenantCtx = resolveTenantContext();
  const workspace = getStoredTenantSlug() || tenantCtx.facilitySlug || tenantCtx.tenantSlug;
  const clinicId = tenantCtx.clinicId;
  const serverUrl = getStoredServerUrl() || getApiBaseUrl();

  return {
    platform: Platform.OS,
    osVersion: Platform.Version ?? 'unknown',
    windowDimensions: dims,
    workspace: workspace || null,
    clinicId: clinicId || null,
    serverUrl: serverUrl || null,
  };
}

/**
 * Records a crash report both in memory and persisted into device storage,
 * and notifies active listeners (e.g. error boundary or crash notification).
 */
export function recordCrash(input: {
  source: CrashReport['source'];
  message: string;
  name?: string;
  stack?: string;
  componentStack?: string;
  isFatal?: boolean;
}): CrashReport {
  const now = new Date();
  const context = getSystemContext();

  const report: CrashReport = {
    id: `crash-${now.getTime()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: now.toISOString(),
    formattedTime: now.toLocaleString('en-PH', { timeZoneName: 'short' }),
    source: input.source,
    message: input.message || 'Unknown error occurred.',
    name: input.name || 'Error',
    stack: input.stack,
    componentStack: input.componentStack,
    isFatal: input.isFatal ?? true,
    ...context,
  };

  try {
    setDeviceItem(LAST_CRASH_STORAGE_KEY, JSON.stringify(report));
  } catch (err) {
    console.warn('[crashReporter] Failed to persist crash report:', err);
  }

  listeners.forEach((listener) => {
    try {
      listener(report);
    } catch {
      // Ignore listener error
    }
  });

  return report;
}

/**
 * Retrieves the last persisted crash report, if any exists on this device.
 */
export function getLastCrashReport(): CrashReport | null {
  try {
    const raw = getDeviceItem(LAST_CRASH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CrashReport;
  } catch {
    return null;
  }
}

/**
 * Clears the persisted crash report once acknowledged by the user or support.
 */
export function clearLastCrashReport(): void {
  try {
    setDeviceItem(LAST_CRASH_STORAGE_KEY, null);
  } catch {
    // Ignore storage deletion error
  }
}

/**
 * Subscribes to crash events (for active modals or toast alerts).
 */
export function subscribeCrash(listener: CrashListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Shares or copies the formatted crash report via the platform share sheet or clipboard.
 */
export async function shareCrashReport(
  report: CrashReport,
  customShare?: (options: { title: string; message: string }) => Promise<any>
): Promise<boolean> {
  const text = formatCrashReport(report);

  // 1. Try web clipboard if available
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback to Share API
    }
  }

  // 2. Custom or dynamic Share
  if (typeof customShare === 'function') {
    try {
      const res = await customShare({
        title: `Clinic EZ Crash Report (${report.name})`,
        message: text,
      });
      return !!res;
    } catch {
      return false;
    }
  }

  // 3. Cross-platform Share Sheet (Android/iOS supports "Copy to Clipboard", Gmail, Slack, etc.)
  try {
    const rn = require('react-native');
    const ShareModule = rn?.Share;
    if (ShareModule?.share) {
      const result = await ShareModule.share({
        title: `Clinic EZ Crash Report (${report.name})`,
        message: text,
      });
      return result.action !== ShareModule.dismissedAction;
    }
  } catch (err) {
    console.warn('[crashReporter] Share error:', err);
  }

  return false;
}

/**
 * Hooks into the React Native and JS global error handling mechanisms to capture
 * fatal exceptions and unhandled promise rejections before native termination.
 */
let handlersInitialized = false;

export function initGlobalErrorHandlers(): () => void {
  if (handlersInitialized) return () => {};
  handlersInitialized = true;

  // 1. React Native global uncaught exception handler
  const globalObj = typeof globalThis !== 'undefined' ? globalThis : (global as any);
  const errorUtils = globalObj?.ErrorUtils;

  let originalGlobalHandler: ((error: any, isFatal?: boolean) => void) | undefined;
  if (errorUtils && typeof errorUtils.setGlobalHandler === 'function') {
    originalGlobalHandler = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
      console.error('[GlobalErrorHandler] Uncaught exception:', error);
      recordCrash({
        source: 'GlobalError',
        name: error?.name || 'UncaughtException',
        message: error?.message || String(error),
        stack: error?.stack,
        isFatal: isFatal ?? true,
      });

      if (typeof originalGlobalHandler === 'function') {
        originalGlobalHandler(error, isFatal);
      }
    });
  }

  // 2. Unhandled Promise Rejections (Hermes / Browsers)
  const handleRejection = (reason: any) => {
    console.error('[GlobalErrorHandler] Unhandled promise rejection:', reason);
    recordCrash({
      source: 'UnhandledPromiseRejection',
      name: reason?.name || 'UnhandledPromiseRejection',
      message: reason?.message || (typeof reason === 'string' ? reason : JSON.stringify(reason)),
      stack: reason?.stack,
      isFatal: false,
    });
  };

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const webHandler = (event: PromiseRejectionEvent) => {
      handleRejection(event.reason);
    };
    window.addEventListener('unhandledrejection', webHandler);
  } else if (globalObj) {
    const previousRejectionHandler = globalObj.onunhandledrejection;
    globalObj.onunhandledrejection = (event: any) => {
      handleRejection(event?.reason ?? event);
      if (typeof previousRejectionHandler === 'function') {
        previousRejectionHandler(event);
      }
    };
  }

  return () => {
    if (errorUtils && originalGlobalHandler) {
      errorUtils.setGlobalHandler(originalGlobalHandler);
    }
    handlersInitialized = false;
  };
}
