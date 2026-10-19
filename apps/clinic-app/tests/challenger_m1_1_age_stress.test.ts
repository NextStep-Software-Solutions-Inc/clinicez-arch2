// token-guard:ignore-file
import { describe, it, expect } from 'bun:test';
import { calculateChronologicalAge, formatLongAge, getDaysInMonth, parseDateParts } from '../utils/age';

describe('Adversarial Stress Test: Chronological Age Engine (Milestone M1)', () => {
  // =========================================================================
  // 1. LEAP YEAR BABIES & CENTURIAL LEAP LOGIC
  // =========================================================================
  describe('1. Leap Year Babies & Centurial Leap Logic', () => {
    it('verifies getDaysInMonth across centurial and leap years', () => {
      expect(getDaysInMonth(2024, 2)).toBe(29);
      expect(getDaysInMonth(2023, 2)).toBe(28);
      expect(getDaysInMonth(2000, 2)).toBe(29); // divisible by 400
      expect(getDaysInMonth(1900, 2)).toBe(28); // divisible by 100 but not 400
      expect(getDaysInMonth(2100, 2)).toBe(28);
      expect(getDaysInMonth(2400, 2)).toBe(29);
      expect(getDaysInMonth(2024, 1)).toBe(31);
      expect(getDaysInMonth(2024, 4)).toBe(30);
    });

    it('leap day baby born 2024-02-29 on day 0, day 1, and 1 month', () => {
      // Day 0
      const refDay0 = new Date(2024, 1, 29); // Feb 29, 2024
      expect(formatLongAge('2024-02-29', refDay0)).toBe('0 days');
      const calc0 = calculateChronologicalAge('2024-02-29', refDay0);
      expect(calc0?.totalDays).toBe(0);
      expect(calc0?.isNewborn).toBe(true);

      // Day 1: Mar 1, 2024
      const refDay1 = new Date(2024, 2, 1); // Mar 1, 2024
      expect(formatLongAge('2024-02-29', refDay1)).toBe('1 day');
      const calc1 = calculateChronologicalAge('2024-02-29', refDay1);
      expect(calc1?.totalDays).toBe(1);
      expect(calc1?.isNewborn).toBe(true);

      // 1 month: Mar 29, 2024
      const ref1Mo = new Date(2024, 2, 29); // Mar 29, 2024
      expect(formatLongAge('2024-02-29', ref1Mo)).toBe('1 mo');
      const calc1Mo = calculateChronologicalAge('2024-02-29', ref1Mo);
      expect(calc1Mo?.months).toBe(1);
      expect(calc1Mo?.isInfant).toBe(true);
      expect(calc1Mo?.isNewborn).toBe(false);
    });

    it('leap day baby born 2024-02-29 evaluated on non-leap years (2025, 2026) and leap year 2028', () => {
      // On 2025-02-28 (day before anniversary in non-leap year)
      const ref2025Feb28 = new Date(2025, 1, 28);
      const calc2025Feb28 = calculateChronologicalAge('2024-02-29', ref2025Feb28);
      expect(calc2025Feb28?.years).toBe(0);
      expect(calc2025Feb28?.months).toBe(11);
      expect(calc2025Feb28?.days).toBeGreaterThanOrEqual(0);
      expect(calc2025Feb28?.weeks).toBeGreaterThanOrEqual(0);

      // On 2025-03-01 (1st anniversary in non-leap year)
      const ref2025Mar1 = new Date(2025, 2, 1);
      expect(formatLongAge('2024-02-29', ref2025Mar1)).toBe('1 yr');
      const calc2025Mar1 = calculateChronologicalAge('2024-02-29', ref2025Mar1);
      expect(calc2025Mar1?.years).toBe(1);
      expect(calc2025Mar1?.months).toBe(0);
      expect(calc2025Mar1?.days).toBe(0);

      // On 2026-03-01 (2nd anniversary)
      const ref2026Mar1 = new Date(2026, 2, 1);
      expect(formatLongAge('2024-02-29', ref2026Mar1)).toBe('2 yrs');

      // On 2028-02-29 (4th anniversary on leap year)
      const ref2028Feb29 = new Date(2028, 1, 29);
      expect(formatLongAge('2024-02-29', ref2028Feb29)).toBe('4 yrs');
      const calc2028 = calculateChronologicalAge('2024-02-29', ref2028Feb29);
      expect(calc2028?.years).toBe(4);
      expect(calc2028?.months).toBe(0);
      expect(calc2028?.days).toBe(0);
    });

    it('leap day baby born 2000-02-29 evaluated on 2001-03-01 and 2020-02-29', () => {
      const ref2001 = new Date(2001, 2, 1);
      expect(formatLongAge('2000-02-29', ref2001)).toBe('1 yr');

      const ref2020 = new Date(2020, 1, 29);
      expect(formatLongAge('2000-02-29', ref2020)).toBe('20 yrs');
    });
  });

  // =========================================================================
  // 2. NEWBORN & INFANT BOUNDARIES
  // =========================================================================
  describe('2. Newborn Boundaries (0 to 30 days)', () => {
    it('handles 0 days (today), 1 day (yesterday), and 29 days', () => {
      const base = new Date(2024, 5, 15); // June 15, 2024

      // 0 days
      expect(formatLongAge('2024-06-15', base)).toBe('0 days');
      const age0 = calculateChronologicalAge('2024-06-15', base);
      expect(age0?.isNewborn).toBe(true);
      expect(age0?.totalDays).toBe(0);

      // 1 day
      const day1 = new Date(2024, 5, 16);
      expect(formatLongAge('2024-06-15', day1)).toBe('1 day');
      const age1 = calculateChronologicalAge('2024-06-15', day1);
      expect(age1?.isNewborn).toBe(true);
      expect(age1?.totalDays).toBe(1);

      // 29 days: July 14, 2024
      const day29 = new Date(2024, 6, 14);
      expect(formatLongAge('2024-06-15', day29)).toBe('29 days');
      const age29 = calculateChronologicalAge('2024-06-15', day29);
      expect(age29?.isNewborn).toBe(true);
      expect(age29?.totalDays).toBe(29);
    });

    it('transitions from newborn to infant at exactly 1 month', () => {
      const birth = '2024-06-15';
      const ref1Mo = new Date(2024, 6, 15); // July 15, 2024
      expect(formatLongAge(birth, ref1Mo)).toBe('1 mo');
      const calc1Mo = calculateChronologicalAge(birth, ref1Mo);
      expect(calc1Mo?.isNewborn).toBe(false);
      expect(calc1Mo?.isInfant).toBe(true);
      expect(calc1Mo?.months).toBe(1);
      expect(calc1Mo?.days).toBe(0);
    });
  });

  // =========================================================================
  // 3. MONTH TRANSITIONS & CALENDAR BORROWING STRESS (FINDS CRITICAL BUGS)
  // =========================================================================
  describe('3. Month Transitions and Calendar Borrowing Stress', () => {
    it('tests Jan 31 -> Feb 28 in non-leap year (2023)', () => {
      const ref = new Date(2023, 1, 28); // Feb 28, 2023
      const ageStr = formatLongAge('2023-01-31', ref);
      expect(ageStr).toBe('28 days');
      const calc = calculateChronologicalAge('2023-01-31', ref);
      expect(calc?.isNewborn).toBe(true);
      expect(calc?.totalDays).toBe(28);
    });

    it('tests Jan 31 -> Feb 29 in leap year (2024)', () => {
      const ref = new Date(2024, 1, 29); // Feb 29, 2024
      const ageStr = formatLongAge('2024-01-31', ref);
      expect(ageStr).toBe('29 days');
      const calc = calculateChronologicalAge('2024-01-31', ref);
      expect(calc?.isNewborn).toBe(true);
      expect(calc?.totalDays).toBe(29);
    });

    it('tests Jan 31 -> Mar 1 in non-leap year (2023) [MUST NEVER PRODUCE NEGATIVE DAYS/WEEKS]', () => {
      const ref = new Date(2023, 2, 1); // Mar 1, 2023
      const calc = calculateChronologicalAge('2023-01-31', ref);
      // Adversarial check: days, weeks, totalDays must NEVER be negative
      expect(calc?.days).toBeGreaterThanOrEqual(0);
      expect(calc?.weeks).toBeGreaterThanOrEqual(0);
      expect(calc?.totalDays).toBeGreaterThanOrEqual(0);
      expect(calc?.days).toBe(1);
      expect(calc?.totalDays).toBe(1);
    });

    it('tests Jan 31 -> Mar 2 in non-leap year (2023) [MUST NEVER PRODUCE NEGATIVE DAYS/WEEKS]', () => {
      const ref = new Date(2023, 2, 2); // Mar 2, 2023
      const calc = calculateChronologicalAge('2023-01-31', ref);
      expect(calc?.days).toBeGreaterThanOrEqual(0);
      expect(calc?.weeks).toBeGreaterThanOrEqual(0);
      expect(calc?.totalDays).toBeGreaterThanOrEqual(0);
      expect(calc?.days).toBe(2);
      expect(calc?.totalDays).toBe(2);

      // Verify March 3 and March 4 strictly increment without regression
      const calcMar3 = calculateChronologicalAge('2023-01-31', new Date(2023, 2, 3));
      expect(calcMar3?.days).toBe(3);
      expect(calcMar3?.totalDays).toBe(3);

      const calcMar4 = calculateChronologicalAge('2023-01-31', new Date(2023, 2, 4));
      expect(calcMar4?.days).toBe(4);
      expect(calcMar4?.totalDays).toBe(4);
    });

    it('tests Jan 31 -> Mar 1 in leap year (2024) [MUST NEVER PRODUCE NEGATIVE DAYS/WEEKS]', () => {
      const ref = new Date(2024, 2, 1); // Mar 1, 2024
      const calc = calculateChronologicalAge('2024-01-31', ref);
      expect(calc?.days).toBeGreaterThanOrEqual(0);
      expect(calc?.weeks).toBeGreaterThanOrEqual(0);
      expect(calc?.totalDays).toBeGreaterThanOrEqual(0);
    });

    it('tests Jan 30 -> Mar 1 in non-leap year (2023) [MUST NEVER PRODUCE NEGATIVE DAYS/WEEKS]', () => {
      const ref = new Date(2023, 2, 1); // Mar 1, 2023
      const calc = calculateChronologicalAge('2023-01-30', ref);
      expect(calc?.days).toBeGreaterThanOrEqual(0);
      expect(calc?.weeks).toBeGreaterThanOrEqual(0);
      expect(calc?.totalDays).toBeGreaterThanOrEqual(0);
    });

    it('tests adult born 1990-01-31 evaluated on 2023-03-01 [MUST NEVER PRODUCE NEGATIVE WEEKS/DAYS]', () => {
      const ref = new Date(2023, 2, 1); // Mar 1, 2023
      const calc = calculateChronologicalAge('1990-01-31', ref);
      expect(calc?.years).toBe(33);
      expect(calc?.months).toBeGreaterThanOrEqual(0);
      expect(calc?.weeks).toBeGreaterThanOrEqual(0);
      expect(calc?.days).toBeGreaterThanOrEqual(0);
    });

    it('tests Feb 28 -> Mar 1 in non-leap year (2023)', () => {
      const ref = new Date(2023, 2, 1); // Mar 1, 2023
      const ageStr = formatLongAge('2023-02-28', ref);
      expect(ageStr).toBe('1 day');
      const calc = calculateChronologicalAge('2023-02-28', ref);
      expect(calc?.totalDays).toBe(1);
    });

    it('tests Aug 31 -> Sep 30', () => {
      const ref = new Date(2023, 8, 30); // Sep 30, 2023
      const ageStr = formatLongAge('2023-08-31', ref);
      expect(ageStr).toBe('30 days');
      const calc = calculateChronologicalAge('2023-08-31', ref);
      expect(calc?.days).toBeGreaterThanOrEqual(0);
    });

    it('tests Aug 31 -> Oct 1', () => {
      const ref = new Date(2023, 9, 1); // Oct 1, 2023
      const calc = calculateChronologicalAge('2023-08-31', ref);
      expect(calc?.days).toBeGreaterThanOrEqual(0);
      expect(calc?.weeks).toBeGreaterThanOrEqual(0);
    });

    it('tests Dec 31 -> Jan 1 (year boundary)', () => {
      const ref = new Date(2024, 0, 1); // Jan 1, 2024
      const ageStr = formatLongAge('2023-12-31', ref);
      expect(ageStr).toBe('1 day');
      const calc = calculateChronologicalAge('2023-12-31', ref);
      expect(calc?.years).toBe(0);
      expect(calc?.months).toBe(0);
      expect(calc?.totalDays).toBe(1);
    });
  });

  // =========================================================================
  // 4. ADVERSARIAL AND MALFORMED INPUTS
  // =========================================================================
  describe('4. Adversarial and Malformed Inputs', () => {
    it('returns empty string and null for falsy, empty, whitespace inputs', () => {
      expect(formatLongAge(null)).toBe('');
      expect(formatLongAge(undefined)).toBe('');
      expect(formatLongAge('')).toBe('');
      expect(formatLongAge('   ')).toBe('');
      expect(calculateChronologicalAge(null)).toBeNull();
      expect(calculateChronologicalAge(undefined)).toBeNull();
      expect(calculateChronologicalAge('')).toBeNull();
      expect(calculateChronologicalAge('   ')).toBeNull();
    });

    it('returns empty string and null for invalid date strings', () => {
      expect(formatLongAge('invalid-date')).toBe('');
      expect(formatLongAge('2026-99-99')).toBe('');
      expect(formatLongAge('2026-00-10')).toBe('');
      expect(formatLongAge('not a date')).toBe('');
      expect(calculateChronologicalAge('invalid')).toBeNull();
      expect(calculateChronologicalAge('2026-99-99')).toBeNull();
    });

    it('rejects impossible calendar dates (Feb 31, non-leap Feb 29, Apr 31)', () => {
      // 2024-02-31 does not exist on any calendar
      const parsedFeb31 = parseDateParts('2024-02-31');
      expect(parsedFeb31).toBeNull();
      expect(formatLongAge('2024-02-31', new Date(2024, 2, 1))).toBe('');

      // 2023-02-29 does not exist on non-leap year 2023
      const parsedFeb29NonLeap = parseDateParts('2023-02-29');
      expect(parsedFeb29NonLeap).toBeNull();
      expect(formatLongAge('2023-02-29', new Date(2023, 2, 1))).toBe('');

      // 2024-04-31 does not exist (April has 30 days)
      const parsedApr31 = parseDateParts('2024-04-31');
      expect(parsedApr31).toBeNull();
    });

    it('handles Date instances with NaN time', () => {
      const badDate = new Date(NaN);
      expect(formatLongAge(badDate)).toBe('');
      expect(calculateChronologicalAge(badDate)).toBeNull();
      expect(parseDateParts(badDate)).toBeNull();
    });

    it('handles future dates gracefully without negative age or crashes', () => {
      const today = new Date(2024, 5, 15);
      // Born tomorrow
      const tomorrow = '2024-06-16';
      expect(formatLongAge(tomorrow, today)).toBe('0 days');
      const calcTom = calculateChronologicalAge(tomorrow, today);
      expect(calcTom?.years).toBe(0);
      expect(calcTom?.months).toBe(0);
      expect(calcTom?.days).toBe(0);

      // Born next year
      const nextYear = '2025-06-15';
      expect(formatLongAge(nextYear, today)).toBe('0 days');
      const calcNy = calculateChronologicalAge(nextYear, today);
      expect(calcNy?.years).toBe(0);
      expect(calcNy?.months).toBe(0);
    });

    it('handles ISO timestamps with timezone offsets', () => {
      const iso = '2024-02-29T18:30:00.000Z';
      const ref = new Date(2025, 2, 1);
      expect(formatLongAge(iso, ref)).toBe('1 yr');
    });
  });

  // =========================================================================
  // 5. EXHAUSTIVE SWEEP ACROSS CALENDAR BOUNDARIES
  // =========================================================================
  describe('5. Exhaustive Sweep Across Calendar Boundaries', () => {
    it('scans all month ends in 2023 and 2024 to verify zero negative age components', () => {
      const monthEnds = [
        '2023-01-30', '2023-01-31', '2023-02-28', '2023-03-31', '2023-04-30',
        '2023-05-31', '2023-06-30', '2023-07-31', '2023-08-31',
        '2023-09-30', '2023-10-31', '2023-11-30', '2023-12-31',
        '2024-01-30', '2024-01-31', '2024-02-29', '2024-03-31',
      ];

      const negativeFindings: string[] = [];

      for (const dob of monthEnds) {
        const parts = parseDateParts(dob);
        if (!parts) continue;
        const birthDate = new Date(parts.year, parts.month - 1, parts.day);

        // Check reference dates for next 60 days
        for (let offset = 0; offset <= 60; offset++) {
          const ref = new Date(parts.year, parts.month - 1, parts.day + offset);
          const res = calculateChronologicalAge(dob, ref);
          if (!res) continue;

          if (res.years < 0 || res.months < 0 || res.weeks < 0 || res.days < 0 || res.totalDays < 0) {
            negativeFindings.push(
              `DOB: ${dob}, Ref: ${ref.toISOString().split('T')[0]} => years: ${res.years}, months: ${res.months}, weeks: ${res.weeks}, days: ${res.days}, totalDays: ${res.totalDays}`
            );
          }
        }
      }

      expect(negativeFindings).toHaveLength(0);
    });
  });
});
