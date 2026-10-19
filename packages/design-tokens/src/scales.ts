/** Type scale (px). Minimum is 12 - nothing in a clinical UI should be smaller. */
export const fontSizeScale = {
  xs: 12,
  sm: 13,
  md: 14,
  lg: 16,
  xl: 18,
  '2xl': 22,
  '3xl': 28,
  '4xl': 36,
} as const;

/** 4px grid. */
export const spaceScale = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 56,
} as const;

/** Corner radii. `md` matches the Portal `--radius` (0.625rem = 10px). */
export const radiusScale = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  '2xl': 24,
  full: 9999,
} as const;

export const breakpoints = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
  wide: 1280,
} as const;

export const sizes = {
  /** Minimum hit area on touch devices. */
  touchTarget: 44,
  controlSm: 32,
  controlMd: 40,
  controlLg: 48,
  iconSm: 16,
  iconMd: 20,
  iconLg: 24,
  iconXl: 32,
  avatarSm: 32,
  avatarMd: 40,
  avatarLg: 64,
  sidebarWidth: 260,
  sidebarCollapsedWidth: 72,
  headerHeight: 64,
  contentMaxWidth: 1200,
  contentMaxWidthWide: 1440,
  formMaxWidth: 720,
  dialogWidth: 560,
  borderWidth: 1,
} as const;

/** Font family names (Geist). Each weight is its own family on native. */
export const fontFamilies = {
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
