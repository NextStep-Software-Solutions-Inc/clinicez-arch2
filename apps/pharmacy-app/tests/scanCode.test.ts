import { describe, expect, it } from 'bun:test';
import { MAX_CLAIM_CODE_LENGTH, normalizeScannedClaimCode } from '../utils/scanCode';

describe('normalizeScannedClaimCode', () => {
  it('returns the code unchanged when the scanner read it cleanly', () => {
    expect(normalizeScannedClaimCode('abc.DEF-123_xyz')).toBe('abc.DEF-123_xyz');
  });

  it('strips the whitespace and line breaks scanners and clipboards add', () => {
    expect(normalizeScannedClaimCode('  abc.def \r\n')).toBe('abc.def');
    expect(normalizeScannedClaimCode('abc\ndef')).toBe('abcdef');
  });

  it('rejects empty, missing and oversized reads so scanning continues', () => {
    expect(normalizeScannedClaimCode('')).toBeNull();
    expect(normalizeScannedClaimCode('   \n')).toBeNull();
    expect(normalizeScannedClaimCode(null)).toBeNull();
    expect(normalizeScannedClaimCode(undefined)).toBeNull();
    expect(normalizeScannedClaimCode('x'.repeat(MAX_CLAIM_CODE_LENGTH + 1))).toBeNull();
  });
});
