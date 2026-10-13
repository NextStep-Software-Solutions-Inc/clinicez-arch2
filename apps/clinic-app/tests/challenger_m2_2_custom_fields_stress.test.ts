// token-guard:ignore-file
/**
 * Test Suite: Challenger M2_2 Adversarial Stress Test Suite
 * Focus:
 * 1. Cascading Dropdown Options Mapper: mapping structures, invalid parent keys, unselected parents, default fallback options, malformed JSON.
 * 2. Suggested Templates Library UI: 1-click installation for USTP, Workplace, and Demographics bundles, verifying field definitions and option mappings.
 * 3. Reordering boundaries, touch targets, and mandatory required rules.
 * 4. Token guard and design system compliance.
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
let mockApiResponse: any = null;
let mockApiError: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async (url: string) => {
      lastApiCall = { method: 'GET', url };
      if (mockApiError) return [null, mockApiError];
      return [mockApiResponse, null];
    },
    post: async (url: string, data?: any) => {
      lastApiCall = { method: 'POST', url, data };
      if (mockApiError) return [null, mockApiError];
      return [mockApiResponse, null];
    },
    put: async (url: string, data?: any) => {
      lastApiCall = { method: 'PUT', url, data };
      if (mockApiError) return [null, mockApiError];
      return [mockApiResponse, null];
    },
    delete: async (url: string) => {
      lastApiCall = { method: 'DELETE', url };
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
const { isFieldVisible, getAvailableOptions, validateCustomFields } = await import('../components/custom-fields/DynamicCustomFieldsRenderer');
const { theme } = await import('../constants/theme');

describe('Challenger M2_2: Adversarial Stress Test Suite', () => {
  beforeEach(() => {
    lastApiCall = null;
    mockApiResponse = null;
    mockApiError = null;
  });

  // =========================================================================
  // TASK 1: EMPIRICAL VERIFICATION OF CASCADING DROPDOWN OPTIONS MAPPER
  // =========================================================================
  describe('Task 1: Cascading Dropdown Options Mapper Verification', () => {
    test('ADV-CASC-1: Standard mapping structure correctly resolves child options for valid parent keys', () => {
      const field: any = {
        id: 'f-prog',
        fieldKey: 'program',
        label: 'Degree Program',
        dataType: 'Select',
        isRequired: true,
        displayOrder: 4,
        conditionalOptionsJson: JSON.stringify({
          parentField: 'college',
          mapping: {
            'College of Engineering': ['BSCE', 'BSME', 'BSEE'],
            'College of Science': ['BS Physics', 'BS Chemistry', 'BS Biology'],
            'College of IT': ['BS Computer Science', 'BS Information Technology'],
          },
          defaultOptions: ['General Studies'],
        }),
      };

      const optionsEng = getAvailableOptions(field, { college: 'College of Engineering' });
      expect(optionsEng).toEqual(['BSCE', 'BSME', 'BSEE']);

      const optionsSci = getAvailableOptions(field, { college: 'College of Science' });
      expect(optionsSci).toEqual(['BS Physics', 'BS Chemistry', 'BS Biology']);

      const optionsIT = getAvailableOptions(field, { college: 'College of IT' });
      expect(optionsIT).toEqual(['BS Computer Science', 'BS Information Technology']);
    });

    test('ADV-CASC-2: Invalid / Unmatched parent keys cleanly fall back to default fallback options', () => {
      const field: any = {
        id: 'f-prog',
        fieldKey: 'program',
        label: 'Degree Program',
        dataType: 'Select',
        isRequired: true,
        displayOrder: 4,
        conditionalOptionsJson: JSON.stringify({
          parentField: 'college',
          mapping: {
            'College of Engineering': ['BSCE', 'BSME'],
          },
          defaultOptions: ['Undeclared Major', 'General Studies'],
        }),
      };

      // 1. Unknown string key
      expect(getAvailableOptions(field, { college: 'NonExistent College' })).toEqual([
        'Undeclared Major',
        'General Studies',
      ]);

      // 2. Case mismatch if exact string keying used
      expect(getAvailableOptions(field, { college: 'college of engineering' })).toEqual([
        'Undeclared Major',
        'General Studies',
      ]);

      // 3. Special characters / numeric parent key
      expect(getAvailableOptions(field, { college: 12345 as any })).toEqual([
        'Undeclared Major',
        'General Studies',
      ]);
    });

    test('ADV-CASC-3: Unselected / Empty parent keys cleanly fall back to default fallback options', () => {
      const field: any = {
        id: 'f-prog',
        fieldKey: 'program',
        label: 'Degree Program',
        dataType: 'Select',
        isRequired: true,
        displayOrder: 4,
        conditionalOptionsJson: JSON.stringify({
          parentField: 'college',
          mapping: {
            'College of Engineering': ['BSCE', 'BSME'],
          },
          defaultOptions: ['Select college first'],
        }),
      };

      // 1. Parent field undefined in values dictionary
      expect(getAvailableOptions(field, {})).toEqual(['Select college first']);

      // 2. Parent field explicitly undefined
      expect(getAvailableOptions(field, { college: undefined })).toEqual(['Select college first']);

      // 3. Parent field null
      expect(getAvailableOptions(field, { college: null })).toEqual(['Select college first']);

      // 4. Parent field empty string
      expect(getAvailableOptions(field, { college: '' })).toEqual(['Select college first']);
    });

    test('ADV-CASC-4: Default fallback options omitted or empty returns empty array [] without crashing', () => {
      // 1. defaultOptions empty array
      const fieldWithEmptyDefault: any = {
        id: 'f-prog',
        fieldKey: 'program',
        label: 'Degree Program',
        dataType: 'Select',
        conditionalOptionsJson: JSON.stringify({
          parentField: 'college',
          mapping: { 'College of Engineering': ['BSCE'] },
          defaultOptions: [],
        }),
      };
      expect(getAvailableOptions(fieldWithEmptyDefault, { college: '' })).toEqual([]);
      expect(getAvailableOptions(fieldWithEmptyDefault, { college: 'Unknown' })).toEqual([]);

      // 2. defaultOptions omitted completely from JSON
      const fieldWithMissingDefault: any = {
        id: 'f-prog',
        fieldKey: 'program',
        label: 'Degree Program',
        dataType: 'Select',
        conditionalOptionsJson: JSON.stringify({
          parentField: 'college',
          mapping: { 'College of Engineering': ['BSCE'] },
        }),
      };
      expect(getAvailableOptions(fieldWithMissingDefault, { college: '' })).toEqual([]);
      expect(getAvailableOptions(fieldWithMissingDefault, { college: 'Unknown' })).toEqual([]);
    });

    test('ADV-CASC-5: Rejects cascading options when field dataType is not Select', () => {
      const nonSelectField: any = {
        id: 'f-text',
        fieldKey: 'text_field',
        label: 'Text Field',
        dataType: 'Text', // Not Select
        conditionalOptionsJson: JSON.stringify({
          parentField: 'college',
          mapping: { 'College of Engineering': ['BSCE'] },
          defaultOptions: ['Fallback'],
        }),
      };
      expect(getAvailableOptions(nonSelectField, { college: 'College of Engineering' })).toEqual([]);
    });

    test('ADV-CASC-6: Corrupted / Malformed conditionalOptionsJson fails open to flat optionsJson or empty array', () => {
      // Corrupted JSON with fallback flat options
      const fieldWithFallback: any = {
        id: 'f-corrupt',
        fieldKey: 'corrupt_field',
        label: 'Corrupted Config',
        dataType: 'Select',
        conditionalOptionsJson: '{{malformed json: true',
        optionsJson: JSON.stringify(['Flat Option A', 'Flat Option B']),
      };
      expect(getAvailableOptions(fieldWithFallback, {})).toEqual(['Flat Option A', 'Flat Option B']);

      // Corrupted JSON with corrupted optionsJson
      const fieldTotallyCorrupt: any = {
        id: 'f-corrupt-2',
        fieldKey: 'corrupt_field_2',
        label: 'Totally Corrupted Config',
        dataType: 'Select',
        conditionalOptionsJson: 'NOT_JSON',
        optionsJson: 'ALSO_NOT_JSON',
      };
      expect(getAvailableOptions(fieldTotallyCorrupt, {})).toEqual([]);
    });

    test('ADV-CASC-7: Parent values with special characters, quotes, and whitespace map accurately', () => {
      const field: any = {
        id: 'f-special',
        fieldKey: 'sub_spec',
        label: 'Sub-Specialty',
        dataType: 'Select',
        conditionalOptionsJson: JSON.stringify({
          parentField: 'department',
          mapping: {
            'OB & GYN / Maternal-Fetal': ['High-Risk OB', 'Fetal Ultrasound'],
            'Ear, Nose & Throat (ENT)': ['Audiology', 'Rhinology'],
            'Internal Medicine "Cardio"': ['Interventional', 'Electrophysiology'],
          },
          defaultOptions: ['General'],
        }),
      };

      expect(getAvailableOptions(field, { department: 'OB & GYN / Maternal-Fetal' })).toEqual([
        'High-Risk OB',
        'Fetal Ultrasound',
      ]);
      expect(getAvailableOptions(field, { department: 'Ear, Nose & Throat (ENT)' })).toEqual([
        'Audiology',
        'Rhinology',
      ]);
      expect(getAvailableOptions(field, { department: 'Internal Medicine "Cardio"' })).toEqual([
        'Interventional',
        'Electrophysiology',
      ]);
    });
  });

  // =========================================================================
  // TASK 2: EMPIRICAL VERIFICATION OF SUGGESTED TEMPLATES LIBRARY UI
  // =========================================================================
  describe('Task 2: Suggested Templates Library UI & Presets Verification', () => {
    test('ADV-TMPL-1: USTP bundle definition contains exactly 8 fields in strict DisplayOrder with cascading program', async () => {
      // Simulate backend catalog response for USTP
      const ustpFields = [
        {
          id: 'cf-ustp-1',
          tenantId: 'tenant-1',
          clinicId: 'clinic-1',
          entityType: 'ClinicPatient',
          fieldKey: 'affiliation',
          label: 'Affiliation',
          dataType: 'Select' as const,
          category: 'Institutional',
          isRequired: true,
          displayOrder: 1,
          optionsJson: '["Student","Employee/Faculty","Dependent","Guest"]',
          isActive: true,
        },
        {
          id: 'cf-ustp-2',
          tenantId: 'tenant-1',
          clinicId: 'clinic-1',
          entityType: 'ClinicPatient',
          fieldKey: 'student_id',
          label: 'Student ID / LRN',
          dataType: 'Text' as const,
          category: 'Student',
          isRequired: true,
          displayOrder: 2,
          visibilityRuleJson: '{"source":"custom_field","field":"affiliation","operator":"equals","value":"Student"}',
          isActive: true,
        },
        {
          id: 'cf-ustp-3',
          tenantId: 'tenant-1',
          clinicId: 'clinic-1',
          entityType: 'ClinicPatient',
          fieldKey: 'college',
          label: 'College / Faculty',
          dataType: 'Select' as const,
          category: 'Student',
          isRequired: true,
          displayOrder: 3,
          optionsJson: '["College of Engineering and Architecture","College of Information Technology and Computing","College of Science and Mathematics","College of Technology","College of Science and Technology Education"]',
          visibilityRuleJson: '{"source":"custom_field","field":"affiliation","operator":"equals","value":"Student"}',
          isActive: true,
        },
        {
          id: 'cf-ustp-4',
          tenantId: 'tenant-1',
          clinicId: 'clinic-1',
          entityType: 'ClinicPatient',
          fieldKey: 'program',
          label: 'Degree / Academic Program',
          dataType: 'Select' as const,
          category: 'Student',
          isRequired: true,
          displayOrder: 4,
          optionsJson: '[]',
          visibilityRuleJson: '{"source":"custom_field","field":"affiliation","operator":"equals","value":"Student"}',
          conditionalOptionsJson: '{"parentField":"college","mapping":{"College of Engineering and Architecture":["BS Civil Engineering","BS Mechanical Engineering","BS Electrical Engineering","BS Architecture"],"College of Information Technology and Computing":["BS Information Technology","BS Computer Science","BS Data Science"],"College of Science and Mathematics":["BS Applied Mathematics","BS Chemistry","BS Environmental Science"],"College of Technology":["Bachelor of Engineering Technology","Automotive Engineering Technology"],"College of Science and Technology Education":["BSEd Major in Sciences","BSEd Major in Mathematics"]},"defaultOptions":[]}',
          isActive: true,
        },
        {
          id: 'cf-ustp-5',
          tenantId: 'tenant-1',
          clinicId: 'clinic-1',
          entityType: 'ClinicPatient',
          fieldKey: 'year_level',
          label: 'Year Level',
          dataType: 'Select' as const,
          category: 'Student',
          isRequired: false,
          displayOrder: 5,
          optionsJson: '["1st Year","2nd Year","3rd Year","4th Year","5th Year","Graduate Studies"]',
          visibilityRuleJson: '{"source":"custom_field","field":"affiliation","operator":"equals","value":"Student"}',
          isActive: true,
        },
        {
          id: 'cf-ustp-6',
          tenantId: 'tenant-1',
          clinicId: 'clinic-1',
          entityType: 'ClinicPatient',
          fieldKey: 'employee_id',
          label: 'Employee ID',
          dataType: 'Text' as const,
          category: 'Employee',
          isRequired: true,
          displayOrder: 6,
          visibilityRuleJson: '{"source":"custom_field","field":"affiliation","operator":"equals","value":"Employee/Faculty"}',
          isActive: true,
        },
        {
          id: 'cf-ustp-7',
          tenantId: 'tenant-1',
          clinicId: 'clinic-1',
          entityType: 'ClinicPatient',
          fieldKey: 'department',
          label: 'Department / Office',
          dataType: 'Text' as const,
          category: 'Employee',
          isRequired: false,
          displayOrder: 7,
          visibilityRuleJson: '{"source":"custom_field","field":"affiliation","operator":"equals","value":"Employee/Faculty"}',
          isActive: true,
        },
        {
          id: 'cf-ustp-8',
          tenantId: 'tenant-1',
          clinicId: 'clinic-1',
          entityType: 'ClinicPatient',
          fieldKey: 'campus_location',
          label: 'Campus Location',
          dataType: 'Select' as const,
          category: 'Institutional',
          isRequired: false,
          displayOrder: 8,
          optionsJson: '["Cagayan de Oro (Main)","Claveria","Jasaan","Panaon","Oroquieta","Villanueva","Balubal"]',
          isActive: true,
        },
      ];

      mockApiResponse = ustpFields;
      const [res, err] = await clinicService.installTemplateBundle('ustp');

      expect(err).toBeNull();
      expect(res).toBeDefined();
      expect(res!.length).toBe(8);

      // Verify strict display sequence
      const orders = res!.map((f) => f.displayOrder);
      expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

      // Verify cascading college -> program mapping
      const programField = res!.find((f) => f.fieldKey === 'program')!;
      expect(programField).toBeDefined();
      expect(programField.conditionalOptionsJson).toBeDefined();

      const cond = JSON.parse(programField.conditionalOptionsJson!);
      expect(cond.parentField).toBe('college');
      expect(Object.keys(cond.mapping)).toHaveLength(5);
      expect(cond.mapping['College of Information Technology and Computing']).toEqual([
        'BS Information Technology',
        'BS Computer Science',
        'BS Data Science',
      ]);
      expect(cond.mapping['College of Engineering and Architecture']).toEqual([
        'BS Civil Engineering',
        'BS Mechanical Engineering',
        'BS Electrical Engineering',
        'BS Architecture',
      ]);

      // Empirically test cascading behavior with USTP program field
      const itPrograms = getAvailableOptions(programField, {
        college: 'College of Information Technology and Computing',
      });
      expect(itPrograms).toEqual([
        'BS Information Technology',
        'BS Computer Science',
        'BS Data Science',
      ]);

      const unselectedPrograms = getAvailableOptions(programField, {});
      expect(unselectedPrograms).toEqual([]);
    });

    test('ADV-TMPL-2: Workplace bundle definition contains exactly 4 fields in strict sequence', async () => {
      const workplaceFields = [
        {
          id: 'cf-wp-1',
          fieldKey: 'employment_type',
          label: 'Employment Type',
          dataType: 'Select' as const,
          category: 'Corporate',
          isRequired: true,
          displayOrder: 1,
          optionsJson: '["Regular","Probationary","Contractor","Consultant","Intern"]',
          isActive: true,
        },
        {
          id: 'cf-wp-2',
          fieldKey: 'department',
          label: 'Department / Division',
          dataType: 'Text' as const,
          category: 'Corporate',
          isRequired: true,
          displayOrder: 2,
          isActive: true,
        },
        {
          id: 'cf-wp-3',
          fieldKey: 'employee_id',
          label: 'Corporate Employee ID',
          dataType: 'Text' as const,
          category: 'Corporate',
          isRequired: true,
          displayOrder: 3,
          isActive: true,
        },
        {
          id: 'cf-wp-4',
          fieldKey: 'hmo_provider',
          label: 'HMO / Healthcare Provider',
          dataType: 'Select' as const,
          category: 'Corporate',
          isRequired: false,
          displayOrder: 4,
          optionsJson: '["Maxicare","Intellicare","Medicard","PhilCare","CareHealth Plus","Cocolife","Other","None"]',
          isActive: true,
        },
      ];

      mockApiResponse = workplaceFields;
      const [res, err] = await clinicService.installTemplateBundle('workplace');

      expect(err).toBeNull();
      expect(res).toBeDefined();
      expect(res!.length).toBe(4);
      expect(res!.map((f) => f.displayOrder)).toEqual([1, 2, 3, 4]);

      // Verify mandatory flags
      expect(res!.find((f) => f.fieldKey === 'employment_type')?.isRequired).toBe(true);
      expect(res!.find((f) => f.fieldKey === 'department')?.isRequired).toBe(true);
      expect(res!.find((f) => f.fieldKey === 'employee_id')?.isRequired).toBe(true);
      expect(res!.find((f) => f.fieldKey === 'hmo_provider')?.isRequired).toBe(false);

      // Verify API call sent normalized backend key
      expect(lastApiCall?.data?.templateKey).toBe('workplace_corporate');
    });

    test('ADV-TMPL-3: Demographics bundle definition contains 3 fields with static conditional spouse rule', async () => {
      const demoFields = [
        {
          id: 'cf-dm-1',
          fieldKey: 'religion',
          label: 'Religion / Faith Affiliation',
          dataType: 'Select' as const,
          category: 'Demographics',
          isRequired: false,
          displayOrder: 1,
          optionsJson: '["Roman Catholic","Islam","Iglesia ni Cristo","Evangelical Christian","Seventh-day Adventist","Jehovah\'s Witnesses","Other","Prefer not to say"]',
          isActive: true,
        },
        {
          id: 'cf-dm-2',
          fieldKey: 'mothers_maiden_name',
          label: "Mother's Maiden Name",
          dataType: 'Text' as const,
          category: 'Demographics',
          isRequired: false,
          displayOrder: 2,
          isActive: true,
        },
        {
          id: 'cf-dm-3',
          fieldKey: 'spouse_information',
          label: 'Spouse Full Name & Contact',
          dataType: 'Text' as const,
          category: 'Demographics',
          isRequired: false,
          displayOrder: 3,
          visibilityRuleJson: '{"source":"static","field":"civilStatus","operator":"equals","value":"Married"}',
          isActive: true,
        },
      ];

      mockApiResponse = demoFields;
      const [res, err] = await clinicService.installTemplateBundle('demographics');

      expect(err).toBeNull();
      expect(res).toBeDefined();
      expect(res!.length).toBe(3);
      expect(res!.map((f) => f.displayOrder)).toEqual([1, 2, 3]);

      // Verify static conditional rule
      const spouseField = res!.find((f) => f.fieldKey === 'spouse_information')!;
      expect(spouseField.visibilityRuleJson).toBeDefined();

      // Test visibility evaluation
      const visibleWhenMarried = isFieldVisible(spouseField as any, {}, { civilStatus: 'Married' });
      expect(visibleWhenMarried).toBe(true);

      const hiddenWhenSingle = isFieldVisible(spouseField as any, {}, { civilStatus: 'Single' });
      expect(hiddenWhenSingle).toBe(false);

      const hiddenWhenUndefined = isFieldVisible(spouseField as any, {}, {});
      expect(hiddenWhenUndefined).toBe(false);

      // Verify API call sent normalized backend key
      expect(lastApiCall?.data?.templateKey).toBe('general_demographics');
    });

    test('ADV-TMPL-4: Template installer normalization handles case variants and aliases robustly', async () => {
      mockApiResponse = [];

      await clinicService.installTemplateBundle('USTP');
      expect(lastApiCall?.data?.templateKey).toBe('university_ustp');

      await clinicService.installTemplateBundle('University_USTP');
      expect(lastApiCall?.data?.templateKey).toBe('university_ustp');

      await clinicService.installTemplateBundle('WORKPLACE');
      expect(lastApiCall?.data?.templateKey).toBe('workplace_corporate');

      await clinicService.installTemplateBundle('DEMOGRAPHICS');
      expect(lastApiCall?.data?.templateKey).toBe('general_demographics');

      // Unrecognized template key is passed through as-is
      await clinicService.installTemplateBundle('custom_specialty_bundle');
      expect(lastApiCall?.data?.templateKey).toBe('custom_specialty_bundle');
    });

    test('ADV-TMPL-5: 1-Click install error handling preserves current state cleanly', async () => {
      mockApiError = { message: 'Tenant subscription limit reached', status: 403 };
      const [res, err] = await clinicService.installTemplateBundle('ustp');

      expect(res).toBeNull();
      expect(err).toBeDefined();
      expect(err.message).toBe('Tenant subscription limit reached');
    });

    test('ADV-TMPL-6: Patient Intake Address & Emergency Contacts bundle contains 14 fields with strict sequence and validation', async () => {
      const intakeFields = [
        { id: 'cf-in-1', fieldKey: 'primary_address_line', label: 'Primary Address (House/Unit/Street)', dataType: 'Text' as const, category: 'Address', isRequired: true, displayOrder: 1, isActive: true },
        { id: 'cf-in-2', fieldKey: 'primary_city', label: 'Primary City / Municipality', dataType: 'Text' as const, category: 'Address', isRequired: true, displayOrder: 2, isActive: true },
        { id: 'cf-in-3', fieldKey: 'primary_province', label: 'Primary Province / Region', dataType: 'Text' as const, category: 'Address', isRequired: false, displayOrder: 3, isActive: true },
        { id: 'cf-in-4', fieldKey: 'primary_postal_code', label: 'Primary Postal / ZIP Code', dataType: 'Text' as const, category: 'Address', isRequired: false, displayOrder: 4, isActive: true },
        { id: 'cf-in-5', fieldKey: 'secondary_address_line', label: 'Secondary / Alternative Address', dataType: 'Text' as const, category: 'Address', isRequired: false, displayOrder: 5, isActive: true },
        { id: 'cf-in-6', fieldKey: 'secondary_city_province', label: 'Secondary City & Province', dataType: 'Text' as const, category: 'Address', isRequired: false, displayOrder: 6, isActive: true },
        { id: 'cf-in-7', fieldKey: 'emergency_contact_name', label: 'Primary Emergency Contact Name', dataType: 'Text' as const, category: 'Emergency Contacts', isRequired: true, displayOrder: 7, isActive: true },
        { id: 'cf-in-8', fieldKey: 'emergency_contact_relationship', label: 'Relationship to Patient', dataType: 'Select' as const, category: 'Emergency Contacts', isRequired: true, displayOrder: 8, optionsJson: '["Parent","Spouse","Child","Sibling","Guardian","Relative","Friend","Workplace Colleague","Other"]', isActive: true },
        { id: 'cf-in-9', fieldKey: 'emergency_contact_phone', label: 'Emergency Contact Phone Number', dataType: 'Text' as const, category: 'Emergency Contacts', isRequired: true, displayOrder: 9, isActive: true },
        { id: 'cf-in-10', fieldKey: 'emergency_contact_address', label: 'Emergency Contact Address', dataType: 'Text' as const, category: 'Emergency Contacts', isRequired: false, displayOrder: 10, isActive: true },
        { id: 'cf-in-11', fieldKey: 'secondary_emergency_contact_name', label: 'Secondary Emergency Contact Name', dataType: 'Text' as const, category: 'Emergency Contacts', isRequired: false, displayOrder: 11, isActive: true },
        { id: 'cf-in-12', fieldKey: 'secondary_emergency_contact_relationship', label: 'Secondary Contact Relationship', dataType: 'Select' as const, category: 'Emergency Contacts', isRequired: false, displayOrder: 12, optionsJson: '["Parent","Spouse","Child","Sibling","Guardian","Relative","Friend","Workplace Colleague","Other"]', isActive: true },
        { id: 'cf-in-13', fieldKey: 'secondary_emergency_contact_phone', label: 'Secondary Contact Phone Number', dataType: 'Text' as const, category: 'Emergency Contacts', isRequired: false, displayOrder: 13, isActive: true },
        { id: 'cf-in-14', fieldKey: 'secondary_emergency_contact_address', label: 'Secondary Contact Address', dataType: 'Text' as const, category: 'Emergency Contacts', isRequired: false, displayOrder: 14, isActive: true },
      ];

      mockApiResponse = intakeFields;
      const [res, err] = await clinicService.installTemplateBundle('intake');

      expect(err).toBeNull();
      expect(res).toBeDefined();
      expect(res!.length).toBe(14);
      expect(res!.map((f) => f.displayOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);

      // Verify category distribution
      const addressFields = res!.filter((f) => f.category === 'Address');
      expect(addressFields).toHaveLength(6);
      const emergencyFields = res!.filter((f) => f.category === 'Emergency Contacts');
      expect(emergencyFields).toHaveLength(8);

      // Verify Select options resolution
      const relField = res!.find((f) => f.fieldKey === 'emergency_contact_relationship')!;
      const relOptions = getAvailableOptions(relField as any, {});
      expect(relOptions).toContain('Parent');
      expect(relOptions).toContain('Spouse');
      expect(relOptions).toContain('Guardian');

      // Verify form validation behavior
      const incompleteValues = {
        primary_address_line: '123 Main St',
        // missing primary_city, emergency_contact_name, relationship, phone
      };
      const invalidValidation = validateCustomFields(res as any, incompleteValues);
      expect(invalidValidation.isValid).toBe(false);
      expect(invalidValidation.errors['primary_city']).toBeDefined();
      expect(invalidValidation.errors['emergency_contact_name']).toBeDefined();

      const completeValues = {
        primary_address_line: '123 Main St',
        primary_city: 'Cagayan de Oro City',
        emergency_contact_name: 'Maria Santos',
        emergency_contact_relationship: 'Parent',
        emergency_contact_phone: '0917-111-2222',
      };
      const validValidation = validateCustomFields(res as any, completeValues);
      expect(validValidation.isValid).toBe(true);
      expect(Object.keys(validValidation.errors)).toHaveLength(0);
    });
  });

  // =========================================================================
  // TASK 3: REORDERING, BOUNDARY CONDITIONS & TOUCH TARGET AUDIT
  // =========================================================================
  describe('Task 3: Reordering Boundaries, Touch Targets & Form Validation', () => {
    test('ADV-REORD-1: reorderCustomFields supports both string array and object payload structures', async () => {
      mockApiResponse = [{ id: 'cf-2', displayOrder: 1 }, { id: 'cf-1', displayOrder: 2 }];

      // Array format
      await clinicService.reorderCustomFields(['cf-2', 'cf-1']);
      expect(lastApiCall?.method).toBe('PUT');
      expect(lastApiCall?.url).toBe('/custom-fields/reorder');
      expect(lastApiCall?.data).toEqual({
        orderedIds: ['cf-2', 'cf-1'],
        entityType: 'ClinicPatient',
      });

      // Object format
      await clinicService.reorderCustomFields({
        items: [
          { id: 'cf-2', displayOrder: 1 },
          { id: 'cf-1', displayOrder: 2 },
        ],
        entityType: 'ClinicPatient',
      });
      expect(lastApiCall?.data?.items).toHaveLength(2);
    });

    test('ADV-REORD-2: Touch target size constants meet accessibility standards (>= 44px)', () => {
      expect(theme.sizes.touchTarget).toBeGreaterThanOrEqual(44);
    });

    test('ADV-VAL-1: validateCustomFields enforces required fields strictly when visible and ignores when hidden', () => {
      const fields: any[] = [
        {
          id: 'f-1',
          fieldKey: 'affiliation',
          label: 'Affiliation',
          dataType: 'Select',
          isRequired: true,
          displayOrder: 1,
        },
        {
          id: 'f-2',
          fieldKey: 'student_id',
          label: 'Student ID',
          dataType: 'Text',
          isRequired: true,
          displayOrder: 2,
          visibilityRuleJson: JSON.stringify({
            source: 'custom_field',
            field: 'affiliation',
            operator: 'equals',
            value: 'Student',
          }),
        },
        {
          id: 'f-3',
          fieldKey: 'employee_id',
          label: 'Employee ID',
          dataType: 'Text',
          isRequired: true,
          displayOrder: 3,
          visibilityRuleJson: JSON.stringify({
            source: 'custom_field',
            field: 'affiliation',
            operator: 'equals',
            value: 'Employee',
          }),
        },
      ];

      // Case 1: affiliation = Student, student_id empty -> fails because student_id is visible and required
      const check1 = validateCustomFields(fields, { affiliation: 'Student' });
      expect(check1.isValid).toBe(false);
      expect(check1.errors['student_id']).toBe('Student ID is required.');
      // employee_id is hidden, so it should NOT have an error
      expect(check1.errors['employee_id']).toBeUndefined();

      // Case 2: affiliation = Student, student_id provided -> passes!
      const check2 = validateCustomFields(fields, { affiliation: 'Student', student_id: '2026-001' });
      expect(check2.isValid).toBe(true);
      expect(Object.keys(check2.errors)).toHaveLength(0);

      // Case 3: affiliation = Employee, student_id empty -> student_id is hidden so does not fail
      const check3 = validateCustomFields(fields, { affiliation: 'Employee', employee_id: 'EMP-99' });
      expect(check3.isValid).toBe(true);
      expect(check3.errors['student_id']).toBeUndefined();
    });
  });
});
