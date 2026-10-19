import {
  breakpoints,
  colorSchemes,
  fontFamilies,
  fontSizeScale,
  radiusScale,
  sizes,
  spaceScale,
  typography,
  type ColorScheme,
  type ColorToken,
} from '@clinicez/design-tokens';

/**
 * Semantic theme for the patient app.
 *
 * Rules (enforced by `bun run lint:tokens`):
 *  - No raw hex / rgba / fontSize / borderRadius outside `constants/`.
 *  - Choose colours by meaning (`surface`, `textMuted`, `emergencyBg`), never by hue.
 *  - Get the theme with `useAppTheme()` (contexts/ThemeContext) so dark mode just works.
 *  - Type goes through <ThemedText variant="..."> (or `theme.typography.*`).
 */

function elevation(opacity: number, offsetY: number, blur: number, color: string): string {
  return `0px ${offsetY}px ${blur}px ${color.replace('{o}', String(opacity))}`;
}

function buildShadows(dark: boolean) {
  const base = dark ? 'rgba(0, 0, 0, {o})' : 'rgba(15, 23, 42, {o})';
  const k = dark ? 3 : 1; // shadows are barely visible on dark surfaces; strengthen them
  return {
    none: { boxShadow: 'none' },
    sm: { boxShadow: elevation(0.05 * k, 1, 2, base) },
    md: { boxShadow: elevation(0.08 * k, 2, 8, base) },
    lg: { boxShadow: elevation(0.12 * k, 8, 24, base) },
  } as const;
}

function buildTheme(scheme: ColorScheme) {
  const dark = scheme === 'dark';
  return {
    scheme,
    dark,
    colors: colorSchemes[scheme],
    fonts: fontFamilies,
    fontSizes: fontSizeScale,
    typography,
    spacing: spaceScale,
    radii: radiusScale,
    shadows: buildShadows(dark),
    sizes,
    breakpoints,
  };
}

const themes = {
  light: buildTheme('light'),
  dark: buildTheme('dark'),
} as const;

export type AppTheme = ReturnType<typeof buildTheme>;
export type { ColorToken, ColorScheme };

export function createTheme(scheme: ColorScheme): AppTheme {
  return themes[scheme];
}

export const lightTheme = themes.light;
export const darkTheme = themes.dark;
