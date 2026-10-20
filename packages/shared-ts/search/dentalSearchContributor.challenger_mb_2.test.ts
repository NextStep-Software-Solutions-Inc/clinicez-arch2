import { beforeEach, describe, expect, it } from 'bun:test';
import {
  UniversalSearchRegistry,
  type SearchContributor,
  type SearchItem,
} from './searchRegistry';
import {
  DENTAL_SEARCH_CATEGORY,
  DENTAL_SEARCH_CATEGORY_LABEL,
  DENTAL_SEARCH_CONTRIBUTOR_ID,
  DENTAL_SEARCH_PRIORITY,
  DENTAL_SEARCH_REQUIRED_PERMISSION,
  createDentalSearchContributor,
  dentalSearchContributor,
  configureDentalSearchFn,
  formatDentalSearchItem,
  mapToothStatusBadgeVariant,
} from './dentalSearchContributor';

describe('Challenger 2 Empirical Verification: Dental Search Contributor & Registry', () => {
  let registry: UniversalSearchRegistry;

  beforeEach(() => {
    registry = new UniversalSearchRegistry();
  });

  // =========================================================================
  // Dimension 1: Error Boundary & Fault Isolation Tests
  // =========================================================================
  describe('Dimension 1: Error Boundary & Fault Isolation', () => {
    it('isolates dental contributor synchronous exception without crashing registry or dropping healthy results', async () => {
      const crashingDentalContributor = createDentalSearchContributor(() => {
        throw new Error('Fatal synchronous dental service failure');
      });

      const healthyPatientContributor: SearchContributor = {
        id: 'clinic-patients',
        category: 'Patients',
        categoryLabel: 'Patients',
        priority: 10,
        search: (q) => [
          {
            id: 'patient-101',
            category: 'Patients',
            title: `Patient matching ${q}`,
            subtitle: 'MRN-101',
            targetRoute: 'Patients',
            routeParams: { patientId: 'p-101' },
          },
        ],
      };

      registry.register(crashingDentalContributor);
      registry.register(healthyPatientContributor);

      const results = await registry.search('Dela Cruz');

      // The search MUST NOT throw, and healthy patient results MUST be preserved
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('patient-101');
      expect(results[0].category).toBe('Patients');
    });

    it('isolates dental contributor asynchronous rejection without crashing registry or dropping healthy results', async () => {
      const rejectingDentalContributor = createDentalSearchContributor(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error('Network timeout in dental API endpoint');
      });

      const healthyConsultationContributor: SearchContributor = {
        id: 'clinic-consultations',
        category: 'Consultations',
        categoryLabel: 'Consultations',
        priority: 20,
        search: () => [
          {
            id: 'consult-202',
            category: 'Consultations',
            title: 'Consultation: General Checkup',
            subtitle: 'Dr. Santos',
            targetRoute: 'Consultations',
            routeParams: { consultationId: 'c-202' },
          },
        ],
      };

      registry.register(rejectingDentalContributor);
      registry.register(healthyConsultationContributor);

      const results = await registry.search('Santos');

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('consult-202');
      expect(results[0].category).toBe('Consultations');
    });

    it('isolates non-Error rejection payloads (string, null, object) thrown by dental contributor', async () => {
      const stringThrowingContributor = createDentalSearchContributor(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'Raw string fatal error';
      });

      registry.register(stringThrowingContributor);
      const results = await registry.search('16');
      expect(results).toHaveLength(0);
      expect(Array.isArray(results)).toBe(true);
    });

    it('handles malformed return types (null, undefined, primitives) from searchFn gracefully', async () => {
      // 1. null return
      const nullContributor = createDentalSearchContributor(
        // @ts-expect-error Testing runtime invalid input
        async () => null,
      );
      registry.register(nullContributor);
      const nullRes = await registry.search('tooth');
      expect(nullRes).toEqual([]);

      registry.clear();

      // 2. non-array object return
      const objContributor = createDentalSearchContributor(
        // @ts-expect-error Testing runtime invalid input
        async () => ({ invalid: true }),
      );
      registry.register(objContributor);
      const objRes = await registry.search('tooth');
      expect(objRes).toEqual([]);

      registry.clear();

      // 3. primitive number return
      const numContributor = createDentalSearchContributor(
        // @ts-expect-error Testing runtime invalid input
        async () => 42,
      );
      registry.register(numContributor);
      const numRes = await registry.search('tooth');
      expect(numRes).toEqual([]);
    });

    it('times out slow dental search contributor without blocking healthy sibling contributors', async () => {
      const hangingDentalContributor = createDentalSearchContributor(async () => {
        // Hang for 500ms
        await new Promise((resolve) => setTimeout(resolve, 500));
        return [
          {
            id: 'late-tooth',
            category: 'Dental',
            title: 'Late Tooth',
            subtitle: '',
            targetRoute: 'Patients',
          },
        ];
      });

      const fastContributor: SearchContributor = {
        id: 'fast-clinic',
        category: 'Patients',
        categoryLabel: 'Patients',
        priority: 10,
        search: () => [
          {
            id: 'fast-patient',
            category: 'Patients',
            title: 'Fast Patient',
            subtitle: '',
            targetRoute: 'Patients',
          },
        ],
      };

      registry.register(hangingDentalContributor);
      registry.register(fastContributor);

      // Execute with a 50ms timeout
      const results = await registry.search('test', { timeoutMs: 50 });

      // Fast contributor succeeded, hanging dental contributor timed out cleanly
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('fast-patient');
    });

    it('isolates unconfigured dentalSearchContributor singleton without throwing', async () => {
      // Reset configured search fn to null
      configureDentalSearchFn(null as any);

      // Direct search call on singleton
      const directResults = await dentalSearchContributor.search('16');
      expect(directResults).toEqual([]);

      // Registry search call with singleton
      registry.register(dentalSearchContributor);
      const registryResults = await registry.search('16');
      expect(registryResults).toEqual([]);
    });
  });

  // =========================================================================
  // Dimension 2: Category Filtering at Registry Level
  // =========================================================================
  describe('Dimension 2: Category Filtering at Registry Level', () => {
    beforeEach(() => {
      // Register multiple categories: Patients, Dental, Consultations, Billing
      registry.register({
        id: 'clinic-patients',
        category: 'Patients',
        categoryLabel: 'Patients',
        priority: 10,
        search: () => [
          { id: 'pat-1', category: 'Patients', title: 'Patient Juan', subtitle: '', targetRoute: 'Patients' },
        ],
      });

      registry.register(
        createDentalSearchContributor(async () => [
          {
            id: 'tooth-16',
            category: 'Dental',
            title: 'Tooth #16 — Decay',
            subtitle: 'Juan Dela Cruz',
            targetRoute: 'Patients',
            routeParams: { patientId: 'p-1', toothNumber: '16', tab: 'dental' },
          },
          {
            id: 'tooth-55',
            category: 'Dental',
            title: 'Tooth #55 — Filled',
            subtitle: 'Pedro Penduko',
            targetRoute: 'Patients',
            routeParams: { patientId: 'p-2', toothNumber: '55', tab: 'dental' },
          },
        ]),
      );

      registry.register({
        id: 'clinic-consultations',
        category: 'Consultations',
        categoryLabel: 'Consultations',
        priority: 20,
        search: () => [
          { id: 'con-1', category: 'Consultations', title: 'Consultation Juan', subtitle: '', targetRoute: 'Consultations' },
        ],
      });
    });

    it('returns ONLY dental results when category is specified as "Dental"', async () => {
      const results = await registry.search('Juan', { category: 'Dental' });

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.category === 'Dental')).toBe(true);
      expect(results[0].id).toBe('tooth-16');
      expect(results[1].id).toBe('tooth-55');
    });

    it('returns ONLY dental results when category is specified case-insensitively ("dental" / "DENTAL")', async () => {
      const lowerResults = await registry.search('Juan', { category: 'dental' });
      expect(lowerResults).toHaveLength(2);
      expect(lowerResults.every((r) => r.category === 'Dental')).toBe(true);

      const upperResults = await registry.search('Juan', { category: 'DENTAL' });
      expect(upperResults).toHaveLength(2);
      expect(upperResults.every((r) => r.category === 'Dental')).toBe(true);
    });

    it('excludes dental results when category is filtered to "Patients"', async () => {
      const results = await registry.search('Juan', { category: 'Patients' });

      expect(results).toHaveLength(1);
      expect(results[0].category).toBe('Patients');
      expect(results[0].id).toBe('pat-1');
    });

    it('aggregates all categories when category is "all" or omitted', async () => {
      const allResults = await registry.search('Juan', { category: 'all' });
      expect(allResults).toHaveLength(4);
      expect(allResults.map((r) => r.category)).toEqual([
        'Patients',
        'Consultations',
        'Dental',
        'Dental',
      ]);

      const omittedResults = await registry.search('Juan');
      expect(omittedResults).toHaveLength(4);
    });
  });

  // =========================================================================
  // Dimension 3: FDI Tooth Number & Route Parameter Formatting
  // =========================================================================
  describe('Dimension 3: FDI Tooth Number & Route Parameter Formatting', () => {
    it('formats adult permanent teeth (11-48) correctly with tab: dental and string toothNumber', () => {
      const formatted = formatDentalSearchItem({
        id: 'tooth-48',
        category: 'Dental',
        title: 'Tooth #48 — Extraction',
        subtitle: 'Wisdom tooth impacted',
        badgeText: 'ForExtraction',
        targetRoute: 'Patients',
        routeParams: {
          patientId: 'pat-uuid-48',
          toothNumber: '48',
        },
      });

      expect(formatted.category).toBe('Dental');
      expect(formatted.targetRoute).toBe('Patients');
      expect(formatted.badgeVariant).toBe('emergency');
      expect(formatted.routeParams).toEqual({
        patientId: 'pat-uuid-48',
        openPatientId: 'pat-uuid-48',
        toothNumber: '48',
        tab: 'dental',
      });
    });

    it('formats child deciduous teeth (51-85) correctly with tab: dental and string toothNumber', () => {
      const formatted = formatDentalSearchItem({
        id: 'tooth-85',
        category: 'Dental',
        title: 'Tooth #85 — Healthy',
        subtitle: 'Pediatric primary molar',
        badgeText: 'Healthy',
        targetRoute: 'Patients',
        routeParams: {
          patientId: 'pat-uuid-child-85',
          toothNumber: '85',
        },
      });

      expect(formatted.category).toBe('Dental');
      expect(formatted.badgeVariant).toBe('neutral');
      expect(formatted.routeParams).toEqual({
        patientId: 'pat-uuid-child-85',
        openPatientId: 'pat-uuid-child-85',
        toothNumber: '85',
        tab: 'dental',
      });
    });

    it('coerces numeric toothNumber (e.g. 16 as number) into string "16"', () => {
      const formatted = formatDentalSearchItem({
        id: 'tooth-num-16',
        category: 'Dental',
        title: 'Tooth #16',
        subtitle: '',
        targetRoute: 'Patients',
        routeParams: {
          patientId: 'pat-16',
          // @ts-expect-error testing numeric input
          toothNumber: 16,
        },
      });

      expect(formatted.routeParams?.toothNumber).toBe('16');
      expect(typeof formatted.routeParams?.toothNumber).toBe('string');
      expect(formatted.routeParams?.tab).toBe('dental');
    });

    it('handles missing toothNumber gracefully without creating invalid route params', () => {
      const formatted = formatDentalSearchItem({
        id: 'tooth-general',
        category: 'Dental',
        title: 'General Dental Assessment',
        subtitle: 'Patient wide evaluation',
        targetRoute: 'Patients',
        routeParams: {
          patientId: 'pat-general',
        },
      });

      expect(formatted.routeParams?.patientId).toBe('pat-general');
      expect(formatted.routeParams?.openPatientId).toBe('pat-general');
      expect(formatted.routeParams?.tab).toBe('dental');
      expect(formatted.routeParams?.toothNumber).toBeUndefined();
    });
  });

  // =========================================================================
  // Dimension 4: High-Concurrency & Stress Invariant Verification
  // =========================================================================
  describe('Dimension 4: High-Concurrency & Stress Invariant Verification', () => {
    it('executes 100 concurrent searches with mixed valid queries, whitespace, and chaos without leakage', async () => {
      registry.register(
        createDentalSearchContributor(async (q) => {
          await new Promise((r) => setTimeout(r, Math.random() * 5));
          return [
            {
              id: `result-${q}`,
              category: 'Dental',
              title: `Tooth for query: ${q}`,
              subtitle: 'Stress test result',
              targetRoute: 'Patients',
              routeParams: { patientId: 'p-stress', toothNumber: '21', tab: 'dental' },
            },
          ];
        }),
      );

      const queries = Array.from({ length: 100 }, (_, i) =>
        i % 5 === 0 ? '' : i % 5 === 1 ? '   ' : `query-${i}`,
      );

      const promises = queries.map((q) => registry.search(q));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(100);

      queries.forEach((q, idx) => {
        if (!q.trim()) {
          expect(results[idx]).toHaveLength(0);
        } else {
          expect(results[idx]).toHaveLength(1);
          expect(results[idx][0].title).toBe(`Tooth for query: ${q}`);
          expect(results[idx][0].routeParams?.tab).toBe('dental');
        }
      });
    });
  });
});
