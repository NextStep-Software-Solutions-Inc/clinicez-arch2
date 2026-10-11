import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_SHARE_REDEMPTIONS,
  SHARE_REDEMPTION_OPTIONS,
  redemptionLabel,
} from '../services/sharing/redemptions';
import {
  codeSecondsLeft,
  formatCountdown,
  shareCodeFailureMessage,
  watchCodeExpiry,
} from '../services/sharing/shareCode';
import type { TimerApi } from '../services/sharing/qrRefresh';

interface Scheduled {
  id: number;
  at: number;
  callback: () => void;
}

function createFakeClock() {
  let time = 0;
  let nextId = 1;
  let queue: Scheduled[] = [];

  const timers: TimerApi = {
    setTimeout: (callback, delayMs) => {
      const id = nextId++;
      queue.push({ id, at: time + delayMs, callback });
      return id;
    },
    clearTimeout: (handle) => {
      queue = queue.filter((entry) => entry.id !== handle);
    },
  };

  return {
    timers,
    now: () => time,
    pending: () => queue.length,
    advance: (ms: number) => {
      const target = time + ms;
      for (;;) {
        const due = queue.filter((entry) => entry.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        queue = queue.filter((entry) => entry.id !== due.id);
        time = due.at;
        due.callback();
      }
      time = target;
    },
  };
}

describe('formatCountdown', () => {
  test('formats mm:ss with zero padding', () => {
    expect(formatCountdown(600)).toBe('10:00');
    expect(formatCountdown(65)).toBe('01:05');
    expect(formatCountdown(9)).toBe('00:09');
    expect(formatCountdown(0)).toBe('00:00');
  });

  test('clamps negatives and drops fractions', () => {
    expect(formatCountdown(-5)).toBe('00:00');
    expect(formatCountdown(59.9)).toBe('00:59');
  });
});

describe('codeSecondsLeft', () => {
  test('rounds up while the code is still valid and never goes below zero', () => {
    expect(codeSecondsLeft(10_000, 0)).toBe(10);
    expect(codeSecondsLeft(10_000, 9_001)).toBe(1);
    expect(codeSecondsLeft(10_000, 10_000)).toBe(0);
    expect(codeSecondsLeft(10_000, 20_000)).toBe(0);
  });
});

describe('watchCodeExpiry', () => {
  test('ticks every second and expires exactly once', () => {
    const clock = createFakeClock();
    const ticks: number[] = [];
    let expired = 0;
    watchCodeExpiry({
      expiresAtMs: 3_000,
      onTick: (seconds) => ticks.push(seconds),
      onExpire: () => { expired += 1; },
      timers: clock.timers,
      now: clock.now,
    });

    expect(ticks).toEqual([3]);
    clock.advance(1_000);
    clock.advance(1_000);
    expect(expired).toBe(0);
    clock.advance(1_000);
    expect(ticks).toEqual([3, 2, 1, 0]);
    expect(expired).toBe(1);
    clock.advance(10_000);
    expect(expired).toBe(1);
    expect(clock.pending()).toBe(0);
  });

  test('expires immediately when the deadline has already passed', () => {
    const clock = createFakeClock();
    let expired = 0;
    watchCodeExpiry({
      expiresAtMs: -1,
      onTick: () => {},
      onExpire: () => { expired += 1; },
      timers: clock.timers,
      now: clock.now,
    });
    expect(expired).toBe(1);
    expect(clock.pending()).toBe(0);
  });

  test('stop cancels the pending tick and is idempotent', () => {
    const clock = createFakeClock();
    const ticks: number[] = [];
    let expired = 0;
    const stop = watchCodeExpiry({
      expiresAtMs: 5_000,
      onTick: (seconds) => ticks.push(seconds),
      onExpire: () => { expired += 1; },
      timers: clock.timers,
      now: clock.now,
    });

    clock.advance(1_000);
    stop();
    stop();
    clock.advance(10_000);
    expect(ticks).toEqual([5, 4]);
    expect(expired).toBe(0);
    expect(clock.pending()).toBe(0);
  });
});

describe('shareCodeFailureMessage', () => {
  test('maps offline, conflict and rate limit to guidance', () => {
    expect(shareCodeFailureMessage(0, 'x')).toContain('No connection');
    expect(shareCodeFailureMessage(409, 'x')).toContain('5 active codes');
    expect(shareCodeFailureMessage(429, 'x')).toContain('Too many requests');
  });

  test('passes other server messages through', () => {
    expect(shareCodeFailureMessage(500, 'Server exploded')).toBe('Server exploded');
  });
});

describe('redemptions', () => {
  test('offers 1, 2, 3, 5 and 10 scans with 1 as default', () => {
    expect([...SHARE_REDEMPTION_OPTIONS]).toEqual([1, 2, 3, 5, 10]);
    expect(DEFAULT_SHARE_REDEMPTIONS).toBe(1);
  });

  test('labels singular and plural', () => {
    expect(redemptionLabel(1)).toBe('1 scan');
    expect(redemptionLabel(5)).toBe('5 scans');
  });
});
