/**
 * Persistent per-device key/value storage for native builds (iOS / Android), backed by SQLite.
 *
 * Synchronous reads/writes keep the same API as the web implementation in `deviceStorage.ts`, so the server URL
 * survives app restarts. Never store secrets here.
 */
import Storage from 'expo-sqlite/kv-store';

const memory = new Map<string, string>();

export function getDeviceItem(key: string): string | null {
  try {
    return Storage.getItemSync(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

export function setDeviceItem(key: string, value: string | null) {
  if (value === null) {
    memory.delete(key);
    try {
      Storage.removeItemSync(key);
    } catch {
      // ignore - nothing persisted to remove
    }
    return;
  }
  memory.set(key, value);
  try {
    Storage.setItemSync(key, value);
  } catch {
    // ignore - the in-memory copy still holds it for this session
  }
}
