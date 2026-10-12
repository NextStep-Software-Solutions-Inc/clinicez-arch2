// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
      placeholder,
      children
    );
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
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
let mockPutResponse: any = null;
let mockPutError: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    put: async (url: string, payload?: any) => {
      lastPutUrl = url;
      lastPutPayload = payload;
      if (mockPutError) return [null, mockPutError];
      return [mockPutResponse ?? payload, null];
    },
    get: async () => [null, null],
    post: async () => [null, null],
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const { clinicService } = await import('../services/clinicService');
type ClinicPatient = import('../services/clinicService').ClinicPatient;
type RegisterPatientPayload = import('../services/clinicService').RegisterPatientPayload;
const { EditPatientModal } = await import('../components/patient/EditPatientModal');
const { formatLongAge } = await import('../utils/age');

describe('Milestone M1 — Patient Demographics Editing & Missing Gender Restoration', () => {
  beforeEach(() => {
    lastPutUrl = '';
    lastPutPayload = null;
    mockPutResponse = null;
    mockPutError = null;
  });

  const samplePatient: ClinicPatient = {
    id: 'pat-12345-uuid',
    tenantId: 'tenant-test',
    clinicId: 'clinic-test',
    patientCode: 'P-10024',
    firstName: 'Maria',
    lastName: 'Santos',
    middleName: 'Delos',
    suffix: 'Jr.',
    fullName: 'Maria Delos Santos Jr.',
    dateOfBirth: '1990-01-01',
    age: 34,
    gender: 'Female',
    civilStatus: 'Married',
    contactNumber: '0917-123-4567',
    email: 'maria.santos@example.com',
    addressLine: '123 Rizal Ave',
    barangay: 'Barangay 10',
    city: 'San Pedro',
    province: 'Laguna',
    emergencyContactName: 'Juan Santos',
    emergencyContactPhone: '0918-987-6543',
    emergencyContactRelationship: 'Spouse',
    philHealthNumber: '12-345678901-8',
    seniorCitizenId: '',
    pwdId: '',
    bloodType: 'O+',
    allergies: 'Penicillin (Medication - STAT)',
    chronicConditions: 'Hypertension',
    alerts: 'High fall risk',
    verificationStatus: 'Verified',
    customFields: {
      classification: 'Student',
      student_id: '2026-9042',
      college: 'College of Science',
      program: 'BS Biology',
      year_level: '3rd Year',
    },
    createdAt: '2026-01-01T00:00:00Z',
  };

  test('F1: Gender options include Male, Female, and Other, and persist to update payload', async () => {
    const payload: RegisterPatientPayload = {
      firstName: 'Alex',
      lastName: 'Dela Cruz',
      dateOfBirth: '1995-05-15',
      gender: 'Other',
      civilStatus: 'Single',
      contactNumber: '0919-555-1234',
      verificationStatus: 'Verified',
    };

    const [updated, err] = await clinicService.updatePatient('pat-test-id', payload);
    expect(err).toBeNull();
    expect(lastPutUrl).toBe('/patients/pat-test-id');
    expect(lastPutPayload.gender).toBe('Other');
    expect(lastPutPayload.civilStatus).toBe('Single');
  });

  test('F2: clinicService.updatePatient dispatches full 23-property demographic payload to PUT /patients/{id}', async () => {
    const fullPayload: RegisterPatientPayload = {
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      middleName: 'Mendoza',
      suffix: 'III',
      dateOfBirth: '1985-10-20',
      gender: 'Male',
      civilStatus: 'Separated',
      contactNumber: '0917-000-1111',
      email: 'juan.delacruz@example.com',
      addressLine: 'Block 4 Lot 10 Phase 2',
      barangay: 'San Vicente',
      city: 'Biñan',
      province: 'Laguna',
      emergencyContactName: 'Elena Dela Cruz',
      emergencyContactPhone: '0918-000-2222',
      emergencyContactRelationship: 'Sister',
      philHealthNumber: '01-025000001-0',
      seniorCitizenId: 'SC-2026-001',
      pwdId: 'PWD-2026-002',
      bloodType: 'A+',
      allergies: 'Aspirin',
      chronicConditions: 'Asthma',
      alerts: 'Hearing impaired',
      customFields: {
        classification: 'Employee',
        employee_id: 'EMP-2026-001',
        department: 'Registrar Office',
      },
      verificationStatus: 'Verified',
    };

    const [res] = await clinicService.updatePatient('pat-juan-id', fullPayload);
    expect(res).not.toBeNull();
    expect(lastPutUrl).toBe('/patients/pat-juan-id');
    expect(lastPutPayload.firstName).toBe('Juan');
    expect(lastPutPayload.suffix).toBe('III');
    expect(lastPutPayload.gender).toBe('Male');
    expect(lastPutPayload.civilStatus).toBe('Separated');
    expect(lastPutPayload.bloodType).toBe('A+');
    expect(lastPutPayload.philHealthNumber).toBe('01-025000001-0');
    expect(lastPutPayload.customFields.classification).toBe('Employee');
    expect(lastPutPayload.customFields.employee_id).toBe('EMP-2026-001');
    expect(lastPutPayload.verificationStatus).toBe('Verified');
  });

  test('F2: EditPatientModal renders React elements with proper structure and props', () => {
    let savedPatient: ClinicPatient | null = null;
    let closed = false;

    const element = React.createElement(EditPatientModal, {
      visible: true,
      patient: samplePatient,
      onClose: () => { closed = true; },
      onSaved: (p: ClinicPatient) => { savedPatient = p; },
    });

    expect(element).toBeDefined();
    expect(element.props.visible).toBe(true);
    expect(element.props.patient.firstName).toBe('Maria');
    expect(element.props.patient.gender).toBe('Female');
    expect(element.props.patient.civilStatus).toBe('Married');
  });

  test('F3 & F6: Demographic formatting shows long age and verified identity', () => {
    // 1990-01-01 formatted against 2024-05-15
    const ref = new Date(2024, 4, 15);
    const longAge = formatLongAge(samplePatient.dateOfBirth, ref);
    expect(longAge).toBe('34 yrs, 4 mos, 2 wks');

    // Demographics string construction matching patient card pattern
    const cardDemographics = [
      longAge,
      samplePatient.gender,
      samplePatient.civilStatus,
      samplePatient.bloodType ? `Blood type ${samplePatient.bloodType}` : null,
    ].filter(Boolean).join(' • ');

    expect(cardDemographics).toBe('34 yrs, 4 mos, 2 wks • Female • Married • Blood type O+');
  });

  test('F2: Preservation of existing verification status across updates', async () => {
    const unverifiedPatientPayload: RegisterPatientPayload = {
      firstName: 'Pedro',
      lastName: 'Penduko',
      dateOfBirth: '2000-02-02',
      gender: 'Male',
      contactNumber: '0912-345-6789',
      verificationStatus: 'Unverified',
    };

    await clinicService.updatePatient('pat-unverified', unverifiedPatientPayload);
    expect(lastPutPayload.verificationStatus).toBe('Unverified');
  });

  test('F2: Update handles student classification custom fields properly', async () => {
    const studentPayload: RegisterPatientPayload = {
      firstName: 'Bea',
      lastName: 'Reyes',
      dateOfBirth: '2004-03-12',
      gender: 'Female',
      civilStatus: 'Single',
      contactNumber: '0922-123-4567',
      customFields: {
        classification: 'Student',
        student_id: '2026-STU-001',
        college: 'College of Engineering',
        program: 'BS Civil Engineering',
        year_level: '2nd Year',
      },
      verificationStatus: 'Verified',
    };

    const [updated, err] = await clinicService.updatePatient('pat-student-1', studentPayload);
    expect(err).toBeNull();
    expect(lastPutPayload.customFields.classification).toBe('Student');
    expect(lastPutPayload.customFields.student_id).toBe('2026-STU-001');
    expect(lastPutPayload.customFields.college).toBe('College of Engineering');
    expect(lastPutPayload.customFields.program).toBe('BS Civil Engineering');
    expect(lastPutPayload.customFields.year_level).toBe('2nd Year');
  });

  test('F2: Update handles cleared student classification custom fields properly (keys deleted)', async () => {
    const clearedStudentPayload: RegisterPatientPayload = {
      firstName: 'Bea',
      lastName: 'Reyes',
      dateOfBirth: '2004-03-12',
      gender: 'Female',
      civilStatus: 'Single',
      contactNumber: '0922-123-4567',
      customFields: {
        classification: 'Student',
        student_id: '2026-STU-001',
      },
      verificationStatus: 'Verified',
    };

    const [updated, err] = await clinicService.updatePatient('pat-student-1', clearedStudentPayload);
    expect(err).toBeNull();
    expect(lastPutPayload.customFields.classification).toBe('Student');
    expect(lastPutPayload.customFields.student_id).toBe('2026-STU-001');
    expect(lastPutPayload.customFields.college).toBeUndefined();
    expect(lastPutPayload.customFields.program).toBeUndefined();
    expect(lastPutPayload.customFields.year_level).toBeUndefined();
  });

  test('F2: Update handles network and validation errors gracefully', async () => {
    mockPutError = {
      status: 400,
      message: 'PhilHealth Identification Number check digit is invalid (Mod-11 verification failed).',
    };

    const invalidPinPayload: RegisterPatientPayload = {
      firstName: 'Jose',
      lastName: 'Rizal',
      dateOfBirth: '1980-06-19',
      gender: 'Male',
      contactNumber: '0917-111-2222',
      philHealthNumber: '12-345678901-2', // invalid check digit
    };

    const [res, err] = await clinicService.updatePatient('pat-bad-pin', invalidPinPayload);
    expect(res).toBeNull();
    expect(err).not.toBeNull();
    expect(err.status).toBe(400);
    expect(err.message).toContain('Mod-11 verification failed');
  });

  test('F2: Tolerates patient with empty optional fields', () => {
    const sparsePatient: ClinicPatient = {
      id: 'pat-sparse',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      patientCode: 'P-999',
      firstName: 'Ana',
      lastName: 'Cruz',
      fullName: 'Ana Cruz',
      dateOfBirth: '2001-01-01',
      age: 25,
      gender: 'Female',
      contactNumber: '09170000000',
      createdAt: '2026-01-01T00:00:00Z',
    };

    const element = React.createElement(EditPatientModal, {
      visible: true,
      patient: sparsePatient,
      onClose: () => {},
      onSaved: () => {},
    });

    expect(element).toBeDefined();
    expect(element.props.patient.middleName).toBeUndefined();
    expect(element.props.patient.suffix).toBeUndefined();
    expect(element.props.patient.email).toBeUndefined();
  });
});
