import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Field from '@ui/Field';
import Banner from '@ui/Banner';
import { createWebIdleMonitor, DEFAULT_WEB_IDLE_TIMEOUT_MINUTES } from '@shared/safe';
import type { AuthUser } from '../types/billing';
import {
  broadcastActivity,
  getSessionUser,
  hasPermission,
  idleLogout,
  login,
  logout,
  onSessionNotice,
  restoreSession,
  subscribeRemoteActivity,
  subscribeSession,
} from '../services/authSession';

interface AuthContextValue {
  user: AuthUser | null;
  can: (permission: string) => boolean;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  can: () => false,
  signOut: () => {},
});

export const useAuth = () => useContext(AuthContext);

/** True when the signed-in staff member holds `permission` (always false while signed out). */
export function usePermission(permission: string): boolean {
  const { can } = useAuth();
  return can(permission);
}

interface AuthGateProps {
  children: ReactNode;
}

interface AccountSwitchAlert {
  previousUser: AuthUser;
  currentUser: AuthUser;
}

export function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<AuthUser | null>(getSessionUser());
  const [booting, setBooting] = useState<boolean>(() => Platform.OS === 'web' && getSessionUser() === null);
  const [tenantId, setTenantId] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accountSwitchAlert, setAccountSwitchAlert] = useState<AccountSwitchAlert | null>(null);

  const userRef = useRef<AuthUser | null>(user);
  userRef.current = user;
  const bootingRef = useRef<boolean>(booting);
  bootingRef.current = booting;

  useEffect(() => {
    onSessionNotice((message) => {
      if (bootingRef.current && message) return;
      setNotice(message);
    });
    const unsub = subscribeSession((nextUser) => {
      if (nextUser && userRef.current && userRef.current.id !== nextUser.id) {
        setAccountSwitchAlert({ previousUser: userRef.current, currentUser: nextUser });
      }
      if (!nextUser) {
        setAccountSwitchAlert(null);
      } else {
        setNotice(null);
      }
      setUser(nextUser);
    });
    return () => {
      onSessionNotice(null);
      unsub();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || getSessionUser() !== null) {
      setBooting(false);
      return undefined;
    }
    let active = true;
    restoreSession().finally(() => {
      if (active) setBooting(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || !user) return undefined;
    const monitor = createWebIdleMonitor({
      timeoutMs: DEFAULT_WEB_IDLE_TIMEOUT_MINUTES * 60_000,
      onActivityBroadcast: broadcastActivity,
      onIdleTimeout: () => {
        void idleLogout();
      },
    });
    const unsubRemote = subscribeRemoteActivity((ts) => {
      monitor.recordActivity(ts, true);
    });
    monitor.start();
    return () => {
      unsubRemote();
      monitor.stop();
    };
  }, [Boolean(user)]);

  const signOut = useCallback(() => {
    setAccountSwitchAlert(null);
    void logout();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const permissions = user?.permissions ?? [];
    return { user, can: (permission: string) => hasPermission(permissions, permission), signOut };
  }, [user, signOut]);

  const handleSignIn = async () => {
    if (!tenantId.trim() || !facilityId.trim() || !email.trim() || !password) {
      setError('Enter the tenant, counter, email and password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);
    setAccountSwitchAlert(null);
    const [, err] = await login({ tenantId, facilityId, email, password });
    setSubmitting(false);
    if (err) {
      setError(err.message || 'Sign-in failed.');
      return;
    }
    setPassword('');
  };

  if (booting) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color="#0D6963" />
      </View>
    );
  }

  if (!user) {
    return (
      <ScrollView contentContainerStyle={styles.centered} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <ThemedText style={styles.title}>Cashier Sign-in</ThemedText>
          <ThemedText style={styles.subtitle}>Sign in with your cashier account at this counter.</ThemedText>
          <Banner message={error || notice} />
          <Field label="Tenant" value={tenantId} onChangeText={setTenantId} editable={!submitting} placeholder="Tenant id" />
          <Field
            label="Counter (facility)"
            value={facilityId}
            onChangeText={setFacilityId}
            editable={!submitting}
            placeholder="Facility id of this counter"
          />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            editable={!submitting}
            placeholder="you@clinic.example"
            keyboardType="email-address"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            editable={!submitting}
            placeholder="Password"
            secureTextEntry
            onSubmitEditing={handleSignIn}
          />
          <Button title="Sign in" onPress={handleSignIn} busy={submitting} />
        </View>
      </ScrollView>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      <React.Fragment key={user.id}>{children}</React.Fragment>
      <Modal
        visible={Boolean(accountSwitchAlert)}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ThemedText style={styles.modalTitle}>Active staff account changed</ThemedText>
            <ThemedText style={styles.subtitle}>
              Another tab in this browser signed in with a different account.
            </ThemedText>
            {accountSwitchAlert ? (
              <View style={styles.switchInfoBox}>
                <ThemedText style={styles.switchLabel}>
                  Previous: {accountSwitchAlert.previousUser.fullName}
                </ThemedText>
                <ThemedText style={styles.switchValue}>
                  New active user: {accountSwitchAlert.currentUser.fullName} ({accountSwitchAlert.currentUser.role})
                </ThemedText>
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryBtn} onPress={signOut}>
                <ThemedText style={styles.secondaryBtnText}>Sign out all tabs</ThemedText>
              </Pressable>
              <Pressable
                style={styles.primaryBtnCompact}
                onPress={() => setAccountSwitchAlert(null)}
              >
                <ThemedText style={styles.primaryBtnText}>
                  Continue as {accountSwitchAlert?.currentUser.fullName ?? 'new user'}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AuthContext.Provider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  centered: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F3F4F6',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    maxWidth: 440,
    width: '100%',
    gap: 14,
  },
  title: { fontSize: 24, fontWeight: '800', color: '#0F172A' },
  subtitle: { fontSize: 14, color: '#475569' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    maxWidth: 460,
    width: '100%',
    gap: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  switchInfoBox: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  switchLabel: {
    fontSize: 13,
    color: '#475569',
  },
  switchValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  secondaryBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  secondaryBtnText: {
    color: '#0F172A',
    fontWeight: '600',
    fontSize: 14,
  },
  primaryBtnCompact: {
    backgroundColor: '#0D6963',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
