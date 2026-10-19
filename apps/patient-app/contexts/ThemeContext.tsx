import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { createTheme, type AppTheme } from '../constants/theme';
import { useAppearance } from './AppearanceContext';

const ThemeContext = createContext<AppTheme | undefined>(undefined);

/**
 * Resolves the user's Light / Dark / System preference (AppearanceContext) into a
 * concrete semantic theme. Must be rendered inside <AppearanceProvider>.
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const { themePreference } = useAppearance();

  const scheme =
    themePreference === 'dark'
      ? 'dark'
      : themePreference === 'light'
        ? 'light'
        : systemScheme === 'dark'
          ? 'dark'
          : 'light';

  const theme = useMemo(() => createTheme(scheme), [scheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): AppTheme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useAppTheme must be used within an AppThemeProvider');
  return theme;
}

/**
 * Memoised `StyleSheet`-style factory bound to the current theme:
 *   const styles = useThemedStyles((t) => ({ card: { backgroundColor: t.colors.surface } }));
 */
export function useThemedStyles<T>(factory: (theme: AppTheme) => T): T {
  const theme = useAppTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(theme), [theme]);
}
