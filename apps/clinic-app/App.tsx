import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Navigation,
  buildNavigationTheme,
  linkingOptions,
} from './navigation/Navigation';
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
import { ThemeModeProvider, useThemeMode } from './context/ThemeModeContext';
import { UiDensityProvider } from './context/UiDensityContext';
import { initGlobalErrorHandlers } from './services/crashReporter';
import { useOTAUpdate } from './hooks/useOTAUpdate';
import { fontAssets, setCustomFontsAvailable } from './constants/fonts';
import {
  getActiveThemeState,
  subscribeActiveTheme,
  theme,
} from './constants/theme';
import { useQueueDisplayRoute } from './hooks/useQueueDisplayRoute';
import PublicQueueDisplayScreen from './screens/public/PublicQueueDisplayScreen';

function AppRootShell({ isQueueDisplay }: { isQueueDisplay: boolean }) {
  const { isDark } = useThemeMode();
  const [activeThemeSnapshot, setActiveThemeSnapshot] = React.useState(() =>
    getActiveThemeState(),
  );

  React.useEffect(() => {
    setActiveThemeSnapshot(getActiveThemeState());
    return subscribeActiveTheme(() => {
      setActiveThemeSnapshot(getActiveThemeState());
    });
  }, []);

  const activeNavTheme = React.useMemo(
    () => buildNavigationTheme(isDark, activeThemeSnapshot.resolvedColors),
    [isDark, activeThemeSnapshot],
  );

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ErrorBoundary>
        <TextScaleProvider>
          <UiDensityProvider>
            <CrashRecoveryBanner />
            <ConnectionGate>
              {isQueueDisplay ? (
                <PublicQueueDisplayScreen />
              ) : (
                <FacilityActivationGate>
                  <AuthGate>
                    <ClinicProvider>
                      <StaffProvider>
                        <ClinicCommsProvider>
                          <SidebarProvider>
                            <OfflineSyncRunner />
                            <GlobalSearchProvider>
                              <Navigation linking={linkingOptions} theme={activeNavTheme} />
                            </GlobalSearchProvider>
                          </SidebarProvider>
                        </ClinicCommsProvider>
                      </StaffProvider>
                    </ClinicProvider>
                  </AuthGate>
                </FacilityActivationGate>
              )}
            </ConnectionGate>
          </UiDensityProvider>
        </TextScaleProvider>
      </ErrorBoundary>
      <FeedbackHost />
      <VercelInsights />
    </>
  );
}

export default function App() {
  useOTAUpdate();
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const isQueueDisplay = useQueueDisplayRoute();

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
      <ThemeModeProvider>
        <View style={styles.boot}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </ThemeModeProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeModeProvider>
        <AppRootShell isQueueDisplay={isQueueDisplay} />
      </ThemeModeProvider>
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
