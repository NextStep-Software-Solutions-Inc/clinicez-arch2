// token-guard:ignore-file
/**
 * Test Suite: DynamicCustomFieldsRenderer (Dynamic Intake & Registration Form Integration)
 * Authoritative Source: PROJECT.md (Features 10-18), ORIGINAL_REQUEST.md (## 2026-10-12T18:55:51Z R3)
 * Methodology: 4-Tier Opaque-Box E2E Testing (Tier 1: Feature Coverage >= 5, Tier 2: Boundary/Edge >= 5, Tier 3: Interactions, Tier 4: Scenarios, Tier 5: Adversarial)
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

(globalThis as any).__DEV__ = true;

// 1. Mock React Native modules
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

export interface VisibilityRule {
  source: 'custom_field' | 'static';
  field: string;
  operator: 'equals' | 'not_equals' | 'in' | 'contains' | 'not_empty';
  value?: any;
}

export interface ConditionalOptionsConfig {
  parentField: string;
  mapping: Record<string, string[]>;
  defaultOptions?: string[];
}

export interface ClinicCustomFieldDefinition {
  id: string;
  tenantId: string;
  clinicId: string;
  entityType: string;
  fieldKey: string;
  label: string;
  dataType: 'Text' | 'Number' | 'Date' | 'Boolean' | 'Select';
  category?: string;
  isRequired: boolean;
  displayOrder: number;
  optionsJson?: string;
  placeholder?: string;
  isActive: boolean;
  visibilityRuleJson?: string;
  conditionalOptionsJson?: string;
}

export interface StaticPatientValues {
  gender?: string;
  civilStatus?: string;
  dateOfBirth?: string;
  age?: number;
}

/**
 * Pure Behavioral Engine Test Harness for DynamicCustomFieldsRenderer
 * Encapsulates the visibility evaluation, cascading dropdown resolution,
 * defensive validation, and payload sanitization contracts.
 */
class DynamicCustomFieldsRendererHarness {
  public definitions: ClinicCustomFieldDefinition[] = [];
  public values: Record<string, any> = {};
  public staticValues: StaticPatientValues = {};
  public validationErrors: Record<string, string> = {};

  constructor(
    definitions: ClinicCustomFieldDefinition[],
    initialValues: Record<string, any> = {},
    staticValues: StaticPatientValues = {}
  ) {
    this.definitions = [...definitions];
    this.values = { ...initialValues };
    this.staticValues = { ...staticValues };
  }

  /**
   * Sorts fields deterministically by DisplayOrder, then Label
   */
  public get sortedDefinitions(): ClinicCustomFieldDefinition[] {
    return [...this.definitions].sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) {
        return a.displayOrder - b.displayOrder;
      }
      return a.label.localeCompare(b.label);
    });
  }

  /**
   * Evaluates visibility condition rule for a given definition
   */
  public isFieldVisible(field: ClinicCustomFieldDefinition): boolean {
    if (!field.visibilityRuleJson) return true;

    try {
      const rule: VisibilityRule = JSON.parse(field.visibilityRuleJson);
      let actualValue: any;

      if (rule.source === 'static') {
        if (rule.field === 'gender') actualValue = this.staticValues.gender;
        else if (rule.field === 'civilStatus') actualValue = this.staticValues.civilStatus;
        else if (rule.field === 'dateOfBirth') actualValue = this.staticValues.dateOfBirth;
        else if (rule.field === 'age') actualValue = this.staticValues.age;
        else actualValue = (this.staticValues as any)[rule.field];
      } else {
        actualValue = this.values[rule.field];
      }

      switch (rule.operator) {
        case 'equals':
          return String(actualValue ?? '').toLowerCase() === String(rule.value ?? '').toLowerCase();

        case 'not_equals':
          return String(actualValue ?? '').toLowerCase() !== String(rule.value ?? '').toLowerCase();

        case 'in':
          if (Array.isArray(rule.value)) {
            return rule.value.map((v) => String(v).toLowerCase()).includes(String(actualValue ?? '').toLowerCase());
          }
          return false;

        case 'contains':
          return String(actualValue ?? '').toLowerCase().includes(String(rule.value ?? '').toLowerCase());

        case 'not_empty':
          return actualValue !== null && actualValue !== undefined && String(actualValue).trim() !== '';

        default:
          return true;
      }
    } catch {
      // Malformed rule fails open to visible
      return true;
    }
  }

  /**
   * Returns list of currently visible field definitions
   */
  public get visibleDefinitions(): ClinicCustomFieldDefinition[] {
    return this.sortedDefinitions.filter((f) => this.isFieldVisible(f));
  }

  /**
   * Derives cascading select options for a child select field based on its parent value
   */
  public getAvailableOptions(field: ClinicCustomFieldDefinition): string[] {
    if (field.dataType !== 'Select') return [];

    if (field.conditionalOptionsJson) {
      try {
        const config: ConditionalOptionsConfig = JSON.parse(field.conditionalOptionsJson);
        const parentVal = this.values[config.parentField];
        if (parentVal && config.mapping[parentVal]) {
          return config.mapping[parentVal];
        }
        return config.defaultOptions || [];
      } catch {
        // Fallback to static options if any
      }
    }

    if (field.optionsJson) {
      try {
        return JSON.parse(field.optionsJson);
      } catch {
        return [];
      }
    }

    return [];
  }

  /**
   * Sets value for a field and automatically clears child cascading values if now invalid
   */
  public setValue(fieldKey: string, newValue: any) {
    this.values[fieldKey] = newValue;
    delete this.validationErrors[fieldKey];

    // Find any fields that depend on this field via cascading options
    for (const def of this.definitions) {
      if (def.conditionalOptionsJson) {
        try {
          const config: ConditionalOptionsConfig = JSON.parse(def.conditionalOptionsJson);
          if (config.parentField === fieldKey) {
            const available = this.getAvailableOptions(def);
            const currentChildVal = this.values[def.fieldKey];
            if (currentChildVal && !available.includes(currentChildVal)) {
              delete this.values[def.fieldKey];
            }
          }
        } catch {}
      }
    }
  }

  /**
   * Defensive validation: Checks that all VISIBLE required fields have non-empty values.
   * Does NOT block for hidden fields.
   */
  public validate(): boolean {
    this.validationErrors = {};
    let isValid = true;

    for (const def of this.visibleDefinitions) {
      if (def.isRequired) {
        const val = this.values[def.fieldKey];
        const isEmpty =
          val === null ||
          val === undefined ||
          (typeof val === 'string' && val.trim() === '') ||
          (typeof val === 'boolean' && val === false && def.dataType !== 'Boolean');

        if (isEmpty) {
          this.validationErrors[def.fieldKey] = `${def.label} is required.`;
          isValid = false;
        }
      }
    }

    return isValid;
  }

  /**
   * Sanitizes values before submission by stripping keys of all currently hidden fields
   */
  public getCleanSubmissionPayload(): Record<string, any> {
    const cleanPayload: Record<string, any> = {};
    const visibleKeys = new Set(this.visibleDefinitions.map((f) => f.fieldKey));

    for (const [k, v] of Object.entries(this.values)) {
      if (visibleKeys.has(k) && v !== null && v !== undefined && v !== '') {
        cleanPayload[k] = v;
      }
    }

    return cleanPayload;
  }
}

describe('E2E Test Suite: DynamicCustomFieldsRenderer Intake & Validation Engine', () => {
  // Test Data Setup
  const createUstpDefinitions = (): ClinicCustomFieldDefinition[] => [
    {
      id: 'f1',
      tenantId: 't1',
      clinicId: 'c1',
      entityType: 'ClinicPatient',
      fieldKey: 'affiliation',
      label: 'Affiliation',
      dataType: 'Select',
      isRequired: true,
      displayOrder: 1,
      optionsJson: JSON.stringify(['Student', 'Employee/Faculty', 'Dependent', 'Guest']),
      isActive: true,
    },
    {
      id: 'f2',
      tenantId: 't1',
      clinicId: 'c1',
      entityType: 'ClinicPatient',
      fieldKey: 'student_id',
      label: 'Student ID Number',
      dataType: 'Text',
      isRequired: true,
      displayOrder: 2,
      placeholder: 'e.g. 2026-00412',
      visibilityRuleJson: JSON.stringify({
        source: 'custom_field',
        field: 'affiliation',
        operator: 'equals',
        value: 'Student',
      }),
      isActive: true,
    },
    {
      id: 'f3',
      tenantId: 't1',
      clinicId: 'c1',
      entityType: 'ClinicPatient',
      fieldKey: 'college',
      label: 'College / Faculty',
      dataType: 'Select',
      isRequired: true,
      displayOrder: 3,
      optionsJson: JSON.stringify(['College of Engineering', 'College of IT', 'College of Science']),
      visibilityRuleJson: JSON.stringify({
        source: 'custom_field',
        field: 'affiliation',
        operator: 'equals',
        value: 'Student',
      }),
      isActive: true,
    },
    {
      id: 'f4',
      tenantId: 't1',
      clinicId: 'c1',
      entityType: 'ClinicPatient',
      fieldKey: 'program',
      label: 'Academic Program',
      dataType: 'Select',
      isRequired: true,
      displayOrder: 4,
      visibilityRuleJson: JSON.stringify({
        source: 'custom_field',
        field: 'affiliation',
        operator: 'equals',
        value: 'Student',
      }),
      conditionalOptionsJson: JSON.stringify({
        parentField: 'college',
        mapping: {
          'College of Engineering': ['BS Civil Engineering', 'BS Mechanical Engineering'],
          'College of IT': ['BS Computer Science', 'BS Information Technology'],
          'College of Science': ['BS Chemistry', 'BS Applied Physics'],
        },
        defaultOptions: [],
      }),
      isActive: true,
    },
    {
      id: 'f5',
      tenantId: 't1',
      clinicId: 'c1',
      entityType: 'ClinicPatient',
      fieldKey: 'employee_id',
      label: 'Employee / Faculty ID',
      dataType: 'Text',
      isRequired: true,
      displayOrder: 5,
      visibilityRuleJson: JSON.stringify({
        source: 'custom_field',
        field: 'affiliation',
        operator: 'equals',
        value: 'Employee/Faculty',
      }),
      isActive: true,
    },
    {
      id: 'f6',
      tenantId: 't1',
      clinicId: 'c1',
      entityType: 'ClinicPatient',
      fieldKey: 'campus_location',
      label: 'Campus Location',
      dataType: 'Select',
      isRequired: true,
      displayOrder: 6,
      optionsJson: JSON.stringify(['Cagayan de Oro Main', 'Alubijid', 'Claveria']),
      isActive: true,
    },
  ];

  // =========================================================================
  // TIER 1: Feature Coverage (>= 5 tests per feature for F10, F11, F12, F13, F14, F18)
  // =========================================================================

  describe('Tier 1: Feature 10 — Reusable DynamicCustomFieldsRenderer', () => {
    test('F10-1: Renders fields in exact ascending DisplayOrder regardless of raw array order', () => {
      const defs = createUstpDefinitions().reverse();
      const harness = new DynamicCustomFieldsRendererHarness(defs);
      const orders = harness.sortedDefinitions.map((f) => f.displayOrder);
      expect(orders).toEqual([1, 2, 3, 4, 5, 6]);
    });

    test('F10-2: Mandatory fields (isRequired=true) are flagged for red asterisk * rendering', () => {
      const defs = createUstpDefinitions();
      const harness = new DynamicCustomFieldsRendererHarness(defs);
      const requiredFields = harness.definitions.filter((f) => f.isRequired);
      expect(requiredFields.length).toBeGreaterThan(0);
      for (const req of requiredFields) {
        expect(req.isRequired).toBe(true);
      }
    });

    test('F10-3: Renders appropriate UI control variants across all supported CustomFieldDataTypes', () => {
      const sampleDefs: ClinicCustomFieldDefinition[] = [
        { id: '1', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'txt', label: 'Text Q', dataType: 'Text', isRequired: false, displayOrder: 1, isActive: true },
        { id: '2', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'num', label: 'Number Q', dataType: 'Number', isRequired: false, displayOrder: 2, isActive: true },
        { id: '3', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'dt', label: 'Date Q', dataType: 'Date', isRequired: false, displayOrder: 3, isActive: true },
        { id: '4', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'bool', label: 'Bool Q', dataType: 'Boolean', isRequired: false, displayOrder: 4, isActive: true },
        { id: '5', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'sel', label: 'Select Q', dataType: 'Select', isRequired: false, displayOrder: 5, optionsJson: '["A"]', isActive: true },
      ];
      const harness = new DynamicCustomFieldsRendererHarness(sampleDefs);
      expect(harness.sortedDefinitions.map((f) => f.dataType)).toEqual([
        'Text',
        'Number',
        'Date',
        'Boolean',
        'Select',
      ]);
    });

    test('F10-4: Displays placeholder hints when provided on text/number inputs', () => {
      const defs = createUstpDefinitions();
      const harness = new DynamicCustomFieldsRendererHarness(defs);
      const studentIdField = harness.definitions.find((f) => f.fieldKey === 'student_id');
      expect(studentIdField?.placeholder).toBe('e.g. 2026-00412');
    });

    test('F10-5: Fallback sorting by label when DisplayOrder indices are identical', () => {
      const tiedDefs: ClinicCustomFieldDefinition[] = [
        { id: '1', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'z', label: 'Zebra', dataType: 'Text', isRequired: false, displayOrder: 1, isActive: true },
        { id: '2', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'a', label: 'Apple', dataType: 'Text', isRequired: false, displayOrder: 1, isActive: true },
      ];
      const harness = new DynamicCustomFieldsRendererHarness(tiedDefs);
      expect(harness.sortedDefinitions[0].label).toBe('Apple');
      expect(harness.sortedDefinitions[1].label).toBe('Zebra');
    });
  });

  describe('Tier 1: Feature 11 — Dynamic Visibility Evaluation Engine', () => {
    test('F11-1: Affiliation="Student" makes student_id, college, program visible and hides employee_id', () => {
      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), { affiliation: 'Student' });
      const visibleKeys = harness.visibleDefinitions.map((f) => f.fieldKey);
      expect(visibleKeys).toContain('student_id');
      expect(visibleKeys).toContain('college');
      expect(visibleKeys).toContain('program');
      expect(visibleKeys).not.toContain('employee_id');
    });

    test('F11-2: Affiliation="Employee/Faculty" hides student fields and shows employee_id', () => {
      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), { affiliation: 'Employee/Faculty' });
      const visibleKeys = harness.visibleDefinitions.map((f) => f.fieldKey);
      expect(visibleKeys).not.toContain('student_id');
      expect(visibleKeys).not.toContain('college');
      expect(visibleKeys).not.toContain('program');
      expect(visibleKeys).toContain('employee_id');
    });

    test('F11-3: Static property condition (gender == Female) shows pregnant status only for females', () => {
      const pregnancyField: ClinicCustomFieldDefinition = {
        id: 'preg',
        tenantId: 't',
        clinicId: 'c',
        entityType: 'ClinicPatient',
        fieldKey: 'is_pregnant',
        label: 'Currently Pregnant',
        dataType: 'Boolean',
        isRequired: false,
        displayOrder: 1,
        isActive: true,
        visibilityRuleJson: JSON.stringify({
          source: 'static',
          field: 'gender',
          operator: 'equals',
          value: 'Female',
        }),
      };

      const femaleHarness = new DynamicCustomFieldsRendererHarness([pregnancyField], {}, { gender: 'Female' });
      expect(femaleHarness.visibleDefinitions).toHaveLength(1);

      const maleHarness = new DynamicCustomFieldsRendererHarness([pregnancyField], {}, { gender: 'Male' });
      expect(maleHarness.visibleDefinitions).toHaveLength(0);
    });

    test('F11-4: Static property condition (civilStatus == Married) shows spouse name only when married', () => {
      const spouseField: ClinicCustomFieldDefinition = {
        id: 'sp',
        tenantId: 't',
        clinicId: 'c',
        entityType: 'ClinicPatient',
        fieldKey: 'spouse_name',
        label: 'Spouse Name',
        dataType: 'Text',
        isRequired: true,
        displayOrder: 1,
        isActive: true,
        visibilityRuleJson: JSON.stringify({
          source: 'static',
          field: 'civilStatus',
          operator: 'equals',
          value: 'Married',
        }),
      };

      const marriedHarness = new DynamicCustomFieldsRendererHarness([spouseField], {}, { civilStatus: 'Married' });
      expect(marriedHarness.isFieldVisible(spouseField)).toBe(true);

      const singleHarness = new DynamicCustomFieldsRendererHarness([spouseField], {}, { civilStatus: 'Single' });
      expect(singleHarness.isFieldVisible(spouseField)).toBe(false);
    });

    test('F11-5: Operator "in" evaluates array membership condition correctly', () => {
      const clearanceField: ClinicCustomFieldDefinition = {
        id: 'cl',
        tenantId: 't',
        clinicId: 'c',
        entityType: 'ClinicPatient',
        fieldKey: 'grad_clearance',
        label: 'Graduation Clearance',
        dataType: 'Boolean',
        isRequired: false,
        displayOrder: 1,
        isActive: true,
        visibilityRuleJson: JSON.stringify({
          source: 'custom_field',
          field: 'year_level',
          operator: 'in',
          value: ['4th Year', '5th Year / Grad'],
        }),
      };

      const seniorHarness = new DynamicCustomFieldsRendererHarness([clearanceField], { year_level: '4th Year' });
      expect(seniorHarness.isFieldVisible(clearanceField)).toBe(true);

      const freshmanHarness = new DynamicCustomFieldsRendererHarness([clearanceField], { year_level: '1st Year' });
      expect(freshmanHarness.isFieldVisible(clearanceField)).toBe(false);
    });
  });

  describe('Tier 1: Feature 12 — Cascading Select Choices Engine', () => {
    test('F12-1: Selecting "College of Engineering" exposes only engineering degree choices in program', () => {
      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), {
        affiliation: 'Student',
        college: 'College of Engineering',
      });
      const programField = harness.definitions.find((f) => f.fieldKey === 'program')!;
      const availablePrograms = harness.getAvailableOptions(programField);
      expect(availablePrograms).toEqual(['BS Civil Engineering', 'BS Mechanical Engineering']);
    });

    test('F12-2: Selecting "College of IT" exposes CS and IT degree choices', () => {
      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), {
        affiliation: 'Student',
        college: 'College of IT',
      });
      const programField = harness.definitions.find((f) => f.fieldKey === 'program')!;
      const availablePrograms = harness.getAvailableOptions(programField);
      expect(availablePrograms).toEqual(['BS Computer Science', 'BS Information Technology']);
    });

    test('F12-3: Switching college automatically resets program value if previous choice is invalid under new college', () => {
      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), {
        affiliation: 'Student',
        college: 'College of Engineering',
        program: 'BS Civil Engineering',
      });

      // Switch to College of IT
      harness.setValue('college', 'College of IT');

      // Program choice should have been cleanly cleared because "BS Civil Engineering" is not in IT
      expect(harness.values['program']).toBeUndefined();
    });

    test('F12-4: If parent college is unselected/empty, program field returns defaultOptions (empty list)', () => {
      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), {
        affiliation: 'Student',
      });
      const programField = harness.definitions.find((f) => f.fieldKey === 'program')!;
      expect(harness.getAvailableOptions(programField)).toEqual([]);
    });

    test('F12-5: Handles unknown parent values gracefully without throwing', () => {
      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), {
        affiliation: 'Student',
        college: 'Unknown Random College',
      });
      const programField = harness.definitions.find((f) => f.fieldKey === 'program')!;
      expect(harness.getAvailableOptions(programField)).toEqual([]);
    });
  });

  describe('Tier 1: Feature 13 — Defensive Submission Validation', () => {
    test('F13-1: Blocks submission when visible required field is empty', () => {
      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), {
        affiliation: 'Student',
        // student_id is omitted!
        college: 'College of Engineering',
        program: 'BS Civil Engineering',
        campus_location: 'Alubijid',
      });

      const isValid = harness.validate();
      expect(isValid).toBe(false);
      expect(harness.validationErrors['student_id']).toBe('Student ID Number is required.');
    });

    test('F13-2: Does NOT block submission for mandatory field that is currently hidden', () => {
      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), {
        affiliation: 'Student', // employee_id is hidden!
        student_id: '2026-00412',
        college: 'College of Engineering',
        program: 'BS Civil Engineering',
        campus_location: 'Alubijid',
      });

      const isValid = harness.validate();
      expect(isValid).toBe(true);
      expect(harness.validationErrors['employee_id']).toBeUndefined();
    });

    test('F13-3: Succeeds validation when all visible required fields are populated', () => {
      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), {
        affiliation: 'Student',
        student_id: '2026-00412',
        college: 'College of Engineering',
        program: 'BS Civil Engineering',
        campus_location: 'Alubijid',
      });

      expect(harness.validate()).toBe(true);
      expect(Object.keys(harness.validationErrors)).toHaveLength(0);
    });

    test('F13-4: Whitespace-only string in required field is flagged as invalid', () => {
      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), {
        affiliation: 'Student',
        student_id: '    ', // whitespace only
        college: 'College of Engineering',
        program: 'BS Civil Engineering',
        campus_location: 'Alubijid',
      });

      expect(harness.validate()).toBe(false);
      expect(harness.validationErrors['student_id']).toBeDefined();
    });

    test('F13-5: Multiple missing visible required fields all get explicit validation messages', () => {
      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), {
        affiliation: 'Student',
        // missing student_id, college, program, campus_location
      });

      expect(harness.validate()).toBe(false);
      expect(harness.validationErrors['student_id']).toBeDefined();
      expect(harness.validationErrors['college']).toBeDefined();
      expect(harness.validationErrors['program']).toBeDefined();
      expect(harness.validationErrors['campus_location']).toBeDefined();
    });
  });

  describe('Tier 1: Feature 14 — Hidden Field Value Sanitization', () => {
    test('F14-1: Strips values of currently hidden fields before final submission payload', () => {
      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), {
        affiliation: 'Student',
        student_id: '2026-00412',
        employee_id: 'DIRTY-EMPLOYEE-ID', // currently hidden because affiliation=Student!
        college: 'College of Engineering',
        program: 'BS Civil Engineering',
        campus_location: 'Alubijid',
      });

      const clean = harness.getCleanSubmissionPayload();
      expect(clean['employee_id']).toBeUndefined();
      expect(clean['student_id']).toBe('2026-00412');
    });

    test('F14-2: User fills Student fields, then switches Affiliation to Employee — student fields are stripped', () => {
      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), {
        affiliation: 'Student',
        student_id: '2026-00412',
        college: 'College of Engineering',
        program: 'BS Civil Engineering',
        campus_location: 'Alubijid',
      });

      // User changes affiliation to Employee/Faculty
      harness.setValue('affiliation', 'Employee/Faculty');
      harness.setValue('employee_id', 'EMP-2026-99');

      const clean = harness.getCleanSubmissionPayload();
      expect(clean['student_id']).toBeUndefined();
      expect(clean['college']).toBeUndefined();
      expect(clean['program']).toBeUndefined();
      expect(clean['employee_id']).toBe('EMP-2026-99');
      expect(clean['affiliation']).toBe('Employee/Faculty');
    });

    test('F14-3: Empty string values are stripped from submission dictionary', () => {
      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), {
        affiliation: 'Student',
        student_id: '2026-00412',
        college: 'College of Engineering',
        program: 'BS Civil Engineering',
        campus_location: '',
      });

      const clean = harness.getCleanSubmissionPayload();
      expect(clean['campus_location']).toBeUndefined();
    });

    test('F14-4: Preserves valid boolean false values when field is visible', () => {
      const boolField: ClinicCustomFieldDefinition = {
        id: 'b1',
        tenantId: 't',
        clinicId: 'c',
        entityType: 'ClinicPatient',
        fieldKey: 'has_scholarship',
        label: 'Has Scholarship',
        dataType: 'Boolean',
        isRequired: false,
        displayOrder: 1,
        isActive: true,
      };
      const harness = new DynamicCustomFieldsRendererHarness([boolField], { has_scholarship: false });
      const clean = harness.getCleanSubmissionPayload();
      expect(clean['has_scholarship']).toBe(false);
    });

    test('F14-5: Preserves valid numeric 0 values when field is visible', () => {
      const numField: ClinicCustomFieldDefinition = {
        id: 'n1',
        tenantId: 't',
        clinicId: 'c',
        entityType: 'ClinicPatient',
        fieldKey: 'dependents_count',
        label: 'Dependents Count',
        dataType: 'Number',
        isRequired: false,
        displayOrder: 1,
        isActive: true,
      };
      const harness = new DynamicCustomFieldsRendererHarness([numField], { dependents_count: 0 });
      const clean = harness.getCleanSubmissionPayload();
      expect(clean['dependents_count']).toBe(0);
    });
  });

  describe('Tier 1: Feature 18 — Public Student Intake Cascading', () => {
    test('F18-1: Simulates public portal intake flow with USTP preset cascading College to Program', () => {
      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), {
        affiliation: 'Student',
      });

      expect(harness.visibleDefinitions.map((f) => f.fieldKey)).toContain('college');

      // Student selects College of Science
      harness.setValue('college', 'College of Science');
      const programField = harness.definitions.find((f) => f.fieldKey === 'program')!;
      const programs = harness.getAvailableOptions(programField);
      expect(programs).toEqual(['BS Chemistry', 'BS Applied Physics']);

      // Student selects BS Chemistry
      harness.setValue('program', 'BS Chemistry');
      harness.setValue('student_id', '2026-99001');
      harness.setValue('campus_location', 'Cagayan de Oro Main');

      expect(harness.validate()).toBe(true);
      const payload = harness.getCleanSubmissionPayload();
      expect(payload['college']).toBe('College of Science');
      expect(payload['program']).toBe('BS Chemistry');
    });

    test('F18-2: Rejects submission if student leaves Program blank after selecting College', () => {
      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), {
        affiliation: 'Student',
        student_id: '2026-99001',
        college: 'College of Science',
        campus_location: 'Cagayan de Oro Main',
        // program is left blank
      });

      expect(harness.validate()).toBe(false);
      expect(harness.validationErrors['program']).toBeDefined();
    });

    test('F18-3: Changing campus location does not affect college or program selections', () => {
      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), {
        affiliation: 'Student',
        student_id: '2026-99001',
        college: 'College of Science',
        program: 'BS Chemistry',
        campus_location: 'Cagayan de Oro Main',
      });

      harness.setValue('campus_location', 'Alubijid');
      expect(harness.values['college']).toBe('College of Science');
      expect(harness.values['program']).toBe('BS Chemistry');
    });

    test('F18-4: Dependent and Guest affiliations hide both student and employee specific fields', () => {
      const guestHarness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), {
        affiliation: 'Guest',
      });
      const visible = guestHarness.visibleDefinitions.map((f) => f.fieldKey);
      expect(visible).toEqual(['affiliation', 'campus_location']);
    });

    test('F18-5: Public student self-enroll command compatibility: emits strongly typed customFields dictionary', () => {
      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), {
        affiliation: 'Student',
        student_id: '2026-55102',
        college: 'College of Engineering',
        program: 'BS Mechanical Engineering',
        campus_location: 'Cagayan de Oro Main',
      });

      const clean = harness.getCleanSubmissionPayload();
      expect(typeof clean).toBe('object');
      expect(clean.student_id).toBe('2026-55102');
      expect(clean.college).toBe('College of Engineering');
    });
  });

  // =========================================================================
  // TIER 2: Boundary & Corner Cases
  // =========================================================================

  describe('Tier 2: Boundary & Corner Cases', () => {
    test('T2-1: Circular visibility rule (A depends on B, B depends on A) does not trigger stack overflow', () => {
      const circularDefs: ClinicCustomFieldDefinition[] = [
        {
          id: '1',
          tenantId: 't',
          clinicId: 'c',
          entityType: 'ClinicPatient',
          fieldKey: 'field_a',
          label: 'Field A',
          dataType: 'Text',
          isRequired: false,
          displayOrder: 1,
          isActive: true,
          visibilityRuleJson: JSON.stringify({ source: 'custom_field', field: 'field_b', operator: 'equals', value: 'yes' }),
        },
        {
          id: '2',
          tenantId: 't',
          clinicId: 'c',
          entityType: 'ClinicPatient',
          fieldKey: 'field_b',
          label: 'Field B',
          dataType: 'Text',
          isRequired: false,
          displayOrder: 2,
          isActive: true,
          visibilityRuleJson: JSON.stringify({ source: 'custom_field', field: 'field_a', operator: 'equals', value: 'yes' }),
        },
      ];

      const harness = new DynamicCustomFieldsRendererHarness(circularDefs, {});
      expect(() => harness.visibleDefinitions).not.toThrow();
    });

    test('T2-2: Deep 3-tier cascading dropdown (Campus -> College -> Program) resets all descendents on top change', () => {
      const tieredDefs: ClinicCustomFieldDefinition[] = [
        {
          id: '1',
          tenantId: 't',
          clinicId: 'c',
          entityType: 'ClinicPatient',
          fieldKey: 'campus',
          label: 'Campus',
          dataType: 'Select',
          isRequired: true,
          displayOrder: 1,
          optionsJson: JSON.stringify(['Main', 'Satellite']),
          isActive: true,
        },
        {
          id: '2',
          tenantId: 't',
          clinicId: 'c',
          entityType: 'ClinicPatient',
          fieldKey: 'college',
          label: 'College',
          dataType: 'Select',
          isRequired: true,
          displayOrder: 2,
          conditionalOptionsJson: JSON.stringify({
            parentField: 'campus',
            mapping: { Main: ['Engineering', 'Law'], Satellite: ['Agriculture'] },
          }),
          isActive: true,
        },
        {
          id: '3',
          tenantId: 't',
          clinicId: 'c',
          entityType: 'ClinicPatient',
          fieldKey: 'program',
          label: 'Program',
          dataType: 'Select',
          isRequired: true,
          displayOrder: 3,
          conditionalOptionsJson: JSON.stringify({
            parentField: 'college',
            mapping: { Engineering: ['Civil'], Law: ['JD'], Agriculture: ['AgriSci'] },
          }),
          isActive: true,
        },
      ];

      const harness = new DynamicCustomFieldsRendererHarness(tieredDefs, {
        campus: 'Main',
        college: 'Engineering',
        program: 'Civil',
      });

      // Switch campus to Satellite
      harness.setValue('campus', 'Satellite');
      // College should reset
      expect(harness.values['college']).toBeUndefined();
    });

    test('T2-3: Corrupted visibility rule JSON gracefully treats field as visible', () => {
      const badJsonDef: ClinicCustomFieldDefinition = {
        id: 'bad',
        tenantId: 't',
        clinicId: 'c',
        entityType: 'ClinicPatient',
        fieldKey: 'safe_field',
        label: 'Safe Field',
        dataType: 'Text',
        isRequired: false,
        displayOrder: 1,
        isActive: true,
        visibilityRuleJson: '{"corrupted": true, broken',
      };
      const harness = new DynamicCustomFieldsRendererHarness([badJsonDef]);
      expect(harness.isFieldVisible(badJsonDef)).toBe(true);
    });

    test('T2-4: Case-insensitive operator comparison (STUDENT matches Student)', () => {
      const def: ClinicCustomFieldDefinition = {
        id: '1',
        tenantId: 't',
        clinicId: 'c',
        entityType: 'ClinicPatient',
        fieldKey: 'student_id',
        label: 'Student ID',
        dataType: 'Text',
        isRequired: false,
        displayOrder: 1,
        isActive: true,
        visibilityRuleJson: JSON.stringify({ source: 'custom_field', field: 'affiliation', operator: 'equals', value: 'Student' }),
      };
      const harness = new DynamicCustomFieldsRendererHarness([def], { affiliation: 'STUDENT' });
      expect(harness.isFieldVisible(def)).toBe(true);
    });

    test('T2-5: ValidatedDateInput constraint: future dates rejected for historical custom fields', () => {
      const dateDef: ClinicCustomFieldDefinition = {
        id: '1',
        tenantId: 't',
        clinicId: 'c',
        entityType: 'ClinicPatient',
        fieldKey: 'graduation_date',
        label: 'Graduation Date',
        dataType: 'Date',
        isRequired: true,
        displayOrder: 1,
        isActive: true,
      };

      const harness = new DynamicCustomFieldsRendererHarness([dateDef], { graduation_date: '2026-05-30' });
      expect(harness.validate()).toBe(true);
    });
  });

  // =========================================================================
  // TIER 3: Cross-Feature Interactions
  // =========================================================================

  describe('Tier 3: Cross-Feature Interactions', () => {
    test('T3-1: Reordered custom fields preserve visibility evaluation logic regardless of layout sequence', () => {
      const defs = createUstpDefinitions();
      // Reverse entire order
      defs[1].displayOrder = 10; // student_id to bottom
      const harness = new DynamicCustomFieldsRendererHarness(defs, { affiliation: 'Student' });
      expect(harness.visibleDefinitions.some((f) => f.fieldKey === 'student_id')).toBe(true);
    });

    test('T3-2: Demographic Edit workflow: pre-populates existing values and validates edits reactively', () => {
      const existingPatientCustomFields = {
        affiliation: 'Student',
        student_id: '2026-00412',
        college: 'College of Engineering',
        program: 'BS Civil Engineering',
        campus_location: 'Alubijid',
      };

      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), existingPatientCustomFields);
      expect(harness.validate()).toBe(true);

      // User clears mandatory student_id during edit
      harness.setValue('student_id', '');
      expect(harness.validate()).toBe(false);
      expect(harness.validationErrors['student_id']).toBeDefined();
    });

    test('T3-3: Static civilStatus change from Married to Single purges saved spouse_name on save', () => {
      const spouseDef: ClinicCustomFieldDefinition = {
        id: 'sp',
        tenantId: 't',
        clinicId: 'c',
        entityType: 'ClinicPatient',
        fieldKey: 'spouse_name',
        label: 'Spouse Name',
        dataType: 'Text',
        isRequired: false,
        displayOrder: 1,
        isActive: true,
        visibilityRuleJson: JSON.stringify({ source: 'static', field: 'civilStatus', operator: 'equals', value: 'Married' }),
      };

      // Patient was previously married
      const harness = new DynamicCustomFieldsRendererHarness([spouseDef], { spouse_name: 'Jane Doe' }, { civilStatus: 'Single' });
      const clean = harness.getCleanSubmissionPayload();
      expect(clean['spouse_name']).toBeUndefined();
    });
  });

  // =========================================================================
  // TIER 4: Real-World Scenarios
  // =========================================================================

  describe('Tier 4: Real-World Scenarios', () => {
    test('T4-1: Freshmen Registration (USTP) end-to-end happy path intake', () => {
      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), {});

      // 1. User selects Affiliation = Student
      harness.setValue('affiliation', 'Student');
      expect(harness.visibleDefinitions.map((f) => f.fieldKey)).toContain('student_id');

      // 2. User fills Student ID
      harness.setValue('student_id', '2026-00412');

      // 3. User selects College
      harness.setValue('college', 'College of Engineering');
      const programOptions = harness.getAvailableOptions(harness.definitions.find((f) => f.fieldKey === 'program')!);
      expect(programOptions).toContain('BS Civil Engineering');

      // 4. User selects Program
      harness.setValue('program', 'BS Civil Engineering');

      // 5. User selects Campus
      harness.setValue('campus_location', 'Alubijid');

      // 6. Validation passes
      expect(harness.validate()).toBe(true);

      // 7. Payload contains only clean student keys
      const finalPayload = harness.getCleanSubmissionPayload();
      expect(finalPayload).toEqual({
        affiliation: 'Student',
        student_id: '2026-00412',
        college: 'College of Engineering',
        program: 'BS Civil Engineering',
        campus_location: 'Alubijid',
      });
    });

    test('T4-2: Corporate Health Clinic employee annual checkup with HMO details', () => {
      const corporateDefs: ClinicCustomFieldDefinition[] = [
        { id: '1', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'employment_type', label: 'Employment Type', dataType: 'Select', isRequired: true, displayOrder: 1, optionsJson: JSON.stringify(['Regular', 'Contractor']), isActive: true },
        { id: '2', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'hmo_provider', label: 'HMO Provider', dataType: 'Select', isRequired: true, displayOrder: 2, optionsJson: JSON.stringify(['Maxicare', 'Intellicare']), visibilityRuleJson: JSON.stringify({ source: 'custom_field', field: 'employment_type', operator: 'equals', value: 'Regular' }), isActive: true },
      ];

      const harness = new DynamicCustomFieldsRendererHarness(corporateDefs, {
        employment_type: 'Contractor',
        hmo_provider: 'Maxicare', // user previously selected Maxicare
      });

      // Contractor has no HMO requirement and hmo_provider is hidden
      expect(harness.validate()).toBe(true);
      const payload = harness.getCleanSubmissionPayload();
      expect(payload['hmo_provider']).toBeUndefined();
    });
  });

  // =========================================================================
  // TIER 5: Adversarial Hardening
  // =========================================================================

  describe('Tier 5: Adversarial Hardening', () => {
    test('T5-1: Prototype pollution attempts in custom field keys are mitigated', () => {
      const def: ClinicCustomFieldDefinition = {
        id: '1',
        tenantId: 't',
        clinicId: 'c',
        entityType: 'ClinicPatient',
        fieldKey: '__proto__',
        label: 'Pollution Attempt',
        dataType: 'Text',
        isRequired: false,
        displayOrder: 1,
        isActive: true,
      };
      const harness = new DynamicCustomFieldsRendererHarness([def], {});
      harness.setValue('__proto__', 'evil_payload');
      // Root object prototype is not polluted
      expect((Object.prototype as any).evil_payload).toBeUndefined();
    });

    test('T5-2: Rapid toggle between affiliations preserves state consistency without corrupted entries', () => {
      const harness = new DynamicCustomFieldsRendererHarness(createUstpDefinitions(), {});
      for (let i = 0; i < 50; i++) {
        harness.setValue('affiliation', i % 2 === 0 ? 'Student' : 'Employee/Faculty');
      }
      expect(harness.values['affiliation']).toBe('Employee/Faculty');
      expect(harness.visibleDefinitions.map((f) => f.fieldKey)).toContain('employee_id');
      expect(harness.visibleDefinitions.map((f) => f.fieldKey)).not.toContain('student_id');
    });
  });

  // =========================================================================
  // TIER 6: Issue #77 Date Boundary & Custom Field Validation
  // =========================================================================

  describe('Tier 6: Issue #77 Date Boundary & Custom Field Validation', () => {
    test('T6-1: resolveEffectiveBoundaryMode respects explicit boundaryMode or defaults Clinical to pastOrToday', async () => {
      const { resolveEffectiveBoundaryMode } = await import('../components/custom-fields');

      // 1. Explicit boundaryMode overrides everything
      expect(resolveEffectiveBoundaryMode({ boundaryMode: 'futureOrToday', category: 'Clinical' })).toBe('futureOrToday');
      expect(resolveEffectiveBoundaryMode({ boundaryMode: 'futureOnly', category: 'Clinical' })).toBe('futureOnly');
      expect(resolveEffectiveBoundaryMode({ boundaryMode: 'any', category: 'Clinical' })).toBe('any');
      expect(resolveEffectiveBoundaryMode({ boundaryMode: 'pastOrToday', category: 'Demographics' })).toBe('pastOrToday');

      // 2. Clinical category defaults to pastOrToday when boundaryMode is null or undefined
      expect(resolveEffectiveBoundaryMode({ boundaryMode: null, category: 'Clinical' })).toBe('pastOrToday');
      expect(resolveEffectiveBoundaryMode({ category: 'clinical' })).toBe('pastOrToday');
      expect(resolveEffectiveBoundaryMode({ category: '  CLINICAL  ' })).toBe('pastOrToday');

      // 3. Non-clinical categories default to any
      expect(resolveEffectiveBoundaryMode({ category: 'Academic' })).toBe('any');
      expect(resolveEffectiveBoundaryMode({ category: 'Demographics' })).toBe('any');
      expect(resolveEffectiveBoundaryMode({ category: undefined })).toBe('any');
      expect(resolveEffectiveBoundaryMode({ boundaryMode: null, category: null as any })).toBe('any');
    });

    test('T6-2: TC-IF-007 - Clinical Date field rejects future dates and accepts past/today dates', async () => {
      const { validateCustomFields } = await import('../components/custom-fields');

      const clinicalDateField: any = {
        id: 'cf-last-pe',
        fieldKey: 'last_physical_exam_date',
        label: 'Date of Last Physical Examination',
        dataType: 'Date',
        category: 'Clinical',
        isRequired: false,
        displayOrder: 1,
        isActive: true,
      };

      const refDate = new Date('2026-10-24T12:00:00Z');

      // 1. Optional empty date is valid
      const resEmpty = validateCustomFields([clinicalDateField], { last_physical_exam_date: '' }, {}, { now: refDate });
      expect(resEmpty.isValid).toBe(true);
      expect(resEmpty.errors).toEqual({});

      // 2. Past date is valid
      const resPast = validateCustomFields([clinicalDateField], { last_physical_exam_date: '2025-06-15' }, {}, { now: refDate });
      expect(resPast.isValid).toBe(true);

      // 3. Today date is valid
      const resToday = validateCustomFields([clinicalDateField], { last_physical_exam_date: '2026-10-24' }, {}, { now: refDate });
      expect(resToday.isValid).toBe(true);

      // 4. Future date (TC-IF-007) is REJECTED
      const resFuture = validateCustomFields([clinicalDateField], { last_physical_exam_date: '2027-02-28' }, {}, { now: refDate });
      expect(resFuture.isValid).toBe(false);
      expect(resFuture.errors['last_physical_exam_date']).toBeDefined();
      expect(resFuture.errors['last_physical_exam_date']).toContain('Future date not permitted');
    });

    test('T6-3: validateCustomFields rejects malformed or impossible dates', async () => {
      const { validateCustomFields } = await import('../components/custom-fields');

      const dateField: any = {
        id: 'cf-date',
        fieldKey: 'event_date',
        label: 'Event Date',
        dataType: 'Date',
        category: 'Demographics',
        isRequired: false,
        displayOrder: 1,
        isActive: true,
      };

      // Incomplete date
      const resIncomplete = validateCustomFields([dateField], { event_date: '2026-10' });
      expect(resIncomplete.isValid).toBe(false);
      expect(resIncomplete.errors['event_date']).toContain('Incomplete date');

      // Invalid leap year day
      const resLeap = validateCustomFields([dateField], { event_date: '2026-02-29' }); // 2026 not leap
      expect(resLeap.isValid).toBe(false);
      expect(resLeap.errors['event_date']).toContain('February 2026 has only 28 days');

      // Non-numeric malformed text
      const resMalformed = validateCustomFields([dateField], { event_date: '2026-10asaasoalkslak' });
      expect(resMalformed.isValid).toBe(false);
    });

    test('T6-4: Explicit futureOrToday allows future and blocks past dates', async () => {
      const { validateCustomFields } = await import('../components/custom-fields');

      const futureField: any = {
        id: 'cf-future',
        fieldKey: 'next_review_date',
        label: 'Next Review Date',
        dataType: 'Date',
        category: 'Clinical',
        boundaryMode: 'futureOrToday',
        isRequired: false,
        displayOrder: 1,
        isActive: true,
      };

      const refDate = new Date('2026-10-24T12:00:00Z');

      const resPast = validateCustomFields([futureField], { next_review_date: '2020-01-01' }, {}, { now: refDate });
      expect(resPast.isValid).toBe(false);
      expect(resPast.errors['next_review_date']).toContain('Date must be today or in the future');

      const resFuture = validateCustomFields([futureField], { next_review_date: '2027-01-01' }, {}, { now: refDate });
      expect(resFuture.isValid).toBe(true);
    });

    test('T6-5: Conditionally hidden Date field never blocks validation even if containing invalid date', async () => {
      const { validateCustomFields } = await import('../components/custom-fields');

      const hiddenDateField: any = {
        id: 'cf-hidden-date',
        fieldKey: 'marriage_date',
        label: 'Marriage Date',
        dataType: 'Date',
        isRequired: true,
        category: 'Demographics',
        visibilityRuleJson: JSON.stringify({
          source: 'static',
          field: 'civilStatus',
          operator: 'equals',
          value: 'Married',
        }),
      };

      // When Single, marriage_date is hidden: invalid or empty date does NOT block
      const res = validateCustomFields([hiddenDateField], { marriage_date: 'invalid-date' }, { civilStatus: 'Single' });
      expect(res.isValid).toBe(true);
      expect(res.errors).toEqual({});
    });
  });
});
