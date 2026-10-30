import { storage } from '../../utils/storage';

export interface TabPersistenceConfig<T> {
  /** Unique storage key (e.g. 'records.segment', 'appointments.tab', 'notifications.filter') */
  key: string;
  /** Default value if no persisted value exists */
  defaultValue: T;
  /** Optional URL query parameter name for web deep linking & back/forward navigation */
  queryParam?: string;
  /** Optional custom serializer to convert T to string */
  serialize?: (val: T) => string;
  /** Optional custom deserializer to convert string to T */
  deserialize?: (raw: string) => T;
}

export type TabPersistenceOptions<T> = TabPersistenceConfig<T>;

const STORAGE_PREFIX = 'clinicez_tab_';

// Synchronous in-memory store for instant zero-flicker reads & stack navigation retention
const memoryStore = new Map<string, any>();

// Registered configurations for popstate / URL synchronization
const registeredConfigs = new Map<string, TabPersistenceConfig<any>>();

// Subscribers for multi-instance or popstate synchronization
const subscribers = new Map<string, Set<(val: any) => void>>();

const isWeb = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

function defaultSerialize<T>(val: T): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return JSON.stringify(val);
}

function defaultDeserialize<T>(raw: string, defaultValue: T): T {
  if (typeof defaultValue === 'number') {
    const num = Number(raw);
    return (isNaN(num) ? defaultValue : num) as unknown as T;
  }
  if (typeof defaultValue === 'boolean') {
    return (raw === 'true' || raw === '1') as unknown as T;
  }
  if (typeof defaultValue === 'string') {
    return raw as unknown as T;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

/**
 * Initializes and reads the current persisted value synchronously.
 */
export function getPersistedTab<T>(config: TabPersistenceConfig<T>): T {
  const { key, defaultValue, queryParam, deserialize } = config;
  registeredConfigs.set(key, config);

  // 1. Check in-memory store first (active session takes precedence for instant navigation)
  if (memoryStore.has(key)) {
    return memoryStore.get(key) as T;
  }

  // 2. On web, check URL query param first (allows deep links, refresh with query, browser history)
  if (isWeb && queryParam) {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const urlVal = searchParams.get(queryParam);
      if (urlVal !== null) {
        const parsed = deserialize ? deserialize(urlVal) : defaultDeserialize(urlVal, defaultValue);
        memoryStore.set(key, parsed);
        return parsed;
      }
    } catch {
      // Non-fatal
    }
  }

  // 3. Check persistent storage (localStorage on web, or trigger async load for native)
  if (isWeb) {
    try {
      const stored = window.localStorage.getItem(STORAGE_PREFIX + key);
      if (stored !== null) {
        const parsed = deserialize ? deserialize(stored) : defaultDeserialize(stored, defaultValue);
        memoryStore.set(key, parsed);
        return parsed;
      }
    } catch {
      // Non-fatal
    }
  } else {
    // Background hydration for native
    storage
      .getItemAsync(STORAGE_PREFIX + key)
      .then((stored) => {
        if (stored !== null && !memoryStore.has(key)) {
          const parsed = deserialize ? deserialize(stored) : defaultDeserialize(stored, defaultValue);
          memoryStore.set(key, parsed);
          notifySubscribers(key, parsed);
        }
      })
      .catch(() => {});
  }

  // 4. Fallback to defaultValue
  memoryStore.set(key, defaultValue);
  return defaultValue;
}

/**
 * Sets the persisted value and propagates to memory, storage, URL, and subscribers.
 */
export function setPersistedTab<T>(config: TabPersistenceConfig<T>, value: T): void {
  const { key, defaultValue, queryParam, serialize } = config;
  registeredConfigs.set(key, config);

  const currentInMemory = memoryStore.get(key);
  if (currentInMemory === value) {
    return;
  }

  const serialized = serialize ? serialize(value) : defaultSerialize(value);

  // Update in-memory store
  memoryStore.set(key, value);

  // Notify listeners
  notifySubscribers(key, value);

  // Persist to storage
  if (isWeb) {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + key, serialized);

      // Synchronize with URL query parameter on web
      if (queryParam) {
        const url = new URL(window.location.href);
        const currentParamVal = url.searchParams.get(queryParam);
        const defaultSerialized = serialize ? serialize(defaultValue) : defaultSerialize(defaultValue);

        if (serialized === defaultSerialized) {
          if (currentParamVal !== null) {
            url.searchParams.delete(queryParam);
            window.history.replaceState({}, '', url.toString());
          }
        } else if (currentParamVal !== serialized) {
          url.searchParams.set(queryParam, serialized);
          window.history.replaceState({}, '', url.toString());
        }
      }
    } catch {
      // Non-fatal
    }
  } else {
    storage.setItemAsync(STORAGE_PREFIX + key, serialized).catch(() => {});
  }
}

/**
 * Subscribe to external changes for a specific key (popstate, cross-component sync).
 */
export function subscribePersistedTab<T>(key: string, callback: (val: T) => void): () => void {
  if (!subscribers.has(key)) {
    subscribers.set(key, new Set());
  }
  subscribers.get(key)!.add(callback);
  return () => {
    subscribers.get(key)?.delete(callback);
  };
}

function notifySubscribers<T>(key: string, value: T): void {
  const set = subscribers.get(key);
  if (set) {
    set.forEach((cb) => {
      try {
        cb(value);
      } catch (err) {
        console.warn(`[tabPersistence] subscriber error for ${key}:`, err);
      }
    });
  }
}

// Global popstate listener on web to sync back/forward history navigation into active tabs
if (isWeb) {
  window.addEventListener('popstate', () => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      for (const [key, config] of registeredConfigs.entries()) {
        if (!config.queryParam) continue;
        const urlVal = searchParams.get(config.queryParam);
        const nextVal =
          urlVal !== null
            ? config.deserialize
              ? config.deserialize(urlVal)
              : defaultDeserialize(urlVal, config.defaultValue)
            : config.defaultValue;
        const currentVal = memoryStore.get(key);
        if (nextVal !== currentVal) {
          memoryStore.set(key, nextVal);
          notifySubscribers(key, nextVal);
        }
      }
    } catch {
      // Non-fatal
    }
  });
}
