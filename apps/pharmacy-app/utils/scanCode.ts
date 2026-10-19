/**
 * Turns what the camera (or a keyboard-wedge scanner) read from a prescription QR into the claim code the hub
 * expects. The QR carries the claim token verbatim, so this only strips the whitespace scanners and clipboards add.
 * Returns `null` when nothing usable was read, so the caller can keep scanning.
 */
export const MAX_CLAIM_CODE_LENGTH = 4096;

export function normalizeScannedClaimCode(raw: string | null | undefined): string | null {
  const code = (raw ?? '').replace(/\s+/g, '');
  if (code.length === 0 || code.length > MAX_CLAIM_CODE_LENGTH) return null;
  return code;
}
