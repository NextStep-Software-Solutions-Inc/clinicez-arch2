import React, { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { SettingsRow, SettingsSection } from '@ui/SettingsItem';
import ThemedText from '@ui/ThemedText';
import { useNotificationContext } from '../../../contexts/NotificationContext';
import { usePatientId } from '../../../hooks/usePatientId';
import {
  NOTIFICATION_CATEGORIES,
  getPreferences,
  setPreference,
  type NotificationPreference,
} from '../../../services/notifications/notificationPreferencesService';
import {
  clearAllNotifications,
  scheduleLocalNotification,
  seedMockNotifications,
} from '../../../services/notifications/notificationService';
import type { NotificationCategory } from '@db/schema/notifications';
import { dialog } from '@utils/dialog';

// ─── Permission Banner ─────────────────────────────────────────────────────────

function PermissionWarningBanner({ onPress }: { onPress: () => void }) {
  const { colors, spacing, radii } = useAppTheme();
  return (
    <View
      style={[
        styles.permissionWarning,
        {
          backgroundColor: colors.emergencyBg,
          borderColor: colors.emergencyBorder,
          borderRadius: radii.lg,
          padding: spacing.lg,
          marginBottom: spacing.lg,
        },
      ]}
    >
      <View style={{ flex: 1, gap: spacing.xs }}>
        <ThemedText variant="bodyBold" color="emergencyText">
          Notifications Disabled
        </ThemedText>
        <ThemedText variant="small" color="textSecondary">
          Push notifications are turned off for this app. Tap below to enable them
          in system settings.
        </ThemedText>
      </View>
      <Pressable onPress={onPress} style={{ marginTop: spacing.sm }}>
        <ThemedText variant="smallBold" color="emergency">
          Open Settings →
        </ThemedText>
      </Pressable>
    </View>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function NotificationsSettingsScreen() {
  const { colors, spacing } = useAppTheme();
  const patientId = usePatientId();
  const { permissionStatus, requestPermissions, refreshNotifications } =
    useNotificationContext();

  const [prefs, setPrefs] = useState<NotificationPreference[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadPrefs = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await getPreferences(patientId);
      setPrefs(rows);
    } finally {
      setIsLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

  const handlePushToggle = async (category: NotificationCategory, value: boolean) => {
    const current = prefs.find((p) => p.category === category);
    const inApp = current?.inAppEnabled ?? true;
    await setPreference(patientId, category, value, inApp);
    setPrefs((prev) =>
      prev.map((p) => (p.category === category ? { ...p, pushEnabled: value } : p)),
    );
  };

  const handleInAppToggle = async (category: NotificationCategory, value: boolean) => {
    const current = prefs.find((p) => p.category === category);
    const push = current?.pushEnabled ?? true;
    await setPreference(patientId, category, push, value);
    setPrefs((prev) =>
      prev.map((p) => (p.category === category ? { ...p, inAppEnabled: value } : p)),
    );
  };

  const handleOpenSystemSettings = async () => {
    if (permissionStatus === 'undetermined') {
      await requestPermissions();
    } else {
      await Linking.openSettings();
    }
  };

  const handleClearAll = () => {
    dialog.alert(
      'Clear All Notifications',
      'This will permanently remove all notifications from the feed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearAllNotifications(patientId);
            refreshNotifications();
          },
        },
      ],
    );
  };

  const handleSendTestNotification = async () => {
    await scheduleLocalNotification(
      'Test Notification',
      'This is a test notification from Clinic EZ.',
      { type: 'system', category: 'system' },
    );
  };

  const getPref = (category: NotificationCategory): NotificationPreference => {
    return (
      prefs.find((p) => p.category === category) ?? {
        id: '',
        patientId,
        category,
        pushEnabled: true,
        inAppEnabled: true,
        updatedAt: new Date(),
      }
    );
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.container, { padding: spacing.lg }]}
    >
      {/* Permission warning — only shown when denied */}
      {permissionStatus === 'denied' && (
        <PermissionWarningBanner onPress={handleOpenSystemSettings} />
      )}

      {/* Push Notifications */}
      <SettingsSection
        title="Push Notifications"
        footer={
          'Push notification delivery requires a native build. ' +
          'Expo Go does not support push tokens.'
        }
      >
        {NOTIFICATION_CATEGORIES.map((cat) => {
          const pref = getPref(cat.id);
          const disabled = permissionStatus === 'denied';
          return (
            <SettingsRow
              key={cat.id}
              title={cat.label}
              subtitle={cat.description}
              icon={{ android: cat.iconAndroid, ios: cat.iconIos }}
              iconColor={colors.primary}
              right={{
                type: 'switch',
                value: pref.pushEnabled && !disabled,
                onValueChange: (v) => handlePushToggle(cat.id, v),
                disabled: isLoading || disabled,
              }}
              disabled={isLoading || disabled}
            />
          );
        })}
      </SettingsSection>

      {/* In-App Notifications */}
      <SettingsSection
        title="In-App Notifications"
        footer="Control which notifications appear in your notification feed inside the app."
      >
        {NOTIFICATION_CATEGORIES.map((cat) => {
          const pref = getPref(cat.id);
          return (
            <SettingsRow
              key={cat.id}
              title={cat.label}
              subtitle={cat.description}
              icon={{ android: cat.iconAndroid, ios: cat.iconIos }}
              iconColor={colors.primary}
              right={{
                type: 'switch',
                value: pref.inAppEnabled,
                onValueChange: (v) => handleInAppToggle(cat.id, v),
                disabled: isLoading,
              }}
              disabled={isLoading}
            />
          );
        })}
      </SettingsSection>

      {/* Advanced */}
      <SettingsSection title="Advanced">
        <SettingsRow
          title="Clear All Notifications"
          subtitle="Remove all notifications from your feed"
          icon={{ android: 'delete_sweep', ios: 'trash.fill' }}
          iconColor={colors.emergency}
          right={{ type: 'none' }}
          onPress={handleClearAll}
          destructive
        />
        {__DEV__ && (
          <>
            <SettingsRow
              title="Send Test Notification"
              subtitle="Schedules a local notification immediately"
              icon={{ android: 'science', ios: 'flask.fill' }}
              iconColor={colors.purple}
              right={{ type: 'none' }}
              onPress={handleSendTestNotification}
            />
            <SettingsRow
              title="Seed Mock Notifications"
              subtitle="Inserts 13 realistic mock notifications across all categories"
              icon={{ android: 'dataset', ios: 'tray.full.fill' }}
              iconColor={colors.info}
              right={{ type: 'none' }}
              onPress={async () => {
                await seedMockNotifications(patientId);
                refreshNotifications();
              }}
            />
          </>
        )}
      </SettingsSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {},
  permissionWarning: {
    borderWidth: 1,
  },
});
