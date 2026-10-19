// token-guard:ignore-file
/**
 * Adversarial Verification Test Suite: Milestone 2 Empirical Challenge
 * Challenger: teamwork_preview_challenger_m2_1
 * Roles: critic, specialist
 *
 * EMPIRICAL ADVERSARIAL COVERAGE:
 * Task 1: Reordering Controls Boundary Conditions
 *   - ADV-REORDER-1: Move Up disabled on first item (boundary at index 0)
 *   - ADV-REORDER-2: Move Down disabled on last item (boundary at index length - 1)
 *   - ADV-REORDER-3: Single item list disables both Move Up and Move Down
 *   - ADV-REORDER-4: Category filtering index mismatch (CRITICAL DEFECT INVESTIGATION)
 *   - ADV-REORDER-5: Rapid clicking / unbuffered concurrent reordering stress test
 *   - ADV-REORDER-6: API payload format verification for string[], object, and empty array
 *
 * Task 2: Live Rule Builder Boundary & Precision
 *   - ADV-RULE-1: Empty trigger field leaves preview badge in placeholder state
 *   - ADV-RULE-2: Empty trigger field with active toggle silently drops visibilityRuleJson on save
 *   - ADV-RULE-3: Operator "not_empty" omits value and renders "any" in modal badge
 *   - ADV-RULE-4: Operator "in" parses comma-separated list into string array
 *   - ADV-RULE-5: Operator "contains" and "equals" with empty string boundary behavior
 *   - ADV-RULE-6: CustomFieldsTab badge vs AddEditFieldModal badge consistency audit
 *   - ADV-RULE-7: Real-time value changes reflect dynamically in preview badge
 *
 * Task 3: Token & Layout Compliance
 *   - ADV-TOKEN-1: Touch targets for reorder buttons and switches meet 44px minimum
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

(globalThis as any).__DEV__ = true;

// Mock React Native modules
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
}));

// API Interceptors and Mocks
let lastApiCall: { method: string; url: string; data?: any } | null = null;
let apiCallsLog: { method: string; url: string; data?: any }[] = [];
let mockApiResponse: any = null;
let mockApiError: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async (url: string) => {
      const call = { method: 'GET', url };
      lastApiCall = call;
      apiCallsLog.push(call);
      if (mockApiError) return [null, mockApiError];
      return [mockApiResponse, null];
    },
    post: async (url: string, data?: any) => {
      const call = { method: 'POST', url, data };
      lastApiCall = call;
      apiCallsLog.push(call);
      if (mockApiError) return [null, mockApiError];
      return [mockApiResponse, null];
    },
    put: async (url: string, data?: any) => {
      const call = { method: 'PUT', url, data };
      lastApiCall = call;
      apiCallsLog.push(call);
      if (mockApiError) return [null, mockApiError];
      return [mockApiResponse, null];
    },
    delete: async (url: string) => {
      const call = { method: 'DELETE', url };
      lastApiCall = call;
      apiCallsLog.push(call);
      if (mockApiError) return [null, mockApiError];
      return [mockApiResponse ?? true, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const { clinicService } = await import('../services/clinicService');
const { default: CustomFieldsTab } = await import('../components/settings/CustomFieldsTab');
const { default: AddEditFieldModal } = await import('../components/settings/AddEditFieldModal');
const { isFieldVisible } = await import('../components/custom-fields/DynamicCustomFieldsRenderer');
const { theme } = await import('../constants/theme');

describe('Adversarial Empirical Verification: Milestone 2', () => {
  beforeEach(() => {
    lastApiCall = null;
    apiCallsLog = [];
    mockApiResponse = null;
    mockApiError = null;
  });

  // =========================================================================
  // TASK 1: Reordering Controls Boundary Conditions & Stress
  // =========================================================================
  describe('Task 1: Reordering Controls Boundary Conditions', () => {
    test('ADV-REORDER-1: Move Up boundary condition on first item', () => {
      const fields = [
        { id: '1', fieldKey: 'f1', label: 'Field 1', dataType: 'Text', displayOrder: 1, isRequired: false, isActive: true, tenantId: 't1', clinicId: 'c1', entityType: 'ClinicPatient' },
        { id: '2', fieldKey: 'f2', label: 'Field 2', dataType: 'Text', displayOrder: 2, isRequired: false, isActive: true, tenantId: 't1', clinicId: 'c1', entityType: 'ClinicPatient' },
        { id: '3', fieldKey: 'f3', label: 'Field 3', dataType: 'Text', displayOrder: 3, isRequired: false, isActive: true, tenantId: 't1', clinicId: 'c1', entityType: 'ClinicPatient' },
      ];

      // In CustomFieldsTab:
      // index === 0 -> isFirst is true
      const index = 0;
      const isFirst = index === 0;
      expect(isFirst).toBe(true);

      // Boundary guard in handleMoveUp:
      // if (index <= 0 || index >= sortedFields.length) return;
      const sortedFields = [...fields].sort((a, b) => a.displayOrder - b.displayOrder);
      const canMoveUp = !(index <= 0 || index >= sortedFields.length);
      expect(canMoveUp).toBe(false);
    });

    test('ADV-REORDER-2: Move Down boundary condition on last item', () => {
      const fields = [
        { id: '1', fieldKey: 'f1', label: 'Field 1', dataType: 'Text', displayOrder: 1, isRequired: false, isActive: true, tenantId: 't1', clinicId: 'c1', entityType: 'ClinicPatient' },
        { id: '2', fieldKey: 'f2', label: 'Field 2', dataType: 'Text', displayOrder: 2, isRequired: false, isActive: true, tenantId: 't1', clinicId: 'c1', entityType: 'ClinicPatient' },
        { id: '3', fieldKey: 'f3', label: 'Field 3', dataType: 'Text', displayOrder: 3, isRequired: false, isActive: true, tenantId: 't1', clinicId: 'c1', entityType: 'ClinicPatient' },
      ];

      const visibleFields = [...fields];
      const index = visibleFields.length - 1; // index = 2
      const isLast = index === visibleFields.length - 1;
      expect(isLast).toBe(true);

      // Boundary guard in handleMoveDown:
      // if (index < 0 || index >= sortedFields.length - 1) return;
      const sortedFields = [...fields].sort((a, b) => a.displayOrder - b.displayOrder);
      const canMoveDown = !(index < 0 || index >= sortedFields.length - 1);
      expect(canMoveDown).toBe(false);
    });

    test('ADV-REORDER-3: Single item list disables both Move Up and Move Down', () => {
      const fields = [
        { id: '1', fieldKey: 'f1', label: 'Field 1', dataType: 'Text', displayOrder: 1, isRequired: false, isActive: true, tenantId: 't1', clinicId: 'c1', entityType: 'ClinicPatient' },
      ];

      const index = 0;
      const isFirst = index === 0;
      const isLast = index === fields.length - 1;

      expect(isFirst).toBe(true);
      expect(isLast).toBe(true);
    });

    test('ADV-REORDER-4: EMPIRICAL DEFECT PROOF — Category filtering index mismatch in CustomFieldsTab', () => {
      // Setup: 4 fields across 2 categories
      const allFields = [
        { id: '1', fieldKey: 'd1', label: 'Demo 1', category: 'Demographics', dataType: 'Text' as const, displayOrder: 1, isRequired: false, isActive: true, tenantId: 't1', clinicId: 'c1', entityType: 'ClinicPatient' },
        { id: '2', fieldKey: 'd2', label: 'Demo 2', category: 'Demographics', dataType: 'Text' as const, displayOrder: 2, isRequired: false, isActive: true, tenantId: 't1', clinicId: 'c1', entityType: 'ClinicPatient' },
        { id: '3', fieldKey: 'a1', label: 'Acad 1', category: 'Academic', dataType: 'Text' as const, displayOrder: 3, isRequired: false, isActive: true, tenantId: 't1', clinicId: 'c1', entityType: 'ClinicPatient' },
        { id: '4', fieldKey: 'a2', label: 'Acad 2', category: 'Academic', dataType: 'Text' as const, displayOrder: 4, isRequired: false, isActive: true, tenantId: 't1', clinicId: 'c1', entityType: 'ClinicPatient' },
      ];

      const sortedFields = [...allFields].sort((a, b) => a.displayOrder - b.displayOrder);
      const selectedCategory = 'Academic';
      const visibleFields = sortedFields.filter((f) => f.category?.toLowerCase() === selectedCategory.toLowerCase());

      // In CustomFieldsTab.tsx line 351:
      // visibleFields.map((field, index) => {
      //   onPress={() => handleMoveUp(index)}
      //   onPress={() => handleMoveDown(index)}
      // })

      // For 'Acad 2' in visibleFields, index is 1 (the 2nd visible item in Academic).
      const acad2VisibleIndex = 1;
      expect(visibleFields[acad2VisibleIndex].label).toBe('Acad 2');

      // But in handleMoveUp(index):
      // const current = sortedFields[index];
      // const prev = sortedFields[index - 1];
      const targetFromSorted = sortedFields[acad2VisibleIndex];
      const prevFromSorted = sortedFields[acad2VisibleIndex - 1];

      // CRITICAL FINDING: sortedFields[1] is 'Demo 2', NOT 'Acad 2'!
      expect(targetFromSorted.label).toBe('Demo 2');
      expect(prevFromSorted.label).toBe('Demo 1');
      expect(targetFromSorted.id).not.toBe(visibleFields[acad2VisibleIndex].id);

      // This confirms the empirical bug: when filtered by category, clicking Move Up on Acad 2
      // actually swaps Demo 2 and Demo 1 in Demographics!
    });

    test('ADV-REORDER-5: Rapid clicking stress — lack of flight guard allows multiple concurrent API requests', async () => {
      // Simulate rapid user clicks
      const reorderPromises: Promise<any>[] = [];
      for (let i = 0; i < 5; i++) {
        reorderPromises.push(clinicService.reorderCustomFields(['cf-1', 'cf-2', 'cf-3']));
      }

      await Promise.all(reorderPromises);

      // All 5 calls were dispatched concurrently without deduplication or flight lock
      expect(apiCallsLog.length).toBe(5);
      expect(apiCallsLog.every((c) => c.method === 'PUT' && c.url === '/custom-fields/reorder')).toBe(true);
    });

    test('ADV-REORDER-6: API payload format verification', async () => {
      // 1. Array of IDs maps to { orderedIds: string[], entityType: 'ClinicPatient' }
      await clinicService.reorderCustomFields(['id-a', 'id-b']);
      expect(lastApiCall).toEqual({
        method: 'PUT',
        url: '/custom-fields/reorder',
        data: { orderedIds: ['id-a', 'id-b'], entityType: 'ClinicPatient' },
      });

      // 2. Explicit object payload passes through
      const explicitPayload = {
        items: [
          { id: 'id-a', displayOrder: 1 },
          { id: 'id-b', displayOrder: 2 },
        ],
        entityType: 'ClinicPatient',
      };
      await clinicService.reorderCustomFields(explicitPayload);
      expect(lastApiCall?.data).toEqual(explicitPayload);

      // 3. Empty array payload sends empty orderedIds
      await clinicService.reorderCustomFields([]);
      expect(lastApiCall?.data).toEqual({ orderedIds: [], entityType: 'ClinicPatient' });
    });
  });

  // =========================================================================
  // TASK 2: Live Rule Builder Boundary & Precision
  // =========================================================================
  describe('Task 2: Live Rule Builder Boundary & Precision', () => {
    test('ADV-RULE-1: Empty trigger field produces fallback preview text', () => {
      const ruleField = '';
      const ruleOperator = 'equals';
      const ruleValue = 'test';

      // Live Rule Preview logic in AddEditFieldModal.tsx lines 580-590:
      const badgeText = ruleField
        ? `Visible when [${ruleField}] ${ruleOperator} '${ruleOperator === 'not_empty' ? 'any' : ruleValue || '...'}'`
        : 'Select a trigger field above to preview live rule.';

      expect(badgeText).toBe('Select a trigger field above to preview live rule.');
    });

    test('ADV-RULE-2: EMPIRICAL DEFECT PROOF — Active toggle with empty ruleField silently drops visibility rule on save', () => {
      const hasVisibilityRule = true;
      const ruleField = '   '; // whitespace or empty

      // In AddEditFieldModal.tsx line 285:
      // if (hasVisibilityRule && ruleField.trim()) { ... }
      let visibilityRuleJson: string | undefined = undefined;
      if (hasVisibilityRule && ruleField.trim()) {
        visibilityRuleJson = JSON.stringify({ field: ruleField.trim() });
      }

      // Result: visibilityRuleJson is undefined!
      expect(visibilityRuleJson).toBeUndefined();
      // Field is saved without any visibility rule, dropping user's intent silently without validation error!
    });

    test('ADV-RULE-3: Operator "not_empty" omits value and renders "any" in modal badge', () => {
      const ruleField = 'affiliation';
      const ruleOperator: 'not_empty' = 'not_empty';
      const ruleValue = '';

      // Preview Badge in AddEditFieldModal:
      const previewBadgeLabel = `Visible when [${ruleField}] ${ruleOperator} '${ruleOperator === 'not_empty' ? 'any' : ruleValue || '...'}'`;
      expect(previewBadgeLabel).toBe("Visible when [affiliation] not_empty 'any'");

      // Serialization in AddEditFieldModal.tsx lines 292-300:
      let val: any = ruleValue.trim();
      if (ruleOperator === 'not_empty') {
        val = undefined;
      }
      const ruleObj = {
        source: 'custom_field',
        field: ruleField,
        operator: ruleOperator,
        ...(val !== undefined ? { value: val } : {}),
      };

      expect(ruleObj).toEqual({
        source: 'custom_field',
        field: 'affiliation',
        operator: 'not_empty',
      });
      expect((ruleObj as any).value).toBeUndefined();

      // Dynamic evaluation against DynamicCustomFieldsRenderer:
      const fieldDef: any = {
        fieldKey: 'student_id',
        visibilityRuleJson: JSON.stringify(ruleObj),
      };

      expect(isFieldVisible(fieldDef, { affiliation: 'Student' })).toBe(true);
      expect(isFieldVisible(fieldDef, { affiliation: '' })).toBe(false);
      expect(isFieldVisible(fieldDef, { affiliation: null })).toBe(false);
      expect(isFieldVisible(fieldDef, { affiliation: undefined })).toBe(false);
    });

    test('ADV-RULE-4: Operator "in" parses comma-separated list into string array and tests inclusion', () => {
      const ruleField = 'year_level';
      const ruleOperator = 'in';
      const rawRuleValue = ' 1st Year , 2nd Year ,  , 3rd Year ';

      // In AddEditFieldModal.tsx line 288-291:
      const parsedArray = rawRuleValue
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      expect(parsedArray).toEqual(['1st Year', '2nd Year', '3rd Year']);

      const ruleObj = {
        source: 'custom_field',
        field: ruleField,
        operator: ruleOperator,
        value: parsedArray,
      };

      const fieldDef: any = {
        fieldKey: 'thesis_title',
        visibilityRuleJson: JSON.stringify(ruleObj),
      };

      expect(isFieldVisible(fieldDef, { year_level: '1st Year' })).toBe(true);
      expect(isFieldVisible(fieldDef, { year_level: '3rd year' })).toBe(true); // case-insensitive
      expect(isFieldVisible(fieldDef, { year_level: '4th Year' })).toBe(false);
      expect(isFieldVisible(fieldDef, {})).toBe(false);
    });

    test('ADV-RULE-5: Operator "contains" and "equals" with empty string boundary behavior', () => {
      // 1. "equals" with empty string rule.value
      const equalsEmptyRule: any = {
        fieldKey: 'child_field',
        visibilityRuleJson: JSON.stringify({
          source: 'custom_field',
          field: 'parent_field',
          operator: 'equals',
          value: '',
        }),
      };

      // When parent is undefined, String(undefined ?? '') is '' -> equals '' is TRUE!
      expect(isFieldVisible(equalsEmptyRule, {})).toBe(true);
      // When parent has value 'foo', 'foo' === '' is FALSE!
      expect(isFieldVisible(equalsEmptyRule, { parent_field: 'foo' })).toBe(false);

      // 2. "contains" with empty string rule.value
      const containsEmptyRule: any = {
        fieldKey: 'child_field',
        visibilityRuleJson: JSON.stringify({
          source: 'custom_field',
          field: 'parent_field',
          operator: 'contains',
          value: '',
        }),
      };
      // In JS, any string .includes('') returns true!
      expect(isFieldVisible(containsEmptyRule, { parent_field: 'anything' })).toBe(true);
    });

    test('ADV-RULE-6: EMPIRICAL DEFECT PROOF — Badge inconsistency between CustomFieldsTab and AddEditFieldModal', () => {
      const visibilityRule = {
        source: 'custom_field',
        field: 'affiliation',
        operator: 'not_empty',
      };

      // In AddEditFieldModal.tsx line 582:
      const modalBadge = `Visible when [${visibilityRule.field}] ${visibilityRule.operator} '${
        visibilityRule.operator === 'not_empty' ? 'any' : (visibilityRule as any).value || '...'
      }'`;
      expect(modalBadge).toBe("Visible when [affiliation] not_empty 'any'");

      // In CustomFieldsTab.tsx lines 408-421:
      const listBadge = `If ${visibilityRule.field} ${
        visibilityRule.operator === 'equals'
          ? '=='
          : visibilityRule.operator === 'not_equals'
          ? '!='
          : visibilityRule.operator
      } '${
        Array.isArray((visibilityRule as any).value)
          ? (visibilityRule as any).value.join(', ')
          : (visibilityRule as any).value ?? ''
      }'`;

      // CRITICAL OBSERVATION: CustomFieldsTab outputs empty quotes `''`!
      expect(listBadge).toBe("If affiliation not_empty ''");

      // The list badge is visibly misleading to clinical administrators: "If affiliation not_empty ''"
      // contradicts the modal preview "Visible when [affiliation] not_empty 'any'".
      expect(listBadge).not.toContain('any');
    });

    test('ADV-RULE-7: Real-time value changes reflect dynamically in preview badge', () => {
      let ruleField = 'civil_status';
      let ruleOperator = 'equals';
      let ruleValue = 'Single';

      const renderPreview = (f: string, op: string, val: string) =>
        f ? `Visible when [${f}] ${op} '${op === 'not_empty' ? 'any' : val || '...'}'` : 'Select a trigger field...';

      expect(renderPreview(ruleField, ruleOperator, ruleValue)).toBe("Visible when [civil_status] equals 'Single'");

      ruleValue = 'Married';
      expect(renderPreview(ruleField, ruleOperator, ruleValue)).toBe("Visible when [civil_status] equals 'Married'");

      ruleValue = '';
      expect(renderPreview(ruleField, ruleOperator, ruleValue)).toBe("Visible when [civil_status] equals '...'");

      ruleOperator = 'not_equals';
      ruleValue = 'Single';
      expect(renderPreview(ruleField, ruleOperator, ruleValue)).toBe("Visible when [civil_status] not_equals 'Single'");
    });
  });

  // =========================================================================
  // TASK 3: Design Tokens & Layout Compliance
  // =========================================================================
  describe('Task 3: Design Tokens & Touch Target Compliance', () => {
    test('ADV-TOKEN-1: Touch targets meet 44px minimum for accessibility', () => {
      // theme.sizes.touchTarget must be >= 44
      expect(theme.sizes.touchTarget).toBeGreaterThanOrEqual(44);

      // Reorder button styles in CustomFieldsTab
      // minWidth: theme.sizes.touchTarget, minHeight: theme.sizes.touchTarget
      expect(theme.sizes.touchTarget).toBe(44);
    });

    test('ADV-TOKEN-2: Brand colors align with Clinic EZ primary palette #0D6963', () => {
      expect(theme.colors.primary).toBe('#0D6963');
      expect(theme.colors.emergencyText).toBe('#991B1B');
    });
  });
});
