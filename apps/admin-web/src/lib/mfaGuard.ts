/**
 * Returns true if the Admin MFA Gate is active in this environment.
 * Configured via VITE_ADMIN_REQUIRE_MFA (defaults to false for local development).
 */
export function isAdminMfaRequired(): boolean {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_REQUIRE_MFA) {
    const raw = String(import.meta.env.VITE_ADMIN_REQUIRE_MFA).trim().toLowerCase();
    return raw === 'true' || raw === '1' || raw === 'yes';
  }
  return false;
}

export interface MinimalClerkFactor {
  strategy?: string;
  status?: string;
  verified?: boolean;
  [key: string]: unknown;
}

export interface MinimalClerkUser {
  twoFactorEnabled?: boolean;
  totpEnabled?: boolean;
  backupCodeEnabled?: boolean;
  twoFactorFactors?: MinimalClerkFactor[] | unknown[];
}

/**
 * Checks whether a user has enrolled in and verified any two-factor authentication factor.
 * An unverified factor (e.g. started enrollment without code verification) does not qualify.
 */
export function hasVerifiedMfa(user: MinimalClerkUser | null | undefined): boolean {
  if (!user) return false;
  if (user.twoFactorEnabled) return true;
  if (user.totpEnabled) return true;
  if (user.backupCodeEnabled) return true;
  if (Array.isArray(user.twoFactorFactors)) {
    return user.twoFactorFactors.some((factor) => {
      if (!factor || typeof factor !== 'object') return false;
      const f = factor as MinimalClerkFactor;
      if (typeof f.status === 'string') {
        const status = f.status.trim().toLowerCase();
        return status === 'verified' || status === 'active';
      }
      if (typeof f.verified === 'boolean') {
        return f.verified;
      }
      return false;
    });
  }
  return false;
}
