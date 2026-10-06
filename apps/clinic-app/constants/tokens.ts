/**
 * Primitive design tokens.
 *
 * These are the raw values of the ClinicEz design system. Screens and components
 * must NOT import from this file - they consume the semantic layer in `theme.ts`
 * (`theme.colors.surface`, `theme.typography.body`, ...). That indirection is what
 * lets us re-skin the product (or add dark mode) by changing one file.
 *
 * Brand is aligned with the ClinicEz Portal: teal #0D6963 primary, #D9FAF1 accent.
 */

export const palette = {
  teal: {
    50: '#F0FDF9',
    100: '#D9FAF1',
    200: '#A8EEDC',
    300: '#6EDCC3',
    400: '#34C3A6',
    500: '#12907F',
    600: '#0D6963',
    700: '#0A5651',
    800: '#084541',
    900: '#052E2B',
  },
  slate: {
    0: '#FFFFFF',
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    900: '#0F172A',
  },
  red: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    600: '#DC2626',
    800: '#991B1B',
  },
  orange: {
    100: '#FFEDD5',
    200: '#FED7AA',
    600: '#EA580C',
    700: '#C2410C',
  },
  amber: {
    100: '#FEF3C7',
    200: '#FDE68A',
    600: '#D97706',
    700: '#B45309',
  },
  green: {
    100: '#DCFCE7',
    200: '#BBF7D0',
    600: '#16A34A',
    700: '#15803D',
  },
  blue: {
    100: '#DBEAFE',
    200: '#BFDBFE',
    600: '#2563EB',
    700: '#1D4ED8',
  },
  violet: {
    100: '#F3E8FF',
    200: '#E9D5FF',
    600: '#7E22CE',
    800: '#6B21A8',
  },
} as const;

/**
 * Type scale (px). Minimum is 12 - nothing in a clinical UI should be smaller.
 */
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
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
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
