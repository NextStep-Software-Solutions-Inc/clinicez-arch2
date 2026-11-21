// token-guard:ignore-file
/**
 * Test Suite: Challenger Issue #82 Stress Test Suite (Adversarial Empirical Verification)
 * Author: orchestrator_32_challenger_1 (Frontend Stress Challenger)
 * Scope: BUG-IF-011 Boolean Conditional Visibility, Pill Selection, Payload Sanitization, Malformed Rules, Edge-cases
 */

import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const MockPressable = ({ children, accessibilityState, disabled, testID, ...rest }: any) => {
  return React.createElement(
    'button',
    {
      'data-component': 'Pressable',
      ...(testID ? { 'data-testid': testID } : {}),
      'aria-selected': accessibilityState?.selected ? 'true' : 'false',
      'data-selected': accessibilityState?.selected ? 'true' : 'false',
      disabled,
    },
    children
  );
};

const MockView = ({ children, style, ...rest }: any) => React.createElement('div', rest, children);
const MockText = ({ children, style, allowFontScaling, ...rest }: any) => React.createElement('span', rest, children);

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: MockView,
  Pressable: MockPressable,
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  Text: MockText,
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
  isFieldVisible,
  validateCustomFields,
  sanitizeCustomFieldsPayload,
  parseBooleanState,
  parseBooleanValue,
  default: DynamicCustomFieldsRenderer,
} = await import('../components/custom-fields/DynamicCustomFieldsRenderer');

const {
  normalizeBooleanRuleValue,
  isValidBooleanRuleValue,
  isBooleanTriggerField,
  formatLiveRulePreview,
} = await import('../components/settings/AddEditFieldModal');

const { formatRuleBadgeLabel } = await import('../components/settings/CustomFieldsTab');

import type { ClinicCustomFieldDefinition, VisibilityRule } from '../services/clinicService';

describe('Challenger Issue #82 Stress Test Suite: Adversarial Verification', () => {
  const createDef = (
    fieldKey: string,
    dataType: ClinicCustomFieldDefinition['dataType'],
    rule?: VisibilityRule,
    isRequired: boolean = false,
    order: number = 1
  ): ClinicCustomFieldDefinition => ({
    id: `id-${fieldKey}`,
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    entityType: 'ClinicPatient',
    fieldKey,
    label: `Label for ${fieldKey}`,
    dataType,
    isRequired,
    displayOrder: order,
    isActive: true,
    ...(rule ? { visibilityRuleJson: JSON.stringify(rule) } : {}),
  });

  // =========================================================================
  // 1. Unanswered States across ALL Operators (BUG-IF-011 Prevention)
  // =========================================================================
  describe('1. Unanswered Trigger States across Operators', () => {
    const unansweredInputs = [undefined, null, '', '   ', '\t', '\n'];

    test('1.1: equals true keeps child hidden on all unanswered forms', () => {
      const child = createDef('child', 'Text', { source: 'custom_field', field: 'parent', operator: 'equals', value: 'true' });
      for (const val of unansweredInputs) {
        expect(isFieldVisible(child, { parent: val })).toBe(false);
      }
      expect(isFieldVisible(child, {})).toBe(false);
    });

    test('1.2: equals false keeps child hidden on all unanswered forms', () => {
      const child = createDef('child', 'Text', { source: 'custom_field', field: 'parent', operator: 'equals', value: 'false' });
      for (const val of unansweredInputs) {
        expect(isFieldVisible(child, { parent: val })).toBe(false);
      }
      expect(isFieldVisible(child, {})).toBe(false);
    });

    test('1.3: not_equals false keeps child hidden on all unanswered forms (MUST NOT trigger)', () => {
      const child = createDef('child', 'Text', { source: 'custom_field', field: 'parent', operator: 'not_equals', value: 'false' });
      for (const val of unansweredInputs) {
        expect(isFieldVisible(child, { parent: val })).toBe(false);
      }
      expect(isFieldVisible(child, {})).toBe(false);
    });

    test('1.4: not_equals true keeps child hidden on all unanswered forms (MUST NOT trigger)', () => {
      const child = createDef('child', 'Text', { source: 'custom_field', field: 'parent', operator: 'not_equals', value: 'true' });
      for (const val of unansweredInputs) {
        expect(isFieldVisible(child, { parent: val })).toBe(false);
      }
      expect(isFieldVisible(child, {})).toBe(false);
    });

    test('1.5: in ["true"] keeps child hidden on all unanswered forms', () => {
      const child = createDef('child', 'Text', { source: 'custom_field', field: 'parent', operator: 'in', value: ['true'] });
      for (const val of unansweredInputs) {
        expect(isFieldVisible(child, { parent: val })).toBe(false);
      }
      expect(isFieldVisible(child, {})).toBe(false);
    });

    test('1.6: not_empty keeps child hidden on all unanswered forms', () => {
      const child = createDef('child', 'Text', { source: 'custom_field', field: 'parent', operator: 'not_empty' });
      for (const val of unansweredInputs) {
        expect(isFieldVisible(child, { parent: val })).toBe(false);
      }
      expect(isFieldVisible(child, {})).toBe(false);
    });
  });

  // =========================================================================
  // 2. Weird Boolean Casing & Whitespace Normalization
  // =========================================================================
  describe('2. Weird Boolean Casing & Whitespace Permutations', () => {
    const truthyRepresentations = [
      true, 'true', 'True', 'TRUE', 'tRuE', ' yes ', 'YES', 'Yes', 'yEs',
      ' true ', '\ttrue\n', '  Yes\r\n',
    ];
    const falsyRepresentations = [
      false, 'false', 'False', 'FALSE', 'FaLsE', ' no ', 'NO', 'No', 'nO',
      ' false ', '\tfalse\n', '  No\r\n',
    ];

    test('2.1: parseBooleanState normalizes all casing and whitespace variants accurately', () => {
      for (const val of truthyRepresentations) {
        expect(parseBooleanState(val)).toBe(true);
        expect(parseBooleanValue(val)).toBe(true);
      }
      for (const val of falsyRepresentations) {
        expect(parseBooleanState(val)).toBe(false);
        expect(parseBooleanValue(val)).toBe(false);
      }
    });

    test('2.2: equals true matches all truthy representations and rejects all falsy', () => {
      const child = createDef('child', 'Text', { source: 'custom_field', field: 'parent', operator: 'equals', value: 'true' });
      for (const val of truthyRepresentations) {
        expect(isFieldVisible(child, { parent: val })).toBe(true);
      }
      for (const val of falsyRepresentations) {
        expect(isFieldVisible(child, { parent: val })).toBe(false);
      }
    });

    test('2.3: equals false matches all falsy representations and rejects all truthy', () => {
      const child = createDef('child', 'Text', { source: 'custom_field', field: 'parent', operator: 'equals', value: 'false' });
      for (const val of falsyRepresentations) {
        expect(isFieldVisible(child, { parent: val })).toBe(true);
      }
      for (const val of truthyRepresentations) {
        expect(isFieldVisible(child, { parent: val })).toBe(false);
      }
    });

    test('2.4: rule.value itself with weird casing (e.g. "tRuE", " YES ") parses correctly', () => {
      const childTricky = createDef('child', 'Text', { source: 'custom_field', field: 'parent', operator: 'equals', value: '  tRuE\n' });
      expect(isFieldVisible(childTricky, { parent: true })).toBe(true);
      expect(isFieldVisible(childTricky, { parent: 'yes' })).toBe(true);
      expect(isFieldVisible(childTricky, { parent: false })).toBe(false);

      const childTrickyNo = createDef('child', 'Text', { source: 'custom_field', field: 'parent', operator: 'equals', value: '  NO ' });
      expect(isFieldVisible(childTrickyNo, { parent: false })).toBe(true);
      expect(isFieldVisible(childTrickyNo, { parent: 'no' })).toBe(true);
      expect(isFieldVisible(childTrickyNo, { parent: true })).toBe(false);
    });

    test('2.5: in operator with array containing weird boolean casing', () => {
      const childIn = createDef('child', 'Text', { source: 'custom_field', field: 'parent', operator: 'in', value: [' TrUe ', 'NO'] });
      expect(isFieldVisible(childIn, { parent: true })).toBe(true);
      expect(isFieldVisible(childIn, { parent: 'yes' })).toBe(true);
      expect(isFieldVisible(childIn, { parent: false })).toBe(true);
      expect(isFieldVisible(childIn, { parent: 'no' })).toBe(true);
      expect(isFieldVisible(childIn, { parent: 'other' })).toBe(false);
    });
  });

  // =========================================================================
  // 3. Non-Boolean Values & Hostile Injections
  // =========================================================================
  describe('3. Non-Boolean Values & Hostile Injections', () => {
    const nonBooleanInputs = [
      0, 1, -1, 42, '0', '1', '-1', '42',
      NaN, Infinity, -Infinity,
      {}, { foo: 'bar' }, [], [true], ['true'],
      'maybe', 'unknown', 'null', 'undefined', 'truthy', 'falsy',
    ];

    test('3.1: parseBooleanState returns null for all non-boolean values without throwing', () => {
      for (const val of nonBooleanInputs) {
        expect(parseBooleanState(val)).toBeNull();
      }
    });

    test('3.2: equals true rejects all non-boolean inputs', () => {
      const child = createDef('child', 'Text', { source: 'custom_field', field: 'parent', operator: 'equals', value: 'true' });
      for (const val of nonBooleanInputs) {
        expect(isFieldVisible(child, { parent: val })).toBe(false);
      }
    });

    test('3.3: equals false rejects all non-boolean inputs', () => {
      const child = createDef('child', 'Text', { source: 'custom_field', field: 'parent', operator: 'equals', value: 'false' });
      for (const val of nonBooleanInputs) {
        expect(isFieldVisible(child, { parent: val })).toBe(false);
      }
    });

    test('3.4: not_equals true rejects all non-boolean inputs (does NOT show child)', () => {
      const child = createDef('child', 'Text', { source: 'custom_field', field: 'parent', operator: 'not_equals', value: 'true' });
      for (const val of nonBooleanInputs) {
        expect(isFieldVisible(child, { parent: val })).toBe(false);
      }
    });

    test('3.5: not_equals false rejects all non-boolean inputs (does NOT show child)', () => {
      const child = createDef('child', 'Text', { source: 'custom_field', field: 'parent', operator: 'not_equals', value: 'false' });
      for (const val of nonBooleanInputs) {
        expect(isFieldVisible(child, { parent: val })).toBe(false);
      }
    });

    test('3.6: Numeric zero in non-boolean field evaluates equality correctly without boolean contamination', () => {
      const childNum = createDef('child', 'Text', { source: 'custom_field', field: 'num_field', operator: 'equals', value: '0' });
      expect(isFieldVisible(childNum, { num_field: 0 })).toBe(true);
      expect(isFieldVisible(childNum, { num_field: '0' })).toBe(true);
      expect(isFieldVisible(childNum, { num_field: 1 })).toBe(false);
      expect(isFieldVisible(childNum, { num_field: false })).toBe(false);
    });
  });

  // =========================================================================
  // 4. Empty String Rules & Non-Boolean Invariant Preservation
  // =========================================================================
  describe('4. Empty String Rules & Invariant Preservation', () => {
    test('4.1: ADV-RULE-5 invariant: non-boolean rule with value="" evaluates string empty equality', () => {
      const child = createDef('child', 'Text', { source: 'custom_field', field: 'remarks', operator: 'equals', value: '' });
      expect(isFieldVisible(child, {})).toBe(true);
      expect(isFieldVisible(child, { remarks: '' })).toBe(true);
      expect(isFieldVisible(child, { remarks: '   ' })).toBe(true);
      expect(isFieldVisible(child, { remarks: 'has content' })).toBe(false);
    });

    test('4.2: not_equals on non-boolean field preserves text comparison', () => {
      const child = createDef('child', 'Text', { source: 'custom_field', field: 'category', operator: 'not_equals', value: 'VIP' });
      expect(isFieldVisible(child, { category: 'Regular' })).toBe(true);
      expect(isFieldVisible(child, { category: 'VIP' })).toBe(false);
      expect(isFieldVisible(child, { category: 'vip' })).toBe(false);
    });

    test('4.3: contains on non-boolean field preserves case-insensitive substring search', () => {
      const child = createDef('child', 'Text', { source: 'custom_field', field: 'code', operator: 'contains', value: 'MED' });
      expect(isFieldVisible(child, { code: 'PRE-MED-2026' })).toBe(true);
      expect(isFieldVisible(child, { code: 'ENG-2026' })).toBe(false);
    });
  });

  // =========================================================================
  // 5. Malformed & Corrupted visibilityRuleJson (Fail-Open Safety)
  // =========================================================================
  describe('5. Malformed & Corrupted visibilityRuleJson', () => {
    test('5.1: completely broken JSON fails open (visible)', () => {
      const child = { ...createDef('child', 'Text'), visibilityRuleJson: '{"invalid": json' };
      expect(isFieldVisible(child, {})).toBe(true);
    });

    test('5.2: empty string visibilityRuleJson fails open (visible)', () => {
      const child = { ...createDef('child', 'Text'), visibilityRuleJson: '' };
      expect(isFieldVisible(child, {})).toBe(true);
    });

    test('5.3: "null" JSON string fails open (visible) without throwing TypeError', () => {
      const child = { ...createDef('child', 'Text'), visibilityRuleJson: 'null' };
      expect(isFieldVisible(child, {})).toBe(true);
    });

    test('5.4: non-object JSON ("123", "true", "\\"text\\"") fails open', () => {
      expect(isFieldVisible({ ...createDef('child', 'Text'), visibilityRuleJson: '123' }, {})).toBe(true);
      expect(isFieldVisible({ ...createDef('child', 'Text'), visibilityRuleJson: 'true' }, {})).toBe(true);
      expect(isFieldVisible({ ...createDef('child', 'Text'), visibilityRuleJson: '"str"' }, {})).toBe(true);
    });

    test('5.5: unknown operator fails open to visible', () => {
      const child = createDef('child', 'Text', { source: 'custom_field', field: 'parent', operator: 'regex' as any, value: '.*' });
      expect(isFieldVisible(child, { parent: 'anything' })).toBe(true);
    });
  });

  // =========================================================================
  // 6. Pill Selection & Pre-population Component Highlighting
  // =========================================================================
  describe('6. Pill Selection & Component Highlighting', () => {
    const boolField = createDef('is_insured', 'Boolean');

    const renderPills = (val: any) => {
      const html = renderToStaticMarkup(
        React.createElement(DynamicCustomFieldsRenderer, {
          fields: [boolField],
          values: val !== undefined ? { is_insured: val } : {},
          onChange: () => {},
        })
      );
      const matches = [...html.matchAll(/<button[^>]*data-selected="([^"]+)"[^>]*>/g)];
      const yesSelected = matches[0] ? matches[0][1] === 'true' : false;
      const noSelected = matches[1] ? matches[1][1] === 'true' : false;
      return { yesSelected, noSelected };
    };

    test('6.1: Highlights Yes pill for true, "true", "tRuE", "yes", "YES"', () => {
      for (const val of [true, 'true', 'tRuE', 'yes', 'YES', ' Yes ']) {
        const { yesSelected, noSelected } = renderPills(val);
        expect(yesSelected).toBe(true);
        expect(noSelected).toBe(false);
      }
    });

    test('6.2: Highlights No pill for false, "false", "FaLsE", "no", "NO"', () => {
      for (const val of [false, 'false', 'FaLsE', 'no', 'NO', ' No ']) {
        const { yesSelected, noSelected } = renderPills(val);
        expect(yesSelected).toBe(false);
        expect(noSelected).toBe(true);
      }
    });

    test('6.3: Neither pill selected for unanswered (undefined, null, "", "   ")', () => {
      for (const val of [undefined, null, '', '   ']) {
        const { yesSelected, noSelected } = renderPills(val);
        expect(yesSelected).toBe(false);
        expect(noSelected).toBe(false);
      }
    });

    test('6.4: Neither pill selected for non-boolean inputs (0, 1, "0", "1", "maybe", {}, [])', () => {
      for (const val of [0, 1, '0', '1', 'maybe', {}, []]) {
        const { yesSelected, noSelected } = renderPills(val);
        expect(yesSelected).toBe(false);
        expect(noSelected).toBe(false);
      }
    });
  });

  // =========================================================================
  // 7. Multi-Level Dependent Chaining & Payload Sanitization
  // =========================================================================
  describe('7. Multi-Level Chaining & Payload Sanitization', () => {
    const fieldA = createDef('has_allergy', 'Boolean', undefined, true, 1);
    const fieldB = createDef('allergy_reaction', 'Text', { source: 'custom_field', field: 'has_allergy', operator: 'equals', value: 'true' }, true, 2);
    const fieldC = createDef('epipen_expiry', 'Date', { source: 'custom_field', field: 'has_allergy', operator: 'equals', value: 'true' }, true, 3);
    const defs = [fieldA, fieldB, fieldC];

    test('7.1: When A=true, all dependent children are visible and preserved in payload', () => {
      const values = { has_allergy: true, allergy_reaction: 'Hives', epipen_expiry: '2027-12-31' };
      expect(isFieldVisible(fieldA, values)).toBe(true);
      expect(isFieldVisible(fieldB, values)).toBe(true);
      expect(isFieldVisible(fieldC, values)).toBe(true);

      const clean = sanitizeCustomFieldsPayload(defs, values);
      expect(clean).toEqual({
        has_allergy: true,
        allergy_reaction: 'Hives',
        epipen_expiry: '2027-12-31',
      });
    });

    test('7.2: When A is toggled from true to false, both dependent children B and C are hidden and stripped from payload', () => {
      const dirtyValues = { has_allergy: false, allergy_reaction: 'Hives', epipen_expiry: '2027-12-31' };
      expect(isFieldVisible(fieldA, dirtyValues)).toBe(true);
      expect(isFieldVisible(fieldB, dirtyValues)).toBe(false);
      expect(isFieldVisible(fieldC, dirtyValues)).toBe(false);

      const clean = sanitizeCustomFieldsPayload(defs, dirtyValues);
      expect(clean['allergy_reaction']).toBeUndefined();
      expect(clean['epipen_expiry']).toBeUndefined();
      expect(clean['has_allergy']).toBe(false);
    });

    test('7.3: When A is answered with legacy "No", dependent children are hidden and stripped from payload', () => {
      const legacyValues = { has_allergy: 'No', allergy_reaction: 'Hives', epipen_expiry: '2027-12-31' };
      expect(isFieldVisible(fieldA, legacyValues)).toBe(true);
      expect(isFieldVisible(fieldB, legacyValues)).toBe(false);
      expect(isFieldVisible(fieldC, legacyValues)).toBe(false);

      const clean = sanitizeCustomFieldsPayload(defs, legacyValues);
      expect(clean['allergy_reaction']).toBeUndefined();
      expect(clean['epipen_expiry']).toBeUndefined();
      expect(clean['has_allergy']).toBe('No');
    });

    test('7.4: When A is unanswered, B and C are hidden and do not block validation', () => {
      const values = {};
      expect(isFieldVisible(fieldB, values)).toBe(false);
      expect(isFieldVisible(fieldC, values)).toBe(false);

      const result = validateCustomFields(defs, values);
      expect(result.isValid).toBe(false);
      expect(result.errors['has_allergy']).toBeDefined();
      expect(result.errors['is_anaphylactic']).toBeUndefined();
      expect(result.errors['epipen_expiry']).toBeUndefined();
    });
  });

  // =========================================================================
  // 8. Settings UI Rule Helpers & Live Badge Formatting
  // =========================================================================
  describe('8. Settings UI Rule Helpers & Badges', () => {
    test('8.1: normalizeBooleanRuleValue handles weird inputs safely', () => {
      expect(normalizeBooleanRuleValue(true)).toBe('true');
      expect(normalizeBooleanRuleValue(false)).toBe('false');
      expect(normalizeBooleanRuleValue('tRuE')).toBe('true');
      expect(normalizeBooleanRuleValue(' FaLsE ')).toBe('false');
      expect(normalizeBooleanRuleValue('YES')).toBe('true');
      expect(normalizeBooleanRuleValue('NO')).toBe('false');
      expect(normalizeBooleanRuleValue('random')).toBe('true'); // fallback
      expect(normalizeBooleanRuleValue(null)).toBe('true');
      expect(normalizeBooleanRuleValue(undefined)).toBe('true');
    });

    test('8.2: isValidBooleanRuleValue strictly discriminates booleans', () => {
      expect(isValidBooleanRuleValue(true)).toBe(true);
      expect(isValidBooleanRuleValue(false)).toBe(true);
      expect(isValidBooleanRuleValue('true')).toBe(true);
      expect(isValidBooleanRuleValue('false')).toBe(true);
      expect(isValidBooleanRuleValue('yes')).toBe(true);
      expect(isValidBooleanRuleValue('no')).toBe(true);
      expect(isValidBooleanRuleValue('YES')).toBe(true);
      expect(isValidBooleanRuleValue('NO')).toBe(true);

      expect(isValidBooleanRuleValue('maybe')).toBe(false);
      expect(isValidBooleanRuleValue(0)).toBe(false);
      expect(isValidBooleanRuleValue(1)).toBe(false);
      expect(isValidBooleanRuleValue('0')).toBe(false);
      expect(isValidBooleanRuleValue('')).toBe(false);
      expect(isValidBooleanRuleValue(null)).toBe(false);
    });

    test('8.3: isBooleanTriggerField detects boolean custom field vs non-boolean vs static', () => {
      const fields = [
        { fieldKey: 'is_pregnant', dataType: 'Boolean' as const },
        { fieldKey: 'student_id', dataType: 'Text' as const },
      ];
      expect(isBooleanTriggerField('is_pregnant', fields, 'custom_field')).toBe(true);
      expect(isBooleanTriggerField('student_id', fields, 'custom_field')).toBe(false);
      expect(isBooleanTriggerField('is_pregnant', fields, 'static')).toBe(false);
      expect(isBooleanTriggerField('non_existent', fields, 'custom_field')).toBe(false);
    });

    test('8.4: formatLiveRulePreview produces human-readable Yes/No for boolean parents', () => {
      expect(formatLiveRulePreview('is_insured', 'equals', 'true', true)).toBe("Visible when [is_insured] equals 'Yes'");
      expect(formatLiveRulePreview('is_insured', 'equals', 'false', true)).toBe("Visible when [is_insured] equals 'No'");
      expect(formatLiveRulePreview('is_insured', 'not_empty', '', true)).toBe('If is_insured is not empty');
      expect(formatLiveRulePreview('is_insured', 'equals', '', true)).toBe("Visible when [is_insured] equals '...'");
      expect(formatLiveRulePreview('affiliation', 'equals', 'Student', false)).toBe("Visible when [affiliation] equals 'Student'");
    });

    test('8.5: formatRuleBadgeLabel handles boolean rules with Yes/No, legacy rules, and non-boolean rules', () => {
      const fields = [
        createDef('is_insured', 'Boolean'),
        createDef('dept', 'Text'),
      ];
      expect(formatRuleBadgeLabel({ source: 'custom_field', field: 'is_insured', operator: 'equals', value: 'true' }, fields)).toBe("If is_insured == 'Yes'");
      expect(formatRuleBadgeLabel({ source: 'custom_field', field: 'is_insured', operator: 'not_equals', value: 'false' }, fields)).toBe("If is_insured != 'No'");
      expect(formatRuleBadgeLabel({ source: 'custom_field', field: 'is_insured', operator: 'not_empty' }, fields)).toBe("If is_insured is not empty");
      expect(formatRuleBadgeLabel({ source: 'custom_field', field: 'dept', operator: 'equals', value: 'Cardiology' }, fields)).toBe("If dept == 'Cardiology'");
    });
  });

  // =========================================================================
  // 9. Mandatory Boolean Fields Validation
  // =========================================================================
  describe('9. Mandatory Boolean Field Validation', () => {
    const requiredBool = createDef('has_consent', 'Boolean', undefined, true, 1);

    test('9.1: value=false is a valid answer and does NOT fail validation', () => {
      const res = validateCustomFields([requiredBool], { has_consent: false });
      expect(res.isValid).toBe(true);
      expect(res.errors['has_consent']).toBeUndefined();
    });

    test('9.2: value=true is a valid answer', () => {
      const res = validateCustomFields([requiredBool], { has_consent: true });
      expect(res.isValid).toBe(true);
      expect(res.errors['has_consent']).toBeUndefined();
    });

    test('9.3: value=undefined or null or empty fails validation', () => {
      expect(validateCustomFields([requiredBool], {}).isValid).toBe(false);
      expect(validateCustomFields([requiredBool], { has_consent: null }).isValid).toBe(false);
      expect(validateCustomFields([requiredBool], { has_consent: '' }).isValid).toBe(false);
      expect(validateCustomFields([requiredBool], { has_consent: '   ' }).isValid).toBe(false);
    });
  });
});
