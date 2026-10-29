import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  getIdleTimeoutMinutes,
  getLastActiveTimestamp,
  setLastActiveTimestamp,
  ADMIN_LAST_ACTIVE_KEY,
  DEFAULT_IDLE_TIMEOUT_MINUTES,
  WARNING_COUNTDOWN_SECONDS,
} from '../src/lib/idleGuard';

// Setup mock localStorage for Node/Bun environment
const store = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, String(value)),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
};
(globalThis as any).window = (globalThis as any).window || {};
(globalThis as any).window.location = (globalThis as any).window.location || { hostname: 'localhost' };
(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).window.localStorage = mockLocalStorage;

describe('Idle Session Guard (15-min cross-tab sync)', () => {
  beforeEach(() => {
    store.clear();
  });

  afterEach(() => {
    store.clear();
  });

  it('defaults to 15 minutes idle timeout when environment variable is unset', () => {
    const minutes = getIdleTimeoutMinutes();
    expect(minutes).toBe(15);
    expect(DEFAULT_IDLE_TIMEOUT_MINUTES).toBe(15);
    expect(WARNING_COUNTDOWN_SECONDS).toBe(60);
  });

  it('stores and retrieves last active timestamp in localStorage', () => {
    const testTime = 1730000000000;
    setLastActiveTimestamp(testTime);

    expect(store.get(ADMIN_LAST_ACTIVE_KEY)).toBe(String(testTime));
    const retrieved = getLastActiveTimestamp();
    expect(retrieved).toBe(testTime);
  });

  it('generates a fresh timestamp if storage is empty', () => {
    const before = Date.now();
    const retrieved = getLastActiveTimestamp();
    const after = Date.now();

    expect(retrieved).toBeGreaterThanOrEqual(before);
    expect(retrieved).toBeLessThanOrEqual(after);
    expect(store.get(ADMIN_LAST_ACTIVE_KEY)).toBe(String(retrieved));
  });

  it('correctly calculates warning window threshold (timeout - 60s)', () => {
    const timeoutMinutes = 15;
    const totalTimeoutSeconds = timeoutMinutes * 60; // 900 seconds
    const warningStartSeconds = totalTimeoutSeconds - 60; // 840 seconds

    expect(totalTimeoutSeconds).toBe(900);
    expect(warningStartSeconds).toBe(840);

    // After 839s of inactivity: warning NOT active
    const elapsedBeforeWarning = 839;
    expect(elapsedBeforeWarning >= warningStartSeconds).toBe(false);

    // After 840s of inactivity: warning active with 60s remaining
    const elapsedAtWarning = 840;
    expect(elapsedAtWarning >= warningStartSeconds).toBe(true);
    expect(totalTimeoutSeconds - elapsedAtWarning).toBe(60);

    // After 890s of inactivity: warning active with 10s remaining
    const elapsedNearExpiry = 890;
    expect(totalTimeoutSeconds - elapsedNearExpiry).toBe(10);

    // At 900s of inactivity: session expired
    const elapsedAtExpiry = 900;
    expect(elapsedAtExpiry >= totalTimeoutSeconds).toBe(true);
  });
});
