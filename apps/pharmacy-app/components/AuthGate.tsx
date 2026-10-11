import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { View, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import ThemedText from '@ui/ThemedText';
import {
  AuthUser,
  getSessionUser,
  hasPermission,
  login as loginRequest,
  logout as logoutRequest,
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

export function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<AuthUser | null>(getSessionUser());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeSession(setUser), []);

  const signOut = useCallback(async () => {
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
    const [, err] = await loginRequest(email, password);
    setSubmitting(false);
    if (err) {
      setError(err.message || 'Sign-in failed.');
      return;
    }
    setPassword('');
  };

  if (!user) {
    return (
      <View style={styles.centered}>
        <View style={styles.card}>
          <ThemedText style={styles.title}>Pharmacy Sign-in</ThemedText>
          <ThemedText style={styles.subtitle}>Sign in with your pharmacy staff account to continue.</ThemedText>

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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
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
});
