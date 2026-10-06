import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Navigation, linkingOptions } from './navigation/Navigation';
import { FacilityActivationGate } from './components/FacilityActivationGate';
import { FeedbackHost } from './components/ui';
import { fontAssets, setCustomFontsAvailable } from './constants/fonts';
import { theme } from './constants/theme';

export default function App() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

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
      <StatusBar style="auto" />
      <FacilityActivationGate>
        <Navigation linking={linkingOptions} />
      </FacilityActivationGate>
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
