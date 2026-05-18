import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import { audit } from "./auditLogger";
import { StorageKey, secureGet, secureSet } from "./secureStorage";

// ---------------------------------------------------------------------------
// PIN auth
// ---------------------------------------------------------------------------

/**
 * Hash a PIN with a random salt using SHA-256.
 * Stores both hash and salt in SecureStore.
 * Never stores the raw PIN.
 */
export async function createPin(pin: string): Promise<void> {
	const saltBytes = await Crypto.getRandomBytesAsync(16);
	const salt = Array.from(new Uint8Array(saltBytes))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	const hash = await Crypto.digestStringAsync(
		Crypto.CryptoDigestAlgorithm.SHA256,
		salt + pin,
	);
	await secureSet(StorageKey.PIN_HASH, hash);
	await secureSet(StorageKey.PIN_SALT, salt);
	audit.info("AUTH", "PIN_CREATED");
}

/**
 * Returns true if the provided PIN matches the stored hash.
 */
export async function verifyPin(
	pin: string,
	attemptNumber: number,
): Promise<boolean> {
	const [storedHash, storedSalt] = await Promise.all([
		secureGet(StorageKey.PIN_HASH),
		secureGet(StorageKey.PIN_SALT),
	]);

	if (!storedHash || !storedSalt) {
		audit.error("SECURITY", "PIN_HASH_MISSING");
		return false;
	}

	const hash = await Crypto.digestStringAsync(
		Crypto.CryptoDigestAlgorithm.SHA256,
		storedSalt + pin,
	);

	const isValid = hash === storedHash;

	if (isValid) {
		audit.info("AUTH", "PIN_VERIFY_SUCCESS");
	} else {
		audit.warn("AUTH", "PIN_VERIFY_FAILED", { attemptNumber });
	}

	return isValid;
}

export async function hasPinSet(): Promise<boolean> {
	const hash = await secureGet(StorageKey.PIN_HASH);
	return hash !== null;
}

// ---------------------------------------------------------------------------
// Biometrics
// ---------------------------------------------------------------------------

export type BiometricAvailability = {
	available: boolean;
	enrolled: boolean;
	type: string | null;
};

export async function checkBiometricsAvailability(): Promise<BiometricAvailability> {
	const [hasHardware, isEnrolled, types] = await Promise.all([
		LocalAuthentication.hasHardwareAsync(),
		LocalAuthentication.isEnrolledAsync(),
		LocalAuthentication.supportedAuthenticationTypesAsync(),
	]);

	const typeLabel = types.includes(
		LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
	)
		? "face"
		: types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
			? "fingerprint"
			: null;

	audit.debug("AUTH", "BIOMETRICS_CHECK", {
		available: hasHardware,
		enrolled: isEnrolled,
		type: typeLabel,
	});

	return { available: hasHardware, enrolled: isEnrolled, type: typeLabel };
}

export async function authenticateWithBiometrics(): Promise<boolean> {
	const result = await LocalAuthentication.authenticateAsync({
		promptMessage: "Verify your identity",
		fallbackLabel: "Use PIN",
		disableDeviceFallback: false,
	});

	if (result.success) {
		audit.info("AUTH", "BIOMETRIC_AUTH_SUCCESS");
	} else {
		audit.warn("AUTH", "BIOMETRIC_AUTH_FAILED", { error: result.error });
	}

	return result.success;
}
