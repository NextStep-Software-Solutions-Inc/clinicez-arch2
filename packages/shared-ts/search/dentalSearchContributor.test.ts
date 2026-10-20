import { beforeEach, describe, expect, it } from 'bun:test';
import {
  UniversalSearchRegistry,
  universalSearchRegistry,
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
  mapToothStatusBadgeVariant,
  formatDentalSearchItem,
} from './dentalSearchContributor';

describe('Dental Search Contributor - Framework Integration & Contracts', () => {
  let registry: UniversalSearchRegistry;

  beforeEach(() => {
    registry = new UniversalSearchRegistry();
  });

  // =========================================================================
  // 1. Contributor Identity & Registration
  // =========================================================================
  it('registers dental contributor with correct id, category, priority, and permissions', () => {
    const contributor = createDentalSearchContributor(async () => []);
    const unregister = registry.register(contributor);

    expect(registry.has(DENTAL_SEARCH_CONTRIBUTOR_ID)).toBe(true);
    expect(registry.size).toBe(1);

    const registered = registry.getContributor(DENTAL_SEARCH_CONTRIBUTOR_ID);
    expect(registered?.id).toBe('clinic-dental');
    expect(registered?.category).toBe('Dental');
    expect(registered?.categoryLabel).toBe('Dental Chart');
    expect(registered?.priority).toBe(25);
    expect(registered?.requiredPermission).toBe('Clinic.ConsultationsRead');

    unregister();
    expect(registry.has(DENTAL_SEARCH_CONTRIBUTOR_ID)).toBe(false);
  });

  it('exports default dentalSearchContributor singleton matching contracts', () => {
    expect(dentalSearchContributor.id).toBe('clinic-dental');
    expect(dentalSearchContributor.category).toBe('Dental');
    expect(dentalSearchContributor.categoryLabel).toBe('Dental Chart');
    expect(dentalSearchContributor.priority).toBe(25);
    expect(dentalSearchContributor.requiredPermission).toBe('Clinic.ConsultationsRead');
  });

  // =========================================================================
  // 2. Category Tab Synthesis & Priority Ordering
  // =========================================================================
  it('extracts Dental category tab in correct priority sequence (between Consultations and Appointments)', () => {
    registry.register({ id: 'patients', category: 'Patients', categoryLabel: 'Patients', priority: 10, search: () => [] });
    registry.register({ id: 'consultations', category: 'Consultations', categoryLabel: 'Consultations', priority: 20, search: () => [] });
    registry.register(createDentalSearchContributor(async () => [])); // Priority 25
    registry.register({ id: 'appointments', category: 'Appointments', categoryLabel: 'Appointments', priority: 30, search: () => [] });
    registry.register({ id: 'billing', category: 'Billing', categoryLabel: 'Billing', priority: 60, search: () => [] });

    const categories = registry.getCategories();
    expect(categories.map((c) => c.key)).toEqual([
      'Patients',
      'Consultations',
      'Dental',
      'Appointments',
      'Billing',
    ]);
    expect(categories.find((c) => c.key === 'Dental')?.label).toBe('Dental Chart');
  });

  // =========================================================================
  // 3. Search Execution & Item DTO Mapping
  // =========================================================================
  it('executes search and returns formatted dental search items with deep link route params', async () => {
    const mockToothItem = {
      id: 'dental-tooth-101',
      category: 'Dental',
      title: 'Tooth #16 — Decay (MOD)',
      subtitle: 'Patient: Juan Dela Cruz • Deep caries',
      badgeText: 'Decayed',
      badgeVariant: 'urgent' as const,
      targetRoute: 'Patients',
      routeParams: {
        patientId: 'patient-guid-001',
        toothNumber: '16',
        tab: 'dental',
      },
    };

    let capturedQuery = '';
    const contributor = createDentalSearchContributor(async (q) => {
      capturedQuery = q;
      return [mockToothItem];
    });

    registry.register(contributor);

    const results = await registry.search('tooth 16');

    expect(capturedQuery).toBe('tooth 16');
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe('Dental');
    expect(results[0].title).toBe('Tooth #16 — Decay (MOD)');
    expect(results[0].subtitle).toBe('Patient: Juan Dela Cruz • Deep caries');
    expect(results[0].badgeText).toBe('Decayed');
    expect(results[0].badgeVariant).toBe('urgent');
    expect(results[0].targetRoute).toBe('Patients');
    expect(results[0].routeParams).toEqual({
      patientId: 'patient-guid-001',
      openPatientId: 'patient-guid-001',
      toothNumber: '16',
      tab: 'dental',
    });
  });

  // =========================================================================
  // 4. Urgency Badge Styling Verification
  // =========================================================================
  it('verifies all status badge variants conform to @clinicez/design-tokens standards', () => {
    expect(mapToothStatusBadgeVariant('Decayed')).toBe('urgent');
    expect(mapToothStatusBadgeVariant('decayed')).toBe('urgent');
    expect(mapToothStatusBadgeVariant('ForExtraction')).toBe('emergency');
    expect(mapToothStatusBadgeVariant('forextraction')).toBe('emergency');
    expect(mapToothStatusBadgeVariant('Filled')).toBe('routine');
    expect(mapToothStatusBadgeVariant('filled')).toBe('routine');
    expect(mapToothStatusBadgeVariant('Crowned')).toBe('neutral');
    expect(mapToothStatusBadgeVariant('crowned')).toBe('neutral');
    expect(mapToothStatusBadgeVariant('Healthy')).toBe('neutral');
    expect(mapToothStatusBadgeVariant('healthy')).toBe('neutral');
    expect(mapToothStatusBadgeVariant('Missing')).toBe('neutral');
    expect(mapToothStatusBadgeVariant('missing')).toBe('neutral');
    expect(mapToothStatusBadgeVariant('unknown')).toBe('neutral');
  });

  it('formats tooth items with auto-derived badgeVariant when omitted', () => {
    const formatted = formatDentalSearchItem({
      id: 'd-1',
      category: 'Dental',
      title: 'Tooth #14',
      subtitle: '',
      badgeText: 'Decayed',
      targetRoute: 'Patients',
      routeParams: { patientId: 'p-1', toothNumber: '14' },
    });

    expect(formatted.badgeVariant).toBe('urgent');
    expect(formatted.badge?.variant).toBe('urgent');
    expect(formatted.routeParams?.tab).toBe('dental');
    expect(formatted.routeParams?.openPatientId).toBe('p-1');
  });

  // =========================================================================
  // 5. OnSelect Callback & Navigation Dispatch
  // =========================================================================
  it('triggers onSelect callback to open patient chart with target tooth highlighted', async () => {
    let navigatedPatientId = '';
    let navigatedToothNumber = '';

    const mockToothItem = {
      id: 'dental-tooth-101',
      category: 'Dental',
      title: 'Tooth #16 — Decay (MOD)',
      subtitle: '',
      targetRoute: 'Patients',
      routeParams: {
        patientId: 'p-42',
        toothNumber: '16',
        tab: 'dental',
      },
    };

    const contributor = createDentalSearchContributor(
      async () => [mockToothItem],
      (patientId, toothNumber) => {
        navigatedPatientId = patientId;
        navigatedToothNumber = toothNumber;
      },
    );

    registry.register(contributor);

    const results = await registry.search('16');
    expect(results).toHaveLength(1);

    // Simulate clicking the search item
    results[0].onSelect?.();

    expect(navigatedPatientId).toBe('p-42');
    expect(navigatedToothNumber).toBe('16');
  });

  it('supports options-object signature in createDentalSearchContributor', async () => {
    let selectedId = '';
    let selectedTooth: string | number = '';

    const contributor = createDentalSearchContributor({
      searchFn: async () => [
        {
          id: 'tooth-36',
          category: 'Dental',
          title: 'Tooth #36',
          subtitle: 'ForExtraction',
          targetRoute: 'Patients',
          routeParams: { patientId: 'pat-99', toothNumber: '36' },
        },
      ],
      onSelectTooth: (p, t) => {
        selectedId = p;
        selectedTooth = t;
      },
      priority: 25,
      requiredPermission: 'Clinic.ConsultationsRead',
    });

    registry.register(contributor);
    const results = await registry.search('36');
    expect(results).toHaveLength(1);
    results[0].onSelect?.();

    expect(selectedId).toBe('pat-99');
    expect(selectedTooth).toBe('36');
  });

  // =========================================================================
  // 6. RBAC Permission Enforcement
  // =========================================================================
  it('executes dental contributor when user holds Clinic.ConsultationsRead permission', async () => {
    let executed = false;
    const contributor = createDentalSearchContributor(async () => {
      executed = true;
      return [];
    });
    registry.register(contributor);

    await registry.search('tooth', {
      userPermissions: ['Clinic.ConsultationsRead'],
    });

    expect(executed).toBe(true);
  });

  it('skips dental contributor when user lacks Clinic.ConsultationsRead permission', async () => {
    let executed = false;
    const contributor = createDentalSearchContributor(async () => {
      executed = true;
      return [];
    });
    registry.register(contributor);

    const results = await registry.search('tooth', {
      userPermissions: ['Clinic.PatientsRead', 'Clinic.BillingRead'],
    });

    expect(executed).toBe(false);
    expect(results).toHaveLength(0);
  });

  // =========================================================================
  // 7. Fault Isolation & Error Boundary
  // =========================================================================
  it('isolates dental search network failure without crashing search palette or dropping sibling results', async () => {
    const brokenDentalContributor: SearchContributor = {
      id: 'clinic-dental',
      category: 'Dental',
      categoryLabel: 'Dental Chart',
      priority: 25,
      search: async () => {
        throw new Error('Simulated dental search network failure');
      },
    };

    const healthyPatientsContributor: SearchContributor = {
      id: 'clinic-patients',
      category: 'Patients',
      categoryLabel: 'Patients',
      priority: 10,
      search: () => [
        { id: 'pat-1', category: 'Patients', title: 'Juan Dela Cruz', subtitle: '', targetRoute: 'Patients' },
      ],
    };

    registry.register(brokenDentalContributor);
    registry.register(healthyPatientsContributor);

    const results = await registry.search('Juan');

    // Sibling results are preserved
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('pat-1');
    expect(results[0].category).toBe('Patients');
  });

  // =========================================================================
  // 8. Default dentalSearchContributor singleton delegation
  // =========================================================================
  it('supports configureDentalSearchFn on default singleton', async () => {
    configureDentalSearchFn(async (q) => [
      {
        id: 'delegated-1',
        category: 'Dental',
        title: `Tooth for ${q}`,
        subtitle: 'Delegated Subtitle',
        targetRoute: 'Patients',
        routeParams: { patientId: 'p-1', toothNumber: '11' },
      },
    ]);

    const results = await dentalSearchContributor.search('11');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Tooth for 11');
    expect(results[0].routeParams?.tab).toBe('dental');
  });
});
