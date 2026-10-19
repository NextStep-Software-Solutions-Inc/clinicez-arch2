// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';

(globalThis as any).__DEV__ = true;

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: 'View',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  Text: 'Text',
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
  Switch: 'Switch',
  TouchableOpacity: 'TouchableOpacity',
  TouchableHighlight: 'TouchableHighlight',
  Image: 'Image',
  RefreshControl: 'RefreshControl',
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: 'Animated.View',
    Text: 'Animated.Text',
  },
  Alert: { alert: () => {} },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  processColor: (c: any) => c,
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  default: 'Svg',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const {
  formatDateMask,
  isLeapYear,
  getDaysInMonth,
  validateDateString,
} = await import('../components/ui/ValidatedDateInput');

describe('Adversarial Stress Test: ValidatedDateInput (Milestone M2)', () => {
  // =========================================================================
  // 1. GREGORIAN LEAP YEAR RULES & CENTURY BOUNDARIES
  // =========================================================================
  describe('1. Leap Years & Century Boundaries', () => {
    test('standard leap years (divisible by 4, not century) return true', () => {
      const leapYears = [1904, 1996, 2004, 2020, 2024, 2028, 2032, 2096];
      for (const y of leapYears) {
        expect(isLeapYear(y)).toBe(true);
        expect(getDaysInMonth(y, 2)).toBe(29);
        const res = validateDateString(`${y}-02-29`);
        expect(res.isValid).toBe(true);
        expect(res.year).toBe(y);
        expect(res.month).toBe(2);
        expect(res.day).toBe(29);
      }
    });

    test('century years divisible by 400 are leap years', () => {
      const centuryLeaps = [1600, 2000, 2400];
      for (const y of centuryLeaps) {
        expect(isLeapYear(y)).toBe(true);
        expect(getDaysInMonth(y, 2)).toBe(29);
      }
      // 2000 is within 1900-2100 allowed range
      const res2000 = validateDateString('2000-02-29');
      expect(res2000.isValid).toBe(true);
      expect(res2000.day).toBe(29);
    });

    test('century years divisible by 100 but not 400 are non-leap years', () => {
      const centuryNonLeaps = [1700, 1800, 1900, 2100, 2200, 2300];
      for (const y of centuryNonLeaps) {
        expect(isLeapYear(y)).toBe(false);
        expect(getDaysInMonth(y, 2)).toBe(28);
      }
      // 1900 and 2100 are within 1900-2100 range and must explicitly reject Feb 29
      const res1900 = validateDateString('1900-02-29');
      expect(res1900.isValid).toBe(false);
      expect(res1900.errorMessage).toBe('February 1900 has only 28 days (not a leap year)');

      const res2100 = validateDateString('2100-02-29');
      expect(res2100.isValid).toBe(false);
      expect(res2100.errorMessage).toBe('February 2100 has only 28 days (not a leap year)');
    });

    test('standard non-leap years reject Feb 29 with specific message', () => {
      const nonLeaps = [2021, 2022, 2023, 2025, 2026, 2027, 2029, 2030];
      for (const y of nonLeaps) {
        expect(isLeapYear(y)).toBe(false);
        expect(getDaysInMonth(y, 2)).toBe(28);
        const res = validateDateString(`${y}-02-29`);
        expect(res.isValid).toBe(false);
        expect(res.errorMessage).toBe(`February ${y} has only 28 days (not a leap year)`);
      }
    });

    test('year limits (1900 to 2100 boundary)', () => {
      expect(validateDateString('1900-01-01').isValid).toBe(true);
      expect(validateDateString('2100-12-31').isValid).toBe(true);
      expect(validateDateString('1899-12-31').isValid).toBe(false);
      expect(validateDateString('2101-01-01').isValid).toBe(false);
    });
  });

  // =========================================================================
  // 2. SHORT MONTH LIMITS & CALENDAR DAY CONSTRAINTS
  // =========================================================================
  describe('2. Short Month Day Limits & Boundary Day Counts', () => {
    test('30-day months strictly reject day 31 (Apr, Jun, Sep, Nov)', () => {
      const shortMonths = [
        { month: '04', name: 'April', num: 4 },
        { month: '06', name: 'June', num: 6 },
        { month: '09', name: 'September', num: 9 },
        { month: '11', name: 'November', num: 11 },
      ];

      for (const m of shortMonths) {
        expect(getDaysInMonth(2026, m.num)).toBe(30);

        // Day 30 is valid
        const valid30 = validateDateString(`2026-${m.month}-30`);
        expect(valid30.isValid).toBe(true);
        expect(valid30.day).toBe(30);

        // Day 31 does not exist
        const invalid31 = validateDateString(`2026-${m.month}-31`);
        expect(invalid31.isValid).toBe(false);
        expect(invalid31.errorMessage).toBe(`Day must be between 01 and 30 for month ${m.month}`);
      }
    });

    test('February rejects day 30 and day 31 regardless of leap year', () => {
      // Leap year 2024
      const leap30 = validateDateString('2024-02-30');
      expect(leap30.isValid).toBe(false);
      expect(leap30.errorMessage).toBe('Day must be between 01 and 29 for month 02');

      const leap31 = validateDateString('2024-02-31');
      expect(leap31.isValid).toBe(false);
      expect(leap31.errorMessage).toBe('Day must be between 01 and 29 for month 02');

      // Non-leap year 2026
      const nonLeap30 = validateDateString('2026-02-30');
      expect(nonLeap30.isValid).toBe(false);
      expect(nonLeap30.errorMessage).toBe('Day must be between 01 and 28 for month 02');

      const nonLeap31 = validateDateString('2026-02-31');
      expect(nonLeap31.isValid).toBe(false);
      expect(nonLeap31.errorMessage).toBe('Day must be between 01 and 28 for month 02');
    });

    test('day bounds: day 00 and day > 31 are universally rejected across all months', () => {
      for (let m = 1; m <= 12; m++) {
        const mStr = String(m).padStart(2, '0');
        const zeroDay = validateDateString(`2026-${mStr}-00`);
        expect(zeroDay.isValid).toBe(false);

        const thirtyTwoDay = validateDateString(`2026-${mStr}-32`);
        expect(thirtyTwoDay.isValid).toBe(false);
      }
    });

    test('month bounds: 00 and >12 are rejected', () => {
      expect(validateDateString('2026-00-15').isValid).toBe(false);
      expect(validateDateString('2026-13-01').isValid).toBe(false);
      expect(validateDateString('2026-99-20').isValid).toBe(false);
    });
  });

  // =========================================================================
  // 3. CORRUPTED NON-NUMERIC TEXT & INJECTIONS
  // =========================================================================
  describe('3. Non-Numeric and Corrupted Text Injection', () => {
    test('formatDateMask strips corrupted text suffix (e.g. 2026-10asaasoalkslak)', () => {
      expect(formatDateMask('2026-10asaasoalkslak')).toBe('2026-10');
      const val = validateDateString('2026-10asaasoalkslak');
      expect(val.isValid).toBe(false);
      expect(val.isComplete).toBe(false);
      expect(val.rawDigits).toBe('202610');
      expect(val.formattedDate).toBe('2026-10');
      expect(val.errorMessage).toBe('Incomplete date (6/8 digits: YYYY-MM-DD)');
    });

    test('formatDateMask handles punctuation, whitespace, and alternate separators', () => {
      expect(formatDateMask('  2026 / 10 / 12  ')).toBe('2026-10-12');
      expect(formatDateMask('2026.10.12')).toBe('2026-10-12');
      expect(formatDateMask('2026 10 12')).toBe('2026-10-12');
      expect(formatDateMask('2026-10-12')).toBe('2026-10-12');
      expect(formatDateMask('2026_10_12')).toBe('2026-10-12');
    });

    test('formatDateMask strips injection payloads and special characters', () => {
      expect(formatDateMask("<script>alert('xss')</script>20261012")).toBe('2026-10-12');
      expect(formatDateMask("2026' OR '1'='1 -- 1012")).toBe('2026-11-10');
      expect(formatDateMask('2026-10-12; DROP TABLE Patients;')).toBe('2026-10-12');
    });

    test('handles extreme input lengths by truncating at 8 digits', () => {
      const veryLong = '20261012' + '9'.repeat(1000);
      expect(formatDateMask(veryLong)).toBe('2026-10-12');
      expect(validateDateString(veryLong).isValid).toBe(true);
    });

    test('handles empty, null, undefined, or purely alphabetic inputs', () => {
      expect(formatDateMask('')).toBe('');
      expect(formatDateMask('     ')).toBe('');
      expect(formatDateMask('purely alphabetic characters')).toBe('');
      expect(formatDateMask('!@#$%^&*()')).toBe('');

      expect(validateDateString('').isValid).toBe(false);
      expect(validateDateString('no digits').isValid).toBe(false);
    });
  });

  // =========================================================================
  // 4. BOUNDARY ENFORCEMENT MODES & CUSTOM RANGES
  // =========================================================================
  describe('4. Boundary Modes Enforcement', () => {
    const fixedNow = new Date('2026-10-12T00:00:00Z'); // 2026-10-12

    test('boundaryMode: pastOrToday rejects tomorrow and future, permits today and past', () => {
      // Past
      expect(validateDateString('1985-04-12', { boundaryMode: 'pastOrToday', now: fixedNow }).isValid).toBe(true);
      expect(validateDateString('2026-10-11', { boundaryMode: 'pastOrToday', now: fixedNow }).isValid).toBe(true);

      // Today
      expect(validateDateString('2026-10-12', { boundaryMode: 'pastOrToday', now: fixedNow }).isValid).toBe(true);

      // Tomorrow
      const tomorrow = validateDateString('2026-10-13', { boundaryMode: 'pastOrToday', now: fixedNow });
      expect(tomorrow.isValid).toBe(false);
      expect(tomorrow.errorMessage).toBe('Future date not permitted (today is 2026-10-12)');

      // Distant future
      const distant = validateDateString('2099-12-31', { boundaryMode: 'pastOrToday', now: fixedNow });
      expect(distant.isValid).toBe(false);
      expect(distant.errorMessage).toBe('Future date not permitted (today is 2026-10-12)');
    });

    test('boundaryMode: futureOrToday permits today and future, rejects past', () => {
      // Past
      const past = validateDateString('2026-10-11', { boundaryMode: 'futureOrToday', now: fixedNow });
      expect(past.isValid).toBe(false);
      expect(past.errorMessage).toBe('Date must be today or in the future (today is 2026-10-12)');

      // Today
      expect(validateDateString('2026-10-12', { boundaryMode: 'futureOrToday', now: fixedNow }).isValid).toBe(true);

      // Future
      expect(validateDateString('2026-10-13', { boundaryMode: 'futureOrToday', now: fixedNow }).isValid).toBe(true);
      expect(validateDateString('2030-01-01', { boundaryMode: 'futureOrToday', now: fixedNow }).isValid).toBe(true);
    });

    test('boundaryMode: futureOnly rejects today and past, permits strictly future', () => {
      // Past
      expect(validateDateString('2026-10-11', { boundaryMode: 'futureOnly', now: fixedNow }).isValid).toBe(false);

      // Today
      const today = validateDateString('2026-10-12', { boundaryMode: 'futureOnly', now: fixedNow });
      expect(today.isValid).toBe(false);
      expect(today.errorMessage).toBe('Date must be strictly in the future');

      // Tomorrow
      expect(validateDateString('2026-10-13', { boundaryMode: 'futureOnly', now: fixedNow }).isValid).toBe(true);
    });

    test('boundaryMode: any allows any valid date in 1900-2100', () => {
      expect(validateDateString('1900-01-01', { boundaryMode: 'any', now: fixedNow }).isValid).toBe(true);
      expect(validateDateString('2026-10-12', { boundaryMode: 'any', now: fixedNow }).isValid).toBe(true);
      expect(validateDateString('2099-12-31', { boundaryMode: 'any', now: fixedNow }).isValid).toBe(true);
    });

    test('minDate and maxDate strict range constraints', () => {
      const opts = { minDate: '2026-01-01', maxDate: '2026-12-31', boundaryMode: 'any' as const };
      expect(validateDateString('2025-12-31', opts).isValid).toBe(false);
      expect(validateDateString('2025-12-31', opts).errorMessage).toBe('Date cannot be earlier than 2026-01-01');

      expect(validateDateString('2026-01-01', opts).isValid).toBe(true);
      expect(validateDateString('2026-06-15', opts).isValid).toBe(true);
      expect(validateDateString('2026-12-31', opts).isValid).toBe(true);

      expect(validateDateString('2027-01-01', opts).isValid).toBe(false);
      expect(validateDateString('2027-01-01', opts).errorMessage).toBe('Date cannot be later than 2026-12-31');
    });
  });

  // =========================================================================
  // 5. TIMEZONE INVARIANCE & BEHAVIOR UNDER UTC+8
  // =========================================================================
  describe('5. Timezone Invariance & Reference Date Evaluations', () => {
    test('UTC explicit ISO reference date evaluates correctly at UTC midnight', () => {
      const utcRef = new Date('2026-10-12T00:00:00Z');
      const resToday = validateDateString('2026-10-12', { boundaryMode: 'pastOrToday', now: utcRef });
      expect(resToday.isValid).toBe(true);

      const resTomorrow = validateDateString('2026-10-13', { boundaryMode: 'pastOrToday', now: utcRef });
      expect(resTomorrow.isValid).toBe(false);
    });

    test('timezone invariance: ensuring comparisons against reference date do not shift by 1 day in UTC+8', () => {
      // In Manila (UTC+8), 06:00 AM on 2026-10-12 is local calendar day October 12, 2026.
      const manilaMorning = new Date('2026-10-12T06:00:00+08:00');
      
      // Expected behavior: today's date in Manila (2026-10-12) MUST be valid under pastOrToday
      const res = validateDateString('2026-10-12', { boundaryMode: 'pastOrToday', now: manilaMorning });
      expect(res.isValid).toBe(true);
      expect(res.errorMessage).toBeUndefined();
    });

    test('demonstrates UTC+8 afternoon timestamp (past 08:00 AM Manila) evaluates to current calendar day', () => {
      // In Manila (UTC+8), 10:00 AM on 2026-10-12 corresponds to 2026-10-12T02:00:00.000Z in UTC.
      const manilaAfternoon = new Date('2026-10-12T10:00:00+08:00');
      const res = validateDateString('2026-10-12', { boundaryMode: 'pastOrToday', now: manilaAfternoon });
      expect(res.isValid).toBe(true);
    });

    test('empirical 24-hour cycle sweep in UTC+8 mapping full day invariance with zero failure window', () => {
      const results: { hour: number; todayStrEvaluated: string; isValidToday: boolean }[] = [];

      for (let hour = 0; hour < 24; hour++) {
        const hStr = String(hour).padStart(2, '0');
        const refDate = new Date(`2026-10-12T${hStr}:30:00+08:00`);
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(refDate);
        const res = validateDateString('2026-10-12', { boundaryMode: 'pastOrToday', now: refDate });
        results.push({ hour, todayStrEvaluated: todayStr, isValidToday: res.isValid });
      }

      // All 24 hours in Manila evaluate consistently to today ("2026-10-12") and pass
      for (let h = 0; h < 24; h++) {
        expect(results[h].todayStrEvaluated).toBe('2026-10-12');
        expect(results[h].isValidToday).toBe(true);
      }
    });
  });

  // =========================================================================
  // 6. PROPERTY-BASED FUZZING & INVARIANT GENERATOR
  // =========================================================================
  describe('6. Property-Based Invariant Fuzzing Harness', () => {
    test('fuzzes 500 randomized corrupted strings ensuring invariant masking safety', () => {
      const charPool = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()_+-=[]{}|;:",.<>?/ ~`\t\n';
      
      for (let i = 0; i < 500; i++) {
        const len = Math.floor(Math.random() * 50) + 1;
        let randomStr = '';
        for (let j = 0; j < len; j++) {
          randomStr += charPool[Math.floor(Math.random() * charPool.length)];
        }

        const masked = formatDateMask(randomStr);
        expect(masked.length).toBeLessThanOrEqual(10);
        expect(/^[0-9-]*$/.test(masked)).toBe(true);

        const val = validateDateString(randomStr);
        expect(typeof val.isValid).toBe('boolean');
        expect(typeof val.isComplete).toBe('boolean');

        if (val.isValid) {
          expect(val.isComplete).toBe(true);
          expect(val.year).toBeGreaterThanOrEqual(1900);
          expect(val.year).toBeLessThanOrEqual(2100);
          expect(val.month).toBeGreaterThanOrEqual(1);
          expect(val.month).toBeLessThanOrEqual(12);
          expect(val.day).toBeGreaterThanOrEqual(1);
          expect(val.day).toBeLessThanOrEqual(getDaysInMonth(val.year!, val.month!));
          expect(/^\d{4}-\d{2}-\d{2}$/.test(val.formattedDate)).toBe(true);
          expect(val.errorMessage).toBeUndefined();
        }
      }
    });

    test('fuzzes 1000 valid calendar dates across 1900 to 2100 guaranteeing zero false negatives', () => {
      for (let i = 0; i < 1000; i++) {
        const year = Math.floor(Math.random() * (2100 - 1900 + 1)) + 1900;
        const month = Math.floor(Math.random() * 12) + 1;
        const maxDays = getDaysInMonth(year, month);
        const day = Math.floor(Math.random() * maxDays) + 1;

        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const res = validateDateString(dateStr, { boundaryMode: 'any' });
        expect(res.isValid).toBe(true);
        expect(res.isComplete).toBe(true);
        expect(res.year).toBe(year);
        expect(res.month).toBe(month);
        expect(res.day).toBe(day);
        expect(res.errorMessage).toBeUndefined();
      }
    });
  });

  // =========================================================================
  // 7. CRASH RESILIENCE & ADVERSARIAL EDGE CASES
  // =========================================================================
  describe('7. Crash Resilience & Edge Cases', () => {
    test('handles null and undefined gracefully without unhandled exceptions', () => {
      expect(formatDateMask(null as any)).toBe('');
      expect(formatDateMask(undefined as any)).toBe('');
      expect(validateDateString(null as any).isValid).toBe(false);
      expect(validateDateString(undefined as any).isValid).toBe(false);
    });

    test('handles boundary calendar years 1900 and 2100 start and end dates', () => {
      expect(validateDateString('1900-01-01', { boundaryMode: 'any' }).isValid).toBe(true);
      expect(validateDateString('1900-12-31', { boundaryMode: 'any' }).isValid).toBe(true);
      expect(validateDateString('2100-01-01', { boundaryMode: 'any' }).isValid).toBe(true);
      expect(validateDateString('2100-12-31', { boundaryMode: 'any' }).isValid).toBe(true);
    });

    test('handles invalid Date in options.now safely without throwing RangeError', () => {
      expect(() => {
        validateDateString('2026-10-12', { now: new Date(NaN) });
      }).not.toThrow();
      const res = validateDateString('2026-10-12', { now: new Date(NaN) });
      expect(res).toBeDefined();
    });
  });
});
