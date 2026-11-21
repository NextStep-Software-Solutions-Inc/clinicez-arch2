import { useMemo, useState } from 'react';
import { StyleSheet, View, Pressable, ActivityIndicator } from 'react-native';
import ThemedText from '@ui/ThemedText';
import Card from '@ui/Card';
import Badge from '@ui/Badge';
import Button from '@ui/Button';
import EmptyState from '@ui/EmptyState';
import { Skeleton } from '@ui/Skeleton';
import { AppIcon, type IconName } from '@ui/Icon';
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

function resolveDeviceIcon(label: string): IconName {
  const lower = label.toLowerCase();
  if (
    lower.includes('android') ||
    lower.includes('iphone') ||
    lower.includes('xiaomi') ||
    lower.includes('samsung') ||
    lower.includes('pixel') ||
    lower.includes('oppo') ||
    lower.includes('vivo') ||
    lower.includes('huawei') ||
    lower.includes('phone') ||
    lower.includes('mobile')
  ) {
    return 'phone';
  }
  if (
    lower.includes('mac') ||
    lower.includes('windows') ||
    lower.includes('linux') ||
    lower.includes('pc') ||
    lower.includes('desktop') ||
    lower.includes('laptop')
  ) {
    return 'monitor';
  }
  return 'globe';
}

export default function MyDevicesScreen() {
  const patientId = usePatientId();
  const { getToken, logout } = useAuth();
  const { colors, spacing, radii } = useAppTheme();
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
          {rows.map((row) => {
            const iconName = resolveDeviceIcon(row.deviceLabel);
            return (
              <Card
                key={row.id}
                padding="none"
                style={[
                  styles.card,
                  {
                    borderColor: row.isCurrentDevice ? colors.primaryBorder : colors.border,
                    backgroundColor: row.isCurrentDevice ? colors.surfaceSubtle : colors.card,
                    borderRadius: radii.xl,
                  },
                ]}
              >
                <View style={[styles.cardContent, { padding: spacing.md }]}>
                  {/* Left: Device Icon Badge */}
                  <View
                    style={[
                      styles.deviceIconBox,
                      {
                        backgroundColor: row.isCurrentDevice ? colors.primarySubtle : colors.surfaceSubtle,
                        borderRadius: radii.lg,
                      },
                    ]}
                  >
                    <AppIcon
                      name={iconName}
                      size={20}
                      color={row.isCurrentDevice ? 'primary' : 'textSecondary'}
                    />
                  </View>

                  {/* Middle: Device Name & Activity */}
                  <View style={styles.deviceMeta}>
                    <ThemedText variant="bodyBold" numberOfLines={1}>
                      {row.deviceLabel}
                    </ThemedText>
                    <ThemedText variant="small" color="textMuted" numberOfLines={1}>
                      {row.isCurrentDevice ? 'Active now' : `Last active ${formatLastActive(row.lastActiveAt)}`}
                    </ThemedText>
                  </View>

                  {/* Right: Badge or Action Button */}
                  <View style={styles.actionCol}>
                    {row.isCurrentDevice ? (
                      <Badge label="This device" tone="success" icon="checkCircle" size="sm" />
                    ) : (
                      <Pressable
                        onPress={() => signOutDevice(row)}
                        disabled={busyId !== null || signingOutAll}
                        accessibilityRole="button"
                        accessibilityLabel={`Sign out ${row.deviceLabel}`}
                        style={({ pressed, hovered }: any) => [
                          styles.signOutBtn,
                          {
                            borderRadius: radii.full,
                            backgroundColor: hovered ? colors.emergencyBg : colors.surfaceSubtle,
                            borderColor: hovered ? colors.emergencyBorder : colors.border,
                          },
                          pressed && { opacity: 0.65 },
                        ]}
                      >
                        {busyId === row.id ? (
                          <ActivityIndicator size="small" color={colors.emergency} />
                        ) : (
                          <>
                            <AppIcon name="logout" size={14} color="emergency" />
                            <ThemedText variant="smallBold" color="emergency">
                              Sign out
                            </ThemedText>
                          </>
                        )}
                      </Pressable>
                    )}
                  </View>
                </View>
              </Card>
            );
          })}

          <View style={styles.footerZone}>
            <Button
              label="Sign out of all devices"
              icon="logout"
              variant="outline"
              fullWidth
              loading={signingOutAll}
              disabled={busyId !== null}
              onPress={signOutEverywhere}
            />
            <ThemedText variant="caption" color="textMuted" style={styles.footerNote}>
              This will sign you out of all sessions across all devices, including this one.
            </ThemedText>
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deviceIconBox: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceMeta: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  actionCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 34,
    borderWidth: 1,
  },
  footerZone: {
    marginTop: 8,
    gap: 6,
  },
  footerNote: {
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});
