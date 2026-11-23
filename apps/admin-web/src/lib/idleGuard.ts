export const ADMIN_LAST_ACTIVE_KEY = 'admin_last_active_at';
export const IDLE_BROADCAST_CHANNEL = 'clinicez_admin_idle_channel';
export const DEFAULT_IDLE_TIMEOUT_MINUTES = 15;
export const WARNING_COUNTDOWN_SECONDS = 60;

/**
 * Returns configured idle timeout in minutes from environment, defaulting to 15.
 */
export function getIdleTimeoutMinutes(): number {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_IDLE_TIMEOUT_MINUTES) {
    const parsed = parseInt(import.meta.env.VITE_ADMIN_IDLE_TIMEOUT_MINUTES, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_IDLE_TIMEOUT_MINUTES;
}

/**
 * Retrieves the last active timestamp from localStorage (in milliseconds).
 * Future-bounded: rejects or clamps timestamps > Date.now() + 1000 to prevent auto-logout freezing.
 */
export function getLastActiveTimestamp(): number {
  const now = Date.now();
  if (typeof window === 'undefined') return now;
  try {
    const raw = localStorage.getItem(ADMIN_LAST_ACTIVE_KEY);
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed > 0) {
        // Future timestamp detected (clock manipulation or storage tampering)
        if (parsed > now + 1000) {
          setLastActiveTimestamp(now);
          return now;
        }
        return Math.min(parsed, now);
      }
    }
  } catch {
    // LocalStorage access restricted or unavailable
  }
  setLastActiveTimestamp(now);
  return now;
}

/**
 * Persists the latest active timestamp to localStorage.
 */
export function setLastActiveTimestamp(timestamp: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ADMIN_LAST_ACTIVE_KEY, String(timestamp));
  } catch {
    // LocalStorage write failed
  }
}

/**
 * Removes the persisted active timestamp from localStorage (e.g. on idle sign-out).
 */
export function clearLastActiveTimestamp(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(ADMIN_LAST_ACTIVE_KEY);
  } catch {
    // LocalStorage access restricted or unavailable
  }
}

export interface IdleStatusSnapshot {
  elapsedSeconds: number;
  remainingSeconds: number;
  isWarning: boolean;
  isExpired: boolean;
}

/**
 * Pure idle-timeout evaluation shared by timer, visibility, and activity handlers.
 */
export function evaluateIdleStatus(
  lastActiveMs: number,
  nowMs: number,
  totalTimeoutSeconds: number,
  warningStartSeconds: number
): IdleStatusSnapshot {
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - lastActiveMs) / 1000));
  const isExpired = elapsedSeconds >= totalTimeoutSeconds;
  const isWarning = !isExpired && elapsedSeconds >= warningStartSeconds;
  const remainingSeconds = Math.max(0, totalTimeoutSeconds - elapsedSeconds);
  return {
    elapsedSeconds,
    remainingSeconds,
    isWarning,
    isExpired,
  };
}

export type IdleBroadcastMessage =
  | { type: 'ACTIVITY'; timestamp: number }
  | { type: 'LOGOUT' };

export interface SafeIdleChannel {
  postMessage: (message: IdleBroadcastMessage) => void;
  setOnMessage: (handler: ((event: MessageEvent<IdleBroadcastMessage>) => void) | null) => void;
  close: () => void;
  readonly isClosed: boolean;
}

/**
 * Safe factory for cross-tab BroadcastChannel.
 */
export function getIdleBroadcastChannel(): BroadcastChannel | null {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      return new BroadcastChannel(IDLE_BROADCAST_CHANNEL);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Wraps a BroadcastChannel with explicit closed-state lifecycle tracking and
 * exception guarding so postMessage/close never throw DOMException ("Channel is closed").
 */
export function createSafeIdleBroadcastChannel(
  channelFactory: () => BroadcastChannel | null = getIdleBroadcastChannel
): SafeIdleChannel | null {
  const rawChannel = channelFactory();
  if (!rawChannel) return null;

  let isClosed = false;
  let hasClosedRaw = false;

  return {
    get isClosed() {
      return isClosed;
    },
    postMessage(message: IdleBroadcastMessage) {
      if (isClosed) return;
      try {
        rawChannel.postMessage(message);
      } catch {
        // Channel was closed externally (e.g. tab freeze, BFCache, or context teardown).
        isClosed = true;
        rawChannel.onmessage = null;
      }
    },
    setOnMessage(handler: ((event: MessageEvent<IdleBroadcastMessage>) => void) | null) {
      if (isClosed || !handler) {
        rawChannel.onmessage = null;
        return;
      }
      rawChannel.onmessage = (event: MessageEvent<IdleBroadcastMessage>) => {
        if (isClosed) return;
        handler(event);
      };
    },
    close() {
      isClosed = true;
      if (hasClosedRaw) return;
      hasClosedRaw = true;
      rawChannel.onmessage = null;
      try {
        rawChannel.close();
      } catch {
        // Ignore already-closed channel errors
      }
    },
  };
}
