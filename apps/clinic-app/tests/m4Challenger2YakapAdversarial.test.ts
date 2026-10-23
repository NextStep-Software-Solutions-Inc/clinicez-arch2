// token-guard:ignore-file
import { describe, expect, test } from 'bun:test';
import {
  getYakapEnlistments,
  getActiveYakapEnlistment,
  isYakapEnlistmentActive,
  needsYakapRenewal,
  createAnnualRenewal,
  recordAnnualRenewal,
  toIsoDateString,
  type YakapEnlistmentEntry,
  type YakapEnlistmentStatus,
} from '../utils/yakapEnlistment';

describe('Milestone 4 Challenger 2: Adversarial YAKAP Lifecycle & Renewal Guard Stress Tests', () => {

  // =========================================================================
  // 1. MULTI-YEAR CHRONOLOGICAL ARRAYS & OUT-OF-ORDER RECORDS
  // =========================================================================
  describe('1. Multi-Year Chronological Arrays & Out-of-Order Handling', () => {
    test('CH2-1.1: Resolves active period correctly when array entries are completely unsorted', () => {
      const scrambledArray: YakapEnlistmentEntry[] = [
        {
          enlisted_at: '2028-01-01',
          valid_until: '2028-12-31',
          effective_year: '2028',
          status: 'Active',
          source: 'ClinicEnlistment',
        },
        {
          enlisted_at: '2024-01-01',
          valid_until: '2024-12-31',
          effective_year: '2024',
          status: 'Expired',
          source: 'ClinicEnlistment',
        },
        {
          enlisted_at: '2026-01-01',
          valid_until: '2026-12-31',
          effective_year: '2026',
          status: 'Active',
          source: 'PhilHealthMasterlist',
          case_no: 'C000921202600001',
        },
        {
          enlisted_at: '2025-01-01',
          valid_until: '2025-12-31',
          effective_year: '2025',
          status: 'Expired',
          source: 'ClinicEnlistment',
        },
        {
          enlisted_at: '2027-01-01',
          valid_until: '2027-12-31',
          effective_year: '2027',
          status: 'Active',
          source: 'ClinicEnlistment',
        },
      ];

      // Query covering 2026
      const active2026 = getActiveYakapEnlistment(scrambledArray, '2026-07-15');
      expect(active2026).not.toBeNull();
      expect(active2026?.effective_year).toBe('2026');
      expect(active2026?.case_no).toBe('C000921202600001');

      // Query covering 2028
      const active2028 = getActiveYakapEnlistment(scrambledArray, '2028-03-20');
      expect(active2028).not.toBeNull();
      expect(active2028?.effective_year).toBe('2028');

      // Query covering 2025 (Expired)
      const active2025 = getActiveYakapEnlistment(scrambledArray, '2025-06-01');
      expect(active2025).toBeNull();
    });

    test('CH2-1.2: recordAnnualRenewal sorts scrambled array chronologically by effective_year and enlisted_at', () => {
      const customFields: Record<string, any> = {
        yakap_enlistments: [
          {
            enlisted_at: '2028-01-01',
            valid_until: '2028-12-31',
            effective_year: '2028',
            status: 'Active',
            source: 'ClinicEnlistment',
          },
          {
            enlisted_at: '2024-06-01',
            valid_until: '2024-12-31',
            effective_year: '2024',
            status: 'Expired',
            source: 'ClinicEnlistment',
          },
          {
            enlisted_at: '2026-01-01',
            valid_until: '2026-12-31',
            effective_year: '2026',
            status: 'Active',
            source: 'ClinicEnlistment',
          },
        ],
      };

      const updated = recordAnnualRenewal(customFields, {
        effectiveYear: '2025',
        enlistedAt: '2025-01-01',
      });

      expect(updated.length).toBe(4);
      expect(updated.map((e) => e.effective_year)).toEqual(['2024', '2025', '2026', '2028']);
      expect(customFields.yakap_enlistments.map((e: any) => e.effective_year)).toEqual([
        '2024',
        '2025',
        '2026',
        '2028',
      ]);
    });

    test('CH2-1.3: Duplicate same-year renewals: ensures only latest active is preserved and older marked Expired', () => {
      const customFields: Record<string, any> = {
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

      // 1st duplicate renewal for 2026 mid-year (e.g. re-enlistment update)
      const afterFirstRenewal = recordAnnualRenewal(customFields, {
        effectiveYear: '2026',
        enlistedAt: '2026-07-01',
        validUntil: '2026-12-31',
        source: 'PhilHealthMasterlist',
      });

      expect(afterFirstRenewal.length).toBe(2);
      expect(afterFirstRenewal[0].effective_year).toBe('2026');
      expect(afterFirstRenewal[0].status).toBe('Expired');
      expect(afterFirstRenewal[0].case_no).toBe('C000921202600001'); // Preserves historical control numbers
      expect(afterFirstRenewal[1].effective_year).toBe('2026');
      expect(afterFirstRenewal[1].status).toBe('Active');
      expect(afterFirstRenewal[1].enlisted_at).toBe('2026-07-01');

      // 2nd duplicate renewal for 2026 late in the year
      const afterSecondRenewal = recordAnnualRenewal(customFields, {
        effectiveYear: '2026',
        enlistedAt: '2026-10-15',
        validUntil: '2026-12-31',
        source: 'SelfReported',
      });

      expect(afterSecondRenewal.length).toBe(3);
      // Both earlier 2026 records must now be Expired
      expect(afterSecondRenewal[0].status).toBe('Expired');
      expect(afterSecondRenewal[1].status).toBe('Expired');
      // Only the newest 2026 record is Active
      expect(afterSecondRenewal[2].status).toBe('Active');
      expect(afterSecondRenewal[2].enlisted_at).toBe('2026-10-15');
      expect(afterSecondRenewal[2].source).toBe('SelfReported');

      // Verify active period resolves exclusively to the latest active record
      const activeEntry = getActiveYakapEnlistment(customFields, '2026-11-01');
      expect(activeEntry).not.toBeNull();
      expect(activeEntry?.enlisted_at).toBe('2026-10-15');
      expect(activeEntry?.source).toBe('SelfReported');
    });

    test('CH2-1.4: Leap Day (2024-02-29) boundary precision', () => {
      // Leap year string handling
      expect(toIsoDateString('2024-02-29')).toBe('2024-02-29');
      expect(toIsoDateString(new Date(2024, 1, 29))).toBe('2024-02-29');

      const leapEnlistment: YakapEnlistmentEntry = {
        enlisted_at: '2024-02-29',
        valid_until: '2024-12-31',
        effective_year: '2024',
        status: 'Active',
        source: 'ClinicEnlistment',
      };

      // Day of leap enlistment: ACTIVE
      expect(getActiveYakapEnlistment([leapEnlistment], '2024-02-29')).not.toBeNull();

      // Day before leap enlistment: REJECTED (NULL)
      expect(getActiveYakapEnlistment([leapEnlistment], '2024-02-28')).toBeNull();

      // Day after leap enlistment: ACTIVE
      expect(getActiveYakapEnlistment([leapEnlistment], '2024-03-01')).not.toBeNull();

      // Non-leap year: 2025 has 28 days in Feb
      expect(toIsoDateString('2025-02-28')).toBe('2025-02-28');
    });

    test('CH2-1.5: Year Boundary dates (YYYY-12-31 and YYYY-01-01)', () => {
      const multiYearEntries: YakapEnlistmentEntry[] = [
        {
          enlisted_at: '2025-01-01',
          valid_until: '2025-12-31',
          effective_year: '2025',
          status: 'Active',
          source: 'ClinicEnlistment',
          case_no: 'C000921202500001',
        },
        {
          enlisted_at: '2026-01-01',
          valid_until: '2026-12-31',
          effective_year: '2026',
          status: 'Active',
          source: 'ClinicEnlistment',
          case_no: 'C000921202600001',
        },
      ];

      // Exact last second of 2025 (2025-12-31T23:59:59.999Z)
      const res2025Eve = getActiveYakapEnlistment(multiYearEntries, '2025-12-31T23:59:59.999Z');
      expect(res2025Eve).not.toBeNull();
      expect(res2025Eve?.effective_year).toBe('2025');
      expect(res2025Eve?.case_no).toBe('C000921202500001');

      // Exact first moment of 2026 (2026-01-01T00:00:00.000Z)
      const res2026Day = getActiveYakapEnlistment(multiYearEntries, '2026-01-01T00:00:00.000Z');
      expect(res2026Day).not.toBeNull();
      expect(res2026Day?.effective_year).toBe('2026');
      expect(res2026Day?.case_no).toBe('C000921202600001');

      // One day before 2025 begins (2024-12-31) -> NULL
      expect(getActiveYakapEnlistment(multiYearEntries, '2024-12-31')).toBeNull();

      // One day after 2026 ends (2027-01-01) -> NULL
      expect(getActiveYakapEnlistment(multiYearEntries, '2027-01-01')).toBeNull();
    });
  });

  // =========================================================================
  // 2. STRICT NO-SILENT-AUTO-RENEWAL VERIFICATION
  // =========================================================================
  describe('2. Strict No-Silent-Auto-Renewal Verification', () => {
    test('CH2-2.1: Renewing year X must never mutate year Y', () => {
      const initialCustomFields: Record<string, any> = {
        yakap_enlistments: [
          {
            enlisted_at: '2025-01-01',
            valid_until: '2025-12-31',
            effective_year: '2025',
            status: 'Expired',
            source: 'ClinicEnlistment',
            case_no: 'C000921202500001',
            enlistment_no: 'E000921202500001',
            profiling_trans_no: 'P000921202500001',
          },
          {
            enlisted_at: '2026-01-01',
            valid_until: '2026-12-31',
            effective_year: '2026',
            status: 'Active',
            source: 'ClinicEnlistment',
            case_no: 'C000921202600001',
            enlistment_no: 'E000921202600001',
            profiling_trans_no: 'P000921202600001',
          },
        ],
      };

      // Perform renewal for 2027
      const result = recordAnnualRenewal(initialCustomFields, {
        effectiveYear: '2027',
        enlistedAt: '2027-01-01',
        validUntil: '2027-12-31',
        source: 'SelfReported',
      });

      expect(result.length).toBe(3);

      // Verify Year 2025 is UNTOUCHED
      expect(result[0].effective_year).toBe('2025');
      expect(result[0].status).toBe('Expired');
      expect(result[0].case_no).toBe('C000921202500001');
      expect(result[0].enlistment_no).toBe('E000921202500001');
      expect(result[0].profiling_trans_no).toBe('P000921202500001');

      // Verify Year 2026 is UNTOUCHED
      expect(result[1].effective_year).toBe('2026');
      expect(result[1].status).toBe('Active');
      expect(result[1].case_no).toBe('C000921202600001');
      expect(result[1].enlistment_no).toBe('E000921202600001');
      expect(result[1].profiling_trans_no).toBe('P000921202600001');

      // Verify Year 2027 is clean with null control numbers
      expect(result[2].effective_year).toBe('2027');
      expect(result[2].status).toBe('Active');
      expect(result[2].source).toBe('SelfReported');
      expect(result[2].case_no).toBeNull();
      expect(result[2].enlistment_no).toBeNull();
      expect(result[2].profiling_trans_no).toBeNull();
    });

    test('CH2-2.2: Dates outside covering range return null and never trigger auto-renewal', () => {
      const customFields: Record<string, any> = {
        yakap_enlistments: [
          {
            enlisted_at: '2026-03-01',
            valid_until: '2026-06-30',
            effective_year: '2026',
            status: 'Active',
            source: 'ClinicEnlistment',
          },
          {
            enlisted_at: '2026-09-01',
            valid_until: '2026-12-31',
            effective_year: '2026',
            status: 'Active',
            source: 'ClinicEnlistment',
          },
        ],
      };

      const cloneBefore = JSON.stringify(customFields);

      // Test before first period
      expect(getActiveYakapEnlistment(customFields, '2026-02-28')).toBeNull();

      // Test inside mid-year coverage gap (July 15)
      expect(getActiveYakapEnlistment(customFields, '2026-07-15')).toBeNull();

      // Test after second period
      expect(getActiveYakapEnlistment(customFields, '2027-01-01')).toBeNull();

      // Ensure customFields was not mutated at all
      expect(JSON.stringify(customFields)).toBe(cloneBefore);
    });

    test('CH2-2.3: needsYakapRenewal accurately detects coverage state', () => {
      const customFields: Record<string, any> = {
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

      // Year covered
      expect(needsYakapRenewal(customFields, '2026')).toBe(false);
      expect(needsYakapRenewal(customFields, 2026)).toBe(false);
      expect(needsYakapRenewal(customFields, '2026-08-15')).toBe(false);

      // Uncovered years/dates
      expect(needsYakapRenewal(customFields, '2025')).toBe(true);
      expect(needsYakapRenewal(customFields, '2027')).toBe(true);
      expect(needsYakapRenewal(customFields, 2027)).toBe(true);
      expect(needsYakapRenewal(customFields, '2027-01-01')).toBe(true);
    });
  });

  // =========================================================================
  // 3. LIFECYCLE STATUS TRANSITIONS
  // =========================================================================
  describe('3. Lifecycle Status Transitions: Active -> Expired -> Transferred -> Renewed', () => {
    test('CH2-3.1: Full lifecycle progression through all statutory states', () => {
      const customFields: Record<string, any> = { yakap_enlistments: [] };

      // Phase 1: Patient enlists for 2025 (Active)
      recordAnnualRenewal(customFields, {
        effectiveYear: '2025',
        enlistedAt: '2025-01-01',
        validUntil: '2025-12-31',
      });
      expect(isYakapEnlistmentActive(customFields, '2025')).toBe(true);
      expect(getActiveYakapEnlistment(customFields, '2025-06-01')?.status).toBe('Active');

      // Phase 2: Natural expiry into 2026
      expect(getActiveYakapEnlistment(customFields, '2026-01-01')).toBeNull();
      expect(needsYakapRenewal(customFields, '2026')).toBe(true);

      // Phase 3: Patient renews for 2026 (Active)
      recordAnnualRenewal(customFields, {
        effectiveYear: '2026',
        enlistedAt: '2026-01-01',
        validUntil: '2026-12-31',
      });
      expect(isYakapEnlistmentActive(customFields, '2026')).toBe(true);

      // Phase 4: Patient transfers to another facility (Transferred)
      // Masterlist sync marks the 2026 entry as Transferred
      customFields.yakap_enlistments[1].status = 'Transferred';
      expect(isYakapEnlistmentActive(customFields, '2026')).toBe(false);
      expect(getActiveYakapEnlistment(customFields, '2026-06-15')).toBeNull();

      // Phase 5: Patient transfers back / renews for 2027 (Renewed)
      recordAnnualRenewal(customFields, {
        effectiveYear: '2027',
        enlistedAt: '2027-01-01',
        validUntil: '2027-12-31',
        source: 'ClinicEnlistment',
      });

      const list = getYakapEnlistments(customFields);
      expect(list.length).toBe(3);
      // Historical audits intact
      expect(list[0].effective_year).toBe('2025'); // Active originally, now un-covered by date
      expect(list[1].effective_year).toBe('2026');
      expect(list[1].status).toBe('Transferred'); // Retains Transferred statutory record
      expect(list[2].effective_year).toBe('2027');
      expect(list[2].status).toBe('Active'); // Renewed successfully!

      // Queries for 2026 remain blocked
      expect(getActiveYakapEnlistment(customFields, '2026-08-01')).toBeNull();

      // Queries for 2027 succeed
      expect(getActiveYakapEnlistment(customFields, '2027-08-01')?.status).toBe('Active');
    });
  });

  // =========================================================================
  // 4. JSON STRING DESERIALIZATION RESILIENCE
  // =========================================================================
  describe('4. JSON String Deserialization Resilience', () => {
    test('CH2-4.1: Seamlessly deserializes valid JSON string in customFields["yakap_enlistments"]', () => {
      const serializedJson = JSON.stringify([
        {
          enlisted_at: '2026-01-01',
          valid_until: '2026-12-31',
          effective_year: 2026, // Numeric year in raw json
          status: 'Active',
          source: 'PhilHealthMasterlist',
          case_no: 'C000921202600001',
        },
      ]);

      const customFields = { yakap_enlistments: serializedJson };

      const list = getYakapEnlistments(customFields);
      expect(list.length).toBe(1);
      expect(list[0].effective_year).toBe('2026'); // Normalized to string
      expect(list[0].status).toBe('Active');
      expect(list[0].case_no).toBe('C000921202600001');

      // Directly functions with helper functions
      expect(isYakapEnlistmentActive(customFields, '2026')).toBe(true);
      const active = getActiveYakapEnlistment(customFields, '2026-05-10');
      expect(active).not.toBeNull();
      expect(active?.case_no).toBe('C000921202600001');
    });

    test('CH2-4.2: recordAnnualRenewal handles starting from raw JSON string', () => {
      const initialJson = JSON.stringify([
        {
          enlisted_at: '2025-01-01',
          valid_until: '2025-12-31',
          effective_year: '2025',
          status: 'Active',
          source: 'ClinicEnlistment',
        },
      ]);

      const customFields: Record<string, any> = { yakap_enlistments: initialJson };

      const updated = recordAnnualRenewal(customFields, { effectiveYear: '2026' });
      expect(updated.length).toBe(2);
      expect(updated[0].effective_year).toBe('2025');
      expect(updated[1].effective_year).toBe('2026');
      expect(Array.isArray(customFields.yakap_enlistments)).toBe(true);
    });

    test('CH2-4.3: Malformed, non-array, and corrupted JSON strings do not throw or crash', () => {
      // Malformed JSON syntax
      expect(getYakapEnlistments({ yakap_enlistments: '{ corrupted json [' })).toEqual([]);
      expect(getActiveYakapEnlistment({ yakap_enlistments: '{ corrupted json [' }, '2026-01-01')).toBeNull();
      expect(isYakapEnlistmentActive({ yakap_enlistments: '{ corrupted json [' }, '2026')).toBe(false);

      // JSON primitive string
      expect(getYakapEnlistments({ yakap_enlistments: '"not an array"' })).toEqual([]);

      // JSON number
      expect(getYakapEnlistments({ yakap_enlistments: '12345' })).toEqual([]);

      // JSON object instead of array
      expect(getYakapEnlistments({ yakap_enlistments: '{"key": "value"}' })).toEqual([]);

      // JSON literal null
      expect(getYakapEnlistments({ yakap_enlistments: 'null' })).toEqual([]);

      // Empty string
      expect(getYakapEnlistments({ yakap_enlistments: '' })).toEqual([]);

      // Non-string, non-array garbage (e.g. number, boolean)
      expect(getYakapEnlistments({ yakap_enlistments: 9999 as any })).toEqual([]);
      expect(getYakapEnlistments({ yakap_enlistments: true as any })).toEqual([]);
    });

    test('CH2-4.4: Corrupted items inside valid array are safely filtered out', () => {
      const mixedList: any[] = [
        null,
        undefined,
        42,
        'string item',
        {}, // missing effective_year
        { enlisted_at: '2026-01-01' }, // missing effective_year
        {
          enlisted_at: '2026-01-01',
          valid_until: '2026-12-31',
          effective_year: '2026',
          status: 'Active',
          source: 'ClinicEnlistment',
        },
      ];

      const customFields = { yakap_enlistments: mixedList };
      const cleaned = getYakapEnlistments(customFields);

      expect(cleaned.length).toBe(1);
      expect(cleaned[0].effective_year).toBe('2026');
      expect(cleaned[0].status).toBe('Active');
    });

    test('CH2-4.5: Invalid status strings are defensively defaulted to Expired', () => {
      const weirdStatusList: any[] = [
        {
          enlisted_at: '2026-01-01',
          valid_until: '2026-12-31',
          effective_year: '2026',
          status: 'PendingApproval', // Not in ('Active' | 'Expired' | 'Transferred')
          source: 'ClinicEnlistment',
        },
        {
          enlisted_at: '2026-01-01',
          valid_until: '2026-12-31',
          effective_year: '2026',
          status: 'Deleted',
          source: 'ClinicEnlistment',
        },
      ];

      const cleaned = getYakapEnlistments({ yakap_enlistments: weirdStatusList });
      expect(cleaned.length).toBe(2);
      expect(cleaned[0].status).toBe('Expired');
      expect(cleaned[1].status).toBe('Expired');

      // Neither should activate
      expect(getActiveYakapEnlistment({ yakap_enlistments: weirdStatusList }, '2026-06-01')).toBeNull();
    });
  });
});
