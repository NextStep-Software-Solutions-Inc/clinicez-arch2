import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { Badge, Button, Card, CardHeader, EmptyState, Input, SegmentedControl, ThemedText } from '@ui';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import { PERMISSIONS } from '@constants/permissions';
import { notify } from '@utils/feedback';
import { formatDateTime, isPast } from '@utils/formatDateTime';
import { usePermission } from '../../context/AuthContext';
import { clinicService, type ShareImportStatusDto } from '../../services/clinicService';
import {
  buildRedeemRequest,
  decidePoll,
  DEFAULT_SHARE_PURPOSE,
  describeShareStatus,
  POLL_INTERVAL_MS,
  scopeLabels,
} from '../../services/shareImport';
import { toneToVariant } from '../../components/interop/InteropBadges';
import CameraQrScannerModal from '../../components/CameraQrScannerModal';

type Phase = 'idle' | 'submitting' | 'polling' | 'timedOut' | 'done';
type QueueChoice = 'yes' | 'no';

interface ShareImportScreenProps {
  route?: {
    params?: {
      initialToken?: string;
    };
  };
}

const QUEUE_OPTIONS: Array<{ value: QueueChoice; label: string }> = [
  { value: 'yes', label: 'Add to queue' },
  { value: 'no', label: 'Do not queue' },
];

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <ThemedText variant="caption" color={theme.colors.textMuted}>
        {label}
      </ThemedText>
      <ThemedText variant="bodyBold">{value}</ThemedText>
    </View>
  );
}

export default function ShareImportScreen({ route }: ShareImportScreenProps = {}) {
  const navigation = useNavigation();
  const canImport = usePermission(PERMISSIONS.patientsWrite);

  const [token, setToken] = useState(route?.params?.initialToken ?? '');
  const [purpose, setPurpose] = useState(DEFAULT_SHARE_PURPOSE);
  const [queueChoice, setQueueChoice] = useState<QueueChoice>('yes');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [cameraScannerVisible, setCameraScannerVisible] = useState(false);

  useEffect(() => {
    if (route?.params?.initialToken) {
      setToken(route?.params?.initialToken);
      setFormError(null);
    }
  }, [route?.params?.initialToken]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [status, setStatus] = useState<ShareImportStatusDto | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  // Poll the import status every ~2s until a terminal state, giving up after the timeout.
  useEffect(() => {
    if (!correlationId || phase !== 'polling') return undefined;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    const tick = async () => {
      const [dto, err] = await clinicService.getShareImportStatus(correlationId);
      if (cancelled) return;

      if (dto) {
        setStatus(dto);
        setPollError(null);
      } else if (err) {
        setPollError(err.message || 'Could not check the import status.');
      }

      const decision = decidePoll(dto?.status ?? null, Date.now() - startedAt);
      if (decision === 'stop') setPhase('done');
      else if (decision === 'timeout') setPhase('timedOut');
      else timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [correlationId, phase]);

  const addToQueue = queueChoice === 'yes';

  const reset = useCallback(() => {
    setToken('');
    setChiefComplaint('');
    setFormError(null);
    setCorrelationId(null);
    setStatus(null);
    setPollError(null);
    setPhase('idle');
  }, []);

  const submit = useCallback(async () => {
    if (phase === 'submitting' || phase === 'polling') return;
    const built = buildRedeemRequest({ token, purpose, addToQueue, chiefComplaint });
    if (!built.ok) {
      setFormError(built.error);
      return;
    }
    setFormError(null);
    setStatus(null);
    setPollError(null);
    setPhase('submitting');

    const [result, err] = await clinicService.redeemShareToken(built.request);
    if (err || !result?.correlationId) {
      setPhase('idle');
      setFormError(err?.message || 'The share token could not be redeemed. Check it and try again.');
      return;
    }
    setCorrelationId(result.correlationId);
    setPhase('polling');
  }, [phase, token, purpose, addToQueue, chiefComplaint]);

  const openPatient = useCallback(
    (patientId: string) => {
      navigation.dispatch(CommonActions.navigate('Patients', { openPatientId: patientId }));
    },
    [navigation]
  );

  const busy = phase === 'submitting' || phase === 'polling';

  const renderResult = () => {
    if (phase === 'idle') return null;

    if (phase === 'submitting') {
      return (
        <Card style={styles.resultCard}>
          <View style={styles.waitRow}>
            <ActivityIndicator color={theme.colors.primary} />
            <ThemedText variant="body">Sending the share request…</ThemedText>
          </View>
        </Card>
      );
    }

    if (phase === 'polling' || (phase === 'timedOut' && (!status || status.status === 'Pending'))) {
      const timedOut = phase === 'timedOut';
      return (
        <Card style={styles.resultCard}>
          <CardHeader
            title={timedOut ? 'Still waiting' : 'Waiting for the patient record'}
            subtitle="Checking again every couple of seconds."
            icon={timedOut ? 'hourglass' : 'clock'}
          />
          {timedOut ? (
            <>
              <ThemedText variant="body" color={theme.colors.textSecondary}>
                The record has not arrived yet. The patient app or the sharing service may be slow. You can keep waiting or
                start over with a new scan.
              </ThemedText>
              <View style={styles.actionRow}>
                <Button title="Keep waiting" icon="refresh" onPress={() => setPhase('polling')} />
                <Button title="Start over" variant="secondary" onPress={reset} />
              </View>
            </>
          ) : (
            <View style={styles.waitRow}>
              <ActivityIndicator color={theme.colors.primary} />
              <ThemedText variant="body" color={theme.colors.textSecondary}>
                Request sent. Waiting for the sharing service…
              </ThemedText>
            </View>
          )}
          {pollError ? (
            <ThemedText variant="caption" color={theme.colors.warningText}>
              {pollError} Still retrying.
            </ThemedText>
          ) : null}
        </Card>
      );
    }

    if (!status) return null;

    const display = describeShareStatus(status);
    if (status.status !== 'Imported') {
      return (
        <Card style={styles.resultCard}>
          <CardHeader
            title={display.title}
            icon="alertCircle"
            rightAction={<Badge label={status.status} variant={toneToVariant(display.tone)} />}
          />
          <ThemedText variant="body" color={theme.colors.textSecondary}>
            {display.detail}
          </ThemedText>
          <View style={styles.actionRow}>
            <Button title="Scan another" icon="scan" onPress={reset} />
          </View>
        </Card>
      );
    }

    const scopes = scopeLabels(status.scopes);
    const expired = isPast(status.expiresAtUtc, Date.now());
    return (
      <Card style={styles.resultCard}>
        <CardHeader
          title={display.title}
          icon="checkCircle"
          rightAction={<Badge label="Imported" variant={toneToVariant(display.tone)} />}
        />
        <View style={styles.infoGrid}>
          <InfoRow label="Patient" value={status.patientName || 'Unnamed patient'} />
          <InfoRow label="ClinicEZ ID" value={status.clinicEzId || '--'} />
          <InfoRow label="Items imported" value={String(status.itemsImported)} />
          <InfoRow label="Access expires" value={formatDateTime(status.expiresAtUtc)} />
        </View>
        {expired ? <Badge label="Access has expired" variant="warning" icon="alert" /> : null}

        <View style={styles.fieldGroup}>
          <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
            Granted scopes
          </ThemedText>
          {scopes.length > 0 ? (
            <View style={styles.chipRow}>
              {scopes.map((label) => (
                <Badge key={label} label={label} variant="primary" size="sm" />
              ))}
            </View>
          ) : (
            <ThemedText variant="small" color={theme.colors.textMuted}>
              No scopes were reported.
            </ThemedText>
          )}
        </View>

        {status.queueNumber ? (
          <View style={styles.queueRow}>
            <Badge label={`Queue ${status.queueNumber}`} variant="success" icon="ticket" />
            <ThemedText variant="small" color={theme.colors.textSecondary}>
              Added to today's queue.
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.actionRow}>
          {status.patientId ? (
            <Button title="Open patient" icon="patient" onPress={() => openPatient(status.patientId as string)} />
          ) : null}
          <Button title="Scan another" variant="secondary" icon="scan" onPress={reset} />
        </View>
      </Card>
    );
  };

  return (
    <ResponsiveLayout headerTitle="Scan patient QR" headerSubtitle="Import a patient record from their share token">
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!canImport ? (
          <EmptyState
            icon="lock"
            title="Not available for your role"
            description="Importing a patient needs the patient write permission. Ask an administrator for access."
          />
        ) : (
          <>
            <Card style={styles.formCard}>
              <CardHeader
                title="Share token"
                subtitle="Scan the patient's QR code or paste the token."
                icon="scan"
                rightAction={
                  <Button
                    title="Camera Scanner"
                    variant="outline"
                    size="sm"
                    icon="scan"
                    disabled={busy}
                    onPress={() => setCameraScannerVisible(true)}
                  />
                }
              />
              <Input
                label="Patient share token"
                required
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Scan or paste token"
                helperText="A USB or keyboard scanner types the token here; or tap Camera Scanner above."
                value={token}
                onChangeText={(value) => {
                  setToken(value);
                  if (formError) setFormError(null);
                }}
                onSubmitEditing={submit}
                returnKeyType="go"
                editable={!busy}
                error={formError ?? undefined}
              />
              <Input
                label="Purpose"
                placeholder={DEFAULT_SHARE_PURPOSE}
                value={purpose}
                onChangeText={setPurpose}
                editable={!busy}
              />
              <View style={styles.fieldGroup}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  Queue
                </ThemedText>
                <SegmentedControl options={QUEUE_OPTIONS} value={queueChoice} onChange={setQueueChoice} />
              </View>
              {addToQueue ? (
                <Input
                  label="Chief complaint"
                  placeholder="Optional"
                  value={chiefComplaint}
                  onChangeText={setChiefComplaint}
                  editable={!busy}
                />
              ) : null}
              <View style={styles.actionRow}>
                <Button
                  title="Fetch patient record"
                  icon="download"
                  loading={busy}
                  disabled={token.trim().length === 0}
                  onPress={submit}
                />
              </View>
            </Card>

            {renderResult()}
          </>
        )}
      </ScrollView>
      <CameraQrScannerModal
        visible={cameraScannerVisible}
        title="Scan Patient Share QR"
        subtitle="Align the patient's digital share QR code within the frame"
        onScanned={(scannedCode) => {
          setToken(scannedCode);
          setFormError(null);
        }}
        onClose={() => setCameraScannerVisible(false)}
      />
    </ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surfaceMuted,
  },
  content: {
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
    maxWidth: theme.sizes.contentMaxWidth,
  },
  formCard: {
    gap: theme.spacing.lg,
  },
  resultCard: {
    gap: theme.spacing.lg,
  },
  fieldGroup: {
    gap: theme.spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  waitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  queueRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.lg,
  },
  infoRow: {
    minWidth: theme.sizes.sidebarWidth / 2,
    gap: theme.spacing.xs,
  },
});
