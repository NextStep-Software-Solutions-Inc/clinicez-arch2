import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
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
import { useAccessGrants } from 'hooks/useSharing';
import { ApiError } from 'services/api/apiClient';
import { revokeAccessGrant, type AccessGrantDto } from 'services/api/sharingApi';
import { exportPatientData } from 'services/sharing/exportService';
import {
  canRevokeGrant,
  grantSourceLabel,
  grantStatusChip,
  revokeConfirmationMessage,
} from 'services/sharing/presentation';
import { scopeLabel } from 'services/sharing/scopes';

const DATE_FORMAT = 'MMM d, yyyy h:mm a';

function describeError(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.firstMessage : fallback;
}

function grantDates(grant: AccessGrantDto): string {
  const granted = `Granted ${format(new Date(grant.createdAt), DATE_FORMAT)}`;
  if (grant.revokedAt) return `${granted} · Revoked ${format(new Date(grant.revokedAt), DATE_FORMAT)}`;
  const verb = grant.status === 'Expired' ? 'Expired' : 'Expires';
  return `${granted} · ${verb} ${format(new Date(grant.expiresAt), DATE_FORMAT)}`;
}

export default function AccessGrantsScreen() {
  const patientId = usePatientId();
  const { getToken } = useAuth();
  const navigation = useNavigation();
  const { spacing } = useAppTheme();
  const { data: grants, error, isLoading, isValidating, mutate } = useAccessGrants(patientId);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const revoke = async (grant: AccessGrantDto) => {
    const confirmed = await dialog.confirm({
      title: 'Revoke access?',
      message: revokeConfirmationMessage(grant.facilityName),
      confirmLabel: 'Revoke access',
      destructive: true,
    });
    if (!confirmed) return;

    setRevokingId(grant.id);
    try {
      await revokeAccessGrant(getToken, patientId, grant.id);
      await mutate();
    } catch (err) {
      dialog.alert('Could not revoke access', describeError(err, 'Check your connection and try again.'));
    } finally {
      setRevokingId(null);
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      await exportPatientData(getToken, patientId);
    } catch (err) {
      dialog.alert('Export failed', describeError(err, 'Could not export your data. Please try again.'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Screen
      width="form"
      onRefresh={() => void mutate()}
      refreshing={isValidating && !isLoading}
      contentContainerStyle={{ gap: spacing.md }}
    >
      <View style={[styles.actions, { gap: spacing.sm }]}>
        <Button
          label="Access log"
          icon="clipboard"
          variant="outline"
          size="sm"
          onPress={() => navigation.navigate('Main', { screen: 'AccessLogScreen', params: {} })}
        />
        <Button
          label="Export my data"
          icon="download"
          variant="outline"
          size="sm"
          loading={exporting}
          onPress={exportData}
        />
      </View>

      {isLoading ? (
        <Skeleton height={140} />
      ) : error && !grants ? (
        <EmptyState
          title="Could not load access"
          message={describeError(error, 'Check your connection and pull down to retry.')}
          actionLabel="Retry"
          onActionPress={() => void mutate()}
        />
      ) : !grants || grants.length === 0 ? (
        <EmptyState
          title="No one has access yet"
          message="When you share a QR code or book with a facility, the access you grant appears here."
        />
      ) : (
        grants.map((grant) => {
          const status = grantStatusChip(grant.status);
          return (
            <Card key={grant.id} padding="sm" style={{ gap: spacing.sm }}>
              <View style={styles.headerRow}>
                <View style={styles.flex}>
                  <ThemedText variant="bodyBold">{grant.facilityName ?? 'Unknown facility'}</ThemedText>
                  <ThemedText variant="small" color="textMuted">
                    {grantSourceLabel(grant.source)}
                    {grant.purpose ? ` · ${grant.purpose}` : ''}
                  </ThemedText>
                </View>
                <Badge label={status.label} tone={status.tone} icon={status.icon} size="sm" />
              </View>

              <View style={[styles.scopes, { gap: spacing.xs }]}>
                {grant.scopes.map((scope) => (
                  <Badge key={scope} label={scopeLabel(scope)} tone="info" size="sm" />
                ))}
              </View>

              <ThemedText variant="caption" color="textMuted">
                {grantDates(grant)}
              </ThemedText>

              <View style={[styles.actions, { gap: spacing.sm }]}>
                <Button
                  label="View activity"
                  variant="ghost"
                  size="sm"
                  onPress={() =>
                    navigation.navigate('Main', { screen: 'AccessLogScreen', params: { grantId: grant.id } })
                  }
                />
                {canRevokeGrant(grant.status) ? (
                  <Button
                    label="Revoke"
                    variant="danger"
                    size="sm"
                    loading={revokingId === grant.id}
                    disabled={revokingId !== null}
                    onPress={() => revoke(grant)}
                  />
                ) : null}
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  scopes: { flexDirection: 'row', flexWrap: 'wrap' },
});
