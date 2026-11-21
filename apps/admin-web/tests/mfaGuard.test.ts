import { describe, it, expect } from 'bun:test';
import { isAdminMfaRequired, hasVerifiedMfa } from '../src/lib/mfaGuard';

describe('Admin MFA Gate', () => {
  it('defaults to false when VITE_ADMIN_REQUIRE_MFA is unset or false', () => {
    // In test environment, it defaults to false
    const required = isAdminMfaRequired();
    expect(required).toBe(false);
  });

  it('correctly verifies MFA status for users with twoFactorEnabled', () => {
    expect(hasVerifiedMfa({ twoFactorEnabled: true })).toBe(true);
    expect(hasVerifiedMfa({ twoFactorEnabled: false })).toBe(false);
  });

  it('correctly verifies MFA status for users with totpEnabled or backupCodeEnabled', () => {
    expect(hasVerifiedMfa({ totpEnabled: true })).toBe(true);
    expect(hasVerifiedMfa({ backupCodeEnabled: true })).toBe(true);
  });

  it('correctly verifies MFA status for users with twoFactorFactors list', () => {
    expect(hasVerifiedMfa({ twoFactorFactors: [{ strategy: 'totp', status: 'verified' }] })).toBe(true);
    expect(hasVerifiedMfa({ twoFactorFactors: [{ strategy: 'totp', status: 'unverified' }] })).toBe(false);
    expect(hasVerifiedMfa({ twoFactorFactors: [] })).toBe(false);
  });

  it('returns false for null or undefined users', () => {
    expect(hasVerifiedMfa(null)).toBe(false);
    expect(hasVerifiedMfa(undefined)).toBe(false);
    expect(hasVerifiedMfa({})).toBe(false);
  });
});
