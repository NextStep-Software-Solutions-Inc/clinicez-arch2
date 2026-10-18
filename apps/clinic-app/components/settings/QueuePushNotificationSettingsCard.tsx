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

export interface QueuePushNotificationSettingsCardProps {
  settings: ClinicSettingsRecord | null;
  onSettingsUpdated?: (updated: ClinicSettingsRecord) => void;
  showSkeletons?: boolean;
}

const THRESHOLD_OPTIONS = [1, 2, 3, 4, 5];

export default function QueuePushNotificationSettingsCard({
  settings,
  onSettingsUpdated,
  showSkeletons = false,
}: QueuePushNotificationSettingsCardProps) {
  const [enablePush, setEnablePush] = useState<boolean>(true);
  const [threshold, setThreshold] = useState<number>(2);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (settings) {
      setEnablePush(settings.enableQueuePushNotifications ?? true);
      const initialThreshold = settings.queuePushNotificationThreshold ?? 2;
      setThreshold(Math.max(1, Math.min(5, initialThreshold)));
    }
  }, [settings]);

  const isDirty = useMemo(() => {
    const origEnable = settings?.enableQueuePushNotifications ?? true;
    const origThreshold = settings?.queuePushNotificationThreshold ?? 2;
    return enablePush !== origEnable || threshold !== origThreshold;
  }, [settings, enablePush, threshold]);

  const handleTogglePush = useCallback(
    async (val: boolean) => {
      setEnablePush(val);
      setSaving(true);
      try {
        const [updated, err] = await clinicService.updateSettings({
          enableQueuePushNotifications: val,
          queuePushNotificationThreshold: threshold,
        });
        if (err || !updated) {
          setEnablePush(!val);
          notify.error(err?.message || 'Could not update push notification settings.');
          return;
        }
        notify.success(
          val
            ? 'Patient app push notifications enabled.'
            : 'Patient app push notifications disabled.'
        );
        onSettingsUpdated?.(updated);
      } catch {
        setEnablePush(!val);
        notify.error('Failed to save push notification settings.');
      } finally {
        setSaving(false);
      }
    },
    [threshold, onSettingsUpdated]
  );

  const handleDecrement = useCallback(() => {
    if (!enablePush || threshold <= 1 || saving) return;
    setThreshold((prev) => Math.max(1, prev - 1));
  }, [enablePush, threshold, saving]);

  const handleIncrement = useCallback(() => {
    if (!enablePush || threshold >= 5 || saving) return;
    setThreshold((prev) => Math.min(5, prev + 1));
  }, [enablePush, threshold, saving]);

  const handleSelectThreshold = useCallback(
    (val: number) => {
      if (!enablePush || saving) return;
      const clamped = Math.max(1, Math.min(5, val));
      setThreshold(clamped);
    },
    [enablePush, saving]
  );

  const handleSaveSettings = useCallback(async () => {
    setSaving(true);
    try {
      const [updated, err] = await clinicService.updateSettings({
        enableQueuePushNotifications: enablePush,
        queuePushNotificationThreshold: threshold,
      });
      if (err || !updated) {
        notify.error(err?.message || 'Could not save push notification settings.');
        return;
      }
      notify.success(
        `Push notification preferences saved (${threshold} patient${threshold > 1 ? 's' : ''} away).`
      );
      onSettingsUpdated?.(updated);
    } catch {
      notify.error('Failed to save push notification preferences.');
    } finally {
      setSaving(false);
    }
  }, [enablePush, threshold, onSettingsUpdated]);

  const helperText = `Patients will receive a push notification when they are ${threshold} patient${threshold > 1 ? 's' : ''} away in line.`;

  return (
    <Card>
      <CardHeader
        title="Patient Queue Push Notifications"
        subtitle="Notify patients on their mobile app when called or approaching their turn"
        rightAction={
          <Badge
            label={enablePush ? 'Push Notifications Active' : 'Push Alerts Disabled'}
            variant={enablePush ? 'success' : 'neutral'}
          />
        }
      />
      <CardContent>
        {showSkeletons ? (
          <SkeletonList rows={3} />
        ) : (
          <View style={styles.container}>
            {/* Push Notifications Master Toggle */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <View style={styles.titleWithIcon}>
                  <Icon name="bell" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    Enable Patient App Push Notifications
                  </ThemedText>
                </View>
                <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.toggleSubtitle}>
                  Deliver real-time mobile push notifications to registered patients in the Clinic EZ Patient App when their ticket is summoned to the doctor&apos;s room or approaching their turn in line.
                </ThemedText>
              </View>
              <ToggleSwitch
                value={enablePush}
                onValueChange={handleTogglePush}
                accessibilityLabel="Toggle Patient App Push Notifications"
              />
            </View>

            {/* Configurable Threshold Stepper & Controls */}
            <View
              style={[
                styles.thresholdCard,
                { opacity: enablePush ? 1.0 : 0.4 },
              ]}
              pointerEvents={enablePush ? 'auto' : 'none'}
            >
              <View style={styles.thresholdHeader}>
                <View style={styles.iconWrap}>
                  <Icon name="ticket" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
                </View>
                <View style={styles.thresholdInfo}>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    Approaching Turn Alert Threshold
                  </ThemedText>
                  <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.thresholdSubtitle}>
                    Configure how many patients ahead trigger the &quot;approaching turn&quot; mobile push alert (1 to 5 patients).
                  </ThemedText>
                </View>
              </View>

              {/* Stepper Controls Row */}
              <View style={styles.stepperContainer}>
                <View style={styles.stepperGroup}>
                  <Pressable
                    onPress={handleDecrement}
                    disabled={!enablePush || threshold <= 1 || saving}
                    style={({ pressed }) => [
                      styles.stepperButton,
                      (!enablePush || threshold <= 1) && styles.stepperButtonDisabled,
                      pressed && styles.stepperButtonPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Decrease Threshold"
                  >
                    <ThemedText
                      variant="bodyBold"
                      color={!enablePush || threshold <= 1 ? theme.colors.textMuted : theme.colors.text}
                    >
                      -
                    </ThemedText>
                  </Pressable>

                  <View style={styles.stepperValueBadge}>
                    <ThemedText variant="bodyBold" color={theme.colors.primaryDark}>
                      {threshold} {threshold === 1 ? 'patient' : 'patients'}
                    </ThemedText>
                  </View>

                  <Pressable
                    onPress={handleIncrement}
                    disabled={!enablePush || threshold >= 5 || saving}
                    style={({ pressed }) => [
                      styles.stepperButton,
                      (!enablePush || threshold >= 5) && styles.stepperButtonDisabled,
                      pressed && styles.stepperButtonPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Increase Threshold"
                  >
                    <ThemedText
                      variant="bodyBold"
                      color={!enablePush || threshold >= 5 ? theme.colors.textMuted : theme.colors.text}
                    >
                      +
                    </ThemedText>
                  </Pressable>
                </View>

                {/* Quick Selection Chips (1 to 5) */}
                <View style={styles.chipRow}>
                  {THRESHOLD_OPTIONS.map((val) => {
                    const isSelected = threshold === val;
                    return (
                      <Pressable
                        key={val}
                        onPress={() => handleSelectThreshold(val)}
                        disabled={!enablePush || saving}
                        style={({ pressed }) => [
                          styles.chip,
                          isSelected && styles.chipSelected,
                          pressed && styles.chipPressed,
                        ]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`Set threshold to ${val} patient${val > 1 ? 's' : ''}`}
                      >
                        <ThemedText
                          variant="captionBold"
                          color={isSelected ? theme.colors.onPrimary : theme.colors.text}
                        >
                          {val}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Dynamic Helper Text */}
              <View style={styles.helperBox}>
                <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                  {helperText}
                </ThemedText>
              </View>

              {/* Save / Apply Button */}
              <View style={styles.actionRow}>
                <Button
                  title="Save Notification Settings"
                  variant="primary"
                  icon="check"
                  onPress={handleSaveSettings}
                  loading={saving}
                  disabled={!enablePush || saving || !isDirty}
                />
              </View>
            </View>
          </View>
        )}
      </CardContent>
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
  thresholdCard: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  thresholdHeader: {
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
  thresholdInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  thresholdSubtitle: {
    lineHeight: theme.spacing.md,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  stepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  stepperButton: {
    width: theme.sizes.controlSm,
    height: theme.sizes.controlSm,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: {
    opacity: 0.5,
    backgroundColor: theme.colors.surfaceMuted,
  },
  stepperButtonPressed: {
    backgroundColor: theme.colors.primaryLight,
  },
  stepperValueBadge: {
    minWidth: theme.sizes.headerHeight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  chip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    minWidth: theme.sizes.controlSm,
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
  },
});
