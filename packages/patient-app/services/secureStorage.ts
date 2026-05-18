import * as SecureStore from "expo-secure-store";

/**
 * All SecureStore keys in one place — never use raw strings elsewhere.
 */
export enum StorageKey {
	ONBOARDED = "ONBOARDED",
	PIN_HASH = "PIN_HASH",
	PIN_SALT = "PIN_SALT",
	PIN_ATTEMPTS = "PIN_ATTEMPTS",
	LOCKOUT_UNTIL = "LOCKOUT_UNTIL",
	BIOMETRICS_ENABLED = "BIOMETRICS_ENABLED",
	USER_IDENTITY = "USER_IDENTITY",
	LAST_SYNC_AT = "LAST_SYNC_AT",
	AUTH_TOKEN = "AUTH_TOKEN",
	REFRESH_TOKEN = "REFRESH_TOKEN",
	DEBUG_ALWAYS_ONBOARD = "DEBUG_ALWAYS_ONBOARD",
}

export async function secureGet(key: StorageKey): Promise<string | null> {
	try {
		return await SecureStore.getItemAsync(key);
	} catch (err) {
		// Logged by caller or auditLogger to avoid circular import
		console.error(`[SecureStorage] Failed to read key ${key}:`, err);
		return null;
	}
}

export async function secureSet(key: StorageKey, value: string): Promise<void> {
	try {
		await SecureStore.setItemAsync(key, value);
	} catch (err) {
		console.error(`[SecureStorage] Failed to write key ${key}:`, err);
		throw err;
	}
}

export async function secureDel(key: StorageKey): Promise<void> {
	try {
		await SecureStore.deleteItemAsync(key);
	} catch (err) {
		console.error(`[SecureStorage] Failed to delete key ${key}:`, err);
	}
}
