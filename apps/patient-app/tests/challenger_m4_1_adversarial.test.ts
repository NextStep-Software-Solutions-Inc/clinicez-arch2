import { describe, expect, test } from 'bun:test';
import {
  CATEGORY_FILTERS,
  filterAndSearchRecords,
  matchesCategoryFilter,
  resolveRecordDomain,
  getProvenanceMeta,
  getUrgencyMeta,
  sanitizeTitleFromFileName,
  type CategorizableRecord,
  type CategoryFilterId,
} from '../services/records/categories';
import { lightColors } from '@clinicez/design-tokens';

/* ========================================================================= */
/* 1. CATEGORY TAXONOMY & ORACLE INVARIANTS                                  */
/* ========================================================================= */

describe('CHALLENGER M4-1: Category Filtering Taxonomy & Invariants', () => {
  test('Exact 6 canonical category filter pills are exported with valid attributes', () => {
    expect(CATEGORY_FILTERS.length).toBe(6);
    const expectedPills: CategoryFilterId[] = [
      'all',
      'lab_results',
      'prescriptions',
      'lab_requests',
      'certificates',
      'outside_uploads',
    ];
    expect(CATEGORY_FILTERS.map((f) => f.id)).toEqual(expectedPills);

    for (const pill of CATEGORY_FILTERS) {
      expect(pill.id.length).toBeGreaterThan(0);
      expect(pill.label.length).toBeGreaterThan(0);
      expect(pill.icon).toBeDefined();
    }
  });

  test('All pill returns true for 100% of adversarial, partial, and malformed records', () => {
    const adversarialRecords: CategorizableRecord[] = [
      {}, // totally empty
      { id: undefined, category: undefined, documentTypeId: undefined },
      { id: 'null-props', category: null, type: null, typeLabel: null, notes: null },
      { id: 'random-gibberish', category: '!@#$%^&*()_+' },
      { id: 'unicode-cat', category: '💉 Lab 結果' },
      { id: 'giant-cat', category: 'a'.repeat(5000) },
      { id: 'whitespace-cat', category: '   \t\n   ' },
      { id: 'deep-nested', customProp: { deep: true }, category: 'imaging' },
    ];

    for (const rec of adversarialRecords) {
      expect(matchesCategoryFilter(rec, 'all')).toBe(true);
    }
  });

  test('Outside Uploads catchment correctly captures external labs, patient uploads, and unverified records', () => {
    // 1. Patient uploaded with or without clinic
    expect(
      matchesCategoryFilter(
        { id: '1', provenance: 'patient_uploaded', clinicId: 'c1' },
        'outside_uploads'
      )
    ).toBe(true);

    expect(
      matchesCategoryFilter(
        { id: '2', provenance: 'patient_uploaded', clinicId: null },
        'outside_uploads'
      )
    ).toBe(true);

    // 2. External lab
    expect(
      matchesCategoryFilter(
        { id: '3', provenance: 'external_lab', facilityName: 'Hi-Precision' },
        'outside_uploads'
      )
    ).toBe(true);

    // 3. Category 'other'
    expect(
      matchesCategoryFilter(
        { id: '4', category: 'other' },
        'outside_uploads'
      )
    ).toBe(true);

    // 4. Missing clinicId and not clinicez_verified
    expect(
      matchesCategoryFilter(
        { id: '5', clinicId: null, provenance: null },
        'outside_uploads'
      )
    ).toBe(true);

    // 5. Verified ClinicEZ record with clinicId MUST NOT match outside_uploads
    expect(
      matchesCategoryFilter(
        {
          id: '6',
          category: 'lab_result',
          provenance: 'clinicez_verified',
          clinicId: 'clinic-123',
        },
        'outside_uploads'
      )
    ).toBe(false);
  });
});

/* ========================================================================= */
/* 2. ADVERSARIAL DOMAIN RESOLVER CLASSIFICATION GAPS (EMPIRICAL ORACLE)    */
/* ========================================================================= */

describe('CHALLENGER M4-1: Domain Resolver Edge Cases & Vulnerability Oracle', () => {
  test('Supported normalizations in resolveRecordDomain', () => {
    expect(resolveRecordDomain({ category: 'LAB_RESULT' })).toBe('lab_results');
    expect(resolveRecordDomain({ category: 'lab-result' })).toBe('lab_results');
    expect(resolveRecordDomain({ category: '  Lab Result  ' })).toBe('lab_results');
    expect(resolveRecordDomain({ category: 'imaging' })).toBe('lab_results');
    expect(resolveRecordDomain({ type: 'x-ray' })).toBe('lab_results');
    expect(resolveRecordDomain({ typeLabel: 'Chest X-Ray Film' })).toBe('lab_results');
    expect(resolveRecordDomain({ category: 'prescription' })).toBe('prescriptions');
    expect(resolveRecordDomain({ category: 'requisition' })).toBe('lab_requests');
    expect(resolveRecordDomain({ category: 'vaccine_card' })).toBe('certificates');
  });

  test('VULNERABILITY REPRODUCTION: resolveRecordDomain misclassifies vaccination and immunization records as other', () => {
    // "vaccination" does not contain "vaccine", so type/category with "vaccination" returns 'other'
    const vacRecord = resolveRecordDomain({ type: 'vaccination_record' });
    const vacCategory = resolveRecordDomain({ category: 'vaccination' });
    const vacLabel = resolveRecordDomain({ typeLabel: 'Vaccination Card' });
    const immCategory = resolveRecordDomain({ category: 'immunization' });

    // EMPIRICAL FINDING: All return 'other' instead of 'certificates'
    expect(vacRecord).toBe('other');
    expect(vacCategory).toBe('other');
    expect(vacLabel).toBe('other');
    expect(immCategory).toBe('other');
  });

  test('VULNERABILITY REPRODUCTION: resolveRecordDomain misclassifies Laboratory Request as other', () => {
    // "laboratoryrequest" does not contain "labrequest" or "requisition"
    const labReqLabel = resolveRecordDomain({ typeLabel: 'Laboratory Request' });
    const labReqCat = resolveRecordDomain({ category: 'laboratory_request' });

    // EMPIRICAL FINDING: Both return 'other' instead of 'lab_requests'
    expect(labReqLabel).toBe('other');
    expect(labReqCat).toBe('other');
  });

  test('VULNERABILITY REPRODUCTION: resolveRecordDomain does not check type or typeLabel for imaging', () => {
    // cat.includes('imaging') exists, but typeCode and typeLabel are NOT checked for 'imaging'
    const imagingType = resolveRecordDomain({ type: 'imaging' });
    const imagingLabel = resolveRecordDomain({ typeLabel: 'Diagnostic Imaging' });

    // EMPIRICAL FINDING: Both return 'other' instead of 'lab_results'
    expect(imagingType).toBe('other');
    expect(imagingLabel).toBe('other');
  });

  test('VULNERABILITY REPRODUCTION: resolveRecordDomain does not recognize Rx abbreviation for prescriptions', () => {
    const rxCategory = resolveRecordDomain({ category: 'rx' });
    const rxType = resolveRecordDomain({ type: 'rx' });

    // EMPIRICAL FINDING: Both return 'other' instead of 'prescriptions'
    expect(rxCategory).toBe('other');
    expect(rxType).toBe('other');
  });
});

/* ========================================================================= */
/* 3. MULTI-FIELD SEARCH ENGINE STRESS & PERFORMANCE                         */
/* ========================================================================= */

describe('CHALLENGER M4-1: Multi-Field Search Engine Stress & Edge Cases', () => {
  const corpus: CategorizableRecord[] = [
    {
      id: 'doc-1',
      title: 'Complete Blood Count (CBC) with Platelet Count',
      name: 'cbc_platelet.pdf',
      fileName: 'cbc_platelet.pdf',
      category: 'lab_result',
      facilityName: 'Cardinal Santos Medical Center',
      typeLabel: 'Hematology',
      notes: 'Patient was fasting for 10 hours. Hemoglobin slightly elevated at 16.5 g/dL.',
      provenance: 'clinicez_verified',
      clinicId: 'c-1',
    },
    {
      id: 'doc-2',
      title: 'Chest Radiography (PA & Lateral View)',
      name: 'chest_pa_lat.jpg',
      fileName: 'chest_pa_lat.jpg',
      category: 'imaging',
      facilityName: 'Makati Medical Center',
      typeLabel: 'Radiology / X-Ray',
      notes: 'Lungs are clear. Heart size normal. Costophrenic sulci are sharp.',
      provenance: 'external_lab',
      facilityId: 'fac-ext-1',
    },
    {
      id: 'doc-3',
      title: 'Amoxicillin + Clavulanic Acid (Augmentin) 625mg',
      name: 'augmentin_rx_2026.pdf',
      category: 'prescription',
      facilityName: 'The Medical City Clinic - Ortigas',
      typeLabel: 'Antibiotic Prescription',
      notes: 'Take 1 tablet every 12 hours for 7 days after meals.',
      provenance: 'clinicez_verified',
      clinicId: 'c-2',
    },
    {
      id: 'doc-4',
      title: 'Medical Certificate - Fit to Resume Work',
      name: 'med_cert_pedro.pdf',
      category: 'certificate',
      facilityName: 'Dr. Niño Dela Cruz, MD Clinic',
      typeLabel: 'Medical Clearance',
      notes: 'Patient is clinically recovered and cleared to work without restrictions.',
      provenance: 'patient_uploaded',
    },
  ];

  test('Search across title matches case-insensitively and with punctuation', () => {
    expect(filterAndSearchRecords(corpus, 'all', 'CBC')).toHaveLength(1);
    expect(filterAndSearchRecords(corpus, 'all', '(cbc)')).toHaveLength(1);
    expect(filterAndSearchRecords(corpus, 'all', 'platelet count')).toHaveLength(1);
    expect(filterAndSearchRecords(corpus, 'all', 'PA & Lateral')).toHaveLength(1);
  });

  test('Search across fileName and name falls back cleanly', () => {
    expect(filterAndSearchRecords(corpus, 'all', 'cbc_platelet')).toHaveLength(1);
    expect(filterAndSearchRecords(corpus, 'all', 'chest_pa_lat.jpg')).toHaveLength(1);
    expect(filterAndSearchRecords(corpus, 'all', 'augmentin_rx')).toHaveLength(1);
  });

  test('VULNERABILITY REPRODUCTION: empty string name does not fallback to fileName due to ?? operator', () => {
    const recordWithEmptyName: CategorizableRecord[] = [
      {
        id: 'empty-name',
        title: 'Report',
        name: '', // empty string
        fileName: 'biopsy_specimen.pdf',
        category: 'lab_result',
      },
    ];

    // In JS: ('' ?? 'biopsy_specimen.pdf') evaluates to ''!
    // So searching for 'biopsy' fails to match on fileName
    const res = filterAndSearchRecords(recordWithEmptyName, 'all', 'biopsy');
    expect(res).toHaveLength(0); // EMPIRICAL BUG: should have fallen back to fileName!
  });

  test('Search across facilityName handles special characters and diacritics', () => {
    expect(filterAndSearchRecords(corpus, 'all', 'Cardinal Santos')).toHaveLength(1);
    expect(filterAndSearchRecords(corpus, 'all', 'Ortigas')).toHaveLength(1);
    expect(filterAndSearchRecords(corpus, 'all', 'Niño')).toHaveLength(1);
    expect(filterAndSearchRecords(corpus, 'all', 'Dela Cruz')).toHaveLength(1);
  });

  test('Search across typeLabel handles slashes and compound strings', () => {
    expect(filterAndSearchRecords(corpus, 'all', 'Hematology')).toHaveLength(1);
    expect(filterAndSearchRecords(corpus, 'all', 'Radiology / X-Ray')).toHaveLength(1);
    expect(filterAndSearchRecords(corpus, 'all', 'Antibiotic')).toHaveLength(1);
    expect(filterAndSearchRecords(corpus, 'all', 'Medical Clearance')).toHaveLength(1);
  });

  test('Search across clinical notes finds substrings deep in text', () => {
    expect(filterAndSearchRecords(corpus, 'all', 'Hemoglobin slightly elevated')).toHaveLength(1);
    expect(filterAndSearchRecords(corpus, 'all', 'Costophrenic sulci')).toHaveLength(1);
    expect(filterAndSearchRecords(corpus, 'all', 'every 12 hours for 7 days')).toHaveLength(1);
    expect(filterAndSearchRecords(corpus, 'all', 'without restrictions')).toHaveLength(1);
  });

  test('Regex characters and wildcards in query are safely treated as literal text', () => {
    expect(filterAndSearchRecords(corpus, 'all', '.*')).toHaveLength(0);
    expect(filterAndSearchRecords(corpus, 'all', '[A-Z]+')).toHaveLength(0);
    expect(filterAndSearchRecords(corpus, 'all', '(?=test)')).toHaveLength(0);
    expect(filterAndSearchRecords(corpus, 'all', '+')).toHaveLength(1);
    expect(filterAndSearchRecords(corpus, 'all', '(')).toHaveLength(3);
    expect(filterAndSearchRecords(corpus, 'all', '-')).toHaveLength(3);
  });

  test('Whitespace trimming prevents false zero matches', () => {
    expect(filterAndSearchRecords(corpus, 'all', '   CBC   ')).toHaveLength(1);
    expect(filterAndSearchRecords(corpus, 'all', '\tMakati Medical\n')).toHaveLength(1);
  });

  test('Intersectional filtering: category pill AND search query both constrain results', () => {
    const resLabClear = filterAndSearchRecords(corpus, 'lab_results', 'clear');
    expect(resLabClear).toHaveLength(1);
    expect(resLabClear[0].id).toBe('doc-2');

    const resRxFasting = filterAndSearchRecords(corpus, 'prescriptions', 'fasting');
    expect(resRxFasting).toHaveLength(0);

    const resAllFasting = filterAndSearchRecords(corpus, 'all', 'fasting');
    expect(resAllFasting).toHaveLength(1);
    expect(resAllFasting[0].id).toBe('doc-1');
  });

  test('Scalability: multi-field search over 2,000 synthetic records finishes in < 50ms', () => {
    const largeList: CategorizableRecord[] = [];
    for (let i = 0; i < 2000; i++) {
      largeList.push({
        id: `synthetic-${i}`,
        title: `Comprehensive Metabolic Panel #${i}`,
        name: `cmp_${i}.pdf`,
        category: i % 2 === 0 ? 'lab_result' : 'prescription',
        facilityName: i % 3 === 0 ? 'St. Luke' : 'Makati Med',
        typeLabel: i % 2 === 0 ? 'Chemistry' : 'Medication',
        notes: `Synthetic notes with keyword needle_${i === 1500 ? 'found' : 'missing'}`,
      });
    }

    const start = performance.now();
    const result = filterAndSearchRecords(largeList, 'lab_results', 'needle_found');
    const elapsed = performance.now() - start;

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('synthetic-1500');
    expect(elapsed).toBeLessThan(50);
  });
});

/* ========================================================================= */
/* 4. ADVERSARIAL CLINICAL BADGES & ACCESSIBILITY INTEGRITY                  */
/* ========================================================================= */

describe('CHALLENGER M4-1: Clinical Badges & Accessibility (Never Color Alone)', () => {
  test('ProvenanceBadge resolves standard verified, external lab, and uploaded by you badges', () => {
    const verified = getProvenanceMeta('clinicez_verified');
    expect(verified.tone).toBe('primary');
    expect(verified.icon).toBe('checkCircle');
    expect(verified.label).toBe('ClinicEZ Verified');

    const verifiedFacility = getProvenanceMeta('clinicez_verified', 'clinic-1', 'St. Luke BGC');
    expect(verifiedFacility.tone).toBe('primary');
    expect(verifiedFacility.icon).toBe('checkCircle');
    expect(verifiedFacility.label).toBe('Verified · St. Luke BGC');

    const ext = getProvenanceMeta('external_lab');
    expect(ext.tone).toBe('info');
    expect(ext.icon).toBe('hospital');
    expect(ext.label).toBe('External Lab');

    const extFacility = getProvenanceMeta('external_lab', null, 'Hi-Precision');
    expect(extFacility.tone).toBe('info');
    expect(extFacility.icon).toBe('hospital');
    expect(extFacility.label).toBe('External Lab · Hi-Precision');

    const patient = getProvenanceMeta('patient_uploaded');
    expect(patient.tone).toBe('neutral');
    expect(patient.icon).toBe('upload');
    expect(patient.label).toBe('Uploaded by You');
  });

  test('VULNERABILITY REPRODUCTION: getProvenanceMeta inverts priority when external_lab has clinicId', () => {
    // When external_lab has a clinicId attached (e.g. clinic registered the external test)
    // isVerified = provenance === 'clinicez_verified' || Boolean(clinicId && provenance !== 'patient_uploaded')
    // evaluates to TRUE because 'external_lab' !== 'patient_uploaded'!
    const meta = getProvenanceMeta('external_lab', 'clinic-xyz', 'Hi-Precision');

    // EMPIRICAL FINDING: Badged as "Verified" instead of "External Lab"!
    expect(meta.tone).toBe('primary');
    expect(meta.icon).toBe('checkCircle');
    expect(meta.label).toBe('Verified · Hi-Precision');
    expect(meta.tone).not.toBe('info');
    expect(meta.icon).not.toBe('hospital');
  });

  test('Urgency Badge visual encoding complies with clinical urgency hierarchy', () => {
    const stat = getUrgencyMeta('stat');
    expect(stat.tone).toBe('danger');
    expect(stat.icon).toBe('alert');
    expect(stat.label).toBe('Critical (STAT)');
    expect(stat.shouldDisplay).toBe(true);

    const critical = getUrgencyMeta('critical');
    expect(critical.tone).toBe('danger');
    expect(critical.icon).toBe('alert');
    expect(critical.label).toBe('Critical');
    expect(critical.shouldDisplay).toBe(true);

    const override = getUrgencyMeta('routine', true);
    expect(override.tone).toBe('danger');
    expect(override.icon).toBe('alert');
    expect(override.shouldDisplay).toBe(true);

    const urgent = getUrgencyMeta('urgent');
    expect(urgent.tone).toBe('urgent');
    expect(urgent.icon).toBe('warning');
    expect(urgent.label).toBe('Urgent');
    expect(urgent.shouldDisplay).toBe(true);

    const routineDefault = getUrgencyMeta('routine', false, false);
    expect(routineDefault.tone).toBe('routine');
    expect(routineDefault.icon).toBe('info');
    expect(routineDefault.label).toBe('Routine');
    expect(routineDefault.shouldDisplay).toBe(false);

    const routineShow = getUrgencyMeta('routine', false, true);
    expect(routineShow.tone).toBe('routine');
    expect(routineShow.icon).toBe('info');
    expect(routineShow.label).toBe('Routine');
    expect(routineShow.shouldDisplay).toBe(true);
  });

  test('VULNERABILITY REPRODUCTION: getUrgencyMeta fails to trim whitespace, suppressing STAT badges as Routine', () => {
    // Without trim(), ' stat ' !== 'stat'
    const untrimmedStat = getUrgencyMeta(' stat ');
    const untrimmedUrgent = getUrgencyMeta('urgent ');

    // EMPIRICAL FINDING: Untrimmed urgency strings degrade to routine and shouldDisplay: false
    expect(untrimmedStat.tone).toBe('routine');
    expect(untrimmedStat.shouldDisplay).toBe(false);
    expect(untrimmedUrgent.tone).toBe('routine');
    expect(untrimmedUrgent.shouldDisplay).toBe(false);
  });

  test('Accessibility Oracle: Urgency is NEVER communicated by color alone', () => {
    const urgencies: Array<'stat' | 'critical' | 'urgent' | 'routine'> = [
      'stat',
      'critical',
      'urgent',
      'routine',
    ];

    for (const u of urgencies) {
      const meta = getUrgencyMeta(u, false, true);
      expect(meta.label).toBeDefined();
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.icon).toBeDefined();
      expect(['alert', 'warning', 'info']).toContain(meta.icon);
      expect(meta.tone).toBeDefined();
    }
  });

  test('Token Design Compliance: tones map directly to design token semantic colors', () => {
    expect(lightColors.emergencyBg).toBeDefined();
    expect(lightColors.emergencyText).toBeDefined();
    expect(lightColors.emergencyBorder).toBeDefined();

    expect(lightColors.urgentBg).toBeDefined();
    expect(lightColors.urgentText).toBeDefined();
    expect(lightColors.urgentBorder).toBeDefined();

    expect(lightColors.routineBg).toBeDefined();
    expect(lightColors.routineText).toBeDefined();
    expect(lightColors.routineBorder).toBeDefined();

    expect(lightColors.primary).toBe('#0D6963');
  });
});
