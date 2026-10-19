import { Platform } from 'react-native';
import type { Theme } from '@react-navigation/native';
import { fontFamilies } from '@clinicez/design-tokens';
import type { AppTheme } from './theme';

const WEB_FALLBACK =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function face(weight: '400' | '500' | '600' | '700') {
  const family = fontFamilies.sans[weight];
  return {
    // Custom fonts ignore fontWeight on native: each weight is its own family.
    fontFamily: Platform.OS === 'web' ? `${family}, ${WEB_FALLBACK}` : family,
    fontWeight: 'normal' as const,
  };
}

/**
 * React Navigation theme derived from the semantic tokens, so native headers, tab bars,
 * sheets and the web chrome all share the Clinic EZ brand instead of platform defaults.
 */
export function buildNavigationTheme(theme: AppTheme): Theme {
  const { colors } = theme;
  return {
    dark: theme.dark,
    colors: {
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.emergency,
    },
    fonts: {
      regular: face('400'),
      medium: face('500'),
      bold: face('600'),
      heavy: face('700'),
    },
  };
}
