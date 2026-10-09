/**
 * Persistent per-device key/value storage for native builds (iOS / Android), kept in the OS keystore
 * (Keychain / Android Keystore via expo-secure-store) so the saved server address cannot be tampered with by other
 * apps. Reads and writes are synchronous, matching the web implementation in `deviceStorage.ts`.
 */
import * as SecureStore from 'expo-secure-store';

const memory = new Map<string, string>();

// SecureStore keys may only contain alphanumerics, ".", "-" and "_".
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

export function getDeviceItem(key: string): string | null {
  try {
    return SecureStore.getItem(safeKey(key));
  } catch {
    return memory.get(key) ?? null;
  }
}

export function setDeviceItem(key: string, value: string | null) {
  if (value === null) {
    memory.delete(key);
    SecureStore.deleteItemAsync(safeKey(key)).catch(() => undefined);
    return;
  }
  memory.set(key, value);
  try {
    SecureStore.setItem(safeKey(key), value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  } catch {
    // ignore - the in-memory copy still holds it for this session
  }
}
