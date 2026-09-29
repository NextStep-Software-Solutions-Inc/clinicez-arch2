export const theme = {
  colors: {
    // Primary Clinical Sky Palette
    primary: '#0284C7',
    primaryHover: '#0369A1',
    primaryLight: '#E0F2FE',
    primaryLighter: '#F0F9FF',
    primarySubtle: '#F0F9FF',
    primaryDark: '#075985',

    // Secondary Indigo Palette
    secondary: '#4F46E5',
    secondaryLight: '#EEF2FF',
    secondaryDark: '#3730A3',

    // Clinical Triage Urgency
    emergency: '#DC2626',
    emergencyBg: '#FEE2E2',
    emergencyBorder: '#FECACA',
    emergencyText: '#991B1B',

    urgent: '#EA580C',
    urgentBg: '#FFEDD5',
    urgentBorder: '#FED7AA',
    urgentText: '#C2410C',

    routine: '#0284C7',
    routineBg: '#E0F2FE',
    routineBorder: '#BAE6FD',
    routineText: '#0369A1',

    // Status Colors
    success: '#16A34A',
    successBg: '#DCFCE7',
    successBorder: '#BBF7D0',
    successText: '#15803D',

    warning: '#D97706',
    warningBg: '#FEF3C7',
    warningBorder: '#FDE68A',
    warningText: '#B45309',

    purple: '#7E22CE',
    purpleBg: '#F3E8FF',
    purpleBorder: '#E9D5FF',
    purpleText: '#6B21A8',

    // Neutral Palette (Slate)
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceSubtle: '#F1F5F9',
    surfaceHighlight: '#E2E8F0',

    border: '#E2E8F0',
    borderLight: '#F1F5F9',
    borderDark: '#CBD5E1',

    text: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#64748B',
    textLight: '#94A3B8',
    textInverted: '#FFFFFF',

    // Modals & Backdrops
    overlay: 'rgba(15, 23, 42, 0.65)',
  },

  typography: {
    display: {
      fontSize: 32,
      fontWeight: '800' as const,
      lineHeight: 40,
      letterSpacing: -0.5,
    },
    h1: {
      fontSize: 26,
      fontWeight: '800' as const,
      lineHeight: 34,
      letterSpacing: -0.3,
    },
    h2: {
      fontSize: 20,
      fontWeight: '700' as const,
      lineHeight: 28,
    },
    h3: {
      fontSize: 16,
      fontWeight: '700' as const,
      lineHeight: 24,
    },
    bodyLarge: {
      fontSize: 15,
      fontWeight: '400' as const,
      lineHeight: 22,
    },
    body: {
      fontSize: 14,
      fontWeight: '400' as const,
      lineHeight: 20,
    },
    bodyBold: {
      fontSize: 14,
      fontWeight: '600' as const,
      lineHeight: 20,
    },
    caption: {
      fontSize: 12,
      fontWeight: '400' as const,
      lineHeight: 16,
    },
    captionBold: {
      fontSize: 12,
      fontWeight: '600' as const,
      lineHeight: 16,
    },
    badge: {
      fontSize: 11,
      fontWeight: '700' as const,
      lineHeight: 14,
    },
    code: {
      fontSize: 12,
      fontWeight: '700' as const,
      fontFamily: 'monospace',
    },
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    '2xl': 24,
    '3xl': 32,
    '4xl': 40,
  },

  radii: {
    xs: 4,
    sm: 6,
    md: 8,
    lg: 12,
    xl: 16,
    '2xl': 20,
    full: 9999,
  },

  shadows: {
    none: {
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    sm: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    md: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 3,
    },
    lg: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 6,
    },
  },

  breakpoints: {
    mobile: 0,
    tablet: 768,
    desktop: 1024,
    wide: 1280,
  },
};

export type Theme = typeof theme;
