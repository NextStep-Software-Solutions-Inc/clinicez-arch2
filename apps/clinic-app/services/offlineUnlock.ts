/**
 * Offline unlock is a native-only feature (PIN / biometrics guarding a cached session on a phone or tablet).
 * On the web there is nothing to unlock offline, so every capability reports "unavailable".
 */
export interface PinCheckResult {
  ok: boolean;
  attemptsLeft: number;
  /** True once too many wrong PINs were entered; the offline session has been wiped. */
  lockedOut: boolean;
}

export const offlineUnlockSupported = false;

export async function isUnlockConfigured(): Promise<boolean> {
  return false;
}

export async function setPin(_pin: string, _enableBiometric: boolean): Promise<void> {
  throw new Error('Offline unlock is only available in the mobile app.');
}

export async function verifyPin(_pin: string): Promise<PinCheckResult> {
  return { ok: false, attemptsLeft: 0, lockedOut: true };
}

export async function biometricAvailable(): Promise<boolean> {
  return false;
}

export async function isBiometricEnabled(): Promise<boolean> {
  return false;
}

export async function authenticateBiometric(): Promise<boolean> {
  return false;
}

export async function clearUnlock(): Promise<void> {
  // nothing stored on web
}
