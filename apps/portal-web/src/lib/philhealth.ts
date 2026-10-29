/**
 * PhilHealth Identification Number (PIN) validation and formatting per RA 11223.
 * Modulus-11 check digit algorithm using statutory weights [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2].
 */

export const PHILHEALTH_MOD11_WEIGHTS = [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

export function formatPhilHealthPin(input: string): string {
  const digits = (input || "").replace(/\D/g, "").slice(0, 12);
  if (digits.length <= 2) return digits;
  if (digits.length <= 11) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 11)}-${digits.slice(11, 12)}`;
}

export interface PhilHealthValidationResult {
  isValid: boolean;
  isComplete: boolean;
  expectedCheckDigit: number;
  actualCheckDigit: number | null;
  errorMessage?: string;
}

export function validatePhilHealthPinMod11(rawPin: string): PhilHealthValidationResult {
  const digits = (rawPin || "").replace(/\D/g, "");
  if (digits.length === 0) {
    return {
      isValid: false,
      isComplete: false,
      expectedCheckDigit: -1,
      actualCheckDigit: null,
    };
  }
  if (digits.length < 12) {
    return {
      isValid: false,
      isComplete: false,
      expectedCheckDigit: -1,
      actualCheckDigit: null,
      errorMessage: `Incomplete PIN (${digits.length}/12 digits)`,
    };
  }
  if (digits.length > 12) {
    return {
      isValid: false,
      isComplete: false,
      expectedCheckDigit: -1,
      actualCheckDigit: null,
      errorMessage: `PIN must not exceed 12 digits (found ${digits.length})`,
    };
  }

  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += parseInt(digits[i], 10) * PHILHEALTH_MOD11_WEIGHTS[i];
  }

  const rem = sum % 11;
  const expectedCheckDigit = rem === 0 ? 0 : rem === 1 ? 0 : 11 - rem;
  const actualCheckDigit = parseInt(digits[11], 10);
  const isValid = expectedCheckDigit === actualCheckDigit;

  return {
    isValid,
    isComplete: true,
    expectedCheckDigit,
    actualCheckDigit,
    errorMessage: isValid
      ? undefined
      : `Check digit mismatch (expected ${expectedCheckDigit}, got ${actualCheckDigit})`,
  };
}

export type MemberType = "MM" | "DD";
export type PrincipalRelationship = "C" | "S" | "P" | "D";

// Alias for parity
export const validatePhilHealthPin = validatePhilHealthPinMod11;
