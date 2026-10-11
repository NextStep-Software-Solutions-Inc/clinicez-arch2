import { describe, expect, test } from 'bun:test';
import { normalizeClaimToken } from '../utils/claimToken';

describe('normalizeClaimToken', () => {
  test('returns the code unchanged when it is clean', () => {
    expect(normalizeClaimToken('abc.DEF-123_xyz')).toBe('abc.DEF-123_xyz');
  });

  test('trims surrounding whitespace', () => {
    expect(normalizeClaimToken('  abc123  ')).toBe('abc123');
  });

  test('drops the Enter/Tab a keyboard-wedge scanner appends', () => {
    expect(normalizeClaimToken('abc123\r\n')).toBe('abc123');
    expect(normalizeClaimToken('abc123\t')).toBe('abc123');
  });

  test('returns null when nothing is left', () => {
    expect(normalizeClaimToken('')).toBeNull();
    expect(normalizeClaimToken('  \r\n ')).toBeNull();
    expect(normalizeClaimToken(null)).toBeNull();
    expect(normalizeClaimToken(undefined)).toBeNull();
  });
});
