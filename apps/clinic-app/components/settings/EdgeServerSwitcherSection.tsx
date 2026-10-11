import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Badge from '../ui/Badge';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import {
  getApiBaseUrl,
  getStoredServerUrl,
  setStoredServerUrl,
} from '../../services/runtimeConfig';
import { normalizeServerUrl, probeServer } from '../../services/serverUrl';
import { useConnection } from '../connection/ConnectionGate';

/**
 * Settings section for inspecting and switching the ClinicEZ Edge or Cloud server URL.
 * Allows on-prem clinic operators and mobile tablet users to test connectivity and switch LAN/Cloud targets.
 */
export default function EdgeServerSwitcherSection() {
  const connection = useConnection();
  const [activeUrl, setActiveUrl] = useState<string | null>(getApiBaseUrl());
  const [storedUrl, setStoredUrl] = useState<string | null>(getStoredServerUrl());
  const [inputUrl, setInputUrl] = useState<string>(getStoredServerUrl() ?? getApiBaseUrl() ?? '');
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<{ reachable: boolean; message?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const refreshState = useCallback(() => {
    const active = getApiBaseUrl();
    const stored = getStoredServerUrl();
    setActiveUrl(active);
    setStoredUrl(stored);
    setInputUrl(stored ?? active ?? '');
  }, []);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  const testConnection = async () => {
    const normalized = normalizeServerUrl(inputUrl);
    if (!normalized) {
      notify.error('Please enter a valid server address, for example 192.168.1.20:5245.');
      return;
    }
    setProbing(true);
    setProbeResult(null);
    try {
      const result = await probeServer(normalized);
      setProbeResult(result);
      if (result.reachable) {
        notify.success(`Server is reachable! (HTTP ${result.status ?? 200})`);
      } else {
        notify.error(result.message ?? 'Server is not reachable on this network.');
      }
    } catch {
      setProbeResult({ reachable: false, message: 'Connection test failed.' });
      notify.error('Could not reach the server.');
    } finally {
      setProbing(false);
    }
  };

  const handleSave = async () => {
    const normalized = normalizeServerUrl(inputUrl);
    if (!normalized) {
      notify.error('Enter a valid server address, for example 192.168.1.20:5245.');
      return;
    }
    setSaving(true);
    try {
      setStoredServerUrl(normalized);
      notify.success('Server address updated. Reconnecting...');
      setEditing(false);
      refreshState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not save server address.';
      notify.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = () => {
    setStoredServerUrl(null);
    notify.info('Reset server address to environment default.');
    setEditing(false);
    setProbeResult(null);
    refreshState();
  };

  const isCustomEdge = !!storedUrl;

  return (
    <Card>
      <CardHeader
        title="Edge server & API connectivity"
        subtitle="Manage whether this device talks to a local on-premise ClinicEZ Edge server or the cloud API."
        rightAction={
          <Badge
            label={isCustomEdge ? 'Local Edge Server' : 'Default Host'}
            variant={isCustomEdge ? 'primary' : 'neutral'}
          />
        }
      />
      <CardContent>
        <View style={styles.container}>
          <View style={styles.activeHostRow}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              Active Server URL:
            </ThemedText>
            <ThemedText variant="bodyBold" color={theme.colors.primary}>
              {activeUrl || '(Not configured)'}
            </ThemedText>
          </View>

          {editing ? (
            <View style={styles.form}>
              <Input
                label="Server address (IP or Hostname)"
                value={inputUrl}
                onChangeText={(val) => {
                  setInputUrl(val);
                  setProbeResult(null);
                }}
                placeholder="192.168.1.20:5245 or https://clinic.example.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                helperText="Specify the local edge node IP:port for air-gapped clinics, or the cloud API host."
              />

              {probing && (
                <View style={styles.probeRow}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <ThemedText variant="small" color={theme.colors.textSecondary}>
                    Testing connection to {inputUrl}…
                  </ThemedText>
                </View>
              )}

              {probeResult && !probing && (
                <View style={styles.probeRow}>
                  <Badge
                    label={probeResult.reachable ? 'Connection OK' : 'Unreachable'}
                    variant={probeResult.reachable ? 'success' : 'emergency'}
                  />
                  {probeResult.message && (
                    <ThemedText
                      variant="small"
                      color={probeResult.reachable ? theme.colors.successText : theme.colors.emergencyText}
                    >
                      {probeResult.message}
                    </ThemedText>
                  )}
                </View>
              )}

              <View style={styles.actionsRow}>
                <Button
                  title="Test Connection"
                  variant="outline"
                  icon="refresh"
                  disabled={probing || saving || !inputUrl.trim()}
                  loading={probing}
                  onPress={testConnection}
                />
                <Button
                  title="Save Address"
                  variant="primary"
                  icon="check"
                  disabled={probing || saving || !inputUrl.trim()}
                  loading={saving}
                  onPress={handleSave}
                />
                <Button
                  title="Cancel"
                  variant="ghost"
                  disabled={probing || saving}
                  onPress={() => {
                    setEditing(false);
                    refreshState();
                  }}
                />
              </View>
            </View>
          ) : (
            <View style={styles.actionsRow}>
              <Button
                title={isCustomEdge ? 'Change Edge Address' : 'Configure Custom Server'}
                icon="settings"
                variant="outline"
                onPress={() => setEditing(true)}
              />
              {isCustomEdge && (
                <Button
                  title="Reset to Default"
                  variant="ghost"
                  onPress={handleResetDefault}
                />
              )}
              {connection.changeServer && (
                <Button
                  title="Reconnect Wizard"
                  variant="secondary"
                  onPress={connection.changeServer}
                />
              )}
            </View>
          )}
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.md,
  },
  activeHostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  form: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
  probeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
});
