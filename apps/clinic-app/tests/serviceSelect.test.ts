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

describe('Service Multi-Select Logic', () => {
  test('multi-select handles adding, toggling, and removing services', () => {
    let selected: string[] = ['General Consultation'];

    const toggle = (name: string) => {
      if (selected.includes(name)) {
        selected = selected.filter((s) => s !== name);
      } else {
        selected = [...selected, name];
      }
    };

    // Add ECG
    toggle('12-Lead Electrocardiogram (ECG)');
    expect(selected).toEqual(['General Consultation', '12-Lead Electrocardiogram (ECG)']);

    // Add Nebulization
    toggle('Nebulization Therapy');
    expect(selected).toEqual([
      'General Consultation',
      '12-Lead Electrocardiogram (ECG)',
      'Nebulization Therapy',
    ]);

    // Serialization for backend storage
    const serialized = selected.join(', ');
    expect(serialized).toBe('General Consultation, 12-Lead Electrocardiogram (ECG), Nebulization Therapy');

    // Deselect ECG
    toggle('12-Lead Electrocardiogram (ECG)');
    expect(selected).toEqual(['General Consultation', 'Nebulization Therapy']);
  });
});
