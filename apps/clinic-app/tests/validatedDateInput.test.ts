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
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Polyline: 'Polyline',
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

describe('ValidatedDateInput - Pure Masking & Formatting Utilities', () => {
  test('formatDateMask strips all alphabetic and symbol characters', () => {
    expect(formatDateMask('hello world')).toBe('');
    expect(formatDateMask('abc-def')).toBe('');
    expect(formatDateMask('!@#$%^&*()_+')).toBe('');
  });

  test('formatDateMask rejects corrupted text suffix (e.g. 2026-10asaasoalkslak)', () => {
    // Strips letters and retains up to 8 digits
    expect(formatDateMask('2026-10asaasoalkslak')).toBe('2026-10');
    expect(formatDateMask('2026-10-12extraGarbage')).toBe('2026-10-12');
  });

  test('formatDateMask formats digits progressively as YYYY-MM-DD', () => {
    expect(formatDateMask('')).toBe('');
    expect(formatDateMask('2')).toBe('2');
    expect(formatDateMask('20')).toBe('20');
    expect(formatDateMask('202')).toBe('202');
    expect(formatDateMask('2024')).toBe('2024');
    expect(formatDateMask('20240')).toBe('2024-0');
    expect(formatDateMask('202402')).toBe('2024-02');
    expect(formatDateMask('2024022')).toBe('2024-02-2');
    expect(formatDateMask('20240229')).toBe('2024-02-29');
  });

  test('formatDateMask canonicalizes alternate separators (slashes, dots, spaces)', () => {
    expect(formatDateMask('1990/05/15')).toBe('1990-05-15');
    expect(formatDateMask('1990.05.15')).toBe('1990-05-15');
    expect(formatDateMask('1990 05 15')).toBe('1990-05-15');
    expect(formatDateMask('1990-05-15')).toBe('1990-05-15');
  });

  test('formatDateMask truncates at maximum 8 digits', () => {
    expect(formatDateMask('20240229999999')).toBe('2024-02-29');
  });
});

describe('ValidatedDateInput - Gregorian Leap Year Calculation', () => {
  test('regular leap years (divisible by 4, not century)', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(1996)).toBe(true);
    expect(isLeapYear(2020)).toBe(true);
  });

  test('regular non-leap years', () => {
    expect(isLeapYear(2023)).toBe(false);
    expect(isLeapYear(2025)).toBe(false);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(2027)).toBe(false);
  });

  test('century leap years (divisible by 400)', () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2400)).toBe(true);
    expect(isLeapYear(1600)).toBe(true);
  });

  test('century non-leap years (divisible by 100 but not 400)', () => {
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2200)).toBe(false);
    expect(isLeapYear(2300)).toBe(false);
    expect(isLeapYear(1800)).toBe(false);
  });
});

describe('ValidatedDateInput - Days In Month Utility', () => {
  test('returns exact day count for 31-day months', () => {
    const thirtyOneDayMonths = [1, 3, 5, 7, 8, 10, 12];
    for (const m of thirtyOneDayMonths) {
      expect(getDaysInMonth(2026, m)).toBe(31);
    }
  });

  test('returns exact day count for 30-day months', () => {
    const thirtyDayMonths = [4, 6, 9, 11];
    for (const m of thirtyDayMonths) {
      expect(getDaysInMonth(2026, m)).toBe(30);
    }
  });

  test('returns 29 for February in leap years and 28 in non-leap years', () => {
    expect(getDaysInMonth(2024, 2)).toBe(29);
    expect(getDaysInMonth(2026, 2)).toBe(28);
    expect(getDaysInMonth(2000, 2)).toBe(29);
    expect(getDaysInMonth(1900, 2)).toBe(28);
  });

  test('returns 0 for out-of-range month numbers', () => {
    expect(getDaysInMonth(2026, 0)).toBe(0);
    expect(getDaysInMonth(2026, 13)).toBe(0);
    expect(getDaysInMonth(2026, -1)).toBe(0);
  });
});

describe('ValidatedDateInput - validateDateString Calendar Validity', () => {
  test('empty string returns incomplete and invalid without error message', () => {
    const res = validateDateString('');
    expect(res.isValid).toBe(false);
    expect(res.isComplete).toBe(false);
    expect(res.rawDigits).toBe('');
    expect(res.formattedDate).toBe('');
    expect(res.errorMessage).toBeUndefined();
  });

  test('incomplete inputs (<8 digits) report digit count in error', () => {
    const r1 = validateDateString('202');
    expect(r1.isValid).toBe(false);
    expect(r1.isComplete).toBe(false);
    expect(r1.errorMessage).toContain('3/8 digits');

    const r2 = validateDateString('2026-05');
    expect(r2.isValid).toBe(false);
    expect(r2.isComplete).toBe(false);
    expect(r2.errorMessage).toContain('6/8 digits');
  });

  test('validates year range (1900 to 2100)', () => {
    const tooEarly = validateDateString('1899-12-31');
    expect(tooEarly.isValid).toBe(false);
    expect(tooEarly.errorMessage).toBe('Year must be between 1900 and 2100');

    const tooLate = validateDateString('2101-01-01');
    expect(tooLate.isValid).toBe(false);
    expect(tooLate.errorMessage).toBe('Year must be between 1900 and 2100');

    const validLower = validateDateString('1900-01-01');
    expect(validLower.isValid).toBe(true);

    const validUpper = validateDateString('2100-12-31');
    expect(validUpper.isValid).toBe(true);
  });

  test('validates month boundaries (01 to 12)', () => {
    const monthZero = validateDateString('2026-00-15');
    expect(monthZero.isValid).toBe(false);
    expect(monthZero.errorMessage).toBe('Month must be between 01 and 12');

    const monthThirteen = validateDateString('2026-13-01');
    expect(monthThirteen.isValid).toBe(false);
    expect(monthThirteen.errorMessage).toBe('Month must be between 01 and 12');
  });

  test('validates day bounds for 30-day and 31-day months', () => {
    // April 31 does not exist
    const april31 = validateDateString('2026-04-31');
    expect(april31.isValid).toBe(false);
    expect(april31.errorMessage).toBe('Day must be between 01 and 30 for month 04');

    // April 30 is valid
    const april30 = validateDateString('2026-04-30');
    expect(april30.isValid).toBe(true);
    expect(april30.day).toBe(30);

    // Day 0 is invalid
    const dayZero = validateDateString('2026-01-00');
    expect(dayZero.isValid).toBe(false);

    // January 32 does not exist
    const jan32 = validateDateString('2026-01-32');
    expect(jan32.isValid).toBe(false);
    expect(jan32.errorMessage).toBe('Day must be between 01 and 31 for month 01');
  });

  test('leap year day 29 validation for February', () => {
    // 2024 is a leap year -> Feb 29 valid
    const leap2024 = validateDateString('2024-02-29');
    expect(leap2024.isValid).toBe(true);
    expect(leap2024.year).toBe(2024);
    expect(leap2024.month).toBe(2);
    expect(leap2024.day).toBe(29);

    // 2026 is NOT a leap year -> Feb 29 invalid with specific message
    const nonLeap2026 = validateDateString('2026-02-29');
    expect(nonLeap2026.isValid).toBe(false);
    expect(nonLeap2026.errorMessage).toBe('February 2026 has only 28 days (not a leap year)');

    // 2000 is a century leap year -> Feb 29 valid
    const leap2000 = validateDateString('2000-02-29');
    expect(leap2000.isValid).toBe(true);

    // 1900 is a century non-leap year -> Feb 29 invalid
    const nonLeap1900 = validateDateString('1900-02-29');
    expect(nonLeap1900.isValid).toBe(false);
    expect(nonLeap1900.errorMessage).toBe('February 1900 has only 28 days (not a leap year)');
  });
});

describe('ValidatedDateInput - Boundary Modes Enforcement', () => {
  const fixedNow = new Date('2026-10-12T00:00:00Z'); // Reference today: 2026-10-12

  test('boundaryMode: pastOrToday allows today and past dates, rejects future dates', () => {
    // Past date (valid)
    const past = validateDateString('1990-05-15', { boundaryMode: 'pastOrToday', now: fixedNow });
    expect(past.isValid).toBe(true);

    // Today (valid)
    const today = validateDateString('2026-10-12', { boundaryMode: 'pastOrToday', now: fixedNow });
    expect(today.isValid).toBe(true);

    // Tomorrow / future (invalid)
    const future = validateDateString('2026-10-13', { boundaryMode: 'pastOrToday', now: fixedNow });
    expect(future.isValid).toBe(false);
    expect(future.errorMessage).toBe('Future date not permitted (today is 2026-10-12)');

    // Distant future (invalid)
    const distantFuture = validateDateString('2030-01-01', { boundaryMode: 'pastOrToday', now: fixedNow });
    expect(distantFuture.isValid).toBe(false);
    expect(distantFuture.errorMessage).toContain('Future date not permitted');
  });

  test('boundaryMode: futureOrToday allows today and future dates, rejects past dates', () => {
    // Past date (invalid)
    const past = validateDateString('2026-10-11', { boundaryMode: 'futureOrToday', now: fixedNow });
    expect(past.isValid).toBe(false);
    expect(past.errorMessage).toBe('Date must be today or in the future (today is 2026-10-12)');

    // Today (valid)
    const today = validateDateString('2026-10-12', { boundaryMode: 'futureOrToday', now: fixedNow });
    expect(today.isValid).toBe(true);

    // Future date (valid)
    const future = validateDateString('2027-12-31', { boundaryMode: 'futureOrToday', now: fixedNow });
    expect(future.isValid).toBe(true);
  });

  test('boundaryMode: futureOnly allows strictly future dates, rejects today and past', () => {
    // Past date (invalid)
    const past = validateDateString('2026-10-11', { boundaryMode: 'futureOnly', now: fixedNow });
    expect(past.isValid).toBe(false);
    expect(past.errorMessage).toBe('Date must be strictly in the future');

    // Today (invalid)
    const today = validateDateString('2026-10-12', { boundaryMode: 'futureOnly', now: fixedNow });
    expect(today.isValid).toBe(false);
    expect(today.errorMessage).toBe('Date must be strictly in the future');

    // Tomorrow (valid)
    const tomorrow = validateDateString('2026-10-13', { boundaryMode: 'futureOnly', now: fixedNow });
    expect(tomorrow.isValid).toBe(true);
  });

  test('boundaryMode: any allows any valid calendar date past, present, or future', () => {
    expect(validateDateString('1950-01-01', { boundaryMode: 'any', now: fixedNow }).isValid).toBe(true);
    expect(validateDateString('2026-10-12', { boundaryMode: 'any', now: fixedNow }).isValid).toBe(true);
    expect(validateDateString('2099-12-31', { boundaryMode: 'any', now: fixedNow }).isValid).toBe(true);
  });

  test('minDate and maxDate custom boundaries', () => {
    const opts = { minDate: '2020-01-01', maxDate: '2025-12-31', boundaryMode: 'any' as const };

    const beforeMin = validateDateString('2019-12-31', opts);
    expect(beforeMin.isValid).toBe(false);
    expect(beforeMin.errorMessage).toBe('Date cannot be earlier than 2020-01-01');

    const atMin = validateDateString('2020-01-01', opts);
    expect(atMin.isValid).toBe(true);

    const within = validateDateString('2023-06-15', opts);
    expect(within.isValid).toBe(true);

    const atMax = validateDateString('2025-12-31', opts);
    expect(atMax.isValid).toBe(true);

    const afterMax = validateDateString('2026-01-01', opts);
    expect(afterMax.isValid).toBe(false);
    expect(afterMax.errorMessage).toBe('Date cannot be later than 2025-12-31');
  });
});
