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
