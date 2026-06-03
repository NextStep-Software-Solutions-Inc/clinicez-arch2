import { ScrollView, Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useState, useEffect } from 'react';
import { useOnboarding } from 'contexts/OnboardingContext';
import { SettingsRow, SettingsSection } from '@ui/SettingsItem';

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
  const { isComplete, complete, reset } = useOnboarding();
  const [storeValues, setStoreValues] = useState<Record<string, string | null>>({});

  const refreshStoreValues = async () => {
    const entries = await Promise.all(
      SECURE_KEYS.map(async (key) => {
        const val = await SecureStore.getItemAsync(key);
        return [key, val] as const;
      }),
    );
    setStoreValues(Object.fromEntries(entries));
  };

  useEffect(() => {
    refreshStoreValues();
  }, []);

  const handleOnboardingToggle = async (value: boolean) => {
    if (!value) {
      Alert.alert(
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

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, gap: 0 }}
    >
      <SettingsSection
        title="Onboarding"
        footer="Toggle off to reset onboarding. The app will immediately navigate to the Welcome screen."
      >
        <SettingsRow
          title="Onboarding Complete"
          subtitle="Toggle OFF to test the onboarding flow"
          icon={{ android: 'rocket_launch', ios: 'star.fill' }}
          iconColor="#F59E0B"
          right={{
            type: 'switch',
            value: isComplete,
            onValueChange: handleOnboardingToggle,
          }}
        />
      </SettingsSection>

      <SettingsSection
        title="SecureStore State"
        footer="Read-only snapshot of current SecureStore values. Tap refresh to reload."
      >
        <SettingsRow
          title="Refresh"
          icon={{ android: 'refresh', ios: 'arrow.clockwise' }}
          iconColor="#3B82F6"
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
