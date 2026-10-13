// token-guard:ignore-file
import { describe, expect, test } from 'bun:test';

// Mod-11 weights per PhilHealth statutory specification
export const MOD11_WEIGHTS = [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export interface Mod11ValidationResult {
  isValid: boolean;
  isComplete: boolean;
  digitsCount: number;
  expectedCheckDigit: number;
  actualCheckDigit: number | null;
  errorMessage?: string;
}

export function validatePhilHealthPinMod11(pin: string): Mod11ValidationResult {
  if (!pin) {
    return { isValid: false, isComplete: false, digitsCount: 0, expectedCheckDigit: -1, actualCheckDigit: null, errorMessage: 'PIN is required' };
  }

  const digits = pin.replace(/\D/g, '');
  if (digits.length < 12) {
    return { isValid: false, isComplete: false, digitsCount: digits.length, expectedCheckDigit: -1, actualCheckDigit: null, errorMessage: 'PIN must contain 12 digits' };
  }

  if (digits.length > 12) {
    return { isValid: false, isComplete: false, digitsCount: digits.length, expectedCheckDigit: -1, actualCheckDigit: null, errorMessage: 'PIN cannot exceed 12 digits' };
  }

  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += parseInt(digits[i], 10) * MOD11_WEIGHTS[i];
  }

  const remainder = sum % 11;
  const expectedCheckDigit = remainder === 0 ? 0 : remainder === 1 ? 0 : 11 - remainder;
  const actualCheckDigit = parseInt(digits[11], 10);

  const isValid = expectedCheckDigit === actualCheckDigit;
  return {
    isValid,
    isComplete: true,
    digitsCount: 12,
    expectedCheckDigit,
    actualCheckDigit,
    errorMessage: isValid ? undefined : `Check digit mismatch (expected ${expectedCheckDigit}, got ${actualCheckDigit})`,
  };
}

export function formatPhilHealthPin(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 12);
  if (digits.length <= 2) return digits;
  if (digits.length <= 11) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 11)}-${digits.slice(11)}`;
}

export type MemberType = 'MM' | 'DD';
export type PrincipalRelationship = 'C' | 'S' | 'P' | 'D'; // Child, Spouse, Parent, Disabled Dependent

export interface PatientRegistrationModel {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: 'Male' | 'Female' | 'Other';
  philHealthPin?: string;
  memberType: MemberType;
  principalMemberPin?: string;
  principalFullName?: string;
  principalRelationship?: PrincipalRelationship;
  principalDateOfBirth?: string;
  allergies?: Array<{
    allergen: string;
    category: 'Medication' | 'Food' | 'Environmental';
    severity: 'Mild' | 'Moderate' | 'Severe' | 'LifeThreatening';
    isAnaphylactic: boolean;
  }>;
}

export function validatePatientRegistration(model: PatientRegistrationModel): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!model.firstName?.trim()) errors.firstName = 'First name is required';
  if (!model.lastName?.trim()) errors.lastName = 'Last name is required';
  if (!model.dateOfBirth?.trim()) errors.dateOfBirth = 'Date of birth is required';
  if (!model.sex) errors.sex = 'Sex is required';

  if (model.philHealthPin) {
    const pinCheck = validatePhilHealthPinMod11(model.philHealthPin);
    if (!pinCheck.isValid) {
      errors.philHealthPin = pinCheck.errorMessage || 'Invalid PhilHealth PIN';
    }
  }

  // Dependent (DD) validation: Principal member fields are mandatory when DD
  if (model.memberType === 'DD') {
    if (!model.principalFullName?.trim()) {
      errors.principalFullName = 'Principal member full name is required for dependents';
    }
    if (!model.principalRelationship) {
      errors.principalRelationship = 'Relationship to principal member is required';
    }
    if (model.principalMemberPin) {
      const princCheck = validatePhilHealthPinMod11(model.principalMemberPin);
      if (!princCheck.isValid) {
        errors.principalMemberPin = princCheck.errorMessage || 'Invalid Principal Member PIN';
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

describe('Feature 11 & 18: PhilHealth Member Type (MM vs DD) Architecture', () => {
  test('T1.1: Standard Member (MM) valid registration does not require principal sponsor fields', () => {
    const patient: PatientRegistrationModel = {
      firstName: 'Maria',
      lastName: 'Santos',
      dateOfBirth: '1990-05-15',
      sex: 'Female',
      philHealthPin: '12-345678901-8', // Valid Mod-11
      memberType: 'MM',
    };

    const result = validatePatientRegistration(patient);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });

  test('T1.2: Dependent (DD) valid registration succeeds with principal credentials', () => {
    const patient: PatientRegistrationModel = {
      firstName: 'Junior',
      lastName: 'Santos',
      dateOfBirth: '2018-09-10',
      sex: 'Male',
      philHealthPin: '10-000000000-5',
      memberType: 'DD',
      principalFullName: 'Maria Santos',
      principalRelationship: 'P', // Parent
      principalMemberPin: '12-345678901-8',
      principalDateOfBirth: '1990-05-15',
    };

    const result = validatePatientRegistration(patient);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
  });

  test('T1.3: Dependent (DD) registration fails if principal sponsor name is omitted', () => {
    const patient: PatientRegistrationModel = {
      firstName: 'Junior',
      lastName: 'Santos',
      dateOfBirth: '2018-09-10',
      sex: 'Male',
      memberType: 'DD',
      principalFullName: '',
      principalRelationship: 'P',
    };

    const result = validatePatientRegistration(patient);
    expect(result.isValid).toBe(false);
    expect(result.errors.principalFullName).toContain('Principal member full name is required');
  });

  test('T1.4: Dependent (DD) registration fails if principal relationship is omitted', () => {
    const patient: PatientRegistrationModel = {
      firstName: 'Junior',
      lastName: 'Santos',
      dateOfBirth: '2018-09-10',
      sex: 'Male',
      memberType: 'DD',
      principalFullName: 'Maria Santos',
      principalRelationship: undefined,
    };

    const result = validatePatientRegistration(patient);
    expect(result.isValid).toBe(false);
    expect(result.errors.principalRelationship).toContain('Relationship to principal member is required');
  });

  test('T1.5: Member (MM) ignores any residual principal fields entered if switched back from DD', () => {
    const patient: PatientRegistrationModel = {
      firstName: 'Maria',
      lastName: 'Santos',
      dateOfBirth: '1990-05-15',
      sex: 'Female',
      memberType: 'MM',
      principalFullName: '', // Empty, but should not cause error since memberType is MM
      principalRelationship: undefined,
    };

    const result = validatePatientRegistration(patient);
    expect(result.isValid).toBe(true);
    expect(result.errors.principalFullName).toBeUndefined();
  });
});

describe('Feature 17: PhilHealth PIN Mod-11 Check Digit Algorithm', () => {
  test('T1.1: Validates legitimate PhilHealth PINs', () => {
    expect(validatePhilHealthPinMod11('12-345678901-8').isValid).toBe(true);
    expect(validatePhilHealthPinMod11('10-000000000-5').isValid).toBe(true);
    expect(validatePhilHealthPinMod11('01-025000001-0').isValid).toBe(true);
  });

  test('T1.2: Formats raw digit input dynamically with standard dashes (XX-XXXXXXXXX-X)', () => {
    expect(formatPhilHealthPin('12')).toBe('12');
    expect(formatPhilHealthPin('123456')).toBe('12-3456');
    expect(formatPhilHealthPin('123456789018')).toBe('12-345678901-8');
  });

  test('T2.1 (Boundary): Rejects PIN with invalid check digit', () => {
    const result = validatePhilHealthPinMod11('12-345678901-2');
    expect(result.isValid).toBe(false);
    expect(result.expectedCheckDigit).toBe(8);
    expect(result.actualCheckDigit).toBe(2);
    expect(result.errorMessage).toContain('Check digit mismatch');
  });

  test('T2.2 (Boundary): Rejects incomplete PIN under 12 digits', () => {
    const result = validatePhilHealthPinMod11('12-34567');
    expect(result.isValid).toBe(false);
    expect(result.isComplete).toBe(false);
  });

  test('T2.3 (Boundary): Rejects empty or whitespace PIN', () => {
    expect(validatePhilHealthPinMod11('').isValid).toBe(false);
    expect(validatePhilHealthPinMod11('   ').isValid).toBe(false);
  });

  test('T5.1 (Adversarial): Single-digit corruption sweep over all 12 positions guarantees 100% rejection', () => {
    const basePin = '123456789018';
    expect(validatePhilHealthPinMod11(basePin).isValid).toBe(true);

    for (let pos = 0; pos < 12; pos++) {
      const origDigit = parseInt(basePin[pos], 10);
      for (let digit = 0; digit <= 9; digit++) {
        if (digit === origDigit) continue;
        const corrupted = basePin.slice(0, pos) + digit + basePin.slice(pos + 1);
        const check = validatePhilHealthPinMod11(corrupted);
        expect(check.isValid).toBe(false);
      }
    }
  });
});

describe('Feature 20: Structured Clinical Allergies & Anaphylaxis Flags', () => {
  test('T1.1: Records multiple structured allergies with category, severity, and anaphylaxis flag', () => {
    const patient: PatientRegistrationModel = {
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      dateOfBirth: '1985-11-20',
      sex: 'Male',
      memberType: 'MM',
      allergies: [
        {
          allergen: 'Amoxicillin',
          category: 'Medication',
          severity: 'LifeThreatening',
          isAnaphylactic: true,
        },
        {
          allergen: 'Shrimp',
          category: 'Food',
          severity: 'Moderate',
          isAnaphylactic: false,
        },
      ],
    };

    const result = validatePatientRegistration(patient);
    expect(result.isValid).toBe(true);
    expect(patient.allergies?.length).toBe(2);
    expect(patient.allergies?.[0].isAnaphylactic).toBe(true);
    expect(patient.allergies?.[1].isAnaphylactic).toBe(false);
  });

  test('T3.1 (Cross-Feature): Dependent DD with Anaphylactic Penicillin allergy persists cleanly', () => {
    const patient: PatientRegistrationModel = {
      firstName: 'Baby',
      lastName: 'Dela Cruz',
      dateOfBirth: '2023-01-01',
      sex: 'Female',
      memberType: 'DD',
      principalFullName: 'Juan Dela Cruz',
      principalRelationship: 'P',
      principalMemberPin: '12-345678901-8',
      allergies: [
        {
          allergen: 'Penicillin G',
          category: 'Medication',
          severity: 'LifeThreatening',
          isAnaphylactic: true,
        },
      ],
    };

    const result = validatePatientRegistration(patient);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual({});
    expect(patient.allergies?.[0].severity).toBe('LifeThreatening');
  });
});
