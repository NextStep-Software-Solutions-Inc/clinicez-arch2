import { lightColors, type ColorToken } from './semantic';

export interface NativeShadowToken {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export interface WebShadowToken {
  boxShadow: string;
}

export type ShadowToken = NativeShadowToken;

export type ShadowVariant =
  | 'none'
  | 'sm'
  | 'md'
  | 'lg'
  | 'brandSubtle'
  | 'brandSm'
  | 'brandMd'
  | 'dangerSm'
  | 'dangerMd'
  | 'successSm'
  | 'successMd';

export type ShadowScale = Record<ShadowVariant, ShadowToken>;

export const isLiveWebDom =
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  (typeof navigator === 'undefined' || navigator.product !== 'ReactNative') &&
  typeof (globalThis as { Bun?: unknown }).Bun === 'undefined';

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function resolveBrandShadowColor(
  colors: Partial<Record<ColorToken | string, string>>,
  explicitKey: 'primaryShadowSubtle' | 'primaryShadowSm' | 'primaryShadowMd',
  alpha: number,
  fallback: string
): string {
  const explicit = colors[explicitKey];
  if (explicit) return explicit;
  if (colors.primary && HEX_COLOR_RE.test(colors.primary)) {
    return hexToRgba(colors.primary, alpha);
  }
  return fallback;
}

/**
 * Builds the 11-entry ClinicEZ elevation scale from semantic colors (including
 * dynamic brand-derived translucent shadows). On live web DOM, returns pure CSS
 * `boxShadow` entries (cast to ShadowToken for RN StyleSheet parity) so
 * react-native-web never falls back to black `.r-boxShadow-*` filters.
 */
export function createShadows(
  themeColors: Partial<Record<ColorToken | string, string>> = lightColors,
  useWebBoxShadow: boolean = isLiveWebDom
): ShadowScale {
  const smColor = themeColors.shadowSmColor ?? lightColors.shadowSmColor;
  const mdColor = themeColors.shadowMdColor ?? lightColors.shadowMdColor;
  const lgColor = themeColors.shadowLgColor ?? lightColors.shadowLgColor;
  const brandSubtleColor = resolveBrandShadowColor(
    themeColors,
    'primaryShadowSubtle',
    0.22,
    lightColors.primaryShadowSubtle
  );
  const brandSmColor = resolveBrandShadowColor(
    themeColors,
    'primaryShadowSm',
    0.34,
    lightColors.primaryShadowSm
  );
  const brandMdColor = resolveBrandShadowColor(
    themeColors,
    'primaryShadowMd',
    0.46,
    lightColors.primaryShadowMd
  );
  const dangerSmColor =
    themeColors.dangerShadowSm ??
    (themeColors.emergency && HEX_COLOR_RE.test(themeColors.emergency)
      ? hexToRgba(themeColors.emergency, 0.22)
      : lightColors.dangerShadowSm);
  const dangerMdColor =
    themeColors.dangerShadowMd ??
    (themeColors.emergency && HEX_COLOR_RE.test(themeColors.emergency)
      ? hexToRgba(themeColors.emergency, 0.32)
      : lightColors.dangerShadowMd);
  const successSmColor =
    themeColors.successShadowSm ??
    (themeColors.success && HEX_COLOR_RE.test(themeColors.success)
      ? hexToRgba(themeColors.success, 0.22)
      : lightColors.successShadowSm);
  const successMdColor =
    themeColors.successShadowMd ??
    (themeColors.success && HEX_COLOR_RE.test(themeColors.success)
      ? hexToRgba(themeColors.success, 0.32)
      : lightColors.successShadowMd);

  if (useWebBoxShadow) {
    const webScale: Record<ShadowVariant, WebShadowToken> = {
      none: { boxShadow: 'none' },
      sm: { boxShadow: `0 2px 6px 0 ${smColor}, 0 6px 16px -2px ${smColor}` },
      md: { boxShadow: `0 6px 16px 0 ${mdColor}, 0 12px 28px -4px ${smColor}` },
      lg: { boxShadow: `0 12px 32px 0 ${lgColor}, 0 24px 48px -6px ${mdColor}` },
      brandSubtle: {
        boxShadow: `0 2px 6px 0 ${brandSubtleColor}, 0 6px 14px -1px ${brandSubtleColor}`,
      },
      brandSm: {
        boxShadow: `0 4px 10px 0 ${brandSmColor}, 0 8px 20px -2px ${brandSubtleColor}`,
      },
      brandMd: {
        boxShadow: `0 6px 16px 0 ${brandMdColor}, 0 12px 28px -3px ${brandSmColor}`,
      },
      dangerSm: {
        boxShadow: `0 4px 10px 0 ${dangerSmColor}, 0 8px 20px -2px ${dangerSmColor}`,
      },
      dangerMd: {
        boxShadow: `0 6px 16px 0 ${dangerMdColor}, 0 12px 28px -3px ${dangerSmColor}`,
      },
      successSm: {
        boxShadow: `0 4px 10px 0 ${successSmColor}, 0 8px 20px -2px ${successSmColor}`,
      },
      successMd: {
        boxShadow: `0 6px 16px 0 ${successMdColor}, 0 12px 28px -3px ${successSmColor}`,
      },
    };
    return webScale as unknown as ShadowScale;
  }

  return {
    none: {
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    sm: {
      shadowColor: smColor,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 1,
      shadowRadius: 8,
      elevation: 3,
    },
    md: {
      shadowColor: mdColor,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 1,
      shadowRadius: 16,
      elevation: 6,
    },
    lg: {
      shadowColor: lgColor,
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 1,
      shadowRadius: 28,
      elevation: 12,
    },
    brandSubtle: {
      shadowColor: brandSubtleColor,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 1,
      shadowRadius: 7,
      elevation: 2,
    },
    brandSm: {
      shadowColor: brandSmColor,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 1,
      shadowRadius: 12,
      elevation: 4,
    },
    brandMd: {
      shadowColor: brandMdColor,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 1,
      shadowRadius: 18,
      elevation: 7,
    },
    dangerSm: {
      shadowColor: dangerSmColor,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 1,
      shadowRadius: 12,
      elevation: 4,
    },
    dangerMd: {
      shadowColor: dangerMdColor,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 1,
      shadowRadius: 18,
      elevation: 7,
    },
    successSm: {
      shadowColor: successSmColor,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 1,
      shadowRadius: 12,
      elevation: 4,
    },
    successMd: {
      shadowColor: successMdColor,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 1,
      shadowRadius: 18,
      elevation: 7,
    },
  };
}

export const shadows: ShadowScale = createShadows(lightColors, isLiveWebDom);
