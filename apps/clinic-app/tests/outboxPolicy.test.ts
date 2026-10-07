import { describe, expect, test } from 'bun:test';
import {
  ageFromDateOfBirth,
  backoffDelayMs,
  classifyFailure,
  isDue,
  MAX_DELAY_MS,
  shouldQueueOffline,
} from '../services/outboxPolicy';

describe('classifyFailure', () => {
  test('an unreachable server keeps the item without penalty', () => {
    expect(classifyFailure(0)).toBe('offline');
    expect(classifyFailure(503)).toBe('offline');
    expect(classifyFailure(504)).toBe('offline');
  });

  test('transient server errors are retried with backoff', () => {
    expect(classifyFailure(500)).toBe('retry');
    expect(classifyFailure(429)).toBe('retry');
    expect(classifyFailure(401)).toBe('retry');
  });

  test('rejections of the item itself are parked, not retried', () => {
    for (const status of [400, 403, 404, 409, 422]) expect(classifyFailure(status)).toBe('dead');
  });

  test('only connectivity failures are saved locally for later', () => {
    expect(shouldQueueOffline(0)).toBe(true);
    expect(shouldQueueOffline(400)).toBe(false);
    expect(shouldQueueOffline(409)).toBe(false);
  });
});

describe('backoffDelayMs', () => {
  test('doubles and is capped', () => {
    expect(backoffDelayMs(1)).toBe(5_000);
    expect(backoffDelayMs(2)).toBe(10_000);
    expect(backoffDelayMs(3)).toBe(20_000);
    expect(backoffDelayMs(20)).toBe(MAX_DELAY_MS);
  });
});

describe('isDue', () => {
  const now = new Date('2026-01-01T00:00:10Z');
  test('items without a schedule are due', () => expect(isDue(null, now)).toBe(true));
  test('future items are not due', () => expect(isDue('2026-01-01T00:00:20Z', now)).toBe(false));
  test('past items are due', () => expect(isDue('2026-01-01T00:00:05Z', now)).toBe(true));
});

describe('ageFromDateOfBirth', () => {
  const now = new Date('2026-06-15T00:00:00');
  test('counts whole years', () => {
    expect(ageFromDateOfBirth('2000-06-15', now)).toBe(26);
    expect(ageFromDateOfBirth('2000-06-16', now)).toBe(25);
  });
  test('is 0 for a missing or invalid date', () => {
    expect(ageFromDateOfBirth(undefined, now)).toBe(0);
    expect(ageFromDateOfBirth('not a date', now)).toBe(0);
  });
});
