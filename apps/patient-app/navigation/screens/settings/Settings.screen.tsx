import React, { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Updates from 'expo-updates';
import { useUser } from '@clerk/expo';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useAppearance } from '../../../contexts/AppearanceContext';
import { SettingsRow, SettingsSection } from '@ui/SettingsItem';
import PinModal from '@ui/PinModal';
import ProfileCard from '../../../components/ProfileCard';
import { dialog } from '@utils/dialog';

const THEME_LABELS: Record<string, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { colors, spacing } = useAppTheme();
  const { user, isLoaded: isUserLoaded } = useUser();
  const { logout, hasPIN } = useAuth();
  const { themePreference } = useAppearance();
  const [changePwdPinVisible, setChangePwdPinVisible] = useState(false);

  const isPasswordEnabled = isUserLoaded ? user?.passwordEnabled !== false : true;

  // OTA updates (native only)
  const { isChecking, isDownloading, isUpdateAvailable, isUpdatePending } = Updates.useUpdates();

  const handleCheckForUpdates = async () => {
    try {
      await Updates.checkForUpdateAsync();
    } catch {
      dialog.alert('Update Check Failed', 'Unable to check for updates. Please try again later.');
    }
  };

  const handleInstallUpdate = async () => {
    try {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch {
      dialog.alert('Update Failed', 'Unable to download the update. Please try again later.');
    }
  };

  const handleLogout = () => {
    dialog.alert('Sign Out', 'Are you sure you want to sign out?', [
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
      navigation.navigate('Main', { screen: 'ChangePasswordScreen' });
    }
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.container, { padding: spacing.lg }]}
    >
      <ProfileCard />

      {/* Account */}
      <SettingsSection title="Account">
        <SettingsRow
          title="My devices"
          subtitle="Manage where you're signed in"
          icon={{ android: 'devices', ios: 'iphone' }}
          iconColor={colors.primary}
          right={{ type: 'chevron' }}
          onPress={() => navigation.navigate('Main', { screen: 'MyDevicesScreen' })}
        />
        <SettingsRow
          title="Sign Out"
          icon={{ android: 'logout', ios: 'rectangle.portrait.and.arrow.right' }}
          iconColor={colors.emergency}
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
          iconColor={colors.success}
          right={{ type: 'chevron' }}
          onPress={() => navigation.navigate('Main', { screen: 'SecuritySettingsScreen' })}
        />
        {hasPIN && (
          <SettingsRow
            title="Change PIN"
            icon={{ android: 'password', ios: 'key.fill' }}
            iconColor={colors.purple}
            right={{ type: 'chevron' }}
            onPress={() => navigation.navigate('Main', { screen: 'ChangePINScreen' })}
          />
        )}
        <SettingsRow
          title={isPasswordEnabled ? 'Change Password' : 'Set Password'}
          subtitle={isPasswordEnabled ? 'Update your account password' : 'Add a password to your account'}
          icon={{ android: 'manage_accounts', ios: 'lock.rotation' }}
          iconColor={colors.urgent}
          right={{ type: 'chevron' }}
          onPress={handleChangePasswordPress}
        />
        <SettingsRow
          title="Privacy & Communications"
          subtitle="Privacy blur & hidden messages"
          icon={{ android: 'visibility', ios: 'eye.fill' }}
          iconColor={colors.primary}
          right={{ type: 'chevron' }}
          onPress={() => navigation.navigate('Main', { screen: 'PrivacySettingsScreen' })}
        />
      </SettingsSection>

      {/* Appearance */}
      <SettingsSection title="Appearance">
        <SettingsRow
          title="Theme"
          subtitle={THEME_LABELS[themePreference]}
          icon={{ android: 'palette', ios: 'paintpalette.fill' }}
          iconColor={colors.warning}
          right={{ type: 'chevron' }}
          onPress={() => navigation.navigate('Main', { screen: 'AppearanceSettingsScreen' })}
        />
      </SettingsSection>

      {/* Notifications */}
      <SettingsSection title="Notifications">
        <SettingsRow
          title="Notifications"
          subtitle="Coming soon"
          icon={{ android: 'notifications', ios: 'bell.fill' }}
          iconColor={colors.primary}
          right={{ type: 'chevron' }}
          onPress={() => navigation.navigate('Main', { screen: 'NotificationsSettingsScreen' })}
        />
      </SettingsSection>

      {/* App Updates — hidden in dev builds (expo-updates does not operate there) */}
      {!__DEV__ && (
        <SettingsSection title="App Updates">
          <SettingsRow
            title="Check for Updates"
            subtitle={isUpdateAvailable ? 'Update available' : 'Up to date'}
            icon={{ android: 'system_update', ios: 'arrow.down.circle.fill' }}
            iconColor={colors.primary}
            right={isChecking ? { type: 'loading' } : { type: 'none' }}
            disabled={isChecking || isDownloading}
            onPress={handleCheckForUpdates}
          />
          {isUpdateAvailable && (
            <SettingsRow
              title="Install Update"
              subtitle="Tap to download and restart"
              icon={{ android: 'download', ios: 'arrow.down.app.fill' }}
              iconColor={colors.success}
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
              iconColor={colors.warning}
              right={{ type: 'none' }}
              onPress={() => Updates.reloadAsync()}
            />
          )}
        </SettingsSection>
      )}

      {/* About */}
      <SettingsSection title="About">
        <SettingsRow
          title="About Clinic EZ"
          icon={{ android: 'info', ios: 'info.circle.fill' }}
          iconColor={colors.textMuted}
          right={{ type: 'chevron' }}
          onPress={() => navigation.navigate('Main', { screen: 'AboutSettingsScreen' })}
        />
      </SettingsSection>

      {/* Debug (dev only) */}
      {__DEV__ && (
        <SettingsSection title="Debug" footer="This section is only visible in development builds.">
          <SettingsRow
            title="Developer Tools"
            icon={{ android: 'code', ios: 'hammer.fill' }}
            iconColor={colors.purple}
            right={{ type: 'chevron' }}
            onPress={() => navigation.navigate('Main', { screen: 'DebugSettingsScreen' })}
          />
        </SettingsSection>
      )}

      <PinModal
        visible={changePwdPinVisible}
        title="Confirm PIN"
        subtitle={
          isPasswordEnabled
            ? 'Enter your PIN before changing your password.'
            : 'Enter your PIN before setting your password.'
        }
        onSuccess={() => {
          setChangePwdPinVisible(false);
          navigation.navigate('Main', { screen: 'ChangePasswordScreen' });
        }}
        onDismiss={() => setChangePwdPinVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {},
});
