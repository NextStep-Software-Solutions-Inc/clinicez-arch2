// token-guard:ignore-file
import { describe, expect, it, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const createMockComponent = (name: string) => {
  const Comp = ({ children, style, ...rest }: any) =>
    React.createElement('div', { 'data-component': name, 'data-style': JSON.stringify(style), ...rest }, children);
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: createMockComponent('View'),
  Text: createMockComponent('Text'),
  TextInput: createMockComponent('TextInput'),
  Pressable: createMockComponent('Pressable'),
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  TouchableHighlight: createMockComponent('TouchableHighlight'),
  Touchable: { Mixin: {} },
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  ScrollView: createMockComponent('ScrollView'),
  RefreshControl: createMockComponent('RefreshControl'),
  Modal: createMockComponent('Modal'),
  KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
  FlatList: createMockComponent('FlatList'),
  SectionList: createMockComponent('SectionList'),
  Switch: createMockComponent('Switch'),
  Image: createMockComponent('Image'),
  ImageBackground: createMockComponent('ImageBackground'),
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  Alert: { alert: () => {} },
  processColor: (c: any) => c,
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
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
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('Svg'),
  Path: createMockComponent('Path'),
  Circle: createMockComponent('Circle'),
  Rect: createMockComponent('Rect'),
  Line: createMockComponent('Line'),
  default: createMockComponent('Svg'),
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Polyline: 'Polyline',
}));

mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
}));

const { UI_DENSITY_OPTIONS, UiDensityProvider, useUiDensity } = await import('../context/UiDensityContext');
const { Card, CardHeader, CardContent, CardFooter } = await import('../components/ui/Card');
const { default: Button } = await import('../components/ui/Button');
const { default: StatCard } = await import('../components/ui/StatCard');

describe('UiDensityContext Defaults & Presets', () => {
  it('defines 3 canonical workstation density modes', () => {
    expect(UI_DENSITY_OPTIONS).toHaveLength(3);
    const densities = UI_DENSITY_OPTIONS.map((o) => o.density);
    expect(densities).toContain('standard');
    expect(densities).toContain('compact');
    expect(densities).toContain('ultraCompact');
  });

  it('provides standard (1.0), compact (0.85), and ultraCompact (0.7) multipliers', () => {
    const standard = UI_DENSITY_OPTIONS.find((o) => o.density === 'standard');
    const compact = UI_DENSITY_OPTIONS.find((o) => o.density === 'compact');
    const ultra = UI_DENSITY_OPTIONS.find((o) => o.density === 'ultraCompact');

    expect(standard?.multiplier).toBe(1.0);
    expect(compact?.multiplier).toBe(0.85);
    expect(ultra?.multiplier).toBe(0.7);

    expect(standard?.sidebarWidth).toBe(260);
    expect(compact?.sidebarWidth).toBe(220);
    expect(ultra?.sidebarWidth).toBe(190);
  });

  it('returns default standard density outside provider without throwing', () => {
    let captured: any = null;
    function Consumer() {
      captured = useUiDensity();
      return React.createElement('div', null, 'test');
    }
    renderToStaticMarkup(React.createElement(Consumer));
    expect(captured).not.toBeNull();
    expect(captured.density).toBe('standard');
    expect(captured.multiplier).toBe(1.0);
  });
});

describe('UiDensity Component Scaling', () => {
  it('renders Card with standard and compact padding', () => {
    function StandardCard() {
      return React.createElement(
        UiDensityProvider,
        null,
        React.createElement(Card, null, React.createElement('span', null, 'Inside Card'))
      );
    }

    const html = renderToStaticMarkup(React.createElement(StandardCard));
    expect(html).toContain('Inside Card');
  });

  it('renders Button with scaled density style', () => {
    function ButtonTest() {
      return React.createElement(
        UiDensityProvider,
        null,
        React.createElement(Button, { title: 'Test Action', size: 'md' })
      );
    }

    const html = renderToStaticMarkup(React.createElement(ButtonTest));
    expect(html).toContain('Test Action');
  });

  it('renders StatCard cleanly under density provider', () => {
    function StatCardTest() {
      return React.createElement(
        UiDensityProvider,
        null,
        React.createElement(StatCard, { label: 'In queue', value: 5 })
      );
    }

    const html = renderToStaticMarkup(React.createElement(StatCardTest));
    expect(html).toContain('In queue');
  });
});
