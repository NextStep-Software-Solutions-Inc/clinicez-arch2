import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import Card from '@ui/Card';
import Badge from '@ui/Badge';
import Button from '@ui/Button';
import EmptyState from '@ui/EmptyState';
import { Skeleton } from '@ui/Skeleton';
import { dialog } from '@utils/dialog';
import Screen from 'components/layout/Screen';
import { useAppTheme } from 'contexts/ThemeContext';
import { useAuth } from 'contexts/AuthContext';
import { usePatientId } from 'hooks/usePatientId';
import { useCurrentDeviceId, useDeviceSessions } from 'hooks/useDeviceSessions';
import { ApiError } from 'services/api/apiClient';
import {
  revokeAllDeviceSessions,
  revokeDeviceSession,
} from 'services/api/sessionsApi';
import {
  formatLastActive,
  markCurrentDevice,
  type DeviceSessionRow,
} from 'services/devices/presentation';

const NOT_FOUND = 404;

function describeError(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.firstMessage : fallback;
}

export default function MyDevicesScreen() {
  const patientId = usePatientId();
  const { getToken, logout } = useAuth();
  const { spacing } = useAppTheme();
  const { data: sessions, error, isLoading, isValidating, mutate } = useDeviceSessions(patientId);
  const currentDeviceId = useCurrentDeviceId();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [signingOutAll, setSigningOutAll] = useState(false);

  const rows = useMemo(
    () => (sessions ? markCurrentDevice(sessions, currentDeviceId) : []),
    [sessions, currentDeviceId],
  );

  const signOutDevice = async (row: DeviceSessionRow) => {
    const confirmed = await dialog.confirm({
      title: 'Sign out this device?',
      message: `${row.deviceLabel} will be signed out of your account. You can sign in again at any time.`,
      confirmLabel: 'Sign out',
      destructive: true,
    });
    if (!confirmed) return;

    setBusyId(row.id);
    try {
      await revokeDeviceSession(getToken, patientId, row.id);
      await mutate();
    } catch (err) {
      if (err instanceof ApiError && err.status === NOT_FOUND) {
        await mutate();
      } else {
        dialog.alert('Could not sign out device', describeError(err, 'Check your connection and try again.'));
      }
    } finally {
      setBusyId(null);
    }
  };

  const signOutEverywhere = async () => {
    const confirmed = await dialog.confirm({
      title: 'Sign out everywhere?',
      message: 'Every device, including this one, will be signed out of your account.',
      confirmLabel: 'Sign out everywhere',
      destructive: true,
    });
    if (!confirmed) return;

    setSigningOutAll(true);
    try {
      await revokeAllDeviceSessions(getToken, patientId);
      await logout();
    } catch (err) {
      setSigningOutAll(false);
      dialog.alert('Could not sign out', describeError(err, 'Check your connection and try again.'));
    }
  };

  return (
    <Screen
      width="form"
      onRefresh={() => void mutate()}
      refreshing={isValidating && !isLoading}
      contentContainerStyle={{ gap: spacing.md }}
    >
      <ThemedText variant="small" color="textMuted">
        You can stay signed in on several devices at once. Sign out any device you no longer use.
      </ThemedText>

      {isLoading ? (
        <Skeleton height={140} />
      ) : error && !sessions ? (
        <EmptyState
          title="Could not load devices"
          message={describeError(error, 'Check your connection and pull down to retry.')}
          actionLabel="Retry"
          onActionPress={() => void mutate()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No signed-in devices"
          message="Devices you sign in on appear here."
        />
      ) : (
        <>
          {rows.map((row) => (
            <Card key={row.id} padding="sm" style={{ gap: spacing.sm }}>
              <View style={styles.headerRow}>
                <View style={styles.flex}>
                  <ThemedText variant="bodyBold">{row.deviceLabel}</ThemedText>
                  <ThemedText variant="small" color="textMuted">
                    Last active {formatLastActive(row.lastActiveAt)}
                  </ThemedText>
                </View>
                {row.isCurrentDevice ? (
                  <Badge label="This device" tone="success" icon="checkCircle" size="sm" />
                ) : null}
              </View>
              {row.isCurrentDevice ? null : (
                <View style={styles.actions}>
                  <Button
                    label="Sign out"
                    variant="danger"
                    size="sm"
                    loading={busyId === row.id}
                    disabled={busyId !== null || signingOutAll}
                    onPress={() => signOutDevice(row)}
                  />
                </View>
              )}
            </Card>
          ))}
          <Button
            label="Sign out everywhere"
            variant="outline"
            loading={signingOutAll}
            disabled={busyId !== null}
            onPress={signOutEverywhere}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
});
