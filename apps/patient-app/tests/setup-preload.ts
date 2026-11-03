import { mock } from 'bun:test';

/**
 * Global Bun test preload for patient-app.
 *
 * Ensures React Native Flow entrypoints (`react-native/index.js`) and native
 * Expo/SQLite bindings are stubbed BEFORE any test file executes CJS `require(...)`
 * inside `try/catch` blocks. Without pre-stubbing, Bun 1.3.x caches the failed
 * `SyntaxError: Unexpected typeof` module record when `require('react-native')`
 * or `require('@db/index')` fails inside a `try/catch`, causing subsequent test
 * files that call `mock.module(...)` to throw an unhandled error between tests.
 *
 * Individual test suites remain free to call `mock.module(...)` to override any
 * of these defaults for specific scenarios.
 */
if (typeof (globalThis as Record<string, unknown>).__DEV__ === 'undefined') {
  (globalThis as Record<string, unknown>).__DEV__ = false;
}
if (typeof (global as any).__DEV__ === 'undefined') {
  (global as any).__DEV__ = false;
}

if (typeof (globalThis as any).ErrorUtils === 'undefined') {
  const noopHandler = {
    setGlobalHandler: () => {},
    getGlobalHandler: () => () => {},
    reportFatalError: () => {},
    reportError: () => {},
  };
  (globalThis as any).ErrorUtils = noopHandler;
  (global as any).ErrorUtils = noopHandler;
}

const expoModulesProxy = new Proxy({} as any, {
  get(_target, prop) {
    return {
      name: String(prop),
      addListener: () => {},
      removeListeners: () => {},
    };
  },
});

(globalThis as any).expo = {
  EventEmitter: class {
    addListener() { return { remove: () => {} }; }
    removeListener() {}
    removeAllListeners() {}
    emit() {}
  },
  modules: expoModulesProxy,
};

mock.module('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

export const defaultReactNativeMock = {
  Platform: {
    OS: 'web',
    select: (obj: Record<string, unknown>) => obj?.web ?? obj?.default,
  },
  StyleSheet: {
    create: <T>(styles: T): T => styles,
    flatten: <T>(styles: T): T => (Array.isArray(styles) ? Object.assign({}, ...styles.flat(Infinity).filter(Boolean)) : (styles ?? {})),
  },
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove: () => {} }),
  },
  DeviceEventEmitter: {
    emit: () => {},
    addListener: () => ({ remove: () => {} }),
  },
  NativeEventEmitter: class {
    addListener() { return { remove: () => {} }; }
    removeListener() {}
    removeAllListeners() {}
    emit() {}
  },
  NativeModules: {},
  TurboModuleRegistry: {
    get: () => null,
    getEnforcing: () => ({}),
  },
  Dimensions: {
    get: () => ({ width: 1280, height: 800, scale: 1, fontScale: 1 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800, scale: 1, fontScale: 1 }),
  useColorScheme: () => 'light' as const,
  PixelRatio: { get: () => 1, getFontScale: () => 1, roundToNearestPixel: (n: number) => n },
  Image: 'Image',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  processColor: (c: any) => c,
  Touchable: { Mixin: {} },
  PanResponder: {
    create: () => ({ panHandlers: {} }),
  },
  TouchableOpacity: 'TouchableOpacity',
  TouchableHighlight: 'TouchableHighlight',
  TouchableWithoutFeedback: 'TouchableWithoutFeedback',
  Animated: {
    Value: class {
      constructor(public val: any = 0) {}
      setValue(val: any) { this.val = val; }
      interpolate(config: any) { return this; }
    },
    timing: () => ({ start: (cb?: any) => cb?.() }),
    spring: () => ({ start: (cb?: any) => cb?.() }),
    event: () => () => {},
    View: 'AnimatedView',
    Text: 'AnimatedText',
  },
};

const originalMockModule = (mock as any).module.bind(mock);
(mock as any).module = (moduleName: string, factory: any) => {
  if (moduleName === 'react-native') {
    return originalMockModule(moduleName, () => {
      const custom = typeof factory === 'function' ? factory() : factory;
      return {
        ...defaultReactNativeMock,
        ...custom,
        Platform: {
          ...defaultReactNativeMock.Platform,
          ...(custom?.Platform ?? {}),
        },
      };
    });
  }
  return originalMockModule(moduleName, factory);
};

mock.module('react-native', () => defaultReactNativeMock);

mock.module('react-native-svg', () => {
  const SvgMock = 'SvgMock';
  return {
    default: SvgMock,
    Svg: SvgMock,
    Path: SvgMock,
    Circle: SvgMock,
    Rect: SvgMock,
    G: SvgMock,
    Line: SvgMock,
    Polyline: SvgMock,
    Polygon: SvgMock,
    Text: SvgMock,
    TSpan: SvgMock,
    TextPath: SvgMock,
    Use: SvgMock,
    Image: SvgMock,
    Symbol: SvgMock,
    Defs: SvgMock,
    LinearGradient: SvgMock,
    RadialGradient: SvgMock,
    Stop: SvgMock,
    ClipPath: SvgMock,
    Pattern: SvgMock,
    Mask: SvgMock,
    parse: () => null,
  };
});

for (const path of [
  '@expo-google-fonts/geist/400Regular',
  '@expo-google-fonts/geist/500Medium',
  '@expo-google-fonts/geist/600SemiBold',
  '@expo-google-fonts/geist/700Bold',
  '@expo-google-fonts/geist-mono/400Regular',
  '@expo-google-fonts/geist-mono/500Medium',
  '@expo-google-fonts/geist-mono/600SemiBold',
  '@expo-google-fonts/geist-mono/700Bold',
]) {
  const name = path.split('/').pop()!;
  mock.module(path, () => ({
    [`${path.includes('mono') ? 'GeistMono' : 'Geist'}_${name}`]: 1,
  }));
}

mock.module('expo-sqlite', () => ({
  openDatabaseSync: () => ({}),
}));

mock.module('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
}));

mock.module('drizzle-orm/expo-sqlite', () => ({
  drizzle: () => ({}),
}));

mock.module('@react-native-community/netinfo', () => ({
  default: {
    fetch: async () => ({ isConnected: true, isInternetReachable: true }),
    addEventListener: () => () => {},
  },
  fetch: async () => ({ isConnected: true, isInternetReachable: true }),
}));

mock.module('expo-crypto', () => ({
  getRandomBytes: (n: number) => {
    const bytes = new Uint8Array(n);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  },
  digestStringAsync: async (_algo: string, s: string) => {
    const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  },
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  randomUUID: () => globalThis.crypto.randomUUID(),
}));

export interface MockSecureStore {
  get?(key: string): string | undefined | null;
  set?(key: string, val: string): void;
  delete?(key: string): void | boolean;
  [key: string]: unknown;
}

declare global {
  // eslint-disable-next-line no-var
  var __secureStoreMap: Map<string, string> | undefined;
  // eslint-disable-next-line no-var
  var __customSecureStore: MockSecureStore | undefined;
}

const __defaultSecureStore = new Map<string, string>();
globalThis.__secureStoreMap = __defaultSecureStore;

mock.module('expo-secure-store', () => ({
  getItemAsync: async (key: string) => {
    const store = globalThis.__customSecureStore || __defaultSecureStore;
    if (typeof store.get === 'function') return store.get(key) ?? null;
    const val = (store as Record<string, unknown>)[key];
    return typeof val === 'string' ? val : null;
  },
  setItemAsync: async (key: string, val: string) => {
    const store = globalThis.__customSecureStore || __defaultSecureStore;
    if (typeof store.set === 'function') store.set(key, String(val));
    else (store as Record<string, unknown>)[key] = String(val);
  },
  deleteItemAsync: async (key: string) => {
    const store = globalThis.__customSecureStore || __defaultSecureStore;
    if (typeof store.delete === 'function') store.delete(key);
    else delete (store as Record<string, unknown>)[key];
  },
}));

mock.module('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));
