import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { SkeletonList } from '../ui/Skeleton';
import { ToggleSwitch } from './AddEditFieldModal';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import { clinicService, ClinicSettingsRecord } from '../../services/clinicService';

export interface NotificationSettingsCardProps {
  settings: ClinicSettingsRecord | null;
  onSettingsUpdated?: (updated: ClinicSettingsRecord) => void;
  showSkeletons?: boolean;
}

const THRESHOLD_OPTIONS = [1, 2, 3, 4, 5];
const RETENTION_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
  { label: '60 days', value: 60 },
  { label: '90 days', value: 90 },
  { label: 'Keep all', value: 0 },
];

export default function NotificationSettingsCard({
  settings,
  onSettingsUpdated,
  showSkeletons = false,
}: NotificationSettingsCardProps) {
  // Queue Push Settings
  const [enablePush, setEnablePush] = useState<boolean>(true);
  const [threshold, setThreshold] = useState<number>(2);

  // Staff Notification Settings
  const [retentionDays, setRetentionDays] = useState<number>(30);
  const [enableAudio, setEnableAudio] = useState<boolean>(true);
  const [enableVibration, setEnableVibration] = useState<boolean>(true);

  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (settings) {
      setEnablePush(settings.enableQueuePushNotifications ?? true);
      const initialThreshold = settings.queuePushNotificationThreshold ?? 2;
      setThreshold(Math.max(1, Math.min(5, initialThreshold)));
      setRetentionDays(settings.staffNotificationRetentionDays ?? 30);
      setEnableAudio(settings.enableStatAudioAlert ?? true);
      setEnableVibration(settings.enableStatVibrationAlert ?? true);
    }
  }, [settings]);

  const isDirty = useMemo(() => {
    const origEnablePush = settings?.enableQueuePushNotifications ?? true;
    const origThreshold = settings?.queuePushNotificationThreshold ?? 2;
    const origRetention = settings?.staffNotificationRetentionDays ?? 30;
    const origAudio = settings?.enableStatAudioAlert ?? true;
    const origVibration = settings?.enableStatVibrationAlert ?? true;

    return (
      enablePush !== origEnablePush ||
      threshold !== origThreshold ||
      retentionDays !== origRetention ||
      enableAudio !== origAudio ||
      enableVibration !== origVibration
    );
  }, [settings, enablePush, threshold, retentionDays, enableAudio, enableVibration]);

  const handleSaveSettings = useCallback(async () => {
    setSaving(true);
    try {
      const [updated, err] = await clinicService.updateSettings({
        enableQueuePushNotifications: enablePush,
        queuePushNotificationThreshold: threshold,
        staffNotificationRetentionDays: retentionDays,
        enableStatAudioAlert: enableAudio,
        enableStatVibrationAlert: enableVibration,
      });

      if (err || !updated) {
        notify.error(err?.message || 'Could not save notification settings.');
        return;
      }

      notify.success('Notification preferences updated successfully.');
      onSettingsUpdated?.(updated);
    } catch {
      notify.error('Failed to save notification preferences.');
    } finally {
      setSaving(false);
    }
  }, [enablePush, threshold, retentionDays, enableAudio, enableVibration, onSettingsUpdated]);

  const queueHelperText = `Patients will receive a push notification when they are ${threshold} patient${
    threshold > 1 ? 's' : ''
  } away in line.`;

  const retentionHelperText =
    retentionDays === 0
      ? 'Read notifications will be kept indefinitely in the clinic history.'
      : `Read staff notifications older than ${retentionDays} days will be automatically purged by daily maintenance. Unread notifications are always retained.`;

  return (
    <Card>
      <CardHeader
        title="Notification System & Alert Preferences"
        subtitle="Manage patient queue push notifications, staff alert retention, and STAT diagnostic chimes"
        rightAction={
          <Badge
            label={enablePush ? 'Queue Push Active' : 'Queue Push Disabled'}
            variant={enablePush ? 'success' : 'neutral'}
          />
        }
      />
      <CardContent>
        {showSkeletons ? (
          <SkeletonList rows={4} />
        ) : (
          <View style={styles.container}>
            {/* SECTION 1: Patient Mobile Push Notifications */}
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeader}>
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  Patient Mobile Queue Notifications
                </ThemedText>
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  Configure automated queue updates dispatched to the Clinic EZ Patient App.
                </ThemedText>
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <View style={styles.titleWithIcon}>
                    <Icon name="bell" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      Enable Patient App Queue Alerts
                    </ThemedText>
                  </View>
                  <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.toggleSubtitle}>
                    Deliver mobile push alerts when a patient is called to a consultation room or approaching their turn.
                  </ThemedText>
                </View>
                <ToggleSwitch
                  value={enablePush}
                  onValueChange={setEnablePush}
                  accessibilityLabel="Toggle Patient App Push Notifications"
                />
              </View>

              {/* Threshold Selector */}
              <View
                style={[styles.subCard, { opacity: enablePush ? 1.0 : 0.4 }]}
                pointerEvents={enablePush ? 'auto' : 'none'}
              >
                <View style={styles.subCardHeader}>
                  <View style={styles.iconWrap}>
                    <Icon name="ticket" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
                  </View>
                  <View style={styles.subCardInfo}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      Approaching Turn Alert Threshold
                    </ThemedText>
                    <ThemedText variant="small" color={theme.colors.textSecondary}>
                      Patients ahead in line triggering the &quot;approaching turn&quot; alert (1 to 5 patients).
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.chipRow}>
                  {THRESHOLD_OPTIONS.map((val) => {
                    const isSelected = threshold === val;
                    return (
                      <Pressable
                        key={val}
                        onPress={() => setThreshold(val)}
                        disabled={!enablePush || saving}
                        style={({ pressed }) => [
                          styles.chip,
                          isSelected && styles.chipSelected,
                          pressed && styles.chipPressed,
                        ]}
                      >
                        <ThemedText
                          variant="captionBold"
                          color={isSelected ? theme.colors.onPrimary : theme.colors.text}
                        >
                          {val} {val === 1 ? 'patient' : 'patients'}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.helperBox}>
                  <ThemedText variant="small" color={theme.colors.textSecondary}>
                    {queueHelperText}
                  </ThemedText>
                </View>
              </View>
            </View>

            {/* SECTION 2: Staff Notification Retention Policy */}
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeader}>
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  Staff Notification Retention Policy
                </ThemedText>
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  Configure automated cleanup threshold for read notifications.
                </ThemedText>
              </View>

              <View style={styles.subCard}>
                <View style={styles.subCardHeader}>
                  <View style={styles.iconWrap}>
                    <Icon name="calendar" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
                  </View>
                  <View style={styles.subCardInfo}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      Read Notification Retention Period
                    </ThemedText>
                    <ThemedText variant="small" color={theme.colors.textSecondary}>
                      Select how long read notifications are preserved before automated archival.
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.chipRow}>
                  {RETENTION_OPTIONS.map((opt) => {
                    const isSelected = retentionDays === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => setRetentionDays(opt.value)}
                        disabled={saving}
                        style={({ pressed }) => [
                          styles.chip,
                          isSelected && styles.chipSelected,
                          pressed && styles.chipPressed,
                        ]}
                      >
                        <ThemedText
                          variant="captionBold"
                          color={isSelected ? theme.colors.onPrimary : theme.colors.text}
                        >
                          {opt.label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.helperBox}>
                  <ThemedText variant="small" color={theme.colors.textSecondary}>
                    {retentionHelperText}
                  </ThemedText>
                </View>
              </View>
            </View>

            {/* SECTION 3: Clinical STAT / Panic Result Alerts */}
            <View style={styles.sectionBlock}>
              <View style={styles.sectionHeader}>
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  STAT Critical Diagnostic Alerts
                </ThemedText>
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  Audio chime and haptic feedback behaviors when panic laboratory results arrive.
                </ThemedText>
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    Workstation Audio Chime for STAT Results
                  </ThemedText>
                  <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.toggleSubtitle}>
                    Play a distinct alert chime on workstation browsers when emergency panic lab results are reported.
                  </ThemedText>
                </View>
                <ToggleSwitch
                  value={enableAudio}
                  onValueChange={setEnableAudio}
                  accessibilityLabel="Toggle STAT Audio Alert"
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    Device Vibration for STAT Results
                  </ThemedText>
                  <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.toggleSubtitle}>
                    Vibrate mobile and tablet devices upon receiving critical diagnostic panic findings.
                  </ThemedText>
                </View>
                <ToggleSwitch
                  value={enableVibration}
                  onValueChange={setEnableVibration}
                  accessibilityLabel="Toggle STAT Vibration Alert"
                />
              </View>
            </View>

            {/* SAVE BUTTON */}
            <View style={styles.actionRow}>
              <Button
                title="Save Notification Settings"
                variant="primary"
                icon="check"
                onPress={handleSaveSettings}
                loading={saving}
                disabled={saving || !isDirty}
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
    gap: theme.spacing.xl,
  },
  sectionBlock: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
  },
  sectionHeader: {
    gap: theme.spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  toggleInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  toggleSubtitle: {
    lineHeight: theme.spacing.lg,
  },
  subCard: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  subCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  iconWrap: {
    width: theme.sizes.iconLg,
    height: theme.sizes.iconLg,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subCardInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs + 2,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipPressed: {
    opacity: 0.8,
  },
  helperBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    justifyContent: 'flex-start',
    marginTop: theme.spacing.sm,
  },
});
