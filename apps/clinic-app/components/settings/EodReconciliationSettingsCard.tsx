import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import { Card, CardContent, CardHeader } from '../ui/Card';
import TimeInput, { validateTimeString } from '../ui/TimeInput';
import { SkeletonList } from '../ui/Skeleton';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import { clinicService, ClinicSettingsRecord } from '../../services/clinicService';
import { ToggleSwitch } from './AddEditFieldModal';
import ForceEodConfirmationModal from '../queue/ForceEodConfirmationModal';

export interface EodReconciliationSettingsCardProps {
  settings: ClinicSettingsRecord | null;
  onSettingsUpdated?: (updated: ClinicSettingsRecord) => void;
  showSkeletons?: boolean;
  onForceEodSuccess?: () => void;
}

export default function EodReconciliationSettingsCard({
  settings,
  onSettingsUpdated,
  showSkeletons = false,
  onForceEodSuccess,
}: EodReconciliationSettingsCardProps) {
  const [autoEodEnabled, setAutoEodEnabled] = useState<boolean>(true);
  const [eodTime, setEodTime] = useState<string>('21:00');
  const eodTimeRef = useRef(eodTime);
  eodTimeRef.current = eodTime;
  const [timeError, setTimeError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [showForceModal, setShowForceModal] = useState(false);

  useEffect(() => {
    if (settings) {
      setAutoEodEnabled(settings.autoEodEnabled ?? true);
      const initialTime = settings.eodReconciliationTime || '21:00';
      setEodTime(initialTime);
      eodTimeRef.current = initialTime;
    }
  }, [settings]);

  const handleTimeChange = (newTime: string) => {
    eodTimeRef.current = newTime;
    setEodTime(newTime);
    if (!newTime?.trim()) {
      setTimeError('Reconciliation cutoff time is required (e.g. 21:00).');
      return;
    }
    const validation = validateTimeString(newTime);
    if (!validation.isValid) {
      setTimeError(validation.errorMessage);
    } else {
      setTimeError(undefined);
    }
  };

  const handleSaveEodSchedule = async () => {
    const timeToValidate = eodTimeRef.current;
    if (!timeToValidate?.trim()) {
      const errorMsg = 'Reconciliation cutoff time is required (e.g. 21:00).';
      setTimeError(errorMsg);
      notify.error(errorMsg);
      return;
    }

    const validation = validateTimeString(timeToValidate);
    if (!validation.isValid) {
      setTimeError(validation.errorMessage);
      notify.error(validation.errorMessage || 'Invalid time format. Use HH:MM in 24h format.');
      return;
    }

    setSaving(true);
    try {
      const [saved, err] = await clinicService.updateSettings({
        autoEodEnabled,
        eodReconciliationTime: timeToValidate.trim(),
      });

      if (err) {
        notify.error(err.message || 'Could not save EOD schedule preferences.');
        return;
      }

      if (saved) {
        onSettingsUpdated?.(saved);
      }
      notify.success('End-of-day reconciliation preferences saved.');
    } catch (ex: any) {
      notify.error(ex?.message || 'Could not save EOD schedule preferences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="End-of-Day (EOD) Reconciliation & Day Closure"
        subtitle="Configure daily automatic queue reconciliation and manage on-demand day closure"
        rightAction={
          <Badge
            label={autoEodEnabled ? 'Auto-EOD Active' : 'Auto-EOD Disabled'}
            variant={autoEodEnabled ? 'success' : 'neutral'}
          />
        }
      />
      <CardContent>
        {showSkeletons ? (
          <SkeletonList rows={3} />
        ) : (
          <View style={styles.container}>
            {/* Toggle Row */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  Automated End-of-Day Reconciliation
                </ThemedText>
                <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.toggleSubtitle}>
                  When enabled, the automated background worker checks local clinic time and transitions remaining waiting tickets to No-Show with a completion timestamp.
                </ThemedText>
              </View>
              <ToggleSwitch
                value={autoEodEnabled}
                onValueChange={setAutoEodEnabled}
                accessibilityLabel="Toggle Automated EOD Reconciliation"
              />
            </View>

            {/* Time Input & Schedule Setting */}
            <View style={styles.scheduleRow}>
              <View style={styles.timeInputCol}>
                <TimeInput
                  label="Daily EOD Cutoff Time (24h HH:MM)"
                  value={eodTime}
                  onChangeText={handleTimeChange}
                  error={timeError}
                  helperText="Local clinic time when daily queue reconciliation automatically executes."
                  disabled={!autoEodEnabled || saving}
                  required
                />
              </View>

              <View style={styles.saveActionCol}>
                <Button
                  title="Save EOD Schedule"
                  variant="primary"
                  icon="check"
                  onPress={handleSaveEodSchedule}
                  loading={saving}
                  disabled={Boolean(timeError) || !eodTime?.trim() || saving}
                />
              </View>
            </View>

            {/* Invariant & Manual Trigger Section */}
            <View style={styles.manualClosureCard}>
              <View style={styles.manualClosureHeader}>
                <View style={styles.manualIconWrap}>
                  <Icon name="clock" size={theme.sizes.iconMd} color={theme.colors.emergencyText} />
                </View>
                <View style={styles.manualInfo}>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    Manual Force EOD / Close Clinic Day
                  </ThemedText>
                  <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.manualSubtitle}>
                    Close outpatient operations immediately. Transitions today&apos;s active Waiting, Triaged, and On Hold tickets to No-Show and writes an audit record. Consultations in progress and completed visits are strictly preserved.
                  </ThemedText>
                </View>
              </View>

              <View style={styles.manualActionRow}>
                <Button
                  title="Force EOD / Close Clinic Day"
                  variant="danger"
                  icon="alert"
                  onPress={() => setShowForceModal(true)}
                />
              </View>
            </View>
          </View>
        )}
      </CardContent>

      <ForceEodConfirmationModal
        visible={showForceModal}
        onClose={() => setShowForceModal(false)}
        onSuccess={() => {
          onForceEodSuccess?.();
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    gap: theme.spacing.md,
  },
  toggleInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  toggleSubtitle: {
    lineHeight: 18,
  },
  scheduleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  timeInputCol: {
    flex: 1,
    minWidth: 260,
  },
  saveActionCol: {
    paddingTop: theme.spacing.lg,
    justifyContent: 'flex-end',
  },
  manualClosureCard: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.border,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  manualClosureHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  manualIconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.emergencyBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  manualSubtitle: {
    lineHeight: 18,
  },
  manualActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
