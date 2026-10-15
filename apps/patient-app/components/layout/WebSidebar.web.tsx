import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useUser } from '@clerk/expo';
import type { NavigationState, ParamListBase } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import ClinicEzMark from '@ui/ClinicEzMark';
import { dialog } from '@utils/dialog';
import { useAuth } from 'contexts/AuthContext';
import { useNotificationContext } from 'contexts/NotificationContext';
import { useAppTheme } from '../../contexts/ThemeContext';
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
 * Mirrors the clinic-app workstation sidebar: brand, primary sections, secondary
 * links, then the signed-in user with sign-out.
 */
export default function WebSidebar({ state, navigation, collapsed }: WebSidebarProps) {
  const theme = useAppTheme();
  const { colors, spacing, radii, sizes } = theme;
  const { user } = useUser();
  const { logout } = useAuth();
  const { unreadCount } = useNotificationContext();
  const active = resolveActiveSection(state);

  const displayName =
    user?.fullName ||
    user?.firstName ||
    user?.primaryEmailAddress?.emailAddress?.split('@')[0] ||
    'Patient';
  const email = user?.primaryEmailAddress?.emailAddress;

  const confirmSignOut = async () => {
    const ok = await dialog.confirm({
      title: 'Sign out?',
      message: 'You will need to sign in again to see your records.',
      confirmLabel: 'Sign out',
      destructive: true,
    });
    if (ok) await logout();
  };

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
            <ThemedText variant="h3">Clinic EZ</ThemedText>
            <ThemedText variant="caption" color="textMuted">
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
        <View style={[styles.user, { justifyContent: collapsed ? 'center' : 'flex-start' }]}>
          <View
            style={{
              width: sizes.avatarMd,
              height: sizes.avatarMd,
              borderRadius: radii.full,
              backgroundColor: colors.primaryLight,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ThemedText variant="bodyBold" color="primaryText">
              {displayName.charAt(0).toUpperCase()}
            </ThemedText>
          </View>
          {!collapsed && (
            <View style={{ flex: 1, marginLeft: spacing.md }}>
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
        </View>
        <Pressable
          onPress={confirmSignOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          // @ts-expect-error react-native-web: native tooltip when the label is hidden
          title={collapsed ? 'Sign out' : undefined}
          style={(s) => {
            const hovered = (s as { hovered?: boolean }).hovered;
            return [
              styles.item,
              {
                marginTop: spacing.sm,
                borderRadius: radii.md,
                minHeight: sizes.controlMd,
                paddingHorizontal: collapsed ? 0 : spacing.md,
                justifyContent: collapsed ? 'center' : 'flex-start',
                backgroundColor: hovered ? colors.sidebarHover : 'transparent',
              },
            ];
          }}
        >
          <AppIcon name="logout" size={sizes.iconMd} color="emergency" />
          {!collapsed && (
            <ThemedText variant="body" color="emergency" style={{ marginLeft: spacing.md }}>
              Sign out
            </ThemedText>
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
