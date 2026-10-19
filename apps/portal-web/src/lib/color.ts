/**
 * Small WCAG helpers used to apply a workspace accent color safely: the accent becomes `--primary`,
 * so we must pick a readable foreground and refuse colors that would make buttons unreadable.
 */

export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Minimum contrast between the accent and its text for the accent to be accepted (WCAG large-text/UI). */
export const MIN_ACCENT_CONTRAST = 3;

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT_TEXT = "#FFFFFF";
const DARK_TEXT = "#111827";

/** The better of white / near-black text on top of the given background color. */
export function readableForeground(bgHex: string): string {
  return contrastRatio(bgHex, LIGHT_TEXT) >= contrastRatio(bgHex, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

/** Best achievable text contrast for this accent (always >= 4.5 only for sufficiently dark/light colors). */
export function bestTextContrast(bgHex: string): number {
  return Math.max(contrastRatio(bgHex, LIGHT_TEXT), contrastRatio(bgHex, DARK_TEXT));
}

export function isUsableAccent(hex: string | null | undefined): hex is string {
  return !!hex && HEX_COLOR.test(hex) && bestTextContrast(hex) >= MIN_ACCENT_CONTRAST;
}
