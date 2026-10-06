import {
  palette,
  fontSizeScale,
  spaceScale,
  radiusScale,
} from './tokens';

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

const colors = {
  // Brand (Portal-aligned teal)
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

  // Overlays
  overlay: 'rgba(15, 23, 42, 0.55)',
  shadow: palette.slate[900],
  transparent: 'transparent',
} as const;

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

const shadowBase = {
  shadowColor: colors.shadow,
};

const shadows = {
  none: {
    shadowColor: colors.transparent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    ...shadowBase,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    ...shadowBase,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    ...shadowBase,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
};

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
export type ThemeColor = keyof typeof colors;
