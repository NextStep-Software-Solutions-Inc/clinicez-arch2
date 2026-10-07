import { palette } from './palette';

/**
 * Semantic colour tokens - the ONLY colours screens and components may use.
 * Pick by meaning (`surface`, `textMuted`, `emergencyBg`), never by hue.
 *
 * `darkColors` is typed against `lightColors` so the compiler guarantees both
 * schemes define exactly the same keys.
 */
export const lightColors = {
  // Brand (Portal-aligned teal)
  primary: palette.teal[600],
  primaryHover: palette.teal[700],
  primaryDark: palette.teal[800],
  primaryLight: palette.teal[100],
  primarySubtle: palette.teal[50],
  primaryBorder: palette.teal[200],
  primaryText: palette.teal[700],
  onPrimary: palette.slate[0],
  focusRing: palette.teal[500],

  // Clinical urgency
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
  card: palette.slate[0],
  surfaceMuted: palette.slate[50],
  surfaceSubtle: palette.slate[100],
  surfaceHighlight: palette.slate[200],
  surfaceInverse: palette.slate[900],
  inputBackground: palette.slate[0],
  tabBar: palette.slate[0],
  skeletonBase: palette.slate[200],
  skeletonHighlight: palette.slate[100],

  // Sidebar (web workstation shell)
  sidebar: palette.slate[0],
  sidebarBorder: palette.slate[200],
  sidebarActive: palette.teal[50],
  sidebarHover: palette.slate[100],

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

export type ColorToken = keyof typeof lightColors;

export const darkColors: Record<ColorToken, string> = {
  // Brand - lighter teal for contrast on dark surfaces
  primary: palette.teal[400],
  primaryHover: palette.teal[300],
  primaryDark: palette.teal[500],
  primaryLight: palette.teal[900],
  primarySubtle: palette.teal[950],
  primaryBorder: palette.teal[700],
  primaryText: palette.teal[200],
  onPrimary: palette.slate[950],
  focusRing: palette.teal[400],

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

  background: palette.slate[950],
  surface: palette.slate[900],
  card: palette.slate[900],
  surfaceMuted: palette.slate[800],
  surfaceSubtle: palette.slate[800],
  surfaceHighlight: palette.slate[700],
  surfaceInverse: palette.slate[50],
  inputBackground: palette.slate[950],
  tabBar: palette.slate[900],
  skeletonBase: palette.slate[800],
  skeletonHighlight: palette.slate[700],

  sidebar: palette.slate[900],
  sidebarBorder: palette.slate[800],
  sidebarActive: palette.teal[900],
  sidebarHover: palette.slate[800],

  border: palette.slate[800],
  borderLight: palette.slate[800],
  borderDark: palette.slate[700],

  text: palette.slate[50],
  textSecondary: palette.slate[300],
  textMuted: palette.slate[400],
  textLight: palette.slate[500],
  textInverted: palette.slate[950],

  overlay: 'rgba(2, 6, 23, 0.7)',
  shadow: '#000000',
  transparent: 'transparent',
};

export type ColorScheme = 'light' | 'dark';

export const colorSchemes: Record<ColorScheme, Record<ColorToken, string>> = {
  light: lightColors,
  dark: darkColors,
};
