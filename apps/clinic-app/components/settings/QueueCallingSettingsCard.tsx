import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { SkeletonList } from '../ui/Skeleton';
import { ToggleSwitch } from './AddEditFieldModal';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import { clinicService, ClinicSettingsRecord } from '../../services/clinicService';

export interface QueueCallingSettingsCardProps {
  settings: ClinicSettingsRecord | null;
  onSettingsUpdated?: (updated: ClinicSettingsRecord) => void;
  showSkeletons?: boolean;
}

export default function QueueCallingSettingsCard({
  settings,
  onSettingsUpdated,
  showSkeletons = false,
}: QueueCallingSettingsCardProps) {
  const [allowChipCalling, setAllowChipCalling] = useState<boolean>(false);
  const [, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (settings) {
      setAllowChipCalling(Boolean(settings.enableChipLevelQueueCalling));
    }
  }, [settings]);

  const handleToggleChipCalling = useCallback(
    async (val: boolean) => {
      setAllowChipCalling(val);
      setSaving(true);
      try {
        const [updated, err] = await clinicService.updateSettings({
          enableChipLevelQueueCalling: val,
        });
        if (err || !updated) {
          setAllowChipCalling(!val);
          notify.error(err?.message || 'Could not update queue calling preferences.');
          return;
        }
        notify.success(
          val
            ? 'Chip-level direct calling enabled in Consultations.'
            : 'Chip-level direct calling disabled (sequential queue calling enforced).'
        );
        onSettingsUpdated?.(updated);
      } catch {
        setAllowChipCalling(!val);
        notify.error('Failed to save queue calling settings.');
      } finally {
        setSaving(false);
      }
    },
    [onSettingsUpdated]
  );

  return (
    <Card>
      <CardHeader
        icon="bell"
        title="Queue Calling & Out-of-Order Controls"
        subtitle="Manage whether clinicians can page specific waiting patients directly from individual queue chips"
        rightAction={
          <Badge
            label={allowChipCalling ? 'Direct Calling Opt-in: Active' : 'Sequential Queue: Enforced'}
            variant={allowChipCalling ? 'primary' : 'neutral'}
            size="sm"
          />
        }
      />
      <CardContent>
        {showSkeletons ? (
          <SkeletonList rows={2} />
        ) : (
          <View style={styles.container}>
            <View style={styles.toggleRow}>
              <View style={styles.textContainer}>
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  Allow chip-level direct queue calling
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.subtext}>
                  When enabled, clinicians can call specific waiting patients directly from individual queue chips in the Consultations workstation. When disabled (default recommended for standard OPD), clinicians must use the sequential "Call next patient" button.
                </ThemedText>
              </View>
              <ToggleSwitch
                value={allowChipCalling}
                onValueChange={handleToggleChipCalling}
              />
            </View>
          </View>
        )}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  textContainer: {
    flex: 1,
    gap: 4,
  },
  subtext: {
    lineHeight: 18,
  },
});
