export const DEFAULT_WEB_IDLE_TIMEOUT_MINUTES = 30;
export const DEFAULT_WEB_IDLE_THROTTLE_MS = 15_000;
export const DEFAULT_WEB_IDLE_CHECK_INTERVAL_MS = 15_000;

export interface WebIdleMonitorOptions {
  timeoutMs: number;
  throttleMs?: number;
  checkIntervalMs?: number;
  now?: () => number;
  onActivityBroadcast?: (timestamp: number) => void;
  onIdleTimeout: () => void;
}

export interface WebIdleMonitor {
  start: () => void;
  stop: () => void;
  recordActivity: (timestamp?: number, fromRemote?: boolean) => void;
  checkNow: () => boolean;
  getLastActivityAt: () => number;
}

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'pointerdown'] as const;

/**
 * Tracks user inactivity across web tabs. Local DOM activity is throttled and forwarded to
 * peer tabs via `onActivityBroadcast`, while remote peer activity extends `lastActivityAt`
 * without rebroadcasting. Checking elapsed idle time before updating `lastActivityAt` on
 * local events ensures a device waking from sleep after the timeout logs out immediately.
 */
export function createWebIdleMonitor(options: WebIdleMonitorOptions): WebIdleMonitor {
  const {
    timeoutMs,
    throttleMs = DEFAULT_WEB_IDLE_THROTTLE_MS,
    checkIntervalMs = DEFAULT_WEB_IDLE_CHECK_INTERVAL_MS,
    now = () => Date.now(),
    onActivityBroadcast,
    onIdleTimeout,
  } = options;

  let lastActivityAt = now();
  let lastBroadcastAt = 0;
  let running = false;
  let fired = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let listenersAttached = false;

  const stop = () => {
    running = false;
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

  const checkNow = (): boolean => {
    if (!running || fired || timeoutMs <= 0 || !Number.isFinite(timeoutMs)) {
      return false;
    }
    if (now() - lastActivityAt >= timeoutMs) {
      fired = true;
      stop();
      onIdleTimeout();
      return true;
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

    const ts = typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : now();
    if (ts > lastActivityAt) {
      lastActivityAt = ts;
    }

    if (!fromRemote && onActivityBroadcast && ts - lastBroadcastAt >= throttleMs) {
      lastBroadcastAt = ts;
      try {
        onActivityBroadcast(ts);
      } catch {
        // Ignore broadcast errors so idle tracking remains resilient.
      }
    }
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

    intervalId = setInterval(() => {
      checkNow();
    }, Math.max(100, checkIntervalMs));
  };

  return {
    start,
    stop,
    recordActivity,
    checkNow,
    getLastActivityAt: () => lastActivityAt,
  };
}
