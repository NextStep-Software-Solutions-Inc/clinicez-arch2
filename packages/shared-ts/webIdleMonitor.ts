export const DEFAULT_WEB_IDLE_TIMEOUT_MINUTES = 30;
export const DEFAULT_WEB_IDLE_WARNING_SECONDS = 60;
export const DEFAULT_WEB_IDLE_THROTTLE_MS = 15_000;
export const DEFAULT_WEB_IDLE_CHECK_INTERVAL_MS = 15_000;
export const DEFAULT_WEB_IDLE_WARNING_INTERVAL_MS = 1_000;

export interface WebIdleMonitorOptions {
  timeoutMs: number;
  warningMs?: number;
  throttleMs?: number;
  checkIntervalMs?: number;
  warningCheckIntervalMs?: number;
  now?: () => number;
  isBusy?: () => boolean;
  onActivityBroadcast?: (timestamp: number) => void;
  onIdleWarning?: (remainingMs: number) => void;
  onWarningCleared?: () => void;
  onIdleTimeout: () => void;
}

export interface WebIdleMonitor {
  start: () => void;
  stop: () => void;
  recordActivity: (timestamp?: number, fromRemote?: boolean) => void;
  extendSession: () => void;
  checkNow: () => boolean;
  getLastActivityAt: () => number;
  isWarningActive: () => boolean;
}

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'pointerdown'] as const;

/**
 * Tracks user inactivity across web tabs. Local DOM activity is throttled and forwarded to
 * peer tabs via `onActivityBroadcast`, while remote peer activity extends `lastActivityAt`
 * without rebroadcasting.
 *
 * When `warningMs` is configured, enters a pre-timeout warning window before firing `onIdleTimeout`.
 * During the warning window, passive DOM activity is ignored so stray pointer movements cannot hide
 * the warning; explicit `extendSession()` (or peer tab extension) clears it.
 *
 * Checking elapsed idle time before updating `lastActivityAt` on local events ensures a device
 * waking from sleep after the timeout fires `onIdleTimeout` immediately.
 */
export function createWebIdleMonitor(options: WebIdleMonitorOptions): WebIdleMonitor {
  const {
    timeoutMs,
    warningMs = 0,
    throttleMs = DEFAULT_WEB_IDLE_THROTTLE_MS,
    checkIntervalMs = DEFAULT_WEB_IDLE_CHECK_INTERVAL_MS,
    warningCheckIntervalMs = DEFAULT_WEB_IDLE_WARNING_INTERVAL_MS,
    now = () => Date.now(),
    isBusy,
    onActivityBroadcast,
    onIdleWarning,
    onWarningCleared,
    onIdleTimeout,
  } = options;

  const effectiveWarningMs =
    warningMs > 0 && Number.isFinite(warningMs) && timeoutMs > 0 && Number.isFinite(timeoutMs)
      ? Math.min(warningMs, Math.floor(timeoutMs / 2))
      : 0;

  let lastActivityAt = now();
  let lastBroadcastAt = 0;
  let running = false;
  let fired = false;
  let warningActive = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let activeIntervalMs = 0;
  let listenersAttached = false;

  const scheduleInterval = (intervalMs: number) => {
    if (!running) return;
    const clamped = Math.max(100, intervalMs);
    if (intervalId !== null && activeIntervalMs === clamped) {
      return;
    }
    if (intervalId !== null) {
      clearInterval(intervalId);
    }
    activeIntervalMs = clamped;
    intervalId = setInterval(() => {
      checkNow();
    }, clamped);
  };

  const clearWarningState = () => {
    if (!warningActive) return;
    warningActive = false;
    try {
      onWarningCleared?.();
    } catch {
      // Ignore UI callback errors
    }
    if (running) {
      scheduleInterval(checkIntervalMs);
    }
  };

  const stop = () => {
    running = false;
    warningActive = false;
    activeIntervalMs = 0;
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (listenersAttached) {
      listenersAttached = false;
      try {
        if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
          for (const event of ACTIVITY_EVENTS) {
            window.removeEventListener(event, handleLocalActivity);
          }
        }
        if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        }
      } catch {
        // Ignore restricted environment listener teardown failures.
      }
    }
  };

  const maybeBroadcast = (ts: number, force = false) => {
    if (!onActivityBroadcast) return;
    if (!force && ts - lastBroadcastAt < throttleMs) return;
    lastBroadcastAt = ts;
    try {
      onActivityBroadcast(ts);
    } catch {
      // Ignore broadcast errors so idle tracking remains resilient.
    }
  };

  const checkNow = (): boolean => {
    if (!running || fired || timeoutMs <= 0 || !Number.isFinite(timeoutMs)) {
      return false;
    }

    const currentNow = now();

    // Defer timeout while an uninterrupted clinical task (e.g. live teleconsultation) is active.
    try {
      if (isBusy?.()) {
        if (currentNow > lastActivityAt) {
          lastActivityAt = currentNow;
        }
        clearWarningState();
        maybeBroadcast(currentNow, false);
        return false;
      }
    } catch {
      // Ignore busy-check errors so idle monitoring remains resilient.
    }

    const elapsed = currentNow - lastActivityAt;
    if (elapsed >= timeoutMs) {
      fired = true;
      stop();
      onIdleTimeout();
      return true;
    }

    if (effectiveWarningMs > 0 && elapsed >= timeoutMs - effectiveWarningMs) {
      const remainingMs = Math.max(0, timeoutMs - elapsed);
      const enteringWarning = !warningActive;
      warningActive = true;
      if (enteringWarning) {
        scheduleInterval(Math.min(checkIntervalMs, warningCheckIntervalMs));
      }
      try {
        onIdleWarning?.(remainingMs);
      } catch {
        // Ignore warning callback errors
      }
    } else if (warningActive) {
      clearWarningState();
    }

    return false;
  };

  const recordActivity = (timestamp?: number, fromRemote = false) => {
    if (!running || fired) return;

    // Wake-from-sleep guard: if the session already exceeded timeoutMs while asleep or
    // throttled in the background, fire idle timeout instead of refreshing lastActivityAt.
    if (!fromRemote && checkNow()) {
      return;
    }

    // Ignore passive local DOM events while the warning modal is visible so stray pointer
    // bumps cannot dismiss it; require explicit extendSession() or peer-tab extension.
    if (!fromRemote && warningActive) {
      return;
    }

    const ts = typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : now();
    if (ts > lastActivityAt) {
      lastActivityAt = ts;
    }

    if (fromRemote && warningActive && effectiveWarningMs > 0) {
      const elapsedAfterRemote = now() - lastActivityAt;
      if (elapsedAfterRemote < timeoutMs - effectiveWarningMs) {
        clearWarningState();
      }
    }

    if (!fromRemote) {
      maybeBroadcast(ts, false);
    }
  };

  const extendSession = () => {
    if (!running || fired) return;
    if (checkNow()) {
      return;
    }
    const ts = now();
    if (ts > lastActivityAt) {
      lastActivityAt = ts;
    }
    clearWarningState();
    maybeBroadcast(ts, true);
  };

  const handleLocalActivity = () => {
    recordActivity(undefined, false);
  };

  const handleVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      recordActivity(undefined, false);
    }
  };

  const start = () => {
    if (running || timeoutMs <= 0 || !Number.isFinite(timeoutMs)) return;
    running = true;
    fired = false;
    warningActive = false;
    lastActivityAt = now();
    lastBroadcastAt = 0;

    try {
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        for (const event of ACTIVITY_EVENTS) {
          window.addEventListener(event, handleLocalActivity, { passive: true });
        }
        listenersAttached = true;
      }
      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', handleVisibilityChange);
        listenersAttached = true;
      }
    } catch {
      // Non-DOM or restricted frame environments still rely on interval/manual checks.
    }

    scheduleInterval(checkIntervalMs);
  };

  return {
    start,
    stop,
    recordActivity,
    extendSession,
    checkNow,
    getLastActivityAt: () => lastActivityAt,
    isWarningActive: () => warningActive,
  };
}
