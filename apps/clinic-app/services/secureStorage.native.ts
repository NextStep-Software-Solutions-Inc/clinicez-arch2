/**
 * Secret storage for session credentials on native builds: iOS Keychain / Android Keystore via expo-secure-store.
 * Values survive app restarts and are only readable while the device has been unlocked once after boot.
 */
import * as SecureStore from 'expo-secure-store';

// SecureStore keys may only contain alphanumerics, ".", "-" and "_".
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

export async function getSecureItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(safeKey(key));
  } catch {
    return null;
  }
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(safeKey(key), value, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function deleteSecureItem(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(safeKey(key));
  } catch {
    // already absent
  }
}
