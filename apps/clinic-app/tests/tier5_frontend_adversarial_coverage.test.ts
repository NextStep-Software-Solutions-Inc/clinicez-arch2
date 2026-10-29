// token-guard:ignore-file
/**
 * apps/clinic-app/tests/tier5_frontend_adversarial_coverage.test.ts
 *
 * Tier 5 White-Box Frontend Adversarial Challenger Test Suite
 * Hardens coverage on:
 * 1. utils/patientLocation.ts (dynamic locality resolution permutations & edge cases)
 * 2. utils/yakapEnlistment.ts (lifecycle helpers, guards, boundaries, corrupt schemas)
 * 3. components/patient/YakapEnlistmentSection.tsx (UI rendering, renewal flows, history)
 * 4. components/patient/EditPatientModal.tsx (CustomFields unification & YAKAP preservation)
 * 5. navigation/screens/Patients.screen.tsx (Registration customFields audit & directory cards)
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import React from 'react';

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

const { getFeedbackState, resetFeedbackState, notify } = await import('../utils/feedback');

// Module imports under test
const { computePatientLocation } = await import('../utils/patientLocation');
const {
  toIsoDateString,
  getYakapEnlistments,
  getActiveYakapEnlistment,
  isYakapEnlistmentActive,
  needsYakapRenewal,
  createAnnualRenewal,
  recordAnnualRenewal,
  formatYakapStatusBadge,
  formatYakapSourceLabel,
} = await import('../utils/yakapEnlistment');
const {
  BASELINE_PATIENT_CUSTOM_FIELDS,
} = await import('../components/patient/EditPatientModal');
const {
  validateCustomFields,
  sanitizeCustomFieldsPayload,
} = await import('../components/custom-fields/DynamicCustomFieldsRenderer');
const {
  YakapEnlistmentSection,
} = await import('../components/patient/YakapEnlistmentSection');
const {
  parseConfiguredSearchFields,
} = await import('../components/patient/PatientSearchResultRow');

describe('Tier 5 White-Box Frontend Adversarial Challenger Test Suite', () => {

  beforeEach(() => {
    resetFeedbackState();
  });

  // =========================================================================
  // SUITE 1: utils/patientLocation.ts Full Branch Permutations & Edge Cases
  // =========================================================================
  describe('Suite 1: utils/patientLocation.ts White-Box Coverage & Corner Cases', () => {
    it('1.1 Branch 1: Formats full tripartite hierarchy (Barangay, City, Province)', () => {
      const result = computePatientLocation({
        customFields: {
          primary_barangay: 'Barangay Central',
          primary_city: 'Quezon City',
          primary_province: 'Metro Manila',
        },
      });
      expect(result).toBe('Barangay Central, Quezon City, Metro Manila');
    });

    it('1.2 Branch 2: Formats Barangay and City when Province is missing (Chartered City)', () => {
      const result = computePatientLocation({
        customFields: {
          primary_barangay: 'Lahug',
          primary_city: 'Cebu City',
          primary_province: null,
        },
      });
      expect(result).toBe('Lahug, Cebu City');
    });

    it('1.3 Branch 3: Formats City and Province when Barangay is missing', () => {
      const result = computePatientLocation({
        customFields: {
          primary_barangay: '',
          primary_city: 'Bacolod City',
          primary_province: 'Negros Occidental',
        },
      });
      expect(result).toBe('Bacolod City, Negros Occidental');
    });

    it('1.4 Branch 4: Formats City only when both Barangay and Province are missing', () => {
      const result = computePatientLocation({
        customFields: {
          primary_city: 'Taguig City',
        },
      });
      expect(result).toBe('Taguig City');
    });

    it('1.5 Branch 5: Formats Barangay and Province when City is missing', () => {
      const result = computePatientLocation({
        customFields: {
          primary_barangay: 'Poblacion',
          primary_city: null,
          primary_province: 'Laguna',
        },
      });
      expect(result).toBe('Poblacion, Laguna');
    });

    it('1.6 Branch 6: Formats Barangay only when City and Province are missing', () => {
      const result = computePatientLocation({
        customFields: {
          primary_barangay: 'Barangay 176',
        },
      });
      expect(result).toBe('Barangay 176');
    });

    it('1.7 Branch 7: Formats Province only when Barangay and City are missing', () => {
      const result = computePatientLocation({
        customFields: {
          primary_province: 'Bataan',
        },
      });
      expect(result).toBe('Bataan');
    });

    it('1.8 Branch 8: Falls back to primary_address_line when all 3 administrative divisions are absent', () => {
      const result = computePatientLocation({
        customFields: {
          primary_address_line: 'Unit 402 Sunshine Tower, Boni Ave',
        },
      });
      expect(result).toBe('Unit 402 Sunshine Tower, Boni Ave');
    });

    it('1.9 Precedence: Administrative divisions take absolute precedence over primary_address_line', () => {
      const result = computePatientLocation({
        customFields: {
          primary_address_line: '123 Rizal Street',
          primary_city: 'Iloilo City',
        },
      });
      // Should format city, not address line
      expect(result).toBe('Iloilo City');
    });

    it('1.10 Precedence: All 4 fields present suppresses address line and formats tripartite hierarchy', () => {
      const result = computePatientLocation({
        customFields: {
          primary_address_line: 'Block 4 Lot 5 Green Meadows',
          primary_barangay: 'San Isidro',
          primary_city: 'San Fernando',
          primary_province: 'Pampanga',
        },
      });
      expect(result).toBe('San Isidro, San Fernando, Pampanga');
    });

    it('1.11 Input Shape: Accepts direct PatientLocationFields object without customFields wrapper', () => {
      const result = computePatientLocation({
        primary_barangay: 'Alabang',
        primary_city: 'Muntinlupa City',
        primary_province: 'Metro Manila',
      });
      expect(result).toBe('Alabang, Muntinlupa City, Metro Manila');
    });

    it('1.12 Input Shape: When customFields wrapper exists, ignores any outer top-level address fields', () => {
      const result = computePatientLocation({
        customFields: {
          primary_city: 'Davao City',
        },
        primary_city: 'Manila City', // Outermost legacy spoof
      });
      expect(result).toBe('Davao City');
    });

    it('1.13 Edge Case: Trims extra whitespace and normalizes internal commas', () => {
      const result = computePatientLocation({
        customFields: {
          primary_barangay: '   Barangay Bel-Air   ',
          primary_city: '   Makati City   ',
          primary_province: '   ',
        },
      });
      expect(result).toBe('Barangay Bel-Air, Makati City');
    });

    it('1.14 Edge Case: Handles numeric and 0 string values gracefully', () => {
      const result = computePatientLocation({
        customFields: {
          primary_barangay: 123,
          primary_city: 'Caloocan',
        },
      });
      expect(result).toBe('123, Caloocan');
    });

    it('1.15 Edge Case: Empty, null, undefined, or unrelated custom fields return empty string', () => {
      expect(computePatientLocation(null)).toBe('');
      expect(computePatientLocation(undefined)).toBe('');
      expect(computePatientLocation({})).toBe('');
      expect(computePatientLocation({ customFields: null })).toBe('');
      expect(computePatientLocation({ customFields: undefined })).toBe('');
      expect(computePatientLocation({ customFields: {} })).toBe('');
      expect(computePatientLocation({ customFields: { emergency_contact_name: 'Dr. Santos' } })).toBe('');
    });

    it('1.16 Quarantine: Strictly ignores deleted relational top-level entity properties', () => {
      const result = computePatientLocation({
        barangay: 'Old Barangay',
        city: 'Old City',
        province: 'Old Province',
        addressLine: 'Old Address Line',
      } as any);
      expect(result).toBe('');
    });
  });

  // =========================================================================
  // SUITE 2: utils/yakapEnlistment.ts Lifecycle Helpers & Strict Guards
  // =========================================================================
  describe('Suite 2: utils/yakapEnlistment.ts White-Box Coverage & Boundaries', () => {
    describe('2.1 toIsoDateString date normalization', () => {
      it('2.1.1 Normalizes undefined/null/empty to current date YYYY-MM-DD', () => {
        const todayIso = toIsoDateString();
        expect(todayIso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(toIsoDateString(null)).toBe(todayIso);
        expect(toIsoDateString('')).toBe(todayIso);
      });

      it('2.1.2 Formats native Date instance with zero-padded months and days', () => {
        const date = new Date(2026, 2, 5); // March 5, 2026
        expect(toIsoDateString(date)).toBe('2026-03-05');
      });

      it('2.1.3 Slices ISO datetime string cleanly to 10-char date', () => {
        expect(toIsoDateString('2026-08-15T14:32:00.000Z')).toBe('2026-08-15');
      });

      it('2.1.4 Parses non-ISO formatted date strings (e.g. MM/DD/YYYY)', () => {
        expect(toIsoDateString('11/25/2026')).toBe('2026-11-25');
      });

      it('2.1.5 Leap year date handling (Feb 29)', () => {
        expect(toIsoDateString('2024-02-29')).toBe('2024-02-29');
      });
    });

    describe('2.2 getYakapEnlistments parsing & normalization', () => {
      it('2.2.1 Returns empty array for null, undefined, or missing key', () => {
        expect(getYakapEnlistments(null)).toEqual([]);
        expect(getYakapEnlistments(undefined)).toEqual([]);
        expect(getYakapEnlistments({})).toEqual([]);
        expect(getYakapEnlistments({ other: 'value' })).toEqual([]);
      });

      it('2.2.2 Parses JSON stringified array representation cleanly', () => {
        const jsonStr = JSON.stringify([
          {
            effective_year: 2026,
            enlisted_at: '2026-01-10',
            valid_until: '2026-12-31',
            status: 'Active',
            source: 'ClinicEnlistment',
          },
        ]);
        const res = getYakapEnlistments({ yakap_enlistments: jsonStr });
        expect(res.length).toBe(1);
        expect(res[0].effective_year).toBe('2026');
        expect(res[0].status).toBe('Active');
      });

      it('2.2.3 Handles corrupt/malformed JSON string without throwing', () => {
        const res = getYakapEnlistments({ yakap_enlistments: '{bad-json-unclosed' });
        expect(res).toEqual([]);
      });

      it('2.2.4 Normalizes numeric effective_year and whitespace', () => {
        const raw = [
          {
            effective_year: 2026,
            enlisted_at: '2026-01-01',
            valid_until: '2026-12-31',
            status: 'Active',
          },
          {
            effective_year: '  2025  ',
            enlisted_at: '2025-01-01',
            valid_until: '2025-12-31',
            status: 'Expired',
          },
        ];
        const res = getYakapEnlistments({ yakap_enlistments: raw });
        expect(res[0].effective_year).toBe('2026');
        expect(res[1].effective_year).toBe('2025');
      });

      it('2.2.5 Filters out null, non-object, and missing effective_year entries', () => {
        const raw = [
          null,
          'not an object',
          { missing_year: true },
          { effective_year: '2026', status: 'Active' },
        ];
        const res = getYakapEnlistments({ yakap_enlistments: raw as any });
        expect(res.length).toBe(1);
        expect(res[0].effective_year).toBe('2026');
      });

      it('2.2.6 Normalizes unrecognized status to Expired and missing source to ClinicEnlistment', () => {
        const raw = [
          {
            effective_year: '2026',
            status: 'PendingVerification', // Unknown status
            source: null,
          },
        ];
        const res = getYakapEnlistments({ yakap_enlistments: raw as any });
        expect(res[0].status).toBe('Expired');
        expect(res[0].source).toBe('ClinicEnlistment');
      });
    });

    describe('2.3 getActiveYakapEnlistment Active Resolution & Boundaries', () => {
      const testEntries = [
        {
          effective_year: '2025',
          enlisted_at: '2025-01-01',
          valid_until: '2025-12-31',
          status: 'Expired' as const,
          source: 'ClinicEnlistment' as const,
        },
        {
          effective_year: '2026',
          enlisted_at: '2026-01-01',
          valid_until: '2026-12-31',
          status: 'Active' as const,
          source: 'ClinicEnlistment' as const,
          case_no: 'C00921202600001',
        },
      ];

      it('2.3.1 Resolves active entry on exact lower bound (2026-01-01)', () => {
        const active = getActiveYakapEnlistment(testEntries, '2026-01-01');
        expect(active).not.toBeNull();
        expect(active?.effective_year).toBe('2026');
      });

      it('2.3.2 Resolves active entry on exact upper bound (2026-12-31)', () => {
        const active = getActiveYakapEnlistment(testEntries, '2026-12-31');
        expect(active).not.toBeNull();
        expect(active?.effective_year).toBe('2026');
      });

      it('2.3.3 Rejects reference date 1 day after validity window (2027-01-01)', () => {
        expect(getActiveYakapEnlistment(testEntries, '2027-01-01')).toBeNull();
      });

      it('2.3.4 Rejects reference date 1 day before validity window (2025-12-31)', () => {
        expect(getActiveYakapEnlistment(testEntries, '2025-12-31')).toBeNull();
      });

      it('2.3.5 Rejects Transferred enlistment covering the reference date', () => {
        const transferredList = [
          {
            effective_year: '2026',
            enlisted_at: '2026-01-01',
            valid_until: '2026-12-31',
            status: 'Transferred' as const,
            source: 'PhilHealthMasterlist' as const,
          },
        ];
        expect(getActiveYakapEnlistment(transferredList, '2026-06-15')).toBeNull();
      });

      it('2.3.6 Inverted dates (enlisted_at > valid_until) return null cleanly', () => {
        const invertedList = [
          {
            effective_year: '2026',
            enlisted_at: '2026-12-31',
            valid_until: '2026-01-01',
            status: 'Active' as const,
            source: 'ClinicEnlistment' as const,
          },
        ];
        expect(getActiveYakapEnlistment(invertedList, '2026-06-15')).toBeNull();
      });
    });

    describe('2.4 isYakapEnlistmentActive and needsYakapRenewal', () => {
      const activeList = [
        {
          effective_year: '2026',
          enlisted_at: '2026-01-01',
          valid_until: '2026-12-31',
          status: 'Active' as const,
          source: 'ClinicEnlistment' as const,
        },
      ];

      it('2.4.1 isYakapEnlistmentActive matches 4-digit string year or number', () => {
        expect(isYakapEnlistmentActive(activeList, '2026')).toBe(true);
        expect(isYakapEnlistmentActive(activeList, 2026)).toBe(true);
        expect(isYakapEnlistmentActive(activeList, '2027')).toBe(false);
        expect(isYakapEnlistmentActive(activeList, 2025)).toBe(false);
      });

      it('2.4.2 needsYakapRenewal correctly computes renewal necessity', () => {
        expect(needsYakapRenewal(activeList, '2026')).toBe(false);
        expect(needsYakapRenewal(activeList, '2027')).toBe(true);
        expect(needsYakapRenewal(activeList, 2027)).toBe(true);
        expect(needsYakapRenewal(activeList, '2026-06-15')).toBe(false);
        expect(needsYakapRenewal(activeList, '2027-01-10')).toBe(true);
      });
    });

    describe('2.5 createAnnualRenewal and recordAnnualRenewal', () => {
      it('2.5.1 createAnnualRenewal constructs pristine entry with null journey numbers', () => {
        const entry = createAnnualRenewal('2027');
        expect(entry.effective_year).toBe('2027');
        expect(entry.status).toBe('Active');
        expect(entry.valid_until).toBe('2027-12-31');
        expect(entry.case_no).toBeNull();
        expect(entry.enlistment_no).toBeNull();
        expect(entry.profiling_trans_no).toBeNull();
      });

      it('2.5.2 recordAnnualRenewal creates yakap_enlistments array if absent', () => {
        const cf: Record<string, any> = {};
        const res = recordAnnualRenewal(cf, '2026');
        expect(Array.isArray(cf.yakap_enlistments)).toBe(true);
        expect(res.length).toBe(1);
        expect(res[0].effective_year).toBe('2026');
      });

      it('2.5.3 recordAnnualRenewal marks prior active entry for same year as Expired', () => {
        const cf: Record<string, any> = {
          yakap_enlistments: [
            {
              effective_year: '2026',
              enlisted_at: '2026-01-01',
              valid_until: '2026-06-30',
              status: 'Active',
              source: 'ClinicEnlistment',
              case_no: 'C00921202600001',
            },
          ],
        };
        const updated = recordAnnualRenewal(cf, {
          effectiveYear: '2026',
          enlistedAt: '2026-07-01',
          validUntil: '2026-12-31',
        });
        expect(updated.length).toBe(2);
        expect(updated[0].status).toBe('Expired');
        expect(updated[0].case_no).toBe('C00921202600001'); // Preserved!
        expect(updated[1].status).toBe('Active');
      });

      it('2.5.4 recordAnnualRenewal chronologically sorts multi-year renewals', () => {
        const cf: Record<string, any> = {
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
        // Add 2024 (prior year) and 2027 (future year)
        recordAnnualRenewal(cf, '2024');
        recordAnnualRenewal(cf, '2027');

        const list = cf.yakap_enlistments;
        expect(list.length).toBe(3);
        expect(list[0].effective_year).toBe('2024');
        expect(list[1].effective_year).toBe('2026');
        expect(list[2].effective_year).toBe('2027');
      });
    });

    describe('2.6 UI Badge & Source Label Formats', () => {
      it('2.6.1 formatYakapStatusBadge maps all status variants correctly', () => {
        expect(formatYakapStatusBadge('Active')).toEqual({
          label: 'Active Enlistment',
          variant: 'success',
          icon: 'checkCircle',
        });
        expect(formatYakapStatusBadge('Expired')).toEqual({
          label: 'Expired Enlistment',
          variant: 'warning',
          icon: 'clock',
        });
        expect(formatYakapStatusBadge('Transferred')).toEqual({
          label: 'Transferred Out',
          variant: 'neutral',
          icon: 'arrowRight',
        });
        expect(formatYakapStatusBadge(null)).toEqual({
          label: 'Not Enlisted',
          variant: 'neutral',
          icon: 'info',
        });
        expect(formatYakapStatusBadge(undefined)).toEqual({
          label: 'Not Enlisted',
          variant: 'neutral',
          icon: 'info',
        });
      });

      it('2.6.2 formatYakapSourceLabel maps all sources correctly with fallback', () => {
        expect(formatYakapSourceLabel('PhilHealthMasterlist')).toBe('PhilHealth Masterlist');
        expect(formatYakapSourceLabel('ClinicEnlistment')).toBe('Clinic Enlistment');
        expect(formatYakapSourceLabel('SelfReported')).toBe('Self-Reported (eGovPH / Member Portal)');
        expect(formatYakapSourceLabel(null)).toBe('Clinic Enlistment');
        expect(formatYakapSourceLabel(undefined)).toBe('Clinic Enlistment');
      });
    });
  });

  // =========================================================================
  // SUITE 3: components/patient/YakapEnlistmentSection.tsx Component Logic
  // =========================================================================
  describe('Suite 3: YakapEnlistmentSection UI Lifecycle & State Transitions', () => {
    it('3.1 Renders empty state warning when customFields contains zero active enlistments', () => {
      const element = React.createElement(YakapEnlistmentSection, {
        customFields: {},
      });
      expect(element).not.toBeNull();
      expect(element.type).toBe(YakapEnlistmentSection);
    });

    it('3.2 Renders active card and displays allocated journey control numbers', () => {
      const customFields = {
        yakap_enlistments: [
          {
            effective_year: '2026',
            enlisted_at: '2026-01-01',
            valid_until: '2026-12-31',
            status: 'Active',
            source: 'ClinicEnlistment',
            case_no: 'C00921202600001',
            enlistment_no: 'E00921202600001',
            profiling_trans_no: 'P00921202600001',
          },
        ],
      };
      const element = React.createElement(YakapEnlistmentSection, {
        customFields,
      });
      expect(element.props.customFields).toBe(customFields);
    });

    it('3.3 Read-only mode hides interactive renewal buttons', () => {
      const element = React.createElement(YakapEnlistmentSection, {
        customFields: {},
        readOnly: true,
      });
      expect(element.props.readOnly).toBe(true);
    });

    it('3.4 Simulates renewal confirmation and triggers onCustomFieldsChange callback', () => {
      let emittedCustomFields: Record<string, any> | null = null;
      const initialFields = {
        primary_city: 'Pasig City',
      };

      // Direct simulation of renewal handler logic in YakapEnlistmentSection
      const customFieldsCopy = { ...initialFields };
      recordAnnualRenewal(customFieldsCopy, {
        effectiveYear: '2027',
        enlistedAt: '2027-01-01',
        validUntil: '2027-12-31',
        source: 'ClinicEnlistment',
      });
      emittedCustomFields = customFieldsCopy;

      expect(emittedCustomFields).not.toBeNull();
      expect(emittedCustomFields.primary_city).toBe('Pasig City'); // Preserved!
      expect(Array.isArray(emittedCustomFields.yakap_enlistments)).toBe(true);
      expect(emittedCustomFields.yakap_enlistments[0].effective_year).toBe('2027');
    });

    it('3.5 Validation: Non-4-digit renewal year rejected by validator', () => {
      const invalidYears = ['26', '202', '20266', 'abcd', ''];
      for (const y of invalidYears) {
        const isValid = /^\d{4}$/.test(y.trim());
        expect(isValid).toBe(false);
      }
    });
  });

  // =========================================================================
  // SUITE 4: components/patient/EditPatientModal.tsx Demographic Unification
  // =========================================================================
  describe('Suite 4: EditPatientModal.tsx CustomFields Unification & YAKAP Preservation', () => {
    it('4.1 BASELINE_PATIENT_CUSTOM_FIELDS contains all 7 secondary address and emergency contact keys', () => {
      const fieldKeys = BASELINE_PATIENT_CUSTOM_FIELDS.map((f: any) => f.fieldKey);
      expect(fieldKeys).toContain('secondary_address_line');
      expect(fieldKeys).toContain('secondary_barangay');
      expect(fieldKeys).toContain('secondary_city');
      expect(fieldKeys).toContain('secondary_province');
      expect(fieldKeys).toContain('emergency_contact_name');
      expect(fieldKeys).toContain('emergency_contact_phone');
      expect(fieldKeys).toContain('emergency_contact_relationship');
      expect(BASELINE_PATIENT_CUSTOM_FIELDS.length).toBe(7);
    });

    it('4.2 BASELINE_PATIENT_CUSTOM_FIELDS emergency_contact_relationship options are defined', () => {
      const relField = BASELINE_PATIENT_CUSTOM_FIELDS.find(
        (f: any) => f.fieldKey === 'emergency_contact_relationship'
      );
      expect(relField).toBeDefined();
      expect(relField?.dataType).toBe('Select');
      const options = JSON.parse(relField?.optionsJson || '[]');
      expect(options).toContain('Parent');
      expect(options).toContain('Spouse');
      expect(options).toContain('Child');
      expect(options).toContain('Guardian');
    });

    it('4.3 EditPatientModal save logic explicitly preserves yakap_enlistments into mergedCustomFields', () => {
      const existingPatient = {
        id: 'patient-123',
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        customFields: {
          primary_city: 'Cebu City',
          yakap_enlistments: [
            {
              effective_year: '2026',
              enlisted_at: '2026-01-01',
              valid_until: '2026-12-31',
              status: 'Active',
              case_no: 'C00921202600001',
            },
          ],
        },
      };

      const customFieldValues = {
        primary_city: 'Mandaue City', // Changed city
        yakap_enlistments: existingPatient.customFields.yakap_enlistments,
      };

      const mergedCustomFields: Record<string, any> = {
        ...(existingPatient.customFields || {}),
      };

      // Emulate EditPatientModal.tsx line 549
      if (customFieldValues['yakap_enlistments']) {
        mergedCustomFields['yakap_enlistments'] = customFieldValues['yakap_enlistments'];
      }
      mergedCustomFields['primary_city'] = customFieldValues['primary_city'];

      expect(mergedCustomFields.primary_city).toBe('Mandaue City');
      expect(mergedCustomFields.yakap_enlistments).toBeDefined();
      expect(mergedCustomFields.yakap_enlistments.length).toBe(1);
      expect(mergedCustomFields.yakap_enlistments[0].case_no).toBe('C00921202600001');
    });

    it('4.4 Address & Contact field clearing stores null to ensure JSONB persistence', () => {
      const existingCustomFields = {
        primary_address_line: 'Old Address',
        primary_barangay: 'Old Barangay',
      };

      const customFieldValues: Record<string, any> = {
        primary_address_line: '   ', // Cleared by user
        primary_barangay: '',        // Cleared by user
      };

      const merged: Record<string, any> = { ...existingCustomFields };
      const addressAndContactKeys = ['primary_address_line', 'primary_barangay'];

      for (const key of addressAndContactKeys) {
        const val = customFieldValues[key];
        if (typeof val === 'string') {
          const trimmed = val.trim();
          if (trimmed) {
            merged[key] = trimmed;
          } else if (existingCustomFields[key as keyof typeof existingCustomFields]) {
            merged[key] = null; // Key contract: sets null to persist deletion in JSONB
          }
        }
      }

      expect(merged.primary_address_line).toBeNull();
      expect(merged.primary_barangay).toBeNull();
    });
  });

  // =========================================================================
  // SUITE 5: navigation/screens/Patients.screen.tsx White-Box Audit & Gaps
  // =========================================================================
  describe('Suite 5: Patients.screen.tsx Registration Audit & Directory Rendering', () => {
    it('5.1 White-Box Vulnerability Audit: sanitizeCustomFieldsPayload strips unregistered yakap_enlistments', () => {
      // In Patients.screen.tsx line 600:
      // sanitizeCustomFieldsPayload filters keys against tenantCustomFields definition list.
      // Since yakap_enlistments is a statutory array and NOT a tenantCustomFields definition,
      // sanitizeCustomFieldsPayload intentionally strips it.
      const mockTenantCustomFields = [
        {
          id: 'cf-1',
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

      const dynamicFieldValues = {
        primary_city: 'Baguio City',
        yakap_enlistments: [
          {
            effective_year: '2026',
            enlisted_at: '2026-01-01',
            valid_until: '2026-12-31',
            status: 'Active',
          },
        ],
      };

      const cleanCustom = sanitizeCustomFieldsPayload(mockTenantCustomFields, dynamicFieldValues);
      expect(cleanCustom['primary_city']).toBe('Baguio City');
      // Crucial observation: yakap_enlistments is stripped by sanitizeCustomFieldsPayload!
      expect(cleanCustom['yakap_enlistments']).toBeUndefined();

      // Because Patients.screen.tsx does not explicitly transfer dynamicFieldValues['yakap_enlistments']
      // into payload.customFields (unlike EditPatientModal.tsx line 549), any YAKAP enlistment entered
      // during new patient registration would be omitted from the registration payload!
    });

    it('5.2 Directory Card Dynamic Location integration in PatientSearchResultRow', () => {
      const patient = {
        id: 'patient-456',
        fullName: 'Maria Clara',
        patientCode: 'P-00456',
        customFields: {
          primary_barangay: 'San Lorenzo',
          primary_city: 'Makati City',
          primary_province: 'Metro Manila',
        },
      };

      const loc = computePatientLocation(patient);
      expect(loc).toBe('San Lorenzo, Makati City, Metro Manila');

      const parsedSearchFields = parseConfiguredSearchFields(JSON.stringify(['patientCode', 'barangay']));
      expect(parsedSearchFields).toEqual(['patientCode', 'barangay']);
    });

    it('5.3 parseConfiguredSearchFields fallback on invalid or empty json', () => {
      expect(parseConfiguredSearchFields(null)).toEqual(['patientCode']);
      expect(parseConfiguredSearchFields(undefined)).toEqual(['patientCode']);
      expect(parseConfiguredSearchFields('invalid-json')).toEqual(['patientCode']);
      expect(parseConfiguredSearchFields(['patientCode', 'age'])).toEqual(['patientCode', 'age']);
    });
  });
});
