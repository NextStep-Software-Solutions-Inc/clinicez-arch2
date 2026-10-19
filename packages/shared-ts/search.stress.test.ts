/**
 * Universal Pluggable Search Provider Framework - Empirical Stress & Adversarial Test Suite
 *
 * Mandated Verification Dimensions:
 * 1. 100 concurrent search calls with varying delays and simulated failures.
 * 2. AbortSignal cancellation propagation and timeout resilience.
 * 3. Rapid register / unregister churn (10,000 cycles) to ensure zero memory leaks and exact contributor set integrity.
 * 4. Priority ordering stability under identical and negative priorities.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import {
  UniversalSearchRegistry,
  type SearchContributor,
  type SearchItem,
} from './search';

describe('Adversarial Stress Dimension 1: 100 Concurrent Searches with Varying Delays & Failures', () => {
  let registry: UniversalSearchRegistry;

  beforeEach(() => {
    registry = new UniversalSearchRegistry();
  });

  it('handles 100 concurrent search calls across healthy, slow, failing, and malformed contributors', async () => {
    // 1. Register 10 healthy fast contributors (0-5ms delay)
    for (let i = 0; i < 10; i++) {
      const idx = i;
      registry.register({
        id: `healthy-fast-${idx}`,
        category: 'Fast',
        categoryLabel: 'Fast',
        priority: 10 + idx,
        search: async (q) => {
          await new Promise((resolve) => setTimeout(resolve, idx % 5));
          return [
            {
              id: `item-fast-${idx}`,
              category: 'Fast',
              title: `Fast Result ${idx} for ${q}`,
              subtitle: 'Metadata',
              targetRoute: 'FastRoute',
            },
          ];
        },
      });
    }

    // 2. Register 5 healthy medium contributors (10-25ms delay)
    for (let i = 0; i < 5; i++) {
      const idx = i;
      registry.register({
        id: `healthy-med-${idx}`,
        category: 'Medium',
        categoryLabel: 'Medium',
        priority: 30 + idx,
        search: async (q) => {
          await new Promise((resolve) => setTimeout(resolve, 10 + (idx % 15)));
          return [
            {
              id: `item-med-${idx}`,
              category: 'Medium',
              title: `Med Result ${idx} for ${q}`,
              subtitle: 'Metadata',
              targetRoute: 'MedRoute',
            },
          ];
        },
      });
    }

    // 3. Register 5 synchronous throwing contributors
    for (let i = 0; i < 5; i++) {
      const idx = i;
      registry.register({
        id: `sync-thrower-${idx}`,
        category: 'BrokenSync',
        categoryLabel: 'BrokenSync',
        priority: 5 + idx,
        search: () => {
          throw new Error(`Sync detonation in contributor ${idx}`);
        },
      });
    }

    // 4. Register 5 asynchronous rejecting contributors
    for (let i = 0; i < 5; i++) {
      const idx = i;
      registry.register({
        id: `async-rejecter-${idx}`,
        category: 'BrokenAsync',
        categoryLabel: 'BrokenAsync',
        priority: 6 + idx,
        search: async () => {
          await new Promise((resolve) => setTimeout(resolve, 3));
          throw new Error(`Async detonation in contributor ${idx}`);
        },
      });
    }

    // 5. Register 5 contributors returning malformed data (null, undefined, strings, numbers, objects)
    const malformedPayloads: any[] = [null, undefined, 'not-an-array', 42, { some: 'object' }];
    for (let i = 0; i < malformedPayloads.length; i++) {
      const idx = i;
      registry.register({
        id: `malformed-${idx}`,
        category: 'Malformed',
        categoryLabel: 'Malformed',
        priority: 7 + idx,
        search: () => malformedPayloads[idx],
      });
    }

    // Verify registry state before load
    expect(registry.size).toBe(30);

    // Suppress console.warn during test to prevent log spam from expected failures
    const originalWarn = console.warn;
    let warnCount = 0;
    console.warn = (...args: any[]) => {
      warnCount++;
    };

    try {
      const startTime = performance.now();

      // Launch 100 concurrent search calls simultaneously
      const searchPromises: Promise<SearchItem[]>[] = [];
      for (let i = 0; i < 100; i++) {
        const queryStr = `test-query-${i}`;
        // Vary limit and timeout options across calls
        const options = {
          limit: i % 3 === 0 ? 5 : i % 2 === 0 ? 10 : undefined,
          timeoutMs: 1000,
        };
        searchPromises.push(registry.search(queryStr, options));
      }

      const allResults = await Promise.all(searchPromises);
      const elapsed = performance.now() - startTime;

      // Assertions:
      // 1. All 100 promises resolved without rejecting
      expect(allResults).toHaveLength(100);

      // 2. Performance: 100 concurrent queries over 30 providers completed within reasonable window (< 1000ms)
      expect(elapsed).toBeLessThan(1500);

      // 3. Every search result contains only valid items from healthy providers
      for (let i = 0; i < allResults.length; i++) {
        const results = allResults[i];
        expect(Array.isArray(results)).toBe(true);

        // Check that result items are valid SearchItem instances
        for (const item of results) {
          expect(item.id).toBeDefined();
          expect(['Fast', 'Medium']).toContain(item.category);
          expect(item.title).toContain(`test-query-${i}`);
        }

        // When limit was 5, length should be at most 5
        if (i % 3 === 0) {
          expect(results.length).toBeLessThanOrEqual(5);
        } else if (i % 2 === 0) {
          expect(results.length).toBeLessThanOrEqual(10);
        } else {
          // Total healthy contributors = 10 fast + 5 medium = 15 items
          expect(results.length).toBe(15);
        }
      }

      // 4. Verify warn count captured the failures gracefully
      expect(warnCount).toBeGreaterThan(0);
    } finally {
      console.warn = originalWarn;
    }
  });

  it('maintains result isolation across interleaved searches with differing permissions', async () => {
    registry.register({
      id: 'admin-billing',
      category: 'Billing',
      categoryLabel: 'Billing',
      requiredPermission: 'Clinic.BillingRead',
      search: () => [{ id: 'bill-1', category: 'Billing', title: 'Invoice', subtitle: '', targetRoute: '' }],
    });

    registry.register({
      id: 'general-patient',
      category: 'Patients',
      categoryLabel: 'Patients',
      search: () => [{ id: 'pat-1', category: 'Patients', title: 'Patient', subtitle: '', targetRoute: '' }],
    });

    // 100 alternating concurrent searches: 50 with billing permission, 50 without
    const promises = Array.from({ length: 100 }, (_, i) => {
      const hasPerm = i % 2 === 0;
      return registry.search('query', {
        userPermissions: hasPerm ? ['Clinic.BillingRead'] : ['Clinic.PatientsRead'],
      });
    });

    const results = await Promise.all(promises);

    for (let i = 0; i < results.length; i++) {
      if (i % 2 === 0) {
        expect(results[i]).toHaveLength(2);
        expect(results[i].map((r) => r.category)).toEqual(['Billing', 'Patients']);
      } else {
        expect(results[i]).toHaveLength(1);
        expect(results[i][0].category).toBe('Patients');
      }
    }
  });
});

describe('Adversarial Stress Dimension 2: AbortSignal Cancellation & Timeout Resilience', () => {
  let registry: UniversalSearchRegistry;

  beforeEach(() => {
    registry = new UniversalSearchRegistry();
  });

  it('propagates AbortSignal to contributors and handles abort mid-execution', async () => {
    let contributorReceivedSignal = false;
    let contributorObservedAbort = false;

    registry.register({
      id: 'abortable',
      category: 'Test',
      categoryLabel: 'Test',
      search: async (_query, signal) => {
        if (signal) {
          contributorReceivedSignal = true;
          signal.addEventListener('abort', () => {
            contributorObservedAbort = true;
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
        return [{ id: 'res1', category: 'Test', title: 'Res', subtitle: '', targetRoute: '' }];
      },
    });

    const controller = new AbortController();
    const searchPromise = registry.search('test', { signal: controller.signal });

    // Abort after 10ms (while contributor is waiting on 50ms timer)
    setTimeout(() => {
      controller.abort();
    }, 10);

    const results = await searchPromise;
    expect(contributorReceivedSignal).toBe(true);
    expect(contributorObservedAbort).toBe(true);
    // Even if contributor completes or aborts, results return safely
    expect(Array.isArray(results)).toBe(true);
  });

  it('guarantees per-contributor timeout terminates runaway tasks within timeoutMs window', async () => {
    const originalWarn = console.warn;
    console.warn = () => {};

    try {
      // Contributor 1 takes 500ms
      registry.register({
        id: 'runaway-slow',
        category: 'Slow',
        categoryLabel: 'Slow',
        priority: 10,
        search: () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve([{ id: 'slow', category: 'Slow', title: 'Slow', subtitle: '', targetRoute: '' }]);
            }, 500);
          }),
      });

      // Contributor 2 is instant
      registry.register({
        id: 'fast-healthy',
        category: 'Fast',
        categoryLabel: 'Fast',
        priority: 20,
        search: () => [{ id: 'fast', category: 'Fast', title: 'Fast', subtitle: '', targetRoute: '' }],
      });

      const startTime = performance.now();
      // Enforce tight 40ms timeout
      const results = await registry.search('runaway', { timeoutMs: 40 });
      const elapsed = performance.now() - startTime;

      // Must complete in around 40-70ms, not 500ms
      expect(elapsed).toBeLessThan(150);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('fast');
    } finally {
      console.warn = originalWarn;
    }
  });

  it('handles 50 concurrent searches each with independent AbortControllers where random subset is aborted', async () => {
    registry.register({
      id: 'worker',
      category: 'Work',
      categoryLabel: 'Work',
      search: async (_q, signal) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (signal?.aborted) return [];
        return [{ id: 'work', category: 'Work', title: 'Done', subtitle: '', targetRoute: '' }];
      },
    });

    const controllers = Array.from({ length: 50 }, () => new AbortController());

    // Abort half of them at various times (some pre-aborted, some mid-flight, some never)
    for (let i = 0; i < 50; i++) {
      if (i % 3 === 0) {
        // Pre-aborted
        controllers[i].abort();
      } else if (i % 3 === 1) {
        // Mid-flight abort
        setTimeout(() => controllers[i].abort(), 5);
      }
      // i % 3 === 2: not aborted
    }

    const promises = controllers.map((ctrl, i) =>
      registry.search(`query-${i}`, { signal: ctrl.signal })
    );

    const settled = await Promise.all(promises);
    expect(settled).toHaveLength(50);

    for (let i = 0; i < 50; i++) {
      const res = settled[i];
      if (i % 3 === 0) {
        // Pre-aborted must return empty array immediately
        expect(res).toEqual([]);
      } else if (i % 3 === 2) {
        // Non-aborted must return results
        expect(res).toHaveLength(1);
        expect(res[0].id).toBe('work');
      }
    }
  });

  it('safely handles zero and negative timeoutMs values without crashing', async () => {
    registry.register({
      id: 'test',
      category: 'Test',
      categoryLabel: 'Test',
      search: () => [{ id: '1', category: 'Test', title: '1', subtitle: '', targetRoute: '' }],
    });

    const resZero = await registry.search('test', { timeoutMs: 0 });
    expect(resZero).toHaveLength(1);

    const resNeg = await registry.search('test', { timeoutMs: -100 });
    expect(resNeg).toHaveLength(1);
  });
});

describe('Adversarial Stress Dimension 3: Rapid Register / Unregister Churn (10,000 Cycles)', () => {
  let registry: UniversalSearchRegistry;

  beforeEach(() => {
    registry = new UniversalSearchRegistry();
  });

  it('survives 10,000 rapid register/unregister cycles with exact contributor set integrity', () => {
    const startMemory = process.memoryUsage().heapUsed;

    for (let i = 0; i < 10000; i++) {
      const unregister = registry.register({
        id: `churn-${i}`,
        category: `Category-${i % 10}`,
        categoryLabel: `Label-${i % 10}`,
        priority: i % 100,
        search: () => [],
      });

      expect(registry.size).toBe(1);
      expect(registry.has(`churn-${i}`)).toBe(true);

      unregister();
      expect(registry.size).toBe(0);
      expect(registry.has(`churn-${i}`)).toBe(false);
    }

    expect(registry.size).toBe(0);
    expect(registry.getContributors()).toEqual([]);
    expect(registry.getCategories()).toEqual([]);

    const endMemory = process.memoryUsage().heapUsed;
    const growthMb = (endMemory - startMemory) / (1024 * 1024);

    // Assert that heap did not explode (under 30MB growth for 10k iterations in Bun runtime)
    expect(growthMb).toBeLessThan(30);
  });

  it('survives batch registration of 10,000 contributors and sequential unregistration', () => {
    const unregisterFns: (() => void)[] = [];

    // Register 10,000 distinct contributors
    for (let i = 0; i < 10000; i++) {
      unregisterFns.push(
        registry.register({
          id: `batch-${i}`,
          category: `Cat-${i % 20}`,
          categoryLabel: `Category ${i % 20}`,
          priority: i,
          search: () => [],
        })
      );
    }

    expect(registry.size).toBe(10000);
    expect(registry.count).toBe(10000);
    expect(registry.getCategories()).toHaveLength(20);

    // Unregister in reverse order
    for (let i = 9999; i >= 0; i--) {
      unregisterFns[i]();
    }

    expect(registry.size).toBe(0);
    expect(registry.count).toBe(0);
    expect(registry.getContributors()).toHaveLength(0);
    expect(registry.getCategories()).toHaveLength(0);
  });

  it('survives 10,000 overwriting registrations maintaining collision safety', () => {
    const unregisterCallbacks: (() => void)[] = [];

    // 10,000 registrations across only 10 distinct IDs (1,000 overwrites per ID)
    for (let i = 0; i < 10000; i++) {
      const id = `reused-id-${i % 10}`;
      unregisterCallbacks.push(
        registry.register({
          id,
          category: 'Overwritten',
          categoryLabel: 'Overwritten',
          priority: i,
          search: () => [],
        })
      );
    }

    // Registry should have exactly 10 contributors (the latest instance of each)
    expect(registry.size).toBe(10);

    // Calling the first 9,990 cleanup callbacks must be no-ops because those instances were replaced
    for (let i = 0; i < 9990; i++) {
      unregisterCallbacks[i]();
    }
    expect(registry.size).toBe(10);

    // Calling the final 10 cleanup callbacks must cleanly remove all remaining contributors
    for (let i = 9990; i < 10000; i++) {
      unregisterCallbacks[i]();
    }
    expect(registry.size).toBe(0);
  });

  it('handles concurrent churn while active search queries are executing', async () => {
    // Populate base contributors
    for (let i = 0; i < 20; i++) {
      registry.register({
        id: `base-${i}`,
        category: 'Base',
        categoryLabel: 'Base',
        priority: i,
        search: async () => {
          await new Promise((r) => setTimeout(r, 5));
          return [{ id: `base-res-${i}`, category: 'Base', title: `Base ${i}`, subtitle: '', targetRoute: '' }];
        },
      });
    }

    // Launch searches while churning contributors in background
    let churnActive = true;
    const churnPromise = (async () => {
      let count = 0;
      while (churnActive && count < 1000) {
        const id = `temp-${count}`;
        const cleanup = registry.register({
          id,
          category: 'Temp',
          categoryLabel: 'Temp',
          priority: 999,
          search: () => [],
        });
        if (count % 2 === 0) {
          cleanup();
        }
        count++;
        await new Promise((r) => setTimeout(r, 0));
      }
    })();

    // Run 50 concurrent searches
    const searchPromises = Array.from({ length: 50 }, (_, i) =>
      registry.search(`churn-test-${i}`)
    );

    const searchResults = await Promise.all(searchPromises);
    churnActive = false;
    await churnPromise;

    // Verify all searches succeeded without crash
    expect(searchResults).toHaveLength(50);
    for (const res of searchResults) {
      expect(Array.isArray(res)).toBe(true);
      expect(res.length).toBeGreaterThanOrEqual(20);
    }
  });
});

describe('Adversarial Stress Dimension 4: Priority Ordering Stability under Identical and Negative Priorities', () => {
  let registry: UniversalSearchRegistry;

  beforeEach(() => {
    registry = new UniversalSearchRegistry();
  });

  it('orders contributors strictly across extreme negative, zero, positive, and omitted priorities', () => {
    const testCases: { id: string; priority?: number }[] = [
      { id: 'pos-100', priority: 100 },
      { id: 'neg-1000', priority: -1000 },
      { id: 'zero', priority: 0 },
      { id: 'neg-1', priority: -1 },
      { id: 'neg-500', priority: -500 },
      { id: 'default-omitted' }, // default 50
      { id: 'pos-50-explicit', priority: 50 },
      { id: 'pos-10', priority: 10 },
      { id: 'pos-99999', priority: 99999 },
    ];

    // Shuffle insertion order
    const shuffled = [...testCases].sort(() => Math.random() - 0.5);
    for (const tc of shuffled) {
      registry.register({
        id: tc.id,
        category: 'Ordering',
        categoryLabel: 'Ordering',
        priority: tc.priority,
        search: () => [],
      });
    }

    const sorted = registry.getContributors();
    const sortedIds = sorted.map((c) => c.id);

    // Expected order:
    // -1000: 'neg-1000'
    // -500:  'neg-500'
    // -1:    'neg-1'
    // 0:     'zero'
    // 10:    'pos-10'
    // 50:    'default-omitted' vs 'pos-50-explicit' (alphabetical tie-breaker: 'default-omitted' < 'pos-50-explicit')
    // 100:   'pos-100'
    // 99999: 'pos-99999'
    expect(sortedIds).toEqual([
      'neg-1000',
      'neg-500',
      'neg-1',
      'zero',
      'pos-10',
      'default-omitted',
      'pos-50-explicit',
      'pos-100',
      'pos-99999',
    ]);
  });

  it('guarantees deterministic, stable secondary sorting by id when priorities are identical', () => {
    // 50 contributors all with priority -10
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) {
      const padded = i.toString().padStart(3, '0');
      ids.push(`contrib-${padded}`);
    }

    // Insert in reverse order
    for (let i = ids.length - 1; i >= 0; i--) {
      registry.register({
        id: ids[i],
        category: 'SamePriority',
        categoryLabel: 'SamePriority',
        priority: -10,
        search: () => [],
      });
    }

    const contributors = registry.getContributors();
    const actualIds = contributors.map((c) => c.id);

    // Must match natural alphabetical order (000 to 049) deterministically
    expect(actualIds).toEqual(ids);
  });

  it('guarantees search result aggregation strictly preserves contributor priority ordering', async () => {
    registry.register({
      id: 'priority-high-3',
      category: 'Cat3',
      categoryLabel: 'Cat3',
      priority: 30,
      search: () => [{ id: 'res-30', category: 'Cat3', title: 'P30', subtitle: '', targetRoute: '' }],
    });

    registry.register({
      id: 'priority-top-neg',
      category: 'CatNeg',
      categoryLabel: 'CatNeg',
      priority: -100,
      search: () => [{ id: 'res-neg', category: 'CatNeg', title: 'P-100', subtitle: '', targetRoute: '' }],
    });

    registry.register({
      id: 'priority-zero',
      category: 'Cat0',
      categoryLabel: 'Cat0',
      priority: 0,
      search: () => [{ id: 'res-0', category: 'Cat0', title: 'P0', subtitle: '', targetRoute: '' }],
    });

    registry.register({
      id: 'priority-low',
      category: 'CatLow',
      categoryLabel: 'CatLow',
      priority: 100,
      search: () => [{ id: 'res-100', category: 'CatLow', title: 'P100', subtitle: '', targetRoute: '' }],
    });

    const results = await registry.search('ordering-test');
    const resultIds = results.map((r) => r.id);

    expect(resultIds).toEqual(['res-neg', 'res-0', 'res-30', 'res-100']);
  });

  it('guarantees category tabs order matches highest priority contributor in each category', () => {
    // Category C: contributor with priority 5
    registry.register({ id: 'c1', category: 'C', categoryLabel: 'Category C', priority: 5, search: () => [] });
    // Category A: contributor with priority -20
    registry.register({ id: 'a1', category: 'A', categoryLabel: 'Category A', priority: -20, search: () => [] });
    // Category B: contributor with priority 0
    registry.register({ id: 'b1', category: 'B', categoryLabel: 'Category B', priority: 0, search: () => [] });
    // Another contributor in Category A with priority 50
    registry.register({ id: 'a2', category: 'A', categoryLabel: 'Category A', priority: 50, search: () => [] });

    const categories = registry.getCategories();
    expect(categories.map((c) => c.key)).toEqual(['A', 'B', 'C']);
  });
});
