// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let mockStorage = new Map<string, string>();
mock.module('../utils/deviceStorage', () => ({
  getDeviceItem: (key: string) => mockStorage.get(key) ?? null,
  setDeviceItem: (key: string, value: string | null) => {
    if (value === null) mockStorage.delete(key);
    else mockStorage.set(key, value);
  },
}));

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, onPress }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
      placeholder,
      children
    );
  Comp.displayName = name;
  return Comp;
};

let mockWindowWidth = 1280;
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
  Image: createMockComponent('Image'),
  Dimensions: {
    get: () => ({ width: mockWindowWidth, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: mockWindowWidth, height: 800 }),
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
  },
}));

const {
  SidebarProvider,
  useSidebar,
  SIDEBAR_MODE_STORAGE_KEY,
} = await import('../context/SidebarContext');

function TestConsumer({ onRender }: { onRender: (ctx: ReturnType<typeof useSidebar>) => void }) {
  const ctx = useSidebar();
  onRender(ctx);
  return React.createElement('div', { 'data-mode': ctx.mode }, ctx.mode);
}

describe('SidebarContext & SidebarProvider', () => {
  beforeEach(() => {
    mockStorage.clear();
    mockWindowWidth = 1280;
  });

  test('provides safe default context when rendered outside provider', () => {
    let captured: any = null;
    renderToStaticMarkup(
      React.createElement(TestConsumer, {
        onRender: (ctx) => {
          captured = ctx;
        },
      })
    );

    expect(captured).not.toBeNull();
    expect(captured.mode).toBe('open');
    expect(captured.isOpen).toBe(true);
    expect(captured.isIcon).toBe(false);
    expect(captured.isClosed).toBe(false);
  });

  test('defaults to open mode on desktop viewports (>=1024px)', () => {
    mockWindowWidth = 1280;
    let captured: any = null;

    renderToStaticMarkup(
      React.createElement(
        SidebarProvider,
        null,
        React.createElement(TestConsumer, {
          onRender: (ctx) => {
            captured = ctx;
          },
        })
      )
    );

    expect(captured.mode).toBe('open');
    expect(captured.isOpen).toBe(true);
  });

  test('defaults to icon mode on tablet viewports (<1024px)', () => {
    mockWindowWidth = 800;
    let captured: any = null;

    renderToStaticMarkup(
      React.createElement(
        SidebarProvider,
        null,
        React.createElement(TestConsumer, {
          onRender: (ctx) => {
            captured = ctx;
          },
        })
      )
    );

    expect(captured.mode).toBe('icon');
    expect(captured.isIcon).toBe(true);
  });

  test('reads and honors saved preference from deviceStorage', () => {
    mockStorage.set(SIDEBAR_MODE_STORAGE_KEY, 'icon');
    mockWindowWidth = 1280;
    let captured: any = null;

    renderToStaticMarkup(
      React.createElement(
        SidebarProvider,
        null,
        React.createElement(TestConsumer, {
          onRender: (ctx) => {
            captured = ctx;
          },
        })
      )
    );

    expect(captured.mode).toBe('icon');
    expect(captured.isIcon).toBe(true);
    expect(captured.isOpen).toBe(false);
  });

  test('setMode updates state and persists to storage', () => {
    let captured: any = null;

    renderToStaticMarkup(
      React.createElement(
        SidebarProvider,
        null,
        React.createElement(TestConsumer, {
          onRender: (ctx) => {
            captured = ctx;
          },
        })
      )
    );

    captured.setMode('icon');
    expect(mockStorage.get(SIDEBAR_MODE_STORAGE_KEY)).toBe('icon');

    captured.setMode('open');
    expect(mockStorage.get(SIDEBAR_MODE_STORAGE_KEY)).toBe('open');
  });

  test('cycleMode transitions open -> icon -> open (binary toggle)', () => {
    let captured: any = null;

    const render = () => {
      renderToStaticMarkup(
        React.createElement(
          SidebarProvider,
          null,
          React.createElement(TestConsumer, {
            onRender: (ctx) => {
              captured = ctx;
            },
          })
        )
      );
    };

    render();
    expect(captured.mode).toBe('open');

    // Cycle 1: open -> icon
    captured.cycleMode();
    expect(mockStorage.get(SIDEBAR_MODE_STORAGE_KEY)).toBe('icon');

    render();
    expect(captured.mode).toBe('icon');

    // Cycle 2: icon -> open
    captured.cycleMode();
    expect(mockStorage.get(SIDEBAR_MODE_STORAGE_KEY)).toBe('open');

    render();
    expect(captured.mode).toBe('open');
  });
});
