import { describe, it, expect } from 'bun:test';
import { calculateChronologicalAge, formatLongAge, formatShortAge, formatCompressedLongAge, getDaysInMonth } from '../utils/age';

describe('formatLongAge and calculateChronologicalAge', () => {
  describe('Adults and older pediatric patients (> 1 year)', () => {
    it('formats 33 yrs, 10 mos, 1 wk, 4 days accurately', () => {
      // 1990-01-01 to 2023-11-12: 33 yrs, 10 mos, 11 days (1 wk, 4 days)
      const ref = new Date(2023, 10, 12); // Nov 12, 2023
      const ageStr = formatLongAge('1990-01-01', ref);
      expect(ageStr).toBe('33 yrs, 10 mos, 1 wk, 4 days');

      const calc = calculateChronologicalAge('1990-01-01', ref);
      expect(calc).not.toBeNull();
      expect(calc?.years).toBe(33);
      expect(calc?.months).toBe(10);
      expect(calc?.weeks).toBe(1);
      expect(calc?.days).toBe(4);
      expect(calc?.isNewborn).toBe(false);
      expect(calc?.isInfant).toBe(false);
    });

    it('formats 5 yrs, 2 mos, 1 day without weeks when weeks = 0', () => {
      // 2018-03-10 to 2023-05-11: 5 yrs, 2 mos, 1 day
      const ref = new Date(2023, 4, 11); // May 11, 2023
      const ageStr = formatLongAge('2018-03-10', ref);
      expect(ageStr).toBe('5 yrs, 2 mos, 1 day');
    });

    it('formats exact anniversary as single years without trailing zero components', () => {
      const ref = new Date(2020, 4, 15); // May 15, 2020
      const ageStr = formatLongAge('2000-05-15', ref);
      expect(ageStr).toBe('20 yrs');
    });

    it('handles singular units correctly (1 yr, 1 mo, 1 wk, 1 day)', () => {
      // 2022-01-01 to 2023-02-09: 1 yr, 1 mo, 8 days (1 wk, 1 day)
      const ref = new Date(2023, 1, 9); // Feb 9, 2023
      const ageStr = formatLongAge('2022-01-01', ref);
      expect(ageStr).toBe('1 yr, 1 mo, 1 wk, 1 day');
    });
  });

  describe('Infants (1-12 months, < 1 year)', () => {
    it('formats 3 mos, 2 wks, 4 days accurately', () => {
      // 2023-01-01 to 2023-04-19: 3 mos, 18 days (2 wks, 4 days)
      const ref = new Date(2023, 3, 19); // Apr 19, 2023
      const ageStr = formatLongAge('2023-01-01', ref);
      expect(ageStr).toBe('3 mos, 2 wks, 4 days');

      const calc = calculateChronologicalAge('2023-01-01', ref);
      expect(calc?.years).toBe(0);
      expect(calc?.months).toBe(3);
      expect(calc?.weeks).toBe(2);
      expect(calc?.days).toBe(4);
      expect(calc?.isInfant).toBe(true);
      expect(calc?.isNewborn).toBe(false);
    });

    it('formats exactly 1 month', () => {
      const ref = new Date(2023, 2, 1); // Mar 1, 2023
      const ageStr = formatLongAge('2023-02-01', ref);
      expect(ageStr).toBe('1 mo');
    });

    it('formats months and weeks without remaining days if days = 0', () => {
      // 2023-01-01 to 2023-03-15: 2 mos, 14 days (2 wks, 0 days)
      const ref = new Date(2023, 2, 15); // Mar 15, 2023
      const ageStr = formatLongAge('2023-01-01', ref);
      expect(ageStr).toBe('2 mos, 2 wks');
    });
  });

  describe('Newborns (< 1 month)', () => {
    it('formats 12 days for a 12-day-old newborn', () => {
      const ref = new Date(2023, 3, 13); // Apr 13, 2023
      const ageStr = formatLongAge('2023-04-01', ref);
      expect(ageStr).toBe('12 days');

      const calc = calculateChronologicalAge('2023-04-01', ref);
      expect(calc?.isNewborn).toBe(true);
      expect(calc?.totalDays).toBe(12);
    });

    it('formats 1 day for a 1-day-old newborn', () => {
      const ref = new Date(2023, 3, 2); // Apr 2, 2023
      const ageStr = formatLongAge('2023-04-01', ref);
      expect(ageStr).toBe('1 day');
    });

    it('formats 0 days for a newborn on birth day', () => {
      const ref = new Date(2023, 3, 1); // Apr 1, 2023
      const ageStr = formatLongAge('2023-04-01', ref);
      expect(ageStr).toBe('0 days');
    });
  });

  describe('Leap Year and Calendar Boundaries', () => {
    it('identifies days in February accurately for leap and non-leap years', () => {
      expect(getDaysInMonth(2024, 2)).toBe(29);
      expect(getDaysInMonth(2023, 2)).toBe(28);
      expect(getDaysInMonth(2000, 2)).toBe(29);
      expect(getDaysInMonth(1900, 2)).toBe(28);
    });

    it('handles birth on leap day (Feb 29)', () => {
      const refNextDay = new Date(2024, 2, 1); // Mar 1, 2024
      expect(formatLongAge('2024-02-29', refNextDay)).toBe('1 day');

      const ref4Years = new Date(2028, 1, 29); // Feb 29, 2028
      expect(formatLongAge('2024-02-29', ref4Years)).toBe('4 yrs');
    });

    it('borrows February leap month correctly when crossing into March', () => {
      // Born 2024-02-20, Ref 2024-03-05:
      // Days borrow from Feb 2024 (29 days): 5 + 29 - 20 = 14 days => 2 wks, 0 days
      // Months: 3 - 1 - 2 = 0 mos => Newborn/infant < 1 month?
      // Since months borrowed down to 0, age is 14 days => newborn!
      const ref = new Date(2024, 2, 5); // Mar 5, 2024
      const ageStr = formatLongAge('2024-02-20', ref);
      expect(ageStr).toBe('14 days');
    });

    it('maintains strict day monotonicity for Jan 31 births crossing February into March', () => {
      // Non-leap year 2023: Feb has 28 days
      const d1 = calculateChronologicalAge('2023-01-31', new Date(2023, 2, 1));
      const d2 = calculateChronologicalAge('2023-01-31', new Date(2023, 2, 2));
      const d3 = calculateChronologicalAge('2023-01-31', new Date(2023, 2, 3));
      const d4 = calculateChronologicalAge('2023-01-31', new Date(2023, 2, 4));

      expect(d1?.days).toBe(1);
      expect(d1?.totalDays).toBe(1);
      expect(d2?.days).toBe(2);
      expect(d2?.totalDays).toBe(2);
      expect(d3?.days).toBe(3);
      expect(d3?.totalDays).toBe(3);
      expect(d4?.days).toBe(4);
      expect(d4?.totalDays).toBe(4);

      // Continuous monotonicity for Jan 31 birth across all of March
      let prevTotalDays = 0;
      for (let day = 1; day <= 30; day++) {
        const ref = new Date(2023, 2, day);
        const calc = calculateChronologicalAge('2023-01-31', ref);
        expect(calc?.months).toBe(1);
        expect(calc?.totalDays).toBe(day);
        expect(calc!.totalDays).toBeGreaterThan(prevTotalDays);
        prevTotalDays = calc!.totalDays;
      }
      const mar31 = calculateChronologicalAge('2023-01-31', new Date(2023, 2, 31));
      expect(mar31?.months).toBe(2);
      expect(mar31?.days).toBe(0);
      expect(mar31?.totalDays).toBe(0);
    });

    it('maintains continuous monotonicity for Jan 30 births across March', () => {
      // Non-leap year 2023: Feb has 28 days
      let prevTotalDays = 0;
      for (let day = 1; day <= 29; day++) {
        const ref = new Date(2023, 2, day);
        const calc = calculateChronologicalAge('2023-01-30', ref);
        expect(calc?.months).toBe(1);
        expect(calc?.totalDays).toBe(day);
        expect(calc!.totalDays).toBeGreaterThan(prevTotalDays);
        prevTotalDays = calc!.totalDays;
      }
      const mar30 = calculateChronologicalAge('2023-01-30', new Date(2023, 2, 30));
      expect(mar30?.months).toBe(2);
      expect(mar30?.days).toBe(0);
      expect(mar30?.totalDays).toBe(0);

      const mar31 = calculateChronologicalAge('2023-01-30', new Date(2023, 2, 31));
      expect(mar31?.months).toBe(2);
      expect(mar31?.days).toBe(1);
      expect(mar31?.totalDays).toBe(1);
    });
  });

  describe('Null, empty, and invalid inputs', () => {
    it('returns empty string for null, undefined, or empty string', () => {
      expect(formatLongAge(null)).toBe('');
      expect(formatLongAge(undefined)).toBe('');
      expect(formatLongAge('')).toBe('');
      expect(formatLongAge('   ')).toBe('');
    });

    it('returns empty string for invalid date text', () => {
      expect(formatLongAge('invalid-date')).toBe('');
      expect(formatLongAge('2026-99-99')).toBe('');
    });

    it('handles Date instances directly', () => {
      const dob = new Date(2010, 5, 15);
      const ref = new Date(2020, 5, 15);
      expect(formatLongAge(dob, ref)).toBe('10 yrs');
    });
  });

  describe('formatCompressedLongAge', () => {
    it('formats adults into compressed long format 27Y6M2W1D', () => {
      // 1999-04-01 to 2026-10-16: 27 yrs, 6 mos, 15 days = 2 wks, 1 day
      const ref = new Date(2026, 9, 16); // Oct 16, 2026
      expect(formatCompressedLongAge('1999-04-01', ref)).toBe('27Y6M2W1D');
    });

    it('formats infants into compressed long format 6M2W1D', () => {
      // 2026-04-01 to 2026-10-16: 0 yrs, 6 mos, 15 days = 2 wks, 1 day
      const ref = new Date(2026, 9, 16);
      expect(formatCompressedLongAge('2026-04-01', ref)).toBe('6M2W1D');
    });

    it('formats newborns into compressed days or weeks', () => {
      const ref = new Date(2026, 9, 16);
      expect(formatCompressedLongAge('2026-10-10', ref)).toBe('6D');
      expect(formatCompressedLongAge('2026-10-01', ref)).toBe('2W1D');
    });

    it('returns empty string for missing or invalid dates', () => {
      expect(formatCompressedLongAge(null)).toBe('');
      expect(formatCompressedLongAge(undefined)).toBe('');
      expect(formatCompressedLongAge('')).toBe('');
      expect(formatCompressedLongAge('not-a-date')).toBe('');
    });
  });
});

