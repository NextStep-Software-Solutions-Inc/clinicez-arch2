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
});
