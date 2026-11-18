/**
 * Secret storage for session credentials on native builds: iOS Keychain / Android Keystore via expo-secure-store.
 * Values survive app restarts and are only readable while the device has been unlocked once after boot.
 */
import * as SecureStore from 'expo-secure-store';

const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

let opQueue: Promise<any> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const next = opQueue.then(task, task);
  opQueue = next.catch(() => {});
  return next;
}

export function getSecureItem(key: string): Promise<string | null> {
  return enqueue(async () => {
    try {
      return await SecureStore.getItemAsync(safeKey(key));
    } catch {
      return null;
    }
  });
}

export function setSecureItem(key: string, value: string): Promise<void> {
  return enqueue(async () => {
    try {
      await SecureStore.setItemAsync(safeKey(key), value, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
    } catch (err) {
      console.warn(`[pharmacy secureStorage] Failed to set item for key "${key}":`, err);
    }
  });
}

export function deleteSecureItem(key: string): Promise<void> {
  return enqueue(async () => {
    try {
      await SecureStore.deleteItemAsync(safeKey(key));
    } catch {
      // already absent
    }
  });
}
