import { beforeEach, describe, expect, it } from 'bun:test';
import {
  UniversalSearchRegistry,
  universalSearchRegistry,
  type SearchBadge,
  type SearchBadgeDto,
  type SearchBadgeVariant,
  type SearchCategoryDto,
  type SearchContributor,
  type SearchItem,
  type SearchResponse,
  type SearchResponseDto,
  type SearchResultItemDto,
} from './search';

describe('UniversalSearchRegistry - Registration & Lifecycle', () => {
  let registry: UniversalSearchRegistry;

  beforeEach(() => {
    registry = new UniversalSearchRegistry();
  });

  it('registers a contributor and returns an unregister function', () => {
    const unregister = registry.register({
      id: 'patients',
      category: 'Patients',
      categoryLabel: 'Patients',
      search: () => [],
    });

    expect(registry.has('patients')).toBe(true);
    expect(registry.size).toBe(1);
    expect(registry.count).toBe(1);

    unregister();
    expect(registry.has('patients')).toBe(false);
    expect(registry.size).toBe(0);
    expect(registry.count).toBe(0);
  });

  it('unregisters a contributor via unregister()', () => {
    registry.register({
      id: 'patients',
      category: 'Patients',
      categoryLabel: 'Patients',
      search: () => [],
    });

    expect(registry.unregister('patients')).toBe(true);
    expect(registry.unregister('patients')).toBe(false);
    expect(registry.has('patients')).toBe(false);
  });

  it('validates contributor properties on registration', () => {
    // Missing id or whitespace id
    expect(() => {
      registry.register({ id: '', category: 'Patients', categoryLabel: 'Patients', search: () => [] });
    }).toThrow('must have a valid non-empty id');

    expect(() => {
      registry.register({ id: '   ', category: 'Patients', categoryLabel: 'Patients', search: () => [] });
    }).toThrow('must have a valid non-empty id');

    // Missing category or whitespace category
    expect(() => {
      registry.register({ id: 'bad', category: '', categoryLabel: 'Bad', search: () => [] });
    }).toThrow('must have a valid non-empty category');

    expect(() => {
      registry.register({ id: 'bad', category: '   ', categoryLabel: 'Bad', search: () => [] });
    }).toThrow('must have a valid non-empty category');

    // Missing search function
    expect(() => {
      registry.register({ id: 'bad2', category: 'Cat', categoryLabel: 'Cat', search: null as any });
    }).toThrow('must have a search function');

    expect(() => {
      registry.register({ id: 'bad3', category: 'Cat', categoryLabel: 'Cat', search: 'not-a-function' as any });
    }).toThrow('must have a search function');
  });

  it('overwrites a contributor with the same id', () => {
    registry.register({
      id: 'test',
      category: 'Initial',
      categoryLabel: 'Initial Label',
      priority: 10,
      search: () => [],
    });

    registry.register({
      id: 'test',
      category: 'Updated',
      categoryLabel: 'Updated Label',
      priority: 20,
      search: () => [],
    });

    expect(registry.size).toBe(1);
    const contributor = registry.getContributor('test');
    expect(contributor?.category).toBe('Updated');
    expect(contributor?.priority).toBe(20);
  });

  it('clears all registered contributors with clear()', () => {
    registry.register({ id: 'c1', category: 'C1', categoryLabel: 'C1', search: () => [] });
    registry.register({ id: 'c2', category: 'C2', categoryLabel: 'C2', search: () => [] });
    expect(registry.size).toBe(2);

    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.getContributors()).toEqual([]);
  });

  it('guarantees ID collision safe cleanup when multiple instances register under same ID', () => {
    const contributorA: SearchContributor = {
      id: 'collision-id',
      category: 'Patients',
      categoryLabel: 'Patients A',
      search: () => [],
    };
    const contributorB: SearchContributor = {
      id: 'collision-id',
      category: 'Patients',
      categoryLabel: 'Patients B',
      search: () => [],
    };

    const cleanupA = registry.register(contributorA);
    const cleanupB = registry.register(contributorB);

    expect(registry.getContributor('collision-id')).toBe(contributorB);

    // Calling cleanupA should NOT remove contributorB
    cleanupA();
    expect(registry.has('collision-id')).toBe(true);
    expect(registry.getContributor('collision-id')).toBe(contributorB);

    // Calling cleanupB should now remove contributorB
    cleanupB();
    expect(registry.has('collision-id')).toBe(false);
  });

  it('survives 50 simulated mount and unmount cycles without memory leaks', () => {
    const cleanups: (() => void)[] = [];
    for (let i = 0; i < 50; i++) {
      cleanups.push(
        registry.register({
          id: `contributor-${i}`,
          category: `Category-${i % 5}`,
          categoryLabel: `Label ${i % 5}`,
          search: () => [],
        })
      );
    }

    expect(registry.size).toBe(50);
    expect(registry.count).toBe(50);

    for (const cleanup of cleanups) {
      cleanup();
    }

    expect(registry.size).toBe(0);
    expect(registry.count).toBe(0);
  });
});

describe('UniversalSearchRegistry - Priority Sorting', () => {
  let registry: UniversalSearchRegistry;

  beforeEach(() => {
    registry = new UniversalSearchRegistry();
  });

  it('sorts contributors by priority ascending (lower numbers first)', () => {
    registry.register({ id: 'billing', category: 'Billing', categoryLabel: 'Billing', priority: 60, search: () => [] });
    registry.register({ id: 'patient', category: 'Patients', categoryLabel: 'Patients', priority: 10, search: () => [] });
    registry.register({ id: 'consult', category: 'Consultations', categoryLabel: 'Consultations', priority: 20, search: () => [] });

    const contributors = registry.getContributors();
    expect(contributors.map((c) => c.id)).toEqual(['patient', 'consult', 'billing']);
  });

  it('defaults omitted priority to 50', () => {
    registry.register({ id: 'low', category: 'Low', categoryLabel: 'Low', priority: 100, search: () => [] });
    registry.register({ id: 'default', category: 'Default', categoryLabel: 'Default', search: () => [] });
    registry.register({ id: 'high', category: 'High', categoryLabel: 'High', priority: 10, search: () => [] });

    const contributors = registry.getContributors();
    expect(contributors.map((c) => c.id)).toEqual(['high', 'default', 'low']);
  });

  it('handles negative and zero priorities correctly', () => {
    registry.register({ id: 'standard', category: 'Standard', categoryLabel: 'Standard', priority: 10, search: () => [] });
    registry.register({ id: 'top', category: 'Top', categoryLabel: 'Top', priority: -10, search: () => [] });
    registry.register({ id: 'zero', category: 'Zero', categoryLabel: 'Zero', priority: 0, search: () => [] });

    const contributors = registry.getContributors();
    expect(contributors.map((c) => c.id)).toEqual(['top', 'zero', 'standard']);
  });

  it('uses secondary id sort when priorities are identical', () => {
    registry.register({ id: 'bravo', category: 'B', categoryLabel: 'B', priority: 20, search: () => [] });
    registry.register({ id: 'alpha', category: 'A', categoryLabel: 'A', priority: 20, search: () => [] });

    const contributors = registry.getContributors();
    expect(contributors.map((c) => c.id)).toEqual(['alpha', 'bravo']);
  });
});

describe('UniversalSearchRegistry - Category Management', () => {
  let registry: UniversalSearchRegistry;

  beforeEach(() => {
    registry = new UniversalSearchRegistry();
  });

  it('extracts unique categories in contributor priority order', () => {
    registry.register({ id: 'pat1', category: 'Patients', categoryLabel: 'Patients', priority: 10, search: () => [] });
    registry.register({ id: 'app1', category: 'Appointments', categoryLabel: 'Appointments', priority: 20, search: () => [] });
    registry.register({ id: 'pat2', category: 'Patients', categoryLabel: 'Duplicate Patients', priority: 30, search: () => [] });

    const categories = registry.getCategories();
    expect(categories).toEqual([
      { key: 'Patients', label: 'Patients' },
      { key: 'Appointments', label: 'Appointments' },
    ]);
  });

  it('falls back to category key if categoryLabel is empty', () => {
    registry.register({ id: 'c1', category: 'Settings', categoryLabel: '', priority: 10, search: () => [] });

    const categories = registry.getCategories();
    expect(categories).toEqual([{ key: 'Settings', label: 'Settings' }]);
  });
});

describe('UniversalSearchRegistry - Query Execution & Search', () => {
  let registry: UniversalSearchRegistry;

  beforeEach(() => {
    registry = new UniversalSearchRegistry();
  });

  it('returns empty array immediately for empty string or whitespace queries', async () => {
    let called = false;
    registry.register({
      id: 'test',
      category: 'Test',
      categoryLabel: 'Test',
      search: () => {
        called = true;
        return [];
      },
    });

    expect(await registry.search('')).toEqual([]);
    expect(await registry.search('   ')).toEqual([]);
    expect(await registry.search(null as any)).toEqual([]);
    expect(await registry.search(undefined as any)).toEqual([]);
    expect(called).toBe(false);
  });

  it('trims leading/trailing whitespace before passing query to contributors', async () => {
    let capturedQuery = '';
    registry.register({
      id: 'test',
      category: 'Test',
      categoryLabel: 'Test',
      search: (q) => {
        capturedQuery = q;
        return [];
      },
    });

    await registry.search('   Juan Dela Cruz   ');
    expect(capturedQuery).toBe('Juan Dela Cruz');
  });

  it('aggregates search results across synchronous and asynchronous contributors', async () => {
    const item1: SearchItem = {
      id: 'p1',
      category: 'Patients',
      title: 'Juan Dela Cruz',
      subtitle: 'PIN: 12-345678901-2',
      targetRoute: 'PatientChart',
    };
    const item2: SearchItem = {
      id: 'a1',
      category: 'Appointments',
      title: 'Dental Checkup',
      subtitle: '2026-10-20 09:00',
      targetRoute: 'AppointmentDetail',
    };

    registry.register({
      id: 'patients',
      category: 'Patients',
      categoryLabel: 'Patients',
      priority: 10,
      search: () => [item1], // synchronous
    });

    registry.register({
      id: 'appointments',
      category: 'Appointments',
      categoryLabel: 'Appointments',
      priority: 20,
      search: async () => [item2], // asynchronous
    });

    const results = await registry.search('test');
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('p1');
    expect(results[1].id).toBe('a1');
  });

  it('filters results by category (case-insensitive)', async () => {
    registry.register({
      id: 'patients',
      category: 'Patients',
      categoryLabel: 'Patients',
      search: () => [{ id: 'p1', category: 'Patients', title: 'P1', subtitle: '', targetRoute: '' }],
    });
    registry.register({
      id: 'appointments',
      category: 'Appointments',
      categoryLabel: 'Appointments',
      search: () => [{ id: 'a1', category: 'Appointments', title: 'A1', subtitle: '', targetRoute: '' }],
    });

    const patientResults = await registry.search('test', { category: 'patients' });
    expect(patientResults).toHaveLength(1);
    expect(patientResults[0].category).toBe('Patients');

    const allResults = await registry.search('test', { category: 'all' });
    expect(allResults).toHaveLength(2);

    const nonExistent = await registry.search('test', { category: 'nonexistent' });
    expect(nonExistent).toHaveLength(0);
  });

  it('enforces total limit cap when specified', async () => {
    registry.register({
      id: 'gen',
      category: 'Items',
      categoryLabel: 'Items',
      search: () => [
        { id: '1', category: 'Items', title: '1', subtitle: '', targetRoute: '' },
        { id: '2', category: 'Items', title: '2', subtitle: '', targetRoute: '' },
        { id: '3', category: 'Items', title: '3', subtitle: '', targetRoute: '' },
      ],
    });

    const limited = await registry.search('test', { limit: 2 });
    expect(limited).toHaveLength(2);
    expect(limited.map((i) => i.id)).toEqual(['1', '2']);
  });
});

describe('UniversalSearchRegistry - RBAC Permission Filtering', () => {
  let registry: UniversalSearchRegistry;

  beforeEach(() => {
    registry = new UniversalSearchRegistry();
  });

  it('executes contributor when user holds required permission (Array)', async () => {
    registry.register({
      id: 'billing',
      category: 'Billing',
      categoryLabel: 'Billing',
      requiredPermission: 'Clinic.BillingRead',
      search: () => [{ id: 'b1', category: 'Billing', title: 'Invoice', subtitle: '', targetRoute: '' }],
    });

    const results = await registry.search('inv', {
      userPermissions: ['Clinic.BillingRead', 'Clinic.PatientsRead'],
    });
    expect(results).toHaveLength(1);
  });

  it('executes contributor when user holds required permission (Set)', async () => {
    registry.register({
      id: 'billing',
      category: 'Billing',
      categoryLabel: 'Billing',
      requiredPermission: 'Clinic.BillingRead',
      search: () => [{ id: 'b1', category: 'Billing', title: 'Invoice', subtitle: '', targetRoute: '' }],
    });

    const results = await registry.search('inv', {
      userPermissions: new Set(['Clinic.BillingRead']),
    });
    expect(results).toHaveLength(1);
  });

  it('skips contributor when user lacks required permission', async () => {
    let executed = false;
    registry.register({
      id: 'billing',
      category: 'Billing',
      categoryLabel: 'Billing',
      requiredPermission: 'Clinic.BillingRead',
      search: () => {
        executed = true;
        return [{ id: 'b1', category: 'Billing', title: 'Invoice', subtitle: '', targetRoute: '' }];
      },
    });

    const results = await registry.search('inv', {
      userPermissions: ['Clinic.PatientsRead'],
    });
    expect(results).toHaveLength(0);
    expect(executed).toBe(false);
  });

  it('includes contributors without requiredPermission even when userPermissions is empty array', async () => {
    registry.register({
      id: 'public',
      category: 'Public',
      categoryLabel: 'Public',
      search: () => [{ id: 'pub1', category: 'Public', title: 'Info', subtitle: '', targetRoute: '' }],
    });

    const results = await registry.search('info', { userPermissions: [] });
    expect(results).toHaveLength(1);
  });

  it('permits all contributors when userPermissions option is undefined', async () => {
    registry.register({
      id: 'secured',
      category: 'Secured',
      categoryLabel: 'Secured',
      requiredPermission: 'Some.Permission',
      search: () => [{ id: 's1', category: 'Secured', title: 'Data', subtitle: '', targetRoute: '' }],
    });

    const results = await registry.search('data');
    expect(results).toHaveLength(1);
  });
});

describe('UniversalSearchRegistry - Fault Isolation & Error Resilience', () => {
  let registry: UniversalSearchRegistry;

  beforeEach(() => {
    registry = new UniversalSearchRegistry();
  });

  it('isolates synchronous exception without crashing search or dropping healthy results', async () => {
    registry.register({
      id: 'crasher',
      category: 'Broken',
      categoryLabel: 'Broken',
      priority: 10,
      search: () => {
        throw new Error('Database connection failed');
      },
    });

    registry.register({
      id: 'healthy',
      category: 'Healthy',
      categoryLabel: 'Healthy',
      priority: 20,
      search: () => [{ id: 'h1', category: 'Healthy', title: 'Working', subtitle: '', targetRoute: '' }],
    });

    const results = await registry.search('test');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('h1');
  });

  it('isolates asynchronous promise rejection without crashing search', async () => {
    registry.register({
      id: 'async-crasher',
      category: 'Broken',
      categoryLabel: 'Broken',
      priority: 10,
      search: async () => {
        throw new Error('Network timeout');
      },
    });

    registry.register({
      id: 'healthy',
      category: 'Healthy',
      categoryLabel: 'Healthy',
      priority: 20,
      search: () => [{ id: 'h1', category: 'Healthy', title: 'Working', subtitle: '', targetRoute: '' }],
    });

    const results = await registry.search('test');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('h1');
  });

  it('handles contributor returning null or non-array gracefully', async () => {
    registry.register({
      id: 'null-returner',
      category: 'Null',
      categoryLabel: 'Null',
      search: () => null as any,
    });

    const results = await registry.search('test');
    expect(results).toEqual([]);
  });
});

describe('UniversalSearchRegistry - Timeout & AbortSignal', () => {
  let registry: UniversalSearchRegistry;

  beforeEach(() => {
    registry = new UniversalSearchRegistry();
  });

  it('times out slow contributors when timeoutMs is exceeded', async () => {
    registry.register({
      id: 'slow',
      category: 'Slow',
      categoryLabel: 'Slow',
      priority: 10,
      search: () => new Promise((resolve) => setTimeout(() => resolve([{ id: 'slow1', category: 'Slow', title: 'Slow', subtitle: '', targetRoute: '' }]), 200)),
    });

    registry.register({
      id: 'fast',
      category: 'Fast',
      categoryLabel: 'Fast',
      priority: 20,
      search: () => [{ id: 'fast1', category: 'Fast', title: 'Fast', subtitle: '', targetRoute: '' }],
    });

    // 50ms timeout will cause 'slow' to timeout
    const results = await registry.search('test', { timeoutMs: 50 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('fast1');
  });

  it('returns empty array when AbortSignal is already aborted', async () => {
    registry.register({
      id: 'test',
      category: 'Test',
      categoryLabel: 'Test',
      search: () => [{ id: '1', category: 'Test', title: '1', subtitle: '', targetRoute: '' }],
    });

    const controller = new AbortController();
    controller.abort();

    const results = await registry.search('query', { signal: controller.signal });
    expect(results).toEqual([]);
  });

  it('passes AbortSignal to contributor search function', async () => {
    let capturedSignal: AbortSignal | undefined;
    registry.register({
      id: 'test',
      category: 'Test',
      categoryLabel: 'Test',
      search: (_q, signal) => {
        capturedSignal = signal;
        return [];
      },
    });

    const controller = new AbortController();
    await registry.search('query', { signal: controller.signal });
    expect(capturedSignal).toBe(controller.signal);
  });
});

describe('UniversalSearchRegistry - Global Singleton & Isolation', () => {
  it('exports universalSearchRegistry as a singleton instance', () => {
    expect(universalSearchRegistry).toBeInstanceOf(UniversalSearchRegistry);
  });

  it('maintains state isolation between new UniversalSearchRegistry instances', () => {
    const regA = new UniversalSearchRegistry();
    const regB = new UniversalSearchRegistry();

    regA.register({ id: 'a', category: 'A', categoryLabel: 'A', search: () => [] });
    expect(regA.has('a')).toBe(true);
    expect(regB.has('a')).toBe(false);
  });
});

describe('DTO & SearchItem Contracts Verification', () => {
  it('supports full SearchResultItemDto and SearchItem contract properties', () => {
    let selected = false;
    const item: SearchItem = {
      id: 'p-123',
      category: 'Patients',
      title: 'Maria Santos',
      subtitle: 'PIN: 12-345678901-2 • Senior Citizen',
      badgeText: 'Senior',
      badgeVariant: 'routine',
      targetRoute: 'PatientChart',
      routeParams: { patientId: 'p-123' },
      badge: { text: 'Senior', variant: 'routine' },
      onSelect: () => {
        selected = true;
      },
    };

    expect(item.id).toBe('p-123');
    expect(item.badgeVariant).toBe('routine');
    item.onSelect?.();
    expect(selected).toBe(true);
  });

  it('supports all valid SearchBadgeVariant literals', () => {
    const variants: SearchBadgeVariant[] = ['routine', 'urgent', 'emergency', 'neutral'];
    expect(variants).toHaveLength(4);
  });

  it('constructs valid SearchResponseDto envelope', () => {
    const response: SearchResponseDto = {
      items: [
        {
          id: 'item-1',
          category: 'Queue',
          title: 'Q-001',
          subtitle: 'Dr. Reyes • Consultation Room 1',
          badgeText: 'Urgent',
          badgeVariant: 'urgent',
          targetRoute: 'QueueWorkstation',
        },
      ],
      totalCount: 1,
    };

    expect(response.totalCount).toBe(1);
    expect(response.items[0].badgeVariant).toBe('urgent');
  });

  it('supports SearchBadge and SearchResponse aliases', () => {
    const badge: SearchBadge = { text: 'STAT', variant: 'emergency' };
    const res: SearchResponse = { items: [], totalCount: 0 };
    const cat: SearchCategoryDto = { key: 'Queue', label: 'Queue', count: 5 };

    expect(badge.text).toBe('STAT');
    expect(res.totalCount).toBe(0);
    expect(cat.count).toBe(5);
  });
});
