/**
 * Rotating-QR scheduling. Pure and timer-injectable so it can be unit tested.
 *
 * A share token is single-use and short lived (`ttlSeconds`). The refresher requests a
 * fresh token, then schedules the next request at ~70% of the TTL so the QR on screen is
 * always valid. Failures (offline, 5xx) are retried after `retryDelayMs`; `stop()` cancels
 * everything and discards any in-flight response.
 */

export const QR_REFRESH_RATIO = 0.7;
export const QR_MIN_REFRESH_MS = 5_000;
export const QR_RETRY_DELAY_MS = 5_000;

export interface QrToken {
  token: string;
  ttlSeconds: number;
}

export interface QrSession<T extends QrToken> {
  token: T;
  /** Device clock when the token was received; the countdown is anchored here to ignore clock skew. */
  receivedAt: number;
  refreshAt: number;
  expiresAt: number;
}

export interface TimerApi {
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export interface QrRefresherOptions<T extends QrToken> {
  request: () => Promise<T>;
  onSession: (session: QrSession<T>) => void;
  onError: (error: unknown) => void;
  timers?: TimerApi;
  now?: () => number;
  retryDelayMs?: number;
}

export interface QrRefresher {
  /** Requests a token now and keeps rotating until `stop()`. */
  start: () => void;
  /** Cancels any pending timer and ignores in-flight responses. */
  stop: () => void;
}

export function refreshDelayMs(ttlSeconds: number, ratio: number = QR_REFRESH_RATIO): number {
  return Math.max(QR_MIN_REFRESH_MS, Math.round(ttlSeconds * 1000 * ratio));
}

/** Remaining validity as 0..1 of the token's TTL (1 = just issued, 0 = expired). */
export function remainingFraction(session: QrSession<QrToken>, now: number): number {
  const total = session.expiresAt - session.receivedAt;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, (session.expiresAt - now) / total));
}

export function remainingSeconds(session: QrSession<QrToken>, now: number): number {
  return Math.max(0, Math.ceil((session.expiresAt - now) / 1000));
}

const defaultTimers: TimerApi = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createQrRefresher<T extends QrToken>(options: QrRefresherOptions<T>): QrRefresher {
  const timers = options.timers ?? defaultTimers;
  const now = options.now ?? Date.now;
  const retryDelayMs = options.retryDelayMs ?? QR_RETRY_DELAY_MS;

  let handle: unknown = null;
  let generation = 0;
  let running = false;

  const clearPending = () => {
    if (handle !== null) {
      timers.clearTimeout(handle);
      handle = null;
    }
  };

  const schedule = (delayMs: number, runGeneration: number) => {
    handle = timers.setTimeout(() => {
      handle = null;
      void cycle(runGeneration);
    }, delayMs);
  };

  const cycle = async (runGeneration: number): Promise<void> => {
    try {
      const token = await options.request();
      if (!running || runGeneration !== generation) return;
      const receivedAt = now();
      const delay = refreshDelayMs(token.ttlSeconds);
      options.onSession({
        token,
        receivedAt,
        refreshAt: receivedAt + delay,
        expiresAt: receivedAt + token.ttlSeconds * 1000,
      });
      schedule(delay, runGeneration);
    } catch (error) {
      if (!running || runGeneration !== generation) return;
      options.onError(error);
      schedule(retryDelayMs, runGeneration);
    }
  };

  return {
    start: () => {
      clearPending();
      generation += 1;
      running = true;
      void cycle(generation);
    },
    stop: () => {
      running = false;
      generation += 1;
      clearPending();
    },
  };
}
