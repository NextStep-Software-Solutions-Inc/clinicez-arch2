import React from 'react';
import { View, StyleSheet, Pressable, ScrollView, PressableStateCallbackType } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Icon, { IconName } from '../ui/Icon';
import StaffPicker from './StaffPicker';
import { theme } from '../../constants/theme';
import { useClinic } from '../../context/ClinicContext';

export interface NavItem {
  key: string;
  label: string;
  icon: IconName;
  badge?: string | number;
}

export const WORKSTATION_NAV_ITEMS: NavItem[] = [
  { key: 'Dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'Patients', label: 'Patients', icon: 'patients' },
  { key: 'Consultations', label: 'Consultations', icon: 'consultations' },
  { key: 'Appointments', label: 'Appointments', icon: 'appointments' },
  { key: 'Billing', label: 'Billing', icon: 'billing' },
  { key: 'Yakap', label: 'PhilHealth Yakap', icon: 'yakap' },
  { key: 'Settings', label: 'Settings', icon: 'settings' },
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

  return (
    <View style={[styles.container, { width }]}>
      {/* Brand */}
      <View style={styles.brandHeader}>
        <View style={styles.logoBadge}>
          <Icon name="clinic" size={theme.sizes.iconMd} color={theme.colors.onPrimary} />
        </View>
        <View style={styles.brandText}>
          <ThemedText variant="title" style={styles.brandTitle}>
            ClinicEz
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
            {facilityName || 'Clinic workstation'}
          </ThemedText>
        </View>
      </View>

      {/* Nav */}
      <ScrollView style={styles.navList} contentContainerStyle={styles.navContent}>
        {WORKSTATION_NAV_ITEMS.map((item) => {
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
        <StaffPicker variant="card" />

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
