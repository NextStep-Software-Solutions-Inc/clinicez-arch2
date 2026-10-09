/**
 * Cleans a scanned or pasted claim code. Keyboard-wedge scanners append Enter/Tab and camera apps sometimes add
 * stray control characters, so those are dropped before the code is trimmed. Returns `null` for an empty code.
 * The slip QR carries the raw claim token (not a URL), so nothing else is parsed out of it.
 */
export function normalizeClaimToken(raw: string | null | undefined): string | null {
  const cleaned = (raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}
