import { describe, expect, test } from 'bun:test';
import { MAX_PIN_ATTEMPTS, PIN_LENGTH, constantTimeEqual, derivePinHash, isValidPin, isWeakPin } from '../services/pinCrypto';
import { isValidEmail, validatePasswordPolicy } from '../services/passwordPolicy';

// Deterministic stand-in for expo-crypto's digest: enough to verify salting/iteration behaviour.
const fakeDigest = async (input: string) => {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(16)}`;
};

describe('PIN rules', () => {
  test('accepts only fixed-length digit strings', () => {
    expect(isValidPin('135790')).toBe(true);
    expect(isValidPin('12345')).toBe(false);
    expect(isValidPin('1234567')).toBe(false);
    expect(isValidPin('12a456')).toBe(false);
    expect(PIN_LENGTH).toBe(6);
    expect(MAX_PIN_ATTEMPTS).toBe(5);
  });

  test('refuses repeated and sequential PINs', () => {
    expect(isWeakPin('000000')).toBe(true);
    expect(isWeakPin('111111')).toBe(true);
    expect(isWeakPin('123456')).toBe(true);
    expect(isWeakPin('654321')).toBe(true);
    expect(isWeakPin('abc')).toBe(true);
    expect(isWeakPin('135790')).toBe(false);
  });
});

describe('derivePinHash', () => {
  test('is deterministic for the same pin and salt', async () => {
    const a = await derivePinHash('135790', 'salt-a', fakeDigest, 5);
    const b = await derivePinHash('135790', 'salt-a', fakeDigest, 5);
    expect(a).toBe(b);
  });

  test('differs by salt and by pin', async () => {
    const base = await derivePinHash('135790', 'salt-a', fakeDigest, 5);
    expect(await derivePinHash('135790', 'salt-b', fakeDigest, 5)).not.toBe(base);
    expect(await derivePinHash('135791', 'salt-a', fakeDigest, 5)).not.toBe(base);
  });

  test('runs the requested number of rounds', async () => {
    let calls = 0;
    await derivePinHash('135790', 's', async (v) => {
      calls += 1;
      return fakeDigest(v);
    }, 7);
    expect(calls).toBe(7);
  });
});

describe('constantTimeEqual', () => {
  test('compares by value', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('password policy', () => {
  test('accepts a strong password', () => {
    expect(validatePasswordPolicy('Clinic2026ok')).toEqual([]);
  });

  test('reports every violated rule', () => {
    expect(validatePasswordPolicy('short1')).toEqual(['Use at least 10 characters.']);
    expect(validatePasswordPolicy('1234567890')).toEqual(['Include at least one letter.']);
    expect(validatePasswordPolicy('abcdefghijk')).toEqual(['Include at least one number.']);
    expect(validatePasswordPolicy('')).toHaveLength(3);
  });

  test('honours a configured minimum length', () => {
    expect(validatePasswordPolicy('abc12345', 8)).toEqual([]);
  });

  test('validates emails loosely', () => {
    expect(isValidEmail('owner@clinic.example')).toBe(true);
    expect(isValidEmail('  owner@clinic.example ')).toBe(true);
    expect(isValidEmail('owner@clinic')).toBe(false);
    expect(isValidEmail('no spaces@x.io')).toBe(false);
  });
});
