import React from 'react';
import { ScrollView } from 'react-native';
import { useAppearance, ThemePreference } from '../../../contexts/AppearanceContext';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { SettingsRow, SettingsSection } from '@ui/SettingsItem';

const THEME_OPTIONS: Array<{ label: string; value: ThemePreference; subtitle: string }> = [
  { label: 'System Default', value: 'system', subtitle: 'Follows your device settings' },
  { label: 'Light', value: 'light', subtitle: 'Always use light appearance' },
  { label: 'Dark', value: 'dark', subtitle: 'Always use dark appearance' },
];

export default function AppearanceSettingsScreen() {
  const { themePreference, setThemePreference } = useAppearance();
  const { spacing, sizes } = useAppTheme();

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
        title="Theme"
        footer="Choose how the app looks. 'System Default' automatically switches between light and dark based on your device settings."
      >
        {THEME_OPTIONS.map((option) => (
          <SettingsRow
            key={option.value}
            title={option.label}
            subtitle={option.subtitle}
            right={
              themePreference === option.value
                ? { type: 'value', label: 'Active' }
                : { type: 'none' }
            }
            onPress={() => setThemePreference(option.value)}
          />
        ))}
      </SettingsSection>
    </ScrollView>
  );
}
