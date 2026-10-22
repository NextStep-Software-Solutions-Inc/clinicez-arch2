/**
 * Validates a facility workstation password.
 * Strictly aligned with FacilityPasswordHasher.cs in packages/shared-dotnet/LocalAuth/FacilityPasswordHasher.cs.
 *
 * Rules:
 * 1. Minimum 8 characters.
 * 2. Maximum 128 characters.
 * 3. At least one letter (a-z or A-Z).
 * 4. At least one digit (0-9).
 * 5. If confirmPassword is provided, it must match password.
 *
 * Returns a human-readable error message or null if valid.
 */
export function validateWorkstationPassword(
  password: string,
  confirmPassword?: string
): string | null {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (password.length > 128) {
    return 'Password must be at most 128 characters long.';
  }
  if (!/[a-zA-Z]/.test(password)) {
    return 'Password must contain at least one letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one digit.';
  }
  if (confirmPassword !== undefined && password !== confirmPassword) {
    return 'Passwords do not match.';
  }
  return null;
}
