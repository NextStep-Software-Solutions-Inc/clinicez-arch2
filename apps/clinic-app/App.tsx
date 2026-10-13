import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Navigation, linkingOptions, navigationTheme } from './navigation/Navigation';
import { FacilityActivationGate } from './components/FacilityActivationGate';
import { ConnectionGate } from './components/connection/ConnectionGate';
import { AuthGate } from './components/auth/AuthGate';
import { ClinicProvider } from './context/ClinicContext';
import { StaffProvider } from './context/StaffContext';
import { FeedbackHost, initModalStackObserver } from './components/ui';
import { OfflineSyncRunner } from './components/OfflineSyncRunner';
import ErrorBoundary from './components/ErrorBoundary';
import { fontAssets, setCustomFontsAvailable } from './constants/fonts';
import { theme } from './constants/theme';

export default function App() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  React.useEffect(() => {
    return initModalStackObserver();
  }, []);

  // If the typeface fails to load, fall back to the system font instead of rendering
  // text against missing font families.
  if (fontError) {
    setCustomFontsAvailable(false);
  }

  if (!fontsLoaded && !fontError) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <ErrorBoundary>
        <ConnectionGate>
          <FacilityActivationGate>
            <AuthGate>
              <ClinicProvider>
                <StaffProvider>
                  <OfflineSyncRunner />
                  <Navigation linking={linkingOptions} theme={navigationTheme} />
                </StaffProvider>
              </ClinicProvider>
            </AuthGate>
          </FacilityActivationGate>
        </ConnectionGate>
      </ErrorBoundary>
      <FeedbackHost />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
});
