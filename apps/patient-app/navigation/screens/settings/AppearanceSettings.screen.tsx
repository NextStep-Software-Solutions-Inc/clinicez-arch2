import { ScrollView } from 'react-native';
import { useAppearance, ThemePreference } from 'contexts/AppearanceContext';
import { SettingsRow, SettingsSection } from '@ui/SettingsItem';

const THEME_OPTIONS: Array<{ label: string; value: ThemePreference; subtitle: string }> = [
  { label: 'System Default', value: 'system', subtitle: 'Follows your device settings' },
  { label: 'Light', value: 'light', subtitle: 'Always use light appearance' },
  { label: 'Dark', value: 'dark', subtitle: 'Always use dark appearance' },
];

export default function AppearanceSettingsScreen() {
  const { themePreference, setThemePreference } = useAppearance();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, gap: 0 }}
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
                ? { type: 'value', label: '✓' }
                : { type: 'none' }
            }
            onPress={() => setThemePreference(option.value)}
          />
        ))}
      </SettingsSection>
    </ScrollView>
  );
}
