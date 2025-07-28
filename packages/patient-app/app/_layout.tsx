
import { useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { ClinicProvider } from '../components/ClinicContext';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import OnboardingFlow from '../screens/onboarding/OnboardingFlow';
import { useColorScheme } from '@/hooks/useColorScheme';
import { ClerkProvider } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache'
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const DEBUG_ALWAYS_SHOW_ONBOARDING = true; // set to true for debugging
const ONBOARDED = 'ONBOARDED'; // Key for onboarding state in SecureStore
export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [onboarded, setOnboarded] = useState(false);
  const [loaded] = useFonts({
    'SF-Pro': require('../assets/fonts/SF-Pro.ttf'),
  });

  // Placeholder: Replace with real clinic check
  function patientHasClinic() {
    // TODO: Replace with actual logic to check if patient has a clinic
    return false;
  }
  useEffect(() => {
    if (DEBUG_ALWAYS_SHOW_ONBOARDING) {
      setOnboarded(false);
      return;
    }
    SecureStore.getItemAsync(ONBOARDED).then(val => {
      setOnboarded(val === 'true');
    });
  }, []);

  const handleOnboardingFinish = () => {
    setOnboarded(true);
    SecureStore.setItemAsync(ONBOARDED, 'true');
  };

  if (!loaded || onboarded === null) {
    return null;
  }


  if (!onboarded) {
    return (
      <ClerkProvider tokenCache={tokenCache}>
        <OnboardingFlow onFinish={handleOnboardingFinish} />
      </ClerkProvider>
    );
  }

  return (
    <ClerkProvider tokenCache={tokenCache}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ClinicProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <Stack>
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="join-clinic" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="+not-found" />
            </Stack>
            <StatusBar style="auto" />
          </ThemeProvider>
        </ClinicProvider>
      </GestureHandlerRootView>
    </ClerkProvider>
  );
}
