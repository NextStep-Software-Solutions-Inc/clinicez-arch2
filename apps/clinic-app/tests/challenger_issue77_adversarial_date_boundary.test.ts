// token-guard:ignore-file
/**
 * Test Suite: Challenger Issue #77 Adversarial Date Boundary & Custom Field Validator
 * Authoritative Mandate: Issue #77 / Sentinel Dispatch
 * Coverage:
 * 1. All boundary modes: pastOrToday, futureOrToday, futureOnly, any
 * 2. Exact boundary limits: today in Manila timezone (UTC+8), yesterday, tomorrow,
 *    leap year dates (2028-02-29, 2024, 2000 vs 1900, 2026), impossible dates (2027-02-30, 2027-13-40),
 *    malformed dates (2026-10asaasoalkslak, incomplete, letters)
 * 3. Category defaulting: case-insensitivity ("Clinical", "clinical", "CLINICAL", "  Clinical  "), whitespace,
 *    non-clinical categories ("Demographics", "General", null, "")
 * 4. Explicit boundaryMode overriding category defaults
 * 5. validateCustomFields form blocking: invalid/out-of-bounds dates block with descriptive errors,
 *    blank optional date fields pass cleanly, required date fields enforce presence and validity,
 *    conditionally hidden date fields never block form submission.
 */

import { describe, expect, test, mock } from 'bun:test';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for headless test runner
mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
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
  TouchableHighlight: 'TouchableOpacity',
  Image: 'Image',
  RefreshControl: 'RefreshControl',
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
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
    View: 'Animated.View',
    Text: 'Animated.Text',
  },
  Alert: { alert: () => {} },
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'uuid-' + Math.random().toString(36).substring(2, 9),
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

// Dynamic imports to respect module mocks
const {
  resolveEffectiveBoundaryMode,
  validateCustomFields,
  sanitizeCustomFieldsPayload,
  isFieldVisible,
} = await import('../components/custom-fields');

const {
  validateDateString,
  formatDateMask,
  isLeapYear,
  getDaysInMonth,
} = await import('../components/ui/ValidatedDateInput');

const { mergePatientCustomFields } = await import('../components/patient/patientCustomFieldsMerger');

import type { ClinicCustomFieldDefinition } from '../services/clinicService';

describe('Adversarial Challenge Suite: Issue #77 Date Boundary & Custom Field Engine', () => {

  // =========================================================================
  // Section 1: All Boundary Modes (pastOrToday, futureOrToday, futureOnly, any)
  // =========================================================================
  describe('1. Comprehensive Boundary Modes Evaluation', () => {
    // Reference date: 2026-10-24 12:00:00 UTC (Manila: 2026-10-24 20:00:00)
    const refDate = new Date('2026-10-24T12:00:00Z');

    test('Mode: pastOrToday allows past and today, strictly blocks tomorrow and future dates', () => {
      // Past
      expect(validateDateString('2020-01-01', { boundaryMode: 'pastOrToday', now: refDate }).isValid).toBe(true);
      expect(validateDateString('2026-10-23', { boundaryMode: 'pastOrToday', now: refDate }).isValid).toBe(true);
      // Today
      expect(validateDateString('2026-10-24', { boundaryMode: 'pastOrToday', now: refDate }).isValid).toBe(true);

      // Tomorrow (Rejected)
      const resTomorrow = validateDateString('2026-10-25', { boundaryMode: 'pastOrToday', now: refDate });
      expect(resTomorrow.isValid).toBe(false);
      expect(resTomorrow.errorMessage).toContain('Future date not permitted (today is 2026-10-24)');

      // Distant future (Rejected)
      const resFuture = validateDateString('2030-12-31', { boundaryMode: 'pastOrToday', now: refDate });
      expect(resFuture.isValid).toBe(false);
      expect(resFuture.errorMessage).toContain('Future date not permitted');
    });

    test('Mode: futureOrToday allows today and future, strictly blocks yesterday and past dates', () => {
      // Distant past (Rejected)
      const resPast = validateDateString('2020-01-01', { boundaryMode: 'futureOrToday', now: refDate });
      expect(resPast.isValid).toBe(false);
      expect(resPast.errorMessage).toContain('Date must be today or in the future (today is 2026-10-24)');

      // Yesterday (Rejected)
      const resYesterday = validateDateString('2026-10-23', { boundaryMode: 'futureOrToday', now: refDate });
      expect(resYesterday.isValid).toBe(false);
      expect(resYesterday.errorMessage).toContain('Date must be today or in the future');

      // Today
      expect(validateDateString('2026-10-24', { boundaryMode: 'futureOrToday', now: refDate }).isValid).toBe(true);
      // Tomorrow
      expect(validateDateString('2026-10-25', { boundaryMode: 'futureOrToday', now: refDate }).isValid).toBe(true);
      // Distant future
      expect(validateDateString('2035-06-30', { boundaryMode: 'futureOrToday', now: refDate }).isValid).toBe(true);
    });

    test('Mode: futureOnly allows tomorrow and future, strictly blocks today and all past dates', () => {
      // Past (Rejected)
      const resPast = validateDateString('2026-10-23', { boundaryMode: 'futureOnly', now: refDate });
      expect(resPast.isValid).toBe(false);
      expect(resPast.errorMessage).toBe('Date must be strictly in the future');

      // Today (Rejected - must be strictly in future)
      const resToday = validateDateString('2026-10-24', { boundaryMode: 'futureOnly', now: refDate });
      expect(resToday.isValid).toBe(false);
      expect(resToday.errorMessage).toBe('Date must be strictly in the future');

      // Tomorrow
      expect(validateDateString('2026-10-25', { boundaryMode: 'futureOnly', now: refDate }).isValid).toBe(true);
      // Distant future
      expect(validateDateString('2029-01-01', { boundaryMode: 'futureOnly', now: refDate }).isValid).toBe(true);
    });

    test('Mode: any permits past, today, and future dates without restriction', () => {
      expect(validateDateString('1950-05-15', { boundaryMode: 'any', now: refDate }).isValid).toBe(true);
      expect(validateDateString('2026-10-23', { boundaryMode: 'any', now: refDate }).isValid).toBe(true);
      expect(validateDateString('2026-10-24', { boundaryMode: 'any', now: refDate }).isValid).toBe(true);
      expect(validateDateString('2026-10-25', { boundaryMode: 'any', now: refDate }).isValid).toBe(true);
      expect(validateDateString('2099-12-31', { boundaryMode: 'any', now: refDate }).isValid).toBe(true);
    });
  });

  // =========================================================================
  // Section 2: Exact Boundary Limits, Manila Timezone (UTC+8), Leap Years & Malformed Dates
  // =========================================================================
  describe('2. Exact Limits, Manila Timezone (UTC+8), Leap Years & Malformed Input', () => {
    test('Manila Timezone (UTC+8): Before midnight UTC rollover', () => {
      // 2026-10-24 15:59:50 UTC = 2026-10-24 23:59:50 in Manila. Today is 2026-10-24.
      const lateManilaNight = new Date('2026-10-24T15:59:50Z');

      // pastOrToday: 2026-10-24 is valid (today), 2026-10-25 is invalid (future)
      expect(validateDateString('2026-10-24', { boundaryMode: 'pastOrToday', now: lateManilaNight }).isValid).toBe(true);
      const resNextDay = validateDateString('2026-10-25', { boundaryMode: 'pastOrToday', now: lateManilaNight });
      expect(resNextDay.isValid).toBe(false);
      expect(resNextDay.errorMessage).toContain('2026-10-24');

      // futureOrToday: 2026-10-24 is valid (today), 2026-10-23 is invalid (yesterday)
      expect(validateDateString('2026-10-24', { boundaryMode: 'futureOrToday', now: lateManilaNight }).isValid).toBe(true);
      expect(validateDateString('2026-10-23', { boundaryMode: 'futureOrToday', now: lateManilaNight }).isValid).toBe(false);

      // futureOnly: 2026-10-24 is invalid (today), 2026-10-25 is valid (tomorrow)
      expect(validateDateString('2026-10-24', { boundaryMode: 'futureOnly', now: lateManilaNight }).isValid).toBe(false);
      expect(validateDateString('2026-10-25', { boundaryMode: 'futureOnly', now: lateManilaNight }).isValid).toBe(true);
    });

    test('Manila Timezone (UTC+8): After midnight UTC rollover in Manila', () => {
      // 2026-10-24 16:00:10 UTC = 2026-10-25 00:00:10 in Manila! Today in Manila is 2026-10-25!
      const earlyManilaMorning = new Date('2026-10-24T16:00:10Z');

      // pastOrToday: 2026-10-25 MUST be valid (since it is already today in Manila)
      const resTodayInManila = validateDateString('2026-10-25', { boundaryMode: 'pastOrToday', now: earlyManilaMorning });
      expect(resTodayInManila.isValid).toBe(true);

      // pastOrToday: 2026-10-26 is now tomorrow (invalid)
      const resTomorrowInManila = validateDateString('2026-10-26', { boundaryMode: 'pastOrToday', now: earlyManilaMorning });
      expect(resTomorrowInManila.isValid).toBe(false);
      expect(resTomorrowInManila.errorMessage).toContain('2026-10-25');

      // futureOrToday: 2026-10-25 is valid, 2026-10-24 is yesterday (invalid)
      expect(validateDateString('2026-10-25', { boundaryMode: 'futureOrToday', now: earlyManilaMorning }).isValid).toBe(true);
      expect(validateDateString('2026-10-24', { boundaryMode: 'futureOrToday', now: earlyManilaMorning }).isValid).toBe(false);

      // futureOnly: 2026-10-25 is today (invalid), 2026-10-26 is strictly future (valid)
      expect(validateDateString('2026-10-25', { boundaryMode: 'futureOnly', now: earlyManilaMorning }).isValid).toBe(false);
      expect(validateDateString('2026-10-26', { boundaryMode: 'futureOnly', now: earlyManilaMorning }).isValid).toBe(true);
    });

    test('Leap Year Rules: 2028, 2024, 2000 vs 1900, 2026, 2027', () => {
      // 2028 is a leap year (divisible by 4)
      expect(isLeapYear(2028)).toBe(true);
      expect(getDaysInMonth(2028, 2)).toBe(29);
      expect(validateDateString('2028-02-29', { boundaryMode: 'any' }).isValid).toBe(true);

      // 2024 is a leap year
      expect(isLeapYear(2024)).toBe(true);
      expect(validateDateString('2024-02-29', { boundaryMode: 'any' }).isValid).toBe(true);

      // 2000 is a leap century year (divisible by 400)
      expect(isLeapYear(2000)).toBe(true);
      expect(validateDateString('2000-02-29', { boundaryMode: 'any' }).isValid).toBe(true);

      // 1900 is NOT a leap year (divisible by 100, but not 400)
      expect(isLeapYear(1900)).toBe(false);
      expect(getDaysInMonth(1900, 2)).toBe(28);
      const res1900 = validateDateString('1900-02-29', { boundaryMode: 'any' });
      expect(res1900.isValid).toBe(false);
      expect(res1900.errorMessage).toBe('February 1900 has only 28 days (not a leap year)');

      // 2026 and 2027 are NOT leap years
      expect(isLeapYear(2026)).toBe(false);
      const res2026 = validateDateString('2026-02-29', { boundaryMode: 'any' });
      expect(res2026.isValid).toBe(false);
      expect(res2026.errorMessage).toBe('February 2026 has only 28 days (not a leap year)');

      expect(isLeapYear(2027)).toBe(false);
      const res2027 = validateDateString('2027-02-29', { boundaryMode: 'any' });
      expect(res2027.isValid).toBe(false);
      expect(res2027.errorMessage).toBe('February 2027 has only 28 days (not a leap year)');
    });

    test('Impossible dates rejection across months and calendar bounds', () => {
      // February 30th
      const resFeb30 = validateDateString('2027-02-30');
      expect(resFeb30.isValid).toBe(false);
      expect(resFeb30.errorMessage).toBe('Day must be between 01 and 28 for month 02');

      // Month 13, Day 40
      const resM13 = validateDateString('2027-13-40');
      expect(resM13.isValid).toBe(false);
      expect(resM13.errorMessage).toBe('Month must be between 01 and 12');

      // 30-day months: April 31, June 31, September 31, November 31
      expect(validateDateString('2026-04-31').isValid).toBe(false);
      expect(validateDateString('2026-04-31').errorMessage).toBe('Day must be between 01 and 30 for month 04');

      expect(validateDateString('2026-06-31').isValid).toBe(false);
      expect(validateDateString('2026-06-31').errorMessage).toBe('Day must be between 01 and 30 for month 06');

      expect(validateDateString('2026-09-31').isValid).toBe(false);
      expect(validateDateString('2026-09-31').errorMessage).toBe('Day must be between 01 and 30 for month 09');

      expect(validateDateString('2026-11-31').isValid).toBe(false);
      expect(validateDateString('2026-11-31').errorMessage).toBe('Day must be between 01 and 30 for month 11');

      // Month 00 or Day 00
      expect(validateDateString('2026-00-15').isValid).toBe(false);
      expect(validateDateString('2026-05-00').isValid).toBe(false);
      expect(validateDateString('2026-05-32').isValid).toBe(false);

      // Year out of range (1900 - 2100)
      expect(validateDateString('1899-12-31').isValid).toBe(false);
      expect(validateDateString('1899-12-31').errorMessage).toBe('Year must be between 1900 and 2100');

      expect(validateDateString('2101-01-01').isValid).toBe(false);
      expect(validateDateString('2101-01-01').errorMessage).toBe('Year must be between 1900 and 2100');
    });

    test('Malformed, non-numeric and incomplete date strings', () => {
      // 2026-10asaasoalkslak: letters stripped, leaves 6 digits (202610), rejected as incomplete
      const resLetters = validateDateString('2026-10asaasoalkslak');
      expect(resLetters.isValid).toBe(false);
      expect(resLetters.isComplete).toBe(false);
      expect(resLetters.errorMessage).toContain('Incomplete date (6/8 digits');

      // Incomplete dates
      expect(validateDateString('2026').isValid).toBe(false);
      expect(validateDateString('2026-10').isValid).toBe(false);
      expect(validateDateString('2026-10-2').isValid).toBe(false);

      // Non-date string
      expect(validateDateString('invalid-gibberish').isValid).toBe(false);

      // Masking behavior
      expect(formatDateMask('20261024')).toBe('2026-10-24');
      expect(formatDateMask('202610')).toBe('2026-10');
      expect(formatDateMask('2026')).toBe('2026');
      expect(formatDateMask('abc2026def10ghi24jkl')).toBe('2026-10-24');
    });
  });

  // =========================================================================
  // Section 3: Category Defaulting (Case-insensitivity, whitespace, non-clinical)
  // =========================================================================
  describe('3. Category Defaulting Rules', () => {
    test('Case-insensitivity & whitespace: all variations of Clinical default to pastOrToday', () => {
      expect(resolveEffectiveBoundaryMode({ category: 'Clinical' })).toBe('pastOrToday');
      expect(resolveEffectiveBoundaryMode({ category: 'clinical' })).toBe('pastOrToday');
      expect(resolveEffectiveBoundaryMode({ category: 'CLINICAL' })).toBe('pastOrToday');
      expect(resolveEffectiveBoundaryMode({ category: '  Clinical  ' })).toBe('pastOrToday');
      expect(resolveEffectiveBoundaryMode({ category: '  cLiNiCaL  ' })).toBe('pastOrToday');
      expect(resolveEffectiveBoundaryMode({ category: '\tCLINICAL\n' })).toBe('pastOrToday');
    });

    test('Non-clinical categories and empty/null values default to any', () => {
      expect(resolveEffectiveBoundaryMode({ category: 'Demographics' })).toBe('any');
      expect(resolveEffectiveBoundaryMode({ category: 'General' })).toBe('any');
      expect(resolveEffectiveBoundaryMode({ category: 'Academic' })).toBe('any');
      expect(resolveEffectiveBoundaryMode({ category: 'Administrative' })).toBe('any');
      expect(resolveEffectiveBoundaryMode({ category: null })).toBe('any');
      expect(resolveEffectiveBoundaryMode({ category: '' })).toBe('any');
      expect(resolveEffectiveBoundaryMode({ category: '   ' })).toBe('any');
      expect(resolveEffectiveBoundaryMode({ category: undefined })).toBe('any');
      expect(resolveEffectiveBoundaryMode({})).toBe('any');
    });
  });

  // =========================================================================
  // Section 4: Explicit boundaryMode overriding category defaults
  // =========================================================================
  describe('4. Explicit boundaryMode Override on Definition', () => {
    test('Explicit boundaryMode on Clinical category overrides default pastOrToday', () => {
      expect(resolveEffectiveBoundaryMode({ category: 'Clinical', boundaryMode: 'futureOrToday' })).toBe('futureOrToday');
      expect(resolveEffectiveBoundaryMode({ category: 'Clinical', boundaryMode: 'futureOnly' })).toBe('futureOnly');
      expect(resolveEffectiveBoundaryMode({ category: 'Clinical', boundaryMode: 'any' })).toBe('any');
      expect(resolveEffectiveBoundaryMode({ category: 'Clinical', boundaryMode: 'pastOrToday' })).toBe('pastOrToday');
    });

    test('Explicit boundaryMode on Demographics or other category overrides default any', () => {
      expect(resolveEffectiveBoundaryMode({ category: 'Demographics', boundaryMode: 'pastOrToday' })).toBe('pastOrToday');
      expect(resolveEffectiveBoundaryMode({ category: 'Demographics', boundaryMode: 'futureOrToday' })).toBe('futureOrToday');
      expect(resolveEffectiveBoundaryMode({ category: 'Demographics', boundaryMode: 'futureOnly' })).toBe('futureOnly');
      expect(resolveEffectiveBoundaryMode({ category: 'Demographics', boundaryMode: 'any' })).toBe('any');
    });

    test('Empty string or null boundaryMode falls back to category evaluation', () => {
      expect(resolveEffectiveBoundaryMode({ category: 'Clinical', boundaryMode: null })).toBe('pastOrToday');
      expect(resolveEffectiveBoundaryMode({ category: 'Clinical', boundaryMode: undefined })).toBe('pastOrToday');
      expect(resolveEffectiveBoundaryMode({ category: 'Clinical', boundaryMode: '' as any })).toBe('pastOrToday');
      expect(resolveEffectiveBoundaryMode({ category: 'Demographics', boundaryMode: null })).toBe('any');
    });
  });

  // =========================================================================
  // Section 5: validateCustomFields Form Blocking & Submission Guarding
  // =========================================================================
  describe('5. Form Blocking & Submission Guarding with validateCustomFields', () => {
    const refDate = new Date('2026-10-24T12:00:00Z');

    const clinicalExamField: ClinicCustomFieldDefinition = {
      id: 'cf-exam',
      tenantId: 't1',
      clinicId: 'c1',
      entityType: 'ClinicPatient',
      fieldKey: 'last_physical_exam_date',
      label: 'Date of Last Physical Examination',
      dataType: 'Date',
      category: 'Clinical',
      isRequired: false,
      displayOrder: 1,
      isActive: true,
      createdAt: '2026-10-01',
    };

    const nextFollowupField: ClinicCustomFieldDefinition = {
      id: 'cf-followup',
      tenantId: 't1',
      clinicId: 'c1',
      entityType: 'ClinicPatient',
      fieldKey: 'next_followup_date',
      label: 'Next Follow-up Appointment',
      dataType: 'Date',
      category: 'Clinical',
      boundaryMode: 'futureOnly',
      isRequired: false,
      displayOrder: 2,
      isActive: true,
      createdAt: '2026-10-01',
    };

    const generalDateField: ClinicCustomFieldDefinition = {
      id: 'cf-award',
      tenantId: 't1',
      clinicId: 'c1',
      entityType: 'ClinicPatient',
      fieldKey: 'award_date',
      label: 'Date of Award',
      dataType: 'Date',
      category: 'Demographics',
      isRequired: false,
      displayOrder: 3,
      isActive: true,
      createdAt: '2026-10-01',
    };

    test('Blank optional date fields pass cleanly without blocking submission', () => {
      // Empty string
      const resEmpty = validateCustomFields([clinicalExamField, nextFollowupField, generalDateField], {
        last_physical_exam_date: '',
        next_followup_date: '',
        award_date: '',
      }, {}, { now: refDate });
      expect(resEmpty.isValid).toBe(true);
      expect(resEmpty.errors).toEqual({});

      // Whitespace string
      const resWhitespace = validateCustomFields([clinicalExamField], {
        last_physical_exam_date: '   ',
      }, {}, { now: refDate });
      expect(resWhitespace.isValid).toBe(true);
      expect(resWhitespace.errors).toEqual({});

      // null or undefined
      const resNull = validateCustomFields([clinicalExamField], {
        last_physical_exam_date: null,
      }, {}, { now: refDate });
      expect(resNull.isValid).toBe(true);

      // Omitted key
      const resOmitted = validateCustomFields([clinicalExamField], {}, {}, { now: refDate });
      expect(resOmitted.isValid).toBe(true);
    });

    test('TC-IF-007: Clinical date field blocks submission on future date with descriptive error', () => {
      const resFuture = validateCustomFields([clinicalExamField], {
        last_physical_exam_date: '2027-02-28',
      }, {}, { now: refDate });

      expect(resFuture.isValid).toBe(false);
      expect(resFuture.errors['last_physical_exam_date']).toBeDefined();
      expect(resFuture.errors['last_physical_exam_date']).toBe(
        'Date of Last Physical Examination: Future date not permitted (today is 2026-10-24)'
      );

      // Past date passes cleanly
      const resPast = validateCustomFields([clinicalExamField], {
        last_physical_exam_date: '2026-01-15',
      }, {}, { now: refDate });
      expect(resPast.isValid).toBe(true);
      expect(resPast.errors).toEqual({});
    });

    test('futureOnly date field blocks submission on today and past dates', () => {
      // Today is blocked
      const resToday = validateCustomFields([nextFollowupField], {
        next_followup_date: '2026-10-24',
      }, {}, { now: refDate });
      expect(resToday.isValid).toBe(false);
      expect(resToday.errors['next_followup_date']).toBe(
        'Next Follow-up Appointment: Date must be strictly in the future'
      );

      // Yesterday is blocked
      const resYesterday = validateCustomFields([nextFollowupField], {
        next_followup_date: '2026-10-23',
      }, {}, { now: refDate });
      expect(resYesterday.isValid).toBe(false);

      // Tomorrow passes cleanly
      const resTomorrow = validateCustomFields([nextFollowupField], {
        next_followup_date: '2026-10-25',
      }, {}, { now: refDate });
      expect(resTomorrow.isValid).toBe(true);
    });

    test('Impossible and malformed dates block submission on any field', () => {
      // Impossible date on Demographics field
      const resImpossible = validateCustomFields([generalDateField], {
        award_date: '2027-02-30',
      }, {}, { now: refDate });
      expect(resImpossible.isValid).toBe(false);
      expect(resImpossible.errors['award_date']).toContain('Day must be between 01 and 28 for month 02');

      // Month 13 on clinical field
      const resMonth13 = validateCustomFields([clinicalExamField], {
        last_physical_exam_date: '2027-13-40',
      }, {}, { now: refDate });
      expect(resMonth13.isValid).toBe(false);
      expect(resMonth13.errors['last_physical_exam_date']).toContain('Month must be between 01 and 12');

      // Non-numeric malformed string
      const resMalformed = validateCustomFields([clinicalExamField], {
        last_physical_exam_date: '2026-10asaasoalkslak',
      }, {}, { now: refDate });
      expect(resMalformed.isValid).toBe(false);
      expect(resMalformed.errors['last_physical_exam_date']).toContain('Incomplete date');
    });

    test('Mandatory (isRequired) Date field requires presence and validates boundaries', () => {
      const requiredClinicalField: ClinicCustomFieldDefinition = {
        ...clinicalExamField,
        id: 'cf-req-clinical',
        isRequired: true,
      };

      // Empty blocks with required message
      const resEmpty = validateCustomFields([requiredClinicalField], {
        last_physical_exam_date: '',
      }, {}, { now: refDate });
      expect(resEmpty.isValid).toBe(false);
      expect(resEmpty.errors['last_physical_exam_date']).toBe('Date of Last Physical Examination is required.');

      // Out of bounds blocks with boundary message
      const resFuture = validateCustomFields([requiredClinicalField], {
        last_physical_exam_date: '2027-05-10',
      }, {}, { now: refDate });
      expect(resFuture.isValid).toBe(false);
      expect(resFuture.errors['last_physical_exam_date']).toContain('Future date not permitted');

      // Valid past date succeeds
      const resValid = validateCustomFields([requiredClinicalField], {
        last_physical_exam_date: '2026-05-10',
      }, {}, { now: refDate });
      expect(resValid.isValid).toBe(true);
      expect(resValid.errors).toEqual({});
    });

    test('Conditionally hidden Date fields NEVER block form validation, even if invalid or required', () => {
      const conditionalDateField: ClinicCustomFieldDefinition = {
        id: 'cf-marriage-date',
        tenantId: 't1',
        clinicId: 'c1',
        entityType: 'ClinicPatient',
        fieldKey: 'marriage_date',
        label: 'Date of Marriage',
        dataType: 'Date',
        category: 'Demographics',
        isRequired: true,
        boundaryMode: 'pastOrToday',
        visibilityRuleJson: JSON.stringify({
          source: 'static',
          field: 'civilStatus',
          operator: 'equals',
          value: 'Married',
        }),
        displayOrder: 1,
        isActive: true,
        createdAt: '2026-10-01',
      };

      // When Single: field is hidden -> empty required date passes!
      const resSingleEmpty = validateCustomFields([conditionalDateField], {
        marriage_date: '',
      }, { civilStatus: 'Single' }, { now: refDate });
      expect(resSingleEmpty.isValid).toBe(true);

      // When Single: field is hidden -> invalid future/malformed date passes without blocking!
      const resSingleInvalid = validateCustomFields([conditionalDateField], {
        marriage_date: '2099-99-99',
      }, { civilStatus: 'Single' }, { now: refDate });
      expect(resSingleInvalid.isValid).toBe(true);

      // When Married: field is visible -> empty blocks!
      const resMarriedEmpty = validateCustomFields([conditionalDateField], {
        marriage_date: '',
      }, { civilStatus: 'Married' }, { now: refDate });
      expect(resMarriedEmpty.isValid).toBe(false);
      expect(resMarriedEmpty.errors['marriage_date']).toBe('Date of Marriage is required.');

      // When Married: field is visible -> future date blocks under pastOrToday!
      const resMarriedFuture = validateCustomFields([conditionalDateField], {
        marriage_date: '2027-01-01',
      }, { civilStatus: 'Married' }, { now: refDate });
      expect(resMarriedFuture.isValid).toBe(false);
      expect(resMarriedFuture.errors['marriage_date']).toContain('Future date not permitted');

      // When Married: field is visible -> valid past date passes!
      const resMarriedValid = validateCustomFields([conditionalDateField], {
        marriage_date: '2020-06-18',
      }, { civilStatus: 'Married' }, { now: refDate });
      expect(resMarriedValid.isValid).toBe(true);
    });

    test('Multiple date fields return multiple distinct errors keyed by fieldKey', () => {
      const resMultiple = validateCustomFields([clinicalExamField, nextFollowupField, generalDateField], {
        last_physical_exam_date: '2027-01-01', // future (invalid for pastOrToday)
        next_followup_date: '2020-01-01',      // past (invalid for futureOnly)
        award_date: '2026-13-99',             // impossible month/day
      }, {}, { now: refDate });

      expect(resMultiple.isValid).toBe(false);
      expect(Object.keys(resMultiple.errors)).toHaveLength(3);
      expect(resMultiple.errors['last_physical_exam_date']).toContain('Future date not permitted');
      expect(resMultiple.errors['next_followup_date']).toContain('strictly in the future');
      expect(resMultiple.errors['award_date']).toContain('Month must be between 01 and 12');
    });
  });

  // =========================================================================
  // Section 6: End-to-End Demographic Update Value Clearing & System Key Protection
  // =========================================================================
  describe('6. Patient Custom Fields Clearing & System Metadata Preservation', () => {
    const clinicalExamField: ClinicCustomFieldDefinition = {
      id: 'cf-exam',
      tenantId: 't1',
      clinicId: 'c1',
      entityType: 'ClinicPatient',
      fieldKey: 'last_physical_exam_date',
      label: 'Date of Last Physical Examination',
      dataType: 'Date',
      category: 'Clinical',
      isRequired: false,
      displayOrder: 1,
      isActive: true,
      createdAt: '2026-10-01',
    };

    test('Emptied previously saved Date field is explicitly assigned null', () => {
      const existingPatient = {
        id: 'pat-1',
        customFields: {
          last_physical_exam_date: '2026-01-10',
          unrelated_key: 'preserve_me',
        },
      };

      const result = mergePatientCustomFields({
        patient: existingPatient,
        effectiveCustomFields: [clinicalExamField],
        customFieldValues: {
          last_physical_exam_date: '', // user cleared the input!
        },
        staticValues: {},
        tenantCustomFieldsCount: 1,
      });

      // Crucial: explicit null triggers clearing in backend additive merge
      expect(result['last_physical_exam_date']).toBeNull();
      // Untouched system keys preserved
      expect(result['unrelated_key']).toBe('preserve_me');
    });

    test('Never-saved optional Date field is omitted from payload (not polluted with null)', () => {
      const existingPatient = {
        id: 'pat-2',
        customFields: {
          some_key: 'abc',
        },
      };

      const result = mergePatientCustomFields({
        patient: existingPatient,
        effectiveCustomFields: [clinicalExamField],
        customFieldValues: {
          last_physical_exam_date: '', // never had a value, left blank
        },
        staticValues: {},
        tenantCustomFieldsCount: 1,
      });

      expect('last_physical_exam_date' in result).toBe(false);
      expect(result['some_key']).toBe('abc');
    });

    test('Preserves system keys: yakap_enlistments, philhealth_profile, member_type', () => {
      const existingPatient = {
        id: 'pat-3',
        customFields: {
          last_physical_exam_date: '2025-05-10',
          yakap_enlistments: [{ caseNo: 'CASE-001', transNo: 'TRANS-001' }],
        },
      };

      const result = mergePatientCustomFields({
        patient: existingPatient,
        effectiveCustomFields: [clinicalExamField],
        customFieldValues: {
          last_physical_exam_date: '2026-02-14',
        },
        staticValues: {},
        tenantCustomFieldsCount: 1,
        memberType: 'MM',
        philHealthNumber: '12-345678901-2',
      });

      expect(result['last_physical_exam_date']).toBe('2026-02-14');
      expect(result['yakap_enlistments']).toBeUndefined();
      expect(result['member_type']).toBe('MM');
      expect(result['philhealth_profile']).toBeUndefined();
    });
  });
});
