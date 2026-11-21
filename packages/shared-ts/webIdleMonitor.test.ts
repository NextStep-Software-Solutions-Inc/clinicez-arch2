import { describe, test, expect } from 'bun:test';
import { createWebIdleMonitor } from './webIdleMonitor';

describe('createWebIdleMonitor', () => {
  test('fires onIdleTimeout once timeoutMs elapses without activity', () => {
    let clock = 1_000_000;
    let idleCount = 0;
    const monitor = createWebIdleMonitor({
      timeoutMs: 60_000,
      checkIntervalMs: 60_000,
      now: () => clock,
      onIdleTimeout: () => {
        idleCount += 1;
      },
    });

    monitor.start();
    clock += 59_999;
    expect(monitor.checkNow()).toBe(false);
    expect(idleCount).toBe(0);

    clock += 1;
    expect(monitor.checkNow()).toBe(true);
    expect(idleCount).toBe(1);

    // Subsequent checks do not re-fire
    clock += 60_000;
    expect(monitor.checkNow()).toBe(false);
    expect(idleCount).toBe(1);
    monitor.stop();
  });

  test('throttles onActivityBroadcast for local events', () => {
    let clock = 100_000;
    const broadcasts: number[] = [];
    const monitor = createWebIdleMonitor({
      timeoutMs: 60_000,
      throttleMs: 15_000,
      checkIntervalMs: 60_000,
      now: () => clock,
      onActivityBroadcast: (ts) => broadcasts.push(ts),
      onIdleTimeout: () => {},
    });

    monitor.start();
    monitor.recordActivity(undefined, false);
    clock += 5_000;
    monitor.recordActivity(undefined, false);
    clock += 5_000;
    monitor.recordActivity(undefined, false);
    expect(broadcasts).toEqual([100_000]);

    clock += 5_000;
    monitor.recordActivity(undefined, false);
    expect(broadcasts).toEqual([100_000, 115_000]);
    monitor.stop();
  });

  test('remote activity extends lastActivityAt without rebroadcasting', () => {
    let clock = 200_000;
    const broadcasts: number[] = [];
    let idleCount = 0;
    const monitor = createWebIdleMonitor({
      timeoutMs: 60_000,
      checkIntervalMs: 60_000,
      now: () => clock,
      onActivityBroadcast: (ts) => broadcasts.push(ts),
      onIdleTimeout: () => {
        idleCount += 1;
      },
    });

    monitor.start();
    clock += 50_000;
    monitor.recordActivity(clock, true);
    expect(broadcasts).toEqual([]);

    clock += 50_000;
    expect(monitor.checkNow()).toBe(false);
    expect(idleCount).toBe(0);

    clock += 10_000;
    expect(monitor.checkNow()).toBe(true);
    expect(idleCount).toBe(1);
    monitor.stop();
  });

  test('wake-from-sleep local activity after timeoutMs fires onIdleTimeout instead of resetting timer', () => {
    let clock = 500_000;
    let idleCount = 0;
    const broadcasts: number[] = [];
    const monitor = createWebIdleMonitor({
      timeoutMs: 60_000,
      checkIntervalMs: 60_000,
      now: () => clock,
      onActivityBroadcast: (ts) => broadcasts.push(ts),
      onIdleTimeout: () => {
        idleCount += 1;
      },
    });

    monitor.start();
    clock += 90_000; // Laptop slept for 90s (> 60s timeout)
    monitor.recordActivity(undefined, false);

    expect(idleCount).toBe(1);
    expect(broadcasts).toEqual([]);
    expect(monitor.getLastActivityAt()).toBe(500_000);
    monitor.stop();
  });

  test('timeoutMs <= 0 is a no-op', () => {
    let idleCount = 0;
    const monitor = createWebIdleMonitor({
      timeoutMs: 0,
      onIdleTimeout: () => {
        idleCount += 1;
      },
    });

    monitor.start();
    expect(monitor.checkNow()).toBe(false);
    monitor.recordActivity(undefined, false);
    expect(idleCount).toBe(0);
    monitor.stop();
  });

  test('fires onIdleWarning in warning window, ignores passive local activity, and clears on extendSession', () => {
    let clock = 1_000_000;
    const warnings: number[] = [];
    let cleared = 0;
    let idleCount = 0;
    const broadcasts: number[] = [];

    const monitor = createWebIdleMonitor({
      timeoutMs: 300_000, // 5m
      warningMs: 60_000, // 1m
      checkIntervalMs: 60_000,
      now: () => clock,
      onActivityBroadcast: (ts) => broadcasts.push(ts),
      onIdleWarning: (remainingMs) => warnings.push(remainingMs),
      onWarningCleared: () => {
        cleared += 1;
      },
      onIdleTimeout: () => {
        idleCount += 1;
      },
    });

    monitor.start();
    clock += 239_999;
    expect(monitor.checkNow()).toBe(false);
    expect(monitor.isWarningActive()).toBe(false);
    expect(warnings).toEqual([]);

    // Entering warning window (remaining = 60_000ms)
    clock += 1;
    expect(monitor.checkNow()).toBe(false);
    expect(monitor.isWarningActive()).toBe(true);
    expect(warnings).toEqual([60_000]);

    // Passive DOM activity during warning does NOT clear warning or reset clock
    clock += 15_000;
    monitor.recordActivity(undefined, false);
    expect(monitor.isWarningActive()).toBe(true);
    expect(monitor.getLastActivityAt()).toBe(1_000_000);
    expect(cleared).toBe(0);

    // Explicit extendSession() clears warning, updates lastActivityAt, and forces broadcast
    monitor.extendSession();
    expect(monitor.isWarningActive()).toBe(false);
    expect(cleared).toBe(1);
    expect(monitor.getLastActivityAt()).toBe(1_255_000);
    expect(broadcasts).toEqual([1_255_000]);
    expect(idleCount).toBe(0);

    monitor.stop();
  });

  test('remote peer extend clears active warning without rebroadcasting', () => {
    let clock = 2_000_000;
    let cleared = 0;
    const warnings: number[] = [];
    const broadcasts: number[] = [];

    const monitor = createWebIdleMonitor({
      timeoutMs: 300_000,
      warningMs: 60_000,
      checkIntervalMs: 60_000,
      now: () => clock,
      onActivityBroadcast: (ts) => broadcasts.push(ts),
      onIdleWarning: (remainingMs) => warnings.push(remainingMs),
      onWarningCleared: () => {
        cleared += 1;
      },
      onIdleTimeout: () => {},
    });

    monitor.start();
    clock += 250_000;
    monitor.checkNow();
    expect(monitor.isWarningActive()).toBe(true);
    expect(warnings).toEqual([50_000]);

    monitor.recordActivity(clock, true);
    expect(monitor.isWarningActive()).toBe(false);
    expect(cleared).toBe(1);
    expect(broadcasts).toEqual([]);

    monitor.stop();
  });

  test('isBusy defers warning and idle timeout while active task is running', () => {
    let clock = 3_000_000;
    let busy = true;
    let idleCount = 0;
    const warnings: number[] = [];

    const monitor = createWebIdleMonitor({
      timeoutMs: 120_000,
      warningMs: 60_000,
      checkIntervalMs: 60_000,
      now: () => clock,
      isBusy: () => busy,
      onIdleWarning: (ms) => warnings.push(ms),
      onIdleTimeout: () => {
        idleCount += 1;
      },
    });

    monitor.start();
    clock += 300_000; // Well past timeout, but busy
    expect(monitor.checkNow()).toBe(false);
    expect(idleCount).toBe(0);
    expect(warnings).toEqual([]);
    expect(monitor.getLastActivityAt()).toBe(3_300_000);

    // Once busy ends, full timeout restarts from 3_300_000
    busy = false;
    clock += 60_000;
    expect(monitor.checkNow()).toBe(false);
    expect(monitor.isWarningActive()).toBe(true);
    expect(warnings).toEqual([60_000]);

    clock += 60_000;
    expect(monitor.checkNow()).toBe(true);
    expect(idleCount).toBe(1);
    monitor.stop();
  });
});
