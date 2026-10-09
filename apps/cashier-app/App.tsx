import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Navigation } from './navigation/Navigation';
import { AuthGate } from './components/AuthGate';
import { ConnectionGate } from './components/ConnectionGate';
import { loadRuntimeConfig } from './services/runtimeConfig';

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
        <AuthGate>
          <Navigation />
        </AuthGate>
      </ConnectionGate>
    </SafeAreaProvider>
  );
}
