import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { storage as SecureStore } from '../utils/storage';

const THEME_PREFERENCE_KEY = 'theme_preference';

export type ThemePreference = 'system' | 'light' | 'dark';

interface AppearanceContextType {
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => Promise<void>;
  isLoading: boolean;
}

const AppearanceContext = createContext<AppearanceContextType | undefined>(undefined);

export const AppearanceProvider = ({ children }: { children: ReactNode }) => {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync(THEME_PREFERENCE_KEY).then((value) => {
      if (value === 'light' || value === 'dark' || value === 'system') {
        setThemePreferenceState(value);
      }
      setIsLoading(false);
    });
  }, []);

  const setThemePreference = async (pref: ThemePreference) => {
    await SecureStore.setItemAsync(THEME_PREFERENCE_KEY, pref);
    setThemePreferenceState(pref);
  };

  return (
    <AppearanceContext.Provider value={{ themePreference, setThemePreference, isLoading }}>
      {children}
    </AppearanceContext.Provider>
  );
};

export const useAppearance = () => {
  const context = useContext(AppearanceContext);
  if (context === undefined) {
    throw new Error('useAppearance must be used within an AppearanceProvider');
  }
  return context;
};
