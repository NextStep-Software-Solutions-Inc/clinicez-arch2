import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';

/**
 * Clinical Empathy Design System tokens (from DESIGN.md & Home/Search screenshots).
 *
 * Lives inside `constants/` so every Home & Search component consumes semantic
 * tokens, typography presets, radii, and elevation styles with zero hardcoded
 * color, fontSize, or borderRadius literals in component files.
 */

export type ClinicalFontWeight = '400' | '500' | '600' | '700';

const PLUS_JAKARTA_FAMILIES: Record<ClinicalFontWeight, string> = {
  '400': 'PlusJakartaSans_400Regular',
  '500': 'PlusJakartaSans_500Medium',
  '600': 'PlusJakartaSans_600SemiBold',
  '700': 'PlusJakartaSans_700Bold',
};

const WEB_SANS_FALLBACK =
  "'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

let plusJakartaLoaded = true;
export function setClinicalEmpathyFontsAvailable(available: boolean) {
  plusJakartaLoaded = available;
}

export function ceFont(weight: ClinicalFontWeight = '400'): Pick<TextStyle, 'fontFamily' | 'fontWeight'> {
  if (!plusJakartaLoaded) {
    return { fontWeight: weight };
  }
  const family = PLUS_JAKARTA_FAMILIES[weight];
  if (Platform.OS === 'web') {
    return {
      fontFamily: `${family}, ${WEB_SANS_FALLBACK}`,
      fontWeight: weight,
    };
  }
  return {
    fontFamily: family,
    fontWeight: 'normal',
  };
}

export interface ClinicalEmpathyColors {
  canvas: string;
  surface: string;
  surfaceElevated: string;
  surfaceTint: string;
  surfaceLow: string;
  surfaceContainer: string;
  border: string;
  borderSubtle: string;
  borderFocus: string;
  primary: string;
  primaryVibrant: string;
  primaryDeep: string;
  primaryGradientStart: string;
  primaryGradientEnd: string;
  onPrimary: string;
  mintSoftBg: string;
  mintBadgeBg: string;
  mintBadgeBorder: string;
  mintAvatarBg: string;
  mintAvatarText: string;
  welcomeSurface: string;
  welcomeBorder: string;
  lavenderSoftBg: string;
  lavenderIcon: string;
  skySoftBg: string;
  skyIcon: string;
  roseSoftBg: string;
  roseAccent: string;
  emeraldSoftBg: string;
  emeraldText: string;
  emeraldDot: string;
  amberSoftBg: string;
  amberText: string;
  navyText: string;
  bodyText: string;
  mutedText: string;
  subtleText: string;
  slatePillBg: string;
  slatePillText: string;
  inverseSurface: string;
  inverseText: string;
  inverseAccent: string;
  glassPillBg: string;
  glassPillBorder: string;
  glassWaveBg: string;
  healthPassMuted: string;
  sleepBarMuted: string;
  sleepBarActive: string;
  backdropScrim: string;
}

export const clinicalEmpathyLightColors: ClinicalEmpathyColors = {
  canvas: '#F6F8FC',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceTint: '#F1F5F9',
  surfaceLow: '#EFF4FF',
  surfaceContainer: '#E8EEF8',
  border: '#E2E8F0',
  borderSubtle: '#EEF2F7',
  borderFocus: '#0D9488',
  primary: '#00685F',
  primaryVibrant: '#0D9488',
  primaryDeep: '#005049',
  primaryGradientStart: '#128377',
  primaryGradientEnd: '#00564D',
  onPrimary: '#FFFFFF',
  mintSoftBg: '#E6F7F4',
  mintBadgeBg: '#CCFBF1',
  mintBadgeBorder: '#99F6E4',
  mintAvatarBg: '#71F8E4',
  mintAvatarText: '#005048',
  welcomeSurface: '#EEF9F8',
  welcomeBorder: '#CDECE8',
  lavenderSoftBg: '#E6EBFA',
  lavenderIcon: '#4E5D8C',
  skySoftBg: '#E5EEFF',
  skyIcon: '#00685F',
  roseSoftBg: '#FFE9EC',
  roseAccent: '#DC2626',
  emeraldSoftBg: '#DCFCE7',
  emeraldText: '#059669',
  emeraldDot: '#10B981',
  amberSoftBg: '#FEF3C7',
  amberText: '#D97706',
  navyText: '#0B1C30',
  bodyText: '#334155',
  mutedText: '#64748B',
  subtleText: '#94A3B8',
  slatePillBg: '#E8EEF8',
  slatePillText: '#1E293B',
  inverseSurface: '#213145',
  inverseText: '#EAF1FF',
  inverseAccent: '#4FDBC8',
  glassPillBg: 'rgba(255, 255, 255, 0.16)',
  glassPillBorder: 'rgba(255, 255, 255, 0.24)',
  glassWaveBg: 'rgba(255, 255, 255, 0.18)',
  healthPassMuted: 'rgba(244, 255, 252, 0.85)',
  sleepBarMuted: '#CBD5E1',
  sleepBarActive: '#334155',
  backdropScrim: 'rgba(11, 28, 48, 0.45)',
};

export const clinicalEmpathyDarkColors: ClinicalEmpathyColors = {
  canvas: '#0B1320',
  surface: '#131E30',
  surfaceElevated: '#19273D',
  surfaceTint: '#1E2D45',
  surfaceLow: '#172338',
  surfaceContainer: '#22324C',
  border: '#263650',
  borderSubtle: '#1D2B42',
  borderFocus: '#2DD4BF',
  primary: '#14B8A6',
  primaryVibrant: '#2DD4BF',
  primaryDeep: '#0F766E',
  primaryGradientStart: '#0F766E',
  primaryGradientEnd: '#064E49',
  onPrimary: '#FFFFFF',
  mintSoftBg: 'rgba(20, 184, 166, 0.16)',
  mintBadgeBg: 'rgba(45, 212, 191, 0.18)',
  mintBadgeBorder: 'rgba(45, 212, 191, 0.32)',
  mintAvatarBg: '#115E59',
  mintAvatarText: '#99F6E4',
  welcomeSurface: '#11262B',
  welcomeBorder: '#1E464D',
  lavenderSoftBg: 'rgba(129, 140, 248, 0.18)',
  lavenderIcon: '#A5B4FC',
  skySoftBg: 'rgba(56, 189, 248, 0.16)',
  skyIcon: '#5EEAD4',
  roseSoftBg: 'rgba(244, 63, 94, 0.18)',
  roseAccent: '#FB7185',
  emeraldSoftBg: 'rgba(16, 185, 129, 0.18)',
  emeraldText: '#34D399',
  emeraldDot: '#10B981',
  amberSoftBg: 'rgba(245, 158, 11, 0.18)',
  amberText: '#FBBF24',
  navyText: '#F1F5F9',
  bodyText: '#CBD5E1',
  mutedText: '#94A3B8',
  subtleText: '#64748B',
  slatePillBg: '#1E2D45',
  slatePillText: '#E2E8F0',
  inverseSurface: '#1E293B',
  inverseText: '#F8FAFC',
  inverseAccent: '#5EEAD4',
  glassPillBg: 'rgba(255, 255, 255, 0.16)',
  glassPillBorder: 'rgba(255, 255, 255, 0.24)',
  glassWaveBg: 'rgba(255, 255, 255, 0.18)',
  healthPassMuted: 'rgba(244, 255, 252, 0.85)',
  sleepBarMuted: '#334155',
  sleepBarActive: '#94A3B8',
  backdropScrim: 'rgba(2, 6, 23, 0.7)',
};

export const clinicalRadii = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
} as const;

export const clinicalSpacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export function buildClinicalTypography() {
  return {
    displayLg: {
      ...ceFont('700'),
      fontSize: 34,
      lineHeight: 40,
      letterSpacing: -0.68,
    } satisfies TextStyle,
    headlineLg: {
      ...ceFont('700'),
      fontSize: 24,
      lineHeight: 30,
      letterSpacing: -0.4,
    } satisfies TextStyle,
    headlineMd: {
      ...ceFont('700'),
      fontSize: 20,
      lineHeight: 26,
      letterSpacing: -0.3,
    } satisfies TextStyle,
    headlineSm: {
      ...ceFont('700'),
      fontSize: 18,
      lineHeight: 24,
      letterSpacing: -0.2,
    } satisfies TextStyle,
    cardTitle: {
      ...ceFont('700'),
      fontSize: 17,
      lineHeight: 22,
      letterSpacing: -0.2,
    } satisfies TextStyle,
    bodyLg: {
      ...ceFont('400'),
      fontSize: 15,
      lineHeight: 22,
    } satisfies TextStyle,
    bodyMd: {
      ...ceFont('400'),
      fontSize: 14,
      lineHeight: 20,
    } satisfies TextStyle,
    bodyMedium: {
      ...ceFont('500'),
      fontSize: 14,
      lineHeight: 20,
    } satisfies TextStyle,
    bodySm: {
      ...ceFont('400'),
      fontSize: 12,
      lineHeight: 17,
    } satisfies TextStyle,
    bodySmMedium: {
      ...ceFont('500'),
      fontSize: 12,
      lineHeight: 17,
    } satisfies TextStyle,
    labelLg: {
      ...ceFont('600'),
      fontSize: 15,
      lineHeight: 20,
      letterSpacing: -0.1,
    } satisfies TextStyle,
    labelBold: {
      ...ceFont('700'),
      fontSize: 14,
      lineHeight: 19,
    } satisfies TextStyle,
    labelMd: {
      ...ceFont('600'),
      fontSize: 13,
      lineHeight: 18,
    } satisfies TextStyle,
    labelSm: {
      ...ceFont('600'),
      fontSize: 11,
      lineHeight: 14,
      letterSpacing: 0.2,
    } satisfies TextStyle,
    overline: {
      ...ceFont('700'),
      fontSize: 11,
      lineHeight: 14,
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    } satisfies TextStyle,
    brandSubtitle: {
      ...ceFont('600'),
      fontSize: 10,
      lineHeight: 13,
      letterSpacing: 0.75,
      textTransform: 'uppercase',
    } satisfies TextStyle,
    numericMetric: {
      ...ceFont('700'),
      fontSize: 28,
      lineHeight: 34,
      letterSpacing: -0.6,
      fontVariant: ['tabular-nums'],
    } satisfies TextStyle,
    numericMetricCompact: {
      ...ceFont('700'),
      fontSize: 24,
      lineHeight: 30,
      letterSpacing: -0.5,
      fontVariant: ['tabular-nums'],
    } satisfies TextStyle,
  };
}

export const clinicalElevation = {
  card: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.045,
      shadowRadius: 8,
    },
    android: {
      elevation: 1,
    },
    default: {
      boxShadow: '0px 2px 8px -2px rgba(15, 23, 42, 0.05), 0px 1px 3px -1px rgba(15, 23, 42, 0.03)',
    } as ViewStyle,
  })!,
  interactive: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.06,
      shadowRadius: 14,
    },
    android: {
      elevation: 2,
    },
    default: {
      boxShadow: '0px 8px 16px -4px rgba(15, 23, 42, 0.06), 0px 2px 4px -2px rgba(13, 148, 136, 0.04)',
    } as ViewStyle,
  })!,
  floatingBanner: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#0B1C30',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.2,
      shadowRadius: 18,
    },
    android: {
      elevation: 6,
    },
    default: {
      boxShadow: '0px 12px 24px -6px rgba(11, 28, 48, 0.22)',
    } as ViewStyle,
  })!,
};

export function useClinicalEmpathyTheme() {
  const appTheme = useAppTheme();
  const colors = appTheme.dark ? clinicalEmpathyDarkColors : clinicalEmpathyLightColors;
  const typography = buildClinicalTypography();
  return {
    dark: appTheme.dark,
    colors,
    typography,
    radii: clinicalRadii,
    spacing: clinicalSpacing,
    elevation: clinicalElevation,
  };
}
