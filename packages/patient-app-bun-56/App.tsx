import { StatusBar } from 'expo-status-bar';
import { Navigation } from './navigation/Navigation';
import { DefaultTheme, DarkTheme, MaterialDarkTheme, MaterialLightTheme, Theme } from "@react-navigation/native";
import { Platform, useColorScheme } from 'react-native';
import { AuthProvider } from 'contexts/AuthContext';
import { OnboardingProvider } from 'contexts/OnboardingContext';
import { AppearanceProvider, useAppearance } from 'contexts/AppearanceContext';
import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

function AppWithTheme() {
  const systemScheme = useColorScheme();
  const { themePreference } = useAppearance();

  const isDarkMode =
    themePreference === 'dark'
      ? true
      : themePreference === 'light'
        ? false
        : systemScheme === 'dark';

  const selectedTheme = Platform.select<Theme>({
    ios: isDarkMode ? DarkTheme : DefaultTheme,
    android: isDarkMode ? MaterialDarkTheme : MaterialLightTheme,
  }) ?? DefaultTheme;

  return (
    <>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <Navigation theme={selectedTheme} />
    </>
  );
}

export default function App() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <AppearanceProvider>
        <OnboardingProvider>
          <AuthProvider>
            <AppWithTheme />
          </AuthProvider>
        </OnboardingProvider>
      </AppearanceProvider>
    </ClerkProvider>
  );
}
