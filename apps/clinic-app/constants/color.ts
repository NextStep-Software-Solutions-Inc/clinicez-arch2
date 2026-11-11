/**
 * Color and Branding Utilities for Clinic EZ Workstation
 *
 * Implements WCAG 2.1 contrast calculations, dynamic brand shade derivation,
 * and workspace brand color inheritance:
 * - Automatically inherits brand color from Portal Tenant Workspace (`WorkspaceProfile.accentColorHex`).
 * - Allows facility clinic admin to override with a custom clinic color.
 * - Derives cohesive hover, active, border, subtle, and dark-mode shades from any brand hex.
 * - Supports reverting/clearing the override to re-inherit from the tenant workspace.
 */

import { palette } from './tokens';

export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Minimum contrast between the accent and its text for the accent to be accepted (WCAG large-text/UI). */
export const MIN_ACCENT_CONTRAST = 3;

/** Default Clinic EZ Brand Color (Teal 600) */
export const DEFAULT_CLINIC_BRAND_COLOR = '#0D6963';

/** Sentinel token indicating no clinic-level override (inherits workspace or default brand color). */
export const LEGACY_UNSET_ACCENT = 'inherit';

export interface BrandColorPreset {
  color: string;
  label: string;
  description?: string;
}

/**
 * Standard Clinic EZ brand palette presets (aligned with Portal Tenant Workspace)
 */
export const BRAND_COLOR_PRESETS: BrandColorPreset[] = [
  { color: '#0D6963', label: 'Teal (Default)', description: 'Official Clinic EZ medical teal' },
  { color: '#0284C7', label: 'Sky Blue', description: 'Clean clinical sky tone' },
  { color: '#059669', label: 'Emerald', description: 'Vitality and pharmacy green' },
  { color: '#4F46E5', label: 'Indigo', description: 'Modern professional deep indigo' },
  { color: '#E11D48', label: 'Rose', description: 'Pediatric and wellness rose' },
  { color: '#334155', label: 'Slate', description: 'Neutral executive slate' },
];

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function parseHexRgb(hex: string): [number, number, number] {
  const clean = HEX_COLOR.test(hex) ? hex.slice(1) : DEFAULT_CLINIC_BRAND_COLOR.slice(1);
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHexByte(v: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(v)));
  return clamped.toString(16).padStart(2, '0').toUpperCase();
}

/**
 * Linearly interpolates RGB channels between `hexA` (weight `1 - weightB`) and `hexB` (weight `weightB`).
 */
export function mixHex(hexA: string, hexB: string, weightB: number): string {
  const w = Math.max(0, Math.min(1, weightB));
  const [rA, gA, bA] = parseHexRgb(hexA);
  const [rB, gB, bB] = parseHexRgb(hexB);
  const r = rA * (1 - w) + rB * w;
  const g = gA * (1 - w) + gB * w;
  const b = bA * (1 - w) + bB * w;
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

export function relativeLuminance(hex: string): number {
  if (!HEX_COLOR.test(hex)) return 0;
  const [r, g, b] = parseHexRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT_TEXT = '#FFFFFF';
const DARK_TEXT = '#111827';

/**
 * Computes readable foreground text (white vs dark) for a given background color
 */
export function readableForeground(bgHex: string): string {
  if (!HEX_COLOR.test(bgHex)) return LIGHT_TEXT;
  return contrastRatio(bgHex, LIGHT_TEXT) >= contrastRatio(bgHex, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT;
}

/**
 * Best achievable text contrast for this accent
 */
export function bestTextContrast(bgHex: string): number {
  if (!HEX_COLOR.test(bgHex)) return 1;
  return Math.max(contrastRatio(bgHex, LIGHT_TEXT), contrastRatio(bgHex, DARK_TEXT));
}

export function isUsableAccent(hex: string | null | undefined): hex is string {
  return !!hex && HEX_COLOR.test(hex) && bestTextContrast(hex) >= MIN_ACCENT_CONTRAST;
}

/**
 * Converts a `#RRGGBB` hex color into a CSS `rgba(r, g, b, alpha)` string.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const clampedAlpha = Math.max(0, Math.min(1, Number(alpha.toFixed(2))));
  const alphaStr =
    clampedAlpha === 0 || clampedAlpha === 1 ? String(clampedAlpha) : clampedAlpha.toFixed(2);
  const [r, g, b] = parseHexRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alphaStr})`;
}

export interface DerivedBrandPalette {
  primary: string;
  primaryHover: string;
  primaryDark: string;
  primaryLight: string;
  primaryLighter: string;
  primarySubtle: string;
  primaryBorder: string;
  onPrimary: string;
  focusRing: string;
  routine: string;
  routineBg: string;
  routineBorder: string;
  routineText: string;
  primaryShadowSubtle: string;
  primaryShadowSm: string;
  primaryShadowMd: string;
}

/**
 * Derives a complete, WCAG-accessible brand shade scale (hover, pressed/dark, light tints,
 * borders, focus ring, routine status tokens, and translucent hue-matched shadows) from any
 * valid `#RRGGBB` brand color across both `'light'` and `'dark'` color schemes.
 */
export function deriveBrandPalette(
  brandHex: string,
  scheme: 'light' | 'dark' = 'light'
): DerivedBrandPalette {
  const trimmed = brandHex?.trim() || '';
  const hex = HEX_COLOR.test(trimmed) ? trimmed.toUpperCase() : DEFAULT_CLINIC_BRAND_COLOR;

  if (scheme === 'light' && hex === DEFAULT_CLINIC_BRAND_COLOR) {
    const defaultPrimary = palette.teal[600];
    return {
      primary: defaultPrimary,
      primaryHover: palette.teal[700],
      primaryDark: palette.teal[800],
      primaryLight: palette.teal[100],
      primaryLighter: palette.teal[50],
      primarySubtle: palette.teal[50],
      primaryBorder: palette.teal[200],
      onPrimary: palette.slate[0],
      focusRing: palette.teal[500],
      routine: palette.teal[600],
      routineBg: palette.teal[100],
      routineBorder: palette.teal[200],
      routineText: palette.teal[700],
      primaryShadowSubtle: hexToRgba(defaultPrimary, 0.22),
      primaryShadowSm: hexToRgba(defaultPrimary, 0.34),
      primaryShadowMd: hexToRgba(defaultPrimary, 0.46),
    };
  }

  if (scheme === 'light') {
    const primary = hex;
    const primaryHover = mixHex(hex, '#0B1120', 0.16);
    const primaryLight = mixHex(hex, '#FFFFFF', 0.86);
    const primarySubtle = mixHex(hex, '#FFFFFF', 0.93);
    const primaryBorder = mixHex(hex, '#FFFFFF', 0.70);
    const focusRing = mixHex(hex, '#FFFFFF', 0.12);
    const onPrimary = readableForeground(primary);

    let darkWeight = 0.32;
    let primaryDark = mixHex(hex, '#0B1120', darkWeight);
    while (contrastRatio(primaryDark, primaryLight) < 4.5 && darkWeight < 0.88) {
      darkWeight += 0.06;
      primaryDark = mixHex(hex, '#0B1120', darkWeight);
    }

    return {
      primary,
      primaryHover,
      primaryDark,
      primaryLight,
      primaryLighter: primarySubtle,
      primarySubtle,
      primaryBorder,
      onPrimary,
      focusRing,
      routine: primary,
      routineBg: primaryLight,
      routineBorder: primaryBorder,
      routineText: primaryDark,
      primaryShadowSubtle: hexToRgba(primary, 0.22),
      primaryShadowSm: hexToRgba(primary, 0.34),
      primaryShadowMd: hexToRgba(primary, 0.46),
    };
  }

  // Dark scheme derivation
  const primary = relativeLuminance(hex) < 0.18 ? mixHex(hex, '#FFFFFF', 0.24) : hex;
  const primaryHover = mixHex(primary, '#FFFFFF', 0.14);
  const primaryLight = mixHex(hex, '#0F172A', 0.76);
  const primarySubtle = mixHex(hex, '#0F172A', 0.86);
  const primaryBorder = mixHex(hex, '#0F172A', 0.50);
  const focusRing = mixHex(primary, '#FFFFFF', 0.16);
  const onPrimary = readableForeground(primary);

  let lightTextWeight = 0.68;
  let primaryDark = mixHex(hex, '#FFFFFF', lightTextWeight);
  while (contrastRatio(primaryDark, primaryLight) < 4.5 && lightTextWeight < 0.94) {
    lightTextWeight += 0.05;
    primaryDark = mixHex(hex, '#FFFFFF', lightTextWeight);
  }

  return {
    primary,
    primaryHover,
    primaryDark,
    primaryLight,
    primaryLighter: primarySubtle,
    primarySubtle,
    primaryBorder,
    onPrimary,
    focusRing,
    routine: primary,
    routineBg: primaryLight,
    routineBorder: primaryBorder,
    routineText: primaryDark,
    primaryShadowSubtle: hexToRgba(primary, 0.28),
    primaryShadowSm: hexToRgba(primary, 0.40),
    primaryShadowMd: hexToRgba(primary, 0.52),
  };
}

export interface ResolveBrandColorParams {
  userOverrideHex?: string | null;
  clinicOverrideHex?: string | null;
  workspaceAccentHex?: string | null;
  defaultHex?: string;
}

export interface ResolvedBrandColor {
  color: string;
  isOverridden: boolean;
  source: 'user_override' | 'clinic_override' | 'workspace_inherited' | 'default_fallback';
}

/**
 * Resolves active clinic branding color with auto-inheritance:
 * 0. User Personal Override: if explicitly set and valid hex (highest priority for the user's session).
 * 1. Clinic Facility Override: if explicitly set and not empty / not legacy unset.
 * 2. Portal Tenant Workspace: inherited if present and valid.
 * 3. Default Fallback: standard product teal #0D6963.
 */
export function resolveClinicBrandColor({
  userOverrideHex,
  clinicOverrideHex,
  workspaceAccentHex,
  defaultHex = DEFAULT_CLINIC_BRAND_COLOR,
}: ResolveBrandColorParams): ResolvedBrandColor {
  const cleanUserOverride = userOverrideHex?.trim();
  const cleanOverride = clinicOverrideHex?.trim();
  const cleanWorkspace = workspaceAccentHex?.trim();

  // If user has an explicit personal override that is valid hex and not an unset sentinel ('inherit' / empty)
  if (
    cleanUserOverride &&
    cleanUserOverride.toLowerCase() !== LEGACY_UNSET_ACCENT.toLowerCase() &&
    HEX_COLOR.test(cleanUserOverride)
  ) {
    return {
      color: cleanUserOverride.toUpperCase(),
      isOverridden: true,
      source: 'user_override',
    };
  }

  // If clinic has an explicit override that is valid hex and not an unset sentinel ('inherit' / empty)
  if (
    cleanOverride &&
    cleanOverride.toLowerCase() !== LEGACY_UNSET_ACCENT.toLowerCase() &&
    HEX_COLOR.test(cleanOverride)
  ) {
    return {
      color: cleanOverride.toUpperCase(),
      isOverridden: true,
      source: 'clinic_override',
    };
  }

  // If portal tenant workspace provides an accent
  if (cleanWorkspace && HEX_COLOR.test(cleanWorkspace)) {
    return {
      color: cleanWorkspace.toUpperCase(),
      isOverridden: false,
      source: 'workspace_inherited',
    };
  }

  // Fall back to product default
  return {
    color: defaultHex,
    isOverridden: false,
    source: 'default_fallback',
  };
}

/**
 * Determines whether the selected color or custom color input differs from the currently
 * saved/active primary brand color baseline.
 */
export function isColorBrandingDirty(params: {
  selectedColor: string;
  customHexInput?: string;
  savedPrimaryColorHex?: string | null;
}): boolean {
  const baseline = (params.savedPrimaryColorHex || DEFAULT_CLINIC_BRAND_COLOR).trim().toUpperCase();
  const currentSelected = params.selectedColor.trim().toUpperCase();
  if (currentSelected !== baseline) return true;

  if (params.customHexInput !== undefined) {
    const raw = params.customHexInput.trim().toUpperCase();
    const withHash = raw.startsWith('#') ? raw : raw ? `#${raw}` : '';
    if (withHash !== baseline) return true;
  }

  return false;
}
