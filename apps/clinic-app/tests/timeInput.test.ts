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
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const { formatTimeMask, validateTimeString } = await import('../components/ui/TimeInput');

describe('TimeInput - Masking & Validation Pure Utilities', () => {
  test('formatTimeMask strips non-numeric characters and formats HH:MM', () => {
    expect(formatTimeMask('1234')).toBe('12:34');
    expect(formatTimeMask('09')).toBe('09');
    expect(formatTimeMask('9')).toBe('9');
    expect(formatTimeMask('0930')).toBe('09:30');
    expect(formatTimeMask('09:30')).toBe('09:30');
    expect(formatTimeMask('abc09def30xyz')).toBe('09:30');
    expect(formatTimeMask('123456')).toBe('12:34'); // Max 4 digits
  });

  test('validateTimeString validates 24-hour boundaries', () => {
    // Valid cases
    expect(validateTimeString('00:00').isValid).toBe(true);
    expect(validateTimeString('09:30').isValid).toBe(true);
    expect(validateTimeString('14:45').isValid).toBe(true);
    expect(validateTimeString('23:59').isValid).toBe(true);
    expect(validateTimeString('').isValid).toBe(true);

    // Invalid hour
    const invalidHour = validateTimeString('24:00');
    expect(invalidHour.isValid).toBe(false);
    expect(invalidHour.errorMessage).toContain('Hours');

    const invalidHourNegative = validateTimeString('-1:00');
    expect(invalidHourNegative.isValid).toBe(false);

    // Invalid minute
    const invalidMin = validateTimeString('12:60');
    expect(invalidMin.isValid).toBe(false);
    expect(invalidMin.errorMessage).toContain('Minutes');

    // Incomplete format
    const incomplete = validateTimeString('9:3');
    expect(incomplete.isValid).toBe(false);
    expect(incomplete.errorMessage).toContain('format');
  });
});
