// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const capturedPressables: any[] = [];

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, onPress, testID, disabled, accessibilityState, style, ...rest }: any) => {
    if (name === 'Pressable') {
      capturedPressables.push({ onPress, disabled, accessibilityState, style, accessibilityLabel, ...rest });
    }
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(testID ? { 'data-testid': testID } : {}),
        ...(disabled !== undefined ? { 'data-disabled': String(disabled) } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
      },
      placeholder,
      typeof children === 'function' ? children({ pressed: false, hovered: false }) : children
    );
  };
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

mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));

mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
}));

describe('SegmentedControl Disabled State & Keyboard Accessibility', () => {
  test('SegmentedControl applies disabled attribute and accessibilityState.disabled when disabled is true', async () => {
    capturedPressables.length = 0;
    const SegmentedControl = (await import('../components/ui/SegmentedControl')).default;

    let selectedValue = '24h';
    const markup = renderToStaticMarkup(
      React.createElement(SegmentedControl, {
        options: [
          { value: '24h', label: '24 Hours' },
          { value: '7d', label: '7 Days' },
          { value: 'never', label: 'Never' },
        ],
        value: selectedValue,
        onChange: (val: string) => {
          selectedValue = val;
        },
        disabled: true,
      })
    );

    expect(capturedPressables.length).toBe(3);
    for (const pressable of capturedPressables) {
      expect(pressable.disabled).toBe(true);
      expect(pressable.accessibilityState.disabled).toBe(true);
    }
    expect(markup).toContain('data-disabled="true"');
    expect(markup).toContain('&quot;disabled&quot;:true');
  });

  test('SegmentedControl suppresses onChange invocations when disabled', async () => {
    capturedPressables.length = 0;
    const SegmentedControl = (await import('../components/ui/SegmentedControl')).default;

    let callCount = 0;
    renderToStaticMarkup(
      React.createElement(SegmentedControl, {
        options: [
          { value: '24h', label: '24 Hours' },
          { value: '7d', label: '7 Days' },
          { value: 'never', label: 'Never' },
        ],
        value: 'never',
        onChange: () => {
          callCount++;
        },
        disabled: true,
      })
    );

    expect(capturedPressables.length).toBe(3);
    // Simulate user attempting to click or trigger the pressable
    capturedPressables[0].onPress();
    capturedPressables[1].onPress();
    expect(callCount).toBe(0);
  });

  test('SegmentedControl invokes onChange when enabled', async () => {
    capturedPressables.length = 0;
    const SegmentedControl = (await import('../components/ui/SegmentedControl')).default;

    let chosen = '24h';
    renderToStaticMarkup(
      React.createElement(SegmentedControl, {
        options: [
          { value: '24h', label: '24 Hours' },
          { value: '7d', label: '7 Days' },
          { value: 'never', label: 'Never' },
        ],
        value: chosen,
        onChange: (v: string) => {
          chosen = v;
        },
        disabled: false,
      })
    );

    expect(capturedPressables.length).toBe(3);
    expect(capturedPressables[1].disabled).toBe(false);
    expect(capturedPressables[1].accessibilityState.disabled).toBe(false);

    capturedPressables[1].onPress();
    expect(chosen).toBe('7d');
  });

  test('SegmentedControl applies segmentDisabled styles with reduced opacity when disabled', async () => {
    capturedPressables.length = 0;
    const SegmentedControl = (await import('../components/ui/SegmentedControl')).default;

    renderToStaticMarkup(
      React.createElement(SegmentedControl, {
        options: [{ value: '24h', label: '24 Hours' }],
        value: '24h',
        onChange: () => {},
        disabled: true,
      })
    );

    const styleFn = capturedPressables[0].style;
    const computedStyles = styleFn({ pressed: false, hovered: false });
    const disabledStyle = computedStyles.find((s: any) => s && s.opacity === 0.5);
    expect(disabledStyle).toBeDefined();
    expect(disabledStyle.opacity).toBe(0.5);
    expect(disabledStyle.cursor).toBe('not-allowed');
  });
});
