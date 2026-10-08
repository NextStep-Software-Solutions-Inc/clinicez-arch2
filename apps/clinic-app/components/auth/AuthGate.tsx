import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Button from '../ui/Button';
import { theme } from '../../constants/theme';
import { AuthProvider, useAuth } from '../../context/AuthContext';
import { useConnection } from '../connection/ConnectionGate';
import { getDeviceItem, setDeviceItem } from '../../utils/deviceStorage';
import { isUnlockConfigured, offlineUnlockSupported } from '../../services/offlineUnlock';
import { AuthScreen, authStyles } from './AuthScreen';
import LoginScreen from './LoginScreen';
import FirstAdminSetupScreen from './FirstAdminSetupScreen';
import ChangePasswordScreen from './ChangePasswordScreen';
import OfflineUnlockScreen from './OfflineUnlockScreen';
import SetPinScreen from './SetPinScreen';

const PIN_PROMPT_DISMISSED_KEY = 'clinicez.pinPromptDismissed';

/**
 * Everything between "the facility is licensed" and "the workstation is usable":
 * sign-in, first administrator, forced password change and offline unlock.
 * Children render only for a signed-in (or offline-unlocked) staff member.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGateContent>{children}</AuthGateContent>
    </AuthProvider>
  );
}

function AuthGateContent({ children }: { children: React.ReactNode }) {
  const { state, offline, user } = useAuth();
  const [pinPrompt, setPinPrompt] = useState(false);

  // Offer offline unlock once per device, right after an online sign-in on a phone/tablet.
  useEffect(() => {
    let active = true;
    if (state !== 'signedIn' || offline || !offlineUnlockSupported) {
      setPinPrompt(false);
      return undefined;
    }
    (async () => {
      const dismissed = getDeviceItem(PIN_PROMPT_DISMISSED_KEY) === '1';
      const configured = await isUnlockConfigured();
      if (active) setPinPrompt(!dismissed && !configured);
    })();
    return () => {
      active = false;
    };
  }, [state, offline, user?.id]);

  switch (state) {
    case 'booting':
      return (
        <View style={styles.boot}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      );
    case 'unreachable':
      return <UnreachableScreen />;
    case 'needsBootstrap':
      return <FirstAdminSetupScreen />;
    case 'locked':
      return <OfflineUnlockScreen />;
    case 'mustChangePassword':
      return <ChangePasswordScreen />;
    case 'signedIn':
      if (pinPrompt) {
        const finish = () => setPinPrompt(false);
        return (
          <SetPinScreen
            onDone={finish}
            onSkip={() => {
              setDeviceItem(PIN_PROMPT_DISMISSED_KEY, '1');
              finish();
            }}
          />
        );
      }
      return <>{children}</>;
    case 'signedOut':
    default:
      return <LoginScreen />;
  }
}

function UnreachableScreen() {
  const { retry } = useAuth();
  const { serverLabel, changeServer } = useConnection();
  return (
    <AuthScreen
      title="Can’t reach the clinic server"
      subtitle={`Clinic EZ could not connect to ${serverLabel || 'the server'}. Check that this device is on the clinic network and that the server is running.`}
    >
      <View style={authStyles.actions}>
        <Button title="Try again" size="lg" icon="refresh" onPress={retry} />
        {changeServer ? <Button title="Change server address" variant="secondary" onPress={changeServer} /> : null}
      </View>
    </AuthScreen>
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
