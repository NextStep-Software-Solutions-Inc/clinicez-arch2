import { describe, expect, test } from 'bun:test';
import {
  CATEGORY_FILTERS,
  filterAndSearchRecords,
  matchesCategoryFilter,
  resolveRecordDomain,
  type CategorizableRecord,
} from '../services/records/categories';

describe('Records Hub Category Taxonomy & Resolvers', () => {
  test('CATEGORY_FILTERS exports exactly the 6 required clinical category filter pills', () => {
    expect(CATEGORY_FILTERS.length).toBe(6);
    const ids = CATEGORY_FILTERS.map((f) => f.id);
    expect(ids).toEqual([
      'all',
      'lab_results',
      'prescriptions',
      'lab_requests',
      'certificates',
      'outside_uploads',
    ]);
  });

  test('resolveRecordDomain maps lab results and diagnostic imaging to lab_results', () => {
    expect(resolveRecordDomain({ category: 'lab_result' })).toBe('lab_results');
    expect(resolveRecordDomain({ category: 'imaging' })).toBe('lab_results');
    expect(resolveRecordDomain({ type: 'xray' })).toBe('lab_results');
    expect(resolveRecordDomain({ typeLabel: 'Chest X-Ray' })).toBe('lab_results');
    expect(resolveRecordDomain({ documentTypeId: '22222222-2222-2222-2222-222222222222' })).toBe('lab_results');
    expect(resolveRecordDomain({ documentTypeId: '11111111-1111-1111-1111-111111111111' })).toBe('lab_results');
  });

  test('resolveRecordDomain maps prescriptions to prescriptions', () => {
    expect(resolveRecordDomain({ category: 'prescription' })).toBe('prescriptions');
    expect(resolveRecordDomain({ type: 'prescription' })).toBe('prescriptions');
    expect(resolveRecordDomain({ typeLabel: 'Electronic Prescription' })).toBe('prescriptions');
    expect(resolveRecordDomain({ documentTypeId: '44444444-4444-4444-4444-444444444444' })).toBe('prescriptions');
  });

  test('resolveRecordDomain maps lab requests and requisitions to lab_requests', () => {
    expect(resolveRecordDomain({ category: 'lab_request' })).toBe('lab_requests');
    expect(resolveRecordDomain({ type: 'lab_request' })).toBe('lab_requests');
    expect(resolveRecordDomain({ typeLabel: 'Laboratory Requisition' })).toBe('lab_requests');
  });

  test('resolveRecordDomain maps certificates and vaccine cards to certificates', () => {
    expect(resolveRecordDomain({ category: 'certificate' })).toBe('certificates');
    expect(resolveRecordDomain({ category: 'vaccine_card' })).toBe('certificates');
    expect(resolveRecordDomain({ type: 'medical-certificate' })).toBe('certificates');
    expect(resolveRecordDomain({ documentTypeId: '33333333-3333-3333-3333-333333333333' })).toBe('certificates');
  });

  test('resolveRecordDomain falls back to other for unknown types', () => {
    expect(resolveRecordDomain({ category: 'other' })).toBe('other');
    expect(resolveRecordDomain({})).toBe('other');
    expect(resolveRecordDomain({ category: null, type: null })).toBe('other');
  });
});

describe('Category Pill Filtering (matchesCategoryFilter)', () => {
  const records: CategorizableRecord[] = [
    {
      id: '1',
      title: 'Complete Blood Count',
      category: 'lab_result',
      provenance: 'clinicez_verified',
      clinicId: 'clinic-1',
    },
    {
      id: '2',
      title: 'Amoxicillin 500mg',
      category: 'prescription',
      provenance: 'clinicez_verified',
      clinicId: 'clinic-1',
    },
    {
      id: '3',
      title: 'Fasting Blood Sugar Order',
      category: 'lab_request',
      provenance: 'clinicez_verified',
      clinicId: 'clinic-1',
    },
    {
      id: '4',
      title: 'Fit to Work Certificate',
      category: 'certificate',
      provenance: 'clinicez_verified',
      clinicId: 'clinic-1',
    },
    {
      id: '5',
      title: 'External Diagnostic Ultrasound',
      category: 'imaging',
      provenance: 'external_lab',
      facilityName: 'Hi-Precision Diagnostics',
    },
    {
      id: '6',
      title: 'Vaccination Card Outside Scan',
      category: 'vaccine_card',
      provenance: 'patient_uploaded',
    },
    {
      id: '7',
      title: 'Discharge Summary',
      category: 'other',
      provenance: 'patient_uploaded',
    },
  ];

  test('All pill returns true for every record', () => {
    for (const rec of records) {
      expect(matchesCategoryFilter(rec, 'all')).toBe(true);
    }
  });

  test('Lab Results pill matches both verified lab results and external diagnostic imaging', () => {
    const matched = records.filter((r) => matchesCategoryFilter(r, 'lab_results'));
    expect(matched.map((r) => r.id)).toEqual(['1', '5']);
  });

  test('Prescriptions pill matches prescriptions', () => {
    const matched = records.filter((r) => matchesCategoryFilter(r, 'prescriptions'));
    expect(matched.map((r) => r.id)).toEqual(['2']);
  });

  test('Lab Requests pill matches laboratory requests', () => {
    const matched = records.filter((r) => matchesCategoryFilter(r, 'lab_requests'));
    expect(matched.map((r) => r.id)).toEqual(['3']);
  });

  test('Certificates pill matches medical certificates and vaccine cards', () => {
    const matched = records.filter((r) => matchesCategoryFilter(r, 'certificates'));
    expect(matched.map((r) => r.id)).toEqual(['4', '6']);
  });

  test('Outside Uploads pill matches patient uploaded records, external labs, and other categories', () => {
    const matched = records.filter((r) => matchesCategoryFilter(r, 'outside_uploads'));
    expect(matched.map((r) => r.id)).toEqual(['5', '6', '7']);
  });
});

describe('Multi-field Search Filtering (filterAndSearchRecords)', () => {
  const sampleRecords: CategorizableRecord[] = [
    {
      id: 'r1',
      title: 'Complete Blood Count (CBC)',
      name: 'cbc_report_2026.pdf',
      category: 'lab_result',
      facilityName: "St. Luke's Medical Center",
      typeLabel: 'Hematology',
      notes: 'Fasting 12 hours prior to venipuncture',
      provenance: 'clinicez_verified',
      clinicId: 'c1',
    },
    {
      id: 'r2',
      title: 'Urinalysis Routine',
      name: 'urinalysis.pdf',
      category: 'lab_result',
      facilityName: 'Makati Medical Center',
      typeLabel: 'Clinical Microscopy',
      notes: 'Midstream clean catch sample',
      provenance: 'clinicez_verified',
      clinicId: 'c1',
    },
    {
      id: 'r3',
      title: 'Chest X-Ray PA View',
      name: 'chest_xray_film.jpg',
      category: 'imaging',
      facilityName: 'Hi-Precision Diagnostics',
      typeLabel: 'Radiology',
      notes: 'No active lung infiltrates or cardiomegaly',
      provenance: 'external_lab',
    },
    {
      id: 'r4',
      title: 'Maintenance Meds - Losartan 50mg',
      name: 'losartan_rx.pdf',
      category: 'prescription',
      facilityName: 'Barangay Health Center',
      typeLabel: 'Prescription',
      notes: 'Take 1 tablet once daily in the morning',
      provenance: 'patient_uploaded',
    },
  ];

  test('searches case-insensitively by title', () => {
    const res = filterAndSearchRecords(sampleRecords, 'all', 'blood count');
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('r1');
  });

  test('searches by file name', () => {
    const res = filterAndSearchRecords(sampleRecords, 'all', 'chest_xray');
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('r3');
  });

  test('searches by facility name', () => {
    const res = filterAndSearchRecords(sampleRecords, 'all', 'makati medical');
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('r2');
  });

  test('searches by typeLabel', () => {
    const res = filterAndSearchRecords(sampleRecords, 'all', 'radiology');
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('r3');
  });

  test('searches within clinical notes', () => {
    const res = filterAndSearchRecords(sampleRecords, 'all', 'midstream clean catch');
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('r2');
  });

  test('combines category filter and search query correctly', () => {
    // Both r1 and r2 are lab_result, but only r1 matches "fasting"
    const res1 = filterAndSearchRecords(sampleRecords, 'lab_results', 'fasting');
    expect(res1.length).toBe(1);
    expect(res1[0].id).toBe('r1');

    // r4 matches "daily" in notes, but searching under lab_results yields 0
    const res2 = filterAndSearchRecords(sampleRecords, 'lab_results', 'daily');
    expect(res2.length).toBe(0);

    // searching under prescriptions yields r4
    const res3 = filterAndSearchRecords(sampleRecords, 'prescriptions', 'daily');
    expect(res3.length).toBe(1);
    expect(res3[0].id).toBe('r4');
  });

  test('empty query returns all records matching category', () => {
    const res = filterAndSearchRecords(sampleRecords, 'all', '   ');
    expect(res.length).toBe(4);
  });
});
