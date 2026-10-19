import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import Field from '@ui/Field';
import Banner from '@ui/Banner';
import type { AuthUser } from '../types/billing';
import { getSessionUser, hasPermission, login, logout, subscribeSession } from '../services/authSession';

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

export function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<AuthUser | null>(getSessionUser());
  const [tenantId, setTenantId] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeSession(setUser), []);

  const signOut = useCallback(() => logout(), []);

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
    const [, err] = await login({ tenantId, facilityId, email, password });
    setSubmitting(false);
    if (err) {
      setError(err.message || 'Sign-in failed.');
      return;
    }
    setPassword('');
  };

  if (!user) {
    return (
      <ScrollView contentContainerStyle={styles.centered} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <ThemedText style={styles.title}>Cashier Sign-in</ThemedText>
          <ThemedText style={styles.subtitle}>Sign in with your cashier account at this counter.</ThemedText>
          <Banner message={error} />
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const styles = StyleSheet.create({
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
});
