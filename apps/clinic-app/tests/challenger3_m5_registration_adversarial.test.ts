// token-guard:ignore-file
/**
 * apps/clinic-app/tests/challenger3_m5_registration_adversarial.test.ts
 *
 * Milestone 5 Phase 2: Adversarial Challenger 3 Test Suite
 * Empirical stress testing of patient registration in Patients.screen.tsx:
 * 1. Faithfully transfers yakap_enlistments under tenantCustomFields defined vs empty (classification branch)
 * 2. Faithfully transfers yakap_enlistments with dirty data, stringified JSON, or multiple benefit periods
 * 3. End-to-end simulation of YakapEnlistmentSection state changes propagating through handleRegister payload
 * 4. White-box static verification of Patients.screen.tsx AST and control-flow structure
 */

import { describe, it, expect, mock } from 'bun:test';
import fs from 'fs';
import path from 'path';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const comp = (props: any) => props.children || null;
  comp.displayName = name;
  return comp;
};

// Mock react-native before importing application modules
mock.module('react-native', () => ({
  Linking: {
    openURL: () => Promise.resolve(),
    canOpenURL: () => Promise.resolve(true),
    getInitialURL: () => Promise.resolve(null),
    addEventListener: () => ({ remove: () => {} }),
  },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  TextInput: createMockComponent('TextInput'),
  Text: createMockComponent('Text'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
  FlatList: createMockComponent('FlatList'),
  SectionList: createMockComponent('SectionList'),
  Switch: createMockComponent('Switch'),
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  TouchableHighlight: createMockComponent('TouchableHighlight'),
  Image: createMockComponent('Image'),
  RefreshControl: createMockComponent('RefreshControl'),
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  Alert: { alert: () => {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
  },
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

mock.module('expo-secure-store', () => ({
  getItemAsync: () => Promise.resolve(null),
  setItemAsync: () => Promise.resolve(),
  deleteItemAsync: () => Promise.resolve(),
}));

mock.module('@react-native-community/netinfo', () => ({
  addEventListener: () => () => {},
  fetch: () => Promise.resolve({ isConnected: true }),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));

mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
}));

const { sanitizeCustomFieldsPayload } = await import('../components/custom-fields');
const {
  getYakapEnlistments,
  getActiveYakapEnlistment,
  recordAnnualRenewal,
} = await import('../utils/yakapEnlistment');

/**
 * Pure helper reproducing the exact customFields construction logic inside
 * Patients.screen.tsx handleRegister (lines 598-639)
 */
function buildRegistrationCustomFields(params: {
  tenantCustomFields: any[];
  dynamicFieldValues: Record<string, any>;
  staticValues?: Record<string, any>;
  formClassification?: 'General' | 'Student' | 'Employee';
  formStudentId?: string;
  formCollege?: string;
  formProgram?: string;
  formYearLevel?: string;
  formEmployeeId?: string;
  formDepartment?: string;
  formMemberType?: string;
  formPrincipalPin?: string;
  formPrincipalFullName?: string;
  formPrincipalRelationship?: string;
  formPrincipalDob?: string;
  formPhilHealth?: string;
  formFirstName?: string;
  formLastName?: string;
  formMiddleName?: string;
  formDob?: string;
}): Record<string, any> {
  const {
    tenantCustomFields,
    dynamicFieldValues,
    staticValues = {},
    formClassification = 'General',
    formStudentId = '',
    formCollege = '',
    formProgram = '',
    formYearLevel = '',
    formEmployeeId = '',
    formDepartment = '',
    formMemberType = 'MM',
  } = params;

  const customFields: Record<string, any> = {};

  if (tenantCustomFields.length > 0) {
    const cleanCustom = sanitizeCustomFieldsPayload(tenantCustomFields, dynamicFieldValues, staticValues);
    Object.assign(customFields, cleanCustom);
  } else {
    if (formClassification === 'Student') {
      customFields['classification'] = 'Student';
      if (formStudentId.trim()) customFields['student_id'] = formStudentId.trim();
      if (formCollege.trim()) customFields['college'] = formCollege.trim();
      if (formProgram.trim()) customFields['program'] = formProgram.trim();
      if (formYearLevel.trim()) customFields['year_level'] = formYearLevel.trim();
    } else if (formClassification === 'Employee') {
      customFields['classification'] = 'Employee';
      if (formEmployeeId.trim()) customFields['employee_id'] = formEmployeeId.trim();
      if (formDepartment.trim()) customFields['department'] = formDepartment.trim();
    }
  }

  if (dynamicFieldValues['yakap_enlistments']) {
    customFields['yakap_enlistments'] = dynamicFieldValues['yakap_enlistments'];
  }

  customFields['member_type'] = formMemberType;
  return customFields;
}

describe('Challenger 3 Adversarial Registration & Locality Suite: Patients.screen.tsx', () => {
  // =========================================================================
  // SUITE 1: Permutations of tenantCustomFields (Defined vs Empty)
  // =========================================================================
  describe('Suite 1: Permutations of tenantCustomFields (Defined vs Empty Branch)', () => {
    const sampleYakapEnlistments = [
      {
        effective_year: '2026',
        enlisted_at: '2026-01-15',
        valid_until: '2026-12-31',
        status: 'Active',
        source: 'ClinicEnlistment',
        case_no: null,
        enlistment_no: null,
        profiling_trans_no: null,
      },
    ];

    it('1.1 Transfers yakap_enlistments faithfully when tenantCustomFields has active definitions', () => {
      const tenantCustomFields = [
        {
          id: 'f-1',
          tenantId: 'tenant-1',
          clinicId: 'clinic-1',
          entityType: 'ClinicPatient',
          fieldKey: 'primary_city',
          label: 'City',
          dataType: 'Text',
          category: 'Address',
          isRequired: false,
          displayOrder: 1,
          isActive: true,
        },
        {
          id: 'f-2',
          tenantId: 'tenant-1',
          clinicId: 'clinic-1',
          entityType: 'ClinicPatient',
          fieldKey: 'primary_province',
          label: 'Province',
          dataType: 'Text',
          category: 'Address',
          isRequired: false,
          displayOrder: 2,
          isActive: true,
        },
      ];

      const dynamicFieldValues = {
        primary_city: 'Davao City',
        primary_province: 'Davao del Sur',
        yakap_enlistments: sampleYakapEnlistments,
      };

      const result = buildRegistrationCustomFields({
        tenantCustomFields,
        dynamicFieldValues,
      });

      // Both tenant-defined custom fields and statutory yakap_enlistments must coexist
      expect(result.primary_city).toBe('Davao City');
      expect(result.primary_province).toBe('Davao del Sur');
      expect(result.yakap_enlistments).toEqual(sampleYakapEnlistments);
      expect(result.yakap_enlistments[0].effective_year).toBe('2026');
      expect(result.yakap_enlistments[0].status).toBe('Active');
    });

    it('1.2 Transfers yakap_enlistments faithfully when tenantCustomFields is empty (Student branch)', () => {
      const dynamicFieldValues = {
        yakap_enlistments: sampleYakapEnlistments,
      };

      const result = buildRegistrationCustomFields({
        tenantCustomFields: [],
        dynamicFieldValues,
        formClassification: 'Student',
        formStudentId: '2026-STUD-001',
        formCollege: 'College of Medicine',
        formProgram: 'Doctor of Medicine',
        formYearLevel: '1st Year',
      });

      expect(result.classification).toBe('Student');
      expect(result.student_id).toBe('2026-STUD-001');
      expect(result.college).toBe('College of Medicine');
      expect(result.program).toBe('Doctor of Medicine');
      expect(result.year_level).toBe('1st Year');
      expect(result.yakap_enlistments).toEqual(sampleYakapEnlistments);
    });

    it('1.3 Transfers yakap_enlistments faithfully when tenantCustomFields is empty (Employee branch)', () => {
      const dynamicFieldValues = {
        yakap_enlistments: sampleYakapEnlistments,
      };

      const result = buildRegistrationCustomFields({
        tenantCustomFields: [],
        dynamicFieldValues,
        formClassification: 'Employee',
        formEmployeeId: 'EMP-7890',
        formDepartment: 'Nursing Service',
      });

      expect(result.classification).toBe('Employee');
      expect(result.employee_id).toBe('EMP-7890');
      expect(result.department).toBe('Nursing Service');
      expect(result.yakap_enlistments).toEqual(sampleYakapEnlistments);
    });

    it('1.4 Transfers yakap_enlistments faithfully when tenantCustomFields is empty (General branch)', () => {
      const dynamicFieldValues = {
        yakap_enlistments: sampleYakapEnlistments,
      };

      const result = buildRegistrationCustomFields({
        tenantCustomFields: [],
        dynamicFieldValues,
        formClassification: 'General',
      });

      expect(result.classification).toBeUndefined();
      expect(result.student_id).toBeUndefined();
      expect(result.employee_id).toBeUndefined();
      expect(result.yakap_enlistments).toEqual(sampleYakapEnlistments);
      expect(result.member_type).toBe('MM');
    });
  });

  // =========================================================================
  // SUITE 2: Dirty Data, Stringified JSON, & Multiple Enlistment Periods
  // =========================================================================
  describe('Suite 2: Adversarial Data Variations in dynamicFieldValues', () => {
    it('2.1 Multi-Year Enlistment Array: Preserves chronological order, expired statuses, and journey numbers', () => {
      const multiYearEnlistments = [
        {
          effective_year: '2024',
          enlisted_at: '2024-01-10',
          valid_until: '2024-12-31',
          status: 'Expired',
          source: 'ClinicEnlistment',
          case_no: 'C00921202400001',
          enlistment_no: 'E00921202400001',
          profiling_trans_no: 'P00921202400001',
        },
        {
          effective_year: '2025',
          enlisted_at: '2025-01-05',
          valid_until: '2025-12-31',
          status: 'Expired',
          source: 'PhilHealthMasterlist',
          case_no: 'C00921202500002',
          enlistment_no: 'E00921202500002',
          profiling_trans_no: 'P00921202500002',
        },
        {
          effective_year: '2026',
          enlisted_at: '2026-01-02',
          valid_until: '2026-12-31',
          status: 'Active',
          source: 'ClinicEnlistment',
          case_no: null,
          enlistment_no: null,
          profiling_trans_no: null,
        },
      ];

      const result = buildRegistrationCustomFields({
        tenantCustomFields: [],
        dynamicFieldValues: { yakap_enlistments: multiYearEnlistments },
      });

      expect(result.yakap_enlistments).toHaveLength(3);
      expect(result.yakap_enlistments[0].effective_year).toBe('2024');
      expect(result.yakap_enlistments[0].status).toBe('Expired');
      expect(result.yakap_enlistments[1].effective_year).toBe('2025');
      expect(result.yakap_enlistments[2].effective_year).toBe('2026');
      expect(result.yakap_enlistments[2].status).toBe('Active');

      // Verify that consumer helper getYakapEnlistments & getActiveYakapEnlistment parses correctly
      const parsed = getYakapEnlistments(result);
      expect(parsed).toHaveLength(3);
      const active = getActiveYakapEnlistment(result, '2026-06-15');
      expect(active).not.toBeNull();
      expect(active?.effective_year).toBe('2026');
    });

    it('2.2 Stringified JSON Array: Transfers faithfully and parses cleanly with getYakapEnlistments', () => {
      const rawStringifiedJson = JSON.stringify([
        {
          effective_year: '2026',
          enlisted_at: '2026-02-01',
          valid_until: '2026-12-31',
          status: 'Active',
          source: 'SelfReported',
        },
      ]);

      const result = buildRegistrationCustomFields({
        tenantCustomFields: [],
        dynamicFieldValues: { yakap_enlistments: rawStringifiedJson },
      });

      // The string is transferred without mutation or crash
      expect(typeof result.yakap_enlistments).toBe('string');
      expect(result.yakap_enlistments).toBe(rawStringifiedJson);

      // Downstream consumers parse stringified JSON seamlessly
      const parsed = getYakapEnlistments(result);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].effective_year).toBe('2026');
      expect(parsed[0].source).toBe('SelfReported');
    });

    it('2.3 Falsy or Empty Enlistments: Does not corrupt customFields with undefined or empty string', () => {
      // Case A: undefined
      const resUndefined = buildRegistrationCustomFields({
        tenantCustomFields: [],
        dynamicFieldValues: { yakap_enlistments: undefined },
      });
      expect(resUndefined.yakap_enlistments).toBeUndefined();

      // Case B: null
      const resNull = buildRegistrationCustomFields({
        tenantCustomFields: [],
        dynamicFieldValues: { yakap_enlistments: null },
      });
      expect(resNull.yakap_enlistments).toBeUndefined();

      // Case C: empty string
      const resEmptyStr = buildRegistrationCustomFields({
        tenantCustomFields: [],
        dynamicFieldValues: { yakap_enlistments: '' },
      });
      expect(resEmptyStr.yakap_enlistments).toBeUndefined();

      // Case D: empty array []
      const resEmptyArr = buildRegistrationCustomFields({
        tenantCustomFields: [],
        dynamicFieldValues: { yakap_enlistments: [] },
      });
      expect(resEmptyArr.yakap_enlistments).toEqual([]);
    });

    it('2.4 Dirty Keys Sanitization: Prevents malicious or unapproved keys from leaking into customFields', () => {
      const tenantCustomFields = [
        {
          id: 'f-1',
          tenantId: 'tenant-1',
          clinicId: 'clinic-1',
          entityType: 'ClinicPatient',
          fieldKey: 'primary_city',
          label: 'City',
          dataType: 'Text',
          category: 'Address',
          isRequired: false,
          displayOrder: 1,
          isActive: true,
        },
      ];

      const dirtyDynamicFieldValues = {
        primary_city: 'Quezon City',
        unapproved_hack: 'DROP TABLE patients;',
        __proto_injection: '<script>alert(1)</script>',
        yakap_enlistments: [
          {
            effective_year: '2026',
            enlisted_at: '2026-01-01',
            valid_until: '2026-12-31',
            status: 'Active',
            source: 'ClinicEnlistment',
          },
        ],
      };

      const result = buildRegistrationCustomFields({
        tenantCustomFields,
        dynamicFieldValues: dirtyDynamicFieldValues,
      });

      // Sanitization strips unapproved keys while preserving allowed field and yakap_enlistments
      expect(result.primary_city).toBe('Quezon City');
      expect(result.unapproved_hack).toBeUndefined();
      expect(result.__proto_injection).toBeUndefined();
      expect(result.yakap_enlistments).toHaveLength(1);
      expect(result.yakap_enlistments[0].effective_year).toBe('2026');
    });
  });

  // =========================================================================
  // SUITE 3: Interactive Lifecycle: recordAnnualRenewal -> handleRegister Payload
  // =========================================================================
  describe('Suite 3: YakapEnlistmentSection Renewal Simulation to Registration Payload', () => {
    it('3.1 Simulates adding renewal in YakapEnlistmentSection then registering patient', () => {
      // Initial state: dynamicFieldValues has no enlistments
      const dynamicFieldValues: Record<string, any> = {};

      // User triggers annual renewal for 2026 via YakapEnlistmentSection
      recordAnnualRenewal(dynamicFieldValues, {
        effectiveYear: '2026',
        enlistedAt: '2026-01-01',
        validUntil: '2026-12-31',
        source: 'ClinicEnlistment',
      });

      expect(dynamicFieldValues['yakap_enlistments']).toBeDefined();
      expect(dynamicFieldValues['yakap_enlistments']).toHaveLength(1);

      // Now user triggers registration
      const payloadCustomFields = buildRegistrationCustomFields({
        tenantCustomFields: [],
        dynamicFieldValues,
        formClassification: 'General',
      });

      expect(payloadCustomFields.yakap_enlistments).toBeDefined();
      expect(payloadCustomFields.yakap_enlistments).toHaveLength(1);
      expect(payloadCustomFields.yakap_enlistments[0].effective_year).toBe('2026');
      expect(payloadCustomFields.yakap_enlistments[0].status).toBe('Active');
      expect(payloadCustomFields.yakap_enlistments[0].case_no).toBeNull();
      expect(payloadCustomFields.yakap_enlistments[0].enlistment_no).toBeNull();
      expect(payloadCustomFields.yakap_enlistments[0].profiling_trans_no).toBeNull();
    });

    it('3.2 Successive renewals transition prior active entry for same year to Expired before registration', () => {
      const dynamicFieldValues: Record<string, any> = {};

      // Record first 2026 entry
      recordAnnualRenewal(dynamicFieldValues, {
        effectiveYear: '2026',
        enlistedAt: '2026-01-01',
        validUntil: '2026-12-31',
        source: 'ClinicEnlistment',
      });

      // Renew again for 2026 (superseding the first entry)
      recordAnnualRenewal(dynamicFieldValues, {
        effectiveYear: '2026',
        enlistedAt: '2026-06-01',
        validUntil: '2026-12-31',
        source: 'ClinicEnlistment',
      });

      const payloadCustomFields = buildRegistrationCustomFields({
        tenantCustomFields: [],
        dynamicFieldValues,
      });

      expect(payloadCustomFields.yakap_enlistments).toHaveLength(2);
      const [entry1, entry2] = payloadCustomFields.yakap_enlistments;
      expect(entry1.effective_year).toBe('2026');
      expect(entry1.status).toBe('Expired'); // Prior active entry for same year marked Expired
      expect(entry2.effective_year).toBe('2026');
      expect(entry2.status).toBe('Active'); // Newest active entry for benefit year
    });

    it('3.3 Multi-year renewals preserve independent annual periods with date-based active resolution', () => {
      const dynamicFieldValues: Record<string, any> = {};

      // Record 2025
      recordAnnualRenewal(dynamicFieldValues, {
        effectiveYear: '2025',
        enlistedAt: '2025-01-01',
        validUntil: '2025-12-31',
        source: 'ClinicEnlistment',
      });

      // Record 2026
      recordAnnualRenewal(dynamicFieldValues, {
        effectiveYear: '2026',
        enlistedAt: '2026-01-01',
        validUntil: '2026-12-31',
        source: 'ClinicEnlistment',
      });

      const payloadCustomFields = buildRegistrationCustomFields({
        tenantCustomFields: [],
        dynamicFieldValues,
      });

      expect(payloadCustomFields.yakap_enlistments).toHaveLength(2);

      // In 2025, active enlistment was 2025
      const active2025 = getActiveYakapEnlistment(payloadCustomFields, '2025-06-01');
      expect(active2025?.effective_year).toBe('2025');

      // In 2026, active enlistment is 2026
      const active2026 = getActiveYakapEnlistment(payloadCustomFields, '2026-06-01');
      expect(active2026?.effective_year).toBe('2026');
    });
  });

  // =========================================================================
  // SUITE 4: Source Code White-Box Verification of Patients.screen.tsx
  // =========================================================================
  describe('Suite 4: White-Box Source Code Verification of Patients.screen.tsx', () => {
    it('4.1 Asserts Patients.screen.tsx contains explicit yakap_enlistments transfer', () => {
      const screenPath = path.resolve(__dirname, '../navigation/screens/Patients.screen.tsx');
      expect(fs.existsSync(screenPath)).toBe(true);

      const code = fs.readFileSync(screenPath, 'utf8');

      // 1. Verify existence of the transfer check
      const expectedSnippet = `if (dynamicFieldValues['yakap_enlistments']) {\n      customFields['yakap_enlistments'] = dynamicFieldValues['yakap_enlistments'];\n    }`;
      expect(code.includes("if (dynamicFieldValues['yakap_enlistments'])")).toBe(true);
      expect(code.includes("customFields['yakap_enlistments'] = dynamicFieldValues['yakap_enlistments']")).toBe(true);

      // 2. Verify that it appears after the sanitizeCustomFieldsPayload block
      const sanitizeIndex = code.indexOf('const cleanCustom = sanitizeCustomFieldsPayload');
      const transferIndex = code.indexOf("customFields['yakap_enlistments'] = dynamicFieldValues['yakap_enlistments']");
      expect(sanitizeIndex).toBeGreaterThan(0);
      expect(transferIndex).toBeGreaterThan(sanitizeIndex);

      // 3. Verify that payload maps customFields
      const payloadCustomFieldsIndex = code.indexOf('customFields: Object.keys(customFields).length > 0 ? customFields : undefined');
      expect(payloadCustomFieldsIndex).toBeGreaterThan(transferIndex);
    });

    it('4.2 Verifies YakapEnlistmentSection is mounted with dynamicFieldValues binding', () => {
      const screenPath = path.resolve(__dirname, '../navigation/screens/Patients.screen.tsx');
      const code = fs.readFileSync(screenPath, 'utf8');

      // Check YakapEnlistmentSection binding
      expect(code.includes('<YakapEnlistmentSection')).toBe(true);
      expect(code.includes('customFields={dynamicFieldValues}')).toBe(true);
      expect(code.includes('onCustomFieldsChange={(next) => setDynamicFieldValues(next)}')).toBe(true);
    });
  });
});
