import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import { deleteSecureItem, getSecureItem, setSecureItem } from './secureStorage';
import { MAX_PIN_ATTEMPTS, constantTimeEqual, derivePinHash, isValidPin } from './pinCrypto';
import { discardLocalSession } from './authSession';

/**
 * Offline unlock for phones/tablets: a PIN (and optionally biometrics) that guards the cached session when the
 * clinic server cannot be reached. It only opens the app in offline mode (queue + cached reads); anything that needs
 * the server still requires the server to accept the session once the device is back online.
 *
 * The PIN is never stored: only a salted, iterated hash in the Keychain/Keystore. Too many wrong attempts wipe the
 * cached session so the staff member must sign in with their password.
 */
const SALT_KEY = 'clinicez.unlock.salt';
const HASH_KEY = 'clinicez.unlock.hash';
const ATTEMPTS_KEY = 'clinicez.unlock.attempts';
const BIOMETRIC_KEY = 'clinicez.unlock.biometric';

export interface PinCheckResult {
  ok: boolean;
  attemptsLeft: number;
  lockedOut: boolean;
}

export const offlineUnlockSupported = true;

const digest = (input: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);

export async function isUnlockConfigured(): Promise<boolean> {
  const salt = await getSecureItem(SALT_KEY);
  if (!salt) return false;
  const hash = await getSecureItem(HASH_KEY);
  return !!hash;
}

export async function biometricAvailable(): Promise<boolean> {
  try {
    const [hardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hardware && enrolled;
  } catch {
    return false;
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  return (await getSecureItem(BIOMETRIC_KEY)) === '1';
}

export async function setPin(pin: string, enableBiometric: boolean): Promise<void> {
  if (!isValidPin(pin)) throw new Error('The PIN must be exactly 6 digits.');
  const salt = Crypto.randomUUID();
  const hash = await derivePinHash(pin, salt, digest);
  const hasBio = enableBiometric && (await biometricAvailable());
  await setSecureItem(SALT_KEY, salt);
  await setSecureItem(HASH_KEY, hash);
  await setSecureItem(ATTEMPTS_KEY, '0');
  await setSecureItem(BIOMETRIC_KEY, hasBio ? '1' : '0');
}

export async function verifyPin(pin: string): Promise<PinCheckResult> {
  const salt = await getSecureItem(SALT_KEY);
  const expected = await getSecureItem(HASH_KEY);
  const attemptsRaw = await getSecureItem(ATTEMPTS_KEY);
  if (!salt || !expected) return { ok: false, attemptsLeft: 0, lockedOut: true };

  const attempts = Number(attemptsRaw) || 0;
  if (attempts >= MAX_PIN_ATTEMPTS) {
    await wipeOfflineAccess();
    return { ok: false, attemptsLeft: 0, lockedOut: true };
  }

  const actual = await derivePinHash(pin, salt, digest);
  if (constantTimeEqual(actual, expected)) {
    await setSecureItem(ATTEMPTS_KEY, '0');
    return { ok: true, attemptsLeft: MAX_PIN_ATTEMPTS, lockedOut: false };
  }

  const next = attempts + 1;
  await setSecureItem(ATTEMPTS_KEY, String(next));
  if (next >= MAX_PIN_ATTEMPTS) {
    await wipeOfflineAccess();
    return { ok: false, attemptsLeft: 0, lockedOut: true };
  }
  return { ok: false, attemptsLeft: MAX_PIN_ATTEMPTS - next, lockedOut: false };
}

export async function authenticateBiometric(): Promise<boolean> {
  if (!(await isBiometricEnabled()) || !(await biometricAvailable())) return false;
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Clinic EZ',
      cancelLabel: 'Use PIN',
      disableDeviceFallback: true,
    });
    return result.success;
  } catch {
    return false;
  }
}

export async function clearUnlock(): Promise<void> {
  await deleteSecureItem(SALT_KEY);
  await deleteSecureItem(HASH_KEY);
  await deleteSecureItem(ATTEMPTS_KEY);
  await deleteSecureItem(BIOMETRIC_KEY);
}

async function wipeOfflineAccess(): Promise<void> {
  await clearUnlock();
  await discardLocalSession();
}
