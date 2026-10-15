/**
 * Persistent per-device key/value storage for native builds (iOS / Android), backed by SQLite.
 *
 * Synchronous reads/writes keep the same API as the web implementation in `deviceStorage.ts`, so values such as the
 * server URL or the remembered workspace survive app restarts. Never store secrets here - use `secureStorage`.
 */
import Storage from 'expo-sqlite/kv-store';

const memory = new Map<string, string>();

export function getDeviceItem(key: string): string | null {
  if (memory.has(key)) {
    return memory.get(key) ?? null;
  }
  try {
    const val = Storage.getItemSync(key);
    if (val !== null && val !== undefined) {
      memory.set(key, val);
      return val;
    }
  } catch {
    // ignore - fallback to in-memory map
  }
  return memory.get(key) ?? null;
}

export function setDeviceItem(key: string, value: string | null) {
  if (value === null) {
    memory.delete(key);
    try {
      Storage.removeItem(key)?.catch?.(() => {});
    } catch {
      // ignore - nothing persisted to remove
    }
    return;
  }
  memory.set(key, value);
  try {
    Storage.setItem(key, value)?.catch?.(() => {});
  } catch {
    // ignore - the in-memory copy still holds it for this session
  }
}

export const getSessionItem = getDeviceItem;
export const setSessionItem = setDeviceItem;

export function clearDeviceStorage() {
  memory.clear();
  try {
    Storage.clear?.()?.catch?.(() => {});
  } catch {
    // ignore
  }
}

export const clearSessionStorage = clearDeviceStorage;
