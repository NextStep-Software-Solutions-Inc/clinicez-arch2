import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Navigation, linkingOptions } from './navigation/Navigation';
import { FacilityActivationGate } from './components/FacilityActivationGate';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <FacilityActivationGate>
        <Navigation linking={linkingOptions} />
      </FacilityActivationGate>
    </SafeAreaProvider>
  );
}
