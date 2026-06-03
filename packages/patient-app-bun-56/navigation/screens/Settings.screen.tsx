import { ScrollView, View, StyleSheet, Alert } from 'react-native';
import { useNavigation, useTheme } from '@react-navigation/native';
import { useUser } from '@clerk/expo';
import { useAuth } from 'contexts/AuthContext';
import { useAppearance } from 'contexts/AppearanceContext';
import { SettingsRow, SettingsSection } from '@ui/SettingsItem';
import ThemedText from '@ui/ThemedText';

const THEME_LABELS: Record<string, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { logout, hasPIN } = useAuth();
  const { themePreference } = useAppearance();
  const { user } = useUser();

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

  const displayName =
    user?.fullName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    user?.emailAddresses[0]?.emailAddress ||
    'User';

  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const email = user?.emailAddresses[0]?.emailAddress ?? '';

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.container}
    >
      {/* Profile Card */}
      <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: (colors.border as string) + '40' }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <ThemedText style={styles.avatarInitials}>{initials}</ThemedText>
        </View>
        <View style={styles.profileInfo}>
          <ThemedText style={styles.profileName}>{displayName}</ThemedText>
          {email ? (
            <ThemedText style={[styles.profileEmail, { color: (colors.text as string) + '70' }]}>{email}</ThemedText>
          ) : null}
        </View>
      </View>

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 28,
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
  },
  profileEmail: {
    fontSize: 14,
    marginTop: 2,
  },
});
