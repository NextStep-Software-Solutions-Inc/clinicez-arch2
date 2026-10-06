import React from 'react';
import { View, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { useTheme } from '@react-navigation/native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useUser } from '@clerk/expo';
import ThemedText from '@ui/ThemedText';
import { useAuth } from 'contexts/AuthContext';
import { AppIcon } from './Icon';

const TAB_ICONS: Record<string, string> = {
  HomeScreen: 'home',
  AppointmentsScreen: 'heart_check',
  FilesScreen: 'files',
  ProfileScreen: 'person',
};

export default function WebNavBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, dark: isDark } = useTheme();
  const { width } = useWindowDimensions();
  const { user } = useUser();
  const { logout } = useAuth();

  // Desktop (large screens) vs Small-to-Medium screens (mobile & tablet)
  const isDesktop = width >= 1024;

  const displayName =
    user?.fullName ||
    user?.firstName ||
    user?.primaryEmailAddress?.emailAddress?.split('@')[0] ||
    'Patient';

  if (!isDesktop) {
    // Small to medium screens (mobile & tablet): Render bottom navigation bar (same as mobile app)
    return (
      <View
        style={[
          styles.mobileTabBar,
          {
            backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
            borderTopColor: isDark ? '#1E293B' : '#E2E8F0',
          },
        ]}
      >
        <View style={styles.mobileTabBarInner}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const label =
              options.tabBarLabel !== undefined
                ? options.tabBarLabel
                : options.title !== undefined
                  ? options.title
                  : route.name;

            const isFocused = state.index === index;
            const iconName = TAB_ICONS[route.name] || 'home';

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                style={({ pressed }) => [
                  styles.mobileTabItem,
                  isFocused && styles.mobileTabItemFocused,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={styles.iconContainer}>
                  <AppIcon
                    name={iconName}
                    color={isFocused ? '#3B82F6' : isDark ? '#94A3B8' : '#64748B'}
                    size={22}
                  />
                  {isFocused && <View style={styles.mobileActiveDot} />}
                </View>
                <ThemedText
                  style={[
                    styles.mobileTabLabel,
                    {
                      color: isFocused ? '#3B82F6' : isDark ? '#94A3B8' : '#64748B',
                      fontWeight: isFocused ? '700' : '500',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {typeof label === 'string' ? label : route.name}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  // Large screens (desktop): Render top navigation bar with order: -1
  return (
    <View
      style={[
        styles.desktopNavWrapper,
        {
          backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
          borderBottomColor: isDark ? '#1E293B' : '#E2E8F0',
        },
      ]}
    >
      <View style={styles.desktopNavInner}>
        {/* Brand */}
        <View style={styles.brandContainer}>
          <View style={styles.logoBadge}>
            <ThemedText style={styles.logoText}>CLINIC EZ</ThemedText>
          </View>
          <View style={styles.portalTag}>
            <ThemedText style={styles.portalTagText}>Patient Portal</ThemedText>
          </View>
        </View>

        {/* Center Nav Links */}
        <View style={styles.navLinks}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const label =
              options.tabBarLabel !== undefined
                ? options.tabBarLabel
                : options.title !== undefined
                  ? options.title
                  : route.name;

            const isFocused = state.index === index;
            const iconName = TAB_ICONS[route.name] || 'home';

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                style={({ pressed }) => [
                  styles.navLinkItem,
                  isFocused && [
                    styles.navLinkItemActive,
                    {
                      backgroundColor: isDark
                        ? 'rgba(59, 130, 246, 0.15)'
                        : 'rgba(59, 130, 246, 0.08)',
                    },
                  ],
                  pressed && { opacity: 0.8 },
                ]}
              >
                <AppIcon
                  name={iconName}
                  color={isFocused ? '#3B82F6' : isDark ? '#94A3B8' : '#64748B'}
                  size={18}
                />
                <ThemedText
                  style={[
                    styles.navLinkLabel,
                    {
                      color: isFocused ? '#3B82F6' : isDark ? '#CBD5E1' : '#334155',
                      fontWeight: isFocused ? '700' : '500',
                    },
                  ]}
                >
                  {typeof label === 'string' ? label : route.name}
                </ThemedText>
                {isFocused && <View style={styles.activeIndicator} />}
              </Pressable>
            );
          })}
        </View>

        {/* Right Section: User & Sign Out */}
        <View style={styles.userSection}>
          <View style={styles.userInfo}>
            <View style={styles.userAvatar}>
              <ThemedText style={styles.userAvatarText}>
                {displayName.charAt(0).toUpperCase()}
              </ThemedText>
            </View>
            <ThemedText style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
              {displayName}
            </ThemedText>
          </View>

          <Pressable
            onPress={() => logout()}
            style={({ pressed }) => [
              styles.signOutBtn,
              { borderColor: isDark ? '#334155' : '#CBD5E1' },
              pressed && { opacity: 0.7 },
            ]}
          >
            <ThemedText style={styles.signOutText}>Sign Out</ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Desktop Top Navigation Bar (order: -1 brings it to the top of the flex container)
  desktopNavWrapper: {
    order: -1,
    width: '100%',
    borderBottomWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 3,
    zIndex: 100,
  } as any,
  desktopNavInner: {
    maxWidth: 1280,
    width: '100%',
    marginHorizontal: 'auto',
    paddingHorizontal: 24,
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  logoText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1.2,
  },
  portalTag: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  portalTagText: {
    color: '#3B82F6',
    fontSize: 11,
    fontWeight: '700',
  },
  navLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navLinkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    position: 'relative',
  },
  navLinkItemActive: {
    borderRadius: 8,
  },
  navLinkLabel: {
    fontSize: 14,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -8,
    left: 14,
    right: 14,
    height: 2,
    backgroundColor: '#3B82F6',
    borderRadius: 1,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  userName: {
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 120,
  },
  signOutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  signOutText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
  },

  // Small & Medium Screen Bottom Navigation Bar (Same as mobile app)
  mobileTabBar: {
    width: '100%',
    borderTopWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
  },
  mobileTabBarInner: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 640,
    marginHorizontal: 'auto',
    height: 64,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
  },
  mobileTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 3,
  },
  mobileTabItemFocused: {
    transform: [{ scale: 1.02 }],
  },
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileActiveDot: {
    position: 'absolute',
    bottom: -4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3B82F6',
  },
  mobileTabLabel: {
    fontSize: 11,
    marginTop: 2,
  },
});
