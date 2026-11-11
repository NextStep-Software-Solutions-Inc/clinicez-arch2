import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as ReactNative from 'react-native';
import { Platform } from 'react-native';
import type { IconName } from '../components/ui/Icon';
import { HEX_COLOR } from '../constants/color';
import {
  syncActiveTheme,
  type ThemeColorScheme,
} from '../constants/theme';
import { getDeviceItem, setDeviceItem } from '../utils/deviceStorage';

const Appearance =
  (ReactNative as any).Appearance ?? (ReactNative as any).default?.Appearance;

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeModeOption {
  mode: ThemeMode;
  label: string;
  badgeLabel: string;
  description: string;
  icon: IconName;
}

export const THEME_MODE_STORAGE_KEY = 'clinicez.themeMode';
export const USER_ACCENT_COLOR_STORAGE_KEY = 'clinicez.userAccentColor';

export const THEME_MODE_OPTIONS: readonly ThemeModeOption[] = [
  {
    mode: 'light',
    label: 'Light',
    badgeLabel: 'Light Mode',
    description: 'Bright, clear backgrounds for well-lit clinic rooms',
    icon: 'sun',
  },
  {
    mode: 'dark',
    label: 'Dark',
    badgeLabel: 'Dark Mode',
    description: 'Soft dark backgrounds for dim rooms and evening shifts',
    icon: 'moon',
  },
  {
    mode: 'system',
    label: 'Match Device',
    badgeLabel: 'Match Device',
    description: "Automatically follow your device's light or dark setting",
    icon: 'monitor',
  },
];

export function normalizeThemeMode(raw?: string | null): ThemeMode {
  const cleaned = (raw ?? '').trim().toLowerCase();
  if (cleaned === 'dark' || cleaned === 'light' || cleaned === 'system') {
    return cleaned;
  }
  return 'light';
}

export function normalizeUserBrandColorHex(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim();
  if (!cleaned || cleaned.toLowerCase() === 'inherit') return null;
  return HEX_COLOR.test(cleaned) ? cleaned.toUpperCase() : null;
}

export function resolveSystemColorScheme(): ThemeColorScheme {
  if (Platform.OS === 'web' || typeof window !== 'undefined') {
    try {
      if (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)')?.matches
      ) {
        return 'dark';
      }
    } catch {
      // Ignore matchMedia errors in restricted / test environments
    }
    if (Platform.OS === 'web') {
      return 'light';
    }
  }

  try {
    const nativeScheme = Appearance?.getColorScheme?.();
    if (nativeScheme === 'dark') {
      return 'dark';
    }
  } catch {
    // Ignore native Appearance errors
  }

  return 'light';
}

export function resolveEffectiveColorScheme(
  mode: ThemeMode,
  systemScheme: ThemeColorScheme = resolveSystemColorScheme(),
): ThemeColorScheme {
  if (mode === 'system') {
    return systemScheme;
  }
  return mode;
}

function applyThemeSync(update: {
  scheme?: ThemeColorScheme;
  userBrandColorHex?: string | null;
}): void {
  try {
    if (typeof syncActiveTheme === 'function') {
      (syncActiveTheme as any)(update);
    }
  } catch {
    // Guard against partial mocks in isolated unit tests
  }
}

export function readStoredThemeMode(): ThemeMode {
  try {
    return normalizeThemeMode(getDeviceItem(THEME_MODE_STORAGE_KEY));
  } catch {
    return 'light';
  }
}

export function readStoredUserBrandColorHex(): string | null {
  try {
    return normalizeUserBrandColorHex(getDeviceItem(USER_ACCENT_COLOR_STORAGE_KEY));
  } catch {
    return null;
  }
}

export interface ThemeModeContextValue {
  themeMode: ThemeMode;
  colorScheme: ThemeColorScheme;
  isDark: boolean;
  userBrandColorHex: string | null;
  setThemeMode: (mode: ThemeMode) => void;
  toggleDarkMode: () => void;
  setUserBrandColorHex: (hex: string | null) => void;
}

interface InternalThemeModeContextValue extends ThemeModeContextValue {
  __hasProvider: boolean;
}

const FALLBACK_CONTEXT_VALUE: InternalThemeModeContextValue = {
  __hasProvider: false,
  themeMode: 'light',
  colorScheme: 'light',
  isDark: false,
  userBrandColorHex: null,
  setThemeMode: (next: ThemeMode) => {
    const normalized = normalizeThemeMode(next);
    try {
      setDeviceItem(THEME_MODE_STORAGE_KEY, normalized);
    } catch {
      // ignore storage failure
    }
    applyThemeSync({ scheme: resolveEffectiveColorScheme(normalized) });
  },
  toggleDarkMode: () => {
    const currentMode = readStoredThemeMode();
    const currentScheme = resolveEffectiveColorScheme(currentMode);
    const nextMode: ThemeMode = currentScheme === 'dark' ? 'light' : 'dark';
    try {
      setDeviceItem(THEME_MODE_STORAGE_KEY, nextMode);
    } catch {
      // ignore storage failure
    }
    applyThemeSync({ scheme: nextMode });
  },
  setUserBrandColorHex: (hex: string | null) => {
    const normalized = normalizeUserBrandColorHex(hex);
    try {
      setDeviceItem(USER_ACCENT_COLOR_STORAGE_KEY, normalized);
    } catch {
      // ignore storage failure
    }
    applyThemeSync({ userBrandColorHex: normalized });
  },
};

const ThemeModeContext = createContext<InternalThemeModeContextValue>(FALLBACK_CONTEXT_VALUE);

export interface ThemeModeProviderProps {
  children: ReactNode;
  initialMode?: ThemeMode;
  initialUserBrandColorHex?: string | null;
}

export function ThemeModeProvider({
  children,
  initialMode,
  initialUserBrandColorHex,
}: ThemeModeProviderProps) {
  const [systemScheme, setSystemScheme] = useState<ThemeColorScheme>(() =>
    resolveSystemColorScheme(),
  );

  const [userBrandColorHex, setUserBrandColorState] = useState<string | null>(() => {
    const resolvedUserHex =
      initialUserBrandColorHex !== undefined
        ? normalizeUserBrandColorHex(initialUserBrandColorHex)
        : readStoredUserBrandColorHex();
    applyThemeSync({ userBrandColorHex: resolvedUserHex });
    return resolvedUserHex;
  });

  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    const resolvedMode =
      initialMode !== undefined ? normalizeThemeMode(initialMode) : readStoredThemeMode();
    const initialEffective = resolveEffectiveColorScheme(resolvedMode, resolveSystemColorScheme());
    applyThemeSync({ scheme: initialEffective });
    return resolvedMode;
  });

  const colorScheme = resolveEffectiveColorScheme(themeMode, systemScheme);
  const isDark = colorScheme === 'dark';

  // Keep runtime theme synced whenever effective colorScheme or userBrandColorHex changes
  useEffect(() => {
    applyThemeSync({ scheme: colorScheme, userBrandColorHex });
  }, [colorScheme, userBrandColorHex]);

  // Subscribe to OS / browser color-scheme changes
  useEffect(() => {
    setSystemScheme(resolveSystemColorScheme());

    if (Platform.OS === 'web' || (typeof window !== 'undefined' && typeof window.matchMedia === 'function')) {
      try {
        const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
        if (!mql) return undefined;

        const handleWebChange = (event: { matches?: boolean }) => {
          const nextSystem: ThemeColorScheme = event?.matches ? 'dark' : 'light';
          setSystemScheme(nextSystem);
        };

        if (typeof mql.addEventListener === 'function') {
          mql.addEventListener('change', handleWebChange);
          return () => mql.removeEventListener('change', handleWebChange);
        }
        if (typeof (mql as any).addListener === 'function') {
          (mql as any).addListener(handleWebChange);
          return () => (mql as any).removeListener(handleWebChange);
        }
      } catch {
        // Ignore matchMedia subscription failure
      }
      return undefined;
    }

    try {
      if (typeof Appearance?.addChangeListener === 'function') {
        const sub = Appearance.addChangeListener(
          (preferences: { colorScheme?: string | null }) => {
            setSystemScheme(preferences?.colorScheme === 'dark' ? 'dark' : 'light');
          },
        );
        return () => {
          sub?.remove?.();
        };
      }
    } catch {
      // Ignore native Appearance subscription failure
    }

    return undefined;
  }, [themeMode]);

  const setThemeMode = useCallback(
    (next: ThemeMode) => {
      const normalized = normalizeThemeMode(next);
      const nextScheme = resolveEffectiveColorScheme(normalized, systemScheme);
      applyThemeSync({ scheme: nextScheme });
      setThemeModeState(normalized);
      try {
        setDeviceItem(THEME_MODE_STORAGE_KEY, normalized);
      } catch {
        // Ignore storage write failure
      }
    },
    [systemScheme],
  );

  const toggleDarkMode = useCallback(() => {
    const nextMode: ThemeMode = isDark ? 'light' : 'dark';
    setThemeMode(nextMode);
  }, [isDark, setThemeMode]);

  const setUserBrandColorHex = useCallback((nextHex: string | null) => {
    const normalized = normalizeUserBrandColorHex(nextHex);
    applyThemeSync({ userBrandColorHex: normalized });
    setUserBrandColorState(normalized);
    try {
      setDeviceItem(USER_ACCENT_COLOR_STORAGE_KEY, normalized);
    } catch {
      // Ignore storage write failure
    }
  }, []);

  const value = useMemo<InternalThemeModeContextValue>(
    () => ({
      __hasProvider: true,
      themeMode,
      colorScheme,
      isDark,
      userBrandColorHex,
      setThemeMode,
      toggleDarkMode,
      setUserBrandColorHex,
    }),
    [themeMode, colorScheme, isDark, userBrandColorHex, setThemeMode, toggleDarkMode, setUserBrandColorHex],
  );

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode(): ThemeModeContextValue {
  let ctx: InternalThemeModeContextValue | null = null;
  try {
    ctx = useContext(ThemeModeContext);
  } catch {
    ctx = null;
  }

  if (ctx?.__hasProvider) {
    return {
      themeMode: ctx.themeMode,
      colorScheme: ctx.colorScheme,
      isDark: ctx.isDark,
      userBrandColorHex: ctx.userBrandColorHex,
      setThemeMode: ctx.setThemeMode,
      toggleDarkMode: ctx.toggleDarkMode,
      setUserBrandColorHex: ctx.setUserBrandColorHex,
    };
  }

  const storedMode = readStoredThemeMode();
  const effectiveScheme = resolveEffectiveColorScheme(storedMode);
  const storedUserHex = readStoredUserBrandColorHex();
  return {
    themeMode: storedMode,
    colorScheme: effectiveScheme,
    isDark: effectiveScheme === 'dark',
    userBrandColorHex: storedUserHex,
    setThemeMode: FALLBACK_CONTEXT_VALUE.setThemeMode,
    toggleDarkMode: FALLBACK_CONTEXT_VALUE.toggleDarkMode,
    setUserBrandColorHex: FALLBACK_CONTEXT_VALUE.setUserBrandColorHex,
  };
}
