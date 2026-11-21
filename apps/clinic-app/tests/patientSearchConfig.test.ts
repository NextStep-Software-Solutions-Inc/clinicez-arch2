// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';

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
  TouchableHighlight: 'TouchableOpacity',
  Image: 'Image',
  RefreshControl: 'RefreshControl',
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Platform: { OS: 'web', select: (obj: any) => obj.web || obj.default },
  Touchable: { Mixin: {} },
  processColor: (c: any) => c,
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
    View: 'Animated.View',
    Text: 'Animated.Text',
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

const { parseConfiguredSearchFields, STANDARD_SEARCH_FIELDS } = await import(
  '../components/patient/PatientSearchResultRow'
);

describe('Patient Search Configuration - Parsing and Validation', () => {
  test('parseConfiguredSearchFields parses JSON array of field keys', () => {
    const json = JSON.stringify(['patientCode', 'age', 'sex', 'meta:insurance_tier']);
    const parsed = parseConfiguredSearchFields(json);
    expect(parsed).toEqual(['patientCode', 'age', 'sex', 'meta:insurance_tier']);
  });

  test('parseConfiguredSearchFields falls back to [patientCode] when empty or invalid', () => {
    expect(parseConfiguredSearchFields(null)).toEqual(['patientCode']);
    expect(parseConfiguredSearchFields('')).toEqual(['patientCode']);
    expect(parseConfiguredSearchFields('not-json')).toEqual(['patientCode']);
    expect(parseConfiguredSearchFields('{}')).toEqual(['patientCode']);
  });

  test('STANDARD_SEARCH_FIELDS contains required core demographic keys', () => {
    const keys = STANDARD_SEARCH_FIELDS.map((f) => f.key);
    expect(keys).toContain('patientCode');
    expect(keys).toContain('age');
    expect(keys).toContain('dateOfBirth');
    expect(keys).toContain('sex');
    expect(keys).toContain('contactNumber');
    expect(keys).toContain('philHealthNumber');
    expect(keys).toContain('barangay');
    expect(keys).toContain('bloodType');
    expect(keys).toContain('civilStatus');
  });
});
