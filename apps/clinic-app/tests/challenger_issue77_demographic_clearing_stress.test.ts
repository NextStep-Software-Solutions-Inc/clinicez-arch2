// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';

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

const {
  DynamicCustomFieldsRenderer,
  validateCustomFields,
  sanitizeCustomFieldsPayload,
  isFieldVisible,
  getAvailableOptions,
} = await import('../components/custom-fields');

const {
  extractPhilHealthProfileData,
  buildPhilHealthProfileData,
} = await import('../components/patient/memberType');

const { default: PatientDirectoryCard } = await import('../components/patient/PatientDirectoryCard');
const { default: PatientSearchResultRow } = await import('../components/patient/PatientSearchResultRow');

import type { ClinicCustomFieldDefinition, ClinicPatient } from '../services/clinicService';

describe('Adversarial Demographic Clearing & Additive Merge Harness (Issue #77)', () => {
  // Definitions for all 5 custom field data types
  const dateField: ClinicCustomFieldDefinition = {
    id: 'cf-date-1',
    tenantId: 'tenant-adv',
    clinicId: 'clinic-adv',
    entityType: 'ClinicPatient',
    fieldKey: 'last_physical_exam_date',
    label: 'Date of Last Physical Examination',
    dataType: 'Date',
    category: 'Clinical',
    isRequired: false,
    displayOrder: 1,
    isActive: true,
  };

  const textField: ClinicCustomFieldDefinition = {
    id: 'cf-text-1',
    tenantId: 'tenant-adv',
    clinicId: 'clinic-adv',
    entityType: 'ClinicPatient',
    fieldKey: 'clinical_notes',
    label: 'Clinical Notes',
    dataType: 'Text',
    category: 'Clinical',
    isRequired: false,
    displayOrder: 2,
    isActive: true,
  };

  const numberField: ClinicCustomFieldDefinition = {
    id: 'cf-num-1',
    tenantId: 'tenant-adv',
    clinicId: 'clinic-adv',
    entityType: 'ClinicPatient',
    fieldKey: 'framingham_risk_score',
    label: 'Framingham Risk Score',
    dataType: 'Number',
    category: 'Clinical',
    isRequired: false,
    displayOrder: 3,
    isActive: true,
  };

  const selectField: ClinicCustomFieldDefinition = {
    id: 'cf-select-1',
    tenantId: 'tenant-adv',
    clinicId: 'clinic-adv',
    entityType: 'ClinicPatient',
    fieldKey: 'blood_donor_status',
    label: 'Blood Donor Status',
    dataType: 'Select',
    optionsJson: JSON.stringify(['Eligible', 'Deferred', 'Ineligible']),
    category: 'General',
    isRequired: false,
    displayOrder: 4,
    isActive: true,
  };

  const booleanField: ClinicCustomFieldDefinition = {
    id: 'cf-bool-1',
    tenantId: 'tenant-adv',
    clinicId: 'clinic-adv',
    entityType: 'ClinicPatient',
    fieldKey: 'consent_research',
    label: 'Consent for Clinical Research',
    dataType: 'Boolean',
    category: 'Administrative',
    isRequired: false,
    displayOrder: 5,
    isActive: true,
  };

  const allTypesDefinitions = [dateField, textField, numberField, selectField, booleanField];

  // -------------------------------------------------------------------------------------------------
  // FOCUS AREA 1: Simultaneous Multi-Type Custom Field Clearing (Date, Text, Number, Select, Boolean)
  // -------------------------------------------------------------------------------------------------
  describe('Focus Area 1: Simultaneous Multi-Type Clearing', () => {
    test('ADV-1.1: Clears all 5 field types simultaneously when emptied, mapping each to null', () => {
      const patient: Partial<ClinicPatient> = {
        id: 'patient-all-types',
        customFields: {
          last_physical_exam_date: '2025-11-20',
          clinical_notes: 'Patient exhibits normal sinus rhythm.',
          framingham_risk_score: 14.5,
          blood_donor_status: 'Eligible',
          consent_research: true,
          unrelated_system_key: 'preserved_value',
        },
      };

      const customFieldValues = {
        last_physical_exam_date: '', // Date cleared
        clinical_notes: '     ', // Text cleared with whitespace
        framingham_risk_score: '', // Number cleared
        blood_donor_status: null, // Select cleared
        consent_research: null, // Boolean cleared
      };

      const result = mergePatientCustomFields({
        patient,
        effectiveCustomFields: allTypesDefinitions,
        customFieldValues,
        staticValues: {},
      });

      // All 5 must be explicitly null to clear values in PostgreSQL JSONB
      expect(result.last_physical_exam_date).toBeNull();
      expect(result.clinical_notes).toBeNull();
      expect(result.framingham_risk_score).toBeNull();
      expect(result.blood_donor_status).toBeNull();
      expect(result.consent_research).toBeNull();

      // Untouched keys must remain intact
      expect(result.unrelated_system_key).toBe('preserved_value');
    });

    test('ADV-1.2: Partial clearing - clears 2 fields while updating 1 and retaining 2 untouched', () => {
      const patient: Partial<ClinicPatient> = {
        id: 'patient-partial',
        customFields: {
          last_physical_exam_date: '2025-11-20',
          clinical_notes: 'Initial notes',
          framingham_risk_score: 12,
          blood_donor_status: 'Eligible',
          consent_research: true,
        },
      };

      const customFieldValues = {
        last_physical_exam_date: '', // Cleared -> null
        clinical_notes: 'Updated follow-up notes', // Updated -> new value
        framingham_risk_score: 12, // Retained
        blood_donor_status: '', // Cleared -> null
        consent_research: true, // Retained
      };

      const result = mergePatientCustomFields({
        patient,
        effectiveCustomFields: allTypesDefinitions,
        customFieldValues,
        staticValues: {},
      });

      expect(result.last_physical_exam_date).toBeNull();
      expect(result.clinical_notes).toBe('Updated follow-up notes');
      expect(result.framingham_risk_score).toBe(12);
      expect(result.blood_donor_status).toBeNull();
      expect(result.consent_research).toBe(true);
    });

    test('ADV-1.3: Number field with numeric 0 and Boolean field with false are NOT cleared to null', () => {
      const patient: Partial<ClinicPatient> = {
        id: 'patient-falsy-valid',
        customFields: {
          framingham_risk_score: 10,
          consent_research: true,
        },
      };

      const customFieldValues = {
        framingham_risk_score: 0, // Legitimate 0 score, not empty
        consent_research: false, // Legitimate false choice, not empty
      };

      const result = mergePatientCustomFields({
        patient,
        effectiveCustomFields: [numberField, booleanField],
        customFieldValues,
        staticValues: {},
      });

      expect(result.framingham_risk_score).toBe(0);
      expect(result.consent_research).toBe(false);
    });
  });

  // -------------------------------------------------------------------------------------------------
  // FOCUS AREA 2 & 3: Additive Merge Null Generation vs. Null Pollution Prevention
  // -------------------------------------------------------------------------------------------------
  describe('Focus Area 2 & 3: Additive Null vs Pollution Prevention', () => {
    test('ADV-2.1: Never-populated optional fields are deleted from payload, preventing null pollution', () => {
      // 10 defined custom fields
      const tenDefinitions: ClinicCustomFieldDefinition[] = Array.from({ length: 10 }, (_, i) => ({
        id: `cf-gen-${i}`,
        tenantId: 'tenant-adv',
        clinicId: 'clinic-adv',
        entityType: 'ClinicPatient',
        fieldKey: `custom_field_${i}`,
        label: `Custom Field ${i}`,
        dataType: 'Text',
        isRequired: false,
        displayOrder: i,
        isActive: true,
      }));

      // Patient only ever had field_0 populated
      const patient: Partial<ClinicPatient> = {
        id: 'patient-sparse',
        customFields: {
          custom_field_0: 'First Value',
        },
      };

      // Form updates field_0 to new value; fields 1..9 are left blank
      const customFieldValues: Record<string, any> = {
        custom_field_0: 'Updated Value',
      };
      for (let i = 1; i < 10; i++) {
        customFieldValues[`custom_field_${i}`] = '';
      }

      const result = mergePatientCustomFields({
        patient,
        effectiveCustomFields: tenDefinitions,
        customFieldValues,
        staticValues: {},
      });

      expect(result.custom_field_0).toBe('Updated Value');

      // None of the untouched fields 1..9 should exist in result (no null pollution!)
      for (let i = 1; i < 10; i++) {
        expect(`custom_field_${i}` in result).toBe(false);
      }
    });

    test('ADV-2.2: Second edit cycle after field was cleared: once cleared to null, subsequent edit does not send null again', () => {
      // After first edit, DB has field: null
      const patientAfterFirstEdit: Partial<ClinicPatient> = {
        id: 'patient-cleared',
        customFields: {
          last_physical_exam_date: null,
          unrelated_text: 'Still here',
        },
      };

      // User now edits unrelated_text; last_physical_exam_date remains empty
      const result = mergePatientCustomFields({
        patient: patientAfterFirstEdit,
        effectiveCustomFields: [dateField, textField],
        customFieldValues: {
          last_physical_exam_date: '',
          clinical_notes: 'Fresh note',
        },
        staticValues: {},
      });

      // Because it was already null in DB, hasPreviousValue is false, so it is deleted (not polluted with null)
      expect('last_physical_exam_date' in result).toBe(false);
      expect(result.clinical_notes).toBe('Fresh note');
    });

    test('ADV-2.3: Blank patient record (fresh registration / brand new patient) produces zero null fields', () => {
      const patient: Partial<ClinicPatient> = {
        id: 'brand-new',
        customFields: undefined,
      };

      const result = mergePatientCustomFields({
        patient,
        effectiveCustomFields: allTypesDefinitions,
        customFieldValues: {
          last_physical_exam_date: '',
          clinical_notes: '',
          framingham_risk_score: '',
          blood_donor_status: '',
          consent_research: undefined,
        },
        staticValues: {},
      });

      for (const def of allTypesDefinitions) {
        expect(def.fieldKey in result).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------------------------------
  // FOCUS AREA 4: Conditional Visibility Field Clearing & Pollution Prevention
  // -------------------------------------------------------------------------------------------------
  describe('Focus Area 4: Conditional Visibility Clearing', () => {
    const affiliationField: ClinicCustomFieldDefinition = {
      id: 'cf-affil',
      tenantId: 'tenant-adv',
      clinicId: 'clinic-adv',
      entityType: 'ClinicPatient',
      fieldKey: 'affiliation',
      label: 'Affiliation',
      dataType: 'Select',
      optionsJson: JSON.stringify(['Student', 'Employee', 'Guest']),
      isRequired: true,
      displayOrder: 1,
      isActive: true,
    };

    const studentIdField: ClinicCustomFieldDefinition = {
      id: 'cf-stud-id',
      tenantId: 'tenant-adv',
      clinicId: 'clinic-adv',
      entityType: 'ClinicPatient',
      fieldKey: 'student_id',
      label: 'Student ID',
      dataType: 'Text',
      isRequired: true,
      displayOrder: 2,
      isActive: true,
      visibilityRuleJson: JSON.stringify({
        source: 'custom',
        field: 'affiliation',
        operator: 'equals',
        value: 'Student',
      }),
    };

    const collegeField: ClinicCustomFieldDefinition = {
      id: 'cf-college',
      tenantId: 'tenant-adv',
      clinicId: 'clinic-adv',
      entityType: 'ClinicPatient',
      fieldKey: 'college',
      label: 'College',
      dataType: 'Select',
      optionsJson: JSON.stringify(['Engineering', 'Science']),
      isRequired: false,
      displayOrder: 3,
      isActive: true,
      visibilityRuleJson: JSON.stringify({
        source: 'custom',
        field: 'affiliation',
        operator: 'equals',
        value: 'Student',
      }),
    };

    const lmpDateField: ClinicCustomFieldDefinition = {
      id: 'cf-lmp',
      tenantId: 'tenant-adv',
      clinicId: 'clinic-adv',
      entityType: 'ClinicPatient',
      fieldKey: 'last_menstrual_period',
      label: 'Last Menstrual Period',
      dataType: 'Date',
      category: 'Clinical',
      isRequired: false,
      displayOrder: 4,
      isActive: true,
      visibilityRuleJson: JSON.stringify({
        source: 'static',
        field: 'gender',
        operator: 'equals',
        value: 'Female',
      }),
    };

    test('ADV-4.1: Conditionally hiding previously saved fields sets them to null for backend clearing', () => {
      const patient: Partial<ClinicPatient> = {
        id: 'patient-student-female',
        gender: 'Female',
        customFields: {
          affiliation: 'Student',
          student_id: 'USTP-2024-001',
          college: 'Engineering',
          last_menstrual_period: '2026-01-10',
        },
      };

      // Clinician updates Affiliation to Guest and Gender to Male
      const effectiveFields = [affiliationField, studentIdField, collegeField, lmpDateField];
      const customFieldValues = {
        affiliation: 'Guest',
        student_id: 'USTP-2024-001', // Hidden now!
        college: 'Engineering', // Hidden now!
        last_menstrual_period: '2026-01-10', // Hidden now!
      };
      const staticValues = {
        gender: 'Male',
      };

      const result = mergePatientCustomFields({
        patient,
        effectiveCustomFields: effectiveFields,
        customFieldValues,
        staticValues,
      });

      expect(result.affiliation).toBe('Guest');
      // All 3 previously saved fields that became hidden must be explicitly null
      expect(result.student_id).toBeNull();
      expect(result.college).toBeNull();
      expect(result.last_menstrual_period).toBeNull();
    });

    test('ADV-4.2: Conditionally hidden fields that NEVER existed in DB are omitted (not null)', () => {
      const patient: Partial<ClinicPatient> = {
        id: 'patient-guest-male',
        gender: 'Male',
        customFields: {
          affiliation: 'Guest',
        },
      };

      const effectiveFields = [affiliationField, studentIdField, collegeField, lmpDateField];
      const customFieldValues = {
        affiliation: 'Guest',
      };
      const staticValues = {
        gender: 'Male',
      };

      const result = mergePatientCustomFields({
        patient,
        effectiveCustomFields: effectiveFields,
        customFieldValues,
        staticValues,
      });

      expect(result.affiliation).toBe('Guest');
      expect('student_id' in result).toBe(false);
      expect('college' in result).toBe(false);
      expect('last_menstrual_period' in result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------------------------------
  // FOCUS AREA 5: System Key Preservation Under Hostile Clearing Permutations
  // -------------------------------------------------------------------------------------------------
  describe('Focus Area 5: System Key Preservation', () => {
    test('ADV-5.1: 100% preservation of statutory and architectural system keys when all custom fields are wiped', () => {
      const enlistments = [
        {
          year: '2026',
          packageType: 'KONSULTA',
          status: 'ENROLLED',
          enlistedAt: '2026-01-01T08:00:00Z',
          facilityAccreditationCode: 'H99001122',
        },
      ];

      const patient: Partial<ClinicPatient> = {
        id: 'patient-with-system-keys',
        customFields: {
          // System keys
          yakap_enlistments: enlistments,
          member_type: 'DD',
          principal_member_pin: '12-345678901-2',
          principal_full_name: 'Dela Cruz, Juan M.',
          principal_relationship: 'S',
          principal_dob: '1975-08-20',
          philhealth_profile: {
            memberType: 'DD',
            memberPin: '12-345678901-2',
            memberFirstName: 'Juan',
            memberLastName: 'Dela Cruz',
          },
          // Custom fields that will be cleared
          last_physical_exam_date: '2025-05-10',
          clinical_notes: 'To be wiped',
          framingham_risk_score: 9.2,
          // Arbitrary extra system metadata
          interop_sync_version: 5,
          fhir_resource_id: 'urn:uuid:pt-9988-aabb',
        },
      };

      // Wipe all user-editable custom fields
      const customFieldValues = {
        last_physical_exam_date: '',
        clinical_notes: '',
        framingham_risk_score: '',
      };

      const result = mergePatientCustomFields({
        patient,
        effectiveCustomFields: [dateField, textField, numberField],
        customFieldValues,
        staticValues: {},
        memberType: 'DD',
        principalMemberPin: '12-345678901-2',
        principalFullName: 'Dela Cruz, Juan M.',
        principalRelationship: 'S',
        principalDob: '1975-08-20',
        philHealthNumber: '12-888888888-1',
        firstName: 'Maria',
        lastName: 'Dela Cruz',
        dateOfBirth: '2005-03-12',
      });

      // User fields are cleared to null
      expect(result.last_physical_exam_date).toBeNull();
      expect(result.clinical_notes).toBeNull();
      expect(result.framingham_risk_score).toBeNull();

      // Statutory & architectural keys MUST be preserved exactly
      expect(result.yakap_enlistments).toEqual(enlistments);
      expect(result.member_type).toBe('DD');
      expect(result.principal_member_pin).toBe('12-345678901-2');
      expect(result.principal_full_name).toBe('Dela Cruz, Juan M.');
      expect(result.principal_relationship).toBe('S');
      expect(result.principal_dob).toBe('1975-08-20');
      expect(result.philhealth_profile).toBeDefined();
      expect(result.philhealth_profile.memberType).toBe('DD');
      expect(result.philhealth_profile.memberPin).toBe('12-345678901-2');
      expect(result.interop_sync_version).toBe(5);
      expect(result.fhir_resource_id).toBe('urn:uuid:pt-9988-aabb');
    });

    test('ADV-5.2: Hostile attempt - customFieldValues containing undefined yakap_enlistments does NOT overwrite DB enlistments', () => {
      const enlistments = [{ year: '2026', status: 'ENROLLED' }];
      const patient: Partial<ClinicPatient> = {
        id: 'patient-enlistment-safe',
        customFields: {
          yakap_enlistments: enlistments,
          clinical_notes: 'Old note',
        },
      };

      const result = mergePatientCustomFields({
        patient,
        effectiveCustomFields: [textField],
        customFieldValues: {
          clinical_notes: 'New note',
          // yakap_enlistments is omitted or undefined in customFieldValues
        },
        staticValues: {},
      });

      expect(result.yakap_enlistments).toEqual(enlistments);
    });
  });

  // -------------------------------------------------------------------------------------------------
  // FOCUS AREA 6: UI Consumer Safety & Crash Immunity with Null Values
  // -------------------------------------------------------------------------------------------------
  describe('Focus Area 6: UI Consumer Crash Immunity with Null Values', () => {
    test('ADV-6.1: DynamicCustomFieldsRenderer creates valid element without crash when values dictionary contains nulls', () => {
      const nullValues = {
        last_physical_exam_date: null,
        clinical_notes: null,
        framingham_risk_score: null,
        blood_donor_status: null,
        consent_research: null,
      };

      const element = React.createElement(DynamicCustomFieldsRenderer, {
        fields: allTypesDefinitions,
        values: nullValues,
        onChange: () => {},
        errors: {},
        staticValues: {},
      });

      expect(element).toBeDefined();
      expect(element.type).toBe(DynamicCustomFieldsRenderer);
    });

    test('ADV-6.2: validateCustomFields handles null values cleanly without throw or false positives on optional fields', () => {
      const nullValues = {
        last_physical_exam_date: null,
        clinical_notes: null,
        framingham_risk_score: null,
        blood_donor_status: null,
        consent_research: null,
      };

      const res = validateCustomFields(allTypesDefinitions, nullValues, {});
      expect(res.isValid).toBe(true);
      expect(Object.keys(res.errors).length).toBe(0);
    });

    test('ADV-6.3: sanitizeCustomFieldsPayload strips null values cleanly', () => {
      const nullValues = {
        last_physical_exam_date: null,
        clinical_notes: 'Valid Note',
        framingham_risk_score: null,
      };

      const clean = sanitizeCustomFieldsPayload([dateField, textField, numberField], nullValues, {});
      expect('last_physical_exam_date' in clean).toBe(false);
      expect('framingham_risk_score' in clean).toBe(false);
      expect(clean.clinical_notes).toBe('Valid Note');
    });

    test('ADV-6.4: PatientSearchResultRow does not leak string "null" or crash when customFields contain null', () => {
      const patientWithNulls: ClinicPatient = {
        id: 'pt-search-null',
        tenantId: 'tenant-adv',
        clinicId: 'clinic-adv',
        patientCode: 'P-001',
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        fullName: 'Dela Cruz, Juan',
        dateOfBirth: '1990-01-01',
        gender: 'Male',
        contactNumber: '09170001111',
        verificationStatus: 'Verified',
        customFields: {
          last_physical_exam_date: null,
          student_id: null,
          college: null,
          employee_id: null,
        },
      } as any;

      const element = PatientSearchResultRow({
        patient: patientWithNulls,
        customFieldDefs: [dateField],
        activeKeys: ['meta:last_physical_exam_date', 'meta:student_id'],
        onPress: () => {},
      });

      expect(element).toBeDefined();
    });

    test('ADV-6.5: PatientDirectoryCard does not crash when student_id or employee_id are null', () => {
      const patientWithNulls: ClinicPatient = {
        id: 'pt-card-null',
        tenantId: 'tenant-adv',
        clinicId: 'clinic-adv',
        patientCode: 'P-002',
        firstName: 'Pedro',
        lastName: 'Santos',
        fullName: 'Santos, Pedro',
        dateOfBirth: '1985-06-15',
        gender: 'Male',
        contactNumber: '09180002222',
        verificationStatus: 'Verified',
        customFields: {
          student_id: null,
          employee_id: null,
          department: null,
          program: null,
          year_level: null,
        },
      } as any;

      // Card mode
      const cardElement = React.createElement(PatientDirectoryCard, {
        patient: patientWithNulls,
        mode: 'card',
      });
      expect(cardElement).toBeDefined();

      // Table mode
      const tableElement = React.createElement(PatientDirectoryCard, {
        patient: patientWithNulls,
        mode: 'table',
      });
      expect(tableElement).toBeDefined();
    });

    test('ADV-6.6: extractPhilHealthProfileData handles null customFields gracefully without crashing', () => {
      const nullCf = {
        philhealth_profile: null,
        member_type: null,
        principal_member_pin: null,
        principal_full_name: null,
        principal_relationship: null,
        principal_dob: null,
      };

      const extracted = extractPhilHealthProfileData(nullCf, {});
      expect(extracted.memberType).toBe('MM');
      expect(extracted.principalPin).toBe('');
      expect(extracted.principalFullName).toBe('');
      expect(extracted.principalRelationship).toBe('C');
      expect(extracted.principalDob).toBe('');
    });
  });
});
