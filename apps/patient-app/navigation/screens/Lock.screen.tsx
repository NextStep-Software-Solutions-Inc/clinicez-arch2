import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { useUser } from '@clerk/expo';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import { AppIcon } from '@ui/Icon';
import { Avatar } from '@ui/Primitives';
import { dialog } from '@utils/dialog';

interface LockScreenProps {
  onUnlockPress: () => void;
}

export default function LockScreen({ onUnlockPress }: LockScreenProps) {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const { user } = useUser();
  const { logout } = useAuth();

  const displayName =
    user?.fullName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    user?.emailAddresses[0]?.emailAddress ||
    'User';

  const email = user?.emailAddresses[0]?.emailAddress ?? '';

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

  return (
    <View style={[styles.page, { backgroundColor: colors.background, paddingHorizontal: spacing.xl }]}>
      <View style={[styles.container, { maxWidth: sizes.dialogWidth, gap: spacing['3xl'] }]}>
        <View style={[styles.content, { gap: spacing.md }]}>
          <AppIcon name="lock" size={sizes.iconXl * 1.5} color="primary" />
          <ThemedText variant="h1" style={{ textAlign: 'center' }}>
            App Locked
          </ThemedText>
          <ThemedText variant="body" color="textSecondary" style={{ textAlign: 'center' }}>
            Your session is protected. Unlock to continue.
          </ThemedText>
        </View>

        {/* Authenticated user identity */}
        <View style={[styles.userCard, { gap: spacing.sm }]}>
          {user?.imageUrl ? (
            <Image
              source={{ uri: user.imageUrl }}
              style={[
                styles.avatarImage,
                {
                  width: sizes.avatarLg,
                  height: sizes.avatarLg,
                  borderRadius: radii.full,
                },
              ]}
            />
          ) : (
            <Avatar name={displayName} size="lg" />
          )}
          <ThemedText variant="bodyLarge" style={{ textAlign: 'center' }}>
            {displayName}
          </ThemedText>
          {email ? (
            <ThemedText variant="small" color="textMuted" style={{ textAlign: 'center' }}>
              {email}
            </ThemedText>
          ) : null}
        </View>

        <View style={[styles.actions, { gap: spacing.md }]}>
          <Button
            label="Unlock"
            variant="primary"
            size="lg"
            fullWidth
            onPress={onUnlockPress}
            accessibilityLabel="Unlock app"
          />
          <Button
            label="Not you? Sign out"
            variant="ghost"
            fullWidth
            onPress={handleLogout}
            accessibilityLabel="Sign out"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '100%',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  userCard: {
    alignItems: 'center',
  },
  avatarImage: {
    resizeMode: 'cover',
  },
  actions: {
    alignItems: 'center',
    width: '100%',
  },
});
