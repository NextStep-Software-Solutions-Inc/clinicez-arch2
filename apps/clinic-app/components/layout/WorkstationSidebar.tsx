import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Pressable, ScrollView, PressableStateCallbackType, Image, Platform } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Icon, { IconName } from '../ui/Icon';
import { ClinicEzMark } from '../ui/ClinicEzLogo';
import UserMenu from './UserMenu';
import { theme } from '../../constants/theme';
import { useClinic } from '../../context/ClinicContext';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../constants/permissions';
import { SidebarMode } from '../../context/SidebarContext';
import { useSafeInsets } from '../../utils/useSafeInsets';
import { useUiDensity } from '../../context/UiDensityContext';

export interface NavItem {
  key: string;
  label: string;
  icon: IconName;
  badge?: string | number;
  permission?: string;
  roles?: string[];
}

interface TooltipData {
  label: string;
  badge?: string | number;
  y: number;
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
  { key: 'Audit', label: 'Audit Log', icon: 'scroll', permission: PERMISSIONS.auditRead, roles: ['Admin'] },
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
  const { facilityName, planTier, clinicLogo, primaryColorHex } = useClinic();
  const { user, can } = useAuth();
  const insets = useSafeInsets();
  const { sidebarWidth: densitySidebarWidth, multiplier } = useUiDensity();

  const isIconMode = mode === 'icon' || width === theme.sizes.sidebarCollapsedWidth;
  const resolvedWidth = width ?? (isIconMode ? theme.sizes.sidebarCollapsedWidth : densitySidebarWidth);

  const [activeTooltip, setActiveTooltip] = useState<TooltipData | null>(null);

  useEffect(() => {
    if (!isIconMode) {
      setActiveTooltip(null);
    }
  }, [isIconMode]);

  const handleHoverIn = useCallback(
    (label: string, badge: string | number | undefined, event: any) => {
      if (!isIconMode) return;
      const target = event?.currentTarget as HTMLElement | null;
      if (target && typeof target.getBoundingClientRect === 'function') {
        const rect = target.getBoundingClientRect();
        setActiveTooltip({
          label,
          badge,
          y: rect.top + rect.height / 2,
        });
      }
    },
    [isIconMode],
  );

  const handleHoverOut = useCallback(() => {
    setActiveTooltip(null);
  }, []);

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

  const densityNavItemStyle =
    multiplier !== 1
      ? {
          minHeight: Math.max(30, Math.round(theme.sizes.controlMd * multiplier)),
          paddingHorizontal: Math.max(8, Math.round(theme.spacing.md * multiplier)),
          gap: Math.max(6, Math.round(theme.spacing.md * multiplier)),
        }
      : null;

  const densityIconOnlyStyle =
    multiplier !== 1
      ? {
          minHeight: Math.max(30, Math.round(theme.sizes.controlMd * multiplier)),
          width: Math.max(36, Math.round((theme.sizes.controlMd + 8) * multiplier)),
        }
      : null;

  const baseHeaderMinH =
    multiplier !== 1
      ? Math.max(46, Math.round(theme.sizes.headerHeight * multiplier))
      : theme.sizes.headerHeight;

  return (
    <View
      style={[
        styles.container,
        { width: resolvedWidth },
        isIconMode && styles.containerIconMode,
        Platform.select({
          web: {
            transition: 'width 250ms cubic-bezier(0.4, 0, 0.2, 1)',
            willChange: 'width',
          } as any,
        }),
      ]}
    >
      {/* Brand Header */}
      <View
        style={[
          styles.brandHeader,
          isIconMode && styles.brandHeaderIconMode,
          multiplier !== 1 && {
            minHeight: baseHeaderMinH,
            paddingHorizontal: Math.max(8, Math.round(theme.spacing.md * multiplier)),
          },
          insets.top > 0 && {
            paddingTop: insets.top,
            minHeight: baseHeaderMinH + insets.top,
          },
        ]}
      >
        <Pressable
          onPress={() => {
            setActiveTooltip(null);
            if (isIconMode && onToggleMode) onToggleMode();
          }}
          onHoverIn={(e) => handleHoverIn('Expand sidebar', undefined, e)}
          onHoverOut={handleHoverOut}
          disabled={!isIconMode}
          accessibilityRole={isIconMode ? 'button' : undefined}
          accessibilityLabel={isIconMode ? 'Expand sidebar' : `${displayName} logo`}
          style={(state: InteractionState) => [
            styles.logoBadge,
            { backgroundColor: clinicLogo ? 'transparent' : (primaryColorHex || theme.colors.primary) },
            isIconMode && styles.logoBadgeClickable,
            isIconMode && state.hovered && styles.logoBadgeHover,
            isIconMode && state.pressed && styles.logoBadgePressed,
          ]}
          {...(isIconMode ? ({ title: 'Expand sidebar' } as any) : {})}
        >
          {clinicLogo ? (
            <Image
              source={{ uri: clinicLogo }}
              style={styles.logoImage}
              resizeMode="contain"
              accessibilityLabel={`${displayName} logo`}
            />
          ) : (
            <ClinicEzMark
              size={theme.sizes.controlMd}
              variant="squircle"
              bgColor={primaryColorHex || theme.colors.primary}
            />
          )}
        </Pressable>

        {isIconMode ? null : (
          <View style={styles.brandText}>
            <View style={styles.brandTitleRow}>
              <ThemedText variant="title" style={styles.brandTitle} numberOfLines={1}>
                {displayName}
              </ThemedText>
              {planTier ? (
                <Badge
                  label={planTier.toUpperCase()}
                  variant="primary"
                  size="xs"
                  style={styles.planTierBadge}
                />
              ) : null}
            </View>
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
        onScroll={handleHoverOut}
        scrollEventThrottle={16}
      >
        {visibleNavItems.map((item) => {
          const isActive = currentRoute === item.key;

          if (isIconMode) {
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  setActiveTooltip(null);
                  onNavigate(item.key);
                }}
                onHoverIn={(e) => handleHoverIn(item.label, item.badge, e)}
                onHoverOut={handleHoverOut}
                accessibilityRole="link"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: isActive }}
                style={(state: InteractionState) => [
                  styles.navItemIconOnly,
                  densityIconOnlyStyle,
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
                    color={isActive ? (primaryColorHex || theme.colors.primary) : theme.colors.textMuted}
                  />
                  {item.badge ? (
                    <View style={[styles.badgeDot, { backgroundColor: primaryColorHex || theme.colors.primary }]} />
                  ) : null}
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
                densityNavItemStyle,
                state.hovered && !isActive && styles.navItemHover,
                isActive && styles.navItemActive,
                state.pressed && styles.navItemPressed,
              ]}
            >
              <Icon
                name={item.icon}
                size={theme.sizes.iconMd}
                color={isActive ? (primaryColorHex || theme.colors.primary) : theme.colors.textMuted}
              />
              <ThemedText
                variant={isActive ? 'bodyBold' : 'body'}
                color={isActive ? (primaryColorHex || theme.colors.primary) : theme.colors.textSecondary}
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

      {/* Footer: User Profile */}
      <View
        style={[
          styles.footer,
          isIconMode && styles.footerIconMode,
          insets.bottom > 0 && { paddingBottom: insets.bottom + theme.spacing.xs },
        ]}
      >
        <UserMenu
          variant="card"
          compact={isIconMode}
          onNavigate={onNavigate}
          currentRoute={currentRoute}
        />
      </View>

      {/* Floating Tooltip in Icon Mode */}
      {isIconMode && activeTooltip ? (
        <View
          style={[styles.tooltipContainer, { top: activeTooltip.y }]}
          {...({ role: 'tooltip' } as any)}
          pointerEvents="none"
        >
          <View style={styles.tooltipArrow} />
          <ThemedText
            variant="smallBold"
            color={theme.colors.textInverted}
            style={styles.tooltipText}
            numberOfLines={1}
          >
            {activeTooltip.label}
          </ThemedText>
          {activeTooltip.badge ? (
            <Badge label={String(activeTooltip.badge)} variant="primary" size="sm" />
          ) : null}
        </View>
      ) : null}
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
    overflow: 'hidden',
    zIndex: 100,
  },
  containerIconMode: {
    overflow: 'visible',
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    minHeight: theme.sizes.headerHeight,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.md,
    overflow: 'hidden',
  },
  brandHeaderIconMode: {
    paddingHorizontal: theme.spacing.lg,
    justifyContent: 'center',
    gap: 0,
  },
  logoBadge: {
    width: theme.sizes.controlMd,
    height: theme.sizes.controlMd,
    borderRadius: theme.radii.md,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoBadgeClickable: {
    ...Platform.select({
      web: {
        cursor: 'pointer',
      } as any,
    }),
  },
  logoBadgeHover: {
    opacity: 0.9,
    transform: [{ scale: 1.05 }],
  },
  logoBadgePressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  brandText: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        whiteSpace: 'nowrap',
      } as any,
    }),
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    overflow: 'hidden',
  },
  brandTitle: {
    color: theme.colors.text,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  planTierBadge: {
    alignSelf: 'center',
    flexShrink: 0,
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
    overflow: 'hidden',
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
    overflow: 'hidden',
    ...Platform.select({
      web: {
        whiteSpace: 'nowrap',
      } as any,
    }),
  },
  footer: {
    padding: theme.spacing.md,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.md,
    overflow: 'hidden',
  },
  footerIconMode: {
    padding: theme.spacing.xs,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  tooltipContainer: {
    position: Platform.OS === 'web' ? ('fixed' as 'absolute') : 'absolute',
    left: theme.sizes.sidebarCollapsedWidth + theme.spacing.sm,
    transform: [{ translateY: -16 }],
    backgroundColor: theme.colors.surfaceInverse,
    paddingVertical: theme.spacing.xs + 2,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    zIndex: 999999,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    pointerEvents: 'none',
  },
  tooltipArrow: {
    position: 'absolute',
    left: -4,
    top: '50%',
    marginTop: -4,
    width: 8,
    height: 8,
    backgroundColor: theme.colors.surfaceInverse,
    transform: [{ rotate: '45deg' }],
  },
  tooltipText: {
    letterSpacing: -0.2,
  },
});
