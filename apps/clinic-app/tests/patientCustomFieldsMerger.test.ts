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
  default: 'Svg',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Polyline: 'Polyline',
}));

const {
  mergePatientCustomFields,
  hasPreviousValue,
} = await import('../components/patient/patientCustomFieldsMerger');

import type { ClinicCustomFieldDefinition, ClinicPatient } from '../services/clinicService';

describe('patientCustomFieldsMerger (Issue #77 R3)', () => {
  const clinicalDateField: ClinicCustomFieldDefinition = {
    id: 'cf-clinical-date-1',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    entityType: 'ClinicPatient',
    fieldKey: 'last_physical_exam_date',
    label: 'Date of Last Physical Examination',
    dataType: 'Date',
    category: 'Clinical',
    isRequired: false,
    displayOrder: 1,
    isActive: true,
  };

  const textNotesField: ClinicCustomFieldDefinition = {
    id: 'cf-notes-1',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    entityType: 'ClinicPatient',
    fieldKey: 'clinical_notes',
    label: 'Clinical Notes',
    dataType: 'Text',
    category: 'Clinical',
    isRequired: false,
    displayOrder: 2,
    isActive: true,
  };

  const conditionalSpouseField: ClinicCustomFieldDefinition = {
    id: 'cf-spouse-1',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    entityType: 'ClinicPatient',
    fieldKey: 'spouse_name',
    label: 'Spouse Full Name',
    dataType: 'Text',
    category: 'Demographics',
    isRequired: false,
    displayOrder: 3,
    isActive: true,
    visibilityRuleJson: JSON.stringify({
      source: 'static',
      field: 'civilStatus',
      operator: 'equals',
      value: 'Married',
    }),
  };

  test('TC-R3-1: Clears previously populated custom Date field by setting it to null for backend additive merge', () => {
    const patient: Partial<ClinicPatient> = {
      id: 'p-1',
      customFields: {
        last_physical_exam_date: '2026-01-15',
        other_key: 'preserved',
      },
    };

    const effectiveFields = [clinicalDateField];
    const customFieldValues = {
      last_physical_exam_date: '', // cleared by user!
    };

    const result = mergePatientCustomFields({
      patient,
      effectiveCustomFields: effectiveFields,
      customFieldValues,
      staticValues: {},
    });

    // Must be explicitly null to instruct backend to clear the column/dict
    expect(result.last_physical_exam_date).toBeNull();
    // Untouched system/other keys are preserved
    expect(result.other_key).toBe('preserved');
  });

  test('TC-R3-2: Omits unpopulated optional custom Date field so payload is not polluted with nulls', () => {
    const patient: Partial<ClinicPatient> = {
      id: 'p-2',
      customFields: {
        other_key: 'preserved',
      },
    };

    const effectiveFields = [clinicalDateField];
    const customFieldValues = {
      last_physical_exam_date: '', // was empty, stayed empty
    };

    const result = mergePatientCustomFields({
      patient,
      effectiveCustomFields: effectiveFields,
      customFieldValues,
      staticValues: {},
    });

    expect('last_physical_exam_date' in result).toBe(false);
    expect(result.other_key).toBe('preserved');
  });

  test('TC-R3-3: Clears previously populated custom Text and Number fields when empty string or whitespace is provided', () => {
    const patient: Partial<ClinicPatient> = {
      id: 'p-3',
      customFields: {
        clinical_notes: 'Previous notes from last year',
      },
    };

    const effectiveFields = [textNotesField];
    const customFieldValues = {
      clinical_notes: '   ', // whitespace only
    };

    const result = mergePatientCustomFields({
      patient,
      effectiveCustomFields: effectiveFields,
      customFieldValues,
      staticValues: {},
    });

    expect(result.clinical_notes).toBeNull();
  });

  test('TC-R3-4: Sets previously populated field to null when it becomes conditionally hidden', () => {
    const patient: Partial<ClinicPatient> = {
      id: 'p-4',
      civilStatus: 'Single',
      customFields: {
        spouse_name: 'Jane Doe', // previously married, now single
      },
    };

    const effectiveFields = [conditionalSpouseField];
    const customFieldValues = {
      spouse_name: 'Jane Doe', // hidden because civilStatus is Single
    };

    const result = mergePatientCustomFields({
      patient,
      effectiveCustomFields: effectiveFields,
      customFieldValues,
      staticValues: { civilStatus: 'Single' },
    });

    expect(result.spouse_name).toBeNull();
  });

  test('TC-R3-5: Omits conditionally hidden field that was never previously populated', () => {
    const patient: Partial<ClinicPatient> = {
      id: 'p-5',
      civilStatus: 'Single',
      customFields: {},
    };

    const effectiveFields = [conditionalSpouseField];
    const customFieldValues = {};

    const result = mergePatientCustomFields({
      patient,
      effectiveCustomFields: effectiveFields,
      customFieldValues,
      staticValues: { civilStatus: 'Single' },
    });

    expect('spouse_name' in result).toBe(false);
  });

  test('TC-R3-6: Preserves yakap_enlistments array untouched across edits', () => {
    const enlistments = [
      {
        year: '2026',
        packageType: 'KONSULTA',
        status: 'ENROLLED',
        enlistedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const patient: Partial<ClinicPatient> = {
      id: 'p-6',
      customFields: {
        yakap_enlistments: enlistments,
      },
    };

    const result = mergePatientCustomFields({
      patient,
      effectiveCustomFields: [clinicalDateField],
      customFieldValues: {
        last_physical_exam_date: '2026-02-01',
      },
      staticValues: {},
    });

    expect(result.yakap_enlistments).toEqual(enlistments);
    expect(result.last_physical_exam_date).toBe('2026-02-01');
  });

  test('TC-R3-7: Transitioning memberType from DD to MM clears dependent sponsor fields with null', () => {
    const patient: Partial<ClinicPatient> = {
      id: 'p-7',
      customFields: {
        member_type: 'DD',
        principal_member_pin: '12-345678901-2',
        principal_full_name: 'Juan Dela Cruz',
        principal_relationship: 'C',
        principal_dob: '1970-05-10',
      },
    };

    const result = mergePatientCustomFields({
      patient,
      effectiveCustomFields: [],
      customFieldValues: {},
      staticValues: {},
      memberType: 'MM', // transitioned to Member!
      philHealthNumber: '12-999999999-1',
      firstName: 'Maria',
      lastName: 'Dela Cruz',
    });

    expect(result.member_type).toBe('MM');
    expect(result.principal_member_pin).toBeNull();
    expect(result.principal_full_name).toBeNull();
    expect(result.principal_relationship).toBeNull();
    expect(result.principal_dob).toBeNull();
    expect(result.philhealth_profile).toBeDefined();
    expect(result.philhealth_profile.memberType).toBe('MM');
  });

  test('TC-R3-8: Handles legacy patient properties (e.g. addressLine, emergencyContactName) when cleared', () => {
    const patient: Partial<ClinicPatient> = {
      id: 'p-8',
      addressLine: '123 Old Street',
      emergencyContactName: 'Old Contact',
      customFields: {},
    };

    const baselineFields: ClinicCustomFieldDefinition[] = [
      {
        id: 'def-addr',
        tenantId: '',
        clinicId: '',
        entityType: 'ClinicPatient',
        fieldKey: 'primary_address_line',
        label: 'Address Line',
        dataType: 'Text',
        isRequired: false,
        displayOrder: 1,
        isActive: true,
      },
      {
        id: 'def-ec',
        tenantId: '',
        clinicId: '',
        entityType: 'ClinicPatient',
        fieldKey: 'emergency_contact_name',
        label: 'Emergency Contact Name',
        dataType: 'Text',
        isRequired: false,
        displayOrder: 2,
        isActive: true,
      },
    ];

    const result = mergePatientCustomFields({
      patient,
      effectiveCustomFields: baselineFields,
      customFieldValues: {
        primary_address_line: '',
        emergency_contact_name: '',
      },
      staticValues: {},
    });

    expect(result.primary_address_line).toBeNull();
    expect(result.emergency_contact_name).toBeNull();
  });

  test('TC-R3-9: Correctly retains and trims updated values for visible fields', () => {
    const patient: Partial<ClinicPatient> = {
      id: 'p-9',
      customFields: {
        last_physical_exam_date: '2025-01-01',
      },
    };

    const effectiveFields = [clinicalDateField, textNotesField];
    const customFieldValues = {
      last_physical_exam_date: '2026-03-20',
      clinical_notes: '  Patient vitals stable.  ',
    };

    const result = mergePatientCustomFields({
      patient,
      effectiveCustomFields: effectiveFields,
      customFieldValues,
      staticValues: {},
    });

    expect(result.last_physical_exam_date).toBe('2026-03-20');
    expect(result.clinical_notes).toBe('Patient vitals stable.');
  });
});
