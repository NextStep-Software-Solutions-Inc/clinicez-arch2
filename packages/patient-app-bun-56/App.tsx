import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Navigation } from './navigation/Navigation';
import { DefaultTheme, DarkTheme, MaterialDarkTheme, MaterialLightTheme, Theme, ThemeProvider } from "@react-navigation/native";
import { ColorValue, Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { AuthProvider } from 'contexts/AuthContext';
import { OnboardingProvider } from 'contexts/OnboardingContext';
import { AppearanceProvider, useAppearance } from 'contexts/AppearanceContext';
import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { resourceCache } from '@clerk/expo/resource-cache'
import DatabaseProvider from 'components/DatabaseProvider';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useIsLocked } from 'hooks/useNavState';
import LockScreen from './navigation/screens/Lock.screen';
import UnlockScreen from './navigation/screens/Unlock.screen';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

function LockOverlay({ backgroundColor }: { backgroundColor: ColorValue }) {
  const isLocked = useIsLocked();
  const [screen, setScreen] = useState<'locked' | 'unlock'>('locked');

  useEffect(() => {
    if (!isLocked) setScreen('locked');
  }, [isLocked]);

  if (!isLocked) return null;

  return (
    <View style={[styles.lockOverlay, { backgroundColor }]}>
      {screen === 'unlock' ? <UnlockScreen /> : <LockScreen onUnlockPress={() => setScreen('unlock')} />}
    </View>
  );
}

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
      <DatabaseProvider>
        <BottomSheetModalProvider>
          <Navigation theme={selectedTheme} />
          <ThemeProvider value={selectedTheme}>
            <LockOverlay backgroundColor={selectedTheme.colors.background} />
          </ThemeProvider>
        </BottomSheetModalProvider>
      </DatabaseProvider>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache} __experimental_resourceCache={resourceCache}>
          <AppearanceProvider>
            <OnboardingProvider>
              <AuthProvider>
                <AppWithTheme />
              </AuthProvider>
            </OnboardingProvider>
          </AppearanceProvider>
        </ClerkProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  lockOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1000,
  },
});
