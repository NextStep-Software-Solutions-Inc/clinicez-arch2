import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable, ScrollView, PressableStateCallbackType } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Icon, { IconName } from '../ui/Icon';
import UserMenu from './UserMenu';
import { theme } from '../../constants/theme';
import { useClinic } from '../../context/ClinicContext';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../constants/permissions';

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
}

type InteractionState = PressableStateCallbackType & { hovered?: boolean };

export default function WorkstationSidebar({
  currentRoute = 'Dashboard',
  onNavigate,
  width = theme.sizes.sidebarWidth,
}: WorkstationSidebarProps) {
  const { facilityName, planTier, accreditationNumber } = useClinic();
  const { user, can } = useAuth();

  const visibleNavItems = useMemo(() => {
    return WORKSTATION_NAV_ITEMS.filter((item) => {
      if (!user) return true;
      if (user.role === 'Admin') return true;
      if (item.permission && can(item.permission)) return true;
      if (item.roles && item.roles.includes(user.role)) return true;
      return !item.permission && !item.roles;
    });
  }, [user, can]);

  return (
    <View style={[styles.container, { width }]}>
      {/* Brand */}
      <View style={styles.brandHeader}>
        <View style={styles.logoBadge}>
          <Icon name="clinic" size={theme.sizes.iconMd} color={theme.colors.onPrimary} />
        </View>
        <View style={styles.brandText}>
          <ThemedText variant="title" style={styles.brandTitle}>
            Clinic EZ
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
            {facilityName || 'Clinic workstation'}
          </ThemedText>
        </View>
      </View>

      {/* Nav */}
      <ScrollView style={styles.navList} contentContainerStyle={styles.navContent}>
        {visibleNavItems.map((item) => {
          const isActive = currentRoute === item.key;
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

      {/* Footer: facility + who is working */}
      <View style={styles.footer}>
        <UserMenu variant="card" onNavigate={onNavigate} currentRoute={currentRoute} />

        {facilityName ? (
          <View style={styles.facility}>
            <ThemedText variant="smallBold" numberOfLines={1}>
              {facilityName}
            </ThemedText>
            {planTier || accreditationNumber ? (
              <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
                {[planTier, accreditationNumber ? `Accreditation ${accreditationNumber}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </ThemedText>
            ) : null}
          </View>
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
  logoBadge: {
    width: theme.sizes.controlMd,
    height: theme.sizes.controlMd,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    flex: 1,
    minWidth: 0,
  },
  brandTitle: {
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  navList: {
    flex: 1,
  },
  navContent: {
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.sizes.controlMd,
    borderRadius: theme.radii.md,
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
  facility: {
    paddingHorizontal: theme.spacing.xs,
    gap: 2,
  },
});
