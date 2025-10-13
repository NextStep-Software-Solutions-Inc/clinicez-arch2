export type ThemeColorToken =
  | "primary"
  | "primaryDark"
  | "primaryForeground"
  | "primaryContrast"
  | "primarySoft"
  | "primarySoftDark"
  | "secondary"
  | "secondaryDark"
  | "secondarySoft"
  | "secondarySoftDark"
  | "accent"
  | "accentDark"
  | "success"
  | "successDark"
  | "warning"
  | "warningDark"
  | "error"
  | "errorDark"
  | "info"
  | "infoDark"
  | "muted"
  | "mutedDark"
  | "mutedForeground"
  | "mutedForegroundDark"
  | "text"
  | "textDark"
  | "textSecondary"
  | "textSecondaryDark"
  | "background"
  | "backgroundDark"
  | "surface"
  | "surfaceDark"
  | "surfaceElevated"
  | "surfaceElevatedDark"
  | "border"
  | "borderDark"
  | "input"
  | "inputDark"
  | "ring"
  | "ringDark";

const basePalette: Record<ThemeColorToken, { light: string; dark: string }> = {
  primary: { light: "#3B71FF", dark: "#60A5FA" },
  primaryDark: { light: "#2750C6", dark: "#3B71FF" },
  primaryForeground: { light: "#FFFFFF", dark: "#0F172A" },
  primaryContrast: { light: "#0F172A", dark: "#E2E8F0" },
  primarySoft: { light: "#E8EEFF", dark: "#1B2A4C" },
  primarySoftDark: { light: "#CFDBFF", dark: "#14203B" },
  secondary: { light: "#A855F7", dark: "#C084FC" },
  secondaryDark: { light: "#7C3AED", dark: "#A855F7" },
  secondarySoft: { light: "#F3E8FF", dark: "#2D1B4B" },
  secondarySoftDark: { light: "#E9D5FF", dark: "#24123D" },
  accent: { light: "#DFEAFC", dark: "#243152" },
  accentDark: { light: "#BFD2F6", dark: "#1B253F" },
  success: { light: "#10B981", dark: "#34D399" },
  successDark: { light: "#059669", dark: "#22C55E" },
  warning: { light: "#E4C34A", dark: "#FACC15" },
  warningDark: { light: "#CA8A04", dark: "#FBBF24" },
  error: { light: "#BF3532", dark: "#F87171" },
  errorDark: { light: "#991B1B", dark: "#EF4444" },
  info: { light: "#2563EB", dark: "#60A5FA" },
  infoDark: { light: "#1D4ED8", dark: "#3B82F6" },
  muted: { light: "#6B7280", dark: "#9CA3AF" },
  mutedDark: { light: "#4B5563", dark: "#94A3B8" },
  mutedForeground: { light: "#9CA3AF", dark: "#CBD5F5" },
  mutedForegroundDark: { light: "#6B7280", dark: "#CBD5F5" },
  text: { light: "#0F172A", dark: "#F8FAFC" },
  textDark: { light: "#111827", dark: "#F1F5F9" },
  textSecondary: { light: "#4B5563", dark: "#CBD5F5" },
  textSecondaryDark: { light: "#1F2937", dark: "#94A3B8" },
  background: { light: "#FFFFFF", dark: "#0F172A" },
  backgroundDark: { light: "#F8FAFC", dark: "#020617" },
  surface: { light: "#F9FAFB", dark: "#111827" },
  surfaceDark: { light: "#F3F4F6", dark: "#0B1120" },
  surfaceElevated: { light: "#FFFFFF", dark: "#1F2937" },
  surfaceElevatedDark: { light: "#E5E7EB", dark: "#0F172A" },
  border: { light: "#E5E7EB", dark: "#1F2937" },
  borderDark: { light: "#CBD5E1", dark: "#334155" },
  input: { light: "#F3F4F6", dark: "#1F2937" },
  inputDark: { light: "#E2E8F0", dark: "#0F172A" },
  ring: { light: "#3B82F6", dark: "#2563EB" },
  ringDark: { light: "#1D4ED8", dark: "#1E40AF" },
};

export const isThemeColorToken = (value: string): value is ThemeColorToken =>
  Object.prototype.hasOwnProperty.call(basePalette, value);

export const getThemeColor = (
  token: ThemeColorToken,
  scheme: "light" | "dark" = "light"
): string => basePalette[token][scheme];

export const tailwindColorPalette = {
  primary: {
    DEFAULT: basePalette.primary.light,
    dark: basePalette.primary.dark,
    foreground: basePalette.primaryForeground.light,
    contrast: basePalette.primaryContrast.light,
    "contrast-dark": basePalette.primaryContrast.dark,
    soft: basePalette.primarySoft.light,
    "soft-dark": basePalette.primarySoft.dark,
  },
  secondary: {
    DEFAULT: basePalette.secondary.light,
    dark: basePalette.secondary.dark,
    soft: basePalette.secondarySoft.light,
    "soft-dark": basePalette.secondarySoft.dark,
    foreground: basePalette.primaryForeground.light,
  },
  accent: {
    DEFAULT: basePalette.accent.light,
    dark: basePalette.accent.dark,
  },
  success: {
    DEFAULT: basePalette.success.light,
    dark: basePalette.success.dark,
  },
  warning: {
    DEFAULT: basePalette.warning.light,
    dark: basePalette.warning.dark,
  },
  error: {
    DEFAULT: basePalette.error.light,
    dark: basePalette.error.dark,
  },
  info: {
    DEFAULT: basePalette.info.light,
    dark: basePalette.info.dark,
  },
  muted: {
    DEFAULT: basePalette.muted.light,
    dark: basePalette.muted.dark,
    foreground: basePalette.mutedForeground.light,
    "foreground-dark": basePalette.mutedForeground.dark,
  },
  text: {
    DEFAULT: basePalette.text.light,
    dark: basePalette.text.dark,
    secondary: basePalette.textSecondary.light,
    "secondary-dark": basePalette.textSecondary.dark,
  },
  surface: {
    DEFAULT: basePalette.surface.light,
    dark: basePalette.surface.dark,
    elevated: basePalette.surfaceElevated.light,
    "elevated-dark": basePalette.surfaceElevated.dark,
  },
  background: {
    DEFAULT: basePalette.background.light,
    dark: basePalette.background.dark,
  },
  border: {
    DEFAULT: basePalette.border.light,
    dark: basePalette.border.dark,
  },
  input: {
    DEFAULT: basePalette.input.light,
    dark: basePalette.input.dark,
  },
  ring: {
    DEFAULT: basePalette.ring.light,
    dark: basePalette.ring.dark,
  },
} as const;

export type TailwindColorPalette = typeof tailwindColorPalette;
