import { defaultTimers, type TimerApi } from './qrRefresh';

/**
 * One-time share code helpers. Pure and timer-injectable so the countdown can be unit tested.
 */

const TICK_MS = 1000;
const SECONDS_PER_MINUTE = 60;

/** Whole seconds until `expiresAtMs` (rounded up so the display never reads 0 while still valid). */
export function codeSecondsLeft(expiresAtMs: number, now: number): number {
  return Math.max(0, Math.ceil((expiresAtMs - now) / 1000));
}

/** `mm:ss`, e.g. 600 -> `10:00`, 65 -> `01:05`. */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / SECONDS_PER_MINUTE);
  const seconds = safe % SECONDS_PER_MINUTE;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export interface CodeExpiryWatcherOptions {
  expiresAtMs: number;
  /** Called immediately and then once a second with the whole seconds left. */
  onTick: (secondsLeft: number) => void;
  /** Called once, when the countdown reaches zero. */
  onExpire: () => void;
  timers?: TimerApi;
  now?: () => number;
}

/** Ticks until the code expires. Returns a function that stops it (safe to call repeatedly). */
export function watchCodeExpiry(options: CodeExpiryWatcherOptions): () => void {
  const timers = options.timers ?? defaultTimers;
  const now = options.now ?? Date.now;
  let handle: unknown = null;
  let stopped = false;

  const tick = () => {
    handle = null;
    if (stopped) return;
    const secondsLeft = codeSecondsLeft(options.expiresAtMs, now());
    options.onTick(secondsLeft);
    if (secondsLeft <= 0) {
      stopped = true;
      options.onExpire();
      return;
    }
    handle = timers.setTimeout(tick, TICK_MS);
  };

  tick();

  return () => {
    stopped = true;
    if (handle !== null) {
      timers.clearTimeout(handle);
      handle = null;
    }
  };
}

const HTTP_CONFLICT = 409;
const HTTP_TOO_MANY_REQUESTS = 429;

/** User guidance for a failed code request. `status` 0 means no connection. */
export function shareCodeFailureMessage(status: number, serverMessage: string): string {
  if (status === 0) return 'No connection. Check your internet and try again.';
  if (status === HTTP_CONFLICT) return 'You already have 5 active codes. Wait for one to expire, then try again.';
  if (status === HTTP_TOO_MANY_REQUESTS) return 'Too many requests. Wait a moment and try again.';
  return serverMessage;
}