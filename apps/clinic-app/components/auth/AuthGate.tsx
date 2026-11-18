import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import ThemedText from '../ui/ThemedText';
import { theme } from '../../constants/theme';
import { AccountSwitchAlert, AuthProvider, useAuth } from '../../context/AuthContext';
import { useConnection } from '../connection/ConnectionGate';
import { getDeviceItem, setDeviceItem } from '../../utils/deviceStorage';
import { isUnlockConfigured, offlineUnlockSupported } from '../../services/offlineUnlock';
import { AuthScreen, authStyles } from './AuthScreen';
import LoginScreen from './LoginScreen';
import FirstAdminSetupScreen from './FirstAdminSetupScreen';
import ChangePasswordScreen from './ChangePasswordScreen';
import OfflineUnlockScreen from './OfflineUnlockScreen';
import SetPinScreen from './SetPinScreen';
import InvitationAcceptScreen from './InvitationAcceptScreen';

const PIN_PROMPT_DISMISSED_KEY = 'clinicez.pinPromptDismissed';

import { extractInviteToken } from '../../utils/inviteUrl';
export { extractInviteToken };

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
  const { state, offline, user, accountSwitchAlert, acknowledgeAccountSwitch, logout } = useAuth();
  const [pinPrompt, setPinPrompt] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined' && window.location?.pathname) {
      return extractInviteToken(window.location.pathname);
    }
    return null;
  });

  useEffect(() => {
    let active = true;
    Linking.getInitialURL().then((url) => {
      if (active && url) {
        const token = extractInviteToken(url);
        if (token) setInviteToken(token);
      }
    });

    const sub = Linking.addEventListener('url', ({ url }) => {
      if (active && url) {
        const token = extractInviteToken(url);
        if (token) setInviteToken(token);
      }
    });

    return () => {
      active = false;
      sub.remove();
    };
  }, []);

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

  if (state !== 'signedIn' && inviteToken) {
    return (
      <InvitationAcceptScreen
        token={inviteToken}
        onAccepted={() => {
          setInviteToken(null);
          if (typeof window !== 'undefined' && window.history?.pushState) {
            window.history.pushState({}, '', '/');
          }
        }}
        onCancel={() => {
          setInviteToken(null);
          if (typeof window !== 'undefined' && window.history?.pushState) {
            window.history.pushState({}, '', '/');
          }
        }}
      />
    );
  }

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
      return (
        <>
          <ChangePasswordScreen />
          <AccountSwitchSafetyModal
            alert={accountSwitchAlert}
            onContinue={acknowledgeAccountSwitch}
            onSignOut={() => {
              acknowledgeAccountSwitch();
              void logout();
            }}
          />
        </>
      );
    case 'signedIn':
      if (pinPrompt) {
        const finish = () => setPinPrompt(false);
        return (
          <SetPinScreen
            onDone={() => {
              setDeviceItem(PIN_PROMPT_DISMISSED_KEY, '1');
              finish();
            }}
            onSkip={() => {
              setDeviceItem(PIN_PROMPT_DISMISSED_KEY, '1');
              finish();
            }}
          />
        );
      }
      return (
        <>
          <React.Fragment key={user?.id ?? 'signed-in'}>{children}</React.Fragment>
          <AccountSwitchSafetyModal
            alert={accountSwitchAlert}
            onContinue={acknowledgeAccountSwitch}
            onSignOut={() => {
              acknowledgeAccountSwitch();
              void logout();
            }}
          />
        </>
      );
    case 'signedOut':
    default:
      return <LoginScreen />;
  }
}

function AccountSwitchSafetyModal({
  alert,
  onContinue,
  onSignOut,
}: {
  alert: AccountSwitchAlert | null;
  onContinue: () => void;
  onSignOut: () => void;
}) {
  if (!alert) return null;
  const identityDetail = alert.currentUser.email || alert.currentUser.roleName || alert.currentUser.role;

  return (
    <Modal
      visible
      backdropDismissible={false}
      maxWidth={460}
      title="Active staff account changed"
      subtitle="Another tab in this browser signed in with a different account."
      footer={
        <View style={styles.switchActions}>
          <Button title="Sign out all tabs" variant="secondary" onPress={onSignOut} />
          <Button title={`Continue as ${alert.currentUser.name}`} onPress={onContinue} />
        </View>
      }
    >
      <View style={styles.switchBody}>
        <View style={styles.switchBanner}>
          <ThemedText variant="smallBold" color={theme.colors.warningText}>
            Verify the active clinician before charting or signing orders.
          </ThemedText>
        </View>
        <View style={styles.switchRow}>
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            Previous session
          </ThemedText>
          <ThemedText variant="body">{alert.previousUser.name}</ThemedText>
        </View>
        <View style={styles.switchRow}>
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            New active session
          </ThemedText>
          <ThemedText variant="bodyBold">{alert.currentUser.name}</ThemedText>
          {identityDetail ? (
            <ThemedText variant="small" color={theme.colors.textSecondary}>
              {identityDetail}
            </ThemedText>
          ) : null}
        </View>
      </View>
    </Modal>
  );
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
  switchBody: {
    gap: theme.spacing.md,
  },
  switchBanner: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.warningBg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.warningBorder,
  },
  switchRow: {
    gap: theme.spacing.xs,
  },
  switchActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
});
