import React from 'react';
import { useNavigation } from '@react-navigation/core';
import { AppIcon } from './ui/Icon';
import { View, Pressable, StyleSheet } from 'react-native';
import { useNotificationContext } from 'contexts/NotificationContext';
import ThemedText from './ui/ThemedText';
import { useAppTheme } from '../contexts/ThemeContext';

export interface BottomTabsHeaderRightProps {
  onOpenSearch?: () => void;
  hasActiveSearch?: boolean;
  onTogglePrivacy?: () => void;
  isPrivacyActive?: boolean;
  extraLeft?: React.ReactNode;
}

export default function BottomTabsHeaderRight({
  onOpenSearch,
  hasActiveSearch,
  onTogglePrivacy,
  isPrivacyActive,
  extraLeft,
}: BottomTabsHeaderRightProps = {}) {
  const navigation = useNavigation<any>();
  const { colors, radii, sizes } = useAppTheme();
  const { unreadCount } = useNotificationContext();

  return (
    <View style={styles.container}>
      {extraLeft}

      {onTogglePrivacy ? (
        <Pressable
          onPress={onTogglePrivacy}
          style={({ pressed, hovered }: any) => [
            styles.iconBtn,
            (pressed || hovered) && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={isPrivacyActive ? 'Disable Privacy Blur' : 'Enable Privacy Blur'}
        >
          <AppIcon
            name={isPrivacyActive ? 'eyeOff' : 'eye'}
            size={sizes.iconLg}
            color={isPrivacyActive ? 'primary' : 'text'}
          />
        </Pressable>
      ) : null}
      {onOpenSearch ? (
        <Pressable
          onPress={onOpenSearch}
          style={({ pressed, hovered }: any) => [
            styles.iconBtn,
            (pressed || hovered) && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={hasActiveSearch ? 'Search (filter active)' : 'Search'}
        >
          <AppIcon
            name="search"
            size={sizes.iconLg}
            color={hasActiveSearch ? 'primary' : 'text'}
          />
          {hasActiveSearch ? (
            <View
              style={[
                styles.searchDot,
                { backgroundColor: colors.primary, borderRadius: radii.full },
              ]}
            />
          ) : null}
        </Pressable>
      ) : null}

      <Pressable
        onPress={() => navigation.navigate('Main', { screen: 'NotificationScreen' })}
        style={({ pressed, hovered }: any) => [
          styles.iconBtn,
          (pressed || hovered) && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Notifications"
      >
        <AppIcon name="notifications" size={sizes.iconLg} color="text" />
        {unreadCount > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.emergency, borderRadius: radii.full }]}>
            <ThemedText variant="badge" style={[styles.badgeText, { color: colors.textInverted }]}>
              {unreadCount > 9 ? '9+' : String(unreadCount)}
            </ThemedText>
          </View>
        )}
      </Pressable>

      <Pressable
        onPress={() => navigation.navigate('Main', { screen: 'SettingsScreen' })}
        style={({ pressed, hovered }: any) => [
          styles.iconBtn,
          (pressed || hovered) && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Settings"
      >
        <AppIcon name="settings" size={sizes.iconLg} color="text" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 4,
    marginRight: 16,
    alignItems: 'center',
  },
  iconBtn: {
    position: 'relative',
    padding: 6,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 1,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    zIndex: 10,
  },
  badgeText: {
    lineHeight: 12,
  },
  searchDot: {
    position: 'absolute',
    top: 5,
    right: 4,
    width: 8,
    height: 8,
    zIndex: 10,
  },
});
