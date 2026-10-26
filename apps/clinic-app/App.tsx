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
import { ClinicCommsProvider } from './context/ClinicCommsContext';
import { SidebarProvider } from './context/SidebarContext';
import { FeedbackHost, initModalStackObserver } from './components/ui';
import { VercelInsights } from './components/analytics/VercelInsights';
import { OfflineSyncRunner } from './components/OfflineSyncRunner';
import { GlobalSearchProvider } from './components/search/GlobalSearchProvider';
import ErrorBoundary from './components/ErrorBoundary';
import { CrashRecoveryBanner } from './components/CrashRecoveryBanner';
import { TextScaleProvider } from './context/TextScaleContext';
import { UiDensityProvider } from './context/UiDensityContext';
import { initGlobalErrorHandlers } from './services/crashReporter';
import { useOTAUpdate } from './hooks/useOTAUpdate';
import { fontAssets, setCustomFontsAvailable } from './constants/fonts';
import { theme } from './constants/theme';

export default function App() {
  useOTAUpdate();
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  React.useEffect(() => {
    const unhookErrors = initGlobalErrorHandlers();
    const unhookModalObserver = initModalStackObserver();
    return () => {
      unhookErrors();
      unhookModalObserver();
    };
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
        <TextScaleProvider>
          <UiDensityProvider>
            <CrashRecoveryBanner />
            <ConnectionGate>
              <FacilityActivationGate>
                <AuthGate>
                  <ClinicProvider>
                    <StaffProvider>
                      <ClinicCommsProvider>
                        <SidebarProvider>
                          <OfflineSyncRunner />
                          <GlobalSearchProvider>
                            <Navigation linking={linkingOptions} theme={navigationTheme} />
                          </GlobalSearchProvider>
                        </SidebarProvider>
                      </ClinicCommsProvider>
                    </StaffProvider>
                  </ClinicProvider>
                </AuthGate>
              </FacilityActivationGate>
            </ConnectionGate>
          </UiDensityProvider>
        </TextScaleProvider>
      </ErrorBoundary>
      <FeedbackHost />
      <VercelInsights />
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
