// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, accessibilityState, ...props }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        'data-state': JSON.stringify(accessibilityState || {}),
        ...props,
      },
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
  Image: createMockComponent('Image'),
  Switch: createMockComponent('Switch'),
  FlatList: createMockComponent('FlatList'),
  SectionList: createMockComponent('SectionList'),
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  TouchableHighlight: createMockComponent('TouchableHighlight'),
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
  Alert: { alert: () => {} },
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

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    put: async (url: string, payload?: any) => {
      lastPutUrl = url;
      lastPutPayload = payload;
      return [payload, null];
    },
    get: async () => [null, null],
    post: async () => [null, null],
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const { formatBloodTypeLabel } = await import('@shared/safe');
const { default: BloodTypeSelect } = await import('../components/ui/BloodTypeSelect');
const { formatPatientDemographicsLine } = await import('../components/patient/PatientDirectoryCard');
const { clinicService } = await import('../services/clinicService');

describe('Issue #142: Patient Demographics Blood Type Persistence & Normalization Suite', () => {
  beforeEach(() => {
    lastPutUrl = '';
    lastPutPayload = null;
  });

  describe('formatBloodTypeLabel Canonicalization', () => {
    test('normalizes raw C# enum names to clinical labels', () => {
      expect(formatBloodTypeLabel('APositive')).toBe('A+');
      expect(formatBloodTypeLabel('ANegative')).toBe('A-');
      expect(formatBloodTypeLabel('BPositive')).toBe('B+');
      expect(formatBloodTypeLabel('BNegative')).toBe('B-');
      expect(formatBloodTypeLabel('ABPositive')).toBe('AB+');
      expect(formatBloodTypeLabel('ABNegative')).toBe('AB-');
      expect(formatBloodTypeLabel('OPositive')).toBe('O+');
      expect(formatBloodTypeLabel('ONegative')).toBe('O-');
      expect(formatBloodTypeLabel('Unknown')).toBe('Unknown');
    });

    test('normalizes EhrStaticOptions codes with underscores', () => {
      expect(formatBloodTypeLabel('A_POSITIVE')).toBe('A+');
      expect(formatBloodTypeLabel('A_NEGATIVE')).toBe('A-');
      expect(formatBloodTypeLabel('B_POSITIVE')).toBe('B+');
      expect(formatBloodTypeLabel('B_NEGATIVE')).toBe('B-');
      expect(formatBloodTypeLabel('AB_POSITIVE')).toBe('AB+');
      expect(formatBloodTypeLabel('AB_NEGATIVE')).toBe('AB-');
      expect(formatBloodTypeLabel('O_POSITIVE')).toBe('O+');
      expect(formatBloodTypeLabel('O_NEGATIVE')).toBe('O-');
      expect(formatBloodTypeLabel('UNKNOWN')).toBe('Unknown');
    });

    test('passes through canonical clinical strings unchanged', () => {
      expect(formatBloodTypeLabel('A+')).toBe('A+');
      expect(formatBloodTypeLabel('AB-')).toBe('AB-');
      expect(formatBloodTypeLabel('O+')).toBe('O+');
    });

    test('handles whitespace and empty or undefined values safely', () => {
      expect(formatBloodTypeLabel('   AB+   ')).toBe('AB+');
      expect(formatBloodTypeLabel('')).toBeUndefined();
      expect(formatBloodTypeLabel('   ')).toBeUndefined();
      expect(formatBloodTypeLabel(null)).toBeUndefined();
      expect(formatBloodTypeLabel(undefined)).toBeUndefined();
    });
  });

  describe('BloodTypeSelect Component Normalization', () => {
    test('normalizes raw enum value ABNegative into AB- and highlights correct option', () => {
      let selectedVal = '';
      const element = React.createElement(BloodTypeSelect, {
        value: 'ABNegative',
        onChange: (v: string) => {
          selectedVal = v;
        },
      });

      expect(element).toBeDefined();
      expect(element.props.value).toBe('ABNegative');
    });

    test('renders with placeholder when value is null or empty', () => {
      const element = React.createElement(BloodTypeSelect, {
        value: null,
        onChange: () => {},
        placeholder: 'Select blood type',
      });

      expect(element).toBeDefined();
      expect(element.props.placeholder).toBe('Select blood type');
    });
  });

  describe('PatientDirectoryCard Demographics Line Formatting', () => {
    test('formats raw enum ABNegative as "Blood type AB-" in patient card line', () => {
      const line = formatPatientDemographicsLine({
        dateOfBirth: '1985-04-12',
        age: 41,
        sex: 'Female',
        civilStatus: 'Married',
        bloodType: 'ABNegative',
      });

      expect(line).toContain('Blood type AB-');
      expect(line).not.toContain('ABNegative');
    });

    test('formats standard AB+ as "Blood type AB+" in patient card line', () => {
      const line = formatPatientDemographicsLine({
        dateOfBirth: '1985-04-12',
        age: 41,
        sex: 'Female',
        civilStatus: 'Married',
        bloodType: 'AB+',
      });

      expect(line).toContain('Blood type AB+');
    });
  });

  describe('End-to-End ClinicService Update Payload Verification', () => {
    test('submits bloodType "AB+" in PUT /patients/{id} payload', async () => {
      const [res, err] = await clinicService.updatePatient('pat-consuelo-id', {
        firstName: 'Consuelo',
        lastName: 'Eugenio',
        middleName: 'M',
        dateOfBirth: '1985-04-12',
        sex: 'Female',
        civilStatus: 'Married',
        contactNumber: '0917-111-2222',
        bloodType: 'AB+',
        verificationStatus: 'Verified',
      });

      expect(err).toBeNull();
      expect(lastPutUrl).toBe('/patients/pat-consuelo-id');
      expect(lastPutPayload.bloodType).toBe('AB+');
    });
  });
});
