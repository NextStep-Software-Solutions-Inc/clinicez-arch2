import { describe, expect, it } from 'bun:test';
import { ExponentialBackoffRetryPolicy } from '../../src/core/connection/ExponentialBackoffRetryPolicy';

describe('Adversarial Scenario 1: Exponential Backoff Jitter Bounds', () => {
  it('runs 1,000 randomized iterations across attempts 0-15 and verifies bounds', () => {
    const maxDelayMs = 30000;
    const initialDelayMs = 500;
    const factor = 2.0;
    const jitterFactor = 0.25;

    const policy = new ExponentialBackoffRetryPolicy({
      initialDelayMs,
      maxDelayMs,
      factor,
      jitterFactor
    });

    const error = new Error('simulated network disconnection');

    let totalViolationsMax = 0;
    let totalViolationsMin = 0;
    let maxObservedDelay = 0;
    let minObservedDelay = Infinity;

    for (let i = 0; i < 1000; i++) {
      for (let attempt = 0; attempt <= 15; attempt++) {
        const delay = policy.nextRetryDelayInMilliseconds({
          previousRetryCount: attempt,
          elapsedMilliseconds: attempt * 1000,
          retryReason: error
        });

        expect(delay).not.toBeNull();
        if (delay === null) continue;

        if (delay > maxObservedDelay) maxObservedDelay = delay;
        if (delay < minObservedDelay) minObservedDelay = delay;

        // Minimum floor check (at least 100ms or lower bound of attempt 0)
        if (delay < 100) {
          totalViolationsMin++;
        }

        // Hard ceiling check: delays must never exceed maxDelayMs (30s)
        if (delay > maxDelayMs) {
          totalViolationsMax++;
        }
      }
    }

    console.log(`[Adversarial Jitter] minObserved=${minObservedDelay}ms, maxObserved=${maxObservedDelay}ms, ceilingViolations=${totalViolationsMax}`);

    // Verify minimum floor is respected
    expect(totalViolationsMin).toBe(0);

    // Verify hard ceiling is respected
    expect(totalViolationsMax).toBe(0);
    expect(maxObservedDelay).toBeLessThanOrEqual(maxDelayMs);
  });
});
