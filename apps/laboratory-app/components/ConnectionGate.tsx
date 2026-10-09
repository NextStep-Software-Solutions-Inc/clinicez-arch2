import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getStoredServerUrl, isServerConfigured, setStoredServerUrl } from '../services/runtimeConfig';
import { normalizeServerUrl, probeServer } from '../services/serverUrl';

interface ConnectionContextValue {
  /** Host (and port) of the laboratory server, for display. Empty on web, where the server is not user-chosen. */
  serverLabel: string;
  /** Present on phones/tablets, where the laboratory server address is entered by hand. */
  changeServer?: () => void;
}

const ConnectionContext = createContext<ConnectionContextValue>({ serverLabel: '' });

export const useConnection = () => useContext(ConnectionContext);

const isNative = Platform.OS !== 'web';

function hostOf(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Makes sure a phone/tablet knows where its laboratory server is before anything else runs. The web build resolves
 * its server from `config.json` / the page origin, so it passes straight through.
 */
export function ConnectionGate({ children }: { children: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [serverUrl, setServerUrl] = useState<string | null>(() => getStoredServerUrl());

  const onConnected = useCallback((url: string) => {
    setServerUrl(url);
    setEditing(false);
  }, []);

  const value = useMemo<ConnectionContextValue>(
    () => ({
      serverLabel: isNative ? hostOf(serverUrl) : '',
      changeServer: isNative ? () => setEditing(true) : undefined,
    }),
    [serverUrl],
  );

  if (!isServerConfigured() || editing) {
    return (
      <ServerSetupScreen
        initialUrl={getStoredServerUrl() ?? ''}
        onConnected={onConnected}
        onCancel={editing && isServerConfigured() ? () => setEditing(false) : undefined}
      />
    );
  }

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

/** Native first-run: point this device at the laboratory server on the local network (or a cloud address). */
function ServerSetupScreen({
  initialUrl,
  onConnected,
  onCancel,
}: {
  initialUrl: string;
  onConnected: (url: string) => void;
  onCancel?: () => void;
}) {
  const [address, setAddress] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    const normalized = normalizeServerUrl(address);
    if (!normalized) {
      setError('Enter the server address, for example 192.168.1.20:5245.');
      return;
    }

    setBusy(true);
    setError(null);
    const probe = await probeServer(normalized);
    setBusy(false);
    if (!probe.reachable) {
      setError(probe.message ?? 'Could not reach the server.');
      return;
    }

    setStoredServerUrl(normalized);
    onConnected(normalized);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.center} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.icon}>🔬</Text>
        <Text style={styles.title}>Connect to your laboratory</Text>
        <Text style={styles.description}>
          Enter the address of the Clinic EZ laboratory server. Ask your administrator if you are not sure.
        </Text>
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            This device must be on the same Wi-Fi network as the laboratory server. No internet connection is needed.
          </Text>
        </View>
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <View style={styles.field}>
          <Text style={styles.label}>Server address</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="192.168.1.20:5245"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>
        <Pressable style={[styles.primaryBtn, busy && styles.disabled]} onPress={connect} disabled={busy}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>Connect</Text>}
        </Pressable>
        {onCancel ? (
          <Pressable style={styles.secondaryBtn} onPress={onCancel} disabled={busy}>
            <Text style={styles.secondaryBtnText}>Cancel</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    maxWidth: 520,
    width: '100%',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 20,
    gap: 16,
  },
  icon: { fontSize: 40 },
  title: { fontSize: 24, fontWeight: '800', color: '#0F172A' },
  description: { fontSize: 14, color: '#475569', lineHeight: 21 },
  notice: { backgroundColor: '#F0FDFA', borderColor: '#99F6E4', borderWidth: 1, borderRadius: 10, padding: 12 },
  noticeText: { color: '#0F766E', fontSize: 13 },
  errorBanner: { backgroundColor: '#FEE2E2', borderColor: '#F87171', borderWidth: 1, borderRadius: 10, padding: 12 },
  errorText: { color: '#991B1B', fontSize: 13, fontWeight: '600' },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#0F172A',
  },
  primaryBtn: { backgroundColor: '#0D9488', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.6 },
  secondaryBtn: { paddingVertical: 10, alignItems: 'center' },
  secondaryBtnText: { color: '#0D9488', fontWeight: '600', fontSize: 14 },
});
