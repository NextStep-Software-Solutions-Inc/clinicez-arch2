// token-guard:ignore-file
/**
 * Test Suite: Issue #76 — Frontend Custom Field Numeric Filtering, Validation & Clearance
 * Reference: GitHub Issue #76 (TC-IF-006 — Create and validate a number field)
 * Authoritative: ORIGINAL_REQUEST.md (## 2026-10-24T13:33:49Z R1, R2)
 */

import { describe, expect, test, mock } from 'bun:test';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for component & dependency resolution
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
  TouchableHighlight: 'TouchableHighlight',
  Image: 'Image',
  RefreshControl: 'RefreshControl',
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
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

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const {
  sanitizeNumericInput,
  isValidCustomNumber,
  validateCustomFields,
  sanitizeCustomFieldsPayload,
  mergeCustomFieldsForUpdate,
} = await import('../components/custom-fields');
import type { ClinicCustomFieldDefinition } from '../services/clinicService';

describe('Issue #76 Frontend Numeric Custom Field Engine & Validation', () => {
  describe('Tier 1: Keystroke Filtering (sanitizeNumericInput)', () => {
    test('SAN-01: preserves pure integer digits', () => {
      expect(sanitizeNumericInput('12345')).toBe('12345');
      expect(sanitizeNumericInput('0')).toBe('0');
      expect(sanitizeNumericInput('9876543210')).toBe('9876543210');
    });

    test('SAN-02: strips alphabetic characters immediately', () => {
      expect(sanitizeNumericInput('A')).toBe('');
      expect(sanitizeNumericInput('xyz')).toBe('');
      expect(sanitizeNumericInput('abcDEF')).toBe('');
    });

    test('SAN-03: strips inner and trailing alphabetic characters from mixed input', () => {
      expect(sanitizeNumericInput('12a3')).toBe('123');
      expect(sanitizeNumericInput('4b5c6')).toBe('456');
      expect(sanitizeNumericInput('x100y')).toBe('100');
    });

    test('SAN-04: strips special symbols', () => {
      expect(sanitizeNumericInput('!$#%')).toBe('');
      expect(sanitizeNumericInput('@^&*()')).toBe('');
      expect(sanitizeNumericInput('[{/?}]')).toBe('');
    });

    test('SAN-05: strips currency and percentage symbols while keeping digits', () => {
      expect(sanitizeNumericInput('$100')).toBe('100');
      expect(sanitizeNumericInput('99.5%')).toBe('99.5');
      expect(sanitizeNumericInput('Php 500')).toBe('500');
    });

    test('SAN-06: preserves single leading negative sign', () => {
      expect(sanitizeNumericInput('-42')).toBe('-42');
      expect(sanitizeNumericInput('-0.5')).toBe('-0.5');
      expect(sanitizeNumericInput('-1000')).toBe('-1000');
    });

    test('SAN-07: preserves solitary minus sign typed during data entry', () => {
      expect(sanitizeNumericInput('-')).toBe('-');
    });

    test('SAN-08: normalizes multiple minus signs and strips non-leading minus signs', () => {
      expect(sanitizeNumericInput('--12')).toBe('-12');
      expect(sanitizeNumericInput('---50')).toBe('-50');
      expect(sanitizeNumericInput('-12-34')).toBe('-1234');
      expect(sanitizeNumericInput('5-2')).toBe('52');
    });

    test('SAN-09: preserves single decimal point in floating point numbers', () => {
      expect(sanitizeNumericInput('3.14')).toBe('3.14');
      expect(sanitizeNumericInput('0.5')).toBe('0.5');
      expect(sanitizeNumericInput('-123.456')).toBe('-123.456');
    });

    test('SAN-10: preserves solitary decimal point typed during data entry', () => {
      expect(sanitizeNumericInput('.')).toBe('.');
      expect(sanitizeNumericInput('-.')).toBe('-.');
    });

    test('SAN-11: normalizes multiple decimal points, keeping only the first one', () => {
      expect(sanitizeNumericInput('12..34')).toBe('12.34');
      expect(sanitizeNumericInput('1.2.3.4')).toBe('1.234');
      expect(sanitizeNumericInput('12.34.56')).toBe('12.3456');
      expect(sanitizeNumericInput('..3.14..5')).toBe('.3145');
    });

    test('SAN-12: combined complex malformed inputs normalize cleanly', () => {
      expect(sanitizeNumericInput('--12..3')).toBe('-12.3');
      expect(sanitizeNumericInput('--12..3a!b#')).toBe('-12.3');
      expect(sanitizeNumericInput('$ -12.34 abc')).toBe('-12.34');
    });

    test('SAN-13: handles empty, null, and undefined safely', () => {
      expect(sanitizeNumericInput('')).toBe('');
      expect(sanitizeNumericInput(null as any)).toBe('');
      expect(sanitizeNumericInput(undefined as any)).toBe('');
    });

    test('SAN-14: handles zero representations correctly', () => {
      expect(sanitizeNumericInput('0')).toBe('0');
      expect(sanitizeNumericInput('00')).toBe('00');
      expect(sanitizeNumericInput('-0')).toBe('-0');
      expect(sanitizeNumericInput('0.0')).toBe('0.0');
    });
  });

  describe('Tier 2: Strict Numeric Type Validation (isValidCustomNumber)', () => {
    test('VAL-01: accepts valid positive integers', () => {
      expect(isValidCustomNumber(0)).toBe(true);
      expect(isValidCustomNumber(1)).toBe(true);
      expect(isValidCustomNumber(42)).toBe(true);
      expect(isValidCustomNumber(1000000)).toBe(true);
    });

    test('VAL-02: accepts valid negative integers', () => {
      expect(isValidCustomNumber(-1)).toBe(true);
      expect(isValidCustomNumber(-42)).toBe(true);
      expect(isValidCustomNumber(-999)).toBe(true);
    });

    test('VAL-03: accepts valid floating point numbers', () => {
      expect(isValidCustomNumber(3.14)).toBe(true);
      expect(isValidCustomNumber(-0.75)).toBe(true);
      expect(isValidCustomNumber(0.001)).toBe(true);
      expect(isValidCustomNumber(-123.456)).toBe(true);
    });

    test('VAL-04: accepts valid numeric strings', () => {
      expect(isValidCustomNumber('0')).toBe(true);
      expect(isValidCustomNumber('42')).toBe(true);
      expect(isValidCustomNumber('-5')).toBe(true);
      expect(isValidCustomNumber('3.14')).toBe(true);
      expect(isValidCustomNumber('-0.75')).toBe(true);
      expect(isValidCustomNumber('1000')).toBe(true);
    });

    test('VAL-05: accepts valid numeric strings with surrounding whitespace', () => {
      expect(isValidCustomNumber('  42  ')).toBe(true);
      expect(isValidCustomNumber(' -5.5 ')).toBe(true);
      expect(isValidCustomNumber('\t0\n')).toBe(true);
    });

    test('VAL-06: rejects alphabetic and symbol strings', () => {
      expect(isValidCustomNumber('A')).toBe(false);
      expect(isValidCustomNumber('!$#%')).toBe(false);
      expect(isValidCustomNumber('12a3')).toBe(false);
      expect(isValidCustomNumber('abc')).toBe(false);
      expect(isValidCustomNumber('NaN')).toBe(false);
      expect(isValidCustomNumber('Infinity')).toBe(false);
      expect(isValidCustomNumber('-Infinity')).toBe(false);
    });

    test('VAL-07: rejects solitary symbols and incomplete numeric inputs', () => {
      expect(isValidCustomNumber('-')).toBe(false);
      expect(isValidCustomNumber('.')).toBe(false);
      expect(isValidCustomNumber('-.')).toBe(false);
      expect(isValidCustomNumber('+')).toBe(false);
    });

    test('VAL-08: rejects trailing decimal points without fractional digits', () => {
      expect(isValidCustomNumber('12.')).toBe(false);
      expect(isValidCustomNumber('-5.')).toBe(false);
    });

    test('VAL-09: rejects leading decimal points without whole digits', () => {
      expect(isValidCustomNumber('.5')).toBe(false);
      expect(isValidCustomNumber('-.5')).toBe(false);
    });

    test('VAL-10: rejects multiple decimals and multiple minuses', () => {
      expect(isValidCustomNumber('12.34.56')).toBe(false);
      expect(isValidCustomNumber('--12')).toBe(false);
      expect(isValidCustomNumber('-12-3')).toBe(false);
    });

    test('VAL-11: rejects non-finite numbers', () => {
      expect(isValidCustomNumber(NaN)).toBe(false);
      expect(isValidCustomNumber(Infinity)).toBe(false);
      expect(isValidCustomNumber(-Infinity)).toBe(false);
      expect(isValidCustomNumber(Number.POSITIVE_INFINITY)).toBe(false);
      expect(isValidCustomNumber(Number.NEGATIVE_INFINITY)).toBe(false);
    });

    test('VAL-12: rejects non-numeric types', () => {
      expect(isValidCustomNumber(true)).toBe(false);
      expect(isValidCustomNumber(false)).toBe(false);
      expect(isValidCustomNumber({})).toBe(false);
      expect(isValidCustomNumber([])).toBe(false);
      expect(isValidCustomNumber([42])).toBe(false);
      expect(isValidCustomNumber(() => {})).toBe(false);
    });

    test('VAL-13: rejects empty, whitespace-only, null, and undefined', () => {
      expect(isValidCustomNumber('')).toBe(false);
      expect(isValidCustomNumber('   ')).toBe(false);
      expect(isValidCustomNumber(null)).toBe(false);
      expect(isValidCustomNumber(undefined)).toBe(false);
    });
  });

  describe('Tier 3: Form-Level Defensive Custom Field Validation (validateCustomFields)', () => {
    const numberDef: ClinicCustomFieldDefinition = {
      id: 'field-gpa',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      entityType: 'ClinicPatient',
      fieldKey: 'gpa',
      label: 'GPA',
      dataType: 'Number',
      isRequired: true,
      displayOrder: 1,
      isActive: true,
    };

    const optionalNumberDef: ClinicCustomFieldDefinition = {
      id: 'field-allowance',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      entityType: 'ClinicPatient',
      fieldKey: 'allowance',
      label: 'Monthly Allowance',
      dataType: 'Number',
      isRequired: false,
      displayOrder: 2,
      isActive: true,
    };

    const dateDef: ClinicCustomFieldDefinition = {
      id: 'field-grad-date',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      entityType: 'ClinicPatient',
      fieldKey: 'grad_date',
      label: 'Graduation Date',
      dataType: 'Date',
      isRequired: true,
      displayOrder: 3,
      isActive: true,
    };

    const conditionalNumberDef: ClinicCustomFieldDefinition = {
      id: 'field-student-credits',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      entityType: 'ClinicPatient',
      fieldKey: 'credits_earned',
      label: 'Credits Earned',
      dataType: 'Number',
      isRequired: true,
      displayOrder: 4,
      isActive: true,
      visibilityRuleJson: JSON.stringify({
        source: 'custom_field',
        field: 'affiliation',
        operator: 'equals',
        value: 'Student',
      }),
    };

    test('DEF-01: required Number field missing/empty returns required error', () => {
      const res1 = validateCustomFields([numberDef], {});
      expect(res1.isValid).toBe(false);
      expect(res1.errors.gpa).toBe('GPA is required.');

      const res2 = validateCustomFields([numberDef], { gpa: '' });
      expect(res2.isValid).toBe(false);
      expect(res2.errors.gpa).toBe('GPA is required.');

      const res3 = validateCustomFields([numberDef], { gpa: '   ' });
      expect(res3.isValid).toBe(false);
      expect(res3.errors.gpa).toBe('GPA is required.');

      const res4 = validateCustomFields([numberDef], { gpa: null });
      expect(res4.isValid).toBe(false);
      expect(res4.errors.gpa).toBe('GPA is required.');
    });

    test('DEF-02: required Number field with invalid text returns invalid number error', () => {
      const testCases = ['A', '!$#%', '-', '.', '12.', '12.34.56', '12a3'];
      for (const invalidVal of testCases) {
        const res = validateCustomFields([numberDef], { gpa: invalidVal });
        expect(res.isValid).toBe(false);
        expect(res.errors.gpa).toBe('GPA must be a valid number.');
      }
    });

    test('DEF-03: required Number field with valid number succeeds', () => {
      const validCases = [0, '0', 42, '42', -5, '-5', 3.14, '3.14', '  3.75  '];
      for (const val of validCases) {
        const res = validateCustomFields([numberDef], { gpa: val });
        expect(res.isValid).toBe(true);
        expect(res.errors.gpa).toBeUndefined();
      }
    });

    test('DEF-04: optional Number field empty or whitespace succeeds without error', () => {
      expect(validateCustomFields([optionalNumberDef], {}).isValid).toBe(true);
      expect(validateCustomFields([optionalNumberDef], { allowance: '' }).isValid).toBe(true);
      expect(validateCustomFields([optionalNumberDef], { allowance: '   ' }).isValid).toBe(true);
      expect(validateCustomFields([optionalNumberDef], { allowance: null }).isValid).toBe(true);
    });

    test('DEF-05: optional Number field with invalid text fails with invalid number error', () => {
      const res1 = validateCustomFields([optionalNumberDef], { allowance: 'A' });
      expect(res1.isValid).toBe(false);
      expect(res1.errors.allowance).toBe('Monthly Allowance must be a valid number.');

      const res2 = validateCustomFields([optionalNumberDef], { allowance: '!$#%' });
      expect(res2.isValid).toBe(false);
      expect(res2.errors.allowance).toBe('Monthly Allowance must be a valid number.');
    });

    test('DEF-06: optional Number field with valid number succeeds', () => {
      const res = validateCustomFields([optionalNumberDef], { allowance: '250.50' });
      expect(res.isValid).toBe(true);
      expect(res.errors.allowance).toBeUndefined();
    });

    test('DEF-07: required Date field empty returns required error', () => {
      const res = validateCustomFields([dateDef], { grad_date: '' });
      expect(res.isValid).toBe(false);
      expect(res.errors.grad_date).toBe('Graduation Date is required.');
    });

    test('DEF-08: Date field populated with invalid/malformed date fails validation', () => {
      const invalidDates = ['2026-02-31', 'invalid-date', '2026-13-01', '2026-10asaasoalkslak'];
      for (const d of invalidDates) {
        const res = validateCustomFields([dateDef], { grad_date: d });
        expect(res.isValid).toBe(false);
        expect(res.errors.grad_date).toMatch(/^Graduation Date: /);
      }
    });

    test('DEF-09: Date field populated with valid date succeeds', () => {
      const res = validateCustomFields([dateDef], { grad_date: '2026-05-15' });
      expect(res.isValid).toBe(true);
      expect(res.errors.grad_date).toBeUndefined();
    });

    test('DEF-10: hidden required Number field does NOT block validation', () => {
      const defs = [conditionalNumberDef];
      // affiliation is Employee, so credits_earned is hidden
      const values = { affiliation: 'Employee' };
      const res = validateCustomFields(defs, values);
      expect(res.isValid).toBe(true);
      expect(res.errors.credits_earned).toBeUndefined();
    });

    test('DEF-11: hidden Number field with invalid content does NOT block validation', () => {
      const defs = [conditionalNumberDef];
      const values = { affiliation: 'Employee', credits_earned: 'INVALID_NON_NUMERIC' };
      const res = validateCustomFields(defs, values);
      expect(res.isValid).toBe(true);
      expect(res.errors.credits_earned).toBeUndefined();
    });

    test('DEF-12: multi-field validation accumulates all field errors in dictionary', () => {
      const defs = [numberDef, dateDef, optionalNumberDef];
      const values = {
        gpa: 'invalid_gpa',
        grad_date: '2026-99-99',
        allowance: 'bad_allowance',
      };
      const res = validateCustomFields(defs, values);
      expect(res.isValid).toBe(false);
      expect(res.errors.gpa).toBe('GPA must be a valid number.');
      expect(res.errors.grad_date).toMatch(/^Graduation Date: /);
      expect(res.errors.allowance).toBe('Monthly Allowance must be a valid number.');
    });
  });

  describe('Tier 4: Payload Sanitization & Update Merging', () => {
    const definitions: ClinicCustomFieldDefinition[] = [
      {
        id: '1',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        entityType: 'ClinicPatient',
        fieldKey: 'affiliation',
        label: 'Affiliation',
        dataType: 'Select',
        isRequired: false,
        displayOrder: 1,
        isActive: true,
      },
      {
        id: '2',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        entityType: 'ClinicPatient',
        fieldKey: 'gpa',
        label: 'GPA',
        dataType: 'Number',
        isRequired: false,
        displayOrder: 2,
        isActive: true,
      },
      {
        id: '3',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        entityType: 'ClinicPatient',
        fieldKey: 'student_id',
        label: 'Student ID',
        dataType: 'Text',
        isRequired: false,
        displayOrder: 3,
        isActive: true,
        visibilityRuleJson: JSON.stringify({
          source: 'custom_field',
          field: 'affiliation',
          operator: 'equals',
          value: 'Student',
        }),
      },
      {
        id: '4',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        entityType: 'ClinicPatient',
        fieldKey: 'is_scholar',
        label: 'Is Scholar',
        dataType: 'Boolean',
        isRequired: false,
        displayOrder: 4,
        isActive: true,
      },
    ];

    test('SAN-PAY-01: trims string values and omits whitespace-only strings from payload', () => {
      const values = {
        affiliation: '  Student  ',
        gpa: '   ',
        is_scholar: true,
      };
      const payload = sanitizeCustomFieldsPayload(definitions, values);
      expect(payload.affiliation).toBe('Student');
      expect(payload.gpa).toBeUndefined();
      expect(payload.is_scholar).toBe(true);
    });

    test('SAN-PAY-02: preserves valid numeric 0 and string "0"', () => {
      const payload1 = sanitizeCustomFieldsPayload(definitions, { gpa: 0 });
      expect(payload1.gpa).toBe(0);

      const payload2 = sanitizeCustomFieldsPayload(definitions, { gpa: '0' });
      expect(payload2.gpa).toBe('0');
    });

    test('SAN-PAY-03: preserves valid boolean false', () => {
      const payload = sanitizeCustomFieldsPayload(definitions, { is_scholar: false });
      expect(payload.is_scholar).toBe(false);
    });

    test('SAN-PAY-04: strips keys of currently hidden fields based on visibility rules', () => {
      const values = {
        affiliation: 'Employee',
        student_id: '2026-9999',
      };
      const payload = sanitizeCustomFieldsPayload(definitions, values);
      expect(payload.student_id).toBeUndefined();
      expect(payload.affiliation).toBe('Employee');
    });

    test('MERGE-01: clear active field on update explicitly deletes key from merged dictionary', () => {
      const existing = { gpa: '3.75', affiliation: 'Student' };
      const values = { gpa: '', affiliation: 'Student' };

      const merged = mergeCustomFieldsForUpdate(existing, definitions, values);
      expect('gpa' in merged).toBe(false);
      expect(merged.affiliation).toBe('Student');
    });

    test('MERGE-02: clear active field with whitespace explicitly deletes key', () => {
      const existing = { gpa: '3.75', affiliation: 'Student' };
      const values = { gpa: '   ', affiliation: 'Student' };

      const merged = mergeCustomFieldsForUpdate(existing, definitions, values);
      expect('gpa' in merged).toBe(false);
    });

    test('MERGE-03: clear active field with null/undefined explicitly deletes key', () => {
      const existing = { gpa: '3.75', affiliation: 'Student' };
      const mergedNull = mergeCustomFieldsForUpdate(existing, definitions, { gpa: null, affiliation: 'Student' });
      expect('gpa' in mergedNull).toBe(false);

      const mergedUndef = mergeCustomFieldsForUpdate(existing, definitions, { gpa: undefined, affiliation: 'Student' });
      expect('gpa' in mergedUndef).toBe(false);
    });

    test('MERGE-04: conditionally hidden field on update is explicitly deleted', () => {
      const existing = { student_id: '2026-001', affiliation: 'Student' };
      // User changes affiliation to Employee, making student_id hidden
      const values = { affiliation: 'Employee', student_id: '2026-001' };

      const merged = mergeCustomFieldsForUpdate(existing, definitions, values);
      expect('student_id' in merged).toBe(false);
      expect(merged.affiliation).toBe('Employee');
    });

    test('MERGE-05: preserves unrelated system metadata keys untouched', () => {
      const existing = {
        member_type: 'DD',
        principal_member_pin: '12-345678901-2',
        primary_address_line: '123 Medical Way',
        emergency_contact_name: 'Dr. Jane Doe',
        gpa: '3.75',
      };
      // User clears GPA and leaves everything else
      const values = { gpa: '' };

      const merged = mergeCustomFieldsForUpdate(existing, definitions, values);
      expect('gpa' in merged).toBe(false);
      expect(merged.member_type).toBe('DD');
      expect(merged.principal_member_pin).toBe('12-345678901-2');
      expect(merged.primary_address_line).toBe('123 Medical Way');
      expect(merged.emergency_contact_name).toBe('Dr. Jane Doe');
    });

    test('MERGE-06: preserves other unchanged active custom fields while clearing target field', () => {
      const existing = {
        affiliation: 'Student',
        gpa: '3.75',
        is_scholar: true,
      };
      const values = {
        affiliation: 'Student',
        gpa: '', // cleared
        is_scholar: true,
      };

      const merged = mergeCustomFieldsForUpdate(existing, definitions, values);
      expect('gpa' in merged).toBe(false);
      expect(merged.affiliation).toBe('Student');
      expect(merged.is_scholar).toBe(true);
    });

    test('MERGE-07: defensively handles existingCustomFields being null or undefined', () => {
      const values = { affiliation: 'Student', gpa: '3.95' };

      const mergedNull = mergeCustomFieldsForUpdate(null as any, definitions, values);
      expect(mergedNull.affiliation).toBe('Student');
      expect(mergedNull.gpa).toBe('3.95');

      const mergedUndef = mergeCustomFieldsForUpdate(undefined, definitions, values);
      expect(mergedUndef.affiliation).toBe('Student');
      expect(mergedUndef.gpa).toBe('3.95');
    });

    test('MERGE-08: updates active number field with valid numeric value', () => {
      const existing = { gpa: '3.75' };
      const values = { gpa: '3.95' };

      const merged = mergeCustomFieldsForUpdate(existing, definitions, values);
      expect(merged.gpa).toBe('3.95');
    });

    test('MERGE-09: preserves valid numeric 0 in merged custom fields', () => {
      const existing = { gpa: '3.75' };
      const values = { gpa: 0 };

      const merged = mergeCustomFieldsForUpdate(existing, definitions, values);
      expect(merged.gpa).toBe(0);
    });

    test('MERGE-10: preserves valid boolean false in merged custom fields', () => {
      const existing = { is_scholar: true };
      const values = { is_scholar: false };

      const merged = mergeCustomFieldsForUpdate(existing, definitions, values);
      expect(merged.is_scholar).toBe(false);
    });

    test('MERGE-11 (TC-IF-006 HTTP PUT Seam): emitNullTombstones emits null for cleared or hidden existing keys while omitting never-set keys', () => {
      const dependentsDef: ClinicCustomFieldDefinition = {
        id: '5',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        entityType: 'ClinicPatient',
        fieldKey: 'number_of_dependents',
        label: 'Number of Dependents',
        dataType: 'Number',
        isRequired: false,
        displayOrder: 5,
        isActive: true,
      };
      const allDefs = [...definitions, dependentsDef];

      const existing = {
        number_of_dependents: '3',
        student_id: '2026-0001',
        affiliation: 'Student',
        member_type: 'MM',
      };

      // User clears number_of_dependents (''), switches affiliation to 'Employee' (hiding student_id),
      // and leaves gpa untouched/unset (never existed in existing)
      const values = {
        number_of_dependents: '',
        affiliation: 'Employee',
        student_id: '2026-0001',
        gpa: '',
      };

      const putPayload = mergeCustomFieldsForUpdate(existing, allDefs, values, {}, { emitNullTombstones: true });

      // Existing cleared & hidden keys emit explicit null tombstones for PUT /patients/{id}
      expect('number_of_dependents' in putPayload).toBe(true);
      expect(putPayload.number_of_dependents).toBeNull();
      expect('student_id' in putPayload).toBe(true);
      expect(putPayload.student_id).toBeNull();

      // Keys that never existed in patient.customFields are NOT bloated with null tombstones
      expect('gpa' in putPayload).toBe(false);
      expect('is_scholar' in putPayload).toBe(false);

      // Active updated values and unrelated metadata remain intact
      expect(putPayload.affiliation).toBe('Employee');
      expect(putPayload.member_type).toBe('MM');
    });
  });
});
