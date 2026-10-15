/**
 * Color and Branding Utilities for ClinicEZ Workstation
 *
 * Implements WCAG 2.1 contrast calculations and workspace brand color inheritance:
 * - Automatically inherits brand color from Portal Tenant Workspace (`WorkspaceProfile.accentColorHex`).
 * - Allows facility clinic admin to override with a custom clinic color.
 * - Supports reverting/clearing the override to re-inherit from the tenant workspace.
 */

import { theme } from './theme';

export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Minimum contrast between the accent and its text for the accent to be accepted (WCAG large-text/UI). */
export const MIN_ACCENT_CONTRAST = 3;

/** Default ClinicEZ Brand Color (Teal 600) */
export const DEFAULT_CLINIC_BRAND_COLOR = theme.colors.primary;

/** Legacy Sentinel Unset Value (used in older DB schemas to indicate unset) */
export const LEGACY_UNSET_ACCENT = '#0284C7';

export interface BrandColorPreset {
  color: string;
  label: string;
  description?: string;
}

/**
 * Standard ClinicEZ brand palette presets (aligned with Portal Tenant Workspace)
 */
export const BRAND_COLOR_PRESETS: BrandColorPreset[] = [
  { color: '#0D6963', label: 'Teal (Default)', description: 'Official ClinicEZ medical teal' },
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

export function relativeLuminance(hex: string): number {
  if (!HEX_COLOR.test(hex)) return 0;
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

export interface ResolveBrandColorParams {
  clinicOverrideHex?: string | null;
  workspaceAccentHex?: string | null;
  defaultHex?: string;
}

export interface ResolvedBrandColor {
  color: string;
  isOverridden: boolean;
  source: 'clinic_override' | 'workspace_inherited' | 'default_fallback';
}

/**
 * Resolves active clinic branding color with auto-inheritance:
 * 1. Clinic Facility Override: if explicitly set and not empty / not legacy unset.
 * 2. Portal Tenant Workspace: inherited if present and valid.
 * 3. Default Fallback: standard product teal #0D6963.
 */
export function resolveClinicBrandColor({
  clinicOverrideHex,
  workspaceAccentHex,
  defaultHex = DEFAULT_CLINIC_BRAND_COLOR,
}: ResolveBrandColorParams): ResolvedBrandColor {
  const cleanOverride = clinicOverrideHex?.trim();
  const cleanWorkspace = workspaceAccentHex?.trim();

  // If clinic has an explicit override that is valid and not empty
  if (
    cleanOverride &&
    HEX_COLOR.test(cleanOverride) &&
    cleanOverride.toUpperCase() !== LEGACY_UNSET_ACCENT.toUpperCase()
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
