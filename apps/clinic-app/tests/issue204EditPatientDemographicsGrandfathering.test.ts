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

import type { ClinicCustomFieldDefinition } from '../services/clinicService';

const {
  validateCustomFields,
} = await import('../components/custom-fields');

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

describe('Issue #204: Edit Patient Demographics Grandfathering & Error Attribution', () => {
  test('1. validateCustomFields in isUpdate mode grandfathers unpopulated college and program for seeded student', () => {
    // Seeded student patient only had classification and student_id initially
    const initialCustomFields = {
      classification: 'Student',
      student_id: 'STU-2026-1991',
    };

    const currentFormValues = {
      affiliation: 'Student',
      student_id: 'STU-2026-1991',
      // college and program not populated
    };

    const res = validateCustomFields(UNIVERSITY_TEMPLATE_FIELDS, currentFormValues, {}, {
      isUpdate: true,
      initialValues: initialCustomFields,
    });

    expect(res.isValid).toBe(true);
    expect(res.errors).toEqual({});
  });

  test('2. validateCustomFields in isUpdate mode BLOCKS when a previously populated field is explicitly cleared', () => {
    const initialCustomFields = {
      affiliation: 'Student',
      student_id: 'STU-2026-1991',
      college: 'College of Engineering',
    };

    const currentFormValues = {
      affiliation: 'Student',
      student_id: '   ', // user cleared student_id
      college: 'College of Engineering',
    };

    const res = validateCustomFields(UNIVERSITY_TEMPLATE_FIELDS, currentFormValues, {}, {
      isUpdate: true,
      initialValues: initialCustomFields,
    });

    expect(res.isValid).toBe(false);
    expect(res.errors['student_id']).toBe('Student ID / LRN is required.');
  });

  test('3. validateCustomFields in registration mode (isUpdate=false) still strictly requires all visible fields', () => {
    const newStudentValues = {
      affiliation: 'Student',
      student_id: 'STU-2026-9999',
      // college and program missing
    };

    const res = validateCustomFields(UNIVERSITY_TEMPLATE_FIELDS, newStudentValues, {});

    expect(res.isValid).toBe(false);
    expect(res.errors['college']).toBe('College / Faculty is required.');
    expect(res.errors['program']).toBe('Degree / Academic Program is required.');
  });

  test('4. General classification maps rawAffiliation to Guest fallback', () => {
    const cf = {
      classification: 'General',
      category: 'General',
    };

    const rawAffiliation = cf['affiliation'] || (
      cf['classification'] === 'Student'
        ? 'Student'
        : cf['classification'] === 'Employee'
        ? 'Employee/Faculty'
        : cf['classification'] === 'General'
        ? 'Guest'
        : undefined
    );

    expect(rawAffiliation).toBe('Guest');
  });

  test('5. Error extraction maps backend API validation error with field key or message fallback', () => {
    const renderedFields = UNIVERSITY_TEMPLATE_FIELDS;
    const apiError = {
      message: 'Affiliation is required.',
      errors: [
        { field: 'affiliation', message: 'Affiliation is required.' },
      ],
    };

    const extractedErrors: Record<string, string> = {};
    for (const item of apiError.errors) {
      if (item.field) {
        const matched = renderedFields.find(
          (f) => f.fieldKey.toLowerCase() === item.field.toLowerCase()
        );
        if (matched) {
          extractedErrors[matched.fieldKey] = item.message;
        }
      }
    }

    expect(extractedErrors['affiliation']).toBe('Affiliation is required.');
  });
});
