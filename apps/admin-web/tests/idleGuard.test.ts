import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  getIdleTimeoutMinutes,
  getLastActiveTimestamp,
  setLastActiveTimestamp,
  clearLastActiveTimestamp,
  evaluateIdleStatus,
  createSafeIdleBroadcastChannel,
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

class StrictMockBroadcastChannel {
  closed = false;
  closeCalls = 0;
  posted: unknown[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;

  postMessage(message: unknown) {
    if (this.closed) {
      throw new DOMException(
        "Failed to execute 'postMessage' on 'BroadcastChannel': Channel is closed",
        'InvalidStateError'
      );
    }
    this.posted.push(message);
  }

  close() {
    this.closed = true;
    this.closeCalls += 1;
  }
}

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

  it('stores, retrieves, and clears last active timestamp in localStorage', () => {
    const testTime = 1730000000000;
    setLastActiveTimestamp(testTime);

    expect(store.get(ADMIN_LAST_ACTIVE_KEY)).toBe(String(testTime));
    const retrieved = getLastActiveTimestamp();
    expect(retrieved).toBe(testTime);

    clearLastActiveTimestamp();
    expect(store.has(ADMIN_LAST_ACTIVE_KEY)).toBe(false);
  });

  it('generates a fresh timestamp if storage is empty', () => {
    const before = Date.now();
    const retrieved = getLastActiveTimestamp();
    const after = Date.now();

    expect(retrieved).toBeGreaterThanOrEqual(before);
    expect(retrieved).toBeLessThanOrEqual(after);
    expect(store.get(ADMIN_LAST_ACTIVE_KEY)).toBe(String(retrieved));
  });

  it('correctly evaluates warning window and expiry thresholds (timeout - 60s)', () => {
    const totalTimeoutSeconds = 15 * 60; // 900 seconds
    const warningStartSeconds = totalTimeoutSeconds - 60; // 840 seconds
    const now = 1_800_000_000_000;

    // After 839s of inactivity: warning NOT active
    const beforeWarning = evaluateIdleStatus(now - 839_000, now, totalTimeoutSeconds, warningStartSeconds);
    expect(beforeWarning).toEqual({
      elapsedSeconds: 839,
      remainingSeconds: 61,
      isWarning: false,
      isExpired: false,
    });

    // After 840s of inactivity: warning active with 60s remaining
    const atWarning = evaluateIdleStatus(now - 840_000, now, totalTimeoutSeconds, warningStartSeconds);
    expect(atWarning).toEqual({
      elapsedSeconds: 840,
      remainingSeconds: 60,
      isWarning: true,
      isExpired: false,
    });

    // After 890s of inactivity: warning active with 10s remaining
    const nearExpiry = evaluateIdleStatus(now - 890_000, now, totalTimeoutSeconds, warningStartSeconds);
    expect(nearExpiry).toEqual({
      elapsedSeconds: 890,
      remainingSeconds: 10,
      isWarning: true,
      isExpired: false,
    });

    // At 900s of inactivity: session expired
    const atExpiry = evaluateIdleStatus(now - 900_000, now, totalTimeoutSeconds, warningStartSeconds);
    expect(atExpiry).toEqual({
      elapsedSeconds: 900,
      remainingSeconds: 0,
      isWarning: false,
      isExpired: true,
    });
  });

  it('returns null from createSafeIdleBroadcastChannel when BroadcastChannel is unavailable', () => {
    expect(createSafeIdleBroadcastChannel(() => null)).toBeNull();
  });

  it('guards postMessage after close() and detaches onmessage cleanly without throwing', () => {
    const raw = new StrictMockBroadcastChannel();
    const safeChannel = createSafeIdleBroadcastChannel(() => raw as unknown as BroadcastChannel);
    expect(safeChannel).not.toBeNull();

    const received: unknown[] = [];
    safeChannel!.setOnMessage((ev) => received.push(ev.data));
    expect(raw.onmessage).not.toBeNull();

    safeChannel!.postMessage({ type: 'ACTIVITY', timestamp: 1000 });
    expect(raw.posted).toEqual([{ type: 'ACTIVITY', timestamp: 1000 }]);

    // Deliver message while open
    raw.onmessage?.({ data: { type: 'ACTIVITY', timestamp: 2000 } } as MessageEvent);
    expect(received).toEqual([{ type: 'ACTIVITY', timestamp: 2000 }]);

    // Close and verify subsequent postMessage and repeated close() are safe no-ops
    safeChannel!.close();
    expect(safeChannel!.isClosed).toBe(true);
    expect(raw.closed).toBe(true);
    expect(raw.onmessage).toBeNull();
    expect(raw.closeCalls).toBe(1);

    expect(() => safeChannel!.postMessage({ type: 'LOGOUT' })).not.toThrow();
    expect(raw.posted).toHaveLength(1);

    safeChannel!.close();
    expect(raw.closeCalls).toBe(1);
  });

  it('catches externally closed channel DOMException on postMessage, marks closed, and cleans up on close()', () => {
    const raw = new StrictMockBroadcastChannel();
    const safeChannel = createSafeIdleBroadcastChannel(() => raw as unknown as BroadcastChannel)!;
    safeChannel.setOnMessage(() => {});

    // Simulate browser closing the channel externally (e.g. tab freeze / BFCache)
    raw.closed = true;

    expect(() => safeChannel.postMessage({ type: 'ACTIVITY', timestamp: 3000 })).not.toThrow();
    expect(safeChannel.isClosed).toBe(true);
    expect(raw.onmessage).toBeNull();

    // Teardown still cleanly calls raw.close() once
    safeChannel.close();
    expect(raw.closeCalls).toBe(1);
  });
});
