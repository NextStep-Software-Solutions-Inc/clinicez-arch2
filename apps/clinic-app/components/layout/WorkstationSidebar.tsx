import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable, ScrollView, PressableStateCallbackType, Image } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Icon, { IconName } from '../ui/Icon';
import UserMenu from './UserMenu';
import { theme } from '../../constants/theme';
import { useClinic } from '../../context/ClinicContext';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../constants/permissions';
import { SidebarMode } from '../../context/SidebarContext';

export interface NavItem {
  key: string;
  label: string;
  icon: IconName;
  badge?: string | number;
  permission?: string;
  roles?: string[];
}

export const WORKSTATION_NAV_ITEMS: NavItem[] = [
  { key: 'Dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'Patients', label: 'Patients', icon: 'patients', permission: PERMISSIONS.patientsRead, roles: ['Doctor', 'Nurse', 'Receptionist', 'Admin'] },
  { key: 'Consultations', label: 'Consultations', icon: 'consultations', permission: PERMISSIONS.consultationsRead, roles: ['Doctor', 'Nurse', 'Admin'] },
  { key: 'Appointments', label: 'Appointments', icon: 'appointments', permission: PERMISSIONS.appointmentsRead, roles: ['Doctor', 'Nurse', 'Receptionist', 'Admin'] },
  { key: 'Billing', label: 'Billing', icon: 'billing', permission: PERMISSIONS.billingRead, roles: ['Cashier', 'Receptionist', 'Admin'] },
  { key: 'ResultReview', label: 'Result review', icon: 'lab', permission: PERMISSIONS.labOrdersRead, roles: ['Doctor', 'Admin'] },
  { key: 'ShareImport', label: 'Scan patient QR', icon: 'scan', permission: PERMISSIONS.patientsWrite, roles: ['Receptionist', 'Nurse', 'Admin'] },
  { key: 'Yakap', label: 'PhilHealth Yakap', icon: 'yakap', permission: PERMISSIONS.yakapRead, roles: ['Doctor', 'Admin'] },
  { key: 'Settings', label: 'Settings', icon: 'settings', permission: PERMISSIONS.settingsRead, roles: ['Admin'] },
];

export interface WorkstationSidebarProps {
  currentRoute?: string;
  onNavigate: (route: string) => void;
  width?: number;
  mode?: SidebarMode;
  onToggleMode?: () => void;
}

type InteractionState = PressableStateCallbackType & { hovered?: boolean };

export default function WorkstationSidebar({
  currentRoute = 'Dashboard',
  onNavigate,
  width,
  mode = 'open',
  onToggleMode,
}: WorkstationSidebarProps) {
  const { facilityName, planTier, clinicLogo } = useClinic();
  const { user, can } = useAuth();

  const isIconMode = mode === 'icon' || width === theme.sizes.sidebarCollapsedWidth;
  const resolvedWidth = width ?? (isIconMode ? theme.sizes.sidebarCollapsedWidth : theme.sizes.sidebarWidth);

  const visibleNavItems = useMemo(() => {
    return WORKSTATION_NAV_ITEMS.filter((item) => {
      if (!user) return true;
      if (user.role === 'Admin') return true;
      if (item.permission && can(item.permission)) return true;
      if (item.roles && item.roles.includes(user.role)) return true;
      return !item.permission && !item.roles;
    });
  }, [user, can]);

  const displayName = facilityName || 'Clinic EZ';

  return (
    <View style={[styles.container, { width: resolvedWidth }]}>
      {/* Brand Header */}
      <View style={[styles.brandHeader, isIconMode && styles.brandHeaderIconMode]}>
        <View style={styles.logoBadge}>
          {clinicLogo ? (
            <Image
              source={{ uri: clinicLogo }}
              style={styles.logoImage}
              resizeMode="contain"
              accessibilityLabel={`${displayName} logo`}
            />
          ) : (
            <Icon name="clinic" size={theme.sizes.iconMd} color={theme.colors.onPrimary} />
          )}
        </View>

        {isIconMode ? null : (
          <View style={styles.brandText}>
            <View style={styles.brandTitleRow}>
              <ThemedText variant="title" style={styles.brandTitle} numberOfLines={1}>
                {displayName}
              </ThemedText>
              {planTier ? (
                <Badge label={planTier.toUpperCase()} variant="primary" size="sm" />
              ) : null}
            </View>
            <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
              Clinic workstation
            </ThemedText>
          </View>
        )}

        {isIconMode ? null : onToggleMode ? (
          <Pressable
            onPress={onToggleMode}
            accessibilityRole="button"
            accessibilityLabel="Collapse sidebar to icon rail"
            style={(state: InteractionState) => [
              styles.collapseButton,
              state.hovered && styles.collapseButtonHover,
              state.pressed && styles.collapseButtonPressed,
            ]}
          >
            <Icon name="chevronLeft" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Nav Items */}
      <ScrollView
        style={styles.navList}
        contentContainerStyle={[styles.navContent, isIconMode && styles.navContentIconMode]}
      >
        {visibleNavItems.map((item) => {
          const isActive = currentRoute === item.key;

          if (isIconMode) {
            return (
              <Pressable
                key={item.key}
                onPress={() => onNavigate(item.key)}
                accessibilityRole="link"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: isActive }}
                style={(state: InteractionState) => [
                  styles.navItemIconOnly,
                  state.hovered && !isActive && styles.navItemHover,
                  isActive && styles.navItemActive,
                  state.pressed && styles.navItemPressed,
                ]}
                {...({ title: item.label } as any)}
              >
                <View style={styles.iconWrapper}>
                  <Icon
                    name={item.icon}
                    size={theme.sizes.iconMd}
                    color={isActive ? theme.colors.primary : theme.colors.textMuted}
                  />
                  {item.badge ? <View style={styles.badgeDot} /> : null}
                </View>
              </Pressable>
            );
          }

          return (
            <Pressable
              key={item.key}
              onPress={() => onNavigate(item.key)}
              accessibilityRole="link"
              accessibilityState={{ selected: isActive }}
              style={(state: InteractionState) => [
                styles.navItem,
                state.hovered && !isActive && styles.navItemHover,
                isActive && styles.navItemActive,
                state.pressed && styles.navItemPressed,
              ]}
            >
              <Icon
                name={item.icon}
                size={theme.sizes.iconMd}
                color={isActive ? theme.colors.primary : theme.colors.textMuted}
              />
              <ThemedText
                variant={isActive ? 'bodyBold' : 'body'}
                color={isActive ? theme.colors.primary : theme.colors.textSecondary}
                style={styles.navLabel}
              >
                {item.label}
              </ThemedText>
              {item.badge ? (
                <Badge label={String(item.badge)} variant={isActive ? 'primary' : 'neutral'} size="sm" />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Footer: User Profile & Expand toggle for icon mode */}
      <View style={[styles.footer, isIconMode && styles.footerIconMode]}>
        <UserMenu
          variant="card"
          compact={isIconMode}
          onNavigate={onNavigate}
          currentRoute={currentRoute}
        />
        {isIconMode && onToggleMode ? (
          <Pressable
            onPress={onToggleMode}
            accessibilityRole="button"
            accessibilityLabel="Expand sidebar"
            style={(state: InteractionState) => [
              styles.expandButton,
              state.hovered && styles.collapseButtonHover,
              state.pressed && styles.collapseButtonPressed,
            ]}
          >
            <Icon name="chevronRight" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: '100%',
    backgroundColor: theme.colors.surface,
    borderRightWidth: theme.sizes.borderWidth,
    borderRightColor: theme.colors.border,
    flexDirection: 'column',
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    minHeight: theme.sizes.headerHeight,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  brandHeaderIconMode: {
    paddingHorizontal: theme.spacing.xs,
    justifyContent: 'center',
    gap: 0,
  },
  logoBadge: {
    width: theme.sizes.controlMd,
    height: theme.sizes.controlMd,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  brandText: {
    flex: 1,
    minWidth: 0,
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  brandTitle: {
    color: theme.colors.text,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  collapseButton: {
    width: theme.sizes.controlSm,
    height: theme.sizes.controlSm,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapseButtonHover: {
    backgroundColor: theme.colors.surfaceSubtle,
  },
  collapseButtonPressed: {
    opacity: 0.8,
  },
  expandButton: {
    width: '100%',
    height: theme.sizes.controlSm,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.xs,
  },
  navList: {
    flex: 1,
  },
  navContent: {
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  navContentIconMode: {
    paddingHorizontal: theme.spacing.xs,
    alignItems: 'center',
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.sizes.controlMd,
    borderRadius: theme.radii.md,
  },
  navItemIconOnly: {
    width: theme.sizes.controlMd + 8,
    minHeight: theme.sizes.controlMd,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.md,
  },
  iconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: theme.spacing.sm,
    height: theme.spacing.sm,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
  },
  navItemHover: {
    backgroundColor: theme.colors.surfaceSubtle,
  },
  navItemActive: {
    backgroundColor: theme.colors.primaryLight,
  },
  navItemPressed: {
    opacity: 0.85,
  },
  navLabel: {
    flex: 1,
  },
  footer: {
    padding: theme.spacing.md,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  footerIconMode: {
    padding: theme.spacing.xs,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
});
