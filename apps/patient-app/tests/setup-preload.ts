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

mock.module('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (obj: Record<string, unknown>) => obj?.web ?? obj?.default,
  },
  StyleSheet: {
    create: <T>(styles: T): T => styles,
    flatten: <T>(styles: T): T => styles,
  },
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove: () => {} }),
  },
  DeviceEventEmitter: {
    emit: () => {},
    addListener: () => ({ remove: () => {} }),
  },
  TurboModuleRegistry: {
    get: () => null,
    getEnforcing: () => ({}),
  },
  Dimensions: {
    get: () => ({ width: 1280, height: 800, scale: 1, fontScale: 1 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800, scale: 1, fontScale: 1 }),
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
}));

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
