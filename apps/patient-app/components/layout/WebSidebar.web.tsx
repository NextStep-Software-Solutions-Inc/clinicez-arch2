import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useUser } from '@clerk/expo';
import type { NavigationState, ParamListBase } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import ClinicEzMark from '@ui/ClinicEzMark';
import { useNotificationContext } from 'contexts/NotificationContext';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import { extractInitials } from '../../services/home/homeDashboardService';
import {
  WEB_PRIMARY_NAV,
  WEB_SECONDARY_NAV,
  navigateToSection,
  resolveActiveSection,
  type WebNavItem,
} from '../../navigation/webSections';

interface WebSidebarProps {
  state: NavigationState<ParamListBase>;
  navigation: { navigate: (...args: any[]) => void };
  /** Icon-only rail (tablet widths). */
  collapsed: boolean;
}

/**
 * Persistent left sidebar for the web workstation layout (>= 768px).
 * Renders brand, primary sections, secondary links, and the signed-in user summary.
 * Sign-out lives exclusively in Settings.
 */
export default function WebSidebar({ state, navigation, collapsed }: WebSidebarProps) {
  const theme = useAppTheme();
  const { colors, spacing, radii, sizes } = theme;
  const { colors: ceColors, typography: ceTypography } = useClinicalEmpathyTheme();
  const { user } = useUser();
  const { unreadCount } = useNotificationContext();
  const active = resolveActiveSection(state);

  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<boolean>(false);

  useEffect(() => {
    try {
      const cached = window.localStorage.getItem('patient_avatar_local');
      setLocalAvatarUri(cached || null);
    } catch {
      // Ignore storage errors
    }
  }, [user?.imageUrl]);

  const avatarUrl = user?.imageUrl ?? localAvatarUri;

  useEffect(() => {
    setAvatarError(false);
  }, [avatarUrl]);

  const displayName =
    user?.fullName ||
    user?.firstName ||
    user?.primaryEmailAddress?.emailAddress?.split('@')[0] ||
    'Patient';
  const email = user?.primaryEmailAddress?.emailAddress;
  const initials = useMemo(() => extractInitials(displayName), [displayName]);

  const renderItem = (item: WebNavItem) => {
    const isActive = active === item.key;
    const badge = item.key === 'NotificationScreen' ? unreadCount : 0;
    return (
      <Pressable
        key={item.key}
        onPress={() => navigateToSection(navigation, item.key)}
        accessibilityRole="link"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: isActive }}
        // @ts-expect-error react-native-web: native tooltip when the label is hidden
        title={collapsed ? item.label : undefined}
        style={(s) => {
          const hovered = (s as { hovered?: boolean }).hovered;
          return [
            styles.item,
            {
              borderRadius: radii.md,
              paddingHorizontal: collapsed ? 0 : spacing.md,
              justifyContent: collapsed ? 'center' : 'flex-start',
              minHeight: sizes.controlLg,
              backgroundColor: isActive ? colors.sidebarActive : hovered ? colors.sidebarHover : 'transparent',
            },
          ];
        }}
      >
        <View>
          <AppIcon name={item.icon} size={sizes.iconLg - 4} color={isActive ? 'primaryText' : 'textSecondary'} />
          {collapsed && badge > 0 ? (
            <View style={[styles.dot, { backgroundColor: colors.emergency, borderColor: colors.sidebar, borderRadius: radii.full }]} />
          ) : null}
        </View>
        {!collapsed && (
          <>
            <ThemedText
              variant={isActive ? 'bodyBold' : 'body'}
              color={isActive ? 'primaryText' : 'textSecondary'}
              style={{ flex: 1, marginLeft: spacing.md }}
              numberOfLines={1}
            >
              {item.label}
            </ThemedText>
            {badge > 0 ? (
              <View style={[styles.badge, { backgroundColor: colors.emergency, borderRadius: radii.full }]}>
                <ThemedText variant="captionBold" color="onPrimary">
                  {badge > 9 ? '9+' : String(badge)}
                </ThemedText>
              </View>
            ) : null}
          </>
        )}
      </Pressable>
    );
  };

  const width = collapsed ? sizes.sidebarCollapsedWidth : sizes.sidebarWidth;

  return (
    <View
      role="navigation"
      style={[
        styles.root,
        {
          width,
          backgroundColor: colors.sidebar,
          borderRightColor: colors.sidebarBorder,
          paddingVertical: spacing.lg,
          paddingHorizontal: collapsed ? spacing.sm : spacing.md,
        },
      ]}
    >
      <View
        style={[
          styles.brand,
          { paddingHorizontal: collapsed ? 0 : spacing.sm, justifyContent: collapsed ? 'center' : 'flex-start' },
        ]}
      >
        <ClinicEzMark size={sizes.controlMd} variant="inverted" />
        {!collapsed && (
          <View style={{ marginLeft: spacing.md }}>
            <ThemedText variant="h3" style={{ lineHeight: 20 }}>
              Clinic EZ
            </ThemedText>
            <ThemedText color="textMuted" style={[ceTypography.brandSubtitle, { marginTop: 1 }]}>
              Patient Portal
            </ThemedText>
          </View>
        )}
      </View>

      <ScrollView style={styles.nav} contentContainerStyle={{ gap: spacing.xs, paddingTop: spacing.xl }}>
        {WEB_PRIMARY_NAV.map(renderItem)}
        <View style={[styles.divider, { backgroundColor: colors.sidebarBorder, marginVertical: spacing.md }]} />
        {WEB_SECONDARY_NAV.map(renderItem)}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.sidebarBorder, paddingTop: spacing.md }]}>
        <Pressable
          onPress={() => navigateToSection(navigation, 'ProfileScreen')}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
          // @ts-expect-error react-native-web: native tooltip when the label is hidden
          title={collapsed ? displayName : undefined}
          style={({ pressed }) => [
            styles.user,
            {
              justifyContent: collapsed ? 'center' : 'flex-start',
              opacity: pressed ? 0.82 : 1,
            },
          ]}
        >
          <View
            style={{
              width: sizes.avatarMd,
              height: sizes.avatarMd,
              borderRadius: radii.full,
              backgroundColor: ceColors.mintAvatarBg,
              borderColor: colors.sidebarBorder,
              borderWidth: sizes.borderWidth,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {avatarUrl && !avatarError ? (
              <Image
                source={{ uri: avatarUrl }}
                onError={() => setAvatarError(true)}
                style={{
                  width: sizes.avatarMd,
                  height: sizes.avatarMd,
                  borderRadius: radii.full,
                }}
              />
            ) : (
              <ThemedText variant="smallBold" style={{ color: ceColors.mintAvatarText }}>
                {initials}
              </ThemedText>
            )}
          </View>
          {!collapsed && (
            <View style={{ flex: 1, marginLeft: spacing.md, minWidth: 0 }}>
              <ThemedText variant="bodyBold" numberOfLines={1}>
                {displayName}
              </ThemedText>
              {email ? (
                <ThemedText variant="caption" color="textMuted" numberOfLines={1}>
                  {email}
                </ThemedText>
              ) : null}
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderRightWidth: 1, height: '100%' },
  brand: { flexDirection: 'row', alignItems: 'center' },
  nav: { flex: 1 },
  item: { flexDirection: 'row', alignItems: 'center' },
  badge: { minWidth: 20, height: 20, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: -2, right: -4, width: 10, height: 10, borderWidth: 2 },
  divider: { height: 1 },
  footer: { borderTopWidth: 1 },
  user: { flexDirection: 'row', alignItems: 'center' },
});
