import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
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

export default function SettingsScreenWeb() {
  const navigation = useNavigation<any>();
  const { colors, spacing, sizes } = useAppTheme();
  const { user, isLoaded: isUserLoaded } = useUser();
  const { logout, hasPIN } = useAuth();
  const { themePreference } = useAppearance();
  const [changePwdPinVisible, setChangePwdPinVisible] = useState(false);

  const isPasswordEnabled = isUserLoaded ? user?.passwordEnabled !== false : true;

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
          subtitle={hasPIN ? 'PIN protection' : 'No PIN set'}
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
          subtitle="In-app notification preferences"
          icon={{ android: 'notifications', ios: 'bell.fill' }}
          iconColor={colors.primary}
          right={{ type: 'chevron' }}
          onPress={() => navigation.navigate('Main', { screen: 'NotificationsSettingsScreen' })}
        />
      </SettingsSection>

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
