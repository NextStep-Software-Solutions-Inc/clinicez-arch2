import React from 'react';
import { StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import { Skeleton } from '@ui/Skeleton';
import type { ShareQrState } from '../../hooks/useShareQr';
import { useAppTheme } from '../../contexts/ThemeContext';
import CountdownRing from './CountdownRing';
import QrCodeView from './QrCodeView';

const QR_SIZE = 220;

interface RotatingQrProps {
  state: ShareQrState;
  hasScopes: boolean;
}

/** Rotating share QR with countdown, plus loading / offline / error / paused states. */
export default function RotatingQr({ state, hasScopes }: RotatingQrProps) {
  const { colors, spacing, radii } = useAppTheme();
  const { session, error, isOffline, fraction, secondsLeft } = state;
  const expired = session !== null && secondsLeft === 0;

  if (!hasScopes) {
    return (
      <Notice icon="info" message="Choose at least one kind of information to share to generate a code." />
    );
  }

  if (!session) {
    if (isOffline) {
      return <Notice icon="wifiOff" message="You are offline. A new code is created as soon as you reconnect." />;
    }
    if (error) {
      return <Notice icon="alert" message={error} />;
    }
    return (
      <View style={styles.center}>
        <Skeleton width={QR_SIZE + spacing.xl * 2} height={QR_SIZE + spacing.xl * 2} radius={radii.lg} />
        <ThemedText variant="small" color="textMuted" style={{ marginTop: spacing.md }}>
          Creating your code…
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.center, { gap: spacing.md }]}>
      <View style={expired ? styles.expired : undefined}>
        <QrCodeView
          value={session.token.token}
          size={QR_SIZE}
          accessibilityLabel="QR code for the facility to scan"
        />
      </View>
      <View style={[styles.statusRow, { gap: spacing.md }]}>
        <CountdownRing fraction={fraction} secondsLeft={secondsLeft} />
        <View style={styles.statusText}>
          <ThemedText variant="bodyBold">{expired ? 'Refreshing…' : 'Show this code to the facility'}</ThemedText>
          <ThemedText variant="small" color="textMuted">
            It is single-use and renews automatically.
          </ThemedText>
        </View>
      </View>
      {error ? (
        <ThemedText variant="small" style={{ color: colors.warningText }}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

function Notice({ icon, message }: { icon: 'info' | 'wifiOff' | 'alert'; message: string }) {
  const { colors, spacing, radii } = useAppTheme();
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.notice,
        {
          backgroundColor: colors.surfaceSubtle,
          borderColor: colors.border,
          borderRadius: radii.lg,
          padding: spacing.lg,
          gap: spacing.sm,
        },
      ]}
    >
      <AppIcon name={icon} size={24} color="textMuted" />
      <ThemedText variant="body" color="textSecondary" style={styles.noticeText}>
        {message}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  expired: { opacity: 0.35 },
  statusRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  statusText: { flex: 1 },
  notice: { alignItems: 'center', borderWidth: 1 },
  noticeText: { textAlign: 'center' },
});
