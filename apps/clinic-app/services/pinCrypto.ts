/**
 * PIN hashing helpers for offline unlock. Pure (the digest function is injected) so they can be unit-tested
 * with `bun test` and reused with expo-crypto on device.
 */
export type DigestFn = (input: string) => Promise<string>;

export const PIN_LENGTH = 6;
export const MAX_PIN_ATTEMPTS = 5;
const DEFAULT_ROUNDS = 2000;

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

/** Obvious PINs (000000, 123456, ...) are refused. */
export function isWeakPin(pin: string): boolean {
  if (!isValidPin(pin)) return true;
  if (/^(\d)\1+$/.test(pin)) return true;
  const digits = pin.split('').map(Number);
  const ascending = digits.every((d, i) => i === 0 || d === digits[i - 1] + 1);
  const descending = digits.every((d, i) => i === 0 || d === digits[i - 1] - 1);
  return ascending || descending;
}

/** Iterated, salted digest. Brute force is additionally bounded by {@link MAX_PIN_ATTEMPTS}. */
export async function derivePinHash(pin: string, salt: string, digest: DigestFn, rounds = DEFAULT_ROUNDS): Promise<string> {
  let value = `${salt}:${pin}`;
  for (let i = 0; i < rounds; i += 1) {
    value = await digest(`${value}:${salt}`);
  }
  return value;
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
