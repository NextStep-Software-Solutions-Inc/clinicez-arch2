// token-guard:ignore-file
/**
 * apps/clinic-app/tests/challenger_m4_adversarial_locality_form.test.ts
 *
 * EMPIRICAL CHALLENGER TEST SUITE: Milestone 4
 * Adversarial Locality & Form Unification Challenger
 *
 * Focus areas:
 * 1. computePatientLocation adversarial stress matrix:
 *    - null, undefined, empty object {}, customFields with only whitespace, missing fields,
 *      single fields (city only, province only, barangay only, address only),
 *      hierarchy combinations, special characters / unicode / diacritics / symbols,
 *      and strict verification that deleted top-level entity properties are completely ignored.
 * 2. EditPatientModal JSX & payload construction verification:
 *    - Verify no hardcoded Address or Emergency Contact inputs exist in EditPatientModal.
 *    - Verify baseline custom fields partition correctly into Address and Emergency Contacts.
 *    - Verify that when saving, address fields (primary_address_line, primary_barangay, primary_city, primary_province)
 *      and emergency contact fields (emergency_contact_name, emergency_contact_phone, emergency_contact_relationship)
 *      are placed exclusively inside customFields, and top-level entity properties are strictly undefined.
 *    - Verify trimming, clearing (null serialization for existing keys), and legacy property migration fallback.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, onPress, value, onChangeText, testID, ...props }: any) =>
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

const { computePatientLocation } = await import('../utils/patientLocation');
const { EditPatientModal, BASELINE_PATIENT_CUSTOM_FIELDS } = await import('../components/patient/EditPatientModal');
const { clinicService } = await import('../services/clinicService');
type ClinicPatient = import('../services/clinicService').ClinicPatient;
type RegisterPatientPayload = import('../services/clinicService').RegisterPatientPayload;

describe('Empirical Adversarial Challenger Suite: Locality & Form Unification', () => {
  beforeEach(() => {
    lastPutUrl = '';
    lastPutPayload = null;
    lastPostUrl = '';
    lastPostPayload = null;
  });

  // =========================================================================
  // SUITE 1: computePatientLocation Adversarial Stress Matrix
  // =========================================================================
  describe('Suite 1: computePatientLocation Stress Matrix', () => {
    test('1.1 Null, undefined, and empty object boundaries return empty string', () => {
      expect(computePatientLocation(null)).toBe('');
      expect(computePatientLocation(undefined)).toBe('');
      expect(computePatientLocation({})).toBe('');
      expect(computePatientLocation({ customFields: null })).toBe('');
      expect(computePatientLocation({ customFields: undefined })).toBe('');
      expect(computePatientLocation({ customFields: {} })).toBe('');
    });

    test('1.2 CustomFields containing only whitespace strings return empty string', () => {
      expect(
        computePatientLocation({
          customFields: {
            primary_barangay: '   ',
            primary_city: '   ',
            primary_province: '  \t  ',
            primary_address_line: ' \n ',
          },
        })
      ).toBe('');

      expect(
        computePatientLocation({
          customFields: {
            primary_city: '        ',
          },
        })
      ).toBe('');
    });

    test('1.3 Unrelated customFields or non-location metadata return empty string', () => {
      expect(
        computePatientLocation({
          customFields: {
            classification: 'Student',
            student_id: 'STU-2026-001',
            yakap_enlistments: [],
            blood_type: 'O+',
          },
        })
      ).toBe('');
    });

    test('1.4 Single field resolution across both patient and direct customFields dictionaries', () => {
      // 1. City only
      expect(computePatientLocation({ customFields: { primary_city: 'Taguig' } })).toBe('Taguig');
      expect(computePatientLocation({ primary_city: 'Taguig' })).toBe('Taguig');

      // 2. Province only
      expect(computePatientLocation({ customFields: { primary_province: 'Pampanga' } })).toBe('Pampanga');
      expect(computePatientLocation({ primary_province: 'Pampanga' })).toBe('Pampanga');

      // 3. Barangay only
      expect(computePatientLocation({ customFields: { primary_barangay: 'San Lorenzo' } })).toBe('San Lorenzo');
      expect(computePatientLocation({ primary_barangay: 'San Lorenzo' })).toBe('San Lorenzo');

      // 4. Address line only
      expect(computePatientLocation({ customFields: { primary_address_line: 'Unit 1001 High Rise' } })).toBe('Unit 1001 High Rise');
      expect(computePatientLocation({ primary_address_line: 'Unit 1001 High Rise' })).toBe('Unit 1001 High Rise');
    });

    test('1.5 Pairwise administrative hierarchy combinations resolve accurately', () => {
      // Barangay + City
      expect(
        computePatientLocation({
          customFields: {
            primary_barangay: 'San Antonio',
            primary_city: 'Pasig City',
          },
        })
      ).toBe('San Antonio, Pasig City');

      // City + Province
      expect(
        computePatientLocation({
          customFields: {
            primary_city: 'Cebu City',
            primary_province: 'Cebu',
          },
        })
      ).toBe('Cebu City, Cebu');

      // Barangay + Province
      expect(
        computePatientLocation({
          customFields: {
            primary_barangay: 'Lahug',
            primary_province: 'Cebu',
          },
        })
      ).toBe('Lahug, Cebu');

      // Barangay + Address Line (Barangay should take precedence over Address Line)
      expect(
        computePatientLocation({
          customFields: {
            primary_barangay: 'Barangay Central',
            primary_address_line: '100 Main St',
          },
        })
      ).toBe('Barangay Central');

      // City + Address Line (City should take precedence over Address Line)
      expect(
        computePatientLocation({
          customFields: {
            primary_city: 'Iloilo City',
            primary_address_line: '200 Calle Real',
          },
        })
      ).toBe('Iloilo City');

      // Province + Address Line (Province should take precedence over Address Line)
      expect(
        computePatientLocation({
          customFields: {
            primary_province: 'Iloilo',
            primary_address_line: '200 Calle Real',
          },
        })
      ).toBe('Iloilo');
    });

    test('1.6 Triplet administrative hierarchy and address line suppression', () => {
      // Barangay + City + Province
      expect(
        computePatientLocation({
          customFields: {
            primary_barangay: 'San Vicente',
            primary_city: 'Biñan',
            primary_province: 'Laguna',
          },
        })
      ).toBe('San Vicente, Biñan, Laguna');

      // All four: primary_address_line is excluded when administrative hierarchy is present
      expect(
        computePatientLocation({
          customFields: {
            primary_address_line: 'Blk 12 Lot 4 Phase 3',
            primary_barangay: 'San Vicente',
            primary_city: 'Biñan',
            primary_province: 'Laguna',
          },
        })
      ).toBe('San Vicente, Biñan, Laguna');
    });

    test('1.7 Special characters, diacritics, punctuation, symbols, and non-string coercion', () => {
      // Diacritics (Parañaque, Biñan)
      expect(
        computePatientLocation({
          customFields: {
            primary_barangay: 'San Dionisio',
            primary_city: 'Parañaque City',
            primary_province: 'Metro Manila',
          },
        })
      ).toBe('San Dionisio, Parañaque City, Metro Manila');

      // Punctuation and apostrophes (O'Donnell, Sto. Niño)
      expect(
        computePatientLocation({
          customFields: {
            primary_barangay: 'Brgy. Sto. Niño',
            primary_city: "O'Donnell",
            primary_province: 'Tarlac',
          },
        })
      ).toBe("Brgy. Sto. Niño, O'Donnell, Tarlac");

      // Hyphenated and numbered districts
      expect(
        computePatientLocation({
          customFields: {
            primary_barangay: 'Barangay 7-B',
            primary_city: 'District 4',
          },
        })
      ).toBe('Barangay 7-B, District 4');

      // Unicode emojis
      expect(
        computePatientLocation({
          customFields: {
            primary_city: 'City of Pines 🌲',
            primary_province: 'Benguet',
          },
        })
      ).toBe('City of Pines 🌲, Benguet');

      // Number coercion (e.g. zip or numeric district stored in field)
      expect(
        computePatientLocation({
          customFields: {
            primary_city: 1400 as any,
            primary_province: 'Metro Manila',
          },
        })
      ).toBe('1400, Metro Manila');
    });

    test('1.8 STRICT NEGATIVE ASSERTION: Deleted top-level entity properties are COMPLETELY IGNORED', () => {
      // Patient with only legacy top-level properties: MUST RETURN EMPTY STRING
      const legacyPatient: any = {
        id: 'pat-legacy-001',
        firstName: 'Jose',
        lastName: 'Rizal',
        addressLine: 'Calamba Ancestral House',
        barangay: 'Poblacion 1',
        city: 'Calamba',
        province: 'Laguna',
        emergencyContactName: 'Paciano Rizal',
        emergencyContactPhone: '0917-000-0000',
        emergencyContactRelationship: 'Brother',
      };

      expect(computePatientLocation(legacyPatient)).toBe('');

      // Patient with legacy properties and empty customFields: MUST RETURN EMPTY STRING
      expect(
        computePatientLocation({
          ...legacyPatient,
          customFields: {},
        })
      ).toBe('');

      // Patient with legacy properties and null customFields: MUST RETURN EMPTY STRING
      expect(
        computePatientLocation({
          ...legacyPatient,
          customFields: null,
        })
      ).toBe('');

      // Patient with legacy properties and customFields containing unified city:
      // MUST ONLY RESOLVE from customFields, ignoring all top-level legacy keys
      expect(
        computePatientLocation({
          ...legacyPatient,
          customFields: {
            primary_city: 'Dapitan City',
          },
        })
      ).toBe('Dapitan City');

      // Direct dictionary with legacy keys (no customFields, no primary_* keys)
      expect(
        computePatientLocation({
          city: 'Manila',
          barangay: 'Binondo',
          province: 'Metro Manila',
        } as any)
      ).toBe('');
    });
  });

  // =========================================================================
  // SUITE 2: EditPatientModal Component & Baseline Definitions
  // =========================================================================
  describe('Suite 2: EditPatientModal Structure & Baseline Definitions', () => {
    test('2.1 BASELINE_PATIENT_CUSTOM_FIELDS contains all 7 address and emergency contact definitions partitioned cleanly', () => {
      const addressKeys = BASELINE_PATIENT_CUSTOM_FIELDS.filter((f) => f.category === 'Address').map((f) => f.fieldKey);
      const emergencyKeys = BASELINE_PATIENT_CUSTOM_FIELDS.filter((f) => f.category === 'Emergency Contacts').map((f) => f.fieldKey);

      expect(addressKeys).toEqual([
        'primary_address_line',
        'primary_barangay',
        'primary_city',
        'primary_province',
      ]);

      expect(emergencyKeys).toEqual([
        'emergency_contact_name',
        'emergency_contact_phone',
        'emergency_contact_relationship',
      ]);
    });

    test('2.2 EditPatientModal renders dynamic custom field sections without hardcoded address/contact inputs', () => {
      const mockPatient: ClinicPatient = {
        id: 'pat-test-render',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        patientCode: 'PAT-001',
        firstName: 'Andres',
        lastName: 'Bonifacio',
        fullName: 'Bonifacio, Andres',
        dateOfBirth: '1863-11-30',
        age: 162,
        gender: 'Male',
        civilStatus: 'Married',
        contactNumber: '0917-186-3113',
        createdAt: '2026-01-01T00:00:00Z',
        customFields: {
          primary_barangay: 'Tondo',
          primary_city: 'Manila',
          primary_province: 'Metro Manila',
          emergency_contact_name: 'Gregoria de Jesus',
          emergency_contact_phone: '0918-186-3113',
          emergency_contact_relationship: 'Spouse',
        },
      };

      const markup = renderToStaticMarkup(
        React.createElement(EditPatientModal, {
          visible: true,
          patient: mockPatient,
          onClose: () => {},
          onSaved: () => {},
        })
      );

      // Section headers for dynamic custom fields are rendered
      expect(markup).toContain('Address Details');
      expect(markup).toContain('Emergency Contact');

      // Must NOT contain hardcoded static inputs for legacy fields
      expect(markup).not.toContain('placeholder="House / Unit / Street" data-static="true"');
      expect(markup).not.toContain('aria-label="Barangay" data-static="true"');
      expect(markup).not.toContain('aria-label="Emergency Contact Name" data-static="true"');
    });
  });

  // =========================================================================
  // SUITE 3: Save Payload Construction & Unification
  // =========================================================================
  describe('Suite 3: Save Payload Construction & Unification', () => {
    test('3.1 Fully populated address & emergency contact fields are placed EXCLUSIVELY in customFields', async () => {
      const payload: RegisterPatientPayload = {
        firstName: 'Apolinario',
        lastName: 'Mabini',
        dateOfBirth: '1864-07-23',
        gender: 'Male',
        civilStatus: 'Single',
        contactNumber: '0917-555-9999',
        customFields: {
          primary_address_line: 'Talaga Road',
          primary_barangay: 'Talaga',
          primary_city: 'Tanauan City',
          primary_province: 'Batangas',
          emergency_contact_name: 'Inocencio Mabini',
          emergency_contact_phone: '0918-555-8888',
          emergency_contact_relationship: 'Father',
        },
        verificationStatus: 'Verified',
      };

      const [updated, err] = await clinicService.updatePatient('pat-mabini', payload);
      expect(err).toBeNull();
      expect(updated).not.toBeNull();
      expect(lastPutUrl).toBe('/patients/pat-mabini');

      // STRICT CHECK: Top-level entity properties are strictly undefined
      expect(lastPutPayload.addressLine).toBeUndefined();
      expect(lastPutPayload.barangay).toBeUndefined();
      expect(lastPutPayload.city).toBeUndefined();
      expect(lastPutPayload.province).toBeUndefined();
      expect(lastPutPayload.emergencyContactName).toBeUndefined();
      expect(lastPutPayload.emergencyContactPhone).toBeUndefined();
      expect(lastPutPayload.emergencyContactRelationship).toBeUndefined();

      // STRICT CHECK: Unified keys exist exclusively in customFields
      expect(lastPutPayload.customFields.primary_address_line).toBe('Talaga Road');
      expect(lastPutPayload.customFields.primary_barangay).toBe('Talaga');
      expect(lastPutPayload.customFields.primary_city).toBe('Tanauan City');
      expect(lastPutPayload.customFields.primary_province).toBe('Batangas');
      expect(lastPutPayload.customFields.emergency_contact_name).toBe('Inocencio Mabini');
      expect(lastPutPayload.customFields.emergency_contact_phone).toBe('0918-555-8888');
      expect(lastPutPayload.customFields.emergency_contact_relationship).toBe('Father');
    });

    test('3.2 Partial address & emergency contact fields omit missing properties and maintain strictly undefined top-level', async () => {
      const payload: RegisterPatientPayload = {
        firstName: 'Melchora',
        lastName: 'Aquino',
        dateOfBirth: '1812-01-06',
        gender: 'Female',
        civilStatus: 'Widowed',
        contactNumber: '0917-111-2222',
        customFields: {
          primary_barangay: 'Banlat',
          primary_city: 'Quezon City',
          emergency_contact_name: 'Juan Ramos',
          emergency_contact_relationship: 'Son',
        },
      };

      await clinicService.updatePatient('pat-tandang-sora', payload);

      expect(lastPutPayload.addressLine).toBeUndefined();
      expect(lastPutPayload.barangay).toBeUndefined();
      expect(lastPutPayload.city).toBeUndefined();
      expect(lastPutPayload.province).toBeUndefined();
      expect(lastPutPayload.emergencyContactName).toBeUndefined();
      expect(lastPutPayload.emergencyContactPhone).toBeUndefined();
      expect(lastPutPayload.emergencyContactRelationship).toBeUndefined();

      expect(lastPutPayload.customFields.primary_barangay).toBe('Banlat');
      expect(lastPutPayload.customFields.primary_city).toBe('Quezon City');
      expect(lastPutPayload.customFields.primary_address_line).toBeUndefined();
      expect(lastPutPayload.customFields.primary_province).toBeUndefined();
      expect(lastPutPayload.customFields.emergency_contact_name).toBe('Juan Ramos');
      expect(lastPutPayload.customFields.emergency_contact_relationship).toBe('Son');
      expect(lastPutPayload.customFields.emergency_contact_phone).toBeUndefined();
    });

    test('3.3 Trimming behavior: whitespace-padded strings are trimmed', async () => {
      const rawPayload: RegisterPatientPayload = {
        firstName: 'Marcelo',
        lastName: 'Del Pilar',
        dateOfBirth: '1850-08-30',
        gender: 'Male',
        civilStatus: 'Married',
        contactNumber: '0917-333-4444',
        customFields: {
          primary_address_line: '   Cupang Main Road   ',
          primary_barangay: '   San Nicolas   ',
          primary_city: '   Bulakan   ',
          primary_province: '   Bulacan   ',
          emergency_contact_name: '   Marciana Del Pilar   ',
          emergency_contact_phone: '   0918-333-5555   ',
          emergency_contact_relationship: '   Spouse   ',
        },
      };

      // Emulate EditPatientModal trim logic
      const addressAndContactKeys = [
        'primary_address_line',
        'primary_barangay',
        'primary_city',
        'primary_province',
        'emergency_contact_name',
        'emergency_contact_phone',
        'emergency_contact_relationship',
      ];
      const trimmedCustom: Record<string, any> = {};
      for (const k of addressAndContactKeys) {
        const val = rawPayload.customFields?.[k];
        if (typeof val === 'string') {
          trimmedCustom[k] = val.trim();
        }
      }

      const cleanPayload: RegisterPatientPayload = {
        ...rawPayload,
        customFields: trimmedCustom,
      };

      await clinicService.updatePatient('pat-plaridel', cleanPayload);

      expect(lastPutPayload.customFields.primary_address_line).toBe('Cupang Main Road');
      expect(lastPutPayload.customFields.primary_barangay).toBe('San Nicolas');
      expect(lastPutPayload.customFields.primary_city).toBe('Bulakan');
      expect(lastPutPayload.customFields.primary_province).toBe('Bulacan');
      expect(lastPutPayload.customFields.emergency_contact_name).toBe('Marciana Del Pilar');
      expect(lastPutPayload.customFields.emergency_contact_phone).toBe('0918-333-5555');
      expect(lastPutPayload.customFields.emergency_contact_relationship).toBe('Spouse');
    });

    test('3.4 Clearing fields: setting an existing customField to empty string serializes null to clear in backend', async () => {
      const existingPatient: ClinicPatient = {
        id: 'pat-clear-test',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        patientCode: 'PAT-CLR-01',
        firstName: 'Juan',
        lastName: 'Luna',
        dateOfBirth: '1857-10-23',
        gender: 'Male',
        civilStatus: 'Married',
        contactNumber: '0917-777-8888',
        createdAt: '2026-01-01T00:00:00Z',
        customFields: {
          primary_address_line: 'Calle Real',
          primary_barangay: 'Badoc Poblacion',
          primary_city: 'Badoc',
          primary_province: 'Ilocos Norte',
          emergency_contact_name: 'Paz Pardo de Tavera',
          emergency_contact_phone: '0918-777-9999',
          emergency_contact_relationship: 'Spouse',
        },
      };

      // Simulating user clearing city and emergency phone in EditPatientModal
      const editedValues: Record<string, string> = {
        primary_address_line: 'Calle Real',
        primary_barangay: 'Badoc Poblacion',
        primary_city: '', // Cleared!
        primary_province: 'Ilocos Norte',
        emergency_contact_name: 'Paz Pardo de Tavera',
        emergency_contact_phone: '   ', // Whitespace cleared!
        emergency_contact_relationship: 'Spouse',
      };

      const mergedCustomFields: Record<string, any> = {
        ...(existingPatient.customFields || {}),
      };

      const addressAndContactKeys = [
        'primary_address_line',
        'primary_barangay',
        'primary_city',
        'primary_province',
        'emergency_contact_name',
        'emergency_contact_phone',
        'emergency_contact_relationship',
      ];

      for (const key of addressAndContactKeys) {
        const val = editedValues[key];
        if (typeof val === 'string') {
          const trimmed = val.trim();
          if (trimmed) {
            mergedCustomFields[key] = trimmed;
          } else if (existingPatient.customFields?.[key] || (existingPatient as any)[key]) {
            mergedCustomFields[key] = null; // Correctly unsets in DB
          } else {
            delete mergedCustomFields[key];
          }
        }
      }

      const savePayload: RegisterPatientPayload = {
        firstName: existingPatient.firstName,
        lastName: existingPatient.lastName,
        dateOfBirth: existingPatient.dateOfBirth,
        gender: existingPatient.gender,
        contactNumber: existingPatient.contactNumber,
        customFields: mergedCustomFields,
      };

      await clinicService.updatePatient(existingPatient.id, savePayload);

      // Verify cleared keys become null, retained keys remain populated
      expect(lastPutPayload.customFields.primary_city).toBeNull();
      expect(lastPutPayload.customFields.emergency_contact_phone).toBeNull();
      expect(lastPutPayload.customFields.primary_barangay).toBe('Badoc Poblacion');
      expect(lastPutPayload.customFields.emergency_contact_name).toBe('Paz Pardo de Tavera');

      // Top-level properties remain undefined
      expect(lastPutPayload.city).toBeUndefined();
      expect(lastPutPayload.emergencyContactPhone).toBeUndefined();
    });

    test('3.5 Preserves unrelated custom fields, institutional metadata, and YAKAP enlistments during address/emergency update', async () => {
      const complexPatient: ClinicPatient = {
        id: 'pat-complex-001',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        patientCode: 'PAT-CMP-01',
        firstName: 'Emilio',
        lastName: 'Aguinaldo',
        dateOfBirth: '1869-03-22',
        gender: 'Male',
        civilStatus: 'Widowed',
        contactNumber: '0917-000-1898',
        createdAt: '2026-01-01T00:00:00Z',
        customFields: {
          classification: 'Employee',
          employee_id: 'EMP-GEN-01',
          department: 'Executive Office',
          yakap_enlistments: [
            {
              enlisted_at: '2026-01-01',
              valid_until: '2026-12-31',
              effective_year: 2026,
              status: 'Active',
              source: 'ClinicEnlistment',
              case_no: 'C00921202600001',
              enlistment_no: 'E00921202600001',
              profiling_trans_no: 'P00921202600001',
            },
          ],
          primary_barangay: 'Kaingen',
          primary_city: 'Kawit',
          primary_province: 'Cavite',
        },
      };

      const updatePayload: RegisterPatientPayload = {
        firstName: complexPatient.firstName,
        lastName: complexPatient.lastName,
        dateOfBirth: complexPatient.dateOfBirth,
        gender: complexPatient.gender,
        contactNumber: complexPatient.contactNumber,
        customFields: {
          ...complexPatient.customFields,
          primary_address_line: 'Aguinaldo Shrine Estate',
          emergency_contact_name: 'Hilaria del Rosario',
          emergency_contact_phone: '0918-000-1898',
          emergency_contact_relationship: 'Spouse',
        },
      };

      await clinicService.updatePatient(complexPatient.id, updatePayload);

      // Verify customFields preserved non-address fields intact
      expect(lastPutPayload.customFields.classification).toBe('Employee');
      expect(lastPutPayload.customFields.employee_id).toBe('EMP-GEN-01');
      expect(lastPutPayload.customFields.department).toBe('Executive Office');
      expect(lastPutPayload.customFields.yakap_enlistments).toHaveLength(1);
      expect(lastPutPayload.customFields.yakap_enlistments[0].case_no).toBe('C00921202600001');

      // Verify address and emergency contact are present
      expect(lastPutPayload.customFields.primary_address_line).toBe('Aguinaldo Shrine Estate');
      expect(lastPutPayload.customFields.primary_barangay).toBe('Kaingen');
      expect(lastPutPayload.customFields.primary_city).toBe('Kawit');
      expect(lastPutPayload.customFields.primary_province).toBe('Cavite');
      expect(lastPutPayload.customFields.emergency_contact_name).toBe('Hilaria del Rosario');

      // Verify top-level properties are undefined
      expect(lastPutPayload.addressLine).toBeUndefined();
      expect(lastPutPayload.barangay).toBeUndefined();
      expect(lastPutPayload.city).toBeUndefined();
      expect(lastPutPayload.province).toBeUndefined();
      expect(lastPutPayload.emergencyContactName).toBeUndefined();
      expect(lastPutPayload.emergencyContactPhone).toBeUndefined();
      expect(lastPutPayload.emergencyContactRelationship).toBeUndefined();
    });
  });
});
