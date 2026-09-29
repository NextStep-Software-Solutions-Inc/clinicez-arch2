import React from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import { theme } from '../../constants/theme';

export interface NavItem {
  key: string;
  label: string;
  icon: string;
  badge?: string | number;
  subtitle?: string;
}

export const WORKSTATION_NAV_ITEMS: NavItem[] = [
  {
    key: 'Dashboard',
    label: 'Dashboard',
    icon: '📊',
    subtitle: 'Command & Analytics',
  },
  {
    key: 'Patients',
    label: 'Patients',
    icon: '👥',
    subtitle: 'Registry & Charts',
  },
  {
    key: 'Consultations',
    label: 'Consultations',
    icon: '🩺',
    subtitle: 'Clinical Encounters',
  },
  {
    key: 'Appointments',
    label: 'Appointments',
    icon: '📅',
    subtitle: 'Schedule & Intake',
  },
  {
    key: 'Billing',
    label: 'Billing & POS',
    icon: '💳',
    subtitle: 'Cashier & Receipts',
  },
  {
    key: 'Settings',
    label: 'Facility Settings',
    icon: '⚙️',
    subtitle: 'Preferences & Staff',
  },
];

export interface WorkstationSidebarProps {
  currentRoute?: string;
  onNavigate: (route: string) => void;
  width?: number;
}

export default function WorkstationSidebar({
  currentRoute = 'Dashboard',
  onNavigate,
  width = 250,
}: WorkstationSidebarProps) {
  return (
    <View style={[styles.container, { width }]}>
      {/* Brand Header */}
      <View style={styles.brandHeader}>
        <View style={styles.logoBadge}>
          <ThemedText style={styles.logoIcon}>🏥</ThemedText>
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText variant="h3" style={styles.brandTitle}>
            ClinicEz
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.primary} style={styles.brandTag}>
            Clinical Workstation
          </ThemedText>
        </View>
      </View>

      {/* Nav List */}
      <ScrollView style={styles.navList} contentContainerStyle={styles.navContent}>
        <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.sectionHeader}>
          CLINICAL OPERATIONS
        </ThemedText>

        {WORKSTATION_NAV_ITEMS.map((item) => {
          const isActive = currentRoute === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => onNavigate(item.key)}
              style={({ pressed }) => [
                styles.navItem,
                isActive && styles.navItemActive,
                pressed && styles.navItemPressed,
              ]}
            >
              {/* Active Indicator Bar */}
              {isActive && <View style={styles.activeBar} />}

              <ThemedText style={[styles.navIcon, isActive && styles.navIconActive]}>
                {item.icon}
              </ThemedText>

              <View style={styles.navTextContainer}>
                <ThemedText
                  variant={isActive ? 'bodyBold' : 'body'}
                  style={[styles.navLabel, isActive && styles.navLabelActive]}
                >
                  {item.label}
                </ThemedText>
                {item.subtitle ? (
                  <ThemedText
                    variant="caption"
                    color={isActive ? theme.colors.primaryLight : theme.colors.textMuted}
                    style={styles.navSub}
                  >
                    {item.subtitle}
                  </ThemedText>
                ) : null}
              </View>

              {item.badge ? (
                <Badge
                  label={String(item.badge)}
                  variant={isActive ? 'primary' : 'neutral'}
                  size="sm"
                />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Footer / User Profile Card */}
      <View style={styles.footer}>
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <ThemedText style={styles.avatarText}>MC</ThemedText>
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText variant="bodyBold" style={styles.userName} numberOfLines={1}>
              Dr. Maria Cruz, MD
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
              Lead Physician • Room 102
            </ThemedText>
          </View>
        </View>

        <View style={styles.facilityStatus}>
          <View style={styles.statusDot} />
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            Konsulta Accredited • DOH-PH
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: '100%',
    backgroundColor: theme.colors.surface,
    borderRightWidth: 1,
    borderRightColor: theme.colors.borderLight,
    flexDirection: 'column',
    ...theme.shadows.sm,
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    gap: theme.spacing.md,
  },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIcon: {
    fontSize: 22,
  },
  brandTitle: {
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  brandTag: {
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  navList: {
    flex: 1,
  },
  navContent: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    gap: 4,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    marginBottom: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.md,
    position: 'relative',
    gap: theme.spacing.sm,
  },
  navItemActive: {
    backgroundColor: theme.colors.primarySubtle,
  },
  navItemPressed: {
    opacity: 0.8,
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    width: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
  },
  navIcon: {
    fontSize: 18,
    width: 26,
    textAlign: 'center',
  },
  navIconActive: {
    transform: [{ scale: 1.1 }],
  },
  navTextContainer: {
    flex: 1,
  },
  navLabel: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  navLabelActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  navSub: {
    fontSize: 11,
    marginTop: 1,
  },
  footer: {
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceSubtle,
    gap: theme.spacing.xs,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  userName: {
    fontSize: 13,
    color: theme.colors.text,
  },
  facilityStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.success,
  },
});
