// token-guard:ignore-file
import { describe, expect, test } from 'bun:test';
import {
  getYakapEnlistments,
  getActiveYakapEnlistment,
  isYakapEnlistmentActive,
  needsYakapRenewal,
  createAnnualRenewal,
  recordAnnualRenewal,
  formatYakapStatusBadge,
  toIsoDateString,
  type YakapEnlistmentEntry,
} from '../utils/yakapEnlistment';
import { computePatientLocation } from '../utils/patientLocation';

describe('Feature 13 & 14: Frontend YAKAP Lifecycle, Renewal Controls & Location Resolution', () => {

  // =========================================================================
  // TIER 1: ACTIVE ENLISTMENT RESOLUTION (getActiveYakapEnlistment)
  // =========================================================================
  describe('Tier 1: Active Enlistment Resolution', () => {
    const sampleEnlistments: YakapEnlistmentEntry[] = [
      {
        enlisted_at: '2025-01-10',
        valid_until: '2025-12-31',
        effective_year: '2025',
        status: 'Expired',
        source: 'ClinicEnlistment',
        case_no: 'C000921202500001',
      },
      {
        enlisted_at: '2026-01-05',
        valid_until: '2026-12-31',
        effective_year: '2026',
        status: 'Active',
        source: 'PhilHealthMasterlist',
        case_no: 'C000921202600001',
        enlistment_no: 'E000921202600001',
        profiling_trans_no: 'P000921202600001',
      },
    ];

    test('T1.1: Resolves active benefit period entry covering current encounter date', () => {
      const active = getActiveYakapEnlistment(sampleEnlistments, '2026-06-15');
      expect(active).not.toBeNull();
      expect(active?.effective_year).toBe('2026');
      expect(active?.case_no).toBe('C000921202600001');
    });

    test('T1.2: Resolves from customFields dictionary object', () => {
      const customFields = { yakap_enlistments: sampleEnlistments };
      const active = getActiveYakapEnlistment(customFields, '2026-08-20');
      expect(active).not.toBeNull();
      expect(active?.effective_year).toBe('2026');
    });

    test('T1.3: Returns null when all enlistment entries are expired', () => {
      const active = getActiveYakapEnlistment(sampleEnlistments, '2027-01-01');
      expect(active).toBeNull();
    });

    test('T1.4: Returns null for past encounter date where older entry is marked Expired', () => {
      const active = getActiveYakapEnlistment(sampleEnlistments, '2025-06-15');
      expect(active).toBeNull();
    });

    test('T1.5: Returns null safely on empty array, null, or undefined customFields', () => {
      expect(getActiveYakapEnlistment([])).toBeNull();
      expect(getActiveYakapEnlistment(null)).toBeNull();
      expect(getActiveYakapEnlistment(undefined)).toBeNull();
      expect(getActiveYakapEnlistment({})).toBeNull();
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY VALUE ANALYSIS & DATE EDGE CASES
  // =========================================================================
  describe('Tier 2: Boundary Date Analysis', () => {
    const boundaryList: YakapEnlistmentEntry[] = [
      {
        enlisted_at: '2026-01-01',
        valid_until: '2026-12-31',
        effective_year: '2026',
        status: 'Active',
        source: 'ClinicEnlistment',
      },
    ];

    test('T2.1: Inclusive on first day of enlistment (enlisted_at)', () => {
      const active = getActiveYakapEnlistment(boundaryList, '2026-01-01');
      expect(active).not.toBeNull();
      expect(active?.effective_year).toBe('2026');
    });

    test('T2.2: Inclusive on last day of validity (valid_until)', () => {
      const active = getActiveYakapEnlistment(boundaryList, '2026-12-31');
      expect(active).not.toBeNull();
      expect(active?.effective_year).toBe('2026');
    });

    test('T2.3: Rejects day after valid_until (2027-01-01)', () => {
      const active = getActiveYakapEnlistment(boundaryList, '2027-01-01');
      expect(active).toBeNull();
    });

    test('T2.4: Rejects day before enlisted_at (2025-12-31)', () => {
      const active = getActiveYakapEnlistment(boundaryList, '2025-12-31');
      expect(active).toBeNull();
    });

    test('T2.5: Handles leap year validity window (2024-02-29)', () => {
      const leapList: YakapEnlistmentEntry[] = [
        {
          enlisted_at: '2024-02-29',
          valid_until: '2024-12-31',
          effective_year: '2024',
          status: 'Active',
          source: 'SelfReported',
        },
      ];
      expect(getActiveYakapEnlistment(leapList, '2024-02-29')).not.toBeNull();
      expect(getActiveYakapEnlistment(leapList, '2024-03-01')).not.toBeNull();
    });
  });

  // =========================================================================
  // TIER 3: STATUTORY STATUS FILTERING ('Transferred' & 'Expired')
  // =========================================================================
  describe('Tier 3: Statutory Status Filtering', () => {
    test('T3.1: Rejects Transferred enlistment even if covering date range', () => {
      const list: YakapEnlistmentEntry[] = [
        {
          enlisted_at: '2026-01-01',
          valid_until: '2026-12-31',
          effective_year: '2026',
          status: 'Transferred',
          source: 'PhilHealthMasterlist',
          case_no: 'C000921202600001',
        },
      ];
      expect(getActiveYakapEnlistment(list, '2026-06-15')).toBeNull();
      expect(isYakapEnlistmentActive(list, '2026')).toBe(false);
    });

    test('T3.2: Rejects Expired enlistment even if valid_until string is in future', () => {
      const list: YakapEnlistmentEntry[] = [
        {
          enlisted_at: '2026-01-01',
          valid_until: '2026-12-31',
          effective_year: '2026',
          status: 'Expired',
          source: 'ClinicEnlistment',
        },
      ];
      expect(getActiveYakapEnlistment(list, '2026-06-15')).toBeNull();
      expect(isYakapEnlistmentActive(list, '2026')).toBe(false);
    });

    test('T3.3: Resolves correctly when multiple entries exist for same year and one is Active', () => {
      const list: YakapEnlistmentEntry[] = [
        {
          enlisted_at: '2026-01-01',
          valid_until: '2026-06-30',
          effective_year: '2026',
          status: 'Expired',
          source: 'ClinicEnlistment',
        },
        {
          enlisted_at: '2026-07-01',
          valid_until: '2026-12-31',
          effective_year: '2026',
          status: 'Active',
          source: 'ClinicEnlistment',
        },
      ];
      const active = getActiveYakapEnlistment(list, '2026-08-01');
      expect(active).not.toBeNull();
      expect(active?.enlisted_at).toBe('2026-07-01');
    });
  });

  // =========================================================================
  // TIER 4: RENEWAL CONSTRUCTION & IMMUTABILITY
  // =========================================================================
  describe('Tier 4: Renewal Construction & Chronological Preservation', () => {
    test('T4.1: createAnnualRenewal constructs valid default entry with null control numbers', () => {
      const entry = createAnnualRenewal('2027');
      expect(entry.effective_year).toBe('2027');
      expect(entry.status).toBe('Active');
      expect(entry.source).toBe('ClinicEnlistment');
      expect(entry.valid_until).toBe('2027-12-31');
      expect(entry.case_no).toBeNull();
      expect(entry.enlistment_no).toBeNull();
      expect(entry.profiling_trans_no).toBeNull();
    });

    test('T4.2: createAnnualRenewal supports custom source and past enlistment date', () => {
      const entry = createAnnualRenewal({
        effectiveYear: '2026',
        enlistedAt: '2026-01-15',
        source: 'SelfReported',
      });
      expect(entry.effective_year).toBe('2026');
      expect(entry.enlisted_at).toBe('2026-01-15');
      expect(entry.source).toBe('SelfReported');
    });

    test('T4.3: recordAnnualRenewal appends new year without mutating prior years', () => {
      const cf: Record<string, any> = {
        yakap_enlistments: [
          {
            enlisted_at: '2026-01-01',
            valid_until: '2026-12-31',
            effective_year: '2026',
            status: 'Active',
            source: 'ClinicEnlistment',
            case_no: 'C000921202600001',
          },
        ],
      };

      const result = recordAnnualRenewal(cf, { effectiveYear: '2027' });
      expect(result.length).toBe(2);
      expect(result[0].effective_year).toBe('2026');
      expect(result[0].case_no).toBe('C000921202600001'); // Preserved!
      expect(result[1].effective_year).toBe('2027');
      expect(result[1].status).toBe('Active');
    });

    test('T4.4: recordAnnualRenewal marks prior active entry for SAME year as Expired', () => {
      const cf: Record<string, any> = {
        yakap_enlistments: [
          {
            enlisted_at: '2026-01-01',
            valid_until: '2026-12-31',
            effective_year: '2026',
            status: 'Active',
            source: 'ClinicEnlistment',
            case_no: 'C000921202600001',
          },
        ],
      };

      const result = recordAnnualRenewal(cf, {
        effectiveYear: '2026',
        enlistedAt: '2026-07-01',
      });
      expect(result.length).toBe(2);
      expect(result[0].status).toBe('Expired');
      expect(result[1].status).toBe('Active');
      expect(result[1].enlisted_at).toBe('2026-07-01');
    });

    test('T4.5: needsYakapRenewal reports true when benefit year is absent', () => {
      const cf: Record<string, any> = {
        yakap_enlistments: [
          {
            enlisted_at: '2026-01-01',
            valid_until: '2026-12-31',
            effective_year: '2026',
            status: 'Active',
            source: 'ClinicEnlistment',
          },
        ],
      };
      expect(needsYakapRenewal(cf, '2026')).toBe(false);
      expect(needsYakapRenewal(cf, '2027')).toBe(true);
    });
  });

  // =========================================================================
  // TIER 5: STRICT NO-SILENT-AUTO-RENEWAL IMMUTABILITY
  // =========================================================================
  describe('Tier 5: Strict No-Silent-Auto-Renewal Immutability', () => {
    test('T5.1: getActiveYakapEnlistment never mutates input array during inspection', () => {
      const cf: Record<string, any> = {
        yakap_enlistments: [
          {
            enlisted_at: '2025-01-01',
            valid_until: '2025-12-31',
            effective_year: '2025',
            status: 'Expired',
            source: 'ClinicEnlistment',
          },
        ],
      };

      const beforeLen = cf.yakap_enlistments.length;
      const res = getActiveYakapEnlistment(cf, '2026-06-15');
      expect(res).toBeNull();
      expect(cf.yakap_enlistments.length).toBe(beforeLen); // No silent renewal!
    });
  });

  // =========================================================================
  // TIER 6: DYNAMIC LOCALITY RESOLUTION (computePatientLocation)
  // =========================================================================
  describe('Tier 6: Dynamic Locality Resolution (computePatientLocation)', () => {
    test('T6.1: Formats Barangay, City, Province when all three present', () => {
      const loc = computePatientLocation({
        primary_barangay: 'Barangay San Antonio',
        primary_city: 'Pasig City',
        primary_province: 'Metro Manila',
      });
      expect(loc).toBe('Barangay San Antonio, Pasig City, Metro Manila');
    });

    test('T6.2: Formats City, Province when Barangay omitted', () => {
      const loc = computePatientLocation({
        primary_city: 'Davao City',
        primary_province: 'Davao del Sur',
      });
      expect(loc).toBe('Davao City, Davao del Sur');
    });

    test('T6.3: Formats Barangay, City when Province omitted (chartered cities)', () => {
      const loc = computePatientLocation({
        primary_barangay: 'Lahug',
        primary_city: 'Cebu City',
      });
      expect(loc).toBe('Lahug, Cebu City');
    });

    test('T6.4: Only Barangay present', () => {
      const loc = computePatientLocation({
        primary_barangay: 'Barangay 1',
      });
      expect(loc).toBe('Barangay 1');
    });

    test('T6.5: Falls back to primary_address_line when administrative divisions omitted', () => {
      const loc = computePatientLocation({
        primary_address_line: 'Purok 5 Riverside',
      });
      expect(loc).toBe('Purok 5 Riverside');
    });

    test('T6.6: Resolves from customFields wrapper object', () => {
      const loc = computePatientLocation({
        customFields: {
          primary_barangay: 'Poblacion',
          primary_city: 'Iloilo City',
          primary_province: 'Iloilo',
        },
      });
      expect(loc).toBe('Poblacion, Iloilo City, Iloilo');
    });

    test('T6.7: Returns "" when all inputs empty, null, or undefined', () => {
      expect(computePatientLocation({})).toBe('');
      expect(computePatientLocation(null)).toBe('');
      expect(computePatientLocation(undefined)).toBe('');
      expect(computePatientLocation({ customFields: {} })).toBe('');
      expect(computePatientLocation({ customFields: null })).toBe('');
    });

    test('T6.8: Trims whitespace and suppresses empty tokens', () => {
      const loc = computePatientLocation({
        primary_barangay: '   ',
        primary_city: '  Baguio City  ',
        primary_province: 'Benguet',
      });
      expect(loc).toBe('Baguio City, Benguet');
    });

    test('T6.9: Strictly does NOT read deleted top-level entity properties', () => {
      const loc = computePatientLocation({
        barangay: 'Deleted Barangay',
        city: 'Deleted City',
        province: 'Deleted Province',
      } as any);
      expect(loc).toBe('');
    });
  });
});
