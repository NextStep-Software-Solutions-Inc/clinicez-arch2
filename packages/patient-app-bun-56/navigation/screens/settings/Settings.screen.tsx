import { useState } from 'react';
import { ScrollView, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Updates from 'expo-updates';
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

  // OTA updates
  const { isChecking, isDownloading, isUpdateAvailable, isUpdatePending } = Updates.useUpdates();

  const handleCheckForUpdates = async () => {
    try {
      await Updates.checkForUpdateAsync();
    } catch (e) {
      Alert.alert('Update Check Failed', 'Unable to check for updates. Please try again later.');
    }
  };

  const handleInstallUpdate = async () => {
    try {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch (e) {
      Alert.alert('Update Failed', 'Unable to download the update. Please try again later.');
    }
  };

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

      {/* App Updates — hidden in dev builds (expo-updates does not operate there) */}
      {!__DEV__ && (
        <SettingsSection title="App Updates">
          <SettingsRow
            title="Check for Updates"
            subtitle={isUpdateAvailable ? 'Update available' : 'Up to date'}
            icon={{ android: 'system_update', ios: 'arrow.down.circle.fill' }}
            iconColor="#3B82F6"
            right={isChecking ? { type: 'loading' } : { type: 'none' }}
            disabled={isChecking || isDownloading}
            onPress={handleCheckForUpdates}
          />
          {isUpdateAvailable && (
            <SettingsRow
              title="Install Update"
              subtitle="Tap to download and restart"
              icon={{ android: 'download', ios: 'arrow.down.app.fill' }}
              iconColor="#10B981"
              right={isDownloading ? { type: 'loading' } : { type: 'none' }}
              disabled={isDownloading}
              onPress={handleInstallUpdate}
            />
          )}
          {isUpdatePending && (
            <SettingsRow
              title="Restart to Apply"
              subtitle="An update has been downloaded"
              icon={{ android: 'restart_alt', ios: 'arrow.clockwise.circle.fill' }}
              iconColor="#F59E0B"
              right={{ type: 'none' }}
              onPress={() => Updates.reloadAsync()}
            />
          )}
        </SettingsSection>
      )}

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
