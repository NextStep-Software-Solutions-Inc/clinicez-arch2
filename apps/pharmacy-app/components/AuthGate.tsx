import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { View, TextInput, Pressable, ActivityIndicator, Modal, Platform, StyleSheet } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { createWebIdleMonitor, DEFAULT_WEB_IDLE_TIMEOUT_MINUTES } from '@shared/safe';
import {
  AuthUser,
  broadcastActivity,
  getSessionUser,
  hasPermission,
  idleLogout,
  login as loginRequest,
  logout as logoutRequest,
  onSessionNotice,
  restoreSession,
  subscribeRemoteActivity,
  subscribeSession,
} from '../services/authSession';

interface AuthContextValue {
  user: AuthUser | null;
  permissions: string[];
  can: (permission: string) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  permissions: [],
  can: () => false,
  signOut: async () => {},
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
  const [booting, setBooting] = useState<boolean>(() => getSessionUser() === null);
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
    if (getSessionUser() !== null) {
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

  const signOut = useCallback(async () => {
    setAccountSwitchAlert(null);
    await logoutRequest();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const permissions = user?.permissions ?? [];
    return {
      user,
      permissions,
      can: (permission: string) => hasPermission(permissions, permission),
      signOut,
    };
  }, [user, signOut]);

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setNotice(null);
    setAccountSwitchAlert(null);
    const [, err] = await loginRequest(email, password);
    setSubmitting(false);
    if (err) {
      setError(err.message || 'Sign-in failed.');
      return;
    }
    setPassword('');
  };

  if (booting) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <View style={styles.card}>
          <ThemedText style={styles.title}>Pharmacy Sign-in</ThemedText>
          <ThemedText style={styles.subtitle}>Sign in with your pharmacy staff account to continue.</ThemedText>

          {notice ? (
            <View style={styles.noticeBox}>
              <ThemedText style={styles.noticeText}>{notice}</ThemedText>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Email</ThemedText>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@pharmacy.example"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!submitting}
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.inputLabel}>Password</ThemedText>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#9CA3AF"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
              onSubmitEditing={handleSignIn}
            />
          </View>

          <Pressable
            style={[styles.primaryBtn, submitting && styles.btnDisabled]}
            onPress={handleSignIn}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <ThemedText style={styles.primaryBtnText}>Sign in</ThemedText>
            )}
          </Pressable>
        </View>
      </View>
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
                  Previous: {accountSwitchAlert.previousUser.name}
                </ThemedText>
                <ThemedText style={styles.switchValue}>
                  New active user: {accountSwitchAlert.currentUser.name} ({accountSwitchAlert.currentUser.roleName || accountSwitchAlert.currentUser.role})
                </ThemedText>
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => {
                  setAccountSwitchAlert(null);
                  void signOut();
                }}
              >
                <ThemedText style={styles.secondaryBtnText}>Sign out all tabs</ThemedText>
              </Pressable>
              <Pressable
                style={styles.primaryBtnCompact}
                onPress={() => setAccountSwitchAlert(null)}
              >
                <ThemedText style={styles.primaryBtnText}>
                  Continue as {accountSwitchAlert?.currentUser.name ?? 'new user'}
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
  centered: {
    flex: 1,
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
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderColor: '#F87171',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '600',
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  primaryBtn: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  noticeBox: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  noticeText: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '600',
  },
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
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
});
