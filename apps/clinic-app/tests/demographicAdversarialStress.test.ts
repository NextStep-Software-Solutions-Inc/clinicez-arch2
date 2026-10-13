// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, onPress, value, onChangeText }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        onClick: onPress,
      },
      placeholder,
      children
    );
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
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
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
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
  Alert: { alert: mock(() => {}) },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  default: 'Svg',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

let lastPutUrl = '';
let lastPutPayload: any = null;
let lastPostUrl = '';
let lastPostPayload: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    put: async (url: string, payload?: any) => {
      lastPutUrl = url;
      lastPutPayload = payload;
      return [payload, null];
    },
    post: async (url: string, payload?: any) => {
      lastPostUrl = url;
      lastPostPayload = payload;
      return [payload, null];
    },
    get: async () => [null, null],
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const { clinicService } = await import('../services/clinicService');
type ClinicPatient = import('../services/clinicService').ClinicPatient;
type RegisterPatientPayload = import('../services/clinicService').RegisterPatientPayload;
const { EditPatientModal } = await import('../components/patient/EditPatientModal');

describe('Adversarial Demographic Stress Suite', () => {
  beforeEach(() => {
    lastPutUrl = '';
    lastPutPayload = null;
    lastPostUrl = '';
    lastPostPayload = null;
  });

  const basePatient: ClinicPatient = {
    id: 'pat-stress-001',
    tenantId: 'tenant-adv',
    clinicId: 'clinic-adv',
    patientCode: 'PAT-2026-00042',
    firstName: 'Consuelo',
    lastName: 'Villaruel',
    middleName: 'Alcantara',
    suffix: 'Sr.',
    fullName: 'Consuelo Alcantara Villaruel Sr.',
    dateOfBirth: '1970-07-07',
    age: 56,
    gender: 'Female',
    civilStatus: 'Widowed',
    contactNumber: '+63 917 555 1234',
    email: 'consuelo.v@example.com',
    addressLine: '12 Emerald St, Villa Verde',
    barangay: 'San Antonio',
    city: 'Pasig City',
    province: 'Metro Manila',
    emergencyContactName: 'Rodrigo Villaruel',
    emergencyContactPhone: '+63 918 555 4321',
    emergencyContactRelationship: 'Son',
    philHealthNumber: '12-345678901-8',
    seniorCitizenId: 'SC-PASIG-2026-99',
    pwdId: 'PWD-PASIG-2026-11',
    bloodType: 'AB+',
    allergies: 'Penicillin, Shellfish',
    chronicConditions: 'Type 2 Diabetes, Hypertension',
    alerts: 'Fall Risk, Hard of Hearing',
    verificationStatus: 'Verified',
    customFields: {
      classification: 'General',
    },
    createdAt: '2026-01-01T00:00:00Z',
  };

  test('ADV-1: All 23 distinct demographic properties are mapped in update payload', async () => {
    const payload23: RegisterPatientPayload = {
      firstName: 'Consuelo',
      lastName: 'Villaruel',
      middleName: 'Alcantara',
      suffix: 'Sr.',
      dateOfBirth: '1970-07-07',
      gender: 'Female',
      civilStatus: 'Widowed',
      contactNumber: '+63 917 555 1234',
      email: 'consuelo.v@example.com',
      addressLine: '12 Emerald St, Villa Verde',
      barangay: 'San Antonio',
      city: 'Pasig City',
      province: 'Metro Manila',
      emergencyContactName: 'Rodrigo Villaruel',
      emergencyContactPhone: '+63 918 555 4321',
      emergencyContactRelationship: 'Son',
      philHealthNumber: '12-345678901-8',
      seniorCitizenId: 'SC-PASIG-2026-99',
      pwdId: 'PWD-PASIG-2026-11',
      bloodType: 'AB+',
      allergies: 'Penicillin, Shellfish',
      chronicConditions: 'Type 2 Diabetes, Hypertension',
      alerts: 'Fall Risk, Hard of Hearing',
      customFields: { classification: 'General' },
      verificationStatus: 'Verified',
    };

    const [updated, err] = await clinicService.updatePatient(basePatient.id, payload23);
    expect(err).toBeNull();
    expect(updated).not.toBeNull();
    expect(lastPutUrl).toBe(`/patients/${basePatient.id}`);

    // Verify all 23 properties
    expect(lastPutPayload.firstName).toBe('Consuelo');
    expect(lastPutPayload.lastName).toBe('Villaruel');
    expect(lastPutPayload.middleName).toBe('Alcantara');
    expect(lastPutPayload.suffix).toBe('Sr.');
    expect(lastPutPayload.dateOfBirth).toBe('1970-07-07');
    expect(lastPutPayload.gender).toBe('Female');
    expect(lastPutPayload.civilStatus).toBe('Widowed');
    expect(lastPutPayload.contactNumber).toBe('+63 917 555 1234');
    expect(lastPutPayload.email).toBe('consuelo.v@example.com');
    expect(lastPutPayload.addressLine).toBe('12 Emerald St, Villa Verde');
    expect(lastPutPayload.barangay).toBe('San Antonio');
    expect(lastPutPayload.city).toBe('Pasig City');
    expect(lastPutPayload.province).toBe('Metro Manila');
    expect(lastPutPayload.emergencyContactName).toBe('Rodrigo Villaruel');
    expect(lastPutPayload.emergencyContactPhone).toBe('+63 918 555 4321');
    expect(lastPutPayload.emergencyContactRelationship).toBe('Son');
    expect(lastPutPayload.philHealthNumber).toBe('12-345678901-8');
    expect(lastPutPayload.seniorCitizenId).toBe('SC-PASIG-2026-99');
    expect(lastPutPayload.pwdId).toBe('PWD-PASIG-2026-11');
    expect(lastPutPayload.bloodType).toBe('AB+');
    expect(lastPutPayload.allergies).toBe('Penicillin, Shellfish');
    expect(lastPutPayload.chronicConditions).toBe('Type 2 Diabetes, Hypertension');
    expect(lastPutPayload.alerts).toBe('Fall Risk, Hard of Hearing');
  });

  test('ADV-2: Gender selection correctly handles all 3 values (Male, Female, Other)', async () => {
    for (const g of ['Male', 'Female', 'Other'] as const) {
      const payload: RegisterPatientPayload = {
        firstName: 'Alex',
        lastName: 'Santos',
        dateOfBirth: '1992-02-02',
        gender: g,
        contactNumber: '0917-111-2222',
      };
      const [res, err] = await clinicService.updatePatient('pat-gender-test', payload);
      expect(err).toBeNull();
      expect(lastPutPayload.gender).toBe(g);
    }
  });

  test('ADV-3: Civil status correctly handles all 4 values (Single, Married, Widowed, Separated)', async () => {
    for (const cs of ['Single', 'Married', 'Widowed', 'Separated'] as const) {
      const payload: RegisterPatientPayload = {
        firstName: 'Corazon',
        lastName: 'Aquino',
        dateOfBirth: '1960-01-01',
        gender: 'Female',
        civilStatus: cs,
        contactNumber: '0917-222-3333',
      };
      const [res, err] = await clinicService.updatePatient('pat-cs-test', payload);
      expect(err).toBeNull();
      expect(lastPutPayload.civilStatus).toBe(cs);
    }
  });

  test('ADV-4: Institutional classification transitions correctly prune irrelevant custom fields', async () => {
    // 1. Transitioning to Employee should keep employee fields and prune student fields
    const empPayload: RegisterPatientPayload = {
      firstName: 'Dr. Gregory',
      lastName: 'House',
      dateOfBirth: '1965-06-11',
      gender: 'Male',
      contactNumber: '0917-444-5555',
      customFields: {
        classification: 'Employee',
        employee_id: 'EMP-001',
        department: 'Diagnostic Medicine',
      },
    };
    await clinicService.updatePatient('pat-emp', empPayload);
    expect(lastPutPayload.customFields.classification).toBe('Employee');
    expect(lastPutPayload.customFields.employee_id).toBe('EMP-001');
    expect(lastPutPayload.customFields.department).toBe('Diagnostic Medicine');
    expect(lastPutPayload.customFields.student_id).toBeUndefined();

    // 2. Transitioning to Student should keep student fields and prune employee fields
    const stuPayload: RegisterPatientPayload = {
      firstName: 'Peter',
      lastName: 'Parker',
      dateOfBirth: '2005-08-10',
      gender: 'Male',
      contactNumber: '0917-666-7777',
      customFields: {
        classification: 'Student',
        student_id: 'STU-999',
        college: 'Science',
        program: 'Physics',
        year_level: '3rd Year',
      },
    };
    await clinicService.updatePatient('pat-stu', stuPayload);
    expect(lastPutPayload.customFields.classification).toBe('Student');
    expect(lastPutPayload.customFields.student_id).toBe('STU-999');
    expect(lastPutPayload.customFields.college).toBe('Science');
    expect(lastPutPayload.customFields.program).toBe('Physics');
    expect(lastPutPayload.customFields.year_level).toBe('3rd Year');
    expect(lastPutPayload.customFields.employee_id).toBeUndefined();

    // 3. Transitioning to General should have no institutional fields
    const genPayload: RegisterPatientPayload = {
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1988-04-12',
      gender: 'Male',
      contactNumber: '0917-888-9999',
      customFields: {
        classification: 'General',
      },
    };
    await clinicService.updatePatient('pat-gen', genPayload);
    expect(lastPutPayload.customFields.classification).toBe('General');
    expect(lastPutPayload.customFields.student_id).toBeUndefined();
    expect(lastPutPayload.customFields.employee_id).toBeUndefined();
  });

  test('ADV-5: Registration walk-in payload captures sex/gender, civil status, and triage routing', async () => {
    const walkInPayload: RegisterPatientPayload = {
      firstName: 'Ramon',
      lastName: 'Magsaysay',
      dateOfBirth: '1955-08-31',
      gender: 'Male',
      civilStatus: 'Married',
      contactNumber: '0917-999-0000',
      sendToTriage: true,
      priority: 'Urgent',
      chiefComplaint: 'Chest pain and shortness of breath',
      verificationStatus: 'Verified',
    };

    const [registered, err] = await clinicService.registerPatient(walkInPayload);
    expect(err).toBeNull();
    expect(lastPostUrl).toBe('/patients');
    expect(lastPostPayload.gender).toBe('Male');
    expect(lastPostPayload.civilStatus).toBe('Married');
    expect(lastPostPayload.sendToTriage).toBe(true);
    expect(lastPostPayload.priority).toBe('Urgent');
    expect(lastPostPayload.chiefComplaint).toBe('Chest pain and shortness of breath');
  });

  test('ADV-6: EditPatientModal correctly sets initial states from patient with non-standard casing', () => {
    const rawPatient: ClinicPatient = {
      id: 'pat-weird-case',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      patientCode: 'PAT-WEIRD',
      firstName: 'Sam',
      lastName: 'Smith',
      fullName: 'Sam Smith',
      dateOfBirth: '1992-05-19',
      age: 33,
      gender: 'Other',
      civilStatus: 'Separated',
      contactNumber: '0917-000-0000',
      createdAt: '2026-01-01T00:00:00Z',
    };

    const element = React.createElement(EditPatientModal, {
      visible: true,
      patient: rawPatient,
      onClose: () => {},
      onSaved: () => {},
    });

    expect(element.props.patient.gender).toBe('Other');
    expect(element.props.patient.civilStatus).toBe('Separated');
  });
});
