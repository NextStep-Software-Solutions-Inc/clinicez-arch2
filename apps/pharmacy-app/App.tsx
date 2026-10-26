import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Navigation } from './navigation/Navigation';
import { FacilityActivationGate } from './components/FacilityActivationGate';
import { AuthGate } from './components/AuthGate';
import { ConnectionGate } from './components/ConnectionGate';
import { VercelInsights } from './components/analytics/VercelInsights';
import { loadRuntimeConfig } from './services/runtimeConfig';
import { PharmacyCommsProvider } from './context/PharmacyCommsContext';
import PharmacyChatModal from './components/PharmacyChatModal';
import { PharmacyChatTrigger } from './components/PharmacyChatTrigger';

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadRuntimeConfig().finally(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <ConnectionGate>
        <FacilityActivationGate>
          <AuthGate>
            <PharmacyCommsProvider>
              <Navigation />
              <PharmacyChatTrigger />
              <PharmacyChatModal />
            </PharmacyCommsProvider>
          </AuthGate>
        </FacilityActivationGate>
      </ConnectionGate>
      <VercelInsights />
    </SafeAreaProvider>
  );
}
