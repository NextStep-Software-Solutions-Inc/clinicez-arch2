import {
  palette,
  fontSizeScale,
  spaceScale,
  radiusScale,
} from './tokens';
import {
  DEFAULT_CLINIC_BRAND_COLOR,
  HEX_COLOR,
  deriveBrandPalette,
} from './color';

/**
 * Semantic design tokens - the ONLY thing screens and components should consume.
 *
 * Rules:
 *  - No raw hex, rgba, fontSize or borderRadius outside `constants/` (enforced by
 *    `bun run lint:tokens`).
 *  - Pick colors by meaning (`surface`, `textMuted`, `emergencyBg`), never by hue.
 *  - Type is chosen via `theme.typography.*` / <ThemedText variant>, sizes via
 *    `theme.fontSizes.*` when a one-off size is unavoidable.
 */

export type ThemeColorScheme = 'light' | 'dark';

const lightThemeColors = {
  // Brand (Portal-aligned teal by default; dynamically overridden via syncActiveTheme)
  primary: palette.teal[600],
  primaryHover: palette.teal[700],
  primaryDark: palette.teal[800],
  primaryLight: palette.teal[100],
  primaryLighter: palette.teal[50],
  primarySubtle: palette.teal[50],
  primaryBorder: palette.teal[200],
  onPrimary: palette.slate[0],
  focusRing: palette.teal[500],

  // Clinical triage urgency
  emergency: palette.red[600],
  emergencyBg: palette.red[100],
  emergencyBorder: palette.red[200],
  emergencyText: palette.red[800],
  emergencySubtle: palette.red[50],

  urgent: palette.orange[600],
  urgentBg: palette.orange[100],
  urgentBorder: palette.orange[200],
  urgentText: palette.orange[700],

  routine: palette.teal[600],
  routineBg: palette.teal[100],
  routineBorder: palette.teal[200],
  routineText: palette.teal[700],

  // Status
  success: palette.green[600],
  successBg: palette.green[100],
  successBorder: palette.green[200],
  successText: palette.green[700],

  warning: palette.amber[600],
  warningBg: palette.amber[100],
  warningBorder: palette.amber[200],
  warningText: palette.amber[700],

  info: palette.blue[600],
  infoBg: palette.blue[100],
  infoBorder: palette.blue[200],
  infoText: palette.blue[700],

  purple: palette.violet[600],
  purpleBg: palette.violet[100],
  purpleBorder: palette.violet[200],
  purpleText: palette.violet[800],

  // Surfaces
  background: palette.slate[50],
  surface: palette.slate[0],
  surfaceMuted: palette.slate[50],
  surfaceSubtle: palette.slate[100],
  surfaceHighlight: palette.slate[200],
  surfaceInverse: palette.slate[900],

  // Skeletons
  skeletonBase: palette.slate[200],
  skeletonHighlight: palette.slate[100],

  // Borders
  border: palette.slate[200],
  borderLight: palette.slate[100],
  borderDark: palette.slate[300],

  // Text
  text: palette.slate[900],
  textSecondary: palette.slate[600],
  textMuted: palette.slate[500],
  textLight: palette.slate[400],
  textInverted: palette.slate[0],

  // Overlays & Shadows (translucent rgba baked in so react-native-web CSS vars preserve alpha)
  overlay: 'rgba(15, 23, 42, 0.55)',
  shadow: palette.slate[900],
  shadowSmColor: 'rgba(15, 23, 42, 0.09)',
  shadowMdColor: 'rgba(15, 23, 42, 0.14)',
  shadowLgColor: 'rgba(15, 23, 42, 0.20)',
  primaryShadowSubtle: 'rgba(13, 105, 99, 0.22)',
  primaryShadowSm: 'rgba(13, 105, 99, 0.34)',
  primaryShadowMd: 'rgba(13, 105, 99, 0.46)',
  dangerShadowSm: 'rgba(220, 38, 38, 0.22)',
  dangerShadowMd: 'rgba(220, 38, 38, 0.32)',
  successShadowSm: 'rgba(22, 163, 74, 0.22)',
  successShadowMd: 'rgba(22, 163, 74, 0.32)',
  transparent: 'transparent',
};

export type ThemeColor = keyof typeof lightThemeColors;

const darkThemeColors: Record<ThemeColor, string> = {
  // Brand (default dark teal; dynamically overridden via deriveBrandPalette)
  primary: palette.teal[400],
  primaryHover: palette.teal[300],
  primaryDark: palette.teal[200],
  primaryLight: palette.teal[900],
  primaryLighter: palette.teal[950],
  primarySubtle: palette.teal[950],
  primaryBorder: palette.teal[700],
  onPrimary: palette.slate[950],
  focusRing: palette.teal[400],

  // Clinical triage urgency (dark-mode high-contrast tokens)
  emergency: palette.red[400],
  emergencyBg: palette.red[900],
  emergencyBorder: palette.red[800],
  emergencyText: palette.red[200],
  emergencySubtle: palette.red[900],

  urgent: palette.orange[400],
  urgentBg: palette.orange[900],
  urgentBorder: palette.orange[700],
  urgentText: palette.orange[200],

  routine: palette.teal[400],
  routineBg: palette.teal[900],
  routineBorder: palette.teal[700],
  routineText: palette.teal[200],

  // Status
  success: palette.green[400],
  successBg: palette.green[900],
  successBorder: palette.green[700],
  successText: palette.green[200],

  warning: palette.amber[400],
  warningBg: palette.amber[900],
  warningBorder: palette.amber[700],
  warningText: palette.amber[200],

  info: palette.blue[400],
  infoBg: palette.blue[900],
  infoBorder: palette.blue[700],
  infoText: palette.blue[200],

  purple: palette.violet[400],
  purpleBg: palette.violet[900],
  purpleBorder: palette.violet[800],
  purpleText: palette.violet[200],

  // Surfaces
  background: palette.slate[950],
  surface: palette.slate[900],
  surfaceMuted: palette.slate[800],
  surfaceSubtle: palette.slate[800],
  surfaceHighlight: palette.slate[700],
  surfaceInverse: palette.slate[50],

  // Skeletons
  skeletonBase: palette.slate[800],
  skeletonHighlight: palette.slate[700],

  // Borders
  border: palette.slate[800],
  borderLight: palette.slate[800],
  borderDark: palette.slate[700],

  // Text
  text: palette.slate[50],
  textSecondary: palette.slate[300],
  textMuted: palette.slate[400],
  textLight: palette.slate[500],
  textInverted: palette.slate[950],

  // Overlays & Shadows
  overlay: 'rgba(2, 6, 23, 0.7)',
  shadow: '#000000',
  shadowSmColor: 'rgba(2, 6, 23, 0.44)',
  shadowMdColor: 'rgba(2, 6, 23, 0.56)',
  shadowLgColor: 'rgba(2, 6, 23, 0.68)',
  primaryShadowSubtle: 'rgba(46, 179, 159, 0.28)',
  primaryShadowSm: 'rgba(46, 179, 159, 0.40)',
  primaryShadowMd: 'rgba(46, 179, 159, 0.52)',
  dangerShadowSm: 'rgba(248, 113, 113, 0.30)',
  dangerShadowMd: 'rgba(248, 113, 113, 0.42)',
  successShadowSm: 'rgba(74, 222, 128, 0.30)',
  successShadowMd: 'rgba(74, 222, 128, 0.42)',
  transparent: 'transparent',
};

function toKebabCase(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

const isLiveWebDom =
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  (typeof navigator === 'undefined' || navigator.product !== 'ReactNative') &&
  typeof (globalThis as any).Bun === 'undefined';

function buildResolvedColors(
  brandColorHex: string,
  scheme: ThemeColorScheme
): Record<ThemeColor, string> {
  const base = scheme === 'dark' ? darkThemeColors : lightThemeColors;
  const brand = deriveBrandPalette(brandColorHex, scheme);
  return {
    ...base,
    primary: brand.primary,
    primaryHover: brand.primaryHover,
    primaryDark: brand.primaryDark,
    primaryLight: brand.primaryLight,
    primaryLighter: brand.primaryLighter,
    primarySubtle: brand.primarySubtle,
    primaryBorder: brand.primaryBorder,
    onPrimary: brand.onPrimary,
    focusRing: brand.focusRing,
    routine: brand.routine,
    routineBg: brand.routineBg,
    routineBorder: brand.routineBorder,
    routineText: brand.routineText,
    primaryShadowSubtle: brand.primaryShadowSubtle,
    primaryShadowSm: brand.primaryShadowSm,
    primaryShadowMd: brand.primaryShadowMd,
  };
}

function applyCssVariablesToDom(
  resolved: Record<ThemeColor, string>,
  scheme: ThemeColorScheme
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!root || !root.style || typeof root.style.setProperty !== 'function') return;

  for (const key of Object.keys(resolved) as ThemeColor[]) {
    if (key === 'transparent') continue;
    root.style.setProperty(`--ez-${toKebabCase(key)}`, resolved[key]);
  }
  root.style.setProperty('--primary', resolved.primary);
  root.style.setProperty('--primary-color', resolved.primary);

  if (root.dataset) {
    root.dataset.theme = scheme;
  }
  root.style.colorScheme = scheme;

  if (document.body && document.body.style) {
    document.body.style.backgroundColor = resolved.background;
    document.body.style.color = resolved.text;
  }
}

let activeBrandColorHex: string = DEFAULT_CLINIC_BRAND_COLOR;
let activeUserBrandColorHex: string | null = null;
let activeScheme: ThemeColorScheme = 'light';
let activeResolvedColors: Record<ThemeColor, string> = buildResolvedColors(
  activeUserBrandColorHex ?? activeBrandColorHex,
  activeScheme
);

const colors: Record<ThemeColor, string> = (() => {
  if (isLiveWebDom) {
    const cssVarMap = {} as Record<ThemeColor, string>;
    for (const key of Object.keys(lightThemeColors) as ThemeColor[]) {
      cssVarMap[key] =
        key === 'transparent'
          ? 'transparent'
          : `var(--ez-${toKebabCase(key)}, ${lightThemeColors[key]})`;
    }
    applyCssVariablesToDom(activeResolvedColors, activeScheme);
    return cssVarMap;
  }
  return { ...activeResolvedColors };
})();

export interface ActiveThemeState {
  brandColorHex: string;
  clinicBrandColorHex: string;
  userBrandColorHex: string | null;
  scheme: ThemeColorScheme;
  resolvedColors: Record<ThemeColor, string>;
}

const themeListeners = new Set<() => void>();

export function syncActiveTheme(update: {
  brandColorHex?: string;
  userBrandColorHex?: string | null;
  scheme?: ThemeColorScheme;
}): Record<ThemeColor, string> {
  let changed = false;

  if (update.brandColorHex !== undefined) {
    const clean = update.brandColorHex.trim();
    const nextBrand = HEX_COLOR.test(clean) ? clean.toUpperCase() : DEFAULT_CLINIC_BRAND_COLOR;
    if (nextBrand !== activeBrandColorHex) {
      activeBrandColorHex = nextBrand;
      changed = true;
    }
  }

  if (update.userBrandColorHex !== undefined) {
    const cleanUser = update.userBrandColorHex ? update.userBrandColorHex.trim() : '';
    const nextUserBrand = cleanUser && HEX_COLOR.test(cleanUser) ? cleanUser.toUpperCase() : null;
    if (nextUserBrand !== activeUserBrandColorHex) {
      activeUserBrandColorHex = nextUserBrand;
      changed = true;
    }
  }

  if (update.scheme !== undefined && (update.scheme === 'light' || update.scheme === 'dark')) {
    if (update.scheme !== activeScheme) {
      activeScheme = update.scheme;
      changed = true;
    }
  }

  const effectiveBrand = activeUserBrandColorHex ?? activeBrandColorHex;
  activeResolvedColors = buildResolvedColors(effectiveBrand, activeScheme);

  if (!isLiveWebDom) {
    Object.assign(colors, activeResolvedColors);
    syncShadowColors();
  }
  applyCssVariablesToDom(activeResolvedColors, activeScheme);

  if (changed) {
    for (const listener of Array.from(themeListeners)) {
      try {
        listener();
      } catch {
        // Ignore subscriber errors so theme propagation never breaks rendering
      }
    }
  }

  return activeResolvedColors;
}

export const setActiveTheme = syncActiveTheme;

export function getActiveThemeState(): ActiveThemeState {
  return {
    brandColorHex: activeUserBrandColorHex ?? activeBrandColorHex,
    clinicBrandColorHex: activeBrandColorHex,
    userBrandColorHex: activeUserBrandColorHex,
    scheme: activeScheme,
    resolvedColors: { ...activeResolvedColors },
  };
}

export function subscribeActiveTheme(listener: () => void): () => void {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

/**
 * Font families. Custom fonts do not honour `fontWeight` on native, so each weight is
 * its own family. `Text`/`ThemedText`/`TextInput` (components/ui/Text) resolve the right
 * family from a style's `fontWeight` automatically, so screens keep writing
 * `fontWeight: '600'` and never reference these names directly.
 */
const fonts = {
  sans: {
    '400': 'Geist_400Regular',
    '500': 'Geist_500Medium',
    '600': 'Geist_600SemiBold',
    '700': 'Geist_700Bold',
  },
  mono: {
    '400': 'GeistMono_400Regular',
    '500': 'GeistMono_500Medium',
    '600': 'GeistMono_600SemiBold',
    '700': 'GeistMono_700Bold',
  },
} as const;

const typography = {
  display: { fontSize: fontSizeScale['4xl'], fontWeight: '700' as const, lineHeight: 44, letterSpacing: -0.6 },
  h1: { fontSize: fontSizeScale['3xl'], fontWeight: '700' as const, lineHeight: 36, letterSpacing: -0.4 },
  h2: { fontSize: fontSizeScale['2xl'], fontWeight: '600' as const, lineHeight: 30, letterSpacing: -0.2 },
  title: { fontSize: fontSizeScale.xl, fontWeight: '600' as const, lineHeight: 26 },
  h3: { fontSize: fontSizeScale.lg, fontWeight: '600' as const, lineHeight: 24 },
  bodyLarge: { fontSize: fontSizeScale.lg, fontWeight: '400' as const, lineHeight: 24 },
  body: { fontSize: fontSizeScale.md, fontWeight: '400' as const, lineHeight: 20 },
  bodyBold: { fontSize: fontSizeScale.md, fontWeight: '600' as const, lineHeight: 20 },
  small: { fontSize: fontSizeScale.sm, fontWeight: '400' as const, lineHeight: 18 },
  smallBold: { fontSize: fontSizeScale.sm, fontWeight: '600' as const, lineHeight: 18 },
  caption: { fontSize: fontSizeScale.xs, fontWeight: '400' as const, lineHeight: 16 },
  captionBold: { fontSize: fontSizeScale.xs, fontWeight: '600' as const, lineHeight: 16 },
  badge: { fontSize: fontSizeScale.xs, fontWeight: '600' as const, lineHeight: 16, letterSpacing: 0.2 },
  code: { fontSize: fontSizeScale.xs, fontWeight: '500' as const, lineHeight: 16, fontFamily: fonts.mono['500'] },
};

export interface NativeShadowToken {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export type ThemeShadows = {
  none: NativeShadowToken;
  sm: NativeShadowToken;
  md: NativeShadowToken;
  lg: NativeShadowToken;
  brandSubtle: NativeShadowToken;
  brandSm: NativeShadowToken;
  brandMd: NativeShadowToken;
  dangerSm: NativeShadowToken;
  dangerMd: NativeShadowToken;
  successSm: NativeShadowToken;
  successMd: NativeShadowToken;
};

/**
 * Builds the theme shadow preset map.
 * - On live Web DOM (`useWebBoxShadow = true`), returns pure CSS `{ boxShadow }` objects with
 *   NO Android `elevation` and NO RN `shadow*` props so `react-native-web` never injects
 *   `.r-boxShadow-* { box-shadow: 0px 1px 3px rgba(0,0,0,0.5) }`.
 * - On Native / Node test runners (`useWebBoxShadow = false`), returns standard React Native
 *   `{ shadowColor, shadowOffset, shadowOpacity, shadowRadius, elevation }` objects.
 */
export function createThemeShadows(
  c: Record<ThemeColor, string>,
  useWebBoxShadow: boolean
): ThemeShadows {
  if (useWebBoxShadow) {
    return {
      none: { boxShadow: 'none' } as unknown as NativeShadowToken,
      sm: {
        boxShadow: `0 2px 6px 0 ${c.shadowSmColor}, 0 6px 16px -2px ${c.shadowSmColor}`,
      } as unknown as NativeShadowToken,
      md: {
        boxShadow: `0 4px 10px -1px ${c.shadowMdColor}, 0 10px 24px -3px ${c.shadowSmColor}`,
      } as unknown as NativeShadowToken,
      lg: {
        boxShadow: `0 8px 18px -2px ${c.shadowMdColor}, 0 18px 36px -4px ${c.shadowLgColor}`,
      } as unknown as NativeShadowToken,
      brandSubtle: {
        boxShadow: `0 2px 6px 0 ${c.primaryShadowSubtle}, 0 6px 14px -1px ${c.primaryShadowSubtle}`,
      } as unknown as NativeShadowToken,
      brandSm: {
        boxShadow: `0 4px 10px 0 ${c.primaryShadowSm}, 0 8px 20px -2px ${c.primaryShadowSubtle}`,
      } as unknown as NativeShadowToken,
      brandMd: {
        boxShadow: `0 6px 16px 0 ${c.primaryShadowMd}, 0 12px 28px -3px ${c.primaryShadowSm}`,
      } as unknown as NativeShadowToken,
      dangerSm: {
        boxShadow: `0 4px 10px 0 ${c.dangerShadowSm}, 0 8px 20px -2px ${c.dangerShadowSm}`,
      } as unknown as NativeShadowToken,
      dangerMd: {
        boxShadow: `0 6px 16px 0 ${c.dangerShadowMd}, 0 12px 28px -3px ${c.dangerShadowSm}`,
      } as unknown as NativeShadowToken,
      successSm: {
        boxShadow: `0 4px 10px 0 ${c.successShadowSm}, 0 8px 20px -2px ${c.successShadowSm}`,
      } as unknown as NativeShadowToken,
      successMd: {
        boxShadow: `0 6px 16px 0 ${c.successShadowMd}, 0 12px 28px -3px ${c.successShadowSm}`,
      } as unknown as NativeShadowToken,
    };
  }

  return {
    none: {
      shadowColor: c.transparent,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    sm: {
      shadowColor: c.shadowSmColor,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.09,
      shadowRadius: 6,
      elevation: 2,
    },
    md: {
      shadowColor: c.shadowMdColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.14,
      shadowRadius: 10,
      elevation: 4,
    },
    lg: {
      shadowColor: c.shadowLgColor,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 20,
      elevation: 8,
    },
    brandSubtle: {
      shadowColor: c.primaryShadowSubtle,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.22,
      shadowRadius: 8,
      elevation: 2,
    },
    brandSm: {
      shadowColor: c.primaryShadowSm,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.34,
      shadowRadius: 12,
      elevation: 4,
    },
    brandMd: {
      shadowColor: c.primaryShadowMd,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.46,
      shadowRadius: 16,
      elevation: 6,
    },
    dangerSm: {
      shadowColor: c.dangerShadowSm,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.22,
      shadowRadius: 10,
      elevation: 3,
    },
    dangerMd: {
      shadowColor: c.dangerShadowMd,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.32,
      shadowRadius: 14,
      elevation: 5,
    },
    successSm: {
      shadowColor: c.successShadowSm,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.22,
      shadowRadius: 10,
      elevation: 3,
    },
    successMd: {
      shadowColor: c.successShadowMd,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.32,
      shadowRadius: 14,
      elevation: 5,
    },
  };
}

/**
 * Builds a complete shadow style for dynamic live-preview swatches (e.g. unsaved brand presets
 * in ColorBrandingSection) so Web receives a full CSS `boxShadow` string instead of a partial
 * `{ shadowColor }` override that collapses `shadowOffset` / `shadowRadius` to `0px 0px 0px`.
 */
export function buildPreviewShadowStyle(
  rgbaColor: string,
  level: 'subtle' | 'sm' | 'md',
  useWebBoxShadow: boolean = isLiveWebDom
): NativeShadowToken {
  if (useWebBoxShadow) {
    if (level === 'subtle') {
      return {
        boxShadow: `0 2px 6px 0 ${rgbaColor}, 0 6px 14px -1px ${rgbaColor}`,
      } as unknown as NativeShadowToken;
    }
    if (level === 'sm') {
      return {
        boxShadow: `0 4px 10px 0 ${rgbaColor}, 0 8px 20px -2px ${rgbaColor}`,
      } as unknown as NativeShadowToken;
    }
    return {
      boxShadow: `0 6px 16px 0 ${rgbaColor}, 0 12px 28px -3px ${rgbaColor}`,
    } as unknown as NativeShadowToken;
  }

  if (level === 'subtle') {
    return {
      shadowColor: rgbaColor,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.22,
      shadowRadius: 8,
      elevation: 2,
    };
  }
  if (level === 'sm') {
    return {
      shadowColor: rgbaColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.34,
      shadowRadius: 12,
      elevation: 4,
    };
  }
  return {
    shadowColor: rgbaColor,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.46,
    shadowRadius: 16,
    elevation: 6,
  };
}

const shadows: ThemeShadows = createThemeShadows(colors, isLiveWebDom);

function syncShadowColors(): void {
  if (isLiveWebDom) return;
  shadows.sm.shadowColor = colors.shadowSmColor;
  shadows.md.shadowColor = colors.shadowMdColor;
  shadows.lg.shadowColor = colors.shadowLgColor;
  shadows.brandSubtle.shadowColor = colors.primaryShadowSubtle;
  shadows.brandSm.shadowColor = colors.primaryShadowSm;
  shadows.brandMd.shadowColor = colors.primaryShadowMd;
  shadows.dangerSm.shadowColor = colors.dangerShadowSm;
  shadows.dangerMd.shadowColor = colors.dangerShadowMd;
  shadows.successSm.shadowColor = colors.successShadowSm;
  shadows.successMd.shadowColor = colors.successShadowMd;
}

export const theme = {
  colors,
  fonts,
  fontSizes: fontSizeScale,
  typography,
  spacing: spaceScale,
  radii: radiusScale,
  shadows,

  /** Interactive sizing. `touchTarget` is the minimum hit area on touch devices. */
  sizes: {
    touchTarget: 44,
    controlSm: 32,
    controlMd: 40,
    controlLg: 48,
    iconSm: 16,
    iconMd: 20,
    iconLg: 24,
    sidebarWidth: 260,
    sidebarCollapsedWidth: 72,
    headerHeight: 64,
    contentMaxWidth: 1440,
    borderWidth: 1,
  },

  breakpoints: {
    mobile: 0,
    tablet: 768,
    desktop: 1024,
    wide: 1280,
  },
};

export type Theme = typeof theme;
