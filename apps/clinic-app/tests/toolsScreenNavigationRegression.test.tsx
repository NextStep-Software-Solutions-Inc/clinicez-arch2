// token-guard:ignore-file
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import * as ReactJSXRuntime from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';

const localReactEntry = require.resolve('react');
const rootReactDir = path.resolve(__dirname, '../../../node_modules/react');
if (fs.existsSync(rootReactDir) && !localReactEntry.startsWith(rootReactDir)) {
  mock.module(rootReactDir, () => ({ ...React, default: React }));
  mock.module(path.join(rootReactDir, 'jsx-runtime'), () => ReactJSXRuntime);
}

function makeNode(tag: string, nodeType = 1): any {
  const children: any[] = [];
  const listeners = new Map<string, Set<Function>>();
  const attrs: Record<string, any> = {};
  const node: any = {
    nodeType,
    tagName: tag.toUpperCase(),
    nodeName: tag.toUpperCase(),
    style: {},
    dataset: {},
    childNodes: children,
    children,
    parentNode: null,
    ownerDocument: null as any,
    textContent: '',
    innerHTML: '',
    appendChild(child: any) {
      child.parentNode = node;
      children.push(child);
      return child;
    },
    insertBefore(child: any, ref: any) {
      child.parentNode = node;
      const idx = children.indexOf(ref);
      if (idx === -1) children.push(child);
      else children.splice(idx, 0, child);
      return child;
    },
    removeChild(child: any) {
      const idx = children.indexOf(child);
      if (idx !== -1) children.splice(idx, 1);
      child.parentNode = null;
      return child;
    },
    setAttribute(k: string, v: any) {
      attrs[k] = String(v);
    },
    getAttribute(k: string) {
      return attrs[k] ?? null;
    },
    removeAttribute(k: string) {
      delete attrs[k];
    },
    addEventListener(type: string, fn: Function) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: Function) {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent() {
      return true;
    },
    focus() {},
    blur() {},
    contains(other: any) {
      if (other === node) return true;
      return children.some((c) => c.contains?.(other));
    },
  };
  Object.defineProperty(node, 'firstChild', { get: () => children[0] ?? null });
  Object.defineProperty(node, 'lastChild', { get: () => children[children.length - 1] ?? null });
  Object.defineProperty(node, 'nextSibling', {
    get: () => {
      if (!node.parentNode) return null;
      const sibs = node.parentNode.childNodes;
      const idx = sibs.indexOf(node);
      return idx >= 0 ? (sibs[idx + 1] ?? null) : null;
    },
  });
  return node;
}

const fakeDoc: any = makeNode('#document', 9);
fakeDoc.createElement = (tag: string) => {
  const n = makeNode(tag, 1);
  n.ownerDocument = fakeDoc;
  return n;
};
fakeDoc.createElementNS = (_ns: string, tag: string) => {
  const n = makeNode(tag, 1);
  n.ownerDocument = fakeDoc;
  return n;
};
fakeDoc.createTextNode = (txt: string) => {
  const n = makeNode('#text', 3);
  n.nodeValue = txt;
  n.textContent = txt;
  n.ownerDocument = fakeDoc;
  return n;
};
fakeDoc.createComment = (txt: string) => {
  const n = makeNode('#comment', 8);
  n.nodeValue = txt;
  n.ownerDocument = fakeDoc;
  return n;
};
fakeDoc.body = makeNode('body', 1);
fakeDoc.body.ownerDocument = fakeDoc;
fakeDoc.documentElement = makeNode('html', 1);
fakeDoc.documentElement.ownerDocument = fakeDoc;
fakeDoc.head = makeNode('head', 1);
fakeDoc.head.ownerDocument = fakeDoc;
fakeDoc.activeElement = fakeDoc.body;

let currentHref = 'http://localhost:8081/tools';
const storageMap = new Map<string, string>();
const mockStorage = {
  getItem: (k: string) => storageMap.get(k) ?? null,
  setItem: (k: string, v: string) => storageMap.set(k, String(v)),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
  key: () => null,
  length: 0,
};

const fakeWindow: any = {
  document: fakeDoc,
  localStorage: mockStorage,
  sessionStorage: mockStorage,
  location: {
    get href() {
      return currentHref;
    },
    get pathname() {
      return new URL(currentHref).pathname;
    },
    get search() {
      return new URL(currentHref).search;
    },
    get hash() {
      return new URL(currentHref).hash;
    },
    get origin() {
      return new URL(currentHref).origin;
    },
  },
  history: {
    state: null,
    replaceState: (_s: any, _t: string, url: string) => {
      currentHref = new URL(url, currentHref).toString();
    },
    pushState: (_s: any, _t: string, url: string) => {
      currentHref = new URL(url, currentHref).toString();
    },
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  navigator: { userAgent: 'Mozilla/5.0' },
  Node: function () {},
  Element: function () {},
  HTMLElement: function () {},
  HTMLIFrameElement: function () {},
  requestAnimationFrame: (cb: any) => setTimeout(cb, 0),
  cancelAnimationFrame: (id: any) => clearTimeout(id),
};
fakeDoc.defaultView = fakeWindow;

(globalThis as any).window = fakeWindow;
(globalThis as any).document = fakeDoc;
(globalThis as any).location = fakeWindow.location;
(globalThis as any).history = fakeWindow.history;
(globalThis as any).HTMLElement = fakeWindow.HTMLElement;
(globalThis as any).Element = fakeWindow.Element;
(globalThis as any).Node = fakeWindow.Node;
(globalThis as any).localStorage = mockStorage;
(globalThis as any).sessionStorage = mockStorage;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).navigator = fakeWindow.navigator;

const RNComp =
  (name: string) =>
  ({ children, testID, onPress, ...rest }: any) =>
    React.createElement(
      'div',
      {
        'data-rn': name,
        'data-testid': testID,
        'data-accessibility-selected': rest.accessibilityState?.selected,
        onClick: onPress,
      },
      children,
    );

mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (o: any) => o.web ?? o.default },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s, absoluteFillObject: {} },
  View: RNComp('View'),
  Text: RNComp('Text'),
  Pressable: RNComp('Pressable'),
  ScrollView: RNComp('ScrollView'),
  RefreshControl: RNComp('RefreshControl'),
  TextInput: RNComp('TextInput'),
  ActivityIndicator: RNComp('ActivityIndicator'),
  Image: RNComp('Image'),
  Modal: RNComp('Modal'),
  KeyboardAvoidingView: RNComp('KeyboardAvoidingView'),
  FlatList: RNComp('FlatList'),
  SectionList: RNComp('SectionList'),
  Switch: RNComp('Switch'),
  TouchableOpacity: RNComp('TouchableOpacity'),
  TouchableHighlight: RNComp('TouchableHighlight'),
  Alert: { alert: () => {} },
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Easing: {
    linear: (t: number) => t,
    inOut: () => (t: number) => t,
    in: (f: any) => f,
    out: (f: any) => f,
    bezier: () => (t: number) => t,
    ease: (t: number) => t,
  },
  Linking: { openURL: async () => {}, canOpenURL: async () => true },
  I18nManager: { isRTL: false, getConstants: () => ({ isRTL: false }) },
  PixelRatio: { get: () => 2, getFontScale: () => 1, roundToNearestPixel: (n: number) => n },
  BackHandler: { addEventListener: () => ({ remove: () => {} }), exitApp: () => {} },
  NativeEventEmitter: class {
    addListener() {
      return { remove: () => {} };
    }
  },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(v: any) {
        this.val = v;
      }
      interpolate() {
        return this;
      }
    },
    timing: () => ({ start: (cb?: any) => cb && cb({ finished: true }), stop: () => {} }),
    sequence: () => ({ start: (cb?: any) => cb && cb({ finished: true }), stop: () => {} }),
    loop: () => ({ start: (cb?: any) => cb && cb({ finished: true }), stop: () => {} }),
    spring: () => ({ start: (cb?: any) => cb && cb({ finished: true }), stop: () => {} }),
    parallel: () => ({ start: (cb?: any) => cb && cb({ finished: true }), stop: () => {} }),
    createAnimatedComponent: (C: any) => C,
    View: RNComp('Animated.View'),
    Text: RNComp('Animated.Text'),
  },
  useWindowDimensions: () => ({ width: 903, height: 851 }),
  Dimensions: { get: () => ({ width: 903, height: 851 }), addEventListener: () => ({ remove: () => {} }) },
  Appearance: { getColorScheme: () => 'light', addChangeListener: () => ({ remove: () => {} }) },
}));

mock.module('react-native-svg', () => ({
  Svg: RNComp('Svg'),
  Path: RNComp('Path'),
  Circle: RNComp('Circle'),
  Rect: RNComp('Rect'),
  Line: RNComp('Line'),
  G: RNComp('G'),
  default: RNComp('Svg'),
}));

mock.module('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: any) => children,
  SafeAreaView: RNComp('SafeAreaView'),
  SafeAreaInsetsContext: React.createContext({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaFrameContext: React.createContext({ x: 0, y: 0, width: 903, height: 851 }),
  initialWindowMetrics: {
    frame: { x: 0, y: 0, width: 903, height: 851 },
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
  },
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  useSafeAreaFrame: () => ({ x: 0, y: 0, width: 903, height: 851 }),
}));

mock.module('expo-font', () => ({ useFonts: () => [true, null], isLoaded: () => true }));
mock.module('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));
mock.module('../constants/fonts', () => ({ applyFontFamily: (s: any) => s, fontAssets: {} }));
mock.module('@constants/fonts', () => ({ applyFontFamily: (s: any) => s, fontAssets: {} }));
mock.module('@layout', () => ({
  ResponsiveLayout: ({ children }: any) => React.createElement('div', { 'data-layout': true }, children),
}));

const { createBottomTabNavigator } = await import('@react-navigation/bottom-tabs');
const { createStaticNavigation } = await import('@react-navigation/native');
const { default: ToolsScreen } = await import('../navigation/screens/Tools.screen');
const { default: YakapScreen } = await import('../navigation/screens/Yakap.screen');
const { usePersistedTab } = await import('../hooks/usePersistedTab');
const { resolveToolsRouteIntent } = await import('../components/tools/toolsCatalog');

function findByTestId(node: any, testId: string): any {
  if (!node) return null;
  if (node.getAttribute?.('data-testid') === testId) return node;
  for (const child of node.childNodes ?? []) {
    const found = findByTestId(child, testId);
    if (found) return found;
  }
  return null;
}

function triggerClick(el: any) {
  const propsKey = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  const reactProps = propsKey ? el[propsKey] : null;
  expect(typeof reactProps?.onClick).toBe('function');
  reactProps.onClick({
    preventDefault() {},
    stopPropagation() {},
    target: el,
    currentTarget: el,
  });
}

function createToolsNavTree(initialPath = '/tools') {
  currentHref = `http://localhost:8081${initialPath}`;
  const navRef: any = React.createRef();
  const Tab = createBottomTabNavigator({
    implementation: 'custom',
    tabBar: () => null,
    screens: {
      Dashboard: {
        screen: () => React.createElement('div', { 'data-testid': 'dashboard-screen' }, 'Dashboard'),
        linking: { path: 'dashboard' },
      },
      Tools: {
        screen: ToolsScreen,
        linking: {
          path: 'tools',
          alias: ['yakap'],
          parse: { tab: String, tool: String },
        },
      },
    },
  });
  const Nav = createStaticNavigation(Tab);
  return { Nav, navRef };
}

describe('Tools Screen Navigation & React Error #185 Regression Suite', () => {
  beforeEach(() => {
    storageMap.clear();
  });

  afterEach(() => {
    storageMap.clear();
  });

  test('1. Direct navigation to /tools mounts cleanly without Maximum update depth exceeded (#185)', async () => {
    const { Nav } = createToolsNavTree('/tools');
    const container = fakeDoc.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(Nav, {
          linking: { enabled: 'auto', prefixes: ['http://localhost:8081/'] },
        }),
      );
    });

    expect(new URL(currentHref).pathname).toBe('/tools');
    expect(new URL(currentHref).searchParams.get('tab')).toBe('directory');
    expect(new URL(currentHref).searchParams.get('tool')).toBeNull();
    expect(findByTestId(container, 'tools-tab-directory')).toBeTruthy();
    expect(findByTestId(container, 'tool-directory-card-bmi-bsa')).toBeTruthy();

    await act(async () => {
      root.unmount();
    });
  });

  test('2. Navigating from /dashboard to Tools via navigation.navigate("Tools") works without infinite re-renders', async () => {
    const { Nav, navRef } = createToolsNavTree('/dashboard');
    const container = fakeDoc.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(Nav, {
          ref: navRef,
          linking: { enabled: 'auto', prefixes: ['http://localhost:8081/'] },
        }),
      );
    });

    expect(new URL(currentHref).pathname).toBe('/dashboard');

    await act(async () => {
      navRef.current.navigate('Tools');
    });

    expect(new URL(currentHref).pathname).toBe('/tools');
    expect(new URL(currentHref).searchParams.get('tab')).toBe('directory');
    expect(findByTestId(container, 'tool-directory-card-philpen')).toBeTruthy();

    await act(async () => {
      root.unmount();
    });
  });

  test('3. Opening a tool card and switching back to directory clears ?tool= and stays on directory', async () => {
    const { Nav, navRef } = createToolsNavTree('/tools');
    const container = fakeDoc.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(Nav, {
          ref: navRef,
          linking: { enabled: 'auto', prefixes: ['http://localhost:8081/'] },
        }),
      );
    });

    // Click BMI & BSA tool card in directory
    const bmiCard = findByTestId(container, 'tool-directory-card-bmi-bsa');
    expect(bmiCard).toBeTruthy();
    await act(async () => {
      triggerClick(bmiCard);
    });
    expect(new URL(currentHref).searchParams.get('tab')).toBe('calculators');
    expect(new URL(currentHref).searchParams.get('tool')).toBe('bmi-bsa');

    // Click top-level Directory tab button to return to directory
    const directoryTabBtn = findByTestId(container, 'tools-tab-directory');
    expect(directoryTabBtn).toBeTruthy();
    await act(async () => {
      triggerClick(directoryTabBtn);
    });
    expect(new URL(currentHref).searchParams.get('tab')).toBe('directory');
    expect(new URL(currentHref).searchParams.get('tool')).toBeNull();
    expect(findByTestId(container, 'tool-directory-card-bmi-bsa')).toBeTruthy();

    // Also verify via React Navigation deep-link + back to directory
    await act(async () => {
      navRef.current.navigate('Tools', { tool: 'philpen' });
    });
    expect(new URL(currentHref).searchParams.get('tab')).toBe('calculators');
    expect(new URL(currentHref).searchParams.get('tool')).toBe('philpen');

    await act(async () => {
      navRef.current.navigate('Tools', { tab: 'directory' });
    });
    expect(new URL(currentHref).searchParams.get('tab')).toBe('directory');
    expect(new URL(currentHref).searchParams.get('tool')).toBeNull();
    expect(findByTestId(container, 'tool-directory-card-bmi-bsa')).toBeTruthy();

    await act(async () => {
      root.unmount();
    });
  });

  test('4. Deep-linking to /tools?tab=yakap aligns stale stored tool from another category', async () => {
    storageMap.set('clinicez_tools_active_tool', 'bmi-bsa');
    const { Nav } = createToolsNavTree('/tools?tab=yakap');
    const container = fakeDoc.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(Nav, {
          linking: { enabled: 'auto', prefixes: ['http://localhost:8081/'] },
        }),
      );
    });

    expect(new URL(currentHref).searchParams.get('tab')).toBe('yakap');
    expect(new URL(currentHref).searchParams.get('tool')).toBe('pin-checker');

    await act(async () => {
      root.unmount();
    });
  });

  test('5. Legacy /yakap path and YakapScreen compatibility wrapper render without looping', async () => {
    const { Nav, navRef } = createToolsNavTree('/yakap');
    const container = fakeDoc.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(Nav, {
          ref: navRef,
          linking: { enabled: 'auto', prefixes: ['http://localhost:8081/'] },
        }),
      );
    });

    expect(new URL(currentHref).searchParams.get('tab')).toBe('yakap');
    expect(new URL(currentHref).searchParams.get('tool')).toBe('pin-checker');

    await act(async () => {
      navRef.current.navigate('Tools', { tab: 'gamot' });
    });
    expect(new URL(currentHref).searchParams.get('tab')).toBe('yakap');
    expect(new URL(currentHref).searchParams.get('tool')).toBe('gamot');

    await act(async () => {
      root.unmount();
    });

    // Standalone YakapScreen wrapper inside NavigationContainer
    currentHref = 'http://localhost:8081/yakap';
    const YakapTab = createBottomTabNavigator({
      implementation: 'custom',
      tabBar: () => null,
      screens: {
        Yakap: {
          screen: YakapScreen,
          linking: { path: 'yakap', parse: { tab: String, tool: String } },
        },
      },
    });
    const YakapNav = createStaticNavigation(YakapTab);
    const yakapContainer = fakeDoc.createElement('div');
    const yakapRoot = createRoot(yakapContainer);
    await act(async () => {
      yakapRoot.render(
        React.createElement(YakapNav, {
          linking: { enabled: 'auto', prefixes: ['http://localhost:8081/'] },
        }),
      );
    });
    expect(findByTestId(yakapContainer, 'tools-tab-yakap')).toBeTruthy();

    await act(async () => {
      yakapRoot.unmount();
    });
  });

  test('6. usePersistedTab returns a referentially stable setter when inline arrays/objects are passed', async () => {
    currentHref = 'http://localhost:8081/tools';
    const setters: Array<(v: any) => void> = [];

    function Harness({ tick }: { tick: number }) {
      const [val, setVal] = usePersistedTab<'directory' | 'calculators'>({
        storageKey: 'test_stability_tab',
        allowedValues: ['directory', 'calculators'],
        defaultValue: 'directory',
        queryParam: 'tab',
        queryParamAliases: ['section', `alias_${tick}`],
        cleanupParams: ['stale'],
        cleanupParamsByValue: { directory: ['tool'] },
        valueAliases: { dir: 'directory' },
        pathnameMatcher: (p) => p.includes('tools'),
      });
      setters.push(setVal);
      return React.createElement('div', { 'data-val': val });
    }

    const container = fakeDoc.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(Harness, { tick: 1 }));
    });
    await act(async () => {
      root.render(React.createElement(Harness, { tick: 2 }));
    });
    await act(async () => {
      root.render(React.createElement(Harness, { tick: 3 }));
    });

    expect(setters.length).toBeGreaterThanOrEqual(3);
    expect(setters[1]).toBe(setters[0]);
    expect(setters[2]).toBe(setters[0]);

    await act(async () => {
      root.unmount();
    });
  });

  test('7. resolveToolsRouteIntent prevents stale ?tool= from overriding explicit directory or mismatched category tab', () => {
    expect(resolveToolsRouteIntent({ tab: 'directory', tool: 'philpen' })).toEqual({
      tab: 'directory',
    });
    expect(resolveToolsRouteIntent({ tab: 'yakap', tool: 'philpen' })).toEqual({
      tab: 'yakap',
    });
    expect(resolveToolsRouteIntent({ tab: 'calculators', tool: 'philpen' })).toEqual({
      tab: 'calculators',
      tool: 'philpen',
    });
    expect(resolveToolsRouteIntent({ tool: 'philpen' })).toEqual({
      tab: 'calculators',
      tool: 'philpen',
    });
  });
});
