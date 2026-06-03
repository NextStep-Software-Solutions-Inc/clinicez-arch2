import { StatusBar } from 'expo-status-bar';
import { Navigation } from './navigation/Navigation';
import { DefaultTheme, DarkTheme, MaterialDarkTheme, MaterialLightTheme, Theme } from "@react-navigation/native";
import { Platform, useColorScheme } from 'react-native';
import { AuthProvider } from 'contexts/AuthContext';
import { OnboardingProvider } from 'contexts/OnboardingContext';
import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

export default function App() {
  const theme = useColorScheme();
  const isDarkMode = theme === 'dark';

  const selectedTheme = Platform.select<Theme>({
    ios: isDarkMode ? DarkTheme : DefaultTheme,
    android: isDarkMode ? MaterialDarkTheme : MaterialLightTheme,
  }) ?? DefaultTheme;

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <OnboardingProvider>
        <AuthProvider>
          <StatusBar style="auto" />
          <Navigation theme={selectedTheme} />
        </AuthProvider>
      </OnboardingProvider>
    </ClerkProvider>
  );
}
