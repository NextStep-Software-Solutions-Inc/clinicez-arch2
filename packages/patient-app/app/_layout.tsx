
import { useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { ClinicProvider } from '../components/ClinicContext';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import OnboardingFlow from '../screens/onboarding/OnboardingFlow';
import { useColorScheme } from '@/hooks/useColorScheme';
import { ClerkProvider } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache'
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const DEBUG_ALWAYS_SHOW_ONBOARDING = false; // set to true for debugging
const ONBOARDED = 'ONBOARDED'; // Key for onboarding state in SecureStore
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    if (DEBUG_ALWAYS_SHOW_ONBOARDING) {
      setOnboarded(false);
      return;
    }
    const loadOnboardingState = async () => {
      try {
        const val = await SecureStore.getItemAsync(ONBOARDED);
        setOnboarded(val === 'true');
      } catch (error) {
        console.error('Failed to load onboarding state from SecureStore', error);
        setOnboarded(false); // Default to false if there's an error
      }
    };
    loadOnboardingState();
  }, []);

  const handleOnboardingFinish = async () => {
    setOnboarded(true);
    await SecureStore.setItemAsync(ONBOARDED, 'true');
  };

  if (!onboarded) {
    return (
      <ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
        <OnboardingFlow onFinish={handleOnboardingFinish} />
      </ClerkProvider>
    );
  }

  return (
    <ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ClinicProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <Stack
              screenOptions={{
                animation: 'fade_from_bottom'
              }}
            >
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(appointments)" options={{ headerShown: false }} />
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
