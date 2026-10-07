import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
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
  seedMockNotifications,
} from '../../../services/notifications/notificationService';
import type { NotificationCategory } from '@db/schema/notifications';
import { dialog } from '@utils/dialog';

export default function NotificationsSettingsScreenWeb() {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const patientId = usePatientId();
  const { refreshNotifications } = useNotificationContext();

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

  const handleInAppToggle = async (category: NotificationCategory, value: boolean) => {
    const current = prefs.find((p) => p.category === category);
    const push = current?.pushEnabled ?? false;
    await setPreference(patientId, category, push, value);
    setPrefs((prev) =>
      prev.map((p) => (p.category === category ? { ...p, inAppEnabled: value } : p)),
    );
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

  const getPref = (category: NotificationCategory): NotificationPreference => {
    return (
      prefs.find((p) => p.category === category) ?? {
        id: '',
        patientId,
        category,
        pushEnabled: false,
        inAppEnabled: true,
        updatedAt: new Date(),
      }
    );
  };

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        {
          padding: spacing.xl,
          maxWidth: sizes.formMaxWidth,
          alignSelf: 'center',
          width: '100%',
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Web Notification Banner */}
      <View
        style={[
          styles.infoBanner,
          {
            backgroundColor: colors.primaryLight,
            borderColor: colors.primaryBorder,
            borderRadius: radii.md,
            padding: spacing.lg,
            marginBottom: spacing.xl,
          },
        ]}
      >
        <ThemedText variant="bodyBold" color="primaryText">
          In-App Notifications Active
        </ThemedText>
        <ThemedText variant="small" color="textSecondary" style={{ marginTop: spacing.xs, lineHeight: 20 }}>
          Notifications appear in your in-app feed and activity center. Browser push notifications
          are managed separately by your browser settings.
        </ThemedText>
      </View>

      {/* In-App Notifications Categories */}
      <SettingsSection
        title="Notification Categories"
        footer="Customize which types of health updates and alerts appear in your feed."
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
      <SettingsSection title="Feed Management">
        <SettingsRow
          title="Clear All Notifications"
          subtitle="Remove all notifications from your in-app feed"
          icon={{ android: 'delete_sweep', ios: 'trash.fill' }}
          iconColor={colors.emergency}
          right={{ type: 'none' }}
          onPress={handleClearAll}
          destructive
        />
        {__DEV__ && (
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
        )}
      </SettingsSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {},
  infoBanner: {
    borderWidth: 1,
  },
});
