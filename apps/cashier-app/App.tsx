import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Navigation } from './navigation/Navigation';
import { AuthGate } from './components/AuthGate';
import { ConnectionGate } from './components/ConnectionGate';
import { VercelInsights } from './components/analytics/VercelInsights';
import { loadRuntimeConfig } from './services/runtimeConfig';
import { CashierCommsProvider } from './context/CashierCommsContext';
import CashierChatModal from './components/CashierChatModal';
import { CashierChatTrigger } from './components/CashierChatTrigger';

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
          <CashierCommsProvider>
            <Navigation />
            <CashierChatTrigger />
            <CashierChatModal />
          </CashierCommsProvider>
        </AuthGate>
      </ConnectionGate>
      <VercelInsights />
    </SafeAreaProvider>
  );
}
