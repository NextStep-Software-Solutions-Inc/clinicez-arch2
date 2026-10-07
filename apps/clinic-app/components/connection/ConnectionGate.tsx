import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { setActiveTenantContext, clearActiveTenantContext, isValidTenantSlug, setTenantStorage } from '@shared/safe';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { theme } from '../../constants/theme';
import { getDeviceItem, setDeviceItem } from '../../utils/deviceStorage';
import {
  getApiBaseUrl,
  getStoredServerUrl,
  isServerConfigured,
  loadRuntimeConfig,
  setStoredServerUrl,
} from '../../services/runtimeConfig';
import { normalizeServerUrl, probeServer } from '../../services/serverUrl';
import { AuthScreen, ErrorNotice, InfoNotice, authStyles } from '../auth/AuthScreen';

interface ConnectionContextValue {
  serverUrl: string | null;
  /** Short, human-readable server name (host) for display. */
  serverLabel: string;
  /** Present on phones/tablets, where the clinic server address is entered by hand. */
  changeServer?: () => void;
}

const ConnectionContext = createContext<ConnectionContextValue>({ serverUrl: null, serverLabel: '' });

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
 * Makes sure the app knows where its clinic server is before anything else runs.
 *  - Web: reads the `config.json` published by the clinic's web container (or build-time defaults).
 *  - Phone/tablet: asks for the server address once (for example `192.168.1.20:5245`) and remembers it.
 */
export function ConnectionGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [serverUrl, setServerUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (isNative) {
        // Native has no localStorage: remember the workspace on the device instead.
        setTenantStorage({
          getItem: (key) => getDeviceItem(key),
          setItem: (key, value) => setDeviceItem(key, value),
          removeItem: (key) => setDeviceItem(key, null),
        });
      }
      await loadRuntimeConfig();
      if (!active) return;
      setServerUrl(getApiBaseUrl());
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const onConnected = useCallback((url: string) => {
    setServerUrl(url);
    setEditing(false);
  }, []);

  const value = useMemo<ConnectionContextValue>(
    () => ({
      serverUrl,
      serverLabel: hostOf(serverUrl),
      changeServer: isNative ? () => setEditing(true) : undefined,
    }),
    [serverUrl],
  );

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

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

/** Native first-run: point this device at the clinic server on the local network (or a cloud address). */
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
      setError('That workspace name is not valid. Leave it empty for a clinic-owned server.');
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
    <AuthScreen
      title="Connect to your clinic"
      subtitle="Enter the address of the ClinicEz server your clinic runs. Ask your administrator if you are not sure."
    >
      <View style={authStyles.form}>
        <InfoNotice message="This device must be on the same Wi-Fi network as the clinic server. No internet connection is needed." />
        {error ? <ErrorNotice message={error} /> : null}
        <Input
          label="Server address"
          value={address}
          onChangeText={setAddress}
          placeholder="192.168.1.20:5245"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          required
        />
        <Input
          label="Workspace (cloud-hosted clinics only)"
          value={workspace}
          onChangeText={setWorkspace}
          placeholder="Leave empty for a clinic-owned server"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={authStyles.actions}>
          <Button title="Connect" size="lg" loading={busy} onPress={connect} />
          {onCancel ? <Button title="Cancel" variant="ghost" onPress={onCancel} disabled={busy} /> : null}
        </View>
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
