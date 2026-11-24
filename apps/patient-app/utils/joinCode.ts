import { publicRoutes } from '@shared/safe';
import { GATED_CATALOG_STRINGS } from '../constants/gatedCatalogStrings';

export const MAX_JOIN_CODE_LENGTH = 50;

/**
 * Sanitizes live join-code input while preserving hyphenated clinic prefixes (e.g. 45F9-LF9ZS5LT).
 */
export function sanitizeClinicJoinCodeInput(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, MAX_JOIN_CODE_LENGTH);
}

/**
 * Normalizes a clinic join code using the canonical PublicRoutes contract.
 */
export function normalizeClinicJoinCode(raw: string): string {
  return publicRoutes.normalizeJoinCode(raw);
}

/**
 * Validates a clinic join code against the shared canonical format:
 * - Unprefixed: 3 to 50 alphanumeric characters (e.g. VIP888, APEX2026)
 * - Facility-prefixed: 4-character alphanumeric prefix + hyphen + 1 to 45 alphanumeric chars (e.g. 45F9-LF9ZS5LT)
 */
export function validateClinicJoinCode(raw: string): {
  isValid: boolean;
  normalizedCode: string;
  error: string | null;
} {
  const normalizedCode = publicRoutes.normalizeJoinCode(raw);
  if (!normalizedCode) {
    return {
      isValid: false,
      normalizedCode: '',
      error: 'Please enter a join code.',
    };
  }

  if (!publicRoutes.isValidJoinCode(normalizedCode)) {
    return {
      isValid: false,
      normalizedCode,
      error: GATED_CATALOG_STRINGS.modal.lengthError,
    };
  }

  return {
    isValid: true,
    normalizedCode,
    error: null,
  };
}
