import { describe, expect, it } from 'bun:test';
import { ExponentialBackoffRetryPolicy } from '../../src/core/connection/ExponentialBackoffRetryPolicy';

describe('ExponentialBackoffRetryPolicy', () => {
  it('computes exponential backoff within jitter bounds', () => {
    const policy = new ExponentialBackoffRetryPolicy({
      initialDelayMs: 500,
      maxDelayMs: 30000,
      factor: 2.0,
      jitterFactor: 0.25
    });

    // Attempt 0: base 500ms, jitter +-25% -> [375, 625]
    const delay0 = policy.nextRetryDelayInMilliseconds({
      previousRetryCount: 0,
      elapsedMilliseconds: 0,
      retryReason: new Error('net fail')
    });
    expect(delay0).not.toBeNull();
    expect(delay0!).toBeGreaterThanOrEqual(375);
    expect(delay0!).toBeLessThanOrEqual(625);

    // Attempt 1: base 1000ms -> [750, 1250]
    const delay1 = policy.nextRetryDelayInMilliseconds({
      previousRetryCount: 1,
      elapsedMilliseconds: 500,
      retryReason: new Error('net fail')
    });
    expect(delay1).not.toBeNull();
    expect(delay1!).toBeGreaterThanOrEqual(750);
    expect(delay1!).toBeLessThanOrEqual(1250);

    // Attempt 2: base 2000ms -> [1500, 2500]
    const delay2 = policy.nextRetryDelayInMilliseconds({
      previousRetryCount: 2,
      elapsedMilliseconds: 1500,
      retryReason: new Error('net fail')
    });
    expect(delay2).not.toBeNull();
    expect(delay2!).toBeGreaterThanOrEqual(1500);
    expect(delay2!).toBeLessThanOrEqual(2500);
  });

  it('enforces maxDelayMs ceiling on high attempt counts', () => {
    const policy = new ExponentialBackoffRetryPolicy({
      initialDelayMs: 500,
      maxDelayMs: 30000,
      factor: 2.0,
      jitterFactor: 0.25
    });

    // Attempt 10: 500 * 2^10 = 512,000, capped at 30,000 -> [22500, 37500]
    const delay10 = policy.nextRetryDelayInMilliseconds({
      previousRetryCount: 10,
      elapsedMilliseconds: 120000,
      retryReason: new Error('timeout')
    });
    expect(delay10).not.toBeNull();
    expect(delay10!).toBeGreaterThanOrEqual(22500);
    expect(delay10!).toBeLessThanOrEqual(30000);
  });

  it('stops retrying when previousRetryCount reaches maxAttempts', () => {
    const policy = new ExponentialBackoffRetryPolicy({
      maxAttempts: 3
    });

    const delay2 = policy.nextRetryDelayInMilliseconds({
      previousRetryCount: 2,
      elapsedMilliseconds: 1000,
      retryReason: new Error('error')
    });
    expect(delay2).not.toBeNull();

    const delay3 = policy.nextRetryDelayInMilliseconds({
      previousRetryCount: 3,
      elapsedMilliseconds: 2000,
      retryReason: new Error('error')
    });
    expect(delay3).toBeNull();
  });
});
