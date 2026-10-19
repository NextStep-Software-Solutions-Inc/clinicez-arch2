import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  parseSmartShareInput,
  POLL_INTERVAL_MS,
  type RedeemMode,
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

const MODE_OPTIONS: Array<{ value: RedeemMode; label: string }> = [
  { value: 'token', label: 'Scan QR / Token' },
  { value: 'code', label: 'One-Time Code' },
];

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

  const [mode, setMode] = useState<RedeemMode>('token');
  const [token, setToken] = useState(route?.params?.initialToken ?? '');
  const [clinicEzId, setClinicEzId] = useState('');
  const [code, setCode] = useState('');
  const [purpose, setPurpose] = useState(DEFAULT_SHARE_PURPOSE);
  const [queueChoice, setQueueChoice] = useState<QueueChoice>('yes');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [cameraScannerVisible, setCameraScannerVisible] = useState(false);
  const codeInputRef = useRef<any>(null);

  useEffect(() => {
    if (route?.params?.initialToken) {
      setMode('token');
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
    setClinicEzId('');
    setCode('');
    setChiefComplaint('');
    setFormError(null);
    setCorrelationId(null);
    setStatus(null);
    setPollError(null);
    setPhase('idle');
  }, []);

  const handleTokenChange = (value: string) => {
    if (formError) setFormError(null);
    const parsed = parseSmartShareInput(value);
    if (parsed && (parsed.clinicEzId || parsed.code) && !parsed.token) {
      setMode('code');
      if (parsed.clinicEzId) setClinicEzId(parsed.clinicEzId);
      if (parsed.code) setCode(parsed.code);
      setToken('');
      notify.info('Switched to One-Time Code mode based on input.');
      return;
    }
    setToken(value);
  };

  const handleClinicEzIdChange = (value: string) => {
    if (formError) setFormError(null);
    const parsed = parseSmartShareInput(value);
    if (parsed?.token && !parsed.clinicEzId && !parsed.code) {
      setMode('token');
      setToken(parsed.token);
      notify.info('Switched to QR / Token mode based on pasted token.');
      return;
    }
    if (parsed?.clinicEzId && parsed?.code) {
      setClinicEzId(parsed.clinicEzId);
      setCode(parsed.code);
      return;
    }
    setClinicEzId(value);
  };

  const handleCodeChange = (value: string) => {
    if (formError) setFormError(null);
    const parsed = parseSmartShareInput(value);
    if (parsed?.token && !parsed.clinicEzId && !parsed.code) {
      setMode('token');
      setToken(parsed.token);
      notify.info('Switched to QR / Token mode based on pasted token.');
      return;
    }
    if (parsed?.clinicEzId && parsed?.code) {
      setClinicEzId(parsed.clinicEzId);
      setCode(parsed.code);
      return;
    }
    setCode(value);
  };

  const submit = useCallback(async () => {
    if (phase === 'submitting' || phase === 'polling') return;
    const built = buildRedeemRequest({
      mode,
      token,
      clinicEzId,
      code,
      purpose,
      addToQueue,
      chiefComplaint,
    });
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
      setFormError(
        err?.message ||
          (mode === 'code'
            ? 'The share code could not be redeemed. Check it and try again.'
            : 'The share token could not be redeemed. Check it and try again.')
      );
      return;
    }
    setCorrelationId(result.correlationId);
    setPhase('polling');
  }, [phase, mode, token, clinicEzId, code, purpose, addToQueue, chiefComplaint]);

  const openPatient = useCallback(
    (patientId: string) => {
      navigation.dispatch(CommonActions.navigate('Patients', { openPatientId: patientId }));
    },
    [navigation]
  );

  const busy = phase === 'submitting' || phase === 'polling';

  const idError = formError
    ? formError.includes('Clinic EZ ID')
      ? formError.includes('one-time code')
        ? 'Clinic EZ ID is required'
        : formError
      : undefined
    : undefined;

  const codeError = formError
    ? formError.includes('one-time code')
      ? formError.includes('Clinic EZ ID')
        ? 'One-time code is required'
        : formError
      : formError.includes('code') && !formError.includes('Clinic EZ ID')
      ? formError
      : undefined
    : undefined;

  const generalError = formError && !idError && !codeError ? formError : undefined;

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
            <Button
              title={mode === 'code' ? 'Try another code' : 'Scan another'}
              icon={mode === 'code' ? 'refresh' : 'scan'}
              onPress={reset}
            />
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
          <InfoRow label="Clinic EZ ID" value={status.clinicEzId || '--'} />
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
          <Button
            title={mode === 'code' ? 'Import another' : 'Scan another'}
            variant="secondary"
            icon={mode === 'code' ? 'refresh' : 'scan'}
            onPress={reset}
          />
        </View>
      </Card>
    );
  };

  return (
    <ResponsiveLayout headerTitle="Import Patient Share" headerSubtitle="Import a patient record from a QR code, share token, or one-time code">
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
                title={mode === 'token' ? 'Share token' : 'One-time share code'}
                subtitle={
                  mode === 'token'
                    ? "Scan the patient's QR code or paste the token."
                    : "Ask the patient for their Clinic EZ ID and 8-character code."
                }
                icon={mode === 'token' ? 'scan' : 'key'}
                rightAction={
                  mode === 'token' ? (
                    <Button
                      title="Camera Scanner"
                      variant="outline"
                      size="sm"
                      icon="scan"
                      disabled={busy}
                      onPress={() => setCameraScannerVisible(true)}
                    />
                  ) : undefined
                }
              />
              <View style={styles.fieldGroup}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  Import method
                </ThemedText>
                <SegmentedControl
                  options={MODE_OPTIONS}
                  value={mode}
                  onChange={(nextMode) => {
                    setMode(nextMode);
                    setFormError(null);
                  }}
                />
              </View>
              {mode === 'token' ? (
                <Input
                  label="Patient share token"
                  required
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Scan or paste token"
                  helperText="A USB or keyboard scanner types the token here; or tap Camera Scanner above."
                  value={token}
                  onChangeText={handleTokenChange}
                  onSubmitEditing={submit}
                  returnKeyType="go"
                  editable={!busy}
                  error={formError ?? undefined}
                />
              ) : (
                <>
                  <Input
                    label="Clinic EZ ID"
                    required
                    autoFocus
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholder="e.g. CE-ABCD-1234"
                    helperText="The patient's Clinic EZ ID (e.g. CE-ABCD-1234)."
                    value={clinicEzId}
                    onChangeText={handleClinicEzIdChange}
                    onSubmitEditing={() => {
                      if (codeInputRef.current?.focus) {
                        codeInputRef.current.focus();
                      } else if (code.trim()) {
                        submit();
                      }
                    }}
                    returnKeyType="next"
                    editable={!busy}
                    error={idError}
                  />
                  <Input
                    inputRef={codeInputRef}
                    label="One-time share code"
                    required
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholder="e.g. WXYZ-5678"
                    helperText="8-character code shown on the patient's phone."
                    value={code}
                    onChangeText={handleCodeChange}
                    onSubmitEditing={submit}
                    returnKeyType="go"
                    editable={!busy}
                    error={codeError}
                  />
                </>
              )}
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
              {generalError ? (
                <ThemedText variant="caption" color={theme.colors.emergency}>
                  {generalError}
                </ThemedText>
              ) : null}
              <View style={styles.actionRow}>
                <Button
                  title="Fetch patient record"
                  icon="download"
                  loading={busy}
                  disabled={
                    busy ||
                    (mode === 'token'
                      ? token.trim().length === 0
                      : clinicEzId.trim().length === 0 || code.trim().length === 0)
                  }
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
          handleTokenChange(scannedCode);
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
