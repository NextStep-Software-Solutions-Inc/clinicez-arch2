import React, { useState, useEffect } from 'react';
import { ScrollView } from 'react-native';
import { storage as SecureStore } from '../../../utils/storage';
import { useOnboarding } from '../../../contexts/OnboardingContext';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { SettingsRow, SettingsSection } from '@ui/SettingsItem';
import { useAuth } from '../../../contexts/AuthContext';
import { seedDemoHealthRecords, clearAllData } from '@db/seedDemoData';
import { seedCatalog } from '../../../services/discovery/discoveryService';
import { seedMockNotifications } from '../../../services/notifications/notificationService';
import { safeAwait } from '@shared/safe';
import { dialog } from '@utils/dialog';

// Only show this screen in development builds
if (!__DEV__) {
  console.warn('DebugSettingsScreen should not be accessible in production.');
}

const SECURE_KEYS = [
  'onboarding_complete',
  'has_pin',
  'app_pin',
  'biometrics_enabled',
  'lock_timeout',
  'theme_preference',
] as const;

export default function DebugSettingsScreen() {
  const { colors, spacing, sizes } = useAppTheme();
  const { isComplete, complete, reset } = useOnboarding();
  const [storeValues, setStoreValues] = useState<Record<string, string | null>>({});
  const { userId, internalPatientId } = useAuth();

  const [isSeedingHealth, setIsSeedingHealth] = useState(false);
  const [isSeedingCatalog, setIsSeedingCatalog] = useState(false);
  const [isSeedingNotifications, setIsSeedingNotifications] = useState(false);
  const [isClearingData, setIsClearingData] = useState(false);
  const [forceYakap, setForceYakap] = useState(false);

  const refreshStoreValues = async () => {
    const entries = await Promise.all(
      SECURE_KEYS.map(async (key) => {
        const val = await SecureStore.getItemAsync(key);
        return [key, val] as const;
      }),
    );
    setStoreValues(Object.fromEntries(entries));
    const yakapVal = await SecureStore.getItemAsync('debug_force_yakap_registered');
    setForceYakap(yakapVal === 'true');
  };

  useEffect(() => {
    if (!__DEV__) return;
    refreshStoreValues();
  }, []);

  if (!__DEV__) {
    return null;
  }

  const handleOnboardingToggle = async (value: boolean) => {
    if (!value) {
      dialog.alert(
        'Reset Onboarding',
        'This will clear the onboarding flag. The app will restart the welcome flow immediately.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reset',
            style: 'destructive',
            onPress: async () => {
              await reset();
              await refreshStoreValues();
            },
          },
        ],
      );
    } else {
      await complete();
      await refreshStoreValues();
    }
  };

  const handleForceYakapToggle = async (value: boolean) => {
    setForceYakap(value);
    await SecureStore.setItemAsync('debug_force_yakap_registered', value ? 'true' : 'false');
  };

  const handleSeedDemoHealthRecords = async () => {
    if (!internalPatientId || !userId) {
      dialog.alert('Error', 'Verification pending or user not authenticated.');
      return;
    }
    setIsSeedingHealth(true);
    const [, error] = await safeAwait(seedDemoHealthRecords(internalPatientId, userId));
    setIsSeedingHealth(false);
    if (error) {
      console.error(error);
      dialog.alert('Error', error instanceof Error ? error.message : 'Failed to seed records.');
    } else {
      dialog.alert('Success', 'Demo health records seeded successfully.');
    }
  };

  const handleSeedCatalog = async () => {
    setIsSeedingCatalog(true);
    const [, error] = await safeAwait(seedCatalog());
    setIsSeedingCatalog(false);
    if (error) {
      console.error(error);
      dialog.alert('Error', error instanceof Error ? error.message : 'Failed to seed catalog.');
    } else {
      dialog.alert('Success', 'Discovery catalog seeded successfully.');
    }
  };

  const handleSeedMockNotifications = async () => {
    if (!userId) {
      dialog.alert('Error', 'No authenticated user ID found.');
      return;
    }
    setIsSeedingNotifications(true);
    const [, error] = await safeAwait(seedMockNotifications(userId));
    setIsSeedingNotifications(false);
    if (error) {
      console.error(error);
      dialog.alert('Error', error instanceof Error ? error.message : 'Failed to seed notifications.');
    } else {
      dialog.alert('Success', 'Mock notifications seeded successfully.');
    }
  };

  const handleClearAllData = () => {
    dialog.alert(
      'Reset Database',
      'Are you sure you want to delete all local database records? This action is permanent and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: async () => {
            setIsClearingData(true);
            const [, error] = await safeAwait(
              clearAllData(internalPatientId || undefined, userId || undefined),
            );
            setIsClearingData(false);
            if (error) {
              console.error(error);
              dialog.alert('Error', error instanceof Error ? error.message : 'Failed to reset database.');
            }
            dialog.alert('Success', 'Local database has been cleared completely.');
            await refreshStoreValues();
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        padding: spacing.lg,
        maxWidth: sizes.formMaxWidth,
        alignSelf: 'center',
        width: '100%',
      }}
    >
      <SettingsSection
        title="Onboarding"
        footer="Toggle off to reset onboarding. The app will immediately navigate to the Welcome screen."
      >
        <SettingsRow
          title="Onboarding Complete"
          subtitle="Toggle OFF to test the onboarding flow"
          icon={{ android: 'rocket_launch', ios: 'star.fill' }}
          iconColor={colors.warning}
          right={{
            type: 'switch',
            value: isComplete,
            onValueChange: handleOnboardingToggle,
          }}
        />
      </SettingsSection>

      <SettingsSection
        title="PhilHealth YAKAP Benefit Preview"
        footer="Toggle to test between the Promotional Card (unverified) and the Active Benefit Tracker (100% confirmed registered)."
      >
        <SettingsRow
          title="Simulate 100% Confirmed YAKAP"
          subtitle="Displays assigned clinic and ₱20,000 medicine allowance on Home"
          icon={{ android: 'shield', ios: 'checkmark.shield.fill' }}
          iconColor={colors.primary}
          right={{
            type: 'switch',
            value: forceYakap,
            onValueChange: handleForceYakapToggle,
          }}
        />
      </SettingsSection>

      <SettingsSection
        title="Demo & Mock Data Seeding"
        footer="Manually seed discovery catalog (organizations/clinics), patient records, or mock notifications."
      >
        <SettingsRow
          title="Seed Catalog Data"
          subtitle="Populates organizations, clinics, and provider lists"
          icon={{ android: 'corporate_fare', ios: 'building.2.fill' }}
          iconColor={colors.purple}
          right={{ type: isSeedingCatalog ? 'loading' : 'none' }}
          disabled={isSeedingCatalog || isSeedingHealth || isSeedingNotifications || isClearingData}
          onPress={handleSeedCatalog}
        />
        <SettingsRow
          title="Seed Demo Health Records"
          subtitle="Populates health history, vitals, consultations"
          icon={{ android: 'database', ios: 'doc.plaintext.fill' }}
          iconColor={colors.success}
          right={{ type: isSeedingHealth ? 'loading' : 'none' }}
          disabled={isSeedingCatalog || isSeedingHealth || isSeedingNotifications || isClearingData}
          onPress={handleSeedDemoHealthRecords}
        />
        <SettingsRow
          title="Seed Mock Notifications"
          subtitle="Populates local mock reminders/updates"
          icon={{ android: 'notifications', ios: 'bell.fill' }}
          iconColor={colors.primary}
          right={{ type: isSeedingNotifications ? 'loading' : 'none' }}
          disabled={isSeedingCatalog || isSeedingHealth || isSeedingNotifications || isClearingData}
          onPress={handleSeedMockNotifications}
        />
      </SettingsSection>

      <SettingsSection
        title="Database Reset"
        footer="Reverts the local SQLite database to a completely blank state by clearing all tables. This cannot be undone."
      >
        <SettingsRow
          title="Clear All Local Data"
          subtitle="Delete all patient profiles, clinics, and settings"
          icon={{ android: 'delete_forever', ios: 'trash.fill' }}
          iconColor={colors.emergency}
          destructive={true}
          right={{ type: isClearingData ? 'loading' : 'none' }}
          disabled={isSeedingCatalog || isSeedingHealth || isSeedingNotifications || isClearingData}
          onPress={handleClearAllData}
        />
      </SettingsSection>

      <SettingsSection
        title="SecureStore State"
        footer="Read-only snapshot of current SecureStore values. Tap refresh to reload."
      >
        <SettingsRow
          title="Refresh"
          icon={{ android: 'refresh', ios: 'arrow.clockwise' }}
          iconColor={colors.primary}
          right={{ type: 'none' }}
          onPress={refreshStoreValues}
        />
        {SECURE_KEYS.map((key) => (
          <SettingsRow
            key={key}
            title={key}
            right={{
              type: 'value',
              label: storeValues[key] === null ? '(null)' : (storeValues[key] ?? '…'),
            }}
          />
        ))}
      </SettingsSection>
    </ScrollView>
  );
}
