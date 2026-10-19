import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { clearActiveTenantContext, isValidTenantSlug, setActiveTenantContext, setTenantStorage } from '@shared/safe';
import ThemedText from '@ui/ThemedText';
import { getStoredServerUrl, getPharmacyApiBaseUrl, isServerConfigured, setStoredServerUrl } from '../services/runtimeConfig';
import { normalizeServerUrl, probeServer } from '../services/serverUrl';
import { getDeviceItem, setDeviceItem } from '../utils/deviceStorage';

interface ConnectionContextValue {
  /** Short, human-readable server name (host) for display; empty until a server is configured. */
  serverLabel: string;
  /** Present on phones/tablets, where the pharmacy server address is entered by hand. */
  changeServer?: () => void;
}

const ConnectionContext = createContext<ConnectionContextValue>({ serverLabel: '' });

export const useConnection = () => useContext(ConnectionContext);

const isNative = Platform.OS !== 'web';

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Native has no localStorage: remember the workspace on the device instead. Must run before any request is made. */
function installNativeTenantStorage(): void {
  if (!isNative) return;
  setTenantStorage({
    getItem: (key) => getDeviceItem(key),
    setItem: (key, value) => setDeviceItem(key, value),
    removeItem: (key) => setDeviceItem(key, null),
  });
}

/**
 * Makes sure a phone or tablet knows where its pharmacy server is before anything else runs: it asks for the address
 * once (for example `192.168.1.20:5245`), checks the server answers, and remembers it. The web build needs no address.
 */
export function ConnectionGate({ children }: { children: React.ReactNode }) {
  const [configured, setConfigured] = useState(() => {
    installNativeTenantStorage();
    return isServerConfigured();
  });
  const [editing, setEditing] = useState(false);
  const [serverUrl, setServerUrl] = useState(getPharmacyApiBaseUrl);

  const onConnected = useCallback(() => {
    setServerUrl(getPharmacyApiBaseUrl());
    setConfigured(true);
    setEditing(false);
  }, []);

  const value = useMemo<ConnectionContextValue>(
    () => ({
      serverLabel: configured ? hostOf(serverUrl) : '',
      changeServer: isNative ? () => setEditing(true) : undefined,
    }),
    [configured, serverUrl],
  );

  if (!configured || editing) {
    return (
      <ServerSetupScreen
        initialUrl={getStoredServerUrl() ?? ''}
        onConnected={onConnected}
        onCancel={editing && configured ? () => setEditing(false) : undefined}
      />
    );
  }

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

/** Native first run: point this device at the pharmacy server on the local network (or a cloud address). */
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
  const [workspace, setWorkspace] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    const normalized = normalizeServerUrl(address);
    if (!normalized) {
      setError('Enter the server address, for example 192.168.1.20:5245.');
      return;
    }
    const slug = workspace.trim().toLowerCase();
    if (slug && !isValidTenantSlug(slug)) {
      setError('That workspace name is not valid. Leave it empty for a pharmacy-owned server.');
      return;
    }

    setBusy(true);
    setError(null);
    const probe = await probeServer(normalized);
    if (!probe.reachable) {
      setError(probe.message ?? 'Could not reach the server.');
      setBusy(false);
      return;
    }

    setStoredServerUrl(normalized);
    if (slug) setActiveTenantContext(slug);
    else clearActiveTenantContext();
    setBusy(false);
    onConnected(normalized);
  };

  return (
    <View style={styles.centered}>
      <View style={styles.card}>
        <ThemedText style={styles.title}>Connect to your pharmacy</ThemedText>
        <ThemedText style={styles.subtitle}>
          Enter the address of the Clinic EZ pharmacy server. Ask your administrator if you are not sure.
        </ThemedText>
        <View style={styles.infoBox}>
          <ThemedText style={styles.infoText}>
            This device must be on the same Wi-Fi network as the pharmacy server. No internet connection is needed.
          </ThemedText>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        ) : null}

        <View style={styles.inputGroup}>
          <ThemedText style={styles.inputLabel}>Server address</ThemedText>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="192.168.1.20:5245"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!busy}
          />
        </View>

        <View style={styles.inputGroup}>
          <ThemedText style={styles.inputLabel}>Workspace (cloud-hosted pharmacies only)</ThemedText>
          <TextInput
            style={styles.input}
            value={workspace}
            onChangeText={setWorkspace}
            placeholder="Leave empty for a pharmacy-owned server"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
          />
        </View>

        <Pressable style={[styles.primaryBtn, busy && styles.btnDisabled]} onPress={connect} disabled={busy}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.primaryBtnText}>Connect</ThemedText>}
        </Pressable>
        {onCancel ? (
          <Pressable style={styles.ghostBtn} onPress={onCancel} disabled={busy}>
            <ThemedText style={styles.ghostBtnText}>Cancel</ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
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
  infoBox: {
    backgroundColor: '#ECFDF5',
    borderColor: '#6EE7B7',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  infoText: {
    color: '#065F46',
    fontSize: 13,
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
  ghostBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  ghostBtnText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
