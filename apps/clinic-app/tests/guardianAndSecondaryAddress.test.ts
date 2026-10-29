// token-guard:ignore-file
import { describe, test, expect, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    placeholder,
    onPress,
    testID,
  }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(testID ? { 'data-testid': testID } : {}),
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
      setValue(val: any) {
        this.val = val;
      }
      interpolate() {
        return this;
      }
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
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Polyline: 'Polyline',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async () => [null, null],
    post: async (url: string, payload?: any) => [payload, null],
    put: async (url: string, payload?: any) => [payload, null],
    delete: async () => [null, null],
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const {
  GuardianSection,
  createEmptyGuardianDraft,
  isMinorFromDob,
  normalizeGuardianPayload,
  validateGuardianDraft,
} = await import('../components/patient/GuardianSection');
const {
  EditPatientModal,
  BASELINE_PATIENT_CUSTOM_FIELDS,
  LEGACY_PRIMARY_ADDRESS_FIELD_KEYS,
} = await import('../components/patient/EditPatientModal');
const {
  canUseGuardianAsSponsor,
  mapGuardianRelationshipToDependent,
  buildPrincipalSponsorFromGuardian,
} = await import('../components/patient/memberType');
const {
  default: PsgcAddressSelector,
  hasAnyAddressInput,
  createEmptyAddressDraft,
} = await import('../components/ui/PsgcAddressSelector');
const { computePatientLocation } = await import('../utils/patientLocation');
const { isSeniorFromDob } = await import('../utils/age');

describe('Legal Guardian Section & Secondary Address Cutover', () => {
  test('isMinorFromDob identifies minors (<18) and adults (>=18) accurately', () => {
    expect(isMinorFromDob('2018-06-15')).toBe(true);
    expect(isMinorFromDob('1990-05-10')).toBe(false);
    expect(isMinorFromDob('')).toBe(false);
    expect(isMinorFromDob(null)).toBe(false);
    expect(isMinorFromDob('2099-01-01')).toBe(false);
  });

  test('GuardianSection renders collapsed Optional state for adults and auto-expands for minors', () => {
    const adultMarkup = renderToStaticMarkup(
      React.createElement(GuardianSection, {
        guardian: null,
        onChange: () => {},
        patientDateOfBirth: '1990-05-10',
      })
    );
    expect(adultMarkup).toContain('Legal Guardian');
    expect(adultMarkup).toContain('Optional');
    expect(adultMarkup).toContain('+ Add Guardian');
    expect(adultMarkup).not.toContain('Guardian First Name');

    const minorMarkup = renderToStaticMarkup(
      React.createElement(GuardianSection, {
        guardian: null,
        onChange: () => {},
        patientDateOfBirth: '2018-06-15',
      })
    );
    expect(minorMarkup).toContain('Legal Guardian');
    expect(minorMarkup).toContain('Required for Minors');
    expect(minorMarkup).toContain('Guardian First Name');
    expect(minorMarkup).toContain('Guardian Last Name');
    expect(minorMarkup).toContain('Relationship to Patient');
    expect(minorMarkup).toContain('Guardian Contact Phone');
    expect(minorMarkup).toContain('Guardian PhilHealth PIN');
    expect(minorMarkup).toContain('Also set as Primary Emergency Contact');
  });

  test('GuardianSection conditionally renders Specify Caregiver Relationship when NON_RELATIVE_CAREGIVER is selected', () => {
    const motherDraft = {
      ...createEmptyGuardianDraft(),
      firstName: 'Maria',
      lastName: 'Santos',
      relationshipCode: 'MOTHER',
      contactNumber: '09171234567',
    };
    const motherMarkup = renderToStaticMarkup(
      React.createElement(GuardianSection, {
        guardian: motherDraft,
        onChange: () => {},
        patientDateOfBirth: '2018-06-15',
      })
    );
    expect(motherMarkup).not.toContain('Specify Caregiver Relationship');

    const caregiverDraft = {
      ...motherDraft,
      relationshipCode: 'NON_RELATIVE_CAREGIVER',
      relationshipOtherSpecify: 'Foster Aunt',
    };
    const caregiverMarkup = renderToStaticMarkup(
      React.createElement(GuardianSection, {
        guardian: caregiverDraft,
        onChange: () => {},
        patientDateOfBirth: '2018-06-15',
      })
    );
    expect(caregiverMarkup).toContain('Specify Caregiver Relationship');
  });

  test('validateGuardianDraft enforces minor requirements, caregiver specify text, and PIN validity', () => {
    expect(validateGuardianDraft(createEmptyGuardianDraft(), false, null).isValid).toBe(true);
    expect(validateGuardianDraft(null, false, null).isValid).toBe(true);

    const minorEmpty = validateGuardianDraft(null, true, null);
    expect(minorEmpty.isValid).toBe(false);
    expect(minorEmpty.errors.firstName).toBeDefined();
    expect(minorEmpty.errors.lastName).toBeDefined();
    expect(minorEmpty.errors.relationshipCode).toBeDefined();
    expect(minorEmpty.errors.contactNumber).toBeDefined();

    const caregiverMissingSpec = validateGuardianDraft(
      {
        ...createEmptyGuardianDraft(),
        firstName: 'Elena',
        lastName: 'Reyes',
        relationshipCode: 'NON_RELATIVE_CAREGIVER',
        contactNumber: '09189998877',
      },
      true,
      null
    );
    expect(caregiverMissingSpec.isValid).toBe(false);
    expect(caregiverMissingSpec.errors.relationshipOtherSpecify).toBeDefined();

    const caregiverValid = validateGuardianDraft(
      {
        ...createEmptyGuardianDraft(),
        firstName: 'Elena',
        lastName: 'Reyes',
        relationshipCode: 'NON_RELATIVE_CAREGIVER',
        relationshipOtherSpecify: 'Foster Aunt',
        contactNumber: '09189998877',
      },
      true,
      null
    );
    expect(caregiverValid.isValid).toBe(true);

    const invalidPin = validateGuardianDraft(
      {
        ...createEmptyGuardianDraft(),
        firstName: 'Elena',
        lastName: 'Reyes',
        relationshipCode: 'MOTHER',
        contactNumber: '09189998877',
        philHealthPin: '12-345678901-9',
      },
      true,
      false
    );
    expect(invalidPin.isValid).toBe(false);
    expect(invalidPin.errors.philHealthPin).toBeDefined();
  });

  test('normalizeGuardianPayload strips PIN formatting and clears unused specify text', () => {
    expect(normalizeGuardianPayload(null)).toBeNull();
    expect(normalizeGuardianPayload(createEmptyGuardianDraft())).toBeNull();

    const normalized = normalizeGuardianPayload({
      id: 'g-1',
      firstName: '  Maria  ',
      lastName: '  Dela Cruz ',
      middleName: '  ',
      suffix: '',
      birthDate: '1988-02-10',
      sex: 'Female',
      contactNumber: ' 0917-123-4567 ',
      relationshipCode: 'MOTHER',
      relationshipOtherSpecify: 'Stale Specify Text',
      philHealthPin: '12-345678901-8',
      isPrimaryGuardian: true,
      isEmergencyContact: true,
    });

    expect(normalized).toEqual({
      id: 'g-1',
      firstName: 'Maria',
      lastName: 'Dela Cruz',
      middleName: null,
      suffix: null,
      birthDate: '1988-02-10',
      sex: 'Female',
      contactNumber: '0917-123-4567',
      relationshipCode: 'MOTHER',
      relationshipOtherSpecify: null,
      philHealthPin: '123456789018',
      isPrimaryGuardian: true,
      isEmergencyContact: true,
    });
  });

  test('Secondary address baseline definitions and computePatientLocation official addresses priority', () => {
    const baselineAddressKeys = BASELINE_PATIENT_CUSTOM_FIELDS.filter(
      (f) => f.category === 'Address'
    ).map((f) => f.fieldKey);
    expect(baselineAddressKeys).toEqual([
      'secondary_address_line',
      'secondary_barangay',
      'secondary_city',
      'secondary_province',
    ]);
    expect(LEGACY_PRIMARY_ADDRESS_FIELD_KEYS.has('primary_address_line')).toBe(true);
    expect(LEGACY_PRIMARY_ADDRESS_FIELD_KEYS.has('secondary_address_line')).toBe(false);

    expect(
      computePatientLocation({
        addresses: [
          {
            addressType: 'Permanent',
            barangayName: 'Barangay 1',
            cityMunicipalityName: 'Cagayan de Oro City',
            provinceName: 'Misamis Oriental',
            streetAddress: '123 Corrales Ave',
          },
        ],
        customFields: {
          secondary_barangay: 'Loyola Heights',
          secondary_city: 'Quezon City',
          secondary_province: 'Metro Manila',
        },
      })
    ).toBe('Barangay 1, Cagayan de Oro City, Misamis Oriental');

    expect(
      computePatientLocation({
        addresses: [],
        customFields: {
          secondary_barangay: 'Loyola Heights',
          secondary_city: 'Quezon City',
          secondary_province: 'Metro Manila',
        },
      })
    ).toBe('Loyola Heights, Quezon City, Metro Manila');
  });

  test('mapGuardianRelationshipToDependent and buildPrincipalSponsorFromGuardian invert guardian relationship and mask PIN', () => {
    expect(canUseGuardianAsSponsor(null)).toBe(false);
    expect(canUseGuardianAsSponsor(createEmptyGuardianDraft())).toBe(false);

    expect(
      mapGuardianRelationshipToDependent('MOTHER', { patientDob: '2018-06-15' })
    ).toBe('C');
    expect(
      mapGuardianRelationshipToDependent('FATHER', { patientDob: '2016-01-10' })
    ).toBe('C');
    expect(
      mapGuardianRelationshipToDependent('LEGAL_GUARDIAN', { patientDob: '2015-03-01' })
    ).toBe('C');
    expect(
      mapGuardianRelationshipToDependent('SPOUSE', { patientDob: '1992-07-20' })
    ).toBe('S');
    expect(
      mapGuardianRelationshipToDependent('MOTHER', {
        patientDob: '1999-04-12',
        pwdId: 'PWD-MNL-2024-001',
      })
    ).toBe('D');
    expect(
      mapGuardianRelationshipToDependent('NON_RELATIVE_CAREGIVER', {
        patientDob: '1958-11-05',
      })
    ).toBe('P');

    const sponsor = buildPrincipalSponsorFromGuardian(
      {
        firstName: 'Maria',
        middleName: 'Reyes',
        lastName: 'Santos',
        suffix: '',
        birthDate: '1988-02-10',
        sex: 'Female',
        contactNumber: '09171234567',
        relationshipCode: 'MOTHER',
        philHealthPin: '123456789018',
        isPrimaryGuardian: true,
        isEmergencyContact: true,
      },
      { patientDob: '2018-06-15' }
    );

    expect(sponsor).toEqual({
      fullName: 'Maria Reyes Santos',
      shortName: 'Maria Santos',
      firstName: 'Maria',
      middleName: 'Reyes',
      lastName: 'Santos',
      suffix: '',
      relationship: 'C',
      rawPin: '123456789018',
      formattedPin: '12-345678901-8',
      birthDate: '1988-02-10',
      buttonLabel: 'Use Guardian (Maria Santos)',
    });
  });

  test('EditPatientModal renders quick-fill sponsor button when PhilHealth Member Type is Dependent (DD)', () => {
    const dependentWithGuardianMarkup = renderToStaticMarkup(
      React.createElement(EditPatientModal, {
        visible: true,
        onClose: () => {},
        onSaved: () => {},
        patient: {
          id: 'pat-minor-1',
          tenantId: 'tenant-1',
          clinicId: 'clinic-1',
          patientCode: 'PAT-001',
          firstName: 'Lucas',
          lastName: 'Santos',
          fullName: 'Lucas Santos',
          dateOfBirth: '2018-06-15',
          age: 8,
          sex: 'Male',
          civilStatus: 'Single',
          contactNumber: '09171234567',
          createdAt: '2026-10-29T00:00:00Z',
          customFields: {
            member_type: 'DD',
          },
          guardians: [
            {
              id: 'guard-1',
              firstName: 'Maria',
              lastName: 'Santos',
              middleName: 'Reyes',
              birthDate: '1988-02-10',
              sex: 'Female',
              contactNumber: '09171234567',
              relationshipCode: 'MOTHER',
              philHealthPin: '123456789018',
              isPrimaryGuardian: true,
              isEmergencyContact: true,
            },
          ],
        } as any,
      })
    );

    expect(dependentWithGuardianMarkup).toContain('Principal Member Details');
    expect(dependentWithGuardianMarkup).toContain('Use Guardian (Maria Santos)');

    const dependentWithoutGuardianMarkup = renderToStaticMarkup(
      React.createElement(EditPatientModal, {
        visible: true,
        onClose: () => {},
        onSaved: () => {},
        patient: {
          id: 'pat-dep-2',
          tenantId: 'tenant-1',
          clinicId: 'clinic-1',
          patientCode: 'PAT-002',
          firstName: 'Andrea',
          lastName: 'Reyes',
          fullName: 'Andrea Reyes',
          dateOfBirth: '2002-04-10',
          age: 24,
          sex: 'Female',
          civilStatus: 'Single',
          contactNumber: '09181112222',
          createdAt: '2026-10-29T00:00:00Z',
          customFields: {
            member_type: 'DD',
          },
          guardians: [],
        } as any,
      })
    );

    expect(dependentWithoutGuardianMarkup).toContain('Principal Member Details');
    expect(dependentWithoutGuardianMarkup).toContain('Use Legal Guardian');
  });

  test('isSeniorFromDob identifies seniors (>=60) and omits for 30-year-olds and minors', () => {
    // 30 years old
    expect(isSeniorFromDob('1996-05-10')).toBe(false);
    // Minors & young adults
    expect(isSeniorFromDob('2018-06-15')).toBe(false);
    expect(isSeniorFromDob('2000-01-01')).toBe(false);
    // Senior citizens (>=60)
    expect(isSeniorFromDob('1960-01-01')).toBe(true);
    expect(isSeniorFromDob('1950-12-31')).toBe(true);
    // Boundary & invalid cases
    expect(isSeniorFromDob('')).toBe(false);
    expect(isSeniorFromDob(null)).toBe(false);
    expect(isSeniorFromDob('not-a-date')).toBe(false);
  });

  test('PsgcAddressSelector renders collapsed card with + Add Address and expands on demand', () => {
    expect(hasAnyAddressInput(null)).toBe(false);
    expect(hasAnyAddressInput(createEmptyAddressDraft())).toBe(false);
    expect(hasAnyAddressInput({ addressType: 'Permanent', isSameAsPermanent: false, streetAddress: '123 Rizal Ave' })).toBe(true);
    expect(hasAnyAddressInput({ addressType: 'Permanent', isSameAsPermanent: false, streetAddress: '', regionPsgc: '1300000000' })).toBe(true);

    const emptyAddress = createEmptyAddressDraft();
    const collapsedMarkup = renderToStaticMarkup(
      React.createElement(PsgcAddressSelector, {
        value: emptyAddress,
        onChange: () => {},
        label: 'Home Address',
      })
    );

    expect(collapsedMarkup).toContain('Home Address');
    expect(collapsedMarkup).toContain('Optional');
    expect(collapsedMarkup).toContain('+ Add Address');
    expect(collapsedMarkup).not.toContain('Select Region');

    const populatedAddress = {
      ...emptyAddress,
      streetAddress: '123 Rizal Ave',
      regionPsgc: '1300000000',
    };
    const expandedMarkup = renderToStaticMarkup(
      React.createElement(PsgcAddressSelector, {
        value: populatedAddress,
        onChange: () => {},
        label: 'Home Address',
      })
    );

    expect(expandedMarkup).toContain('Home Address');
    expect(expandedMarkup).toContain('Recorded');
    expect(expandedMarkup).toContain('Remove');
    expect(expandedMarkup).toContain('Region');
    expect(expandedMarkup).toContain('Street Address / Building / Unit No.');
  });

  test('EditPatientModal conditionally renders Senior Citizen ID only for seniors (>=60)', () => {
    // 30-year-old patient: Senior Citizen ID must NOT be rendered, PWD ID must be rendered
    const adult30Markup = renderToStaticMarkup(
      React.createElement(EditPatientModal, {
        visible: true,
        onClose: () => {},
        onSaved: () => {},
        patient: {
          id: 'pat-30-yo',
          tenantId: 'tenant-1',
          clinicId: 'clinic-1',
          patientCode: 'PAT-030',
          firstName: 'Juan',
          lastName: 'Dela Cruz',
          fullName: 'Juan Dela Cruz',
          dateOfBirth: '1996-05-10',
          age: 30,
          sex: 'Male',
          civilStatus: 'Single',
          contactNumber: '09171234567',
          createdAt: '2026-10-29T00:00:00Z',
          customFields: {},
          guardians: [],
        } as any,
      })
    );

    expect(adult30Markup).not.toContain('Senior Citizen ID');
    expect(adult30Markup).toContain('PWD ID');

    // 68-year-old senior: Senior Citizen ID MUST be rendered alongside PWD ID
    const senior68Markup = renderToStaticMarkup(
      React.createElement(EditPatientModal, {
        visible: true,
        onClose: () => {},
        onSaved: () => {},
        patient: {
          id: 'pat-senior-68',
          tenantId: 'tenant-1',
          clinicId: 'clinic-1',
          patientCode: 'PAT-068',
          firstName: 'Ricardo',
          lastName: 'Dela Cruz',
          fullName: 'Ricardo Dela Cruz',
          dateOfBirth: '1958-03-15',
          age: 68,
          sex: 'Male',
          civilStatus: 'Married',
          contactNumber: '09187654321',
          createdAt: '2026-10-29T00:00:00Z',
          customFields: {},
          guardians: [],
        } as any,
      })
    );

    expect(senior68Markup).toContain('Senior Citizen ID');
    expect(senior68Markup).toContain('PWD ID');
  });
});
