import { useState } from 'react';
import { ScrollView, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from 'contexts/AuthContext';
import { useAppearance } from 'contexts/AppearanceContext';
import { SettingsRow, SettingsSection } from '@ui/SettingsItem';
import PinModal from '@ui/PinModal';
import ProfileCard from 'components/ProfileCard';

const THEME_LABELS: Record<string, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { logout, hasPIN } = useAuth();
  const { themePreference } = useAppearance();
  const [changePwdPinVisible, setChangePwdPinVisible] = useState(false);

  const navigate = (screen: string) => navigation.navigate(screen as never);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  const handleChangePasswordPress = () => {
    if (hasPIN) {
      setChangePwdPinVisible(true);
    } else {
      navigate('ChangePasswordScreen');
    }
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.container}
    >
      <ProfileCard />

      {/* Account */}
      <SettingsSection title="Account">
        <SettingsRow
          title="Sign Out"
          icon={{ android: 'logout', ios: 'rectangle.portrait.and.arrow.right' }}
          iconColor="#EF4444"
          right={{ type: 'none' }}
          onPress={handleLogout}
          destructive
        />
      </SettingsSection>

      {/* Security */}
      <SettingsSection title="Security">
        <SettingsRow
          title="Security"
          subtitle={hasPIN ? 'PIN & biometrics' : 'No PIN set'}
          icon={{ android: 'security', ios: 'lock.shield.fill' }}
          iconColor="#10B981"
          right={{ type: 'chevron' }}
          onPress={() => navigate('SecuritySettingsScreen')}
        />
        {hasPIN && (
          <SettingsRow
            title="Change PIN"
            icon={{ android: 'password', ios: 'key.fill' }}
            iconColor="#8B5CF6"
            right={{ type: 'chevron' }}
            onPress={() => navigate('ChangePINScreen')}
          />
        )}
        <SettingsRow
          title="Change Password"
          icon={{ android: 'manage_accounts', ios: 'lock.rotation' }}
          iconColor="#F97316"
          right={{ type: 'chevron' }}
          onPress={handleChangePasswordPress}
        />
      </SettingsSection>

      {/* Appearance */}
      <SettingsSection title="Appearance">
        <SettingsRow
          title="Theme"
          subtitle={THEME_LABELS[themePreference]}
          icon={{ android: 'palette', ios: 'paintpalette.fill' }}
          iconColor="#F59E0B"
          right={{ type: 'chevron' }}
          onPress={() => navigate('AppearanceSettingsScreen')}
        />
      </SettingsSection>

      {/* Notifications */}
      <SettingsSection title="Notifications">
        <SettingsRow
          title="Notifications"
          subtitle="Coming soon"
          icon={{ android: 'notifications', ios: 'bell.fill' }}
          iconColor="#3B82F6"
          right={{ type: 'chevron' }}
          onPress={() => navigate('NotificationsSettingsScreen')}
        />
      </SettingsSection>

      {/* About */}
      <SettingsSection title="About">
        <SettingsRow
          title="About ClinicEZ"
          icon={{ android: 'info', ios: 'info.circle.fill' }}
          iconColor="#6B7280"
          right={{ type: 'chevron' }}
          onPress={() => navigate('AboutSettingsScreen')}
        />
      </SettingsSection>

      {/* Debug (dev only) */}
      {__DEV__ && (
        <SettingsSection title="Debug" footer="This section is only visible in development builds.">
          <SettingsRow
            title="Developer Tools"
            icon={{ android: 'code', ios: 'hammer.fill' }}
            iconColor="#EC4899"
            right={{ type: 'chevron' }}
            onPress={() => navigate('DebugSettingsScreen')}
          />
        </SettingsSection>
      )}

      <PinModal
        visible={changePwdPinVisible}
        title="Confirm PIN"
        subtitle="Enter your PIN before changing your password."
        onSuccess={() => {
          setChangePwdPinVisible(false);
          navigate('ChangePasswordScreen');
        }}
        onDismiss={() => setChangePwdPinVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
});
