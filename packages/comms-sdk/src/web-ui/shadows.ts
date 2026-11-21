import {
  createShadows,
  lightColors,
  type ColorToken,
  type ShadowScale,
  type ShadowVariant,
} from '@clinicez/design-tokens';

export type WebShadowVariant = ShadowVariant;
export type WebShadowScale = Record<WebShadowVariant, string>;

export interface WebThemePalette {
  primary: string;
  primaryHover: string;
  primaryDark: string;
  primaryLight: string;
  primarySubtle: string;
  primaryBorder: string;
  onPrimary: string;
  focusRing: string;
}

export interface WebResolvedTheme {
  colors: WebThemePalette;
  shadows: WebShadowScale;
}

const HEX6_RE = /^#[0-9A-Fa-f]{6}$/;

function parseHexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHexColors(hexA: string, hexB: string, weightB: number): string {
  const [rA, gA, bA] = parseHexRgb(hexA);
  const [rB, gB, bB] = parseHexRgb(hexB);
  const w = Math.max(0, Math.min(1, weightB));
  const r = Math.round(rA * (1 - w) + rB * w);
  const g = Math.round(gA * (1 - w) + gB * w);
  const b = Math.round(bA * (1 - w) + bB * w);
  const toByte = (v: number) => v.toString(16).padStart(2, '0').toUpperCase();
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

const CSS_BRAND_SUBTLE = `var(--ez-primary-shadow-subtle, color-mix(in srgb, var(--primary, ${lightColors.primary}) 22%, transparent))`;
const CSS_BRAND_SM = `var(--ez-primary-shadow-sm, color-mix(in srgb, var(--primary, ${lightColors.primary}) 34%, transparent))`;
const CSS_BRAND_MD = `var(--ez-primary-shadow-md, color-mix(in srgb, var(--primary, ${lightColors.primary}) 46%, transparent))`;

const CSS_VAR_WEB_SHADOWS: WebShadowScale = {
  none: 'none',
  sm: `0 2px 6px 0 ${lightColors.shadowSmColor}, 0 6px 16px -2px ${lightColors.shadowSmColor}`,
  md: `0 6px 16px 0 ${lightColors.shadowMdColor}, 0 12px 28px -4px ${lightColors.shadowSmColor}`,
  lg: `0 12px 32px 0 ${lightColors.shadowLgColor}, 0 24px 48px -6px ${lightColors.shadowMdColor}`,
  brandSubtle: `0 2px 6px 0 ${CSS_BRAND_SUBTLE}, 0 6px 14px -1px ${CSS_BRAND_SUBTLE}`,
  brandSm: `0 4px 10px 0 ${CSS_BRAND_SM}, 0 8px 20px -2px ${CSS_BRAND_SUBTLE}`,
  brandMd: `0 6px 16px 0 ${CSS_BRAND_MD}, 0 12px 28px -3px ${CSS_BRAND_SM}`,
  dangerSm: `0 4px 10px 0 ${lightColors.dangerShadowSm}, 0 8px 20px -2px ${lightColors.dangerShadowSm}`,
  dangerMd: `0 6px 16px 0 ${lightColors.dangerShadowMd}, 0 12px 28px -3px ${lightColors.dangerShadowSm}`,
  successSm: `0 4px 10px 0 ${lightColors.successShadowSm}, 0 8px 20px -2px ${lightColors.successShadowSm}`,
  successMd: `0 6px 16px 0 ${lightColors.successShadowMd}, 0 12px 28px -3px ${lightColors.successShadowSm}`,
};

const CSS_VAR_WEB_COLORS: WebThemePalette = {
  primary: `var(--ez-primary, var(--primary, ${lightColors.primary}))`,
  primaryHover: `var(--ez-primary-hover, color-mix(in srgb, var(--primary, ${lightColors.primary}) 84%, ${lightColors.text}))`,
  primaryDark: `var(--ez-primary-dark, color-mix(in srgb, var(--primary, ${lightColors.primary}) 68%, ${lightColors.text}))`,
  primaryLight: `var(--ez-primary-light, color-mix(in srgb, var(--primary, ${lightColors.primary}) 14%, ${lightColors.onPrimary}))`,
  primarySubtle: `var(--ez-primary-subtle, color-mix(in srgb, var(--primary, ${lightColors.primary}) 7%, ${lightColors.onPrimary}))`,
  primaryBorder: `var(--ez-primary-border, color-mix(in srgb, var(--primary, ${lightColors.primary}) 30%, ${lightColors.onPrimary}))`,
  onPrimary: `var(--ez-on-primary, var(--primary-foreground, ${lightColors.onPrimary}))`,
  focusRing: `var(--ez-focus-ring, var(--ring, ${lightColors.focusRing}))`,
};

function extractBoxShadow(entry: unknown, fallback: string): string {
  if (!entry || typeof entry !== 'object') return fallback;
  const candidate = entry as {
    boxShadow?: unknown;
    shadowColor?: unknown;
    shadowRadius?: unknown;
    shadowOffset?: { width?: number; height?: number };
  };
  if (typeof candidate.boxShadow === 'string') return candidate.boxShadow;
  if (candidate.shadowColor === 'transparent') return 'none';
  if (typeof candidate.shadowColor === 'string') {
    const x = candidate.shadowOffset?.width ?? 0;
    const y = candidate.shadowOffset?.height ?? 4;
    const blur = (typeof candidate.shadowRadius === 'number' ? candidate.shadowRadius : 8) * 2;
    return `${x}px ${y}px ${blur}px 0 ${candidate.shadowColor}`;
  }
  return fallback;
}

/**
 * Resolves brand-reactive CSS `boxShadow` strings for Web teleconsultation components.
 */
export function resolveWebShadows(
  colors?: Partial<Record<ColorToken | string, string>>,
  shadows?: Partial<ShadowScale>
): WebShadowScale {
  if (!colors && !shadows) {
    return CSS_VAR_WEB_SHADOWS;
  }

  const generated = createShadows({ ...lightColors, ...colors }, true) as unknown as Record<
    ShadowVariant,
    { boxShadow: string }
  >;

  const result = {} as WebShadowScale;
  (Object.keys(CSS_VAR_WEB_SHADOWS) as ShadowVariant[]).forEach((variant) => {
    const base = generated[variant]?.boxShadow ?? CSS_VAR_WEB_SHADOWS[variant];
    result[variant] = shadows?.[variant] ? extractBoxShadow(shadows[variant], base) : base;
  });

  return result;
}

/**
 * Resolves both brand-driven colors (fill, border, text, tint) and brand-tinted drop shadows
 * for Web teleconsultation components, supporting either explicit host palettes or `:root`
 * CSS custom properties (`--ez-primary*`, `--primary`).
 */
export function resolveWebTheme(
  colors?: Partial<Record<ColorToken | string, string>>,
  shadows?: Partial<ShadowScale>
): WebResolvedTheme {
  const resolvedShadows = resolveWebShadows(colors, shadows);
  if (!colors) {
    return {
      colors: CSS_VAR_WEB_COLORS,
      shadows: resolvedShadows,
    };
  }

  const primary = colors.primary ?? lightColors.primary;
  const hasHexPrimary = HEX6_RE.test(primary);

  return {
    colors: {
      primary,
      primaryHover:
        colors.primaryHover ??
        (hasHexPrimary ? mixHexColors(primary, lightColors.text, 0.16) : lightColors.primaryHover),
      primaryDark:
        colors.primaryDark ??
        (hasHexPrimary ? mixHexColors(primary, lightColors.text, 0.32) : lightColors.primaryDark),
      primaryLight:
        colors.primaryLight ??
        (hasHexPrimary ? mixHexColors(primary, lightColors.onPrimary, 0.86) : lightColors.primaryLight),
      primarySubtle:
        colors.primarySubtle ??
        (hasHexPrimary ? mixHexColors(primary, lightColors.onPrimary, 0.93) : lightColors.primarySubtle),
      primaryBorder:
        colors.primaryBorder ??
        (hasHexPrimary ? mixHexColors(primary, lightColors.onPrimary, 0.70) : lightColors.primaryBorder),
      onPrimary: colors.onPrimary ?? lightColors.onPrimary,
      focusRing:
        colors.focusRing ??
        (hasHexPrimary ? mixHexColors(primary, lightColors.onPrimary, 0.12) : lightColors.focusRing),
    },
    shadows: resolvedShadows,
  };
}
