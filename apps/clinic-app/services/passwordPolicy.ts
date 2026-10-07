/**
 * Client-side mirror of the server password policy (clinic-api FacilityPasswordHasher.ValidateStrength) used only to
 * give instant feedback. The server remains the authority.
 */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

export function validatePasswordPolicy(password: string, minLength = MIN_PASSWORD_LENGTH): string[] {
  const problems: string[] = [];
  if (password.length < minLength) problems.push(`Use at least ${minLength} characters.`);
  if (password.length > MAX_PASSWORD_LENGTH) problems.push(`Use at most ${MAX_PASSWORD_LENGTH} characters.`);
  if (!/[A-Za-z]/.test(password)) problems.push('Include at least one letter.');
  if (!/\d/.test(password)) problems.push('Include at least one number.');
  return problems;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
