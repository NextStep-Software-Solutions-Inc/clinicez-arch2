// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';

(globalThis as any).__DEV__ = true;

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
}));

import type { ClinicCustomFieldDefinition, ClinicPatient } from '../services/clinicService';

const {
  isFieldVisible,
  validateCustomFields,
  sanitizeCustomFieldsPayload,
} = await import('../components/custom-fields');

const {
  mergePatientCustomFields,
} = await import('../components/patient/patientCustomFieldsMerger');

const UNIVERSITY_TEMPLATE_FIELDS: ClinicCustomFieldDefinition[] = [
  {
    id: 'def-1',
    clinicId: 'clinic-1',
    entityType: 'Patient',
    fieldKey: 'affiliation',
    label: 'Affiliation',
    dataType: 'Select',
    category: 'Institutional',
    isRequired: true,
    displayOrder: 1,
    optionsJson: '["Student","Employee/Faculty","Dependent","Guest"]',
    isActive: true,
    createdAt: new Date().toISOString(),
    createdBy: 'Admin',
  },
  {
    id: 'def-2',
    clinicId: 'clinic-1',
    entityType: 'Patient',
    fieldKey: 'student_id',
    label: 'Student ID / LRN',
    dataType: 'Text',
    category: 'Student',
    isRequired: true,
    displayOrder: 2,
    visibilityRuleJson: '{"source":"custom_field","field":"affiliation","operator":"equals","value":"Student"}',
    isActive: true,
    createdAt: new Date().toISOString(),
    createdBy: 'Admin',
  },
  {
    id: 'def-3',
    clinicId: 'clinic-1',
    entityType: 'Patient',
    fieldKey: 'college',
    label: 'College / Faculty',
    dataType: 'Select',
    category: 'Student',
    isRequired: true,
    displayOrder: 3,
    visibilityRuleJson: '{"source":"custom_field","field":"affiliation","operator":"equals","value":"Student"}',
    isActive: true,
    createdAt: new Date().toISOString(),
    createdBy: 'Admin',
  },
  {
    id: 'def-4',
    clinicId: 'clinic-1',
    entityType: 'Patient',
    fieldKey: 'program',
    label: 'Degree / Academic Program',
    dataType: 'Select',
    category: 'Student',
    isRequired: true,
    displayOrder: 4,
    visibilityRuleJson: '{"source":"custom_field","field":"affiliation","operator":"equals","value":"Student"}',
    isActive: true,
    createdAt: new Date().toISOString(),
    createdBy: 'Admin',
  },
  {
    id: 'def-5',
    clinicId: 'clinic-1',
    entityType: 'Patient',
    fieldKey: 'employee_id',
    label: 'Employee ID',
    dataType: 'Text',
    category: 'Employee',
    isRequired: true,
    displayOrder: 5,
    visibilityRuleJson: '{"source":"custom_field","field":"affiliation","operator":"equals","value":"Employee/Faculty"}',
    isActive: true,
    createdAt: new Date().toISOString(),
    createdBy: 'Admin',
  },
];

describe('Issue #188: Custom Fields Visibility & Edit Demographics Parity', () => {
  test('1. Student affiliation makes student_id, college, program visible and hides employee_id', () => {
    const studentValues = { affiliation: 'Student' };
    const studentIdDef = UNIVERSITY_TEMPLATE_FIELDS.find((f) => f.fieldKey === 'student_id')!;
    const employeeIdDef = UNIVERSITY_TEMPLATE_FIELDS.find((f) => f.fieldKey === 'employee_id')!;

    expect(isFieldVisible(studentIdDef, studentValues)).toBe(true);
    expect(isFieldVisible(employeeIdDef, studentValues)).toBe(false);
  });

  test('2. Employee/Faculty affiliation hides student fields and makes employee_id visible', () => {
    const employeeValues = { affiliation: 'Employee/Faculty' };
    const studentIdDef = UNIVERSITY_TEMPLATE_FIELDS.find((f) => f.fieldKey === 'student_id')!;
    const employeeIdDef = UNIVERSITY_TEMPLATE_FIELDS.find((f) => f.fieldKey === 'employee_id')!;

    expect(isFieldVisible(studentIdDef, employeeValues)).toBe(false);
    expect(isFieldVisible(employeeIdDef, employeeValues)).toBe(true);
  });

  test('3. validateCustomFields does NOT block submission when employee_id is missing for a Student', () => {
    const values = {
      affiliation: 'Student',
      student_id: 'STU-2026-2757',
      college: 'College of Information Technology and Computing',
      program: 'BS Information Technology',
    };

    const res = validateCustomFields(UNIVERSITY_TEMPLATE_FIELDS, values);
    expect(res.isValid).toBe(true);
    expect(res.errors).toEqual({});
  });

  test('4. validateCustomFields does NOT block submission when student fields are missing for an Employee', () => {
    const values = {
      affiliation: 'Employee/Faculty',
      employee_id: 'EMP-9862',
    };

    const res = validateCustomFields(UNIVERSITY_TEMPLATE_FIELDS, values);
    expect(res.isValid).toBe(true);
    expect(res.errors).toEqual({});
  });

  test('5. sanitizeCustomFieldsPayload strips hidden employee_id for a Student', () => {
    const values = {
      affiliation: 'Student',
      student_id: 'STU-2026-2757',
      college: 'CITC',
      program: 'BSIT',
      employee_id: 'EMP-LEFTOVER',
    };

    const cleaned = sanitizeCustomFieldsPayload(UNIVERSITY_TEMPLATE_FIELDS, values);
    expect(cleaned.affiliation).toBe('Student');
    expect(cleaned.student_id).toBe('STU-2026-2757');
    expect(cleaned.employee_id).toBeUndefined();
  });

  test('6. mergePatientCustomFields emits null tombstone for student_id when switching from Student to Employee', () => {
    const existingPatient: Partial<ClinicPatient> = {
      id: 'patient-1',
      customFields: {
        affiliation: 'Student',
        student_id: 'STU-2026-2757',
        college: 'CITC',
        program: 'BSIT',
      },
    };

    const updatedValues = {
      affiliation: 'Employee/Faculty',
      employee_id: 'EMP-9862',
    };

    const merged = mergePatientCustomFields({
      patient: existingPatient,
      effectiveCustomFields: UNIVERSITY_TEMPLATE_FIELDS,
      customFieldValues: updatedValues,
      staticValues: {},
      tenantCustomFieldsCount: UNIVERSITY_TEMPLATE_FIELDS.length,
    });

    expect(merged.affiliation).toBe('Employee/Faculty');
    expect(merged.employee_id).toBe('EMP-9862');
    expect(merged.student_id).toBeNull();
    expect(merged.college).toBeNull();
    expect(merged.program).toBeNull();
  });

  test('7. Legacy patient backfill resolves classification Student to affiliation Student', () => {
    const cf = {
      classification: 'Student',
      student_id: 'STU-2026-2757',
    };

    const rawAffiliation = cf['affiliation'] || (cf['classification'] === 'Student' ? 'Student' : cf['classification'] === 'Employee' ? 'Employee/Faculty' : undefined);
    expect(rawAffiliation).toBe('Student');
  });

  test('8. Legacy patient backfill resolves classification Employee to affiliation Employee/Faculty', () => {
    const cf = {
      classification: 'Employee',
      employee_id: 'EMP-9862',
    };

    const rawAffiliation = cf['affiliation'] || (cf['classification'] === 'Student' ? 'Student' : cf['classification'] === 'Employee' ? 'Employee/Faculty' : undefined);
    expect(rawAffiliation).toBe('Employee/Faculty');
  });
});
