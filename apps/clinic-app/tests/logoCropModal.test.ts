// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun test environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, onPress, style }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        onClick: onPress,
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
  Image: Object.assign(createMockComponent('Image'), {
    getSize: (_uri: string, success: (w: number, h: number) => void) => success(400, 300),
  }),
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
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
  NativeEventEmitter: class {
    addListener() { return { remove: () => {} }; }
    removeAllListeners() {}
  },
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

const { default: LogoCropModal } = await import('../components/settings/LogoCropModal');

describe('LogoCropModal Component', () => {
  test('returns null when visible is false', () => {
    const markup = renderToStaticMarkup(
      React.createElement(LogoCropModal, {
        visible: false,
        imageUri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        onClose: () => {},
        onConfirm: () => {},
      })
    );
    expect(markup).toBe('');
  });

  test('returns null when imageUri is null', () => {
    const markup = renderToStaticMarkup(
      React.createElement(LogoCropModal, {
        visible: true,
        imageUri: null,
        onClose: () => {},
        onConfirm: () => {},
      })
    );
    expect(markup).toBe('');
  });

  test('renders crop canvas, zoom controls, preset buttons, and live previews when visible with image', () => {
    const markup = renderToStaticMarkup(
      React.createElement(LogoCropModal, {
        visible: true,
        imageUri: 'https://example.com/logo.png',
        onClose: () => {},
        onConfirm: () => {},
      })
    );

    // Modal title & guidance
    expect(markup).toContain('Adjust &amp; Crop Clinic Logo');
    expect(markup).toContain('Drag to reposition');
    expect(markup).toContain('Pinch or scroll to zoom');
    expect(markup).toContain('100%');

    // Preset action buttons
    expect(markup).toContain('Fit (Contain)');
    expect(markup).toContain('Fill (Cover)');
    expect(markup).toContain('Reset');

    // Live preview cards
    expect(markup).toContain('Live Placement Previews');
    expect(markup).toContain('Sidebar (40px)');
    expect(markup).toContain('Settings / Card (64px)');

    // Modal actions
    expect(markup).toContain('Cancel');
    expect(markup).toContain('Apply &amp; Save Logo');
  });

  test('displays pinch-to-zoom helper text to guide touch and trackpad users', () => {
    const markup = renderToStaticMarkup(
      React.createElement(LogoCropModal, {
        visible: true,
        imageUri: 'https://example.com/logo.png',
        onClose: () => {},
        onConfirm: () => {},
      })
    );

    expect(markup).toContain('Pinch or scroll to zoom');
    expect(markup).toContain('Drag to reposition');
  });
});
