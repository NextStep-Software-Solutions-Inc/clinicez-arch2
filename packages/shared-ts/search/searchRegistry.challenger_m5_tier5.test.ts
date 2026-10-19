import { beforeEach, describe, expect, it } from 'bun:test';
import {
  UniversalSearchRegistry,
  type SearchContributor,
  type SearchItem,
} from './searchRegistry';

describe('Tier 5 White-Box Adversarial Hardening: UniversalSearchRegistry', () => {
  let registry: UniversalSearchRegistry;

  beforeEach(() => {
    registry = new UniversalSearchRegistry();
  });

  const createItem = (id: string, category: string, title: string): SearchItem => ({
    id,
    category,
    title,
    subtitle: `${category} subtitle`,
    targetRoute: category,
  });

  // =========================================================================
  // 1. CONTRIBUTOR ERROR RESILIENCE: SYNC THROWS, ASYNC REJECTIONS, MALFORMED DTOs
  // =========================================================================
  describe('Dimension 1: Contributor Error Resilience & Fault Isolation', () => {
    it('isolates synchronous Error throw without crashing search or dropping sibling results', async () => {
      registry.register({
        id: 'crasher-sync-error',
        category: 'Broken',
        categoryLabel: 'Broken',
        priority: 10,
        search: () => {
          throw new Error('Fatal synchronous boom');
        },
      });

      registry.register({
        id: 'healthy-provider',
        category: 'Healthy',
        categoryLabel: 'Healthy',
        priority: 20,
        search: () => [createItem('h1', 'Healthy', 'Healthy Item')],
      });

      const results = await registry.search('query');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('h1');
      expect(results[0].category).toBe('Healthy');
    });

    it('isolates synchronous non-Error throws (string, null, number, object)', async () => {
      const throwTypes = ['string exception', null, 404, { custom: 'err' }];

      for (let i = 0; i < throwTypes.length; i++) {
        const val = throwTypes[i];
        const reg = new UniversalSearchRegistry();
        reg.register({
          id: `crasher-${i}`,
          category: 'Crasher',
          categoryLabel: 'Crasher',
          priority: 10,
          search: () => {
            throw val;
          },
        });
        reg.register({
          id: `healthy-${i}`,
          category: 'Healthy',
          categoryLabel: 'Healthy',
          priority: 20,
          search: () => [createItem(`h-${i}`, 'Healthy', 'Healthy Item')],
        });

        const results = await reg.search('test');
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe(`h-${i}`);
      }
    });

    it('isolates asynchronous promise rejections (Error and non-Error rejections)', async () => {
      registry.register({
        id: 'async-crasher-error',
        category: 'AsyncError',
        categoryLabel: 'AsyncError',
        priority: 10,
        search: async () => {
          throw new Error('Async network drop');
        },
      });

      registry.register({
        id: 'async-crasher-string',
        category: 'AsyncString',
        categoryLabel: 'AsyncString',
        priority: 15,
        search: () => Promise.reject('Rejected promise raw string'),
      });

      registry.register({
        id: 'healthy-async',
        category: 'Healthy',
        categoryLabel: 'Healthy',
        priority: 20,
        search: async () => [createItem('h-async', 'Healthy', 'Async Item')],
      });

      const results = await registry.search('test');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('h-async');
    });

    it('handles contributors returning null, undefined, primitives, or non-array objects gracefully', async () => {
      const invalidReturns = [null, undefined, 42, 'string', { notAnArray: true }, true];

      for (let i = 0; i < invalidReturns.length; i++) {
        const reg = new UniversalSearchRegistry();
        reg.register({
          id: `invalid-${i}`,
          category: 'Invalid',
          categoryLabel: 'Invalid',
          priority: 10,
          search: (() => invalidReturns[i]) as any,
        });

        reg.register({
          id: `healthy-${i}`,
          category: 'Healthy',
          categoryLabel: 'Healthy',
          priority: 20,
          search: () => [createItem(`h-${i}`, 'Healthy', 'Healthy Item')],
        });

        const results = await reg.search('test');
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe(`h-${i}`);
      }
    });

    it('survives cascading simultaneous crashes across multiple contributors', async () => {
      // 5 failing contributors + 2 healthy contributors
      for (let i = 1; i <= 5; i++) {
        registry.register({
          id: `failing-${i}`,
          category: `Fail${i}`,
          categoryLabel: `Fail${i}`,
          priority: i * 10,
          search: () => {
            if (i % 2 === 0) throw new Error(`Sync fail ${i}`);
            return Promise.reject(new Error(`Async fail ${i}`));
          },
        });
      }

      registry.register({
        id: 'healthy-1',
        category: 'Healthy',
        categoryLabel: 'Healthy',
        priority: 15,
        search: () => [createItem('h1', 'Healthy', 'Item 1')],
      });

      registry.register({
        id: 'healthy-2',
        category: 'Healthy',
        categoryLabel: 'Healthy',
        priority: 25,
        search: () => [createItem('h2', 'Healthy', 'Item 2')],
      });

      const results = await registry.search('cascade');
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('h1');
      expect(results[1].id).toBe('h2');
    });
  });

  // =========================================================================
  // 2. ZERO AND NEGATIVE LIMIT ARGUMENTS
  // =========================================================================
  describe('Dimension 2: Zero and Negative Limit Arguments', () => {
    beforeEach(() => {
      registry.register({
        id: 'provider-items',
        category: 'Items',
        categoryLabel: 'Items',
        search: () => [
          createItem('i1', 'Items', 'Item 1'),
          createItem('i2', 'Items', 'Item 2'),
          createItem('i3', 'Items', 'Item 3'),
          createItem('i4', 'Items', 'Item 4'),
          createItem('i5', 'Items', 'Item 5'),
        ],
      });
    });

    it('returns all aggregated items when limit is undefined, 0, or negative', async () => {
      // Undefined limit
      const resUndefined = await registry.search('test');
      expect(resUndefined).toHaveLength(5);

      // Limit = 0 (guard: options.limit > 0 evaluates false, so all items returned)
      const resZero = await registry.search('test', { limit: 0 });
      expect(resZero).toHaveLength(5);

      // Limit = -1
      const resNeg1 = await registry.search('test', { limit: -1 });
      expect(resNeg1).toHaveLength(5);

      // Limit = -100
      const resNeg100 = await registry.search('test', { limit: -100 });
      expect(resNeg100).toHaveLength(5);
    });

    it('enforces positive limit caps accurately', async () => {
      const res2 = await registry.search('test', { limit: 2 });
      expect(res2).toHaveLength(2);
      expect(res2.map((i) => i.id)).toEqual(['i1', 'i2']);

      const res4 = await registry.search('test', { limit: 4 });
      expect(res4).toHaveLength(4);

      const res10 = await registry.search('test', { limit: 10 });
      expect(res10).toHaveLength(5);
    });
  });

  // =========================================================================
  // 3. TIMEOUT AND ABORT SIGNAL CUTOFF
  // =========================================================================
  describe('Dimension 3: Timeout and AbortSignal Cutoff', () => {
    it('times out slow contributors when timeoutMs is set while healthy contributors succeed', async () => {
      registry.register({
        id: 'slow-contributor',
        category: 'Slow',
        categoryLabel: 'Slow',
        priority: 10,
        search: () => new Promise((resolve) => setTimeout(() => resolve([createItem('s1', 'Slow', 'Slow')]), 300)),
      });

      registry.register({
        id: 'fast-contributor',
        category: 'Fast',
        categoryLabel: 'Fast',
        priority: 20,
        search: () => [createItem('f1', 'Fast', 'Fast')],
      });

      const results = await registry.search('test', { timeoutMs: 60 });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('f1');
    });

    it('aborts immediately and returns empty array when AbortSignal is pre-aborted', async () => {
      let executed = false;
      registry.register({
        id: 'provider',
        category: 'Test',
        categoryLabel: 'Test',
        search: () => {
          executed = true;
          return [createItem('1', 'Test', 'Test')];
        },
      });

      const controller = new AbortController();
      controller.abort();

      const results = await registry.search('test', { signal: controller.signal });
      expect(results).toEqual([]);
      expect(executed).toBe(false);
    });
  });

  // =========================================================================
  // 4. ADVERSARIAL QUERY STRINGS
  // =========================================================================
  describe('Dimension 4: Adversarial Query Strings', () => {
    const adversarialQueries = [
      "' OR '1'='1' --",
      "'; DROP TABLE Patients; --",
      'UNION SELECT null, null, null--',
      'admin\'/*',
      '1\' AND SLEEP(5)--',
      '^.*+?{}()|[]\\',
      '(?=.*a)',
      '[a-z0-9]',
      '\\d+',
      '\\b\\w+\\b',
      '{0}',
      '{{}}',
      '%s%s%s%s',
      'Parañaque',
      'Santo Niño',
      '🏥 🦷 💊 🩺 💉',
      'مرحبا بالعالم',
      '你好世界',
      '   leading-and-trailing-whitespace   ',
    ];

    it.each(adversarialQueries)(
      'processes adversarial query cleanly: %s',
      async (query) => {
        let receivedQuery = '';
        registry.register({
          id: 'adversarial-target',
          category: 'Echo',
          categoryLabel: 'Echo',
          search: (q) => {
            receivedQuery = q;
            return [createItem('1', 'Echo', `Echo ${q}`)];
          },
        });

        const results = await registry.search(query);
        expect(results).toHaveLength(1);
        expect(receivedQuery).toBe(query.trim());
      },
    );

    it('handles query of 50,000 characters without crashing or hanging', async () => {
      const longQuery = 'X'.repeat(50000);
      let capturedLength = 0;
      registry.register({
        id: 'long-query-target',
        category: 'Echo',
        categoryLabel: 'Echo',
        search: (q) => {
          capturedLength = q.length;
          return [];
        },
      });

      const results = await registry.search(longQuery);
      expect(results).toEqual([]);
      expect(capturedLength).toBe(50000);
    });
  });

  // =========================================================================
  // 5. REGISTRATION DEFENSIVE VALIDATION
  // =========================================================================
  describe('Dimension 5: Registration Validation', () => {
    it('rejects invalid or missing contributor IDs', () => {
      expect(() => registry.register(null as any)).toThrow();
      expect(() => registry.register({ id: '', category: 'Cat', search: () => [] } as any)).toThrow(
        'Contributor must have a valid non-empty id',
      );
      expect(() => registry.register({ id: '   ', category: 'Cat', search: () => [] } as any)).toThrow(
        'Contributor must have a valid non-empty id',
      );
    });

    it('rejects invalid or missing category', () => {
      expect(() => registry.register({ id: 'valid', category: '', search: () => [] } as any)).toThrow(
        "Contributor 'valid' must have a valid non-empty category",
      );
      expect(() => registry.register({ id: 'valid', category: '   ', search: () => [] } as any)).toThrow(
        "Contributor 'valid' must have a valid non-empty category",
      );
    });

    it('rejects missing or non-function search handler', () => {
      expect(() => registry.register({ id: 'valid', category: 'Valid', search: null } as any)).toThrow(
        "Contributor 'valid' must have a search function",
      );
      expect(() => registry.register({ id: 'valid', category: 'Valid', search: 'not-a-fn' } as any)).toThrow(
        "Contributor 'valid' must have a search function",
      );
    });

    it('returns false when unregistering non-existent contributor', () => {
      expect(registry.unregister('non-existent')).toBe(false);
    });

    it('provides idempotent unregister callbacks', () => {
      const unregister = registry.register({
        id: 'temp',
        category: 'Temp',
        categoryLabel: 'Temp',
        search: () => [],
      });

      expect(registry.has('temp')).toBe(true);
      unregister();
      expect(registry.has('temp')).toBe(false);
      // Second call does not throw or error
      expect(() => unregister()).not.toThrow();
    });
  });
});
