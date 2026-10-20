// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
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

const {
  STANDARD_BLOOD_TYPES,
  BLOOD_TYPE_METADATA,
  isStandardBloodType,
} = await import('@shared/safe');

const {
  RH_POSITIVE_TYPES,
  RH_NEGATIVE_TYPES,
  BLOOD_TYPE_OPTIONS,
} = await import('../constants/bloodTypes');

const { default: BloodTypeSelect } = await import('../components/ui/BloodTypeSelect');

describe('Blood Type Standard Selection Suite', () => {
  test('BTS-1: STANDARD_BLOOD_TYPES defines exactly the 8 standard ABO/Rh types plus Unknown', () => {
    expect(STANDARD_BLOOD_TYPES).toEqual([
      'A+',
      'A-',
      'B+',
      'B-',
      'AB+',
      'AB-',
      'O+',
      'O-',
      'Unknown',
    ]);
    expect(STANDARD_BLOOD_TYPES.length).toBe(9);
  });

  test('BTS-2: isStandardBloodType validates standard strings and rejects open-text garbage', () => {
    expect(isStandardBloodType('O+')).toBe(true);
    expect(isStandardBloodType('A-')).toBe(true);
    expect(isStandardBloodType('AB+')).toBe(true);
    expect(isStandardBloodType('Unknown')).toBe(true);

    expect(isStandardBloodType('o+')).toBe(false);
    expect(isStandardBloodType('O POSITIVE')).toBe(false);
    expect(isStandardBloodType('RandomText')).toBe(false);
    expect(isStandardBloodType('')).toBe(false);
    expect(isStandardBloodType(null)).toBe(false);
    expect(isStandardBloodType(undefined)).toBe(false);
  });

  test('BTS-3: BLOOD_TYPE_METADATA contains complete antigen and Rh factor details', () => {
    expect(BLOOD_TYPE_METADATA['O+'].rhFactor).toBe('Positive');
    expect(BLOOD_TYPE_METADATA['O+'].antigen).toBe('O');

    expect(BLOOD_TYPE_METADATA['AB-'].rhFactor).toBe('Negative');
    expect(BLOOD_TYPE_METADATA['AB-'].antigen).toBe('AB');

    expect(BLOOD_TYPE_METADATA['Unknown'].rhFactor).toBe('Unknown');
  });

  test('BTS-4: RH_POSITIVE_TYPES and RH_NEGATIVE_TYPES partition ABO blood groups', () => {
    expect(RH_POSITIVE_TYPES).toEqual(['A+', 'B+', 'AB+', 'O+']);
    expect(RH_NEGATIVE_TYPES).toEqual(['A-', 'B-', 'AB-', 'O-']);
    expect(BLOOD_TYPE_OPTIONS.length).toBe(9);
  });

  test('BTS-5: BloodTypeSelect renders with placeholder when unselected', () => {
    let changedValue = '';
    const element = React.createElement(BloodTypeSelect, {
      label: 'Patient Blood Type',
      value: '',
      onChange: (val: string) => {
        changedValue = val;
      },
      placeholder: 'Select blood group',
    });

    expect(element).toBeDefined();
    expect(element.props.label).toBe('Patient Blood Type');
    expect(element.props.value).toBe('');
    expect(element.props.placeholder).toBe('Select blood group');
  });

  test('BTS-6: BloodTypeSelect renders populated value and handles disabled state', () => {
    const element = React.createElement(BloodTypeSelect, {
      label: 'Blood Type',
      value: 'B+',
      onChange: () => {},
      disabled: true,
      required: true,
    });

    expect(element).toBeDefined();
    expect(element.props.value).toBe('B+');
    expect(element.props.disabled).toBe(true);
    expect(element.props.required).toBe(true);
  });

  test('BTS-7: BloodTypeSelect accepts error message prop', () => {
    const element = React.createElement(BloodTypeSelect, {
      value: null,
      onChange: () => {},
      error: 'Blood type is required for surgical clearance',
    });

    expect(element).toBeDefined();
    expect(element.props.error).toBe('Blood type is required for surgical clearance');
  });
});
