
import { useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { ClinicProvider } from '../components/ClinicContext';
// import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import OnboardingFlow from '../screens/onboarding/OnboardingFlow';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // No custom font loading needed for SF Pro (system font)
  const loaded = true;
  // Debug override: set to true to always show onboarding
  const DEBUG_ALWAYS_SHOW_ONBOARDING = false; // set to true for debugging

  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    if (DEBUG_ALWAYS_SHOW_ONBOARDING) {
      setOnboarded(false);
      return;
    }
    SecureStore.getItemAsync('onboarded').then(val => {
      setOnboarded(val === 'true');
    });
  }, []);

  const handleOnboardingFinish = () => {
    setOnboarded(true);
    SecureStore.setItemAsync('onboarded', 'true');
  };

  if (!loaded || onboarded === null) {
    return null;
  }

  if (!onboarded) {
    return <OnboardingFlow onFinish={handleOnboardingFinish} />;
  }

  return (
    <ClinicProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </ClinicProvider>
  );
}
