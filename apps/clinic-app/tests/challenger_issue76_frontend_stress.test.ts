// token-guard:ignore-file
/**
 * Adversarial Challenger Stress Test Suite: Issue #76 Frontend Custom Fields Engine
 * Targets:
 *   1. sanitizeNumericInput: extreme inputs, multiple minuses/decimals, interim typing states, spaces, non-ASCII numerals
 *   2. isValidCustomNumber: complete vs incomplete numbers, negative zero, boundary floats, objects, arrays
 *   3. mergeCustomFieldsForUpdate: prototype pollution resilience, rapid visibility toggles, metadata retention, immutability
 *   4. validateCustomFields: required vs optional number fields, error messages, Date validation, conditional masking
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

describe('Adversarial Stress Suite — Frontend Custom Field Engine (Issue #76)', () => {
  // =========================================================================
  // 1. sanitizeNumericInput Empirical Stress Tests
  // =========================================================================
  describe('1. sanitizeNumericInput: Extreme Inputs, Typing States & Encodings', () => {
    test('1.1 Massive inputs: handles 10,000 character inputs without stack overflow or performance degradation', () => {
      const longDigits = '9'.repeat(10000);
      const start = performance.now();
      const sanitized = sanitizeNumericInput(longDigits);
      const duration = performance.now() - start;
      expect(sanitized).toBe(longDigits);
      expect(duration).toBeLessThan(100); // Must be fast (< 100ms)
    });

    test('1.2 Massive garbage input: strips 10,000 non-numeric symbols', () => {
      const garbage = 'A!@#$%^&*()_+~`|}{[]:;?><, '.repeat(400);
      const sanitized = sanitizeNumericInput(garbage);
      expect(sanitized).toBe('');
    });

    test('1.3 Repetitive minus signs: preserves only the very first leading minus sign', () => {
      expect(sanitizeNumericInput('--------------------42')).toBe('-42');
      expect(sanitizeNumericInput('- - - - 4 2')).toBe('-42');
      expect(sanitizeNumericInput('42--------------------')).toBe('42');
      expect(sanitizeNumericInput('1-2-3-4-5-6-7')).toBe('1234567');
    });

    test('1.4 Repetitive decimal points: preserves only the very first decimal point', () => {
      expect(sanitizeNumericInput('1................................2')).toBe('1.2');
      expect(sanitizeNumericInput('. . . . . 5')).toBe('.5');
      expect(sanitizeNumericInput('1.2.3.4.5.6.7.8.9')).toBe('1.23456789');
      expect(sanitizeNumericInput('..3.14159..')).toBe('.314159');
    });

    test('1.5 Interim typing states: preserves in-progress user typing states', () => {
      // User typed single minus
      expect(sanitizeNumericInput('-')).toBe('-');
      // User typed single dot
      expect(sanitizeNumericInput('.')).toBe('.');
      // User typed minus dot
      expect(sanitizeNumericInput('-.')).toBe('-.');
      // User typed negative zero
      expect(sanitizeNumericInput('-0')).toBe('-0');
      // User typed negative zero dot
      expect(sanitizeNumericInput('-0.')).toBe('-0.');
      // User typed zero dot
      expect(sanitizeNumericInput('0.')).toBe('0.');
    });

    test('1.6 Whitespace stripping: removes internal, leading, trailing, tabs, newlines, and non-breaking spaces', () => {
      expect(sanitizeNumericInput('  -  1  2  .  3  4  ')).toBe('-12.34');
      expect(sanitizeNumericInput('\t123\n456\r')).toBe('123456');
      expect(sanitizeNumericInput('100\u00A0000')).toBe('100000'); // Non-breaking space
      expect(sanitizeNumericInput(' - \t . \n 5 ')).toBe('-.5');
    });

    test('1.7 Non-ASCII numerals: rejects full-width and non-latin numeral encodings', () => {
      // Arabic-Indic digits (\u0661\u0662\u0663)
      expect(sanitizeNumericInput('١٢٣')).toBe('');
      // Full-width digits (\uFF11\uFF12\uFF13)
      expect(sanitizeNumericInput('１２３')).toBe('');
      // Devanagari digits (\u0967\u0968\u0969)
      expect(sanitizeNumericInput('१२३')).toBe('');
      // Superscripts/Subscripts
      expect(sanitizeNumericInput('²³¹⁰')).toBe('');
      // Roman numerals
      expect(sanitizeNumericInput('XIV')).toBe('');
    });

    test('1.8 Emojis and unicode symbols: cleanly stripped', () => {
      expect(sanitizeNumericInput('💉120/80🩺')).toBe('12080');
      expect(sanitizeNumericInput('₱1,250.75💵')).toBe('1250.75');
      expect(sanitizeNumericInput('🌡️-37.5°C')).toBe('-37.5');
    });

    test('1.9 Scientific notation and pasted text: strips "e", commas, and words', () => {
      expect(sanitizeNumericInput('1e5')).toBe('15');
      expect(sanitizeNumericInput('1.5E-3')).toBe('1.53');
      expect(sanitizeNumericInput('Dosage: 50.5 mg daily')).toBe('50.5');
      expect(sanitizeNumericInput('Discount: -15.00% off')).toBe('-15.00');
    });

    test('1.10 Non-string primitives and boundary values: returns clean string', () => {
      expect(sanitizeNumericInput(null as any)).toBe('');
      expect(sanitizeNumericInput(undefined as any)).toBe('');
      expect(sanitizeNumericInput('' as any)).toBe('');
      expect(sanitizeNumericInput(0 as any)).toBe('0');
      expect(sanitizeNumericInput(-42.5 as any)).toBe('-42.5');
      expect(sanitizeNumericInput(NaN as any)).toBe('');
      expect(sanitizeNumericInput(Infinity as any)).toBe('');
    });
  });

  // =========================================================================
  // 2. isValidCustomNumber Empirical Stress Tests
  // =========================================================================
  describe('2. isValidCustomNumber: Boundary Conditions, Extremes & Type Hardening', () => {
    test('2.1 Rejects incomplete interim typing states', () => {
      expect(isValidCustomNumber('-')).toBe(false);
      expect(isValidCustomNumber('.')).toBe(false);
      expect(isValidCustomNumber('-.')).toBe(false);
      expect(isValidCustomNumber('12.')).toBe(false);
      expect(isValidCustomNumber('-5.')).toBe(false);
      expect(isValidCustomNumber('.5')).toBe(false);
      expect(isValidCustomNumber('-.5')).toBe(false);
      expect(isValidCustomNumber('+')).toBe(false);
      expect(isValidCustomNumber('+42')).toBe(false);
    });

    test('2.2 Accepts zero variants and negative zero', () => {
      expect(isValidCustomNumber(0)).toBe(true);
      expect(isValidCustomNumber(-0)).toBe(true);
      expect(isValidCustomNumber('0')).toBe(true);
      expect(isValidCustomNumber('-0')).toBe(true);
      expect(isValidCustomNumber('0.0')).toBe(true);
      expect(isValidCustomNumber('-0.0')).toBe(true);
      expect(isValidCustomNumber('0.00000')).toBe(true);
      expect(isValidCustomNumber('-0.00000')).toBe(true);
      expect(isValidCustomNumber('007')).toBe(true);
      expect(isValidCustomNumber('-007')).toBe(true);
    });

    test('2.3 Boundary numbers, large numbers & extremes', () => {
      expect(isValidCustomNumber(Number.MAX_SAFE_INTEGER)).toBe(true);
      expect(isValidCustomNumber(Number.MIN_SAFE_INTEGER)).toBe(true);
      expect(isValidCustomNumber(String(Number.MAX_SAFE_INTEGER))).toBe(true);
      expect(isValidCustomNumber(String(Number.MIN_SAFE_INTEGER))).toBe(true);
      expect(isValidCustomNumber('-999999999999999')).toBe(true);
      expect(isValidCustomNumber('999999999999999999999999999999')).toBe(true);
      expect(isValidCustomNumber('-0.0000000000000000001')).toBe(true);
    });

    test('2.4 Rejects non-finite numbers and their string representations', () => {
      expect(isValidCustomNumber(NaN)).toBe(false);
      expect(isValidCustomNumber(Infinity)).toBe(false);
      expect(isValidCustomNumber(-Infinity)).toBe(false);
      expect(isValidCustomNumber('NaN')).toBe(false);
      expect(isValidCustomNumber('Infinity')).toBe(false);
      expect(isValidCustomNumber('-Infinity')).toBe(false);
    });

    test('2.5 Rejects non-numeric types strictly', () => {
      expect(isValidCustomNumber(true)).toBe(false);
      expect(isValidCustomNumber(false)).toBe(false);
      expect(isValidCustomNumber({})).toBe(false);
      expect(isValidCustomNumber({ value: 42 })).toBe(false);
      expect(isValidCustomNumber([])).toBe(false);
      expect(isValidCustomNumber([42])).toBe(false);
      expect(isValidCustomNumber(['42'])).toBe(false);
      expect(isValidCustomNumber(() => 42)).toBe(false);
      expect(isValidCustomNumber(Symbol('42'))).toBe(false);
      expect(isValidCustomNumber(BigInt(42))).toBe(false);
      expect(isValidCustomNumber(null)).toBe(false);
      expect(isValidCustomNumber(undefined)).toBe(false);
    });

    test('2.6 Rejects multiple decimal points and multiple minus signs', () => {
      expect(isValidCustomNumber('12.34.56')).toBe(false);
      expect(isValidCustomNumber('1.2.3')).toBe(false);
      expect(isValidCustomNumber('--42')).toBe(false);
      expect(isValidCustomNumber('-42-')).toBe(false);
      expect(isValidCustomNumber('42-2')).toBe(false);
    });

    test('2.7 Accepts strings with surrounding whitespace but valid content', () => {
      expect(isValidCustomNumber('   42   ')).toBe(true);
      expect(isValidCustomNumber('\t-3.14\n')).toBe(true);
      expect(isValidCustomNumber('   0   ')).toBe(true);
    });
  });

  // =========================================================================
  // 3. mergeCustomFieldsForUpdate Empirical Stress Tests
  // =========================================================================
  describe('3. mergeCustomFieldsForUpdate: Security, Visibility & Metadata Retention', () => {
    const sampleDefinitions: ClinicCustomFieldDefinition[] = [
      {
        id: 'def-affiliation',
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
        id: 'def-student-id',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        entityType: 'ClinicPatient',
        fieldKey: 'student_id',
        label: 'Student ID',
        dataType: 'Text',
        isRequired: true,
        displayOrder: 2,
        isActive: true,
        visibilityRuleJson: JSON.stringify({
          source: 'custom_field',
          field: 'affiliation',
          operator: 'equals',
          value: 'Student',
        }),
      },
      {
        id: 'def-gpa',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        entityType: 'ClinicPatient',
        fieldKey: 'gpa',
        label: 'GPA',
        dataType: 'Number',
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
        id: 'def-scholar',
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

    test('3.1 Prototype pollution attack keys: does not pollute Object.prototype', () => {
      const maliciousDefs: ClinicCustomFieldDefinition[] = [
        {
          id: 'def-proto',
          tenantId: 'tenant-1',
          clinicId: 'clinic-1',
          entityType: 'ClinicPatient',
          fieldKey: '__proto__',
          label: 'Proto Attack',
          dataType: 'Text',
          isRequired: false,
          displayOrder: 1,
          isActive: true,
        },
        {
          id: 'def-constructor',
          tenantId: 'tenant-1',
          clinicId: 'clinic-1',
          entityType: 'ClinicPatient',
          fieldKey: 'constructor',
          label: 'Constructor Attack',
          dataType: 'Text',
          isRequired: false,
          displayOrder: 2,
          isActive: true,
        },
      ];

      const initialEmpty: any = {};
      expect(initialEmpty.polluted).toBeUndefined();

      const merged = mergeCustomFieldsForUpdate(
        {},
        maliciousDefs,
        {
          __proto__: { polluted: true },
          constructor: { polluted: true },
        }
      );

      // Verify Object.prototype is NOT polluted
      const cleanProbe: any = {};
      expect(cleanProbe.polluted).toBeUndefined();
      expect(({} as any).polluted).toBeUndefined();
    });

    test('3.2 Rapid visibility toggling: correctly adds and removes fields across state transitions', () => {
      let currentDbState: Record<string, any> = {
        affiliation: 'Student',
        student_id: 'S-2026-001',
        gpa: 3.85,
        is_scholar: true,
      };

      // Toggle 1: User switches to Employee -> student_id and gpa become hidden and must be purged
      const step1 = mergeCustomFieldsForUpdate(
        currentDbState,
        sampleDefinitions,
        { affiliation: 'Employee', student_id: 'S-2026-001', gpa: 3.85, is_scholar: true }
      );
      expect(step1.affiliation).toBe('Employee');
      expect('student_id' in step1).toBe(false);
      expect('gpa' in step1).toBe(false);
      expect(step1.is_scholar).toBe(true);
      currentDbState = step1;

      // Toggle 2: User switches back to Student -> student_id and gpa are visible again, new values added
      const step2 = mergeCustomFieldsForUpdate(
        currentDbState,
        sampleDefinitions,
        { affiliation: 'Student', student_id: 'S-2026-999', gpa: '3.90', is_scholar: true }
      );
      expect(step2.affiliation).toBe('Student');
      expect(step2.student_id).toBe('S-2026-999');
      expect(step2.gpa).toBe('3.90');
      currentDbState = step2;

      // Toggle 3: User blanks out gpa with empty string -> gpa is purged
      const step3 = mergeCustomFieldsForUpdate(
        currentDbState,
        sampleDefinitions,
        { affiliation: 'Student', student_id: 'S-2026-999', gpa: '', is_scholar: true }
      );
      expect('gpa' in step3).toBe(false);
      expect(step3.student_id).toBe('S-2026-999');
      currentDbState = step3;

      // Toggle 4: User blanks out student_id with whitespace -> student_id is purged
      const step4 = mergeCustomFieldsForUpdate(
        currentDbState,
        sampleDefinitions,
        { affiliation: 'Student', student_id: '   ', is_scholar: true }
      );
      expect('student_id' in step4).toBe(false);
    });

    test('3.3 System metadata keys retention under intense operations', () => {
      const existingWithMetadata = {
        member_type: 'DD',
        principal_member_pin: '12-345678901-2',
        principal_relationship: 'Child',
        philhealth_profile: {
          chronic_conditions: ['Hypertension', 'Diabetes'],
          ncd: { systolic: 120, diastolic: 80 },
        },
        primary_address_line: '123 Medical Way',
        primary_barangay: 'Barangay 5',
        primary_city: 'Cagayan de Oro',
        primary_province: 'Misamis Oriental',
        emergency_contact_name: 'Dr. Santos',
        emergency_contact_phone: '0917-123-4567',
        emergency_contact_relationship: 'Guardian',
        custom_system_tag: 'VIP_PATIENT',
        affiliation: 'Student',
        gpa: 3.5,
      };

      // Wipe out all form fields
      const values = {
        affiliation: '',
        gpa: null,
      };

      const merged = mergeCustomFieldsForUpdate(existingWithMetadata, sampleDefinitions, values);

      // Cleared custom fields are gone
      expect('affiliation' in merged).toBe(false);
      expect('gpa' in merged).toBe(false);

      // All 12 system metadata fields are completely intact and structurally identical
      expect(merged.member_type).toBe('DD');
      expect(merged.principal_member_pin).toBe('12-345678901-2');
      expect(merged.principal_relationship).toBe('Child');
      expect(merged.philhealth_profile).toEqual({
        chronic_conditions: ['Hypertension', 'Diabetes'],
        ncd: { systolic: 120, diastolic: 80 },
      });
      expect(merged.primary_address_line).toBe('123 Medical Way');
      expect(merged.primary_barangay).toBe('Barangay 5');
      expect(merged.primary_city).toBe('Cagayan de Oro');
      expect(merged.primary_province).toBe('Misamis Oriental');
      expect(merged.emergency_contact_name).toBe('Dr. Santos');
      expect(merged.emergency_contact_phone).toBe('0917-123-4567');
      expect(merged.emergency_contact_relationship).toBe('Guardian');
      expect(merged.custom_system_tag).toBe('VIP_PATIENT');
    });

    test('3.4 Immutability: input objects are never mutated', () => {
      const existing = Object.freeze({
        affiliation: 'Student',
        gpa: 3.75,
        member_type: 'MM',
      });
      const values = Object.freeze({
        affiliation: 'Student',
        gpa: '',
      });

      // Calling mergeCustomFieldsForUpdate with frozen objects must not throw TypeError (cannot mutate)
      expect(() => {
        const result = mergeCustomFieldsForUpdate(
          existing as any,
          sampleDefinitions,
          values as any
        );
        expect('gpa' in result).toBe(false);
        expect(result.member_type).toBe('MM');
      }).not.toThrow();
    });

    test('3.5 Preserves valid numeric 0, float 0.0, and boolean false', () => {
      const merged = mergeCustomFieldsForUpdate(
        {},
        sampleDefinitions,
        {
          affiliation: 'Student',
          gpa: 0,
          is_scholar: false,
        }
      );

      expect(merged.gpa).toBe(0);
      expect(merged.is_scholar).toBe(false);
    });

    test('3.6 Purges non-finite numbers (NaN, Infinity, -Infinity) on update', () => {
      const existing = { gpa: 3.5 };
      const mergedNaN = mergeCustomFieldsForUpdate(
        existing,
        sampleDefinitions,
        { affiliation: 'Student', gpa: NaN }
      );
      expect('gpa' in mergedNaN).toBe(false);

      const mergedInf = mergeCustomFieldsForUpdate(
        existing,
        sampleDefinitions,
        { affiliation: 'Student', gpa: Infinity }
      );
      expect('gpa' in mergedInf).toBe(false);
    });
  });

  // =========================================================================
  // 4. validateCustomFields Empirical Stress Tests
  // =========================================================================
  describe('4. validateCustomFields: Required vs Optional, Formats & Messages', () => {
    const requiredNumDef: ClinicCustomFieldDefinition = {
      id: 'num-1',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      entityType: 'ClinicPatient',
      fieldKey: 'systolic_bp',
      label: 'Systolic BP',
      dataType: 'Number',
      isRequired: true,
      displayOrder: 1,
      isActive: true,
    };

    const optionalNumDef: ClinicCustomFieldDefinition = {
      id: 'num-2',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      entityType: 'ClinicPatient',
      fieldKey: 'diastolic_bp',
      label: 'Diastolic BP',
      dataType: 'Number',
      isRequired: false,
      displayOrder: 2,
      isActive: true,
    };

    const staticConditionalDef: ClinicCustomFieldDefinition = {
      id: 'num-3',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      entityType: 'ClinicPatient',
      fieldKey: 'num_pregnancies',
      label: 'Number of Pregnancies',
      dataType: 'Number',
      isRequired: true,
      displayOrder: 3,
      isActive: true,
      visibilityRuleJson: JSON.stringify({
        source: 'static',
        field: 'gender',
        operator: 'equals',
        value: 'Female',
      }),
    };

    test('4.1 Required Number field error message consistency', () => {
      // Empty -> "<Label> is required."
      const resEmpty = validateCustomFields([requiredNumDef], {});
      expect(resEmpty.isValid).toBe(false);
      expect(resEmpty.errors.systolic_bp).toBe('Systolic BP is required.');

      const resWhitespace = validateCustomFields([requiredNumDef], { systolic_bp: '   ' });
      expect(resWhitespace.isValid).toBe(false);
      expect(resWhitespace.errors.systolic_bp).toBe('Systolic BP is required.');

      // Invalid -> "<Label> must be a valid number."
      const invalidValues = ['A', '!$#%', '-', '.', '-.', '12.', '12.34.56', '12a3', NaN, Infinity];
      for (const val of invalidValues) {
        const resInvalid = validateCustomFields([requiredNumDef], { systolic_bp: val });
        expect(resInvalid.isValid).toBe(false);
        expect(resInvalid.errors.systolic_bp).toBe('Systolic BP must be a valid number.');
      }
    });

    test('4.2 Optional Number field error message consistency', () => {
      // Empty optional -> Valid (no error)
      expect(validateCustomFields([optionalNumDef], {}).isValid).toBe(true);
      expect(validateCustomFields([optionalNumDef], { diastolic_bp: '' }).isValid).toBe(true);
      expect(validateCustomFields([optionalNumDef], { diastolic_bp: '   ' }).isValid).toBe(true);
      expect(validateCustomFields([optionalNumDef], { diastolic_bp: null }).isValid).toBe(true);
      expect(validateCustomFields([optionalNumDef], { diastolic_bp: undefined }).isValid).toBe(true);

      // Non-empty invalid optional -> "<Label> must be a valid number."
      const res = validateCustomFields([optionalNumDef], { diastolic_bp: '12.' });
      expect(res.isValid).toBe(false);
      expect(res.errors.diastolic_bp).toBe('Diastolic BP must be a valid number.');
    });

    test('4.3 Valid number inputs pass validation cleanly', () => {
      const validCases = [
        0,
        '0',
        '-0',
        120,
        '120',
        -5,
        '-5',
        98.6,
        '98.6',
        '  120  ',
        '0.05',
        '-0.05',
      ];

      for (const val of validCases) {
        const res = validateCustomFields([requiredNumDef, optionalNumDef], {
          systolic_bp: val,
          diastolic_bp: val,
        });
        expect(res.isValid).toBe(true);
        expect(res.errors.systolic_bp).toBeUndefined();
        expect(res.errors.diastolic_bp).toBeUndefined();
      }
    });

    test('4.4 Conditional visibility: required field hidden by static rule never blocks validation', () => {
      // Patient is Male -> num_pregnancies is hidden
      const staticValues = { gender: 'Male' };
      const res = validateCustomFields(
        [requiredNumDef, staticConditionalDef],
        { systolic_bp: 120 },
        staticValues
      );
      expect(res.isValid).toBe(true);
      expect(res.errors.num_pregnancies).toBeUndefined();

      // Patient is Female -> num_pregnancies is visible and required
      const resFemaleEmpty = validateCustomFields(
        [requiredNumDef, staticConditionalDef],
        { systolic_bp: 120 },
        { gender: 'Female' }
      );
      expect(resFemaleEmpty.isValid).toBe(false);
      expect(resFemaleEmpty.errors.num_pregnancies).toBe('Number of Pregnancies is required.');

      // Patient is Female with invalid number
      const resFemaleInvalid = validateCustomFields(
        [requiredNumDef, staticConditionalDef],
        { systolic_bp: 120, num_pregnancies: 'two' },
        { gender: 'Female' }
      );
      expect(resFemaleInvalid.isValid).toBe(false);
      expect(resFemaleInvalid.errors.num_pregnancies).toBe('Number of Pregnancies must be a valid number.');

      // Patient is Female with valid number
      const resFemaleValid = validateCustomFields(
        [requiredNumDef, staticConditionalDef],
        { systolic_bp: 120, num_pregnancies: 2 },
        { gender: 'Female' }
      );
      expect(resFemaleValid.isValid).toBe(true);
      expect(resFemaleValid.errors.num_pregnancies).toBeUndefined();
    });

    test('4.5 Accumulates all errors across multiple invalid fields', () => {
      const res = validateCustomFields(
        [requiredNumDef, optionalNumDef],
        { systolic_bp: '', diastolic_bp: 'invalid' }
      );
      expect(res.isValid).toBe(false);
      expect(Object.keys(res.errors).length).toBe(2);
      expect(res.errors.systolic_bp).toBe('Systolic BP is required.');
      expect(res.errors.diastolic_bp).toBe('Diastolic BP must be a valid number.');
    });
  });
});
