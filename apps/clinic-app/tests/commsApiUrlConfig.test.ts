// token-guard:ignore-file
import { describe, expect, test, afterEach, mock } from 'bun:test';
import React from 'react';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, ...props }: any) => React.createElement('div', { 'data-component': name, ...props }, children);
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: {
    create: (s: any) => s,
    flatten: (s: any) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s || {}),
  },
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
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  processColor: (c: any) => c,
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
    },
    timing: () => ({ start: (cb?: any) => cb?.() }),
    spring: () => ({ start: (cb?: any) => cb?.() }),
    View: createMockComponent('Animated.View'),
  },
}));

mock.module('react-native-svg', () => ({
  default: createMockComponent('Svg'),
  Svg: createMockComponent('Svg'),
  Path: createMockComponent('Path'),
  Circle: createMockComponent('Circle'),
  Rect: createMockComponent('Rect'),
  G: createMockComponent('G'),
}));

mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: mock(async () => null),
    setItem: mock(async () => {}),
    removeItem: mock(async () => {}),
  },
}));

mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));

mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

describe('Comms API URL Configuration Invariants', () => {
  const originalEnv = process.env.EXPO_PUBLIC_COMMS_API_URL;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.EXPO_PUBLIC_COMMS_API_URL = originalEnv;
    } else {
      delete process.env.EXPO_PUBLIC_COMMS_API_URL;
    }
  });

  test('accepts whatever valid URL is passed in environment variables without any assumptions or manipulations', async () => {
    process.env.EXPO_PUBLIC_COMMS_API_URL = 'https://custom-messaging.infra.company.internal:9443/api/v1/';
    const { getCommsApiBaseUrl } = await import('../context/ClinicCommsContext');
    const resolved = getCommsApiBaseUrl();
    // Only trailing slash normalized, no domain/subdomain guessing or string swapping
    expect(resolved).toBe('https://custom-messaging.infra.company.internal:9443/api/v1');
  });

  test('throws an explicit error when EXPO_PUBLIC_COMMS_API_URL is missing', async () => {
    delete process.env.EXPO_PUBLIC_COMMS_API_URL;
    const { getCommsApiBaseUrl } = await import('../context/ClinicCommsContext');
    expect(() => getCommsApiBaseUrl()).toThrow(
      'EXPO_PUBLIC_COMMS_API_URL is required and must be configured in environment variables or runtime settings.'
    );
  });
});
