import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { SkeletonList } from '../ui/Skeleton';
import { ToggleSwitch } from './FacilityReadinessTab';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import { clinicService, ClinicSettingsRecord } from '../../services/clinicService';

export interface AppointmentReminderSettingsCardProps {
  settings: ClinicSettingsRecord | null;
  onSettingsUpdated?: (updated: ClinicSettingsRecord) => void;
  showSkeletons?: boolean;
}

export default function AppointmentReminderSettingsCard({
  settings,
  onSettingsUpdated,
  showSkeletons = false,
}: AppointmentReminderSettingsCardProps) {
  const [enableAppointmentReminders, setEnableAppointmentReminders] = useState<boolean>(
    settings?.enableAppointmentReminders ?? true
  );
  const [appointmentReminder24hEnabled, setAppointmentReminder24hEnabled] = useState<boolean>(
    settings?.appointmentReminder24hEnabled ?? true
  );
  const [appointmentReminder2hEnabled, setAppointmentReminder2hEnabled] = useState<boolean>(
    settings?.appointmentReminder2hEnabled ?? true
  );
  const [enableStaffAppointmentNotifications, setEnableStaffAppointmentNotifications] = useState<boolean>(
    settings?.enableStaffAppointmentNotifications ?? true
  );
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (settings) {
      setEnableAppointmentReminders(settings.enableAppointmentReminders ?? true);
      setAppointmentReminder24hEnabled(settings.appointmentReminder24hEnabled ?? true);
      setAppointmentReminder2hEnabled(settings.appointmentReminder2hEnabled ?? true);
      setEnableStaffAppointmentNotifications(settings.enableStaffAppointmentNotifications ?? true);
    }
  }, [settings]);

  const isDirty = useMemo(() => {
    const origMaster = settings?.enableAppointmentReminders ?? true;
    const orig24h = settings?.appointmentReminder24hEnabled ?? true;
    const orig2h = settings?.appointmentReminder2hEnabled ?? true;
    const origStaff = settings?.enableStaffAppointmentNotifications ?? true;

    return (
      enableAppointmentReminders !== origMaster ||
      appointmentReminder24hEnabled !== orig24h ||
      appointmentReminder2hEnabled !== orig2h ||
      enableStaffAppointmentNotifications !== origStaff
    );
  }, [
    settings,
    enableAppointmentReminders,
    appointmentReminder24hEnabled,
    appointmentReminder2hEnabled,
    enableStaffAppointmentNotifications,
  ]);

  const handleSaveSettings = useCallback(async () => {
    setSaving(true);
    try {
      const [updated, err] = await clinicService.updateSettings({
        enableAppointmentReminders,
        appointmentReminder24hEnabled,
        appointmentReminder2hEnabled,
        enableStaffAppointmentNotifications,
      });

      if (err || !updated) {
        notify.error(err?.message || 'Could not save appointment reminder settings.');
        return;
      }

      notify.success('Appointment reminder preferences updated successfully.');
      onSettingsUpdated?.(updated);
    } catch {
      notify.error('Failed to save appointment reminder preferences.');
    } finally {
      setSaving(false);
    }
  }, [
    enableAppointmentReminders,
    appointmentReminder24hEnabled,
    appointmentReminder2hEnabled,
    enableStaffAppointmentNotifications,
    onSettingsUpdated,
  ]);

  return (
    <Card
      data-testid="appointment-reminder-settings-card"
      testID="appointment-reminder-settings-card"
    >
      <CardHeader
        title="Appointment Push Reminders & Alerts"
        subtitle="Configure automated scheduled 24h/2h patient advance reminders and staff calendar notifications"
        rightAction={
          <Badge
            label={enableAppointmentReminders ? 'Reminders Active' : 'Reminders Disabled'}
            variant={enableAppointmentReminders ? 'success' : 'neutral'}
          />
        }
      />
      <CardContent>
        {showSkeletons ? (
          <SkeletonList rows={4} />
        ) : (
          <View style={styles.container}>
            {/* Master Toggle */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <View style={styles.titleWithIcon}>
                  <Icon name="bell" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    Appointment Push Reminders & Alerts
                  </ThemedText>
                </View>
                <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.toggleSubtitle}>
                  Enable automated background reminder scanning and mobile push notifications for scheduled appointments.
                </ThemedText>
              </View>
              <View data-testid="switch-master-reminders" testID="switch-master-reminders">
                <ToggleSwitch
                  value={enableAppointmentReminders}
                  onValueChange={setEnableAppointmentReminders}
                  accessibilityLabel="Toggle Automated Appointment Reminders"
                />
              </View>
            </View>

            {/* Advance Patient Reminders Sub-Group */}
            <View
              style={[
                styles.subGroup,
                !enableAppointmentReminders && styles.subGroupDisabled,
              ]}
              pointerEvents={enableAppointmentReminders ? 'auto' : 'none'}
            >
              <View style={styles.subGroupHeader}>
                <View style={styles.iconWrap}>
                  <Icon name="calendar" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
                </View>
                <View style={styles.subGroupInfo}>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    Patient Advance Push Reminders
                  </ThemedText>
                  <ThemedText variant="small" color={theme.colors.textSecondary}>
                    Granular automated alerts dispatched in advance of upcoming clinic visits.
                  </ThemedText>
                </View>
              </View>

              {/* 24-Hour Advance Reminder */}
              <View style={styles.subToggleRow}>
                <View style={styles.toggleInfo}>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    24-Hour Advance Push Reminder
                  </ThemedText>
                  <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.toggleSubtitle}>
                    Notify patients 24 hours prior to their scheduled appointment slot with visit details.
                  </ThemedText>
                </View>
                <View data-testid="switch-reminder-24h" testID="switch-reminder-24h">
                  <ToggleSwitch
                    value={appointmentReminder24hEnabled}
                    onValueChange={setAppointmentReminder24hEnabled}
                    disabled={!enableAppointmentReminders}
                    accessibilityLabel="Toggle 24-Hour Advance Push Reminder"
                  />
                </View>
              </View>

              {/* 2-Hour Advance Reminder */}
              <View style={styles.subToggleRow}>
                <View style={styles.toggleInfo}>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    2-Hour Advance Push Reminder
                  </ThemedText>
                  <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.toggleSubtitle}>
                    Deliver an urgent same-day reminder alert 2 hours before the appointment time.
                  </ThemedText>
                </View>
                <View data-testid="switch-reminder-2h" testID="switch-reminder-2h">
                  <ToggleSwitch
                    value={appointmentReminder2hEnabled}
                    onValueChange={setAppointmentReminder2hEnabled}
                    disabled={!enableAppointmentReminders}
                    accessibilityLabel="Toggle 2-Hour Advance Push Reminder"
                  />
                </View>
              </View>
            </View>

            {/* Doctor & Staff Calendar Notifications */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <View style={styles.titleWithIcon}>
                  <Icon name="calendar" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    Doctor / Staff Calendar Notifications
                  </ThemedText>
                </View>
                <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.toggleSubtitle}>
                  Deliver in-clinic notification center alerts to attending physicians upon booking, rescheduling, or cancellation.
                </ThemedText>
              </View>
              <View data-testid="switch-staff-notifications" testID="switch-staff-notifications">
                <ToggleSwitch
                  value={enableStaffAppointmentNotifications}
                  onValueChange={setEnableStaffAppointmentNotifications}
                  accessibilityLabel="Toggle Doctor / Staff Calendar Notifications"
                />
              </View>
            </View>

            {/* Save Button */}
            <View style={styles.saveRow}>
              <Button
                data-testid="btn-save-reminder-settings"
                testID="btn-save-reminder-settings"
                title={saving ? 'Saving Preferences...' : 'Save Reminder Preferences'}
                variant="primary"
                onPress={handleSaveSettings}
                disabled={!isDirty || saving}
                loading={saving}
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
    gap: theme.spacing.lg,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  toggleInfo: {
    flex: 1,
    gap: 4,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  toggleSubtitle: {
    lineHeight: 18,
  },
  subGroup: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    marginLeft: theme.spacing.sm,
  },
  subGroupDisabled: {
    opacity: 0.4,
  },
  subGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  iconWrap: {
    width: theme.sizes.controlSm,
    height: theme.sizes.controlSm,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subGroupInfo: {
    flex: 1,
    gap: 2,
  },
  subToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  saveRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: theme.spacing.xs,
  },
});
